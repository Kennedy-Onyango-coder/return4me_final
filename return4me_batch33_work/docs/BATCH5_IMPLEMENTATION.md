# Batch 5 — Agent and Custody Completion

**Source status:** `IMPLEMENTED_UNVERIFIED` in this ZIP. This is a source implementation, not a verified runtime or production release.

## Approved operating decisions applied

- Kenyan Agent identity, business and service-location checks are manual; no third-party KYC provider is called and no full identity number is collected by the new workflow.
- Training is system-assessed across `custody_basics`, `privacy_safety` and `handover_incidents`; each module requires 80% and expires after 12 months.
- Agent agreements are versioned and hashed. Acceptance stores the typed full name, timestamp, accepted user and exact agreement hash. Legal approval is a separate Owner action and must exist before the version can be accepted or used for activation.
- A current approved service-site inspection is required for activation, directory visibility and assignment.
- Agents publish future availability windows. Claimants request appointments within those windows; Agents confirm or decline. Timezone is `Africa/Nairobi`.
- Claimant identity is checked in person by an administrator; representative authority must already be independently verified. The workflow stores a decision, actor, timestamp and minimal note, not an identity number.
- Finder drop-off and claimant collection codes are six digits, HMAC-hashed, expire after 24 hours, allow five attempts and are single-use. Codes are not returned by APIs. Private email delivery is used when configured; local development logs the code with a `DEV ONLY` marker.
- Custody events are append-only, sequence-numbered and hash-chained. Existing events are backfilled before the database mutation trigger is enabled.
- Reassignment is Admin-controlled, county- and capacity-checked, reasoned and audited. Where custody has begun, both the current Agent and approved claimant must confirm transfer before reassignment; a custody-transfer event is appended.
- Final item release remains blocked. Agent readiness and claimant confirmation do not bypass payment or legal approval.

## New database migration

`server/db/migrations/0001_batch5_agent_custody.sql`

Adds:
- `agent_agreement_versions`, `agent_agreements`
- `agent_site_inspections`
- `agent_training_attempts`
- `agent_availability_windows`, `agent_appointments`
- `agent_collection_checks`
- `custody_handover_confirmations`, `custody_transfer_confirmations`
- custody event hash/sequence columns, legacy event hash backfill and append-only trigger
- appointment overlap protection

The migration enables PostgreSQL `pgcrypto` for deterministic legacy custody hash backfill and `btree_gist` for exclusion-based appointment overlap protection. Confirm extension permissions and migration behavior against a disposable PostgreSQL instance before applying to any persistent environment.

## API additions

Mounted under `/api/agent-operations`:

- `GET /training/modules`, `POST /training/:moduleCode/attempt`
- `GET /agreement/current`, `POST /agreement/accept`
- `GET /admin/agreement-versions`, `POST /admin/agreement-versions`, `POST /admin/agreement-versions/:id/legal-approve`
- `POST /admin/:agentId/site-inspections`
- `GET /assignments/recommendations/:reportId`
- `POST /assignments/:assignmentId/reassign`
- `POST /admin/agents/:agentId/reconcile-capacity`
- `POST /availability/windows`, `GET /availability/windows/mine`
- `GET /appointments/mine`, `POST /appointments/request`, `PATCH /appointments/:id/confirm`, `PATCH /appointments/:id/decline`
- `GET /claimant/assignments`
- `POST /admin/claims/:claimId/collection-check`, `POST /admin/claims/:claimId/collection-code`
- `POST /assignments/:assignmentId/transfer-confirm`
- `POST /claims/:claimId/confirm-handover`

Existing `/api/agents` activation, assignment, drop-off and custody routes were tightened to use the new gates. Existing document review now supports an optional expiry timestamp, and Admin document soft-delete purges private object bytes while retaining audit metadata and scan history.

## UI additions

- Applicant and Agent workspace: system-assessed training, versioned agreement acceptance, availability-window publication, appointment review and custody code steps.
- Claimant workspace: appointment request and separate claimant-side handover confirmation.
- Admin console: agreement draft/legal approval panel, site inspection, claimant identity/authority check and collection-code issuance, assignment recommendations.

## Required environment and operational controls

- Private S3-compatible storage and ClamAV remain fail-closed requirements for document upload.
- Production requires configured `CASE_TOKEN_HASH_SECRET`, Resend `RESEND_API_KEY` and `EMAIL_FROM`, private object storage, ClamAV and the existing session/OTP secrets.
- The agreement body is a draft authored by an administrator until a qualified legal reviewer has completed review and an Owner explicitly records legal approval. This software does not create legal approval.
- A claimant collection code is sent only after an approved claim and recorded in-person identity/authority check. Production email failure invalidates the code.
- No new payment, refund, payout or external publishing integration is enabled.

## Known acceptance gates / not claimed complete

1. Full dependency installation did not complete in this environment. Full TypeScript typecheck, Vitest, Vite build and server bundle are not verified.
2. Migration has not been applied to disposable PostgreSQL here. Confirm the `pgcrypto`/`btree_gist` extensions, trigger ordering, Drizzle migration journal and hash backfill on the target PostgreSQL version.
3. API route tests, database concurrency tests, role/tenant tests, appointment race tests, code brute-force tests, email delivery tests and browser/device/accessibility tests remain to be run.
4. The existing codebase's API/UI patterns need a full integrated review; do not treat source transpilation as type or runtime acceptance.
5. Payment and legal release approvals are external blockers. The `released` custody event still returns HTTP 423; no endpoint in Batch 5 authorises final item release.
6. Production deployment, live data, real claimant documents and real funds are outside this ZIP's scope.

## Local validation performed for this ZIP

- TypeScript/TSX transpilation using the globally available TypeScript compiler: 50 files, zero syntax diagnostics.
- `tsc --noEmit` could not start because project dependencies and type definitions are unavailable (`@types/node` and `vite/client` missing).
- `npm ci --ignore-scripts --no-audit --no-fund` timed out; no complete `node_modules` directory was produced.
- No database migration, API server, tests, browser, email provider or storage provider was run.
