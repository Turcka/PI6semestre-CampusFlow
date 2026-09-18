-- =============================================================================
-- seed.sql (Revisão 2)
-- Dados de desenvolvimento. Idempotente (UUIDs fixos + on conflict do nothing).
-- Aplicar com: npm run db:seed
--
-- Observação: usuários (profiles) dependem de auth.users. Convide pelo painel
-- do Supabase ou POST /api/v1/auth/invite com user_metadata
-- { tenant_id, role: admin|promotor|professor, full_name }.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tenant e campus
-- -----------------------------------------------------------------------------
insert into public.tenants (id, name, slug, timezone)
values ('11111111-1111-1111-1111-111111111111', 'Instituto Mauá de Tecnologia', 'maua', 'America/Sao_Paulo')
on conflict (id) do nothing;

insert into public.campuses (id, tenant_id, name, slug, address, city, state, latitude, longitude, map_bounds)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Campus São Caetano do Sul',
  'sao-caetano',
  'Praça Mauá, 1 - Mauá, São Caetano do Sul - SP, 09580-900',
  'São Caetano do Sul',
  'SP',
  -23.647800,
  -46.573200,
  '{"south": -23.6520, "west": -46.5780, "north": -23.6435, "east": -46.5680}'::jsonb
)
on conflict (id) do nothing;

insert into public.tenant_subscriptions (tenant_id, plan_id, status)
select '11111111-1111-1111-1111-111111111111', id, 'active'
from public.plans where code = 'campus'
on conflict (tenant_id) do nothing;

-- -----------------------------------------------------------------------------
-- Cursos
-- -----------------------------------------------------------------------------
insert into public.courses (id, tenant_id, campus_id, name, code)
values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Engenharia Química',        'EQ'),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Engenharia de Computação',  'EC'),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Engenharia Mecânica',       'EM'),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Administração',             'ADM'),
  ('33333333-3333-3333-3333-333333333305', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Design',                    'DES')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Categorias de interesse
-- -----------------------------------------------------------------------------
insert into public.interest_categories (id, tenant_id, slug, name, description)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '11111111-1111-1111-1111-111111111111', 'tecnologia', 'Tecnologia', 'Computação, software e inovação digital'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', '11111111-1111-1111-1111-111111111111', 'carros', 'Carros', 'Automóveis, mobilidade e mecânica veicular'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', '11111111-1111-1111-1111-111111111111', 'empreendedorismo', 'Empreendedorismo', 'Negócios e startups'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', '11111111-1111-1111-1111-111111111111', 'pesquisa', 'Pesquisa', 'Iniciação científica e laboratórios'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', '11111111-1111-1111-1111-111111111111', 'laboratorios', 'Laboratórios', 'Espaços práticos e experimentais'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06', '11111111-1111-1111-1111-111111111111', 'esportes', 'Esportes', 'Atividades esportivas e bem-estar'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa07', '11111111-1111-1111-1111-111111111111', 'sustentabilidade', 'Sustentabilidade', 'Meio ambiente e energia'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa08', '11111111-1111-1111-1111-111111111111', 'saude', 'Saúde', 'Saúde e qualidade de vida')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Pesos do match (curso 30 / interesses 25 / comportamental 20 / foco 10 / experiência 10 / carga 5)
-- -----------------------------------------------------------------------------
insert into public.match_weights (tenant_id, criterion, weight, kind, min_score, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'course_affinity',         30, 'mandatory',     0.50, true),
  ('11111111-1111-1111-1111-111111111111', 'interest_overlap',        25, 'complementary', null, true),
  ('11111111-1111-1111-1111-111111111111', 'behavioral_similarity',   20, 'complementary', null, true),
  ('11111111-1111-1111-1111-111111111111', 'focus_alignment',         10, 'complementary', null, true),
  ('11111111-1111-1111-1111-111111111111', 'service_experience',      10, 'complementary', null, true),
  ('11111111-1111-1111-1111-111111111111', 'workload_balance',         5, 'tiebreaker',    null, true),
  ('11111111-1111-1111-1111-111111111111', 'rating',                   0, 'complementary', null, false)
on conflict (tenant_id, criterion) do nothing;

-- -----------------------------------------------------------------------------
-- Políticas de agendamento
-- -----------------------------------------------------------------------------
insert into public.scheduling_policies (
  tenant_id, focus, min_hours_to_cancel, min_hours_to_reschedule,
  invitation_timeout_minutes, max_reassignments, default_duration_minutes
)
values
  ('11111111-1111-1111-1111-111111111111', null, 24, 12, 120, 3, 60)
on conflict (tenant_id, focus) do nothing;

-- -----------------------------------------------------------------------------
-- Perguntas do chatbot (candidato)
-- -----------------------------------------------------------------------------
insert into public.chatbot_questions (id, tenant_id, audience, key, prompt, kind, options, order_index)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'interesses',
    'Quais temas mais despertam seu interesse?',
    'multi_choice',
    '[
      {"value":"tec","label":"Tecnologia","interests":["tecnologia"],"traits":{"perfil_tecnico":0.3}},
      {"value":"car","label":"Carros e mobilidade","interests":["carros"],"traits":{"perfil_tecnico":0.2}},
      {"value":"emp","label":"Empreendedorismo","interests":["empreendedorismo"],"traits":{"comunicacao":0.2}},
      {"value":"pes","label":"Pesquisa científica","interests":["pesquisa","laboratorios"],"traits":{"perfil_tecnico":0.3}},
      {"value":"esp","label":"Esportes","interests":["esportes"]},
      {"value":"sus","label":"Sustentabilidade","interests":["sustentabilidade"]}
    ]'::jsonb, 1
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'foco_visita',
    'Qual o foco preferido da sua visita?',
    'single_choice',
    '[
      {"value":"tecnico","label":"Técnico / laboratórios","focus":"tecnico","interests":["laboratorios"]},
      {"value":"academico","label":"Acadêmico / cursos","focus":"academico"},
      {"value":"profissional","label":"Mercado de trabalho","focus":"profissional","interests":["empreendedorismo"]},
      {"value":"institucional","label":"Conhecer o campus","focus":"institucional"}
    ]'::jsonb, 2
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'comunicacao',
    'Como você prefere receber explicações?',
    'single_choice',
    '[
      {"value":"pratica","label":"De forma prática, com demonstrações","traits":{"comunicacao":0.2,"perfil_tecnico":0.2}},
      {"value":"conversa","label":"Conversando e tirando dúvidas","traits":{"comunicacao":0.4}},
      {"value":"roteiro","label":"Com um roteiro estruturado","traits":{"comunicacao":0.1}}
    ]'::jsonb, 3
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'disponibilidade',
    'Informe sua disponibilidade para a visita (dias e horários).',
    'free_text',
    '[]'::jsonb, 4
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'duvidas',
    'Há alguma dúvida específica que gostaria de esclarecer na visita?',
    'free_text',
    '[]'::jsonb, 5
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'experiencia_campus',
    'Já visitou alguma universidade?',
    'single_choice',
    '[
      {"value":"sim","label":"Sim"},
      {"value":"nao","label":"Não, será a primeira vez"}
    ]'::jsonb, 6
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb07',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'motivacao',
    'O que mais motiva sua escolha de curso?',
    'single_choice',
    '[
      {"value":"carreira","label":"Perspectiva de carreira","focus":"profissional","traits":{"comunicacao":0.1}},
      {"value":"paixao","label":"Paixão pela área","focus":"tecnico","traits":{"perfil_tecnico":0.2}},
      {"value":"pesquisa","label":"Pesquisa e inovação","focus":"academico","interests":["pesquisa"]},
      {"value":"impacto","label":"Impacto social","interests":["sustentabilidade","saude"]}
    ]'::jsonb, 7
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb08',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'acompanhantes',
    'Virá acompanhado (pais/responsáveis)?',
    'single_choice',
    '[
      {"value":"sozinho","label":"Sozinho(a)"},
      {"value":"familia","label":"Com familiares"}
    ]'::jsonb, 8
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb09',
    '11111111-1111-1111-1111-111111111111', 'candidato', 'ec_labs',
    'Na Engenharia de Computação, o que você mais quer ver?',
    'multi_choice',
    '[
      {"value":"robotica","label":"Robótica","interests":["tecnologia","laboratorios"]},
      {"value":"redes","label":"Redes e infraestrutura","interests":["tecnologia"]},
      {"value":"software","label":"Desenvolvimento de software","interests":["tecnologia"]}
    ]'::jsonb, 20
  )
on conflict (id) do nothing;

update public.chatbot_questions
set course_id = '33333333-3333-3333-3333-333333333302'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb09';

insert into public.professor_requirement_rules (tenant_id, course_id, focus, requirement, priority)
select * from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333302'::uuid, 'tecnico'::public.visit_focus, 'recommended'::public.professor_requirement, 10),
  ('11111111-1111-1111-1111-111111111111'::uuid, null::uuid, 'academico'::public.visit_focus, 'recommended'::public.professor_requirement, 50)
) as v(tenant_id, course_id, focus, requirement, priority)
where not exists (
  select 1 from public.professor_requirement_rules r
  where r.tenant_id = v.tenant_id
    and r.course_id is not distinct from v.course_id
    and r.focus is not distinct from v.focus
);

-- -----------------------------------------------------------------------------
-- Templates de e-mail (núcleo) e régua
-- -----------------------------------------------------------------------------
insert into public.message_templates (id, tenant_id, name, channel, subject, body, provider_template_name, variables)
values
  (
    '44444444-4444-4444-4444-444444444402',
    '11111111-1111-1111-1111-111111111111',
    'Visita confirmada', 'email', 'Sua visita ao {{campus.nome}} está confirmada',
    '<p>Olá {{candidato.nome}},</p><p>Sua visita ao <strong>{{campus.nome}}</strong> está confirmada para <strong>{{visita.data}} às {{visita.hora}}</strong>, com {{promotor.nome}} ({{candidato.curso}}).</p><p>Endereço: {{campus.endereco}}</p><p>Até lá!<br>{{instituicao.nome}}</p>',
    null,
    array['candidato.nome','campus.nome','visita.data','visita.hora','promotor.nome','candidato.curso','campus.endereco','instituicao.nome']
  ),
  (
    '44444444-4444-4444-4444-444444444406',
    '11111111-1111-1111-1111-111111111111',
    'Nova convocação de promotor', 'email', 'Você foi convocado para uma visita',
    '<p>Olá {{promotor.nome}},</p><p>{{candidato.nome}} ({{candidato.curso}}) tem uma visita agendada para {{visita.data}} às {{visita.hora}}.</p><p>Acesse o CampusFlow para aceitar ou recusar a convocação.</p>',
    null,
    array['promotor.nome','candidato.nome','candidato.curso','visita.data','visita.hora']
  ),
  (
    '44444444-4444-4444-4444-444444444408',
    '11111111-1111-1111-1111-111111111111',
    'Visita agendada (candidato)', 'email', 'Recebemos seu agendamento',
    '<p>Olá {{candidato.nome}},</p><p>Recebemos seu pedido de visita para {{visita.data}} às {{visita.hora}}. Aguarde a confirmação do promotor.</p>',
    null,
    array['candidato.nome','visita.data','visita.hora']
  ),
  (
    '44444444-4444-4444-4444-444444444409',
    '11111111-1111-1111-1111-111111111111',
    'Lembrete véspera', 'email', 'Lembrete: visita amanhã às {{visita.hora}}',
    '<p>Oi {{candidato.primeiro_nome}}, lembrete: amanhã, {{visita.data}} às {{visita.hora}}, é a sua visita ao {{campus.nome}}.</p>',
    null,
    array['candidato.primeiro_nome','visita.data','visita.hora','campus.nome']
  ),
  (
    '44444444-4444-4444-4444-444444444410',
    '11111111-1111-1111-1111-111111111111',
    'Visita cancelada', 'email', 'Sua visita foi cancelada',
    '<p>Olá {{candidato.primeiro_nome}}, sua visita de {{visita.data}} às {{visita.hora}} foi cancelada. Acesse o portal para reagendar.</p>',
    null,
    array['candidato.primeiro_nome','visita.data','visita.hora']
  )
on conflict (id) do nothing;

delete from public.communication_rules where tenant_id = '11111111-1111-1111-1111-111111111111';

insert into public.communication_rules (tenant_id, trigger, channel, template_id, offset_minutes, audience)
values
  ('11111111-1111-1111-1111-111111111111', 'visit.scheduled',       'email', '44444444-4444-4444-4444-444444444408', 0,     'candidato'),
  ('11111111-1111-1111-1111-111111111111', 'promoter.invited',      'email', '44444444-4444-4444-4444-444444444406', 0,     'promotor'),
  ('11111111-1111-1111-1111-111111111111', 'visit.confirmed',       'email', '44444444-4444-4444-4444-444444444402', 0,     'candidato'),
  ('11111111-1111-1111-1111-111111111111', 'reminder.day_before',   'email', '44444444-4444-4444-4444-444444444409', -1440, 'candidato'),
  ('11111111-1111-1111-1111-111111111111', 'visit.cancelled',       'email', '44444444-4444-4444-4444-444444444410', 0,     'candidato')
on conflict (tenant_id, trigger, channel, audience) do nothing;

-- -----------------------------------------------------------------------------
-- POIs, rotas e tags de interesse
-- -----------------------------------------------------------------------------
insert into public.pois (id, tenant_id, campus_id, name, category, description, latitude, longitude, building, order_index)
values
  ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Portaria Principal',           'portaria',    'Entrada principal do campus e recepção de visitantes.',           -23.647300, -46.573900, 'Entrada',  1),
  ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Biblioteca Central',           'biblioteca',  'Acervo físico e digital, salas de estudo individuais e em grupo.', -23.647900, -46.573100, 'Bloco A',  2),
  ('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Laboratório de Química',       'laboratorio', 'Laboratórios de química geral, orgânica e planta piloto.',        -23.648300, -46.572600, 'Bloco C',  3),
  ('55555555-5555-5555-5555-555555555504', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Laboratório de Computação',    'laboratorio', 'Laboratórios de programação, redes e robótica.',                  -23.647600, -46.572400, 'Bloco D',  4),
  ('55555555-5555-5555-5555-555555555505', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Auditório',                    'auditorio',   'Auditório para palestras e recepção de caravanas.',                -23.648000, -46.573600, 'Bloco B',  5),
  ('55555555-5555-5555-5555-555555555506', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Praça de Alimentação',         'alimentacao', 'Restaurante universitário e lanchonetes.',                          -23.648500, -46.573300, 'Central',  6),
  ('55555555-5555-5555-5555-555555555507', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Secretaria Acadêmica',         'secretaria',  'Atendimento a candidatos e alunos.',                                -23.647500, -46.573500, 'Bloco A',  7)
on conflict (id) do nothing;

insert into public.poi_interest_tags (poi_id, category_id, relevance)
values
  ('55555555-5555-5555-5555-555555555503', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', 5),
  ('55555555-5555-5555-5555-555555555503', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 4),
  ('55555555-5555-5555-5555-555555555504', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 5),
  ('55555555-5555-5555-5555-555555555504', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', 5),
  ('55555555-5555-5555-5555-555555555502', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 3)
on conflict do nothing;

insert into public.routes (id, tenant_id, campus_id, name, description, is_accessible, geometry, distance_meters, duration_minutes)
values
  (
    '66666666-6666-6666-6666-666666666601',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Tour Geral',
    'Portaria -> Secretaria -> Biblioteca -> Auditório -> Praça de Alimentação',
    true,
    '{"type":"LineString","coordinates":[[-46.5739,-23.6473],[-46.5735,-23.6475],[-46.5731,-23.6479],[-46.5736,-23.6480],[-46.5733,-23.6485]]}'::jsonb,
    650, 45
  ),
  (
    '66666666-6666-6666-6666-666666666602',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Tour Engenharia Química',
    'Portaria -> Laboratório de Química -> Biblioteca -> Praça de Alimentação',
    true,
    '{"type":"LineString","coordinates":[[-46.5739,-23.6473],[-46.5726,-23.6483],[-46.5731,-23.6479],[-46.5733,-23.6485]]}'::jsonb,
    720, 50
  ),
  (
    '66666666-6666-6666-6666-666666666603',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Tour Engenharia de Computação',
    'Portaria -> Laboratório de Computação -> Biblioteca -> Praça de Alimentação',
    true,
    '{"type":"LineString","coordinates":[[-46.5739,-23.6473],[-46.5724,-23.6476],[-46.5731,-23.6479],[-46.5733,-23.6485]]}'::jsonb,
    600, 45
  )
on conflict (id) do nothing;

insert into public.route_points (route_id, poi_id, order_index, dwell_minutes)
values
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555501', 1, 5),
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555507', 2, 10),
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555502', 3, 10),
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555505', 4, 10),
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555506', 5, 10),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555501', 1, 5),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555503', 2, 20),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555502', 3, 10),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555506', 4, 15),
  ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555501', 1, 5),
  ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555504', 2, 20),
  ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555502', 3, 10),
  ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555506', 4, 10)
on conflict (route_id, order_index) do nothing;

insert into public.itineraries (tenant_id, course_id, route_id, description)
values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', '66666666-6666-6666-6666-666666666602', 'Roteiro com foco nos laboratórios de química.'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', '66666666-6666-6666-6666-666666666603', 'Roteiro com foco nos laboratórios de computação.'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666601', 'Tour geral.'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333304', '66666666-6666-6666-6666-666666666601', 'Tour geral.'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333305', '66666666-6666-6666-6666-666666666601', 'Tour geral.')
on conflict (course_id) do nothing;

-- -----------------------------------------------------------------------------
-- Candidatos de exemplo
-- -----------------------------------------------------------------------------
insert into public.candidates (id, tenant_id, campus_id, course_id, full_name, email, phone, cpf, source, status, consent_at, consent_source)
values
  ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333301', 'Ana Beatriz Souza',   'ana.souza@example.com',    '+5511987650001', '52998224725', 'site',      'novo',      now(), 'formulario_publico'),
  ('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333302', 'Bruno Lima',          'bruno.lima@example.com',   '+5511987650002', '39053344705', 'feira',     'contatado', now(), 'formulario_publico'),
  ('77777777-7777-7777-7777-777777777703', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333304', 'Carla Menezes',       'carla.menezes@example.com','+5511987650003', '15350946056', 'indicacao', 'novo',      now(), 'manual'),
  ('77777777-7777-7777-7777-777777777704', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333303', 'Diego Fernandes',     'diego.f@example.com',      '+5511987650004', '23100299900', 'site',      'novo',      now(), 'formulario_publico'),
  ('77777777-7777-7777-7777-777777777705', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333305', 'Eduarda Castro',      'edu.castro@example.com',   '+5511987650005', '88621577901', 'instagram', 'novo',      now(), 'formulario_publico')
on conflict (id) do nothing;

refresh materialized view public.mv_visits_daily;
