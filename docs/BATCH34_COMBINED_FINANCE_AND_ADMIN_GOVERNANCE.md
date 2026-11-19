# Batch 34 — Combined finance and administrative governance hardening

Date: 15 November 2026

## Scope and source changes

Batch 34 extends transaction-coupled, session-bound, purpose-specific step-up grant consumption to six additional workflows:

- Agent status changes: grant consumption, locked Agent row, role activation/revocation changes and audit event now share one Drizzle transaction.
- Finance collection reconciliation review: the state transition and audit record now commit atomically with grant consumption.
- Refund approval: the refund row is locked, maker/checker or Owner-final eligibility is rechecked, and approval/audit/grant consumption share one transaction. Claimant notification remains post-commit.
- Payout request approval: the payout row is locked, Admin self-approval remains prohibited, Owner final override remains permitted, and approval/audit/grant consumption share one transaction.
- Admin role grant: Owner-only grant now consumes its step-up grant inside the transaction that creates the role, revokes target sessions and records audit.
- Admin role revoke: Owner-only revoke now consumes its step-up grant inside the transaction that revokes Admin/legacy-scope rows, invalidates sessions and records audit.

The existing five-minute purpose/user/session binding and row-locked single-use helper are retained. No new migration is introduced. No provider execution path was converted to a database transaction because a remote provider call cannot be atomically committed with a local SQL transaction; execution remains separately gated and must be tested with idempotency/reconciliation controls.

## Verification

- Transactional step-up source guard expanded to 17 workflows.
- Existing Node policy suite target remains 67 tests; results are recorded in the accompanying batch verification report.
- Static source guards are not PostgreSQL runtime evidence. Lock contention, expiry, replay rejection, rollback restoration and transaction-level audit atomicity remain pending database-backed tests.
- Full semantic TypeScript check, package build and Vitest require project dependencies/types not present in this working environment.

## Remaining non-atomic routes

Finance refund execution, payout execution, payout destination verification, reward authorization verification, Owner legal agreement approval and any unenumerated high-risk routes still require review. Provider execution intentionally retains pre-handler step-up consumption pending a dedicated remote-operation/idempotency design.

## Roadmap and safety

Stage 11 remains PARTIAL. Object/field authorization, queue/detail coverage, full maker/checker review, PostgreSQL/API/concurrency tests, browser/mobile/accessibility and independent security review remain open. No migration, production database operation, live payment/refund/payout, provider request, deployment, external publication or item release was performed.
