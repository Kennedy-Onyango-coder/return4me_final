# Batch 39 — Outbox PostgreSQL acceptance harness and Admin authorization review

**Date:** 15 November 2026  
**Base:** Stage 38 archive  
**Status:** Test harness and source-level authorization review implemented; PostgreSQL runtime execution pending.

## 1. PostgreSQL integration harness

Added `scripts/integration/test-outbox-postgres.mjs`, an opt-in integration suite that requires `TEST_DATABASE_URL` to point to a disposable PostgreSQL database. It creates a uniquely named temporary schema and drops it after the run.

The suite covers:

- Step-up grant consumption and provider reservation rollback in one transaction.
- Committed grant consumption and unique provider idempotency-key enforcement.
- Concurrent grant consumers serialized by `SELECT ... FOR UPDATE`, with only one consumer succeeding.
- Stale provider operations transitioning to `unknown` without increasing attempts or initiating another provider request.
- Document storage deletion outbox key deduplication and bounded dead-letter state.

The harness was invoked in this environment, but `TEST_DATABASE_URL` was not configured. All five database integration tests therefore reported **SKIP**. This is not a PostgreSQL pass and does not establish database runtime acceptance.

Run against an isolated disposable database with:

```bash
TEST_DATABASE_URL='postgresql://.../disposable_test_db' npm run test:postgres-outboxes
```

The test creates and drops its own uniquely named schema; it does not run application migrations or modify application tables outside that schema.

## 2. Admin object/field authorization source review

Added `scripts/verify-batch39-authorization.mjs`. It checks the source-level invariants that:

- Only canonical Admin and Owner privileged roles are exposed after legacy delegated scopes are normalized.
- Owner retains final authority through the common role gate.
- Agent document self-service reads are scoped to the authenticated user's Agent record.
- Admin document reads and review/deletion mutations constrain the document by both document ID and Agent resource ID.
- Admin recovery queues avoid exposing private storage keys.
- The aggregate overview and audit explorer retain explicit Admin/Owner gates.

The guard passed. This is a focused source check, not an exhaustive route-by-route authorization penetration test. Broader object/field authorization acceptance remains open.

## 3. Verification

- Existing Node Admin/security policy suite: **67/67 passed**.
- Batch 38 recovery source guard: passed.
- Provider outbox source guard: passed.
- Transactional step-up source guard: passed for 25 workflows.
- Batch 39 Admin authorization source guard: passed.
- Migration metadata: 17 ordered migrations validated; none applied.
- Evidence matrix: 166 requirement rows validated.
- Traceability: 166 unique IDs validated; candidate test paths are not proof of coverage.
- PostgreSQL integration harness: 5 tests discovered, **5 skipped** because `TEST_DATABASE_URL` was not configured.
- Full TypeScript semantic check, Vitest/build, actual PostgreSQL concurrency and object-storage tests remain pending.

## 4. Safety boundaries

- No database connection was made by the integration suite because no disposable test URL was supplied.
- No migration was applied.
- No provider calls, financial retries, payments, refunds, payouts, deployments, external publication or item releases occurred.
- Provider operations remain fail-closed on ambiguous outcomes; automatic financial retries remain disabled.

Stage 11 remains PARTIAL. Batch 39 does not establish production readiness or independent acceptance.
