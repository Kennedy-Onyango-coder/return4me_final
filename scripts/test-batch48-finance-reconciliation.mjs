import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const finance = readFileSync('server/routes/finance.ts', 'utf8');
const admin = readFileSync('server/routes/admin.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
test('ledger overview is read-only, aggregated and audited', () => {
  assert.match(finance, /GROUP BY account_code/);
  assert.match(finance, /LEFT JOIN financial_postings/);
  assert.match(finance, /finance\.ledger_reconciliation_overview_viewed/);
  assert.match(finance, /No ledger data was changed/);
});
test('unbalanced and empty journals are surfaced as exceptions', () => {
  assert.match(finance, /HAVING COUNT\(p\.id\)=0 OR ABS\(COALESCE\(SUM\(p\.debit_kes\),0\)-COALESCE\(SUM\(p\.credit_kes\),0\)\) > 0\.005/);
});
test('settlement policy review compares the approved split without rewriting snapshots', () => {
  assert.match(finance, /finder_percent<>33 OR agent_percent<>25 OR platform_percent<>42/);
  assert.match(finance, /historicalSnapshotsRewritten: false/);
  assert.match(finance, /Historical settlement allocations are immutable snapshots/);
  assert.doesNotMatch(finance, /UPDATE\s+settlements\s+SET\s+(finder|agent|platform)_/i);
});
test('approval history makes pending expiry state visible', () => {
  assert.match(admin, /expires_within_6_hours/);
  assert.match(admin, /expiresInMinutes/);
  assert.match(app, /expiryState/);
});
test('Admin UI displays account summaries and allocation differences', () => {
  assert.match(app, /Ledger account balances/);
  assert.match(app, /Ledger journal exceptions/);
  assert.match(app, /Settlement allocation policy review/);
  assert.match(app, /providerOperations,ledgerOverview,settlementPolicyReview/);
});
