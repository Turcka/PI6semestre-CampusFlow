#!/usr/bin/env node
/**
 * Cria usuários de desenvolvimento (admin, promotor, professor) com senha conhecida,
 * vincula cursos ao promotor, cria disponibilidade e gera slots.
 *
 * Uso (na raiz):
 *   npm run seed:users
 *
 * Credenciais padrão:
 *   admin@campusflow.local     / CampusFlow123!
 *   promotor@campusflow.local  / CampusFlow123!
 *   professor@campusflow.local / CampusFlow123!
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

config({ path: path.join(ROOT, 'apps', 'api', '.env') });
config({ path: path.join(ROOT, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CAMPUS_ID = '22222222-2222-2222-2222-222222222222';
const COURSE_EC = '33333333-3333-3333-3333-333333333302';
const COURSE_EQ = '33333333-3333-3333-3333-333333333301';
const PASSWORD = 'CampusFlow123!';

const USERS = [
  { email: 'admin@campusflow.local', fullName: 'Admin CampusFlow', role: 'admin' },
  { email: 'promotor@campusflow.local', fullName: 'Promotor Demo', role: 'promotor', courseIds: [COURSE_EC, COURSE_EQ] },
  { email: 'professor@campusflow.local', fullName: 'Professor Demo', role: 'professor', courseIds: [COURSE_EC] },
];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (apps/api/.env).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return (data.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureUser(spec) {
  let user = await findUserByEmail(spec.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        tenant_id: TENANT_ID,
        role: spec.role,
        full_name: spec.fullName,
      },
    });
    if (error) throw error;
    user = data.user;
    console.log(`+ criado ${spec.role}: ${spec.email}`);
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        tenant_id: TENANT_ID,
        role: spec.role,
        full_name: spec.fullName,
      },
    });
    console.log(`~ atualizado ${spec.role}: ${spec.email}`);
  }

  // Garante profile (trigger pode ter criado; upsert cobre falhas)
  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    tenant_id: TENANT_ID,
    full_name: spec.fullName,
    email: spec.email,
    role: spec.role,
    is_active: true,
  });
  if (profileError) throw profileError;

  if (spec.role === 'promotor') {
    const { error } = await admin.from('promoter_profiles').upsert({
      profile_id: user.id,
      bio: 'Promotor de demonstração — Engenharia e tecnologia.',
      preferred_focus: ['tecnico'],
      experience_level: 4,
      max_visits_per_day: 6,
      accepts_auto_match: true,
    });
    if (error) throw error;

    await admin.from('promoter_courses').delete().eq('promoter_id', user.id);
    if (spec.courseIds?.length) {
      const { error: courseError } = await admin.from('promoter_courses').insert(
        spec.courseIds.map((courseId) => ({
          promoter_id: user.id,
          course_id: courseId,
          familiarity: 5,
        })),
      );
      if (courseError) throw courseError;
    }

    // Interesses alinhados ao seed (tecnologia, carros, laboratorios) se existirem
    const { data: categories } = await admin
      .from('interest_categories')
      .select('id, slug')
      .eq('tenant_id', TENANT_ID)
      .in('slug', ['tecnologia', 'carros', 'laboratorios']);
    if (categories?.length) {
      await admin.from('promoter_interests').delete().eq('promoter_id', user.id);
      await admin.from('promoter_interests').insert(
        categories.map((c) => ({ promoter_id: user.id, category_id: c.id, level: 5 })),
      );
    }

    // Disponibilidade: seg–sex 09:00–17:00
    await admin.from('availability_rules').delete().eq('owner_id', user.id).eq('campus_id', CAMPUS_ID);
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({
      tenant_id: TENANT_ID,
      owner_id: user.id,
      campus_id: CAMPUS_ID,
      weekday,
      start_time: '09:00:00',
      end_time: '17:00:00',
      slot_duration_minutes: 60,
      capacity: 1,
      is_active: true,
    }));
    const { error: rulesError } = await admin.from('availability_rules').insert(rules);
    if (rulesError) throw rulesError;

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    const { data: inserted, error: slotsError } = await admin.rpc('generate_visit_slots', {
      p_tenant_id: TENANT_ID,
      p_from: from.toISOString().slice(0, 10),
      p_to: to.toISOString().slice(0, 10),
      p_owner_id: user.id,
    });
    if (slotsError) {
      console.warn(`! generate_visit_slots: ${slotsError.message}`);
    } else {
      console.log(`  slots gerados: ${inserted ?? 0}`);
    }
  }

  if (spec.role === 'professor') {
    const { error } = await admin.from('professor_profiles').upsert({
      profile_id: user.id,
      area: 'Engenharia de Computação',
      topics: ['algoritmos', 'sistemas', 'laboratórios'],
      accepts_visits: true,
      is_substitute: true,
    });
    if (error) throw error;
    await admin.from('professor_courses').delete().eq('professor_id', user.id);
    if (spec.courseIds?.length) {
      const { error: courseError } = await admin.from('professor_courses').insert(
        spec.courseIds.map((courseId) => ({ professor_id: user.id, course_id: courseId, is_primary: true })),
      );
      if (courseError) throw courseError;
    }

    await admin.from('availability_rules').delete().eq('owner_id', user.id).eq('campus_id', CAMPUS_ID);
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({
      tenant_id: TENANT_ID,
      owner_id: user.id,
      campus_id: CAMPUS_ID,
      weekday,
      start_time: '10:00:00',
      end_time: '16:00:00',
      slot_duration_minutes: 60,
      capacity: 1,
      is_active: true,
    }));
    const { error: rulesError } = await admin.from('availability_rules').insert(rules);
    if (rulesError) throw rulesError;

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    const { error: slotsError } = await admin.rpc('generate_visit_slots', {
      p_tenant_id: TENANT_ID,
      p_from: from.toISOString().slice(0, 10),
      p_to: to.toISOString().slice(0, 10),
      p_owner_id: user.id,
    });
    if (slotsError) console.warn(`! generate_visit_slots professor: ${slotsError.message}`);
    await admin.from('visit_slots').update({ owner_role: 'professor' }).eq('owner_id', user.id);
  }

  return user;
}

async function main() {
  console.log('Seed de usuários de desenvolvimento…');
  for (const spec of USERS) {
    await ensureUser(spec);
  }
  console.log('\nPronto. Faça login em http://localhost:5173/login com:');
  for (const u of USERS) {
    console.log(`  ${u.email}  /  ${PASSWORD}  (${u.role})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
