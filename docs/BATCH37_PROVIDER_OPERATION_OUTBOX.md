# Batch 37 — Durable provider-operation intent and recovery visibility

Date: 15 November 2026

## Implemented source changes

- Added `provider_operation_outbox` with a unique idempotency key, constrained refund/payout operation types and lifecycle states, request actor, attempt count, provider reference, HTTP status, dispatch timestamp and resolution timestamp.
- Refund reservation inserts its outbox row in the same Drizzle transaction as the `approved` → `submitting` state change, payment assessment update and step-up grant consumption.
- Payout reservation inserts its outbox row on the same PostgreSQL client transaction as the `approved` → `submitting` reservation, settlement state update and step-up grant consumption.
- Both flows mark the operation `dispatching` before making the remote request and persist the provider outcome/reference/status after the request returns.
- Provider status verification and manual reconciliation resolve the corresponding outbox record. An `unknown` manual outcome remains unresolved and visible.
- Added an Admin/Owner read-only attention queue for `reserved`, `dispatching` and `unknown` operations. It returns identifiers and operational evidence only; no payer/beneficiary PII, destination ciphertext or provider request payload is exposed.
- Added migration `0015_provider_operation_outbox.sql`, Drizzle schema, migration journal entry and source guard.

## Safety design

- No automatic retry, replay or resubmission endpoint exists. A crash after reservation can leave a `reserved` or `dispatching` record for controlled investigation.
- The outbox does not claim atomicity with IntaSend. A database commit and a remote HTTP request cannot form one local SQL transaction.
- The persisted provider idempotency key is a correlation/control value; IntaSend's actual idempotency semantics remain unverified. Do not infer that a repeated provider call is safe.
- `accepted` is not equivalent to completed payout. Existing exact per-transaction provider status verification remains the completion gate.
- The migration is prepared only. It was not applied to any database.

## Verification

- Combined Node policy suite: 67/67 passed.
- Admin governance, support ownership, transactional step-up, traceability, evidence matrix and migration metadata guards passed.
- New provider-outbox source guard passed, including privacy projection and no-auto-retry checks.
- Migration metadata now contains 16 ordered SQL migrations; none applied.
- Full TypeScript semantic check, Vitest/build, PostgreSQL migration/transaction/concurrency tests, API/browser acceptance and independent security review remain pending.

## Status

Batch 37 source implementation complete. Stage 11 remains PARTIAL. Production release remains blocked. No provider request, payment, refund, payout, deployment, external publication or item release was performed as part of this batch.
