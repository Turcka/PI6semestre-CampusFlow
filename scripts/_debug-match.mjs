import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query('begin');

const TENANT = '11111111-1111-1111-1111-111111111111';
const CAMPUS = '22222222-2222-2222-2222-222222222222';
const COURSE = '33333333-3333-3333-3333-333333333301';
const CAND = '77777777-7777-7777-7777-777777777701';
const PROM = '99999999-9999-9999-9999-999999999902';

await c.query(
  `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
   values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2@maua.br','x',now(),'{}',$2,now(),now())`,
  [PROM, JSON.stringify({ tenant_id: TENANT, role: 'promotor', full_name: 'P2' })],
);
await c.query('insert into public.promoter_courses (promoter_id, course_id, familiarity) values ($1,$2,5)', [
  PROM,
  COURSE,
]);
for (let wd = 0; wd <= 6; wd++) {
  await c.query(
    `insert into public.availability_rules (tenant_id, owner_id, campus_id, weekday, start_time, end_time, slot_duration_minutes, capacity)
     values ($1,$2,$3,$4,'09:00','11:00',60,1)`,
    [TENANT, PROM, CAMPUS, wd],
  );
}
const gen = await c.query(
  'select public.generate_visit_slots($1,(current_date+2)::date,(current_date+4)::date) as n',
  [TENANT],
);
console.log('slots generated', gen.rows[0].n);
const slots = await c.query(
  'select id, starts_at, ends_at from public.visit_slots where owner_id=$1 order by starts_at limit 1',
  [PROM],
);
console.log('slot', slots.rows[0]);
await c.query(
  `update public.candidates set profile_completed_at=now(), preferred_focus='tecnico', course_id=$2,
   behavioral_profile='{"perfil_tecnico":0.7}'::jsonb where id=$1`,
  [CAND, COURSE],
);
const w = `[${slots.rows[0].starts_at.toISOString()},${slots.rows[0].ends_at.toISOString()})`;
console.log('window', w);

const dbg = await c.query(
  `select p.id, pp.accepts_auto_match,
    exists (
      select 1 from visit_slots s
      where s.owner_id=p.id and s.is_open and s.booked_count < s.capacity
        and s.starts_at=lower($1::tstzrange) and s.ends_at=upper($1::tstzrange)
    ) as slot_ok,
    exists (select 1 from promoter_courses pc where pc.promoter_id=p.id and pc.course_id=$2) as course_ok,
    public._match_course_affinity(p.id, $2) as course_aff,
    lower($1::tstzrange) as lo, upper($1::tstzrange) as hi,
    (select starts_at from visit_slots where owner_id=p.id order by starts_at limit 1) as slot_start
  from profiles p join promoter_profiles pp on pp.profile_id=p.id
  where p.id=$3`,
  [w, COURSE, PROM],
);
console.log('dbg', dbg.rows[0]);

const r = await c.query('select * from public.run_promoter_match($1, $2::tstzrange)', [CAND, w]);
console.log('run', r.rows[0].status, r.rows[0].id);
const res = await c.query('select promoter_id, score, is_eligible, ineligibility_reason, is_selected from match_results where run_id=$1', [
  r.rows[0].id,
]);
console.log('results', res.rows);

await c.query('rollback');
await c.end();
