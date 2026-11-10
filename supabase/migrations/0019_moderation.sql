-- =============================================================================
-- 0019_moderation.sql — Sprint 1 / E4
-- Banimento e expulsão de usuários sem perder histórico de visitas.
--   * profiles.is_banned + metadados do banimento
--   * FKs para profiles passam a SET NULL onde o histórico deve sobreviver
--   * profile_can_be_assigned() e travas em match / escalação manual
--   * ban_profile / unban_profile / prepare_profile_removal
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas de moderação
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_banned  boolean not null default false,
  add column if not exists banned_at  timestamptz,
  add column if not exists banned_by  uuid references public.profiles(id) on delete set null,
  add column if not exists ban_reason text;

create index if not exists profiles_tenant_banned_idx
  on public.profiles (tenant_id) where is_banned;

-- -----------------------------------------------------------------------------
-- 2) FKs → SET NULL para preservar histórico ao remover um usuário
--    (os nomes das constraints variam por causa dos renames; localizamos por coluna)
-- -----------------------------------------------------------------------------
create or replace function public._fk_to_set_null(p_table regclass, p_column text)
returns void
language plpgsql
as $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = p_table
    and c.contype = 'f'
    and c.confrelid = 'public.profiles'::regclass
    and a.attname = p_column
  limit 1;

  if v_name is not null then
    execute format('alter table %s drop constraint %I', p_table, v_name);
  end if;

  execute format(
    'alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
    p_table, p_table::text || '_' || p_column || '_fkey', p_column
  );
end;
$$;

-- visits.promoter_id (era ON DELETE RESTRICT — bloqueava a exclusão)
select public._fk_to_set_null('public.visits', 'promoter_id');
-- calendar_events.promoter_id (era CASCADE — apagaria o evento do calendário)
select public._fk_to_set_null('public.calendar_events', 'promoter_id');

-- visit_notes.author_id (era CASCADE e NOT NULL)
alter table public.visit_notes alter column author_id drop not null;
select public._fk_to_set_null('public.visit_notes', 'author_id');

-- match_results.promoter_id (era CASCADE e NOT NULL; unique vira parcial)
alter table public.match_results alter column promoter_id drop not null;
alter table public.match_results drop constraint if exists match_results_run_promoter_unique;
create unique index if not exists match_results_run_promoter_unique
  on public.match_results (run_id, promoter_id) where promoter_id is not null;
select public._fk_to_set_null('public.match_results', 'promoter_id');

-- visit_invitations.profile_id (era CASCADE e NOT NULL)
alter table public.visit_invitations alter column profile_id drop not null;
select public._fk_to_set_null('public.visit_invitations', 'profile_id');

drop function public._fk_to_set_null(regclass, text);

-- -----------------------------------------------------------------------------
-- 3) Regra única de "pode ser escalado"
-- -----------------------------------------------------------------------------
create or replace function public.profile_can_be_assigned(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_active and not p.is_banned from public.profiles p where p.id = p_profile_id),
    false
  );
$$;

-- has_role: usuário banido não tem papel efetivo
create or replace function public.has_role(variadic p_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = any(p_roles) from public.profiles where id = auth.uid() and is_active and not is_banned),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- 4) Travas em find_available_professor e assign_visit_manually
-- -----------------------------------------------------------------------------
create or replace function public.find_available_professor(
  p_tenant_id uuid,
  p_course_id uuid,
  p_window tstzrange,
  p_prefer_substitute boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  join public.professor_profiles pp on pp.profile_id = p.id
  where p.tenant_id = p_tenant_id
    and p.role = 'professor'
    and p.is_active
    and not p.is_banned
    and pp.accepts_visits
    and (not p_prefer_substitute or pp.is_substitute)
    and (
      p_course_id is null
      or exists (
        select 1 from public.professor_courses pc
        where pc.professor_id = p.id and pc.course_id = p_course_id
      )
    )
    and exists (
      select 1 from public.visit_slots s
      where s.owner_id = p.id
        and s.is_open
        and tstzrange(s.starts_at, s.ends_at, '[)') @> p_window
    )
    and not exists (
      select 1 from public.visits v
      where v.professor_id = p.id
        and v.status in ('agendada','aguardando_professor','confirmada','em_atendimento')
        and v.period && p_window
    )
  order by pp.is_substitute asc, p.full_name
  limit 1;
$$;

create or replace function public.assign_visit_manually(
  p_visit_id uuid,
  p_role public.participant_role,
  p_profile_id uuid,
  p_actor uuid
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits%rowtype;
  v_from  uuid;
  v_policy public.scheduling_policies%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active and not is_banned) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not public.profile_can_be_assigned(p_profile_id) then
    raise exception 'PROFILE_NOT_ASSIGNABLE' using errcode = 'P0001';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'VISIT_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_policy := public.get_scheduling_policy(v_visit.tenant_id, v_visit.focus);

  if p_role = 'promotor' then
    v_from := v_visit.promoter_id;
    update public.visits set promoter_id = p_profile_id, status = 'aguardando_promotor'
    where id = p_visit_id returning * into v_visit;
    update public.calendar_events set promoter_id = p_profile_id where visit_id = p_visit_id;
    update public.visit_invitations set status = 'cancelled'
    where visit_id = p_visit_id and role = 'promotor' and status = 'pending';
    insert into public.visit_invitations (tenant_id, visit_id, profile_id, role, expires_at)
    values (
      v_visit.tenant_id, p_visit_id, p_profile_id, 'promotor',
      now() + make_interval(mins => coalesce(v_policy.invitation_timeout_minutes, 120))
    );
  else
    v_from := v_visit.professor_id;
    update public.visits set professor_id = p_profile_id where id = p_visit_id returning * into v_visit;
    update public.calendar_events set professor_id = p_profile_id where visit_id = p_visit_id;
    update public.visit_invitations set status = 'cancelled'
    where visit_id = p_visit_id and role = 'professor' and status = 'pending';
    insert into public.visit_invitations (tenant_id, visit_id, profile_id, role, expires_at)
    values (
      v_visit.tenant_id, p_visit_id, p_profile_id, 'professor',
      now() + make_interval(mins => coalesce(v_policy.invitation_timeout_minutes, 120))
    );
  end if;

  insert into public.visit_reassignments (
    tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, triggered_by
  ) values (
    v_visit.tenant_id, p_visit_id, p_role, v_from, p_profile_id, 'admin', p_actor
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_visit.tenant_id, p_actor, 'visit.assign_manual', 'visits', p_visit_id::text,
    jsonb_build_object('role', p_role, 'from', v_from, 'to', p_profile_id)
  );

  return v_visit;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Desvincular um perfil das visitas futuras (compartilhado por ban/remoção)
--    Visitas passadas (realizada/ausente/cancelada) não são tocadas.
-- -----------------------------------------------------------------------------
create or replace function public._release_profile_from_future_visits(
  p_profile_id uuid,
  p_actor uuid,
  p_action text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_visit   record;
  v_count   integer := 0;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then
    return 0;
  end if;

  -- convites pendentes deixam de valer
  update public.visit_invitations
  set status = 'cancelled', responded_at = now()
  where profile_id = p_profile_id and status = 'pending';

  for v_visit in
    select v.*
    from public.visits v
    where (v.promoter_id = p_profile_id or v.professor_id = p_profile_id)
      and v.status in ('agendada','aguardando_promotor','aguardando_professor','confirmada','em_atendimento')
      and upper(v.period) > now()
    for update
  loop
    v_count := v_count + 1;

    if v_visit.promoter_id = p_profile_id then
      update public.visits
      set promoter_id = null, status = 'aguardando_promotor'
      where id = v_visit.id;
      update public.calendar_events set promoter_id = null where visit_id = v_visit.id;

      insert into public.visit_reassignments (tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, triggered_by)
      values (v_visit.tenant_id, v_visit.id, 'promotor', p_profile_id, null, 'admin', p_actor);

      insert into public.admin_alerts (tenant_id, kind, visit_id, severity, message)
      values (
        v_visit.tenant_id, 'no_substitute', v_visit.id, 'critical',
        format('Promotor %s foi %s; a visita %s ficou sem promotor.',
               v_profile.full_name,
               case when p_action = 'ban' then 'banido' else 'removido' end,
               to_char(lower(v_visit.period) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
      );
    end if;

    if v_visit.professor_id = p_profile_id then
      update public.visits
      set professor_id = null,
          status = case when v_visit.professor_requirement = 'required' and v_visit.status <> 'aguardando_promotor'
                        then 'aguardando_professor' else status end
      where id = v_visit.id;
      update public.calendar_events set professor_id = null where visit_id = v_visit.id;

      insert into public.visit_reassignments (tenant_id, visit_id, role, from_profile_id, to_profile_id, reason, triggered_by)
      values (v_visit.tenant_id, v_visit.id, 'professor', p_profile_id, null, 'admin', p_actor);

      insert into public.admin_alerts (tenant_id, kind, visit_id, severity, message)
      values (
        v_visit.tenant_id, 'professor_required_missing', v_visit.id, 'warning',
        format('Professor %s foi %s; a visita precisa de novo professor.',
               v_profile.full_name,
               case when p_action = 'ban' then 'banido' else 'removido' end)
      );
    end if;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) ban_profile / unban_profile / prepare_profile_removal
-- -----------------------------------------------------------------------------
create or replace function public.ban_profile(
  p_profile_id uuid,
  p_actor uuid,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles%rowtype;
  v_actor    public.profiles%rowtype;
  v_released integer;
begin
  select * into v_actor from public.profiles where id = p_actor and role = 'admin' and is_active and not is_banned;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id and tenant_id = v_actor.tenant_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_profile.id = p_actor then
    raise exception 'CANNOT_BAN_SELF' using errcode = 'P0001';
  end if;
  if v_profile.role = 'admin' and (
    select count(*) from public.profiles
    where tenant_id = v_actor.tenant_id and role = 'admin' and is_active and not is_banned
  ) <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;

  v_released := public._release_profile_from_future_visits(p_profile_id, p_actor, 'ban');

  update public.profiles
  set is_banned = true, is_active = false, banned_at = now(), banned_by = p_actor, ban_reason = p_reason
  where id = p_profile_id
  returning * into v_profile;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_profile.tenant_id, p_actor, 'profile.ban', 'profiles', p_profile_id::text,
    jsonb_build_object('reason', p_reason, 'released_visits', v_released)
  );

  return v_profile;
end;
$$;

create or replace function public.unban_profile(
  p_profile_id uuid,
  p_actor uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_actor   public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor and role = 'admin' and is_active and not is_banned;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.profiles
  set is_banned = false, is_active = true, banned_at = null, banned_by = null, ban_reason = null
  where id = p_profile_id and tenant_id = v_actor.tenant_id
  returning * into v_profile;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (v_profile.tenant_id, p_actor, 'profile.unban', 'profiles', p_profile_id::text, '{}'::jsonb);

  return v_profile;
end;
$$;

-- Prepara a remoção definitiva: libera visitas futuras e registra auditoria.
-- A exclusão em si acontece na API via auth.admin.deleteUser (cascata em profiles).
create or replace function public.prepare_profile_removal(
  p_profile_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles%rowtype;
  v_actor    public.profiles%rowtype;
  v_released integer;
begin
  select * into v_actor from public.profiles where id = p_actor and role = 'admin' and is_active and not is_banned;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id and tenant_id = v_actor.tenant_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_profile.id = p_actor then
    raise exception 'CANNOT_REMOVE_SELF' using errcode = 'P0001';
  end if;
  if v_profile.role = 'admin' and (
    select count(*) from public.profiles
    where tenant_id = v_actor.tenant_id and role = 'admin' and is_active and not is_banned and id <> p_profile_id
  ) = 0 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;

  v_released := public._release_profile_from_future_visits(p_profile_id, p_actor, 'remove');

  -- slots abertos do usuário deixam de ser ofertados ao público
  update public.visit_slots set is_open = false where owner_id = p_profile_id and is_open;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, diff)
  values (
    v_profile.tenant_id, p_actor, 'profile.remove', 'profiles', p_profile_id::text,
    jsonb_build_object(
      'email', v_profile.email, 'full_name', v_profile.full_name, 'role', v_profile.role,
      'released_visits', v_released
    )
  );

  return jsonb_build_object('profileId', p_profile_id, 'releasedVisits', v_released);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Auto-edição não pode mexer nas colunas de moderação
--    (profiles_update_self permite UPDATE da própria linha; travamos por trigger)
-- -----------------------------------------------------------------------------
create or replace function public.protect_profile_moderation_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.has_role('admin') then
    if new.is_banned is distinct from old.is_banned
       or new.is_active is distinct from old.is_active
       or new.banned_at is distinct from old.banned_at
       or new.banned_by is distinct from old.banned_by
       or new.ban_reason is distinct from old.ban_reason
       or new.role is distinct from old.role
       or new.tenant_id is distinct from old.tenant_id then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_moderation on public.profiles;
create trigger trg_profiles_protect_moderation
before update on public.profiles
for each row execute function public.protect_profile_moderation_columns();

-- -----------------------------------------------------------------------------
-- 8) run_promoter_match: o filtro "not p.is_banned" entra junto com as travas de
--    elegibilidade do promotor na migração 0020 (corpo redefinido uma única vez).
-- -----------------------------------------------------------------------------

comment on column public.profiles.is_banned is 'Usuário banido pelo admin: não loga, não é escalado, histórico preservado.';
