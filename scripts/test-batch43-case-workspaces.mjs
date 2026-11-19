import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const admin = readFileSync(new URL('../server/routes/admin.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const claims = readFileSync(new URL('../server/routes/claims.ts', import.meta.url), 'utf8');
const stepUp = readFileSync(new URL('../shared/admin-step-up-policy.mjs', import.meta.url), 'utf8');
test('dispute narrative is fetched through an Admin/Owner detail route', () => {
  assert.match(admin, /get\("\/disputes\/:disputeId",\s*requireRole\("admin",\s*"owner"\)/);
  assert.match(admin, /admin\.dispute_detail_viewed/);
});
test('appeal grounds are fetched through an Admin/Owner detail route', () => {
  assert.match(admin, /get\("\/appeals\/:appealId",\s*requireRole\("admin",\s*"owner"\)/);
  assert.match(admin, /admin\.appeal_detail_viewed/);
});
test('case queues omit private narrative fields', () => {
  const disputeQueue = admin.split('adminRouter.get("/disputes"')[1]?.split('adminRouter.get("/appeals"')[0] ?? '';
  const appealQueue = admin.split('adminRouter.get("/appeals"')[1]?.split('adminRouter.get("/disputes/:disputeId"')[0] ?? '';
  assert.ok(disputeQueue.length > 0);
  assert.ok(appealQueue.length > 0);
  assert.doesNotMatch(disputeQueue, /description: caseDisputes\.description|resolution: caseDisputes\.resolution/);
  assert.doesNotMatch(appealQueue, /grounds: claimAppeals\.grounds|reviewerNote: claimAppeals\.reviewerNote/);
});
test('detail access events are dedicated and do not copy narrative content', () => {
  assert.match(admin, /action: "admin\.dispute_detail_viewed", resourceType: "dispute", resourceId: id\.data, outcome: "success"/);
  assert.match(admin, /action: "admin\.appeal_detail_viewed", resourceType: "claim_appeal", resourceId: id\.data, outcome: "success"/);
});
test('legacy appeal queue is metadata-only and appeal decisions consume transaction-bound step-up', () => {
  const queue = claims.split('claimsRouter.get(\"/appeals/queue\"')[1]?.split('claimsRouter.patch(\"/appeals/:appealId/review\"')[0] ?? '';
  assert.ok(queue.length > 0);
  assert.doesNotMatch(queue, /grounds: claimAppeals\.grounds/);
  assert.match(claims, /requireStepUpInTransaction\(\"admin\.appeal\.review\"\)/);
  assert.match(claims, /consumeStepUpGrantInTransaction\(tx, req\.auth!, \"admin\.appeal\.review\"\)/);
  assert.match(stepUp, /admin\.appeal\.review/);
});
test('new workspace is read-only for case decisions and releases', () => {
  const workspace = ui.split('function CaseDetailWorkspaces()')[1]?.split('function AdminCapabilityMatrix()')[0] ?? '';
  assert.ok(workspace.length > 0);
  assert.doesNotMatch(workspace, /api(?:<[^>]+>)?\([^)]*\/(?:review|resolve|release|payout|settlement)/i);
});
