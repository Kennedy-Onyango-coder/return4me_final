# Batch 67B — Stage 16 exact migration-journal readiness

**Date:** 17 November 2026  
**Baseline:** Batch 67A cumulative source archive  
**Status:** Source implementation added; runtime verification deferred

## Scope

The `/readyz` endpoint previously checked a selected set of required PostgreSQL tables but did not establish whether the database had applied the complete migration journal represented by the delivered source tree. This batch adds a fail-closed journal check before readiness can be reported.

## Source changes

- `server/index.ts` now carries an ordered 22-entry timestamp baseline synchronized to `server/db/migrations/meta/_journal.json`.
- `/readyz` first checks for `drizzle.__drizzle_migrations`, then reads its ordered `created_at` values and compares the full sequence and entry count against the source journal baseline.
- A missing migration table returns HTTP 503 with a bounded `migrationJournal.status = missing` diagnostic.
- A missing, extra or out-of-order journal entry returns HTTP 503 with `migrationJournal.status = mismatch`, expected count and applied count. Raw SQL errors and database internals are not returned.
- Only after the journal matches does `/readyz` perform the existing required-table checks. Successful readiness includes `migrationJournal.status = current`.
- Graceful shutdown now awaits closure of both the application pool and dedicated worker-lock pool. Batch 67A imported the close helper but did not yet invoke it; this batch closes that source-level omission.
- OPS-004 and INT-015 source references/notes were updated. All verification, seam and acceptance states remain pending.

## Behavioural boundaries and limitations

- This checks the complete ordered migration timestamp sequence and count, not SQL file hashes, schema drift, every index/constraint/function/trigger, or data correctness.
- The 22-entry baseline must be updated in the same source change whenever the Drizzle journal changes.
- It assumes the Drizzle migration metadata table is in the default `drizzle` schema configured by Drizzle Kit. Any deployment using a custom migration schema requires matching configuration and review rather than silently passing readiness.
- A matching journal does not prove that migration SQL completed correctly or that all expected objects remain intact; selected required-table checks remain a separate partial safeguard.
- Migration 0018–0021 remain unapplied in the project workflow until a separately authorised controlled migration operation. This source change does not apply them.

## Verification and safety

- Read-only inspection of the Drizzle journal and migration configuration: completed.
- Source edits and requirement-register updates: completed.
- Tests, typecheck, build, lint, static verifier scripts, PostgreSQL, migration replay, API, browser, concurrency, security, performance, accessibility and provider sandbox: NOT RUN, as instructed.
- No database was contacted, no migration was applied, no provider was contacted, no money moved, no deployment/commit/push occurred.

## Remaining Stage 16 work

- Verify Drizzle's migration metadata layout and ordered timestamps against a clean disposable PostgreSQL migration replay in Batch 69.
- Verify the exact `/readyz` response for missing, partial, extra and current journals, plus missing schema objects.
- Verify advisory-lock acquisition, multi-instance skip, lock-session loss, worker crash/restart and shutdown with in-flight work.
- Add operational telemetry/alerts, backup/PITR/restore rehearsal, approved RPO/RTO, SBOM/vulnerability workflow and rollback evidence.

Stage 16 remains PARTIAL and IMPLEMENTED_UNVERIFIED. Independent acceptance remains PENDING; production release remains NOT_AUTHORISED.
