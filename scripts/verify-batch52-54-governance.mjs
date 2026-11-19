import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const claims = read('server/routes/claims.ts');
const agents = read('server/routes/agents.ts');
const agentOps = read('server/routes/agent-operations.ts');
const auth = read('server/routes/auth.ts');
const step = read('shared/admin-step-up-policy.mjs');
const ui = read('src/App.tsx');
const migration = read('server/db/migrations/0017_admin_audit_immutability.sql');
const checks = [
  ['representative-authority review requires purpose-specific step-up', /authority-review", requireRole\("admin", "trust_safety"\), \(req, res, next\) => requireStepUpInTransaction\("admin\.claim\.authority\.review"\)/.test(claims)],
  ['authority-review consumes grant inside its transaction', /consumeStepUpGrantInTransaction\(tx, req\.auth!, "admin\.claim\.authority\.review"\)/.test(claims)],
  ['ownership review requires purpose-specific step-up', claims.includes('claimsRouter.patch("/:id/review", requireRole("admin", "trust_safety"), (req, res, next) => requireStepUpInTransaction("admin.claim.ownership.review")')],
  ['ownership decision consumes grant inside transaction', /consumeStepUpGrantInTransaction\(tx, req\.auth!, "admin\.claim\.ownership\.review"\)/.test(claims)],
  ['evidence reviewer cannot also make final ownership approval', /item\.reviewerId === req\.auth!\.id/.test(claims)],
  ['Agent service-phone verification requires step-up', /service-phone", requireRole\("admin"\), \(req, res, next\) => requireStepUpInTransaction\("admin\.agent\.service_phone\.verify"\)/.test(agents)],
  ['service-phone update and audit are transaction-bound', /db\.transaction\(async tx =>[\s\S]*?admin\.agent_service_phone_verified/.test(agents)],
  ['claim collection identity check is step-up protected and audited in one PG transaction', agentOps.includes('requireStepUpInTransaction(\"admin.claim.collection_identity.check\")') && agentOps.includes('consumeStepUpGrantWithPgClient(c, req.auth!, \"admin.claim.collection_identity.check\")')],
  ['collection-code issuer must differ from identity checker', agentOps.includes('identity_checked_by === req.auth!.id')],
  ['claim collection-code issuance requires step-up', agentOps.includes('requireStepUpInTransaction(\"admin.claim.collection_code.issue\")') && agentOps.includes('consumeStepUpGrantWithPgClient(c, req.auth!, \"admin.claim.collection_code.issue\")')],
  ['Finder drop-off code issuance requires transaction-bound step-up', agents.includes('requireStepUpInTransaction(\"admin.agent.dropoff_code.issue\")') && agents.includes('consumeStepUpGrantInTransaction(tx, req.auth!, \"admin.agent.dropoff_code.issue\")')],
  ['all new purposes are supported by challenge mapping and policy', ['admin.claim.authority.review','admin.claim.ownership.review','admin.agent.service_phone.verify','admin.claim.collection_identity.check','admin.claim.collection_code.issue','admin.agent.dropoff_code.issue'].every(p => auth.includes(`"${p}"`) && step.includes(`"${p}"`))],
  ['Admin UI exposes all new step-up purposes', ['admin.claim.authority.review','admin.claim.ownership.review','admin.agent.service_phone.verify','admin.claim.collection_identity.check','admin.claim.collection_code.issue','admin.agent.dropoff_code.issue'].every(p => ui.includes(`value="${p}"`))],
  ['audit UPDATE, DELETE and TRUNCATE are rejected', ['BEFORE UPDATE ON audit_events','BEFORE DELETE ON audit_events','BEFORE TRUNCATE ON audit_events'].every(x => migration.includes(x))],
  ['audit mutation trigger raises a database exception', /RAISE EXCEPTION 'audit_events is append-only/.test(migration)],
  ['audit trigger function uses a constrained search_path', /SET search_path = pg_catalog, public/.test(migration)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
assert.ok(checks.every(([, ok]) => ok), 'Batch 52-54 governance source verification failed');
console.log(`Batch 52-54 source verification passed (${checks.length}/${checks.length}). Static checks only; no PostgreSQL migration/runtime acceptance performed.`);
