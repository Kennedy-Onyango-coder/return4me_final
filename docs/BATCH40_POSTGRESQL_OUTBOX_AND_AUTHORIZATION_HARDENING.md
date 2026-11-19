# Batch 40 — PostgreSQL outbox and authorization hardening (15 November 2026)

## Scope

Batch 40 continues from the Stage 39 archive. It strengthens the opt-in PostgreSQL integration harness and adds a focused source guard for the existing high-risk outbox and Agent-document authorization boundaries. No application migration or production operation is performed.

## Implemented

- Reworked `scripts/integration/test-outbox-postgres.mjs` to create an isolated disposable schema, create only the minimal parent fixtures, and execute the repository's actual unapplied migrations `0015_provider_operation_outbox.sql` and `0016_document_storage_deletion_outbox.sql` instead of hand-creating lookalike outbox tables.
- Expanded the integration suite from five to nine scenarios: actual migration/schema constraints; step-up plus provider reservation rollback; committed reservation and idempotency uniqueness; wrong user/session/purpose and expired grant rejection; concurrent grant consumption; stale provider operation transition to `unknown` exactly once; exclusion of `unknown` from automatic recovery; storage-key uniqueness and bounded dead-letter state; and stale versus fresh document-worker lease recovery.
- Added `scripts/verify-batch40-outbox-authorization.mjs` and wired it into `verify:all`. It checks that the integration harness applies the real migration files, validates the expected database scenarios, verifies that stale provider recovery contains no provider request path, and checks the Admin/Owner privacy-minimized attention queues and compound Agent-document scoping.

## Verification

- Batch 40 focused source guard: passed.
- PostgreSQL integration test discovery: 9 tests discovered; all 9 skipped because `TEST_DATABASE_URL` is not configured. This is not PostgreSQL runtime acceptance.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out. Only a partial `node_modules` directory was created; local TypeScript/Vitest executables remain unavailable.
- No application TypeScript files were changed in this batch.
- Existing policy/static checks are recorded in the Batch 40 delivery report and must not be interpreted as database or independent security acceptance.

## Remaining acceptance

- Run the nine integration tests against a disposable PostgreSQL instance, then fix any real migration, constraint, locking, rollback or lease-recovery failures.
- Exercise the actual worker implementations against a disposable object-storage adapter, including timeout, duplicate processing, retry exhaustion and recovery.
- Complete exhaustive Admin object-level and field-level authorization review, including negative API tests.
- Restore dependencies and run semantic TypeScript, Vitest and production build checks.
- Complete browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. Migrations 0015 and 0016 remain unapplied. No production database, provider, payment, refund, payout, deployment, external publication or item-release operation was performed.
