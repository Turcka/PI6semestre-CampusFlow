-- =============================================================================
-- seed.sql
-- Dados de desenvolvimento. Idempotente (UUIDs fixos + on conflict do nothing).
-- Aplicar com: npm run db:seed
--
-- Observação: usuários (profiles) não são criados aqui porque dependem de
-- auth.users. Convide usuários pelo painel do Supabase ou pela API
-- (POST /api/v1/auth/invite) informando user_metadata { tenant_id, role, full_name }.
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

-- -----------------------------------------------------------------------------
-- Assinatura (plano Campus)
-- -----------------------------------------------------------------------------
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
-- Templates de mensagem (RF-05)
-- -----------------------------------------------------------------------------
insert into public.message_templates (id, tenant_id, name, channel, subject, body, provider_template_name, variables)
values
  (
    '44444444-4444-4444-4444-444444444401',
    '11111111-1111-1111-1111-111111111111',
    'Visita confirmada', 'whatsapp', null,
    'Olá {{candidato.primeiro_nome}}! Sua visita ao {{campus.nome}} está confirmada para {{visita.data}} às {{visita.hora}} com {{coordenador.nome}}. Endereço: {{campus.endereco}}. Apresente este QR Code na portaria: {{checkin.link_qr}}',
    'campusflow_visita_confirmada',
    array['candidato.primeiro_nome','campus.nome','visita.data','visita.hora','coordenador.nome','campus.endereco','checkin.link_qr']
  ),
  (
    '44444444-4444-4444-4444-444444444402',
    '11111111-1111-1111-1111-111111111111',
    'Visita confirmada', 'email', 'Sua visita ao {{campus.nome}} está confirmada',
    '<p>Olá {{candidato.nome}},</p><p>Sua visita ao <strong>{{campus.nome}}</strong> está confirmada para <strong>{{visita.data}} às {{visita.hora}}</strong>, com {{coordenador.nome}} ({{candidato.curso}}).</p><p>Endereço: {{campus.endereco}}</p><p>Apresente seu QR Code na portaria: <a href="{{checkin.link_qr}}">{{checkin.link_qr}}</a></p><p>Veja o mapa do campus: <a href="{{campus.link_mapa}}">{{campus.link_mapa}}</a></p><p>Até lá!<br>{{instituicao.nome}}</p>',
    null,
    array['candidato.nome','campus.nome','visita.data','visita.hora','coordenador.nome','candidato.curso','campus.endereco','checkin.link_qr','campus.link_mapa','instituicao.nome']
  ),
  (
    '44444444-4444-4444-4444-444444444403',
    '11111111-1111-1111-1111-111111111111',
    'Lembrete véspera', 'whatsapp', null,
    'Oi {{candidato.primeiro_nome}}, lembrete: amanhã, {{visita.data}} às {{visita.hora}}, é a sua visita ao {{campus.nome}}. Te esperamos!',
    'campusflow_lembrete_vespera',
    array['candidato.primeiro_nome','visita.data','visita.hora','campus.nome']
  ),
  (
    '44444444-4444-4444-4444-444444444404',
    '11111111-1111-1111-1111-111111111111',
    'Lembrete 1h antes', 'whatsapp', null,
    '{{candidato.primeiro_nome}}, sua visita começa em 1 hora ({{visita.hora}}). Mapa do campus: {{campus.link_mapa}}',
    'campusflow_lembrete_1h',
    array['candidato.primeiro_nome','visita.hora','campus.link_mapa']
  ),
  (
    '44444444-4444-4444-4444-444444444405',
    '11111111-1111-1111-1111-111111111111',
    'Pesquisa de satisfação', 'email', 'Como foi sua visita ao {{campus.nome}}?',
    '<p>Olá {{candidato.nome}},</p><p>Obrigado por visitar o {{campus.nome}}! Conte como foi sua experiência respondendo a uma pesquisa rápida.</p><p>{{instituicao.nome}}</p>',
    null,
    array['candidato.nome','campus.nome','instituicao.nome']
  ),
  (
    '44444444-4444-4444-4444-444444444406',
    '11111111-1111-1111-1111-111111111111',
    'Nova visita para confirmar', 'email', 'Nova visita aguardando sua confirmação',
    '<p>Olá {{coordenador.nome}},</p><p>{{candidato.nome}} ({{candidato.curso}}) agendou uma visita {{visita.tipo}} para {{visita.data}} às {{visita.hora}}.</p><p>Acesse o CampusFlow para confirmar ou recusar.</p>',
    null,
    array['coordenador.nome','candidato.nome','candidato.curso','visita.tipo','visita.data','visita.hora']
  ),
  (
    '44444444-4444-4444-4444-444444444407',
    '11111111-1111-1111-1111-111111111111',
    'Visita cancelada', 'whatsapp', null,
    'Olá {{candidato.primeiro_nome}}, infelizmente sua visita de {{visita.data}} às {{visita.hora}} foi cancelada. Acesse o CampusFlow para escolher um novo horário.',
    'campusflow_visita_cancelada',
    array['candidato.primeiro_nome','visita.data','visita.hora']
  )
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Régua de comunicação padrão
-- -----------------------------------------------------------------------------
insert into public.communication_rules (tenant_id, trigger, channel, template_id, offset_minutes, audience)
values
  ('11111111-1111-1111-1111-111111111111', 'visit.created',        'email',    '44444444-4444-4444-4444-444444444406', 0,     'coordinator'),
  ('11111111-1111-1111-1111-111111111111', 'visit.confirmed',      'whatsapp', '44444444-4444-4444-4444-444444444401', 0,     'candidate'),
  ('11111111-1111-1111-1111-111111111111', 'visit.confirmed',      'email',    '44444444-4444-4444-4444-444444444402', 0,     'candidate'),
  ('11111111-1111-1111-1111-111111111111', 'reminder.day_before',  'whatsapp', '44444444-4444-4444-4444-444444444403', -1440, 'candidate'),
  ('11111111-1111-1111-1111-111111111111', 'reminder.hour_before', 'whatsapp', '44444444-4444-4444-4444-444444444404', -60,   'candidate'),
  ('11111111-1111-1111-1111-111111111111', 'visit.completed',      'email',    '44444444-4444-4444-4444-444444444405', 120,   'candidate'),
  ('11111111-1111-1111-1111-111111111111', 'visit.cancelled',      'whatsapp', '44444444-4444-4444-4444-444444444407', 0,     'candidate'),
  ('11111111-1111-1111-1111-111111111111', 'visit.declined',       'whatsapp', '44444444-4444-4444-4444-444444444407', 0,     'candidate')
on conflict (tenant_id, trigger, channel, audience) do nothing;

-- -----------------------------------------------------------------------------
-- POIs do campus
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

-- -----------------------------------------------------------------------------
-- Rota padrão e roteiro por curso
-- -----------------------------------------------------------------------------
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
-- Leads de exemplo
-- -----------------------------------------------------------------------------
insert into public.leads (id, tenant_id, campus_id, course_id, full_name, email, phone, source, status, consent_at, consent_source)
values
  ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333301', 'Ana Beatriz Souza',   'ana.souza@example.com',    '+5511987650001', 'site',      'novo',      now(), 'formulario_publico'),
  ('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333302', 'Bruno Lima',          'bruno.lima@example.com',   '+5511987650002', 'feira',     'contatado', now(), 'importacao'),
  ('77777777-7777-7777-7777-777777777703', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333304', 'Carla Menezes',       'carla.menezes@example.com','+5511987650003', 'indicacao', 'novo',      now(), 'manual'),
  ('77777777-7777-7777-7777-777777777704', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333303', 'Diego Fernandes',     'diego.f@example.com',      '+5511987650004', 'site',      'novo',      now(), 'formulario_publico'),
  ('77777777-7777-7777-7777-777777777705', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333305', 'Eduarda Castro',      'edu.castro@example.com',   '+5511987650005', 'instagram', 'novo',      now(), 'formulario_publico')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Tags
-- -----------------------------------------------------------------------------
insert into public.lead_tags (tenant_id, name, color)
values
  ('11111111-1111-1111-1111-111111111111', 'Feira de Profissões 2026', '#f59e0b'),
  ('11111111-1111-1111-1111-111111111111', 'Bolsa Mérito',             '#10b981'),
  ('11111111-1111-1111-1111-111111111111', 'Caravana Escolar',         '#8b5cf6')
on conflict (tenant_id, name) do nothing;

refresh materialized view public.mv_leads_daily;
