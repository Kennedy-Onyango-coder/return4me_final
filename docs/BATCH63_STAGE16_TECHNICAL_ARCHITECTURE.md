# Batch 63 — Stage 16 Technical Architecture and Operations

**Date:** 17 November 2026  
**Baseline:** Cumulative Batches 59–62  
**Source status:** Implementation additions recorded; unverified  
**Stage status:** PARTIAL — not accepted  
**Migration:** `0021_stage16_runtime_operations.sql` prepared and journaled; NOT applied.

## 1. Runtime observability foundations

- Added structured JSON operational logging with fixed event names and a restrictive allowlist for bounded scalar fields. Fields whose names suggest personal data, credentials, request payloads or message content are excluded.
- Added server-generated request IDs in `x-request-id` and response bodies for unhandled 404/500 responses.
- Added completion records containing method, matched route template (never raw URL), status and duration. Request bodies, query strings, cookies, authorization headers and raw exception messages are not logged.
- Added generic idle database-client error logging without connection strings or error payloads.
- Added consistent process start, shutdown and worker outcome events.

## 2. Worker observability

- Added `runtime_worker_heartbeats` with per-worker status, last start/completion/failure timestamps, bounded error code and success/failure counters.
- Added `runObservedWorker` wrapper and wired settlement eligibility, provider-operation recovery, private document deletion and notification outbox loops through it.
- Worker telemetry stores no business payloads, claimant details, provider response bodies or exception text.
- Telemetry migration is not applied. The API readiness gate now requires the runtime heartbeat table, so a deployment without migration 0021 remains not ready.

## 3. Database and process lifecycle

- Made PostgreSQL pool maximum, idle timeout and connection timeout configurable through environment variables with existing safe defaults.
- Added a configurable graceful-shutdown deadline. On expiry, remaining HTTP connections are closed and process exit is marked unsuccessful.
- Existing encrypted backup and guarded non-production restore scripts remain the baseline. They require protected passphrase files and checksum validation; restore requires explicit approval and a `_restore` or `_dr_test` target.

## 4. Prepared migration

`server/db/migrations/0021_stage16_runtime_operations.sql` creates the worker heartbeat table and status index. It is journal index 21. It has NOT been applied to any database.

## 5. Stage 16 gaps

- Central error taxonomy and consistent domain-level error mapping across every route.
- Trace propagation from HTTP requests into queued work and external callback processing.
- External metrics/tracing exporter, dashboards, alert routing, SLOs and on-call ownership.
- Worker lease/heartbeat timeout policy, per-worker retry policy catalogue, dead-letter administration and safe replay approval.
- Automated encrypted off-site backup retention, restore rehearsal evidence, point-in-time recovery and key-rotation procedure.
- Approved numeric RPO/RTO, capacity/load model, failover design and regional recovery decision.
- Dependency inventory/SBOM, vulnerability scanning, patch policy, dependency update cadence and independent architecture review.
- Deployment orchestration, zero-downtime migration plan, rollback rehearsals and release provenance.
- Environment-specific secrets management, rotation evidence and production configuration review.

## 6. Verification and safety

Per user instruction, no application tests, typecheck, build, lint, PostgreSQL/API/browser/accessibility tests or runtime execution were performed. The migration was not applied. Source additions are not yet verified for compilation or runtime behavior.

No production access, external provider calls, message dispatch, deployment, financial action, item release, commit or push was performed.

## 7. Acceptance

Stage 16 remains PARTIAL and NOT_ACCEPTED. Consolidated technical verification is deferred until Batch 66 implementation freeze and Batch 67 acceptance.
