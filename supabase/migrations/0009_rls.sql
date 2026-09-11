-- =============================================================================
-- 0009_rls.sql
-- Row Level Security: isolamento por tenant e autorização por papel.
--
-- Convenções:
--  * Leitura: qualquer membro ativo do tenant.
--  * Escrita: papéis específicos por tabela (ver abaixo).
--  * service_role (worker / rotas públicas da API) ignora RLS por design.
--  * anon não tem acesso direto a nenhuma tabela; rotas públicas passam pela API.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and tenant_id = p_tenant_id and is_active
  );
$$;

-- -----------------------------------------------------------------------------
-- tenants
-- -----------------------------------------------------------------------------
alter table public.tenants enable row level security;

create policy tenants_select on public.tenants for select
  using (id = public.current_tenant_id());

create policy tenants_update on public.tenants for update
  using (id = public.current_tenant_id() and public.has_role('admin'))
  with check (id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- campuses
-- -----------------------------------------------------------------------------
alter table public.campuses enable row level security;

create policy campuses_select on public.campuses for select
  using (public.is_tenant_member(tenant_id));

create policy campuses_write on public.campuses for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select
  using (public.is_tenant_member(tenant_id));

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id = public.current_tenant_id() and role = public.current_user_role());

create policy profiles_admin_write on public.profiles for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- courses / coordinator_courses
-- -----------------------------------------------------------------------------
alter table public.courses enable row level security;

create policy courses_select on public.courses for select
  using (public.is_tenant_member(tenant_id));

create policy courses_write on public.courses for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria'));

alter table public.coordinator_courses enable row level security;

create policy coordinator_courses_select on public.coordinator_courses for select
  using (exists (select 1 from public.courses c where c.id = course_id and public.is_tenant_member(c.tenant_id)));

create policy coordinator_courses_write on public.coordinator_courses for all
  using (exists (select 1 from public.courses c where c.id = course_id and public.is_tenant_member(c.tenant_id)) and public.has_role('admin', 'secretaria'))
  with check (exists (select 1 from public.courses c where c.id = course_id and public.is_tenant_member(c.tenant_id)) and public.has_role('admin', 'secretaria'));

-- -----------------------------------------------------------------------------
-- leads / lead_imports / tags
-- -----------------------------------------------------------------------------
alter table public.leads enable row level security;

create policy leads_select on public.leads for select
  using (public.is_tenant_member(tenant_id));

create policy leads_write on public.leads for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'));

alter table public.lead_imports enable row level security;

create policy lead_imports_select on public.lead_imports for select
  using (public.is_tenant_member(tenant_id));

create policy lead_imports_write on public.lead_imports for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'));

alter table public.lead_tags enable row level security;

create policy lead_tags_select on public.lead_tags for select
  using (public.is_tenant_member(tenant_id));

create policy lead_tags_write on public.lead_tags for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'));

alter table public.lead_tag_assignments enable row level security;

create policy lead_tag_assignments_select on public.lead_tag_assignments for select
  using (exists (select 1 from public.leads l where l.id = lead_id and public.is_tenant_member(l.tenant_id)));

create policy lead_tag_assignments_write on public.lead_tag_assignments for all
  using (exists (select 1 from public.leads l where l.id = lead_id and public.is_tenant_member(l.tenant_id)) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (exists (select 1 from public.leads l where l.id = lead_id and public.is_tenant_member(l.tenant_id)) and public.has_role('admin', 'secretaria', 'marketing'));

-- -----------------------------------------------------------------------------
-- availability_rules / availability_exceptions
-- Coordenador edita apenas a própria agenda; admin/secretaria editam qualquer.
-- -----------------------------------------------------------------------------
alter table public.availability_rules enable row level security;

create policy availability_rules_select on public.availability_rules for select
  using (public.is_tenant_member(tenant_id));

create policy availability_rules_write on public.availability_rules for all
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or (public.has_role('coordenador') and coordinator_id = auth.uid()))
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or (public.has_role('coordenador') and coordinator_id = auth.uid()))
  );

alter table public.availability_exceptions enable row level security;

create policy availability_exceptions_select on public.availability_exceptions for select
  using (public.is_tenant_member(tenant_id));

create policy availability_exceptions_write on public.availability_exceptions for all
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or (public.has_role('coordenador') and coordinator_id = auth.uid()))
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or (public.has_role('coordenador') and coordinator_id = auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- visit_slots / visits / calendar_events
-- Escrita de visitas ocorre via funções security definer (book_visit, cancel_visit,
-- confirm/decline). Diretamente, apenas admin/secretaria.
-- -----------------------------------------------------------------------------
alter table public.visit_slots enable row level security;

create policy visit_slots_select on public.visit_slots for select
  using (public.is_tenant_member(tenant_id));

create policy visit_slots_write on public.visit_slots for all
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or (public.has_role('coordenador') and coordinator_id = auth.uid()))
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or (public.has_role('coordenador') and coordinator_id = auth.uid()))
  );

alter table public.visits enable row level security;

create policy visits_select on public.visits for select
  using (public.is_tenant_member(tenant_id));

create policy visits_write on public.visits for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria'));

alter table public.calendar_events enable row level security;

create policy calendar_events_select on public.calendar_events for select
  using (public.is_tenant_member(tenant_id));

create policy calendar_events_update on public.calendar_events for update
  using (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or coordinator_id = auth.uid())
  )
  with check (
    public.is_tenant_member(tenant_id)
    and (public.has_role('admin', 'secretaria') or coordinator_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- messaging
-- -----------------------------------------------------------------------------
alter table public.message_templates enable row level security;

create policy message_templates_select on public.message_templates for select
  using (public.is_tenant_member(tenant_id));

create policy message_templates_write on public.message_templates for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'));

alter table public.communication_rules enable row level security;

create policy communication_rules_select on public.communication_rules for select
  using (public.is_tenant_member(tenant_id));

create policy communication_rules_write on public.communication_rules for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'));

alter table public.campaigns enable row level security;

create policy campaigns_select on public.campaigns for select
  using (public.is_tenant_member(tenant_id));

create policy campaigns_write on public.campaigns for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'marketing'));

alter table public.message_jobs enable row level security;

create policy message_jobs_select on public.message_jobs for select
  using (public.is_tenant_member(tenant_id));

-- jobs são criados por triggers/funções e pelo worker (service role)

alter table public.message_logs enable row level security;

create policy message_logs_select on public.message_logs for select
  using (public.is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- mapa / check-in
-- -----------------------------------------------------------------------------
alter table public.pois enable row level security;

create policy pois_select on public.pois for select
  using (public.is_tenant_member(tenant_id));

create policy pois_write on public.pois for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'embaixador'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'embaixador'));

alter table public.poi_photos enable row level security;

create policy poi_photos_select on public.poi_photos for select
  using (exists (select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id)));

create policy poi_photos_write on public.poi_photos for all
  using (exists (select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id)) and public.has_role('admin', 'secretaria', 'embaixador'))
  with check (exists (select 1 from public.pois p where p.id = poi_id and public.is_tenant_member(p.tenant_id)) and public.has_role('admin', 'secretaria', 'embaixador'));

alter table public.routes enable row level security;

create policy routes_select on public.routes for select
  using (public.is_tenant_member(tenant_id));

create policy routes_write on public.routes for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'embaixador'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'embaixador'));

alter table public.route_points enable row level security;

create policy route_points_select on public.route_points for select
  using (exists (select 1 from public.routes r where r.id = route_id and public.is_tenant_member(r.tenant_id)));

create policy route_points_write on public.route_points for all
  using (exists (select 1 from public.routes r where r.id = route_id and public.is_tenant_member(r.tenant_id)) and public.has_role('admin', 'secretaria', 'embaixador'))
  with check (exists (select 1 from public.routes r where r.id = route_id and public.is_tenant_member(r.tenant_id)) and public.has_role('admin', 'secretaria', 'embaixador'));

alter table public.itineraries enable row level security;

create policy itineraries_select on public.itineraries for select
  using (public.is_tenant_member(tenant_id));

create policy itineraries_write on public.itineraries for all
  using (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'embaixador'))
  with check (public.is_tenant_member(tenant_id) and public.has_role('admin', 'secretaria', 'embaixador'));

alter table public.checkins enable row level security;

create policy checkins_select on public.checkins for select
  using (public.is_tenant_member(tenant_id));

-- check-in ocorre via check_in_visit() (security definer)

-- -----------------------------------------------------------------------------
-- billing / analytics / auditoria
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;

create policy plans_select on public.plans for select
  using (auth.role() = 'authenticated');

alter table public.tenant_subscriptions enable row level security;

create policy tenant_subscriptions_select on public.tenant_subscriptions for select
  using (public.is_tenant_member(tenant_id));

alter table public.usage_metrics enable row level security;

create policy usage_metrics_select on public.usage_metrics for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));

alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs for select
  using (public.is_tenant_member(tenant_id) and public.has_role('admin'));

-- -----------------------------------------------------------------------------
-- Views: executam com os privilégios de quem consulta (RLS das tabelas base)
-- -----------------------------------------------------------------------------
alter view public.vw_funnel set (security_invoker = on);
alter view public.vw_visits_summary set (security_invoker = on);
alter view public.vw_messaging_metrics set (security_invoker = on);
alter view public.vw_public_campus_map set (security_invoker = on);

-- -----------------------------------------------------------------------------
-- Storage: políticas dos buckets
-- -----------------------------------------------------------------------------
-- Leitura pública das imagens
create policy "poi-photos public read" on storage.objects for select
  using (bucket_id = 'poi-photos');

create policy "tenant-assets public read" on storage.objects for select
  using (bucket_id = 'tenant-assets');

-- Upload/alteração por membros com papel adequado; caminho começa com <tenant_id>/
create policy "poi-photos tenant write" on storage.objects for all
  using (
    bucket_id = 'poi-photos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin', 'secretaria', 'embaixador')
  )
  with check (
    bucket_id = 'poi-photos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin', 'secretaria', 'embaixador')
  );

create policy "tenant-assets admin write" on storage.objects for all
  using (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  )
  with check (
    bucket_id = 'tenant-assets'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin')
  );

create policy "lead-imports tenant rw" on storage.objects for all
  using (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin', 'secretaria', 'marketing')
  )
  with check (
    bucket_id = 'lead-imports'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_role('admin', 'secretaria', 'marketing')
  );
