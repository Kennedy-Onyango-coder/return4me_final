# Batch 50 — Finance evidence matching and completeness

## Implemented

1. Added `GET /api/finance/reconciliation/matching-candidates`, restricted to Admin and Owner. It links collection exceptions to payment transactions using the exact transaction UUID persisted by `recordCollectionException()` in `reconciliation_items.internal_reference`. It then checks provider invoice binding, confirmed payment state, expected/provider/transaction amount equality in KES, and the immutable collection journal's presence and debit/credit balance.
2. Candidate states are explicit: `unlinked_transaction`, `invoice_reference_mismatch`, `transaction_not_confirmed`, `amount_or_currency_mismatch`, `journal_missing_or_duplicated`, `journal_unbalanced_or_incomplete`, and `candidate_supported`.
3. `candidate_supported` is only a read-only evidence candidate. It does not mark an item reconciled, resolve an exception, change a payment, post a journal, or authorize a period close. A human review with separately recorded evidence remains required.
4. Added `GET /api/finance/evidence-completeness`, restricted to Admin and Owner. It reports refund and payout evidence counts by status, including provider reference/outcome, submission/confirmation timestamps, refund reconciliation evidence, and payout journal presence.
5. Both routes record metadata-only audit events. They do not expose payer/beneficiary PII, destination ciphertext, provider payloads, or initiate provider calls.
6. Added source guards and Node-native tests and included them in `verify:all`.

## Safety and limitations

- No migration was added or applied.
- No provider calls, collection/refund/payout execution, money movement, settlement, period close, item release, deployment or publication occurred.
- Matching is limited to the exact transaction reference emitted by the existing collection exception writer. It is not a general provider-statement import or full external bank/provider reconciliation.
- The evidence completeness endpoint reports field presence only; it does not establish provider authenticity, legal sufficiency, successful beneficiary receipt, or accounting completeness.
- PostgreSQL runtime behavior and query plans have not been exercised in this batch. The SQL must pass disposable-PostgreSQL integration acceptance before production use.
- Independent finance/accounting, security, privacy and release acceptance remain outstanding.

## Verification

Run `npm run verify:batch50` and `npm run test:batch50`. Full `npm run verify:all` should also be run where the global TypeScript compiler is available. Dependency-backed typecheck/build/Vitest and PostgreSQL integration results must be reported separately; source guards are not substitutes for those checks.

## Batch 50 execution results

- `npm run verify:batch50`: PASS, 15/15 source assertions.
- `npm run test:batch50`: PASS, 5/5 Node-native tests.
- `npm run verify:all`: PASS, 91/91 Node-native tests across 15 suites; 156 TypeScript/TSX files passed syntax transpilation with zero syntax diagnostics; 168 traceability IDs and 168 evidence-matrix rows passed; all 17 ordered migration metadata entries passed; all included historical and Batch 50 source guards passed.
- `npm run typecheck`: BLOCKED by absent `@types/node` and `vite/client` definitions.
- `npm test`: BLOCKED because Vitest is not installed in this environment.
- `npm run build`: BLOCKED by the same missing Node/Vite type definitions.
- `npm run release:check`: BLOCKED by outstanding release approvals, environment secrets/configuration, backup/restore, security, privacy, accessibility, financial/accounting, legal and pilot gates. The release gate correctly fails closed.
- PostgreSQL integration was not run. No migrations were applied.
