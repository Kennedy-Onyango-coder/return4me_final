import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const claims = read('server/routes/claims.ts');
const agents = read('server/routes/agents.ts');
const agentOps = read('server/routes/agent-operations.ts');
const auth = read('server/routes/auth.ts');
const policy = read('shared/admin-step-up-policy.mjs');
const sql = read('server/db/migrations/0017_admin_audit_immutability.sql');
const journal = JSON.parse(read('server/db/migrations/meta/_journal.json'));
const cases = [
  () => assert.match(claims, /claimantId === req\.auth!\.id\) return fail\(403/),
  () => assert.match(claims, /authorityVerifiedBy === req\.auth!\.id/),
  () => assert.match(claims, /reviewerId: claimEvidence\.reviewerId/),
  () => assert.match(claims, /item\.reviewerId === req\.auth!\.id/),
  () => assert.match(claims, /row\.evidence\.reviewerId === req\.auth!\.id/),
  () => assert.match(claims, /consumeStepUpGrantInTransaction\(tx, req\.auth!, "admin\.claim\.authority\.review"\)/),
  () => assert.match(claims, /consumeStepUpGrantInTransaction\(tx, req\.auth!, "admin\.claim\.ownership\.review"\)/),
  () => assert.match(agents, /verificationNote: z\.string\(\)\.trim\(\)\.min\(10\)/),
  () => assert.match(agents, /consumeStepUpGrantInTransaction\(tx, req\.auth!, "admin\.agent\.service_phone\.verify"\)/),
  () => assert.match(agentOps, /consumeStepUpGrantWithPgClient\(c, req\.auth!, "admin\.claim\.collection_identity\.check"\)/),
  () => assert.match(agentOps, /identity_checked_by === req\.auth!\.id/),
  () => assert.match(agentOps, /consumeStepUpGrantWithPgClient\(c, req\.auth!, "admin\.claim\.collection_code\.issue"\)/),
  () => assert.match(agents, /consumeStepUpGrantInTransaction\(tx, req\.auth!, "admin\.agent\.dropoff_code\.issue"\)/),
  () => assert.ok(['admin.claim.authority.review','admin.claim.ownership.review','admin.agent.service_phone.verify','admin.claim.collection_identity.check','admin.claim.collection_code.issue','admin.agent.dropoff_code.issue'].every(x => auth.includes(x) && policy.includes(x))),
  () => assert.match(sql, /BEFORE UPDATE ON audit_events/),
  () => assert.match(sql, /BEFORE DELETE ON audit_events/),
  () => assert.match(sql, /BEFORE TRUNCATE ON audit_events/),
  () => assert.ok(journal.entries.some(x => x.tag === '0017_admin_audit_immutability')),
];
for (const test of cases) test();
console.log(`Batch 52-54 focused tests passed (${cases.length}/${cases.length}).`);
