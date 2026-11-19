# Batch 35 — Combined transactional step-up completion for remaining eligible workflows

Date: 15 November 2026

## Implemented

- Converted payout-destination verification to the transaction-coupled step-up path. The destination is row-locked, eligibility is rechecked, the grant is consumed, the destination is updated and the audit event is written in one Drizzle transaction. Notification remains post-commit.
- Converted reward-authorization verification to transaction-coupled step-up. The settlement service accepts a transaction-scoped grant-consumption callback and consumes the grant only after the authorization and settlement eligibility checks, before settlement, journal, posting, authorization and audit writes.
- Converted Owner-only Agent agreement legal approval to a transaction-coupled path using the existing node-postgres pool. Added a PostgreSQL-client helper that locks and consumes the user/session/purpose-bound grant on the same client transaction as the agreement update and audit write.
- Expanded the transactional source guard to cover these flows and the raw PostgreSQL helper.
- Preserved the existing role requirements: legal agreement approval remains Owner-only; payout destination and reward verification remain Admin-controlled with existing maker/checker and verification rules.

## Deliberately not converted to a local SQL transaction

Refund execution and payout execution still invoke external provider operations. A remote provider request cannot participate in a local PostgreSQL transaction. These routes retain the consuming step-up middleware and separate reservation/idempotency/reconciliation controls. A later outbox/provider-idempotency design and acceptance are required; describing the remote action as SQL-atomic would be incorrect.

## Verification boundary

Source-level guards and policy tests are not database integration tests. The PostgreSQL row-lock, concurrent grant consumption, expiry, replay and rollback tests remain pending, as do full dependency installation, semantic TypeScript checking, Vitest/build, API/browser/mobile/accessibility and independent security acceptance.

No migration was applied. No production database action, live payment/refund/payout, provider request, deployment, external publication or item release was performed. Stage 11 remains PARTIAL and production release remains blocked.
