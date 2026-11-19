import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');
const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
let Client;
let client;
let schema;

before(async () => {
  if (!enabled) return;
  ({ Client } = await import('pg'));
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  schema = `r4m_audit_test_${randomBytes(8).toString('hex')}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}, public`);
  await client.query(`
    CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid,
      action text NOT NULL,
      resource_type text NOT NULL,
      resource_id uuid,
      outcome text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const migration = await readFile(resolve(projectRoot, 'server/db/migrations/0017_admin_audit_immutability.sql'), 'utf8');
  await client.query(migration);
});

after(async () => {
  if (!enabled || !client) return;
  await client.query(`DROP SCHEMA ${schema} CASCADE`);
  await client.end();
});

test('audit migration installs UPDATE, DELETE and TRUNCATE protection on a disposable PostgreSQL schema', { skip: !enabled }, async () => {
  const auditId = randomUUID();
  await client.query(`INSERT INTO audit_events(id, action, resource_type, outcome) VALUES ($1, 'test.insert', 'test', 'success')`, [auditId]);
  const triggers = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'audit_events'::regclass AND NOT tgisinternal
    ORDER BY tgname
  `);
  assert.deepEqual(triggers.rows.map(row => row.tgname), [
    'audit_events_no_delete', 'audit_events_no_truncate', 'audit_events_no_update'
  ]);
});

test('audit UPDATE is rejected with SQLSTATE 55000', { skip: !enabled }, async () => {
  const row = await client.query(`INSERT INTO audit_events(action, resource_type, outcome) VALUES ('test.update', 'test', 'success') RETURNING id`);
  await assert.rejects(
    client.query(`UPDATE audit_events SET outcome='changed' WHERE id=$1`, [row.rows[0].id]),
    error => error.code === '55000' && /append-only/.test(error.message)
  );
  const unchanged = await client.query(`SELECT outcome FROM audit_events WHERE id=$1`, [row.rows[0].id]);
  assert.equal(unchanged.rows[0].outcome, 'success');
});

test('audit DELETE is rejected with SQLSTATE 55000', { skip: !enabled }, async () => {
  const row = await client.query(`INSERT INTO audit_events(action, resource_type, outcome) VALUES ('test.delete', 'test', 'success') RETURNING id`);
  await assert.rejects(
    client.query(`DELETE FROM audit_events WHERE id=$1`, [row.rows[0].id]),
    error => error.code === '55000' && /append-only/.test(error.message)
  );
  const retained = await client.query(`SELECT count(*)::int AS count FROM audit_events WHERE id=$1`, [row.rows[0].id]);
  assert.equal(retained.rows[0].count, 1);
});

test('audit TRUNCATE is rejected with SQLSTATE 55000 and preserves rows', { skip: !enabled }, async () => {
  const beforeCount = await client.query(`SELECT count(*)::int AS count FROM audit_events`);
  await assert.rejects(
    client.query('TRUNCATE TABLE audit_events'),
    error => error.code === '55000' && /append-only/.test(error.message)
  );
  const afterCount = await client.query(`SELECT count(*)::int AS count FROM audit_events`);
  assert.equal(afterCount.rows[0].count, beforeCount.rows[0].count);
});

test('audit inserts remain permitted after append-only migration', { skip: !enabled }, async () => {
  const inserted = await client.query(`INSERT INTO audit_events(action, resource_type, outcome) VALUES ('test.append', 'test', 'success') RETURNING id`);
  assert.ok(inserted.rows[0].id);
});
