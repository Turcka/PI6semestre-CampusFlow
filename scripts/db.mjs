#!/usr/bin/env node
/**
 * Ferramenta de banco do CampusFlow (substitui a Supabase CLI quando ela não
 * está instalada). Aplica as migrações de supabase/migrations em ordem e,
 * opcionalmente, o seed.
 *
 * Uso:
 *   node scripts/db.mjs migrate          # aplica migrações pendentes
 *   node scripts/db.mjs seed             # aplica supabase/seed.sql
 *   node scripts/db.mjs status           # lista migrações aplicadas/pendentes
 *   node scripts/db.mjs reset --yes      # DESTRUTIVO: apaga o schema public e reaplica tudo
 *
 * Requer SUPABASE_DB_URL no .env da raiz (ou na variável de ambiente).
 * O histórico fica em public._migrations.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const SEED_FILE = path.join(ROOT, 'supabase', 'seed.sql');

const command = process.argv[2] ?? 'migrate';
const flags = new Set(process.argv.slice(3));

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL não definido. Configure no .env da raiz.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

async function ensureHistoryTable() {
  await client.query(`
    create table if not exists public._migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    );
  `);
}

async function listMigrationFiles() {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

async function appliedMigrations() {
  const { rows } = await client.query('select name, checksum from public._migrations order by name');
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

function checksum(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

async function runSqlFile(filePath, label) {
  const sql = await readFile(filePath, 'utf8');
  process.stdout.write(`-> ${label} ... `);
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log('ok');
    return sql;
  } catch (err) {
    await client.query('rollback');
    console.log('FALHOU');
    throw err;
  }
}

async function migrate() {
  await ensureHistoryTable();
  const files = await listMigrationFiles();
  const applied = await appliedMigrations();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await runSqlFile(path.join(MIGRATIONS_DIR, file), file);
    await client.query('insert into public._migrations (name, checksum) values ($1, $2)', [file, checksum(sql)]);
    count++;
  }

  console.log(count === 0 ? 'Nenhuma migração pendente.' : `${count} migração(ões) aplicada(s).`);
}

async function seed() {
  await runSqlFile(SEED_FILE, 'seed.sql');
}

async function status() {
  await ensureHistoryTable();
  const files = await listMigrationFiles();
  const applied = await appliedMigrations();
  for (const file of files) {
    console.log(`${applied.has(file) ? '[x]' : '[ ]'} ${file}`);
  }
}

async function reset() {
  if (!flags.has('--yes')) {
    console.error('reset é destrutivo. Confirme com: node scripts/db.mjs reset --yes');
    process.exit(1);
  }
  console.log('Removendo schema public, cron jobs e filas...');
  await client.query(`
    do $$
    declare r record;
    begin
      for r in select jobid from cron.job loop
        perform cron.unschedule(r.jobid);
      end loop;
    exception when undefined_table then null;
    end $$;
  `);
  await client.query(`
    do $$
    begin
      perform pgmq.drop_queue('messages_outbound');
    exception when others then null;
    end $$;
  `);
  await client.query('drop schema public cascade; create schema public;');
  await client.query('grant usage on schema public to postgres, anon, authenticated, service_role;');
  await client.query('grant all on schema public to postgres, service_role;');
  await client.query('alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;');
  await client.query('alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;');
  await client.query('alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;');
  await client.query('drop trigger if exists on_auth_user_created on auth.users;');
  await client.query(`delete from storage.objects where bucket_id in ('poi-photos','tenant-assets','lead-imports');`);
  await client.query(`delete from storage.buckets where id in ('poi-photos','tenant-assets','lead-imports');`);
  await migrate();
  await seed();
}

try {
  await client.connect();
  const { rows } = await client.query('select current_database() as db, version() as version');
  console.log(`Conectado a ${rows[0].db} (${rows[0].version.split(',')[0]})`);

  switch (command) {
    case 'migrate': await migrate(); break;
    case 'seed': await seed(); break;
    case 'status': await status(); break;
    case 'reset': await reset(); break;
    default:
      console.error(`Comando desconhecido: ${command}`);
      process.exit(1);
  }
} catch (err) {
  console.error('\nErro:', err.message);
  if (err.position) console.error('Posição no SQL:', err.position);
  if (err.detail) console.error('Detalhe:', err.detail);
  if (err.hint) console.error('Dica:', err.hint);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
