# Batch 41 — Sensitive privacy and security governance controls

**Date:** 16 November 2026  
**Continuation source:** Stage 40 complete project archive  
**Status:** Source implementation complete; runtime and independent acceptance pending.

## Implemented

1. Added two distinct action-specific step-up purposes: `admin.privacy.request.decide` and `admin.security_incident.update`. Both are present in the OTP challenge mapping, shared purpose allowlist and Admin/Owner step-up workspace.
2. Privacy data-rights decisions now require Admin/Owner authority and a fresh step-up grant. The handler locks the request row, verifies it remains open, consumes the grant inside the same Drizzle transaction, records the decision and audit event in that transaction, then sends the existing post-commit notification. No erasure is performed automatically.
3. Security incident updates now require Admin/Owner authority and a fresh step-up grant. The handler locks the incident, validates closure requirements and current state, consumes the grant inside the same transaction as the incident update and audit event. Closed incidents remain immutable through this workflow.
4. Expanded the transactional step-up source guard to cover both workflows; it now covers 27 workflow paths. Added a dedicated Batch 41 source guard and included it in `verify:all`.
5. Added a policy regression test confirming the two new purposes are accepted while nearby unapproved purpose strings fail closed.

## Verification

- Combined Node policy suite: **68/68 passed**.
- Transactional step-up source guard: **27 workflows passed** (static source check).
- Batch 41 sensitive-governance source guard: passed.
- High-risk step-up guard: passed.
- Existing Admin role, maker/checker, queue, audit, overview, support, outbox and recovery guards: passed.
- Requirement traceability: 166 unique IDs; cited source/test paths exist.
- Evidence matrix: 166 rows validated.
- Migration metadata: 17 ordered migrations validated; no migration applied.
- TypeScript/TSX syntax transpilation: 4 changed files passed. This is syntax-only, not semantic typechecking.
- PostgreSQL tests: not run; no disposable PostgreSQL service or `TEST_DATABASE_URL` is available.
- `npm ci --ignore-scripts --no-audit --no-fund` failed with npm `Exit handler never called`; dependency-backed typecheck, Vitest and build remain unavailable.

## Limitations and outstanding acceptance

- The new route guards and source checks do not prove live database locking, rollback, concurrency or HTTP authorization behaviour.
- No API integration, PostgreSQL runtime, browser/mobile, accessibility or independent security acceptance was performed.
- Migrations 0015 and 0016 remain prepared and unapplied.
- Provider idempotency contract, ambiguous-outcome reconciliation and private-object deletion worker runtime acceptance remain open.

## Safety boundary

No migration was applied. No production database change, provider request, payment, refund, payout, deployment, external publication or item release occurred. Stage 11 remains **PARTIAL** and production release remains blocked.
