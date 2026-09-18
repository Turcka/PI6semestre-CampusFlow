-- =============================================================================
-- 0011_candidates_chatbot.sql
-- Extensão de candidates + chatbot configurável + interesses (§3.1, §3.2)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas novas em candidates
-- -----------------------------------------------------------------------------
alter table public.candidates
  add column if not exists cpf text,
  add column if not exists tracking_code text,
  add column if not exists portal_token uuid not null default gen_random_uuid(),
  add column if not exists availability_windows jsonb not null default '[]'::jsonb,
  add column if not exists preferred_focus public.visit_focus,
  add column if not exists behavioral_profile jsonb not null default '{}'::jsonb,
  add column if not exists profile_summary text,
  add column if not exists profile_completed_at timestamptz;

update public.candidates
set tracking_code = encode(extensions.gen_random_bytes(6), 'hex')
where tracking_code is null;

alter table public.candidates
  alter column tracking_code set default encode(extensions.gen_random_bytes(6), 'hex'),
  alter column tracking_code set not null;

alter table public.candidates
  drop constraint if exists candidates_cpf_digits;
alter table public.candidates
  add constraint candidates_cpf_digits check (cpf is null or cpf ~ '^[0-9]{11}$');

create unique index if not exists candidates_tenant_cpf_unique
  on public.candidates (tenant_id, cpf)
  where cpf is not null and anonymized_at is null;

create unique index if not exists candidates_tracking_code_unique
  on public.candidates (tracking_code);

create unique index if not exists candidates_portal_token_unique
  on public.candidates (portal_token);

create index if not exists candidates_tenant_cpf_idx
  on public.candidates (tenant_id, cpf);

create index if not exists candidates_tenant_profile_completed_idx
  on public.candidates (tenant_id, profile_completed_at);

-- -----------------------------------------------------------------------------
-- interest_categories
-- -----------------------------------------------------------------------------
create table public.interest_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint interest_categories_tenant_slug_unique unique (tenant_id, slug)
);

create index interest_categories_tenant_idx on public.interest_categories (tenant_id) where is_active;

-- -----------------------------------------------------------------------------
-- chatbot_questions / sessions / answers
-- -----------------------------------------------------------------------------
create table public.chatbot_questions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  course_id    uuid references public.courses(id) on delete cascade,
  audience     public.chatbot_audience not null default 'candidato',
  key          text not null,
  prompt       text not null,
  kind         public.question_kind not null,
  options      jsonb not null default '[]'::jsonb,
  order_index  integer not null default 0,
  is_required  boolean not null default true,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chatbot_questions_tenant_audience_key_unique unique (tenant_id, audience, key)
);

create index chatbot_questions_tenant_audience_idx
  on public.chatbot_questions (tenant_id, audience, order_index)
  where is_active;

create trigger trg_chatbot_questions_updated_at
before update on public.chatbot_questions
for each row execute function public.set_updated_at();

create table public.chatbot_sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  candidate_id  uuid references public.candidates(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  audience      public.chatbot_audience not null default 'candidato',
  status        public.chatbot_session_status not null default 'in_progress',
  channel       text not null default 'web',
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint chatbot_sessions_subject_check check (
    (audience = 'candidato' and candidate_id is not null)
    or (audience = 'promotor' and profile_id is not null)
  )
);

create index chatbot_sessions_candidate_idx on public.chatbot_sessions (candidate_id);
create index chatbot_sessions_profile_idx on public.chatbot_sessions (profile_id);
create index chatbot_sessions_tenant_status_idx on public.chatbot_sessions (tenant_id, status);

create table public.chatbot_answers (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.chatbot_sessions(id) on delete cascade,
  question_id  uuid not null references public.chatbot_questions(id) on delete cascade,
  value        jsonb not null,
  answered_at  timestamptz not null default now(),
  constraint chatbot_answers_session_question_unique unique (session_id, question_id)
);

create index chatbot_answers_session_idx on public.chatbot_answers (session_id);

create table public.candidate_interests (
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  category_id   uuid not null references public.interest_categories(id) on delete cascade,
  score         numeric(4,3) not null default 0 check (score >= 0 and score <= 1),
  source        text not null default 'chatbot' check (source in ('chatbot', 'manual')),
  primary key (candidate_id, category_id)
);

-- -----------------------------------------------------------------------------
-- build_candidate_profile(session_id)
-- -----------------------------------------------------------------------------
create or replace function public.build_candidate_profile(p_session_id uuid)
returns public.candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   public.chatbot_sessions%rowtype;
  v_candidate public.candidates%rowtype;
  v_answer    record;
  v_option    jsonb;
  v_interest  text;
  v_traits    jsonb := '{}'::jsonb;
  v_focus     public.visit_focus;
  v_focus_counts jsonb := '{}'::jsonb;
  v_top       text[];
  v_course    text;
  v_summary   text;
  v_slug      text;
  v_cat_id    uuid;
  v_score     numeric;
  v_delta     numeric;
  v_trait_key text;
  v_selected  jsonb;
begin
  select * into v_session from public.chatbot_sessions where id = p_session_id;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.audience <> 'candidato' or v_session.candidate_id is null then
    raise exception 'SESSION_NOT_CANDIDATE' using errcode = 'P0001';
  end if;

  delete from public.candidate_interests where candidate_id = v_session.candidate_id and source = 'chatbot';

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
    elsif v_answer.kind = 'scale' then
      continue;
    else
      v_selected := jsonb_build_array(coalesce(v_answer.value ->> 'value', v_answer.value #>> '{}'));
    end if;

    for v_option in
      select opt
      from jsonb_array_elements(v_answer.options) opt
      where opt ->> 'value' in (select jsonb_array_elements_text(v_selected))
    loop
      if v_option ? 'focus' and nullif(v_option ->> 'focus', '') is not null then
        v_focus_counts := jsonb_set(
          v_focus_counts,
          array[v_option ->> 'focus'],
          to_jsonb(coalesce((v_focus_counts ->> (v_option ->> 'focus'))::int, 0) + 1)
        );
      end if;

      if v_option ? 'traits' then
        for v_trait_key, v_delta in
          select key, value::text::numeric
          from jsonb_each_text(v_option -> 'traits')
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
        for v_interest in
          select jsonb_array_elements_text(v_option -> 'interests')
        loop
          select id into v_cat_id
          from public.interest_categories
          where tenant_id = v_session.tenant_id and slug = v_interest and is_active
          limit 1;
          if v_cat_id is not null then
            insert into public.candidate_interests (candidate_id, category_id, score, source)
            values (v_session.candidate_id, v_cat_id, 0.5, 'chatbot')
            on conflict (candidate_id, category_id) do update
              set score = least(1::numeric, public.candidate_interests.score + 0.25);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  select key::public.visit_focus
  into v_focus
  from jsonb_each_text(v_focus_counts)
  order by value::int desc
  limit 1;

  select array_agg(name)
  into v_top
  from (
    select ic.name
    from public.candidate_interests ci
    join public.interest_categories ic on ic.id = ci.category_id
    where ci.candidate_id = v_session.candidate_id
    order by ci.score desc
    limit 3
  ) t;

  select co.name into v_course
  from public.candidates c
  left join public.courses co on co.id = c.course_id
  where c.id = v_session.candidate_id;

  v_summary := trim(both ' ' from concat_ws(
    '. ',
    case when v_course is not null then 'Curso de interesse: ' || v_course end,
    case when v_focus is not null then 'Foco preferido: ' || v_focus::text end,
    case when v_top is not null and array_length(v_top, 1) > 0
      then 'Principais interesses: ' || array_to_string(v_top, ', ')
    end
  ));

  update public.candidates
  set
    behavioral_profile = v_traits,
    preferred_focus = coalesce(v_focus, preferred_focus),
    profile_summary = nullif(v_summary, ''),
    profile_completed_at = now()
  where id = v_session.candidate_id
  returning * into v_candidate;

  update public.chatbot_sessions
  set status = 'completed', completed_at = now()
  where id = p_session_id;

  perform pg_notify('candidate_profile_ready', v_candidate.id::text);

  return v_candidate;
end;
$$;
