# Batch 33 — Combined transactional step-up and governance hardening

Date: 15 November 2026

## Scope

Batch 33 combines additional high-risk governance routes with the transaction-coupled step-up work from Batch 32. The session-bound, five-minute, purpose-specific grant model is unchanged. The transaction client now performs the authoritative row-locked single-use consumption for the converted workflows.

## Source changes

- Refund reconciliation: grant consumption moved into the same transaction as refund/payment state reconciliation and correcting journal writes. The refund and payment rows are locked and eligibility is checked before grant consumption.
- Payout reconciliation: grant consumption moved into the same transaction as payout/settlement reconciliation and correcting journal writes. Payout and settlement rows are locked and eligibility is checked before grant consumption.
- Organisation status changes: transaction-bound grant consumption now occurs after the organisation row is locked and before the status/audit writes.
- Pricing schedule approval: the schedule is re-read under row lock; ownership, draft status, active rules and effective date are checked inside the transaction; grant consumption, schedule activation/expiry and audit commit atomically.
- Communications campaign approval: campaign row is locked; Admin maker/checker or Owner final override is rechecked; campaign and publication status plus audit are committed atomically with grant consumption. External publishing remains disabled.
- Added/expanded static guards to assert the transactional middleware and transaction-client grant consumption for these routes.

Together with Batch 32, the transaction-coupled source paths now cover 11 workflows: evidence review, dispute resolution, Agent assignment creation/cancellation, report direct-final decision, report approval review, refund reconciliation, payout reconciliation, organisation status, pricing approval and communications approval. The report direct-final decision and approval review are separate paths, as are the two assignment operations.

## Remaining non-atomic paths

The following high-risk paths still use pre-handler grant consumption or otherwise need a transaction-boundary review: Agent status changes, finance collection review, refund approval/execution, payout destination verification, reward authorization verification, payout approval/execution, Owner legal agreement approval, Admin grant/revoke and any other route not enumerated above. They are not claimed atomic by Batch 33.

## Verification

- Combined existing Node policy suite: 67/67 passed.
- `scripts/verify-transactional-step-up.mjs`: passed, 11 workflow paths checked.
- `scripts/verify-admin-high-risk-step-up.mjs`: passed.
- Changed TypeScript route syntax transpilation: finance, pricing, organisations and communications passed (4/4).
- Full semantic TypeScript check, package build and Vitest remain blocked/unverified because project dependencies/types are unavailable in this environment.
- No disposable PostgreSQL integration run was available; row-lock contention, rollback restoration, expiry and replay rejection still require database-backed tests.

## Roadmap and safety

Stage 11 remains PARTIAL. Source-level implementation is not independent acceptance. PostgreSQL/API/concurrency, object/field authorization, queue/detail coverage, browser/mobile/accessibility and independent security review remain open. No migration was applied, and no production database, payment/refund/payout provider, email campaign, external publishing, deployment or item release was invoked.
