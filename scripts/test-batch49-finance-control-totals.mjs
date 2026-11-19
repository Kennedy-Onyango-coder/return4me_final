import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const finance = readFileSync('server/routes/finance.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
test('control totals aggregate each operational stream without row-level PII', () => {
  assert.match(finance, /FROM reconciliation_items GROUP BY source,status/);
  assert.match(finance, /FROM refund_requests GROUP BY status/);
  assert.match(finance, /FROM payout_requests GROUP BY status/);
  assert.match(finance, /FROM provider_operation_outbox GROUP BY operation_type,status/);
  assert.match(finance, /FROM payment_transactions GROUP BY status/);
});
test('period close report remains preparation-only and fail-closed', () => {
  assert.match(finance, /readyForClose: false/);
  assert.match(finance, /periodClosePerformed: false/);
  assert.match(finance, /independentFinanceApprovalRequired: true/);
  assert.match(finance, /does not close an accounting period/);
  assert.match(finance, /countsMayOverlap: true/);
  assert.match(finance, /best_effort_non_transactional/);
});
test('control-total reads are audited and restricted to Admin/Owner', () => {
  assert.match(finance, /reconciliation\/control-totals", requireRole\("admin", "owner"\)/);
  assert.match(finance, /finance\.reconciliation_control_totals_viewed/);
});
test('Admin UI displays the period-close blockers and does not expose execution', () => {
  assert.match(app, /Finance reconciliation and period-close preparation/);
  assert.match(app, /data\.periodClosePreparation\.blockers/);
  assert.match(app, /Period close is not authorised or performed by this report/);
});
test('control report does not introduce settlement or provider mutations', () => {
  const start = finance.indexOf('financeRouter.get("/reconciliation/control-totals"');
  assert.notEqual(start, -1, 'control-totals route must exist');
  const nextRoute = finance.indexOf('\nfinanceRouter.', start + 1);
  const end = nextRoute === -1 ? finance.length : nextRoute;
  const route = finance.slice(start, end);
  assert.doesNotMatch(route, /\.update\s*\(/);
  assert.doesNotMatch(route, /\.insert\s*\((refundRequests|payoutRequests|settlements|providerOperationOutbox)\b/);
  assert.doesNotMatch(route, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:refund_requests|payout_requests|settlements|provider_operation_outbox)\b/i);
  assert.match(route, /readOnly: true/);
});
