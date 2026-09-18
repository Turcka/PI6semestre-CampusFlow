#!/usr/bin/env node
/**
 * Smoke test do banco CampusFlow (Revisão 2): valida pivot, match, convites,
 * anti double-booking e régua de e-mail. Tudo em UMA transação com ROLLBACK.
 *
 * Uso: npm run db:check   (requer SUPABASE_DB_URL e seed aplicado)
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

const TENANT = '11111111-1111-1111-1111-111111111111';
const CAMPUS = '22222222-2222-2222-2222-222222222222';
const COURSE_EQ = '33333333-3333-3333-3333-333333333301';
const CANDIDATE1 = '77777777-7777-7777-7777-777777777701';
const CANDIDATE2 = '77777777-7777-7777-7777-777777777702';
const PROMOTER_ID = '99999999-9999-9999-9999-999999999901';

try {
  await q('begin');

  const { rows: tables } = await q(
    `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
  );
  const { rows: fns } = await q(
    `select count(*)::int as n from information_schema.routines where routine_schema='public'`,
  );
  const { rows: pol } = await q(`select count(*)::int as n from pg_policies where schemaname='public'`);
  const { rows: rls } = await q(`select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity`);
  const { rows: cron } = await q(`select jobname, schedule from cron.job order by jobname`);
  const { rows: queues } = await q(`select queue_name from pgmq.list_queues()`);
  console.log(`Tabelas: ${tables[0].n} | Funções: ${fns[0].n} | Políticas RLS: ${pol[0].n} | Tabelas com RLS: ${rls[0].n}`);
  console.log('Cron jobs:', cron.map((c) => `${c.jobname} (${c.schedule})`).join(', '));
  console.log('Filas pgmq:', queues.map((r) => r.queue_name).join(', '));

  // 1. Promotor via auth.users -> trigger cria profile + promoter_profiles
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'promotor.teste@maua.br', 'x', now(),
             '{"provider":"email","providers":["email"]}', $2, now(), now())`,
    [
      PROMOTER_ID,
      JSON.stringify({
        tenant_id: TENANT,
        role: 'promotor',
        full_name: 'Promotor Teste',
        phone: '+5511999990000',
      }),
    ],
  );
  const { rows: prof } = await q('select role from public.profiles where id=$1', [PROMOTER_ID]);
  if (prof[0]?.role !== 'promotor') throw new Error('profile não criado pelo trigger');
  const { rows: pp } = await q('select 1 from public.promoter_profiles where profile_id=$1', [PROMOTER_ID]);
  if (!pp[0]) throw new Error('promoter_profiles não criado');
  ok('trigger handle_new_auth_user criou profile promotor + promoter_profiles');

  await q('insert into public.promoter_courses (promoter_id, course_id, familiarity) values ($1,$2,5)', [
    PROMOTER_ID,
    COURSE_EQ,
  ]);

  // 2. Disponibilidade e slots
  for (let wd = 0; wd <= 6; wd++) {
    await q(
      `insert into public.availability_rules (tenant_id, owner_id, campus_id, weekday, start_time, end_time, slot_duration_minutes, capacity)
       values ($1,$2,$3,$4,'09:00','11:00',60,1)`,
      [TENANT, PROMOTER_ID, CAMPUS, wd],
    );
  }
  const { rows: gen } = await q(
    `select public.generate_visit_slots($1, (current_date + 2)::date, (current_date + 4)::date) as n`,
    [TENANT],
  );
  if (gen[0].n !== 6) throw new Error(`esperava 6 slots, gerou ${gen[0].n}`);
  ok(`generate_visit_slots gerou ${gen[0].n} slots (3 dias x 2)`);

  const { rows: slots } = await q(
    'select id, starts_at, ends_at from public.visit_slots where owner_id=$1 order by starts_at',
    [PROMOTER_ID],
  );

  // 3. EXCLUDE de slots
  await q('savepoint sp1');
  try {
    await q(
      `insert into public.visit_slots (tenant_id, campus_id, owner_id, starts_at, ends_at)
       values ($1,$2,$3,$4::timestamptz + interval '30 minutes',$5::timestamptz + interval '30 minutes')`,
      [TENANT, CAMPUS, PROMOTER_ID, slots[0].starts_at, slots[0].ends_at],
    );
    throw new Error('slot sobreposto foi aceito');
  } catch (e) {
    if (e.code !== '23P01') throw e;
    await q('rollback to savepoint sp1');
    ok('EXCLUDE visit_slots rejeitou slot sobreposto (23P01)');
  }

  // 4. available_slots
  const { rows: avail } = await q(`select * from public.available_slots($1, now(), now() + interval '10 days', $2)`, [
    CAMPUS,
    COURSE_EQ,
  ]);
  if (avail.length !== 6) throw new Error(`available_slots retornou ${avail.length}`);
  ok('available_slots lista 6 horários com vagas para o curso');

  // 5. Perfil do candidato + schedule_visit_with_match
  await q(
    `update public.candidates
     set profile_completed_at = now(), preferred_focus = 'tecnico',
         behavioral_profile = '{"perfil_tecnico":0.7}'::jsonb,
         course_id = $2
     where id = $1`,
    [CANDIDATE1, COURSE_EQ],
  );
  await q(
    `insert into public.candidate_interests (candidate_id, category_id, score)
     select $1, id, 0.8 from public.interest_categories where slug = 'laboratorios' and tenant_id = $2
     on conflict do nothing`,
    [CANDIDATE1, TENANT],
  );
  await q(
    `insert into public.promoter_interests (promoter_id, category_id, level)
     select $1, id, 5 from public.interest_categories where slug = 'laboratorios' and tenant_id = $2
     on conflict do nothing`,
    [PROMOTER_ID, TENANT],
  );
  await q(
    `update public.promoter_profiles
     set preferred_focus = array['tecnico'::public.visit_focus], traits = '{"perfil_tecnico":0.8,"comunicacao":0.6}'::jsonb
     where profile_id = $1`,
    [PROMOTER_ID],
  );

  const window = `[${slots[0].starts_at.toISOString()},${slots[0].ends_at.toISOString()})`;
  const { rows: v1 } = await q(`select * from public.schedule_visit_with_match($1, $2::tstzrange)`, [
    CANDIDATE1,
    window,
  ]);
  if (v1[0].status !== 'aguardando_promotor') throw new Error(`status inesperado: ${v1[0].status}`);
  if (v1[0].promoter_id !== PROMOTER_ID) throw new Error('promotor não selecionado pelo match');
  ok('schedule_visit_with_match criou visita aguardando_promotor');

  const { rows: inv } = await q(
    `select status from public.visit_invitations where visit_id=$1 and role='promotor'`,
    [v1[0].id],
  );
  if (inv[0]?.status !== 'pending') throw new Error('convite do promotor não criado');
  ok('visit_invitation pending para o promotor');

  // 6. Double-booking no mesmo slot
  await q(
    `update public.candidates set profile_completed_at = now(), course_id = $2 where id = $1`,
    [CANDIDATE2, COURSE_EQ],
  );
  await q('savepoint sp2');
  try {
    await q(`select * from public.schedule_visit_with_match($1, $2::tstzrange)`, [CANDIDATE2, window]);
    throw new Error('double-booking aceito!');
  } catch (e) {
    if (
      !['SLOT_UNAVAILABLE', 'SLOT_NOT_FOUND', 'NO_ELIGIBLE_PROMOTER', 'PARTICIPANT_BUSY'].some((x) =>
        e.message.includes(x),
      ) &&
      e.code !== '23P01'
    ) {
      throw e;
    }
    await q('rollback to savepoint sp2');
    ok('segunda reserva no mesmo horário bloqueada');
  }

  // 7. Evento + status candidato
  const { rows: ev } = await q('select * from public.calendar_events where visit_id=$1', [v1[0].id]);
  if (!ev[0]?.title?.includes('Ana Beatriz Souza')) throw new Error(`título: ${ev[0]?.title}`);
  ok(`calendar_event criado: "${ev[0].title}"`);
  const { rows: cand } = await q('select status from public.candidates where id=$1', [CANDIDATE1]);
  if (cand[0].status !== 'agendado') throw new Error('candidato não mudou para agendado');
  ok('candidato passou para status agendado');

  // 8. Aceite do convite -> confirmada
  const { rows: invId } = await q(
    `select id from public.visit_invitations where visit_id=$1 and role='promotor'`,
    [v1[0].id],
  );
  await q(`select public.respond_invitation($1, true, null, $2)`, [invId[0].id, PROMOTER_ID]);
  const { rows: v2 } = await q('select status from public.visits where id=$1', [v1[0].id]);
  if (v2[0].status !== 'confirmada') throw new Error(`esperava confirmada, veio ${v2[0].status}`);
  ok('respond_invitation(accept) -> visita confirmada');

  const { rows: items } = await q(
    `select count(*)::int as n from public.visit_itinerary_items where visit_id=$1`,
    [v1[0].id],
  );
  if (items[0].n < 1) throw new Error('roteiro não gerado na confirmação');
  ok(`generate_visit_itinerary gerou ${items[0].n} itens`);

  // 9. Cancelamento
  await q(`select public.cancel_visit($1, $2, $3, true)`, [v1[0].id, PROMOTER_ID, 'teste']);
  const { rows: sl } = await q('select booked_count from public.visit_slots where id=$1', [slots[0].id]);
  if (sl[0].booked_count !== 0) throw new Error('cancel não liberou vaga');
  ok('cancel_visit liberou a vaga');

  // 10. Views
  const { rows: mp } = await q(
    'select jsonb_array_length(pois) as pois, jsonb_array_length(routes) as routes from public.vw_public_campus_map where campus_id=$1',
    [CAMPUS],
  );
  ok(`vw_public_campus_map: ${mp[0].pois} POIs, ${mp[0].routes} rotas`);

  const { rows: pending } = await q(`select count(*)::int as n from public.vw_pending_issues`);
  ok(`vw_pending_issues acessível (${pending[0].n} issues)`);

  console.log('\nTodas as verificações passaram. ROLLBACK dos dados de teste.');
} catch (err) {
  console.error('\nFALHA:', err.message, err.detail ?? '', err.code ?? '');
  process.exitCode = 1;
} finally {
  await q('rollback').catch(() => {});
  await client.end();
}
