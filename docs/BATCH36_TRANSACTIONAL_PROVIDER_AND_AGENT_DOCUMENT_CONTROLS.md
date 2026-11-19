# Batch 36 — Transactional provider reservations and Agent-document governance

**Date:** 15 November 2026  
**Baseline:** Stages 1–35 archive  
**Status:** Source implementation complete; runtime acceptance pending

## Scope delivered

1. Refund execution now uses `requireStepUpInTransaction` for non-consuming preflight. Inside the Drizzle transaction it locks the refund, revalidates its approved state, independent executor, original-payer destination and fingerprint, locks/rechecks the payment and claim, consumes the action-specific grant, reserves submission and marks the assessment as refunding. The provider call remains after commit.
2. Payout execution now uses non-consuming step-up preflight and calls `consumeStepUpGrantWithPgClient` on the same PostgreSQL client/transaction as the conditional payout reservation and settlement state update. A reservation failure rolls back the grant consumption.
3. Refund provider initiation now passes the persisted `refund_requests.idempotency_key` as the transaction `idempotency_key`, aligning it with the existing payout request's stable-key pattern. The provider's exact idempotency semantics have not been independently confirmed.
4. Admin Agent-document review and deletion require separate step-up purposes. Grant consumption, locked document state change and audit insertion share one Drizzle transaction. The private-object deletion still happens after the soft-delete transaction commits; object-store failure/retry acceptance remains open.
5. The step-up choice list and OTP-purpose allowlist now include Agent-document review and deletion.

## Verification

- Combined Node policy suite: 67/67 passed.
- Admin governance static guards: passed.
- Transactional step-up source guard: 25 workflows passed.
- Traceability: 166 unique requirement IDs; source/test paths validated.
- Evidence matrix: 166 rows.
- Migration metadata: 15 ordered migrations; none applied.
- TypeScript syntax transpilation: 5/5 changed TS/TSX files passed.
- ZIP integrity: verified after packaging.

Static source guards and syntax transpilation do not establish semantic type correctness, database concurrency correctness or provider contract acceptance. Full TypeScript/build/Vitest remain unavailable because project dependencies/type definitions are not installed in this working environment. PostgreSQL integration tests remain pending.

## Explicitly not performed

No migration, production database change, live or sandbox provider call, payment/refund/payout, money movement, deployment, external publication or item release was performed. Provider execution flags remain subject to existing disabled-by-default/sandbox-only gates.

## Remaining acceptance

- Confirm provider idempotency-key semantics and behavior for repeated request/timeout cases in an authorised sandbox test.
- Implement/verify outbox and recovery handling for ambiguous provider outcomes.
- Test refund/payout grant rollback, replay prevention, expiry and concurrent requests against disposable PostgreSQL.
- Verify private object deletion retries after document soft-delete commit.
- Complete full semantic typecheck, Vitest/build, API/object-field authorization, browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. Production release remains blocked.
