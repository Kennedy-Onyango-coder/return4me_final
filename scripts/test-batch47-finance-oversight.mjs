import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const finance = readFileSync('server/routes/finance.ts', 'utf8');
const admin = readFileSync('server/routes/admin.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
test('provider attention queue is bounded, filterable and does not retry', () => {
  assert.match(finance, /limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/);
  assert.match(finance, /staleAfterMinutes: z\.coerce\.number/);
  assert.match(finance, /automaticRetry: false/);
});
test('stale provider status is an attention indicator, not a failure assertion', () => {
  assert.match(finance, /stale is an attention indicator, not proof of provider failure/i);
  assert.match(finance, /ageMinutes/);
});
test('ledger queue supports bounded pagination and source filtering', () => {
  assert.match(finance, /sourceType: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(80\)\.optional\(\)/);
  assert.match(finance, /offset\(filters\.offset\)/);
});
test('approval history omits proposal payload and audits history access', () => {
  assert.match(admin, /action-approvals\/history/);
  assert.match(admin, /payloadExposed: false/);
  assert.match(admin, /admin\.action_approval_history_viewed/);
  assert.doesNotMatch(admin.slice(admin.indexOf('adminRouter.get("/action-approvals/history"'), admin.indexOf('adminRouter.post("/action-approvals/:id/review"')), /adminActionApprovals\.payload/);
});
test('approval history preserves maker and reviewer references', () => {
  assert.match(admin, /proposedBy: adminActionApprovals\.proposedBy/);
  assert.match(admin, /reviewedBy: adminActionApprovals\.reviewedBy/);
});
test('Admin UI displays approval history and provider staleness metadata', () => {
  assert.match(app, /Recent approval history/);
  assert.match(app, /Needs attention/);
});
