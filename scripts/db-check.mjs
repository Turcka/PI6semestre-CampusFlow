#!/usr/bin/env node
/**
 * Smoke test do banco CampusFlow: valida o motor de agendamento anti
 * double-booking, o evento padronizado (RF-04), a régua de comunicação (RF-05),
 * check-in e views. Tudo roda dentro de UMA transação finalizada com ROLLBACK,
 * portanto não deixa dados no banco.
 *
 * Uso: npm run db:check   (requer SUPABASE_DB_URL no .env e o seed aplicado)
 */
import 'dotenv/config';
import pg from 'pg';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL não definido.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});
await client.connect();

const q = (sql, params) => client.query(sql, params);
const ok = (label) => console.log('  [ok]', label);

// UUIDs fixos do seed.sql
const TENANT = '11111111-1111-1111-1111-111111111111';
const CAMPUS = '22222222-2222-2222-2222-222222222222';
const COURSE_EQ = '33333333-3333-3333-3333-333333333301';
const LEAD1 = '77777777-7777-7777-7777-777777777701';
const LEAD2 = '77777777-7777-7777-7777-777777777702';
const COORD_ID = '99999999-9999-9999-9999-999999999901';

try {
  await q('begin');

  // Inventário
  const { rows: tables } = await q(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`);
  const { rows: fns } = await q(`select count(*)::int as n from information_schema.routines where routine_schema='public'`);
  const { rows: pol } = await q(`select count(*)::int as n from pg_policies where schemaname='public'`);
  const { rows: rls } = await q(`select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity`);
  const { rows: cron } = await q(`select jobname, schedule from cron.job order by jobname`);
  const { rows: queues } = await q(`select queue_name from pgmq.list_queues()`);
  console.log(`Tabelas: ${tables[0].n} | Funções: ${fns[0].n} | Políticas RLS: ${pol[0].n} | Tabelas com RLS: ${rls[0].n}`);
  console.log('Cron jobs:', cron.map((c) => `${c.jobname} (${c.schedule})`).join(', '));
  console.log('Filas pgmq:', queues.map((r) => r.queue_name).join(', '));

  // 1. Usuário coordenador em auth.users -> trigger cria profile
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coord.teste@maua.br', 'x', now(),
             '{"provider":"email","providers":["email"]}', $2, now(), now())`,
    [COORD_ID, JSON.stringify({ tenant_id: TENANT, role: 'coordenador', full_name: 'Prof. Teste', phone: '+5511999990000' })],
  );
  const { rows: prof } = await q('select role from public.profiles where id=$1', [COORD_ID]);
  if (prof[0]?.role !== 'coordenador') throw new Error('profile não criado pelo trigger');
  ok('trigger handle_new_auth_user criou profile coordenador');

  await q('insert into public.coordinator_courses (coordinator_id, course_id) values ($1,$2)', [COORD_ID, COURSE_EQ]);

  // 2. Disponibilidade: todos os dias 09-11h, slots de 60 min, capacidade 1
  for (let wd = 0; wd <= 6; wd++) {
    await q(
      `insert into public.availability_rules (tenant_id, coordinator_id, campus_id, weekday, start_time, end_time, slot_duration_minutes, capacity)
       values ($1,$2,$3,$4,'09:00','11:00',60,1)`,
      [TENANT, COORD_ID, CAMPUS, wd],
    );
  }
  const { rows: gen } = await q(`select public.generate_visit_slots($1, (current_date + 2)::date, (current_date + 4)::date) as n`, [TENANT]);
  if (gen[0].n !== 6) throw new Error(`esperava 6 slots, gerou ${gen[0].n}`);
  ok(`generate_visit_slots gerou ${gen[0].n} slots (3 dias x 2)`);

  // 3. Slot sobreposto do mesmo coordenador deve ser rejeitado (EXCLUDE)
  const { rows: slots } = await q('select id, starts_at, ends_at from public.visit_slots where coordinator_id=$1 order by starts_at', [COORD_ID]);
  await q('savepoint sp1');
  try {
    await q(
      `insert into public.visit_slots (tenant_id, campus_id, coordinator_id, starts_at, ends_at)
       values ($1,$2,$3,$4::timestamptz + interval '30 minutes',$5::timestamptz + interval '30 minutes')`,
      [TENANT, CAMPUS, COORD_ID, slots[0].starts_at, slots[0].ends_at],
    );
    throw new Error('slot sobreposto foi aceito');
  } catch (e) {
    if (e.code !== '23P01') throw e;
    await q('rollback to savepoint sp1');
    ok('EXCLUDE visit_slots_no_overlap rejeitou slot sobreposto (23P01)');
  }

  // 4. available_slots (RF-02)
  const { rows: avail } = await q(`select * from public.available_slots($1, now(), now() + interval '10 days', $2)`, [CAMPUS, COURSE_EQ]);
  if (avail.length !== 6) throw new Error(`available_slots retornou ${avail.length}`);
  ok('available_slots lista 6 horários com vagas para o curso');

  // 5. book_visit (RF-03): primeira reserva ok, segunda no mesmo slot falha
  const slotId = slots[0].id;
  const { rows: v1 } = await q('select * from public.book_visit($1,$2)', [slotId, LEAD1]);
  if (v1[0].status !== 'pending_confirmation') throw new Error('status inesperado');
  ok('book_visit reservou (pending_confirmation)');

  await q('savepoint sp2');
  try {
    await q('select * from public.book_visit($1,$2)', [slotId, LEAD2]);
    throw new Error('double-booking aceito!');
  } catch (e) {
    if (e.message !== 'SLOT_UNAVAILABLE') throw e;
    await q('rollback to savepoint sp2');
    ok('book_visit bloqueou double-booking (SLOT_UNAVAILABLE)');
  }

  // 6. Evento padronizado (RF-04) + status do lead + job visit.created
  const { rows: ev } = await q('select * from public.calendar_events where visit_id=$1', [v1[0].id]);
  if (ev[0].title !== 'Visita Individual - Ana Beatriz Souza') throw new Error(`título: ${ev[0].title}`);
  ok(`calendar_event criado: "${ev[0].title}"`);
  const { rows: ld } = await q('select status from public.leads where id=$1', [LEAD1]);
  if (ld[0].status !== 'agendado') throw new Error('lead não mudou para agendado');
  ok('lead passou para status agendado');
  const { rows: j0 } = await q(`select trigger, to_address from public.message_jobs where visit_id=$1`, [v1[0].id]);
  if (!j0.some((j) => j.trigger === 'visit.created' && j.to_address === 'coord.teste@maua.br')) throw new Error('job visit.created não criado');
  ok('régua: e-mail "nova visita" agendado para o coordenador');

  // 7. Confirmação pelo professor -> confirmed + régua (RF-05)
  await q('select public.confirm_calendar_event($1, $2)', [ev[0].id, COORD_ID]);
  const { rows: v2 } = await q('select status from public.visits where id=$1', [v1[0].id]);
  if (v2[0].status !== 'confirmed') throw new Error('visita não confirmada');
  ok('confirm_calendar_event -> visita confirmed');
  const { rows: jobs } = await q(
    `select trigger, channel, payload->>'body' as body from public.message_jobs where visit_id=$1 and status='scheduled' order by run_at`,
    [v1[0].id],
  );
  console.log('     jobs agendados:', jobs.map((j) => `${j.trigger}/${j.channel}`).join(', '));
  const conf = jobs.find((j) => j.trigger === 'visit.confirmed' && j.channel === 'whatsapp');
  if (!conf || !conf.body.includes('Ana') || conf.body.includes('{{')) throw new Error('template não renderizado: ' + conf?.body);
  ok('template renderizado: ' + conf.body.slice(0, 70) + '...');

  // 8. Promoção para a fila pgmq
  const { rows: pr } = await q('select public.promote_due_message_jobs() as n');
  const { rows: qm } = await q(`select count(*)::int as n from pgmq.q_messages_outbound`);
  if (pr[0].n < 3 || qm[0].n < 3) throw new Error(`promote=${pr[0].n} fila=${qm[0].n}`);
  ok(`promote_due_message_jobs enfileirou ${pr[0].n} mensagens em pgmq`);

  // 9. Check-in fora da janela falha; cancelamento libera vaga e lembretes
  await q('savepoint sp3');
  try {
    await q('select public.check_in_visit($1, $2)', [v1[0].checkin_token, COORD_ID]);
    throw new Error('check-in fora da janela aceito');
  } catch (e) {
    if (e.message !== 'CHECKIN_OUT_OF_WINDOW') throw e;
    await q('rollback to savepoint sp3');
    ok('check_in_visit rejeitou fora da janela');
  }
  await q('select public.cancel_visit($1, $2)', [v1[0].id, 'teste']);
  const { rows: sl } = await q('select booked_count from public.visit_slots where id=$1', [slotId]);
  const { rows: jc } = await q(`select count(*)::int as n from public.message_jobs where visit_id=$1 and status='scheduled' and trigger::text like 'reminder%'`, [v1[0].id]);
  if (sl[0].booked_count !== 0 || jc[0].n !== 0) throw new Error('cancel não liberou vaga/lembretes');
  ok('cancel_visit liberou a vaga e cancelou lembretes');

  // 10. View pública do mapa
  const { rows: mp } = await q('select jsonb_array_length(pois) as pois, jsonb_array_length(routes) as routes from public.vw_public_campus_map where campus_id=$1', [CAMPUS]);
  ok(`vw_public_campus_map: ${mp[0].pois} POIs, ${mp[0].routes} rotas`);

  console.log('\nTodas as verificações passaram. ROLLBACK dos dados de teste.');
} catch (err) {
  console.error('\nFALHA:', err.message, err.detail ?? '');
  process.exitCode = 1;
} finally {
  await q('rollback').catch(() => {});
  await client.end();
}
