import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const finance = readFileSync('server/routes/finance.ts', 'utf8');
const writer = readFileSync('server/services/collection-reconciliation.ts', 'utf8');
test('candidate linkage uses the exact transaction UUID written by the exception writer', () => {
  assert.match(writer, /args\.transactionId/);
  assert.match(finance, /p\.id::text = r\.internal_reference/);
  assert.match(finance, /fj\.source_type='collection' AND fj\.source_id=p\.id::text/);
});
test('candidate classification fails closed on missing or inconsistent provider facts', () => {
  for (const state of ['unlinked_transaction', 'invoice_reference_mismatch', 'transaction_not_confirmed', 'amount_or_currency_mismatch', 'journal_missing_or_duplicated', 'journal_unbalanced_or_incomplete', 'candidate_supported']) assert.ok(finance.includes(state));
  assert.match(finance, /r\.provider_amount_kes IS NULL/);
  assert.match(finance, /r\.provider_amount_kes <> r\.expected_amount_kes/);
});
test('candidate report is read-only and explicitly does not reconcile', () => {
  const start = finance.indexOf('financeRouter.get("/reconciliation/matching-candidates"');
  const end = finance.indexOf('financeRouter.get("/evidence-completeness"', start);
  const route = finance.slice(start, end);
  assert.doesNotMatch(route, /\.update\(|UPDATE\s+/i);
  assert.match(route, /candidate_supported is not a reconciliation decision/);
  assert.match(route, /mutationsPerformed: false/);
});
test('refund and payout evidence indicators are metadata-only', () => {
  assert.match(finance, /with_provider_reference/);
  assert.match(finance, /with_provider_outcome/);
  assert.match(finance, /with_submission_time/);
  assert.match(finance, /with_complete_reconciliation_evidence/);
  assert.match(finance, /with_provider_confirmation_time/);
  assert.match(finance, /with_payout_journal/);
  assert.match(finance, /No records are changed and no provider operation is initiated/);
});
test('both new routes are restricted to Admin and Owner and audit access', () => {
  assert.match(finance, /reconciliation\/matching-candidates", requireRole\("admin", "owner"\)/);
  assert.match(finance, /evidence-completeness", requireRole\("admin", "owner"\)/);
  assert.match(finance, /finance\.reconciliation_candidates_viewed/);
  assert.match(finance, /finance\.evidence_completeness_viewed/);
});
