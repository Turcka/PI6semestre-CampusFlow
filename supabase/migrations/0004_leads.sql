-- =============================================================================
-- 0004_leads.sql
-- Leads (vestibulandos), importações e tags. Fase 1 - RF-01.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- lead_imports: histórico de importações CSV/XLSX
-- -----------------------------------------------------------------------------
create table public.lead_imports (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  file_name       text,
  file_path       text, -- caminho no bucket lead-imports
  total_rows      integer not null default 0,
  valid_rows      integer not null default 0,
  duplicate_rows  integer not null default 0,
  invalid_rows    integer not null default 0,
  status          public.lead_import_status not null default 'preview',
  preview         jsonb, -- linhas classificadas para o wizard de importação
  error           text,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz
);

create index lead_imports_tenant_idx on public.lead_imports (tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  campus_id       uuid references public.campuses(id) on delete set null,
  course_id       uuid references public.courses(id) on delete set null,
  full_name       text not null,
  email           text,
  phone           text, -- E.164: +55DDDNÚMERO
  source          text, -- site, feira, indicacao, importacao, ...
  status          public.lead_status not null default 'novo',
  hygiene_status  public.lead_hygiene_status not null default 'valid',
  duplicate_of    uuid references public.leads(id) on delete set null,
  consent_at      timestamptz,
  consent_source  text, -- formulario_publico, importacao, manual
  import_id       uuid references public.lead_imports(id) on delete set null,
  enrolled_at     timestamptz,
  anonymized_at   timestamptz,
  metadata        jsonb not null default '{}'::jsonb, -- utm, escola de origem, etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint leads_contact_required check (email is not null or phone is not null),
  constraint leads_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint leads_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Unicidade apenas entre leads válidos: duplicados ficam registrados com duplicate_of
create unique index leads_tenant_email_unique
  on public.leads (tenant_id, lower(email))
  where email is not null and hygiene_status = 'valid' and anonymized_at is null;

create unique index leads_tenant_phone_unique
  on public.leads (tenant_id, phone)
  where phone is not null and hygiene_status = 'valid' and anonymized_at is null;

create index leads_tenant_created_idx   on public.leads (tenant_id, created_at desc);
create index leads_tenant_status_idx    on public.leads (tenant_id, status);
create index leads_tenant_course_idx    on public.leads (tenant_id, course_id);
create index leads_tenant_source_idx    on public.leads (tenant_id, source);
create index leads_full_name_trgm_idx   on public.leads using gin (full_name extensions.gin_trgm_ops);
create index leads_email_trgm_idx       on public.leads using gin (email extensions.gin_trgm_ops);

create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- lead_tags
-- -----------------------------------------------------------------------------
create table public.lead_tags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  color       text not null default '#2563eb',
  created_at  timestamptz not null default now(),
  constraint lead_tags_tenant_name_unique unique (tenant_id, name)
);

create table public.lead_tag_assignments (
  lead_id     uuid not null references public.leads(id) on delete cascade,
  tag_id      uuid not null references public.lead_tags(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

create index lead_tag_assignments_tag_idx on public.lead_tag_assignments (tag_id);

-- -----------------------------------------------------------------------------
-- Bucket privado para arquivos de importação
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('lead-imports', 'lead-imports', false, 20971520)
on conflict (id) do nothing;
