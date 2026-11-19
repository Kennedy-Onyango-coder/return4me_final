# Batch 32 — Transaction-coupled step-up consumption (15 November 2026)

## Scope

Combined the remaining transactional step-up work for the most consequential workflows that already had a clear Drizzle transaction boundary. The existing session-bound, five-minute, purpose-specific grant model is preserved.

## Implemented in source

- Added `consumeStepUpGrantInTransaction(tx, auth, purpose)`: locks one unconsumed grant for the exact user, session and purpose, checks expiry, and conditionally marks it consumed using the same transaction client as the protected change.
- Added `requireStepUpInTransaction(purpose)`: performs an early fail-closed availability check but deliberately does not consume the grant. The protected handler must consume it inside its transaction.
- Converted the following six protected paths to transaction-coupled consumption:
  1. Claim evidence review.
  2. Dispute resolution.
  3. Agent assignment creation.
  4. Agent assignment cancellation.
  5. Owner direct-final report decision.
  6. Admin/Owner report proposal review (approve or reject).
- Grant consumption is placed after the relevant record locks and business eligibility checks, immediately before the protected mutation. A failed validation therefore does not consume the grant. A transaction rollback rolls back both grant consumption and business writes.
- Updated static source guards to enforce the new middleware/helper pairing.

## Explicitly not converted in this batch

Other protected routes (including finance collection/refund/payout, pricing schedule approval, Agent status, organisation status, communications approval, agreement legal approval, and role grant/revoke) retain the existing middleware that consumes a grant before the handler transaction. They remain fail-closed and single-use, but their grant consumption is not atomic with the later business transaction. They are not represented as complete by this batch.

## Verification

- Transactional step-up source guard: PASS for six workflows (static source check).
- High-risk step-up guard: PASS (static source check).
- Maker/checker, step-up, role, role-management, bootstrap, queue, overview, audit explorer, bulk-action, traceability, evidence-matrix and migration-metadata guards: PASS.
- Existing combined Node policy suite: 67/67 passed.
- TypeScript syntax transpilation: to be recorded in the batch delivery report after execution.
- Full semantic typecheck/build/Vitest, PostgreSQL transaction/locking/rollback tests, API authorization/concurrency, browser/mobile/accessibility and independent security acceptance remain pending.

## Safety boundary

No migration was added or applied. No database, production account, provider, email campaign, payout, refund, publication, deployment or item-release operation was performed. Production readiness is not claimed.
