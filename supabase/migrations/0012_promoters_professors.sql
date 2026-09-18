-- =============================================================================
-- 0012_promoters_professors.sql
-- Perfis de promotor e professor, disponibilidade por owner (§3.3, §3.7)
-- =============================================================================

alter table public.promoter_courses
  add column if not exists familiarity integer not null default 3
    check (familiarity between 1 and 5);

alter table public.visit_slots
  add column if not exists owner_role public.participant_role not null default 'promotor';

create table public.promoter_profiles (
  profile_id            uuid primary key references public.profiles(id) on delete cascade,
  bio                   text,
  traits                jsonb not null default '{}'::jsonb,
  preferred_focus       public.visit_focus[] not null default '{}',
  experience_level      integer not null default 3 check (experience_level between 1 and 5),
  max_visits_per_day    integer not null default 3 check (max_visits_per_day between 1 and 20),
  accepts_auto_match    boolean not null default true,
  rating_avg            numeric(3,2),
  visits_completed      integer not null default 0,
  no_show_count         integer not null default 0,
  updated_at            timestamptz not null default now()
);

create trigger trg_promoter_profiles_updated_at
before update on public.promoter_profiles
for each row execute function public.set_updated_at();

create table public.promoter_interests (
  promoter_id  uuid not null references public.promoter_profiles(profile_id) on delete cascade,
  category_id  uuid not null references public.interest_categories(id) on delete cascade,
  level        integer not null default 3 check (level between 1 and 5),
  primary key (promoter_id, category_id)
);

create table public.promoter_pois (
  promoter_id  uuid not null references public.promoter_profiles(profile_id) on delete cascade,
  poi_id       uuid not null references public.pois(id) on delete cascade,
  primary key (promoter_id, poi_id)
);

create table public.professor_profiles (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  area            text,
  topics          text[] not null default '{}',
  accepts_visits  boolean not null default true,
  is_substitute   boolean not null default false,
  updated_at      timestamptz not null default now()
);

create trigger trg_professor_profiles_updated_at
before update on public.professor_profiles
for each row execute function public.set_updated_at();

create table public.professor_courses (
  professor_id  uuid not null references public.professor_profiles(profile_id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  is_primary    boolean not null default false,
  primary key (professor_id, course_id)
);

create index professor_courses_course_idx on public.professor_courses (course_id);

create table public.professor_requirement_rules (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  course_id             uuid references public.courses(id) on delete cascade,
  focus                 public.visit_focus,
  interest_category_id  uuid references public.interest_categories(id) on delete set null,
  requirement           public.professor_requirement not null default 'recommended',
  priority              integer not null default 100,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

create index professor_requirement_rules_tenant_idx
  on public.professor_requirement_rules (tenant_id, priority)
  where is_active;

-- -----------------------------------------------------------------------------
-- handle_new_auth_user: cria perfil específico
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_role      public.user_role;
begin
  v_tenant_id := nullif(new.raw_user_meta_data ->> 'tenant_id', '')::uuid;
  if v_tenant_id is null then
    return new;
  end if;

  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'admin');

  insert into public.profiles (id, tenant_id, full_name, email, phone, role)
  values (
    new.id,
    v_tenant_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_role
  )
  on conflict (id) do nothing;

  if v_role = 'promotor' then
    insert into public.promoter_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  elsif v_role = 'professor' then
    insert into public.professor_profiles (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- Backfill: profiles existentes com papel promotor/professor
insert into public.promoter_profiles (profile_id)
select id from public.profiles where role = 'promotor'
on conflict do nothing;

insert into public.professor_profiles (profile_id)
select id from public.profiles where role = 'professor'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- build_promoter_profile(session_id) — questionário do promotor
-- -----------------------------------------------------------------------------
create or replace function public.build_promoter_profile(p_session_id uuid)
returns public.promoter_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.chatbot_sessions%rowtype;
  v_profile  public.promoter_profiles%rowtype;
  v_answer   record;
  v_option   jsonb;
  v_traits   jsonb := '{}'::jsonb;
  v_selected jsonb;
  v_trait_key text;
  v_delta     numeric;
  v_interest  text;
  v_cat_id    uuid;
begin
  select * into v_session from public.chatbot_sessions where id = p_session_id;
  if not found or v_session.audience <> 'promotor' or v_session.profile_id is null then
    raise exception 'SESSION_NOT_PROMOTER' using errcode = 'P0001';
  end if;

  insert into public.promoter_profiles (profile_id)
  values (v_session.profile_id)
  on conflict do nothing;

  for v_answer in
    select a.value, q.options, q.kind
    from public.chatbot_answers a
    join public.chatbot_questions q on q.id = a.question_id
    where a.session_id = p_session_id
  loop
    if v_answer.kind = 'multi_choice' then
      v_selected := coalesce(v_answer.value -> 'values', v_answer.value);
      if jsonb_typeof(v_selected) <> 'array' then
        v_selected := jsonb_build_array(v_answer.value ->> 'value');
      end if;
    else
      v_selected := jsonb_build_array(coalesce(v_answer.value ->> 'value', v_answer.value #>> '{}'));
    end if;

    for v_option in
      select opt from jsonb_array_elements(v_answer.options) opt
      where opt ->> 'value' in (select jsonb_array_elements_text(v_selected))
    loop
      if v_option ? 'traits' then
        for v_trait_key, v_delta in
          select key, value::text::numeric from jsonb_each_text(v_option -> 'traits')
        loop
          v_traits := jsonb_set(
            v_traits,
            array[v_trait_key],
            to_jsonb(least(1::numeric, greatest(0::numeric,
              coalesce((v_traits ->> v_trait_key)::numeric, 0) + v_delta
            )))
          );
        end loop;
      end if;

      if v_option ? 'interests' then
        for v_interest in select jsonb_array_elements_text(v_option -> 'interests')
        loop
          select id into v_cat_id from public.interest_categories
          where tenant_id = v_session.tenant_id and slug = v_interest limit 1;
          if v_cat_id is not null then
            insert into public.promoter_interests (promoter_id, category_id, level)
            values (v_session.profile_id, v_cat_id, 3)
            on conflict (promoter_id, category_id) do update set level = least(5, public.promoter_interests.level + 1);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  update public.promoter_profiles
  set traits = v_traits, updated_at = now()
  where profile_id = v_session.profile_id
  returning * into v_profile;

  update public.chatbot_sessions
  set status = 'completed', completed_at = now()
  where id = p_session_id;

  return v_profile;
end;
$$;

create or replace view public.vw_promoter_history as
select
  v.promoter_id,
  v.id as visit_id,
  v.status,
  lower(v.period) as starts_at,
  c.full_name as candidate_name,
  co.name as course
from public.visits v
join public.candidates c on c.id = v.candidate_id
left join public.courses co on co.id = v.course_id
where v.promoter_id is not null;
