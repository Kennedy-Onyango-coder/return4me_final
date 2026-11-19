# Batch 38 — Provider crash recovery and private-document deletion recovery

**Date:** 15 November 2026  
**Base:** Stage 37 archive  
**Status:** Source implementation complete; database/runtime acceptance pending.

## 1. Provider-operation crash recovery

- Added a bounded recovery sweep for provider-operation outbox rows left in `reserved` or `dispatching` for more than five minutes.
- The sweep changes the outbox status to `unknown`, preserving the record for the existing evidence-based reconciliation workflow.
- It does not call IntaSend, retry, recreate an operation, or infer whether the provider completed the transaction.
- Uses row locking with `SKIP LOCKED` and a bounded batch size to avoid competing workers processing the same rows.
- Existing Admin/Owner attention queue remains privacy-minimized and read-only.

## 2. Private-document deletion outbox

- Admin soft deletion now atomically marks the document deleted, records the audit event and queues the original/preview storage keys in `document_storage_deletion_outbox`.
- Storage keys are not returned by the Admin queue API.
- Added strict object-delete operation for the worker. The existing best-effort cleanup helper remains unchanged for upload compensation paths.
- Worker claims due rows with `FOR UPDATE SKIP LOCKED`, uses idempotent object deletion, retries failures with bounded exponential backoff, and marks jobs dead after eight attempts.
- Stale `processing` leases older than five minutes are recovered to `retry`; duplicate deletion is safe because object deletion is idempotent.
- Admin/Owner can inspect a limited attention queue containing document IDs, status, attempt count and safe error codes only.
- Added migration `0016_document_storage_deletion_outbox.sql`; it is prepared but unapplied.

## 3. Verification

- Combined existing Node Admin/security policy suite: 67/67 passed.
- Batch 38 recovery source guard passed.
- Provider outbox source guard passed.
- Migration metadata: 17 ordered migrations validated; none applied.
- Evidence matrix: 166 rows validated.
- Traceability: 166 unique IDs and referenced paths validated; candidate paths are not proof of requirement coverage.
- Full TypeScript semantic check, Vitest/build, PostgreSQL runtime/concurrency and object-storage failure tests remain pending.

## 4. Safety boundaries

- No provider request or automatic financial retry is performed by the new recovery sweep.
- A stale payment operation is marked `unknown`, never `failed` or `not executed` without provider evidence.
- Private document deletion retries are permitted because deletion is idempotent; retry count is bounded.
- No migration was applied and no production database, provider, payment, refund, payout, deployment, external publication or item release operation occurred.

Stage 11 remains PARTIAL. This batch does not establish production readiness or independent acceptance.
