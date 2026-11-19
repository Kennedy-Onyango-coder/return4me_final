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
let first;
let second;
let schema;
let userId;
let otherUserId;
let sessionId;
let otherSessionId;

before(async () => {
  if (!enabled) return;
  ({ Client } = await import('pg'));
  first = new Client({ connectionString: databaseUrl });
  second = new Client({ connectionString: databaseUrl });
  await first.connect();
  await second.connect();
  schema = `r4m_test_${randomBytes(8).toString('hex')}`;
  await first.query(`CREATE SCHEMA ${schema}`);
  for (const client of [first, second]) await client.query(`SET search_path TO ${schema}, public`);

  // Minimal parent fixtures, followed by the actual repository migrations.
  await first.query(`
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE documents (id uuid PRIMARY KEY);
    CREATE TABLE user_sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id));
    CREATE TABLE admin_step_up_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      session_id uuid NOT NULL REFERENCES user_sessions(id),
      purpose text NOT NULL,
      consumed_at timestamptz,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const providerMigration = await readFile(resolve(projectRoot, 'server/db/migrations/0015_provider_operation_outbox.sql'), 'utf8');
  const documentMigration = await readFile(resolve(projectRoot, 'server/db/migrations/0016_document_storage_deletion_outbox.sql'), 'utf8');
  await first.query(providerMigration);
  await first.query(documentMigration);

  userId = randomUUID();
  otherUserId = randomUUID();
  sessionId = randomUUID();
  otherSessionId = randomUUID();
  await first.query('INSERT INTO users(id) VALUES ($1),($2)', [userId, otherUserId]);
  await first.query('INSERT INTO user_sessions(id,user_id) VALUES ($1,$2),($3,$4)', [sessionId, userId, otherSessionId, otherUserId]);
});

after(async () => {
  if (!enabled || !first) return;
  await second.end();
  await first.query(`DROP SCHEMA ${schema} CASCADE`);
  await first.end();
});

function insertGrant(client, { user = userId, session = sessionId, purpose = 'refund.execute', expires = "now()+interval '5 minutes'" } = {}) {
  return client.query(`INSERT INTO admin_step_up_grants(user_id,session_id,purpose,expires_at)
    VALUES ($1,$2,$3,${expires}) RETURNING id`, [user, session, purpose]);
}

test('actual migrations create constrained outbox tables and indexes', { skip: !enabled }, async () => {
  const provider = await first.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=$1 AND table_name='provider_operation_outbox'`, [schema]);
  const deletion = await first.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=$1 AND table_name='document_storage_deletion_outbox'`, [schema]);
  assert.ok(provider.rows.some(row => row.column_name === 'idempotency_key'));
  assert.ok(provider.rows.some(row => row.column_name === 'requested_by'));
  assert.ok(deletion.rows.some(row => row.column_name === 'storage_key'));
  await assert.rejects(first.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status)
    VALUES ('wire','${randomUUID()}','bad-operation',$1,'reserved')`, [userId]), error => error.code === '23514');
});

test('step-up consumption and provider reservation roll back atomically', { skip: !enabled }, async () => {
  const grant = await insertGrant(first);
  await first.query('BEGIN');
  await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='refund.execute' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [grant.rows[0].id, userId, sessionId]);
  await first.query(`UPDATE admin_step_up_grants SET consumed_at=now() WHERE id=$1`, [grant.rows[0].id]);
  await first.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status)
    VALUES ('refund',$1,'idem-rollback',$2,'reserved')`, [randomUUID(), userId]);
  await first.query('ROLLBACK');
  const state = await first.query('SELECT consumed_at FROM admin_step_up_grants WHERE id=$1', [grant.rows[0].id]);
  const outbox = await first.query("SELECT count(*)::int AS n FROM provider_operation_outbox WHERE idempotency_key='idem-rollback'");
  assert.equal(state.rows[0].consumed_at, null);
  assert.equal(outbox.rows[0].n, 0);
});

test('committed reservation consumes grant and unique idempotency prevents duplicate rows', { skip: !enabled }, async () => {
  const grant = await insertGrant(first, { purpose: 'payout.execute' });
  await first.query('BEGIN');
  const locked = await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='payout.execute' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [grant.rows[0].id, userId, sessionId]);
  assert.equal(locked.rowCount, 1);
  await first.query('UPDATE admin_step_up_grants SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL', [grant.rows[0].id]);
  await first.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status)
    VALUES ('payout',$1,'idem-commit',$2,'reserved')`, [randomUUID(), userId]);
  await first.query('COMMIT');
  await assert.rejects(first.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status)
    VALUES ('payout',$1,'idem-commit',$2,'reserved')`, [randomUUID(), userId]), error => error.code === '23505');
  const state = await first.query('SELECT consumed_at FROM admin_step_up_grants WHERE id=$1', [grant.rows[0].id]);
  assert.ok(state.rows[0].consumed_at);
});

test('grant is rejected for wrong user, session, purpose and expiry', { skip: !enabled }, async () => {
  const valid = await insertGrant(first, { purpose: 'document.delete' });
  const wrongSession = await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='document.delete' AND consumed_at IS NULL AND expires_at>now()`, [valid.rows[0].id, userId, otherSessionId]);
  const wrongPurpose = await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='document.review' AND consumed_at IS NULL AND expires_at>now()`, [valid.rows[0].id, userId, sessionId]);
  const wrongUser = await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='document.delete' AND consumed_at IS NULL AND expires_at>now()`, [valid.rows[0].id, otherUserId, sessionId]);
  assert.equal(wrongSession.rowCount, 0);
  assert.equal(wrongPurpose.rowCount, 0);
  assert.equal(wrongUser.rowCount, 0);
  const expired = await insertGrant(first, { purpose: 'document.delete', expires: "now()-interval '1 second'" });
  const expiredMatch = await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND consumed_at IS NULL AND expires_at>now()`, [expired.rows[0].id]);
  assert.equal(expiredMatch.rowCount, 0);
});

test('concurrent grant consumers serialize and only one can consume the grant', { skip: !enabled }, async () => {
  const grant = await insertGrant(first, { purpose: 'document.delete' });
  await first.query('BEGIN');
  await second.query('BEGIN');
  const firstLock = await first.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='document.delete' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [grant.rows[0].id, userId, sessionId]);
  assert.equal(firstLock.rowCount, 1);
  const waitingConsumer = second.query(`SELECT id FROM admin_step_up_grants WHERE id=$1 AND user_id=$2 AND session_id=$3
    AND purpose='document.delete' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [grant.rows[0].id, userId, sessionId]);
  await first.query('UPDATE admin_step_up_grants SET consumed_at=now() WHERE id=$1', [grant.rows[0].id]);
  await first.query('COMMIT');
  const secondLock = await waitingConsumer;
  assert.equal(secondLock.rowCount, 0);
  await second.query('COMMIT');
});

test('stale provider operations become unknown once and are never automatically retried', { skip: !enabled }, async () => {
  const idempotencyKey = `idem-stale-${randomUUID()}`;
  await first.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status,created_at)
    VALUES ('refund',$1,$2,$3,'dispatching',now()-interval '10 minutes')`, [randomUUID(), idempotencyKey, userId]);
  const recover = () => first.query(`WITH stale AS (
      SELECT id FROM provider_operation_outbox WHERE status IN ('reserved','dispatching')
      AND COALESCE(dispatch_started_at,created_at)<now()-interval '5 minutes'
      ORDER BY COALESCE(dispatch_started_at,created_at) LIMIT 10 FOR UPDATE SKIP LOCKED
    ) UPDATE provider_operation_outbox o SET status='unknown',updated_at=now()
      FROM stale WHERE o.id=stale.id RETURNING o.status`);
  const recovered = await recover();
  assert.equal(recovered.rowCount, 1);
  assert.equal(recovered.rows[0].status, 'unknown');
  const secondSweep = await recover();
  assert.equal(secondSweep.rowCount, 0);
  const unchanged = await first.query('SELECT status,attempt_count FROM provider_operation_outbox WHERE idempotency_key=$1', [idempotencyKey]);
  assert.equal(unchanged.rows[0].status, 'unknown');
  assert.equal(unchanged.rows[0].attempt_count, 0);
});

test('unknown provider outcomes cannot be claimed by the stale-operation recovery sweep', { skip: !enabled }, async () => {
  const key = `idem-unknown-${randomUUID()}`;
  await first.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status,created_at)
    VALUES ('payout',$1,$2,$3,'unknown',now()-interval '1 hour')`, [randomUUID(), key, userId]);
  const sweep = await first.query(`WITH stale AS (
      SELECT id FROM provider_operation_outbox WHERE status IN ('reserved','dispatching')
      AND COALESCE(dispatch_started_at,created_at)<now()-interval '5 minutes'
      FOR UPDATE SKIP LOCKED
    ) UPDATE provider_operation_outbox o SET status='unknown',updated_at=now() FROM stale WHERE o.id=stale.id RETURNING o.id`);
  assert.equal(sweep.rowCount, 0);
  const row = await first.query('SELECT status,attempt_count FROM provider_operation_outbox WHERE idempotency_key=$1', [key]);
  assert.equal(row.rows[0].status, 'unknown');
  assert.equal(row.rows[0].attempt_count, 0);
});

test('document deletion jobs deduplicate keys and reach bounded dead state', { skip: !enabled }, async () => {
  const documentId = randomUUID();
  await first.query('INSERT INTO documents(id) VALUES ($1)', [documentId]);
  await first.query('INSERT INTO document_storage_deletion_outbox(document_id,storage_key) VALUES ($1,$2)', [documentId, 'private/key']);
  await first.query('INSERT INTO document_storage_deletion_outbox(document_id,storage_key) VALUES ($1,$2) ON CONFLICT(document_id,storage_key) DO NOTHING', [documentId, 'private/key']);
  const count = await first.query('SELECT count(*)::int AS n FROM document_storage_deletion_outbox WHERE document_id=$1', [documentId]);
  assert.equal(count.rows[0].n, 1);
  await first.query("UPDATE document_storage_deletion_outbox SET attempt_count=8,status='dead' WHERE document_id=$1", [documentId]);
  const dead = await first.query('SELECT status,attempt_count FROM document_storage_deletion_outbox WHERE document_id=$1', [documentId]);
  assert.equal(dead.rows[0].status, 'dead');
  assert.equal(dead.rows[0].attempt_count, 8);
});

test('expired document-worker leases are recoverable while fresh leases stay processing', { skip: !enabled }, async () => {
  const oldDocumentId = randomUUID();
  const freshDocumentId = randomUUID();
  await first.query('INSERT INTO documents(id) VALUES ($1),($2)', [oldDocumentId, freshDocumentId]);
  await first.query(`INSERT INTO document_storage_deletion_outbox(document_id,storage_key,status,updated_at)
    VALUES ($1,'private/old','processing',now()-interval '10 minutes'),($2,'private/fresh','processing',now())`, [oldDocumentId, freshDocumentId]);
  const recovered = await first.query(`UPDATE document_storage_deletion_outbox SET status='retry',next_attempt_at=now(),
    last_error_code='worker_lease_expired',updated_at=now() WHERE status='processing' AND updated_at<now()-interval '5 minutes' RETURNING document_id`);
  assert.equal(recovered.rowCount, 1);
  assert.equal(recovered.rows[0].document_id, oldDocumentId);
  const states = await first.query('SELECT document_id,status FROM document_storage_deletion_outbox WHERE document_id IN ($1,$2)', [oldDocumentId, freshDocumentId]);
  assert.equal(states.rows.find(row => row.document_id === oldDocumentId).status, 'retry');
  assert.equal(states.rows.find(row => row.document_id === freshDocumentId).status, 'processing');
});

if (!enabled) console.log('PostgreSQL integration tests skipped: set TEST_DATABASE_URL to a disposable PostgreSQL database.');
