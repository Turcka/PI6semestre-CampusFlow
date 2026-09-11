-- =============================================================================
-- 0006_messaging.sql
-- Régua de comunicação multicanal (WhatsApp / e-mail). Fase 2 - RF-05.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- message_templates
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  name                    text not null,
  channel                 public.message_channel not null,
  subject                 text, -- apenas e-mail
  body                    text not null,
  provider_template_name  text, -- nome do template aprovado na Meta (WhatsApp)
  variables               text[] not null default '{}',
  is_active               boolean not null default true,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint message_templates_tenant_name_channel_unique unique (tenant_id, name, channel)
);

create index message_templates_tenant_idx on public.message_templates (tenant_id, channel) where is_active;

create trigger trg_message_templates_updated_at
before update on public.message_templates
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- communication_rules: régua por gatilho/canal
-- offset_minutes é relativo ao início da visita (negativo = antes).
-- Para gatilhos imediatos (visit.confirmed etc.) o offset é ignorado.
-- -----------------------------------------------------------------------------
create table public.communication_rules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  trigger         public.communication_trigger not null,
  channel         public.message_channel not null,
  template_id     uuid not null references public.message_templates(id) on delete restrict,
  offset_minutes  integer not null default 0,
  audience        text not null default 'candidate' check (audience in ('candidate', 'coordinator', 'both')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint communication_rules_unique unique (tenant_id, trigger, channel, audience)
);

create index communication_rules_tenant_trigger_idx on public.communication_rules (tenant_id, trigger) where is_active;

create trigger trg_communication_rules_updated_at
before update on public.communication_rules
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- campaigns: disparos em massa (marketing / secretaria / financeiro)
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  channel       public.message_channel not null,
  template_id   uuid not null references public.message_templates(id) on delete restrict,
  segment       jsonb not null default '{}'::jsonb, -- filtros de leads
  scheduled_at  timestamptz,
  status        public.campaign_status not null default 'draft',
  total_recipients integer not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index campaigns_tenant_idx on public.campaigns (tenant_id, created_at desc);

create trigger trg_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- message_jobs: mensagens agendadas (fila lógica) -> promovidas para pgmq
-- -----------------------------------------------------------------------------
create table public.message_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  visit_id      uuid references public.visits(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete cascade,
  campaign_id   uuid references public.campaigns(id) on delete cascade,
  rule_id       uuid references public.communication_rules(id) on delete set null,
  template_id   uuid references public.message_templates(id) on delete set null,
  trigger       public.communication_trigger,
  channel       public.message_channel not null,
  to_address    text not null, -- telefone E.164 ou e-mail
  run_at        timestamptz not null default now(),
  payload       jsonb not null, -- { subject, body, provider_template_name, components, vars }
  status        public.message_job_status not null default 'scheduled',
  enqueued_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index message_jobs_due_idx on public.message_jobs (run_at) where status = 'scheduled';
create index message_jobs_visit_idx on public.message_jobs (visit_id) where status = 'scheduled';
create index message_jobs_tenant_idx on public.message_jobs (tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- message_logs: resultado de cada envio, atualizado por webhooks
-- -----------------------------------------------------------------------------
create table public.message_logs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  job_id              uuid unique references public.message_jobs(id) on delete set null,
  lead_id             uuid references public.leads(id) on delete set null,
  visit_id            uuid references public.visits(id) on delete set null,
  campaign_id         uuid references public.campaigns(id) on delete set null,
  template_id         uuid references public.message_templates(id) on delete set null,
  channel             public.message_channel not null,
  to_address          text not null,
  status              public.message_status not null default 'queued',
  provider_message_id text,
  error               text,
  attempts            integer not null default 0,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index message_logs_tenant_created_idx on public.message_logs (tenant_id, created_at desc);
create index message_logs_provider_idx on public.message_logs (provider_message_id) where provider_message_id is not null;
create index message_logs_lead_idx on public.message_logs (lead_id);
create index message_logs_visit_idx on public.message_logs (visit_id);
create index message_logs_campaign_idx on public.message_logs (campaign_id);

create trigger trg_message_logs_updated_at
before update on public.message_logs
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- render_template(): substitui {{chave}} pelos valores de um jsonb plano
-- -----------------------------------------------------------------------------
create or replace function public.render_template(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_result text := coalesce(p_body, '');
  v_key    text;
  v_val    text;
begin
  for v_key, v_val in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_result := replace(v_result, '{{' || v_key || '}}', coalesce(v_val, ''));
  end loop;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- visit_template_vars(): variáveis disponíveis para templates de uma visita
-- -----------------------------------------------------------------------------
create or replace function public.visit_template_vars(p_visit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'candidato.nome',         l.full_name,
    'candidato.primeiro_nome', split_part(l.full_name, ' ', 1),
    'candidato.curso',        coalesce(c.name, ''),
    'visita.data',            to_char(lower(v.period) at time zone t.timezone, 'DD/MM/YYYY'),
    'visita.hora',            to_char(lower(v.period) at time zone t.timezone, 'HH24:MI'),
    'visita.tipo',            case when v.type = 'group' then 'em grupo' else 'individual' end,
    'coordenador.nome',       p.full_name,
    'campus.nome',            ca.name,
    'campus.endereco',        coalesce(ca.address, ''),
    'campus.link_mapa',       '/mapa/' || ca.slug,
    'checkin.link_qr',        '/visita/' || v.checkin_token::text,
    'instituicao.nome',       t.name
  )
  from public.visits v
  join public.leads l on l.id = v.lead_id
  join public.profiles p on p.id = v.coordinator_id
  join public.campuses ca on ca.id = v.campus_id
  join public.tenants t on t.id = v.tenant_id
  left join public.courses c on c.id = v.course_id
  where v.id = p_visit_id;
$$;

-- -----------------------------------------------------------------------------
-- schedule_visit_communications(): cria message_jobs conforme a régua do tenant
-- -----------------------------------------------------------------------------
create or replace function public.schedule_visit_communications(p_visit_id uuid, p_trigger public.communication_trigger)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit    public.visits%rowtype;
  v_lead     public.leads%rowtype;
  v_coord    public.profiles%rowtype;
  v_rule     record;
  v_vars     jsonb;
  v_run_at   timestamptz;
  v_to       text;
  v_count    integer := 0;
  v_is_reminder boolean;
begin
  select * into v_visit from public.visits where id = p_visit_id;
  if not found then
    return 0;
  end if;
  select * into v_lead  from public.leads where id = v_visit.lead_id;
  select * into v_coord from public.profiles where id = v_visit.coordinator_id;
  v_vars := public.visit_template_vars(p_visit_id);

  for v_rule in
    select r.*, t.subject, t.body, t.provider_template_name, t.id as tpl_id
    from public.communication_rules r
    join public.message_templates t on t.id = r.template_id and t.is_active
    where r.tenant_id = v_visit.tenant_id
      and r.trigger = p_trigger
      and r.is_active
  loop
    v_is_reminder := p_trigger in ('reminder.day_before', 'reminder.hour_before', 'visit.completed');
    v_run_at := case
      when v_is_reminder then lower(v_visit.period) + make_interval(mins => v_rule.offset_minutes)
      else now()
    end;

    -- Lembretes no passado não são agendados
    if v_is_reminder and v_run_at <= now() then
      continue;
    end if;

    -- destinatário(s)
    if v_rule.audience in ('candidate', 'both') then
      v_to := case v_rule.channel when 'whatsapp' then v_lead.phone else v_lead.email end;
      if v_to is not null then
        insert into public.message_jobs (
          tenant_id, visit_id, lead_id, rule_id, template_id, trigger, channel, to_address, run_at, payload
        ) values (
          v_visit.tenant_id, v_visit.id, v_lead.id, v_rule.id, v_rule.tpl_id, p_trigger, v_rule.channel, v_to, v_run_at,
          jsonb_build_object(
            'subject', public.render_template(v_rule.subject, v_vars),
            'body', public.render_template(v_rule.body, v_vars),
            'provider_template_name', v_rule.provider_template_name,
            'vars', v_vars
          )
        );
        v_count := v_count + 1;
      end if;
    end if;

    if v_rule.audience in ('coordinator', 'both') then
      v_to := case v_rule.channel when 'whatsapp' then v_coord.phone else v_coord.email end;
      if v_to is not null then
        insert into public.message_jobs (
          tenant_id, visit_id, lead_id, rule_id, template_id, trigger, channel, to_address, run_at, payload
        ) values (
          v_visit.tenant_id, v_visit.id, v_lead.id, v_rule.id, v_rule.tpl_id, p_trigger, v_rule.channel, v_to, v_run_at,
          jsonb_build_object(
            'subject', public.render_template(v_rule.subject, v_vars),
            'body', public.render_template(v_rule.body, v_vars),
            'provider_template_name', v_rule.provider_template_name,
            'vars', v_vars
          )
        );
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers em visits: confirmação agenda comunicações; cancelamento cancela jobs
-- -----------------------------------------------------------------------------
create or replace function public.on_visit_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.schedule_visit_communications(new.id, 'visit.created');
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'confirmed' then
    perform public.schedule_visit_communications(new.id, 'visit.confirmed');
    perform public.schedule_visit_communications(new.id, 'reminder.day_before');
    perform public.schedule_visit_communications(new.id, 'reminder.hour_before');
    perform public.schedule_visit_communications(new.id, 'visit.completed');
  elsif new.status = 'cancelled' then
    update public.message_jobs set status = 'cancelled'
    where visit_id = new.id and status = 'scheduled';
    perform public.schedule_visit_communications(
      new.id,
      case when exists (select 1 from public.calendar_events e where e.visit_id = new.id and e.declined_at is not null)
           then 'visit.declined'::public.communication_trigger
           else 'visit.cancelled'::public.communication_trigger end
    );
  elsif new.status = 'no_show' then
    update public.message_jobs set status = 'cancelled'
    where visit_id = new.id and status = 'scheduled' and trigger = 'visit.completed';
  end if;

  return new;
end;
$$;

create trigger trg_visits_status_communications
after insert or update of status on public.visits
for each row execute function public.on_visit_status_change();

-- -----------------------------------------------------------------------------
-- Wrappers RPC para a fila pgmq (usados pelo worker via supabase.rpc)
-- -----------------------------------------------------------------------------
create or replace function public.queue_send(p_queue text, p_message jsonb, p_delay_seconds integer default 0)
returns bigint
language sql
security definer
set search_path = public
as $$
  select pgmq.send(p_queue, p_message, p_delay_seconds);
$$;

create or replace function public.queue_read(p_queue text, p_visibility_timeout integer default 60, p_quantity integer default 10)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
language sql
security definer
set search_path = public
as $$
  select msg_id, read_ct, enqueued_at, vt, message
  from pgmq.read(p_queue, p_visibility_timeout, p_quantity);
$$;

create or replace function public.queue_archive(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pgmq.archive(p_queue, p_msg_id);
$$;

create or replace function public.queue_delete(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pgmq.delete(p_queue, p_msg_id);
$$;

-- Apenas o service role (worker) pode operar a fila
revoke execute on function public.queue_send(text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.queue_read(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.queue_archive(text, bigint) from public, anon, authenticated;
revoke execute on function public.queue_delete(text, bigint) from public, anon, authenticated;
grant execute on function public.queue_send(text, jsonb, integer) to service_role;
grant execute on function public.queue_read(text, integer, integer) to service_role;
grant execute on function public.queue_archive(text, bigint) to service_role;
grant execute on function public.queue_delete(text, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- promote_due_message_jobs(): move jobs vencidos para a fila pgmq
-- Executado a cada minuto pelo pg_cron.
-- -----------------------------------------------------------------------------
create or replace function public.promote_due_message_jobs(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job   record;
  v_count integer := 0;
begin
  for v_job in
    select id, tenant_id, visit_id, lead_id, campaign_id, template_id, channel, to_address, payload
    from public.message_jobs
    where status = 'scheduled' and run_at <= now()
    order by run_at
    limit p_limit
    for update skip locked
  loop
    perform pgmq.send('messages_outbound', jsonb_build_object(
      'job_id',      v_job.id,
      'tenant_id',   v_job.tenant_id,
      'visit_id',    v_job.visit_id,
      'lead_id',     v_job.lead_id,
      'campaign_id', v_job.campaign_id,
      'template_id', v_job.template_id,
      'channel',     v_job.channel,
      'to',          v_job.to_address,
      'payload',     v_job.payload
    ));

    update public.message_jobs
    set status = 'enqueued', enqueued_at = now()
    where id = v_job.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

select cron.schedule(
  'promote-message-jobs',
  '* * * * *',
  $$ select public.promote_due_message_jobs(); $$
);
