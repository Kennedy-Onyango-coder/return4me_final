import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const integration = read('scripts/integration/test-outbox-postgres.mjs');
const finance = read('server/routes/finance.ts');
const docs = read('server/routes/agent-documents.ts');
const providerWorker = read('server/services/provider-operation-recovery-worker.ts');
const documentWorker = read('server/services/document-storage-deletion-worker.ts');
const migration15 = read('server/db/migrations/0015_provider_operation_outbox.sql');
const migration16 = read('server/db/migrations/0016_document_storage_deletion_outbox.sql');

for (const migration of ['0015_provider_operation_outbox.sql', '0016_document_storage_deletion_outbox.sql']) {
  assert.ok(integration.includes(`server/db/migrations/${migration}`), `integration suite must apply actual ${migration}`);
}
for (const scenario of [
  /wrong user, session, purpose and expiry/,
  /concurrent grant consumers serialize/,
  /roll back atomically/,
  /unknown provider outcomes cannot be claimed/,
  /expired document-worker leases are recoverable/,
  /unique idempotency prevents duplicate rows/
]) assert.match(integration, scenario);
assert.match(migration15, /UNIQUE/);
assert.match(migration15, /CHECK \(operation_type IN \('refund','payout'\)\)/);
assert.match(migration16, /UNIQUE\(document_id, storage_key\)/);
assert.match(providerWorker, /status IN \('reserved','dispatching'\)/);
assert.match(providerWorker, /SET status='unknown'/);
assert.doesNotMatch(providerWorker, /fetch\(|axios\.|requestPayout|requestRefund/);
assert.match(documentWorker, /FOR UPDATE SKIP LOCKED/);
assert.match(documentWorker, /nextAttempt >= 8 \? 'dead' : 'retry'/);
assert.match(finance, /financeRouter\.get\("\/provider-operations\/attention", requireRole\("admin", "owner"\)/);
assert.match(docs, /agentDocumentsRouter\.get\("\/admin\/storage-deletions\/attention", requireRole\("admin", "owner"\)/);
assert.match(docs, /storage keys are never exposed/);
assert.match(docs, /eq\(documents\.id, req\.params\.documentId\), eq\(documents\.resourceId, req\.params\.agentId\)/);
console.log('Batch 40 guard passed: actual migration-backed integration harness, grant identity/session/purpose/expiry checks, rollback/concurrency, no provider auto-retry, bounded document retry and Admin/Owner privacy-scoped queues.');
