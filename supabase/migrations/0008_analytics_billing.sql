-- =============================================================================
-- 0008_analytics_billing.sql
-- Planos SaaS, métricas de uso, auditoria, views analíticas e jobs. Fase 4.
-- RF-01 (dashboards), RNF-04 (cobrança por leads / coordenadores).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plans e assinaturas
-- -----------------------------------------------------------------------------
create table public.plans (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  max_leads_month     integer,  -- null = ilimitado
  max_coordinators    integer,
  max_whatsapp_month  integer,
  max_campuses        integer,
  price_cents         integer not null default 0,
  addons              jsonb not null default '{}'::jsonb,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table public.tenant_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null unique references public.tenants(id) on delete cascade,
  plan_id     uuid not null references public.plans(id),
  status      public.subscription_status not null default 'trial',
  started_at  timestamptz not null default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_tenant_subscriptions_updated_at
before update on public.tenant_subscriptions
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- usage_metrics: consolidação mensal para cobrança
-- -----------------------------------------------------------------------------
create table public.usage_metrics (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  period              date not null, -- primeiro dia do mês
  leads_processed     integer not null default 0,
  active_coordinators integer not null default 0,
  active_campuses     integer not null default 0,
  whatsapp_sent       integer not null default 0,
  emails_sent         integer not null default 0,
  visits_booked       integer not null default 0,
  visits_completed    integer not null default 0,
  computed_at         timestamptz not null default now(),
  constraint usage_metrics_tenant_period_unique unique (tenant_id, period)
);

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  actor_id    uuid,
  action      text not null,  -- leads.export, visit.cancel, template.update, ...
  entity      text,
  entity_id   text,
  diff        jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);

-- -----------------------------------------------------------------------------
-- Views analíticas (RF-01)
-- -----------------------------------------------------------------------------
create or replace view public.vw_funnel as
select
  l.tenant_id,
  l.campus_id,
  date_trunc('month', l.created_at)::date as period,
  count(*)                                                                as leads,
  count(*) filter (where exists (select 1 from public.visits v where v.lead_id = l.id))                          as scheduled,
  count(*) filter (where exists (select 1 from public.visits v where v.lead_id = l.id and v.status in ('confirmed','checked_in'))) as confirmed,
  count(*) filter (where exists (select 1 from public.visits v where v.lead_id = l.id and v.status = 'checked_in'))  as checked_in,
  count(*) filter (where l.status = 'matriculado')                                                                as enrolled
from public.leads l
where l.anonymized_at is null
group by l.tenant_id, l.campus_id, date_trunc('month', l.created_at);

create or replace view public.vw_visits_summary as
select
  v.tenant_id,
  v.campus_id,
  v.coordinator_id,
  (lower(v.period) at time zone t.timezone)::date as visit_date,
  count(*)                                                as total,
  count(*) filter (where v.status = 'pending_confirmation') as pending,
  count(*) filter (where v.status = 'confirmed')            as confirmed,
  count(*) filter (where v.status = 'checked_in')           as checked_in,
  count(*) filter (where v.status = 'no_show')              as no_show,
  count(*) filter (where v.status = 'cancelled')            as cancelled
from public.visits v
join public.tenants t on t.id = v.tenant_id
group by v.tenant_id, v.campus_id, v.coordinator_id, (lower(v.period) at time zone t.timezone)::date;

create or replace view public.vw_messaging_metrics as
select
  m.tenant_id,
  m.channel,
  m.template_id,
  date_trunc('day', m.created_at)::date as day,
  count(*)                                            as total,
  count(*) filter (where m.sent_at is not null)       as sent,
  count(*) filter (where m.delivered_at is not null)  as delivered,
  count(*) filter (where m.read_at is not null)       as read,
  count(*) filter (where m.opened_at is not null)     as opened,
  count(*) filter (where m.clicked_at is not null)    as clicked,
  count(*) filter (where m.status in ('failed','bounced')) as failed
from public.message_logs m
group by m.tenant_id, m.channel, m.template_id, date_trunc('day', m.created_at);

create materialized view public.mv_leads_daily as
select
  l.tenant_id,
  l.campus_id,
  l.course_id,
  coalesce(l.source, 'desconhecido') as source,
  l.created_at::date as day,
  count(*) as leads
from public.leads l
where l.anonymized_at is null
group by l.tenant_id, l.campus_id, l.course_id, coalesce(l.source, 'desconhecido'), l.created_at::date;

create index mv_leads_daily_tenant_day_idx on public.mv_leads_daily (tenant_id, day desc);

-- -----------------------------------------------------------------------------
-- Jobs: no-show, refresh de materialized view, consolidação de uso
-- -----------------------------------------------------------------------------
create or replace function public.mark_no_shows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.visits v
    set status = 'no_show'
    from public.tenants t
    where t.id = v.tenant_id
      and v.status = 'confirmed'
      and v.checked_in_at is null
      and upper(v.period) + make_interval(mins => coalesce((t.settings ->> 'no_show_grace_minutes')::int, 30)) < now()
    returning v.id
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

create or replace function public.consolidate_usage_metrics(p_period date default (date_trunc('month', now() - interval '1 month'))::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := p_period::timestamptz;
  v_end   timestamptz := (p_period + interval '1 month')::timestamptz;
  v_count integer;
begin
  insert into public.usage_metrics (
    tenant_id, period, leads_processed, active_coordinators, active_campuses,
    whatsapp_sent, emails_sent, visits_booked, visits_completed, computed_at
  )
  select
    t.id,
    p_period,
    (select count(*) from public.leads l where l.tenant_id = t.id and l.created_at >= v_start and l.created_at < v_end),
    (select count(*) from public.profiles p where p.tenant_id = t.id and p.role = 'coordenador' and p.is_active),
    (select count(*) from public.campuses c where c.tenant_id = t.id and c.is_active),
    (select count(*) from public.message_logs m where m.tenant_id = t.id and m.channel = 'whatsapp' and m.sent_at >= v_start and m.sent_at < v_end),
    (select count(*) from public.message_logs m where m.tenant_id = t.id and m.channel = 'email' and m.sent_at >= v_start and m.sent_at < v_end),
    (select count(*) from public.visits v where v.tenant_id = t.id and v.created_at >= v_start and v.created_at < v_end),
    (select count(*) from public.visits v where v.tenant_id = t.id and v.status = 'checked_in' and v.checked_in_at >= v_start and v.checked_in_at < v_end),
    now()
  from public.tenants t
  where t.is_active
  on conflict (tenant_id, period) do update set
    leads_processed     = excluded.leads_processed,
    active_coordinators = excluded.active_coordinators,
    active_campuses     = excluded.active_campuses,
    whatsapp_sent       = excluded.whatsapp_sent,
    emails_sent         = excluded.emails_sent,
    visits_booked       = excluded.visits_booked,
    visits_completed    = excluded.visits_completed,
    computed_at         = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- LGPD: anonimização e retenção
-- -----------------------------------------------------------------------------
create or replace function public.anonymize_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set
    full_name     = 'Lead anonimizado',
    email         = null,
    phone         = null,
    metadata      = '{}'::jsonb,
    anonymized_at = now()
  where id = p_lead_id and anonymized_at is null;

  update public.message_logs set to_address = '[anonimizado]' where lead_id = p_lead_id;
  update public.message_jobs set to_address = '[anonimizado]', status = 'cancelled'
  where lead_id = p_lead_id and status = 'scheduled';
end;
$$;

create or replace function public.apply_lead_retention()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead  record;
  v_count integer := 0;
begin
  for v_lead in
    select l.id
    from public.leads l
    join public.tenants t on t.id = l.tenant_id
    where l.anonymized_at is null
      and l.status in ('perdido')
      and l.updated_at < now() - make_interval(months => coalesce((t.settings ->> 'lead_retention_months')::int, 24))
  loop
    perform public.anonymize_lead(v_lead.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Agendamentos pg_cron
-- -----------------------------------------------------------------------------
select cron.schedule('mark-no-shows',            '*/15 * * * *', $$ select public.mark_no_shows(); $$);
select cron.schedule('refresh-mv-leads-daily',   '0 * * * *',    $$ refresh materialized view public.mv_leads_daily; $$);
select cron.schedule('consolidate-usage-metrics','0 2 1 * *',    $$ select public.consolidate_usage_metrics(); $$);
select cron.schedule('apply-lead-retention',     '0 3 * * 0',    $$ select public.apply_lead_retention(); $$);

-- -----------------------------------------------------------------------------
-- Planos padrão
-- -----------------------------------------------------------------------------
insert into public.plans (code, name, max_leads_month, max_coordinators, max_whatsapp_month, max_campuses, price_cents, addons)
values
  ('starter',    'Starter',    500,   5,    1000,  1,    49900,  '{"indoor_3d": false}'::jsonb),
  ('campus',     'Campus',     2500,  20,   5000,  3,    149900, '{"indoor_3d": false}'::jsonb),
  ('enterprise', 'Enterprise', null,  null, null,  null, 0,      '{"indoor_3d": true, "erp_connectors": true}'::jsonb)
on conflict (code) do nothing;
