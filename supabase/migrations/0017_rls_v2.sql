-- =============================================================================
-- 0017_rls_v2.sql
-- RLS para papéis admin/promotor/professor e tabelas novas (Revisão 2)
-- =============================================================================

alter table public.interest_categories enable row level security;
alter table public.chatbot_questions enable row level security;
alter table public.chatbot_sessions enable row level security;
alter table public.chatbot_answers enable row level security;
alter table public.candidate_interests enable row level security;
alter table public.promoter_profiles enable row level security;
alter table public.promoter_interests enable row level security;
alter table public.promoter_pois enable row level security;
alter table public.professor_profiles enable row level security;
alter table public.professor_courses enable row level security;
alter table public.professor_requirement_rules enable row level security;
alter table public.match_weights enable row level security;
alter table public.match_runs enable row level security;
alter table public.match_results enable row level security;
alter table public.admin_alerts enable row level security;
alter table public.visit_invitations enable row level security;
alter table public.visit_reassignments enable row level security;
alter table public.visit_status_history enable row level security;
alter table public.visit_notes enable row level security;
alter table public.scheduling_policies enable row level security;
alter table public.poi_interest_tags enable row level security;
alter table public.visit_itinerary_items enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.rubeus_links enable row level security;
alter table public.rubeus_outbox enable row level security;
alter table public.conversion_events enable row level security;

-- Leitura ampla no tenant
create policy interest_categories_select on public.interest_categories for select
  using (public.is_tenant_member(tenant_id));
create policy interest_categories_write on public.interest_categories for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy chatbot_questions_select on public.chatbot_questions for select
  using (public.is_tenant_member(tenant_id));
create policy chatbot_questions_write on public.chatbot_questions for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy chatbot_sessions_select on public.chatbot_sessions for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_role('admin')
      or profile_id = auth.uid()
    )
  );
create policy chatbot_sessions_write on public.chatbot_sessions for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy chatbot_answers_select on public.chatbot_answers for select
  using (exists (
    select 1 from public.chatbot_sessions s
    where s.id = session_id and public.is_tenant_member(s.tenant_id)
      and (public.has_role('admin') or s.profile_id = auth.uid())
  ));

create policy candidate_interests_select on public.candidate_interests for select
  using (exists (
    select 1 from public.candidates c
    where c.id = candidate_id and public.is_tenant_member(c.tenant_id)
  ));
create policy candidate_interests_write on public.candidate_interests for all
  using (exists (
    select 1 from public.candidates c
    where c.id = candidate_id and public.is_tenant_member(c.tenant_id) and public.has_role('admin')
  ))
  with check (exists (
    select 1 from public.candidates c
    where c.id = candidate_id and public.is_tenant_member(c.tenant_id) and public.has_role('admin')
  ));

-- Promotor: próprio perfil
create policy promoter_profiles_select on public.promoter_profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = profile_id and public.is_tenant_member(p.tenant_id)
  ));
create policy promoter_profiles_update_self on public.promoter_profiles for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy promoter_profiles_admin on public.promoter_profiles for all
  using (exists (
    select 1 from public.profiles p
    where p.id = profile_id and public.is_tenant_member(p.tenant_id) and public.has_role('admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = profile_id and public.is_tenant_member(p.tenant_id) and public.has_role('admin')
  ));

create policy promoter_interests_all on public.promoter_interests for all
  using (promoter_id = auth.uid() or public.has_role('admin'))
  with check (promoter_id = auth.uid() or public.has_role('admin'));

create policy promoter_pois_all on public.promoter_pois for all
  using (promoter_id = auth.uid() or public.has_role('admin'))
  with check (promoter_id = auth.uid() or public.has_role('admin'));

create policy professor_profiles_select on public.professor_profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = profile_id and public.is_tenant_member(p.tenant_id)
  ));
create policy professor_profiles_update_self on public.professor_profiles for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy professor_profiles_admin on public.professor_profiles for all
  using (exists (
    select 1 from public.profiles p
    where p.id = profile_id and public.is_tenant_member(p.tenant_id) and public.has_role('admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = profile_id and public.is_tenant_member(p.tenant_id) and public.has_role('admin')
  ));

create policy professor_courses_all on public.professor_courses for all
  using (professor_id = auth.uid() or public.has_role('admin'))
  with check (professor_id = auth.uid() or public.has_role('admin'));

create policy professor_requirement_rules_select on public.professor_requirement_rules for select
  using (public.is_tenant_member(tenant_id));
create policy professor_requirement_rules_write on public.professor_requirement_rules for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy match_weights_select on public.match_weights for select
  using (public.is_tenant_member(tenant_id));
create policy match_weights_write on public.match_weights for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy match_runs_select on public.match_runs for select
  using (public.is_tenant_member(tenant_id));
create policy match_results_select on public.match_results for select
  using (exists (
    select 1 from public.match_runs r
    where r.id = run_id and public.is_tenant_member(r.tenant_id)
  ));

create policy admin_alerts_select on public.admin_alerts for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));
create policy admin_alerts_write on public.admin_alerts for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

-- Convites: próprio perfil ou admin
create policy visit_invitations_select on public.visit_invitations for select
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin') or profile_id = auth.uid())
  );
create policy visit_invitations_update_self on public.visit_invitations for update
  using (profile_id = auth.uid() or public.has_role('admin'))
  with check (profile_id = auth.uid() or public.has_role('admin'));

create policy visit_reassignments_select on public.visit_reassignments for select
  using (public.is_tenant_member(tenant_id));

create policy visit_status_history_select on public.visit_status_history for select
  using (exists (
    select 1 from public.visits v
    where v.id = visit_id and public.is_tenant_member(v.tenant_id)
      and (
        public.has_role('admin')
        or v.promoter_id = auth.uid()
        or v.professor_id = auth.uid()
      )
  ));

create policy visit_notes_select on public.visit_notes for select
  using (exists (
    select 1 from public.visits v
    where v.id = visit_id and public.is_tenant_member(v.tenant_id)
      and (
        public.has_role('admin')
        or v.promoter_id = auth.uid()
        or v.professor_id = auth.uid()
      )
  ));
create policy visit_notes_insert on public.visit_notes for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and (public.has_role('admin') or v.promoter_id = auth.uid() or v.professor_id = auth.uid())
    )
  );

create policy scheduling_policies_select on public.scheduling_policies for select
  using (public.is_tenant_member(tenant_id));
create policy scheduling_policies_write on public.scheduling_policies for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

create policy poi_interest_tags_select on public.poi_interest_tags for select
  using (exists (
    select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id)
  ));
create policy poi_interest_tags_write on public.poi_interest_tags for all
  using (exists (
    select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id) and public.has_role('admin')
  ))
  with check (exists (
    select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id) and public.has_role('admin')
  ));

create policy visit_itinerary_items_select on public.visit_itinerary_items for select
  using (exists (
    select 1 from public.visits v
    where v.id = visit_id and public.is_tenant_member(v.tenant_id)
      and (public.has_role('admin') or v.promoter_id = auth.uid() or v.professor_id = auth.uid())
  ));
create policy visit_itinerary_items_write on public.visit_itinerary_items for all
  using (exists (
    select 1 from public.visits v
    where v.id = visit_id and public.is_tenant_member(v.tenant_id)
      and (public.has_role('admin') or v.promoter_id = auth.uid())
  ))
  with check (exists (
    select 1 from public.visits v
    where v.id = visit_id and public.is_tenant_member(v.tenant_id)
      and (public.has_role('admin') or v.promoter_id = auth.uid())
  ));

create policy notification_preferences_all on public.notification_preferences for all
  using (profile_id = auth.uid() or public.has_role('admin'))
  with check (profile_id = auth.uid() or public.has_role('admin'));

create policy rubeus_links_select on public.rubeus_links for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));
create policy rubeus_outbox_select on public.rubeus_outbox for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));
create policy conversion_events_select on public.conversion_events for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));

-- Visitas: promotor/professor veem as próprias
drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_role('admin')
      or promoter_id = auth.uid()
      or professor_id = auth.uid()
    )
  );

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_role('admin')
      or promoter_id = auth.uid()
      or professor_id = auth.uid()
    )
  );

-- Candidates: admin vê tudo; promotor vê via visitas (sem CPF na view)
drop policy if exists candidates_select on public.candidates;
create policy candidates_select on public.candidates for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_role('admin')
      or exists (
        select 1 from public.visits v
        where v.candidate_id = candidates.id
          and (v.promoter_id = auth.uid() or v.professor_id = auth.uid())
      )
    )
  );

alter view public.vw_promoter_visit_briefing set (security_invoker = on);
alter view public.vw_pending_issues set (security_invoker = on);
alter view public.vw_visits_kpis set (security_invoker = on);
alter view public.vw_slot_occupancy set (security_invoker = on);
alter view public.vw_reassignment_metrics set (security_invoker = on);
alter view public.vw_promoter_performance set (security_invoker = on);
alter view public.vw_conversion set (security_invoker = on);
alter view public.vw_promoter_history set (security_invoker = on);
alter view public.vw_messaging_metrics set (security_invoker = on);
