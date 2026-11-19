# Return4me implementation progress — 15 November 2026

> **Latest continuation status (Batch 32):** Transaction-coupled step-up consumption is now implemented in six existing transactional high-risk workflows (evidence review, dispute resolution, Agent assignment create/cancel, Owner direct report decisions, and report proposal review). This is a narrow source implementation only; Stage 11 remains PARTIAL. Available traceability, migration metadata, evidence-matrix and Admin-overview static checks pass; the combined Node policy suite passes 67/67 and changed-file syntax transpilation passes. Full typecheck is blocked by missing `@types/node` and `vite/client`; Vitest, build, DB/API/browser/accessibility and independent acceptance remain unverified. Production remains fail-closed with 27 outstanding release gates.


> **Latest continuation status (supersedes the historical batch snapshots below):** Batches 1–12 are present in the consolidated source archive; Batch 13 is partial; Batch 14 release tooling/runbooks are source-added but operationally unverified; Batch 15 UX/theme/accessibility foundations are now source-added. Batch 15 source syntax transpilation passed for 74 TypeScript/TSX files with zero syntax diagnostics; traceability (165 IDs) and migration metadata (11 ordered migrations) checks passed. Full dependency-backed typecheck, Vitest, production build, database/API/browser/device/accessibility acceptance remain unrun or blocked. **Current batch: 16 — integrated technical and runtime acceptance. Pending after that: Batch 17 — evidence consolidation and independent acceptance.** No batch or stage is independently accepted; production, external communications and live financial operations remain blocked/unauthorised.

## Delivery scope

Clean-room project only. Source baseline: `return4me-batch5-full-implementation.zip`; controlling product brief: `Return4me_Owner_Approved_Stages_1-17_Handoff(1).pdf`. The legacy `D:\Return4me\return4me-main` project is outside this delivery.

## Completed source work in this delivery

1. Reconciled the 165 requirement IDs in `MASTER_REQUIREMENTS.md` into `REQUIREMENT_TRACEABILITY.csv`. Each row retains the requirement wording and initial handoff status, plus a conservative current source status, implementation paths, test paths and remaining acceptance evidence.
2. Added custody-chain v2 canonicalisation and verification in `shared/custody-chain.ts`.
3. Added migration `0002_custody_chain_v2.sql`: deterministic v2 re-chain of existing rows, UTF-8 byte-length-prefixed fields, UTC millisecond timestamps, per-report transaction advisory locking, database-owned sequence/hash generation, and UPDATE/DELETE/TRUNCATE mutation protection.
4. Updated the reassignment and transfer-confirmation workflow to use the database-owned custody hash trigger and to require confirmation from the actual current assigned Agent identity and current approved claimant identity. The confirmation transaction locks the assignment row; one individual cannot satisfy both independent roles.
5. Added Drizzle schema declarations for custody hash version and transfer confirmations.
6. Added a balanced KES double-entry ledger foundation: pure validation, transactional journal writer, immutable journal/posting migration, deferred balance enforcement, and read-only finance journal view.
7. Added focused custody-chain and ledger policy tests.
8. Updated migration journal metadata and implementation documentation.

## Verification performed

- ZIP extraction and file inventory completed.
- Source requirements count: 165 unique requirement IDs in the master checklist.
- `npm ci --no-audit --no-fund` did not complete within the execution window.
- Offline installation confirmed that the required `zod` package tarball is not cached.
- `npm run typecheck` was attempted but cannot run because `@types/node` and `vite/client` are unavailable in the incomplete dependency directory.
- No Vitest, full build, Drizzle generation, PostgreSQL migration, database/API integration or browser tests are claimed as passed.
- No database was created, connected to, migrated or modified. No provider, email, social channel, production account or real-money operation was called.

## Current roadmap

| Stage | Current status | Next required work |
|---|---|---|
| 1 | PARTIAL | Verify all public service content, accurate coverage distinction and audience journeys |
| 2 | PARTIAL | Complete privileged MFA/recovery/device controls and permission/CSRF acceptance |
| 3 | PARTIAL | Complete consent, retention, data-rights and field-leakage acceptance |
| 4 | IMPLEMENTED_UNVERIFIED | Database/API false-positive, manual-review, access and performance acceptance |
| 5 | PARTIAL | Complete claimant conflict, legal hold, appeal and concurrency acceptance |
| 6 | PARTIAL | Complete Agent renewal/expiry, site inspection and evidence acceptance |
| 7 | PARTIAL | Verify chain v2, transfer identity, assignment concurrency, appointments and handover in disposable PostgreSQL; final release remains blocked |
| 8 | IMPLEMENTED_UNVERIFIED | Cross-tenant and all membership permission matrix acceptance |
| 9 | PARTIAL | Complete investigation, safeguarding, escalation, legal-hold and SLA lifecycle |
| 10 | PARTIAL | Final content, imagery licensing, coverage and legal/contact review |
| 11 | PARTIAL | Complete Admin/Owner governance, audit explorer, analytics and maker-checker UI |
| 12 | PARTIAL; all money movement BLOCKED | Verify ledger foundation; complete pricing decisions, provider sandbox, reconciliation, refunds, settlement and payout gates |
| 13 | PARTIAL; external publishing BLOCKED | Verify Resend delivery events and external channel ownership/scopes; complete retries and notification lifecycle |
| 14 | PARTIAL | Complete MFA, key rotation, logging, incident exercises, storage tests and independent security review |
| 15 | PARTIAL — Batch 15 source foundations added | Complete production role workspaces, contrast/WCAG 2.2 AA, keyboard/screen-reader, Android and slow-network acceptance |
| 16 | PARTIAL | Restore dependency install, typecheck/build/test, DB acceptance, CI, monitoring, backup/restore and runbooks |
| 17 | PARTIAL | Verify approval provenance, every requirement's evidence, independent acceptance and separate production release authorisation |

## Explicit blockers and boundaries

- No provider contract verification, provider sandbox credentials, wallet verification or real-money activity.
- No production data, deployment, publication to Facebook/Telegram, or live email campaign.
- No database operations or migration application in this work session.
- Legal/privacy/accounting/security professional reviews remain open.
- No requirement is marked `VERIFIED_COMPLETE` in this delivery.


## Continuation — Batch 7 source implementation

The next sequential delivery unit is Batch 7. The IntaSend payment path has now been source-added in the clean-room project; see `BATCH7_INTASEND_COLLECTION.md`. The original repository remains untouched.

### Implemented in Batch 7

- Claimant-owned payment sessions use the persisted assessment amount; no client-supplied amount is accepted.
- The 24-hour payment window begins on assigned-Agent physical receipt plus inspection; the individual STK prompt window is 15 minutes.
- IntaSend adapter, provider invoice binding, `api_ref` idempotency, webhook challenge verification, durable webhook delivery records and provider-status reconciliation were added.
- Provider `COMPLETE` plus exact invoice/API reference, KES and amount match is required before local payment confirmation.
- Ambiguous outcomes remain `unknown`; duplicate payment requests are blocked.
- Payment confirmation is required before collection code issuance, Agent handover readiness and claimant handover confirmation.
- Recovery-service collection remains separate from Finder/Agent/Platform reward allocations.

### Verification performed

- Source syntax check: PASS, 63 TypeScript/TSX files, zero syntax diagnostics.
- Requirement traceability: PASS, 165 unique IDs mapped.
- Migration metadata: PASS, five ordered migrations recognised. Migration 0004 was NOT applied.
- Focused policy tests authored but NOT executed.
- Full typecheck BLOCKED because `@types/node` and `vite/client` are missing; `npm ci` timed out.
- No database, provider, sandbox, webhook, email, production or real-money operation was run.

### Roadmap after Batch 7

- **Completed source batches:** 1–7 (with the baseline's acceptance limitations preserved).
- **Current:** Batch 8 — complete payment-controlled custody and final handover lifecycle.
- **Pending:** Batches 9–13 — full finance/reconciliation, settlement/payouts, communications/workspaces, security/accessibility, production readiness.
- **Blocked/unauthorised:** live IntaSend collection, refunds, payouts, production DB migration/deployment and real-money movement.


## Continuation — Batch 8 payment-controlled custody and handover

### Implemented in Batch 8

- Final Agent release is no longer a blanket disabled event. It is permitted only after the existing ordered custody sequence and a database recheck of all release facts.
- The release gate requires a provider-confirmed paid assessment, active verified assigned Agent, verified/not-required claimant identity/authority check, consumed claimant collection authorisation, current `handover_ready` event, claimant confirmation for the same assignment, an active confirmed service appointment and no unresolved release-holding dispute.
- Claim status moves from `approved` to `completed` in the same database transaction that appends the immutable `released` custody event.
- Duplicate release is refused by the completed claim state; the generic custody policy now requires handover readiness before release.

### Verification status

- Batch 8 source changes are included in the same syntax/traceability/migration checks; no database integration test has run.
- Full typecheck and Vitest remain blocked by incomplete dependencies.
- The release SQL has not been executed against PostgreSQL; race, dispute-hold and dual-confirmation tests remain acceptance requirements.

### Roadmap after Batch 8

- **Completed source batches:** 1–8 (with baseline acceptance limitations preserved).
- **Current:** Batch 9 — financial accounting, collection journal postings, provider fee handling, refunds/reversals and reconciliation evidence.
- **Pending:** Batches 10–13 — settlements/payouts, communications/workspaces, security/accessibility, production readiness.
- **Blocked/unauthorised:** live collection, refund execution, payout initiation, production migration/deployment and real-money movement.


## Continuation — Batch 9 collection accounting and reconciliation

### Implemented in Batch 9

- Provider-confirmed claimant collection now posts a balanced immutable KES journal and creates a payment-confirmation receipt in the same PostgreSQL transaction as the confirmation.
- Conservative classification debits provider collection clearing and credits an unclassified collections liability; the charge is not automatically called platform revenue.
- Provider fee data is retained only when returned by the authoritative status response; no fee split or expense allocation is assumed.
- Invoice/API-reference/currency/amount/assessment mismatches create durable reconciliation exceptions.
- Finance/Admin can view exceptions and record a reason/evidence reference without changing payment truth or moving funds.
- Claimants can retrieve only their own confirmed receipt; the receipt states it is not a tax invoice.

### Verification status

- Focused ledger test authored for claimant collection liability classification.
- Source syntax/traceability/migration metadata checks are to be rerun after Batch 9 changes.
- Full typecheck/Vitest and PostgreSQL tests remain blocked by incomplete dependencies and unavailable disposable DB.
- Migration 0005 has not been applied; no provider calls or money movement occurred.

### Roadmap after Batch 9

- **Completed source batches:** 1–9 (baseline acceptance limitations preserved).
- **Current:** Batch 10 — refund/reversal/chargeback lifecycle and reconciliation controls.
- **Pending:** Batches 11–14 — settlement/payout, communications/workspaces, security/accessibility, production readiness.
- **Blocked/unauthorised:** live collection, refund execution, payout initiation, production migrations/deployment and real-money movement.


## Continuation — Batch 10 refund controls

### Implemented in Batch 10

- Original M-Pesa payer phone is stored as AES-256-GCM ciphertext with a separate keyed fingerprint; collection now requires both independent PII keys.
- Full refund requests require a provider-confirmed payment, pre-handover claim and original-payer evidence. No automatic refund on rejection.
- Request, independent admin approval, provider submission and independent reconciliation are separate API actions.
- The refund adapter is sandbox-only and disabled by default. Provider acceptance/2xx is always unknown, never final refund completion.
- Unknown/submitting outcomes are not resubmitted. Manual independent evidence is required before payment/assessment status changes to refunded.
- A confirmed refund creates a correcting balanced journal reversing the original claimant collection liability. The completed custody state is never reopened.

### Verification status

- Refund and payment-PII unit tests authored; Vitest remains unavailable.
- Source syntax/traceability/migration metadata checks must be rerun after Batch 10.
- Migration 0006 not applied. No sandbox/live provider call or real-money movement performed.

### Roadmap after Batch 10

- **Completed source batches:** 1–10 (baseline acceptance limitations preserved).
- **Current:** Batch 11 — settlements, reward allocation snapshots, 48-hour eligibility and manual payout controls.
- **Pending:** Batches 12–14 — communications/workspaces, security/accessibility, production readiness.
- **Blocked/unauthorised:** live collection/refund, live payout, production migration/deployment and real-money movement. Post-handover reversal/chargeback intake also remains open.


## Continuation — Batch 11 reward settlement and payout controls

### Implemented in Batch 11

- Reward funding is explicitly separate from claimant recovery-service charges. Finance/Admin records a source, reference and evidence; a different Admin verifies it.
- A completed handover with provider-confirmed claimant payment, current Finder and assigned verified Agent, no dispute hold and verified reward funding creates an immutable 33/25/42 allocation snapshot and balanced reward-funding journal.
- `settle_at` is exactly 48 hours after the released custody event. A background worker automatically approves due eligible settlements only when no dispute release hold exists; it never initiates payouts.
- Finder/Agent submit their own encrypted M-Pesa destination. Admin verification, HMAC fingerprinting, masked projections, 48-hour cooling and destination snapshot rechecks are implemented.
- Payout requests are created only after settlement approval, then separately approved and executed by three distinct users (creator, approver, executor).
- Payout preflight requires confirmed claimant payment, completed handover, verified destination, elapsed cooling period, verified/different KES settlement and disbursement wallets, operator-recorded liquidity evidence and no dispute hold.
- IntaSend payout adapter is sandbox-only and disabled by default. Provider acceptance is not completion; exact per-transaction `TS100` is required. Verified disbursement fees are borne by the Platform.
- Unknown payout outcomes are not retried. Manual evidence reconciliation cannot resubmit a payout.

### Verification status

- Reward split, 48-hour policy and payout status unit tests authored; Vitest still unavailable.
- Source syntax, traceability and migration metadata checks to be rerun after Batch 11.
- Migration 0007 not applied. No provider call, wallet read, transfer, payout or real-money movement performed.

### Roadmap after Batch 11

- **Completed source batches:** 1–11 (baseline acceptance limitations preserved).
- **Current:** Batch 12 — communications delivery, retries and complete role workspaces/Admin controls.
- **Pending:** Batches 13–14 — security/privacy/accessibility and production readiness/governance.
- **Blocked/unauthorised:** all live collection/refund/payout, production migration/deployment and real-money movement. Post-handover reversal/chargeback intake remains open.


## Continuation — Batch 12 communications and role workspaces

### Implemented in Batch 12

- In-app notification delivery now uses a durable outbox with idempotent insert, `SKIP LOCKED` worker, bounded exponential retry and dead-letter after eight attempts.
- Notification read/unread endpoints and workspace read controls are implemented.
- Category proposal decisions notify the proposing user after the decision transaction commits, using controlled reason codes and permitted notes.
- Claimant workspace exposes the payment assessment, active 24-hour window, M-Pesa prompt request, provider status refresh and confirmed-payment receipt.
- Agent queue exposes only the boolean payment/claimant-confirmation gates needed for final release; the Agent workspace now offers final release only after both gates are satisfied.
- Finder/Agent workspace exposes encrypted payout-destination submission and masked status.
- Finance/Admin workspace exposes payment, reward authorization, settlement, refund, payout, destination verification and collection reconciliation controls.

### Verification status

- Source syntax check passed: 77 TypeScript/TSX files. Traceability check passed: 165 requirement IDs. Migration metadata check passed: 11 ordered migrations.
- Typecheck and Vitest are blocked because `node_modules/.bin/tsc` and `node_modules/.bin/vitest` are absent. No migration has been applied; no browser/API/DB acceptance run.
- External email/SMS/social delivery remains disabled. Notification enqueue is post-commit best-effort; persisted outbox entries retry, but an initial enqueue failure is not replayed transactionally.

### Roadmap after Batch 12

- **Completed source batches:** 1–12 (baseline acceptance limitations preserved).
- **Current:** Batch 13 — security, privacy, fraud, accessibility and independent acceptance hardening.
- **Pending:** Batch 14 — production readiness, governance, operational runbooks and final acceptance.
- **Blocked/unauthorised:** live collection/refund/payout, external email/SMS/social publishing, production migration/deployment and real-money movement. Post-handover reversal/chargeback intake remains open.


## Continuation — Batch 13 security, privacy and accessibility hardening

### Implemented in Batch 13

- Payment PII encryption envelopes are key-versioned. Existing v1 ciphertext remains decryptable; active key selection supports v2+ and a feature-flagged Admin batch-rotation route covers payer phones, payout destinations and payout snapshots. Fingerprints remain on a separate stable HMAC key.
- Authenticated users can export scoped personal data and submit access, rectification, restriction and erasure requests. Admin decisions are audited and notified. No data is automatically erased.
- Privacy export excludes raw KYC files, ciphertext, keys, HMAC fingerprints, other users' records and internal fraud/security notes.
- Finance views omit raw PII/ciphertext. New finance/privacy/payment controls have additional labels, focus/alert semantics and reduced-motion support.

### Verification status

- PII v1/v2 encryption/decryption and fingerprint-preservation tests authored; Vitest unavailable.
- Data-rights migration 0010 added; not applied. Full typecheck/build/API/privacy/rotation/accessibility acceptance not run.
- Existing Helmet, secure cookie, CSRF/Origin, body-limit and process-local rate-limit controls remain. Distributed rate limiting, privileged MFA policy, retention schedule, DPIA, backup restore, incident exercises and independent penetration testing remain open.

### Roadmap after Batch 13

- **Completed source batches:** 1–12.
- **Current:** Batch 13 — complete remaining security/privacy/accessibility evidence and independent review.
- **Pending:** Batch 14 — production readiness, CI/CD, monitoring, backup/restore, RPO/RTO, runbooks, pilot/rollback and final acceptance.
- **Blocked/unauthorised:** production migration/deployment, live collection/refund/payout, external email/SMS/social delivery, real-money movement and legal sign-off.


## Continuation — Batch 14 production readiness and governance

### Implemented in Batch 14

- Multi-stage Node 22 Dockerfile, `.dockerignore`, local-only Postgres Compose password and CI workflow are source-added. CI does not deploy.
- `/healthz` liveness and `/readyz` schema readiness checks are added. Graceful shutdown stops background workers, closes HTTP and drains PostgreSQL.
- Encrypted PostgreSQL backup and restricted non-production restore scripts include checksums, passphrase-file permissions, explicit restore approval and `_restore`/`_dr_test` target enforcement.
- `npm run release:check` requires migration, backup/restore, RPO/RTO, security, privacy, accessibility, payment/accounting, Kenyan legal and pilot sign-offs; it blocks enabled external/live execution flags.
- Operational backup/restore, incident response, financial operations and release/rollback runbooks are documented.

### Verification status

- Source syntax/traceability/migration metadata checks pass: 77 TypeScript/TSX files, 165 requirement IDs and 11 ordered migrations.
- `npm run typecheck` is blocked by missing `@types/node` and `vite/client` definitions. `npm test -- --run` is blocked because Vitest is not installed.
- No CI run, Docker build, container startup, database migration, encrypted backup, restore rehearsal or production readiness test has been executed.
- Release gate remains blocked; no deployment, live provider operation or real-money action is authorised.

### Historical roadmap snapshot (superseded by the latest continuation status at the top of this document)

- **Source batches at that point:** 1–12 implemented in source; Batch 13 partial; Batch 14 release tooling/runbooks source-added.
- **Subsequent continuation:** Batch 15 UX/theme/accessibility foundations source-added; see the latest status at the top and the Batch 15 section below.


## Continuation — Batch 15 UX, themes and accessibility foundations

### Implemented in source

- Added persistent light/dark theme selection; an unsaved preference follows the operating-system colour preference.
- Added a keyboard skip-to-content link and a focusable main-content container.
- Added accessible expanded-state and controlled-navigation semantics to the mobile navigation toggle.
- Changed global notices to distinguish assertive error announcements from polite status announcements.
- Added dark-theme surface, text, border, form, navigation and control overrides.

### Verification and acceptance

- Source edits are present in `src/App.tsx` and `src/styles.css`; roadmap and requirement traceability were updated.
- Automated source verification, TypeScript, build and browser checks are pending for this continuation.
- No WCAG 2.2 AA, contrast, screen-reader, keyboard-only, zoom, Android or slow-network acceptance is claimed.

### Next

- Batch 16: execute full dependency install, typecheck, tests, build, disposable PostgreSQL migrations/integration tests, browser/E2E and accessibility checks; repair defects found without enabling external/live operations.
- Batch 17: consolidate evidence, reconcile all 165 requirements, obtain independent reviews and keep production blocked until separately authorised.


## Continuation — Batch 18 Admin/Owner overview hardening

- Extended the authenticated Admin/Owner overview with aggregate-only counts for claim review, active disputes, appeals, support, data-rights requests, security incidents, notification retries/dead letters and pending organisation verification.
- Kept financial figures explicitly unavailable and disclosed that aggregate counts are not compliance/SLA attestations. No sensitive queue records or write actions are exposed by this summary.
- Added `scripts/verify-admin-overview.mjs` to verify indicator presence and keep status filters aligned with the corresponding workflow status contracts; added it to `verify:all`.
- `verify-admin-overview`, traceability, migration metadata and evidence-matrix static checks passed individually. Typecheck, Vitest, build, DB/API integration and browser/accessibility acceptance were not run because the complete dependency toolchain is unavailable in this extracted workspace.
- **Roadmap:** Batch 18 narrow source task completed; Stage 11 remains PARTIAL. Next: full Admin/Owner workspace, secure queue detail views, restricted audit explorer, separation-of-duties UI, and DB/API/browser/accessibility acceptance.


## Batch 19 — Admin/Owner audit explorer (2026-11-14)

Added a read-only, paginated audit event endpoint and Admin/Owner workspace viewer. The endpoint excludes event metadata and applies role protection, bounded pagination, exact filters and date-range validation. Static guard passed. Typecheck, runtime API tests, browser review and independent acceptance remain pending because dependencies are not installed in this packaging environment. See `BATCH19_AUDIT_EXPLORER.md`.


## Batch 21 — Audit query validation (2026-11-14)

Extracted and tested dependency-free audit query validation. Node-native boundary suite: 11/11 passed. Static traceability, migration metadata, evidence matrix, Admin overview and audit explorer guards passed. TypeScript typecheck could not run because the archive has no installed Node/Vite type definitions. Full application test/build and API/database/browser acceptance remain open.

## Continuation — Batch 23 support queue ownership (2026-11-14)

### Implemented source work

- Replaced the support queue's broad `select *` response with an explicit minimal DTO; requester IDs and ticket descriptions are not included.
- Added strict allowlisted queue filters (`status`, `limit`, `offset`) and bounded pagination.
- Restricted support workers to unassigned tickets and tickets assigned to themselves; Admin retains queue-wide visibility.
- Added assignment/unassignment with mandatory reason, UUID/null validation, active verified non-suspended support-role assignee validation, and no support-worker reassignment of another worker's ticket.
- Added row-level ticket locking and transactionally coupled assignment audit with before/after values and reason.
- No migration was needed or applied.

### Verification performed

- Combined Node-native audit/support policy tests: 32/32 passed.
- Support queue static guard: PASS.
- Shared policy module syntax check: PASS.
- Traceability (165 IDs), migration metadata (12 ordered migrations), evidence matrix (165 rows), Admin overview and Admin audit static guards: PASS.
- Full source verifier could not run because `typescript` is not installed in the extracted project (`ERR_MODULE_NOT_FOUND`).
- No full TypeScript typecheck, build, Vitest, PostgreSQL/API/browser/accessibility, concurrency or independent acceptance is claimed.

### Roadmap after Batch 23

- **Completed source increments:** Batches 1–23, subject to each batch's recorded verification limits; Batch 23 support queue ownership is `IMPLEMENTED_UNVERIFIED`.
- **Current stage:** Stage 11 — Admin/Owner governance remains `PARTIAL` / in progress.
- **Next:** continue Stage 11 with the broader Admin/Owner permission matrix and other operational queues, bulk-action safeguards, maker/checker separation and re-authentication gates; then perform disposable-PostgreSQL and API acceptance.
- **Pending:** Stage 12 finance; Stage 13 communications; Stage 14 security/privacy; Stage 15 UX/accessibility; Stage 16 technical architecture/production readiness; Stage 17 governance acceptance.
- **Blocked/unauthorised:** production deployment/data, live provider actions, money movement, external publishing, production migrations and final release remain blocked pending evidence and separate approval.


## Batch 24 — Stage 11 Admin operational queue catalogue (2026-11-14)

### Implemented in source

- Added read-only Admin claims, disputes and appeals queue endpoints.
- Added strict queue-specific status allowlists, scalar-only query validation, bounded pagination (`limit` 1–100; `offset` 0–100000), and explicit minimal DTO projections.
- Claims queue is Admin-only. Disputes and appeals queues are available to Admin and Trust & Safety, matching their existing workflow permissions; Owner is not implicitly granted case-level access.
- Claimant IDs, ownership/evidence summaries, dispute descriptions/resolutions, appeal grounds/reviewer notes and submitter/reviewer IDs are excluded from queue DTOs. Detailed case review remains in separately permissioned workflows.
- Added dependency-free policy tests, a static route/privacy guard, and package scripts. No schema change or migration was added.

### Verification performed

- Combined Node-native audit, support queue and Admin queue policy tests: **45/45 passed**.
- Admin queue static guard: **PASS**.
- Support ownership static guard: **PASS**.
- Traceability validator: **PASS**, 165 unique requirement IDs; path existence only, not coverage proof.
- Migration metadata: **PASS**, 12 ordered SQL migrations; no migration applied.
- Evidence matrix: **PASS**, 165 rows; independent acceptance remains open.
- Admin overview and audit explorer static guards: **PASS**.
- `tsc --noEmit`: **BLOCKED**, missing `@types/node` and `vite/client` type definitions. No dependency installation was performed.

### Not verified / remaining

- PostgreSQL integration, API authorization, row/object isolation, runtime SQL, browser UI, accessibility, full Vitest, production build and independent security acceptance remain pending.
- These endpoints are read-only queue listings; they do not implement assignment, status changes, bulk actions, maker/checker, or re-authentication.
- No Git metadata is present in the extracted archive; no commit or push was possible.

### Roadmap after Batch 24

- **Completed source increments:** Batches 1–24, each subject to its recorded acceptance limitations. Batch 24 is `IMPLEMENTED_UNVERIFIED`.
- **Current:** Stage 11 — Admin/Owner governance remains `PARTIAL`.
- **Next:** permission matrix and queue-detail object/field authorization, then safe bulk-action preview/confirmation and maker/checker controls.
- **Pending:** Stage 12 finance; Stage 13 communications; Stage 14 security/privacy; Stage 15 UX/accessibility; Stage 16 technical architecture/production readiness; Stage 17 governance acceptance.
- **Blocked/unauthorised:** production deployment/data, live provider actions, money movement, external publishing, production migrations and final release remain blocked pending evidence and separate approval.


## Batch 25 — Stage 11 Admin/Owner capability matrix (2026-11-14)

### Implemented
- Added role-derived capability catalogue and authenticated `/admin/capabilities` endpoint. The capability response is informational; each API continues to enforce its own route-level role gate.
- Added a capability summary to the Admin/Owner workspace, with Owner exclusions for protected case/evidence, finance, Trust & Safety, Support and operational-personal-data access.
- Added explicit source, time-window and status definitions for key overview metrics; financial metrics remain `not_enabled`, not zero.
- Added a constrained Admin-only report bulk start-review lifecycle: preview, explicit confirmation, strict schema, row locks, all-selected-record revalidation, atomic update and per-record audit. Other bulk actions remain unsupported; UX-025 is partial.
- Added dependency-free tests and static guard for capability boundaries.

### Verification
- Combined Node-native tests: **48/48 passed**.
- Capability, Admin queues, support ownership, Admin overview, audit explorer, traceability, migration metadata and evidence matrix checks: **PASS**.
- Dependency installation timed out; TypeScript, Vitest and build are not run. PostgreSQL/API/browser/accessibility/independent acceptance remain pending.

### Stage 11 status and next work
- Batch 25: `IMPLEMENTED_UNVERIFIED`; Stage 11 remains `PARTIAL`.
- UX-025 is partial: only report start-review is implemented; high-risk re-authentication and complete maker/checker are not yet implemented; queue detail views, broader operational queue coverage and route-by-route object/field authorization tests remain.
- Next: implement the missing safe bulk-action lifecycle and step-up re-authentication/separation-of-duties controls, then complete remaining queue/detail views and run disposable PostgreSQL/API/browser/accessibility acceptance.
- No migration, production operation, money movement, production deployment or external publishing was performed.

## Batch 26 — Stage 11 privileged step-up authentication (2026-11-15)

- Added a session-bound, five-minute, single-use `admin_step_up_grants` table and migration 0012; migration metadata now contains 13 ordered migrations. No migration applied.
- Added Admin-only step-up code request/verification endpoints, action-specific OTP purposes, existing OTP attempt/expiry protections, transactionally consumed challenges, session-bound grants and audit records.
- Protected report publication, rejection and closure with one-time step-up grant consumption; added a UI panel for requesting and verifying the code.
- Combined dependency-free policy tests: 51/51 pass. Step-up, capability, queue, support ownership, overview, audit explorer, bulk-action, traceability, migration metadata and evidence matrix static checks pass.
- PostgreSQL migration/runtime, TypeScript, full Vitest, build, API, browser, mobile/accessibility and independent security acceptance remain pending. Step-up covers only the three named report transitions; maker/checker remains incomplete.
- Batch 26: `IMPLEMENTED_UNVERIFIED`. Stage 11 remains `PARTIAL`; SEC-001 remains `PARTIAL`.


## Batch 27 — Two-role administrative authority (2026-11-15)

**Source implementation added; database/runtime acceptance pending.** The administrative model is consolidated to exactly two application-visible privileged roles: `admin` and `owner` (Super Admin). Legacy delegated scopes (`finance`, `trust_safety`, `support`, and communications subroles) are normalized to `admin` at authentication and have a migration prepared to revoke their separate active role rows after granting canonical Admin. The legacy PostgreSQL enum labels remain for compatibility until a separately reviewed schema cleanup; they are not exposed as application `Role` values.

Owner is the final authority: server-side `requireRole` grants Owner access to privileged role-gated operations, and the capability catalogue exposes every declared capability to Owner. Admin retains operational access but cannot exercise Owner-only legal approval. Customer, Finder, Agent and organisation roles are unchanged. Audit, step-up, and workflow-specific controls remain applicable; Owner authority is not an audit bypass.

**Migration:** `0013_two_privileged_admin_roles.sql` is prepared and NOT applied. **Not yet implemented in this batch:** report maker/checker proposal and approval workflow; Owner final-decision workflow UI; broad operational queue detail authorization; comprehensive step-up coverage.

**Verification boundary:** role-policy tests and static guards are source-level only. TypeScript, Vitest, database migration, API integration, concurrent authorization, browser and independent security acceptance remain pending.


## Batch 27 — Two-role administrative authority (2026-11-15)

Implemented source-level consolidation to exactly two privileged application roles: Admin and Super Admin (Owner). Legacy delegated finance, Trust & Safety, support and communications scopes normalize to Admin at authentication; migration 0013 adds canonical Admin where needed and revokes legacy active scopes (without redundantly adding Admin to Owner accounts). Owner is final authority across privileged route gates and declared capabilities. Admin retains operational authority; Owner-only legal approval remains unavailable to Admin. Updated support, evidence, dispute, step-up and UI authorization branches so explicit handler checks honour Owner authority. The role-grant CLI no longer provisions legacy admin tiers.

Verification: **57/57** combined Node policy tests passed. Two-role, capability, step-up, queue, support ownership, overview, audit, bulk, traceability (166 IDs), migration (14 ordered files) and evidence matrix (166 rows) static checks pass after updating the support guard. `verify-source` remains blocked by missing `typescript` package; full TypeScript/Vitest/build and DB/API/browser/mobile/accessibility/independent acceptance not run. Migration 0013 not applied.

Stage 11 remains PARTIAL. Maker/checker, Owner final-decision workflow UI, complete operational queue/detail coverage and comprehensive step-up remain pending. No deployment, production migration, provider action, payment or item release occurred.


## Consolidated Stage 11 governance implementation — 15 November 2026

- Corrected route authorization normalization: historical operational scope gates now map to canonical Admin; Owner remains final authority; Owner-only gates remain Owner-only.
- Added report decision maker/checker workflow: Admin proposals, distinct Admin or Owner reviewer, Owner direct final decision, 48-hour expiry, step-up for review, stale-state revalidation, and transactional decision/audit writes.
- Added pending approval queue API and workspace review controls.
- Added migration `0014_admin_action_approvals.sql`; migration is prepared but NOT applied.
- Remaining Stage 11 work: extend maker/checker to other consequential domains; full detail-field authorization review; full operational queue coverage; comprehensive step-up coverage; DB/API concurrency/browser/mobile/accessibility and independent security acceptance.
- No requirements are marked VERIFIED_COMPLETE by this source change alone.


## Consolidated Stage 11 continuation — 15 November 2026

- Corrected canonical Admin authorization across legacy finance, Trust & Safety, communications and support route declarations; Owner remains the final authority and Owner-only routes remain restricted.
- Removed a remaining direct legacy-role evidence access check.
- Added report decision proposal/approval workflow, Admin self-review prevention, Owner final direct decision, 48-hour proposal expiry, single-use step-up review and transactional audit writes.
- Added correlation IDs to the new consequential decision audit events and pending approval workspace queue.
- Added migration `0014_admin_action_approvals.sql`; it also adds nullable `audit_events.correlation_id`. NOT APPLIED.
- Node policy tests: 63/63 passed. Stage 11 static guards, role/queue/support/overview/audit/bulk/step-up/maker-checker guards, traceability, evidence matrix and 15-migration ordering metadata passed.
- Dependency installation timed out; global `tsc --noEmit` cannot proceed because `@types/node` and `vite/client` are unavailable. Full typecheck, Vitest, build, PostgreSQL migration/runtime, API authorization/concurrency, browser/mobile/accessibility and independent security acceptance remain pending.
- Remaining Stage 11 scope: generalize maker/checker and step-up beyond report decisions; complete record/field-level detail authorization and queue coverage; expand bulk actions; complete end-to-end acceptance. No requirement marked VERIFIED_COMPLETE.

## Batch 29 — Two-role consistency and privileged role provisioning (15 November 2026)
- Fixed Finance assessment access to use canonical Admin/Owner authority, eliminating a stale direct check for the legacy `finance` role.
- Removed legacy Finance, Trust & Safety, Communications Writer/Approver/Publisher and Support entries from the demo role selector. The Admin demo now represents those as operational work areas; the Super Admin (Owner) demo explicitly communicates final authority.
- Hardened `scripts/grant-role.ts` to support only one-time Owner bootstrap (configured email, no active Owner) and non-privileged user roles. Routine Admin grants are removed from the CLI and are available only through the authenticated Owner workspace.
- Added `shared/admin-bootstrap-policy.mjs`, declaration file, Node tests and static verifier; included them in `verify:all`.
- Database migrations remain unapplied. No privileged role grants were performed. Full PostgreSQL, API, browser, and independent acceptance remain pending.


### Batch 29 continuation — Owner-controlled Admin account lifecycle
- Added Owner-only account lookup and Admin grant/revoke endpoints with distinct step-up purposes, reason requirements, transactional role/audit writes, and immediate session invalidation on both grant and revocation.
- Added Owner workspace UI for account lookup and privileged role changes. Owner cannot use this workflow to grant/revoke another Owner or self-grant Admin.
- Removed routine Admin grants from the operator CLI; only first-Owner bootstrap is retained there.
- Added 2 policy tests and a static source guard. No account roles were changed; no database migration was applied.


## Batch 30 — Additional high-risk step-up controls (15 November 2026)

- Added allowlisted step-up purposes and OTP challenge mappings for Agent agreement legal approval (Owner-only), communications campaign approval (Admin/Owner), and organisation status decisions (Admin/Owner).
- Legal approval remains Owner-only and now requires fresh step-up. Communications campaign approval now requires fresh step-up and preserves writer/checker separation; external publishing remains disabled.
- Organisation status changes require a reason and fresh step-up; row locking, status update and audit event now commit in one transaction with a correlation ID.
- Added workspace purpose choices, policy tests and a static high-risk workflow guard.
- Updated evidence queue language to the two-role model and clarified that the Owner's full authority is exercised through separately protected and audited detail workflows; aggregate overview intentionally omits sensitive detail.
- Remaining hardening: step-up grant consumption is currently a separate transaction before the business transaction; a downstream failure consumes the grant (fail-closed) and requires fresh verification. Make consumption atomic with action transactions where feasible.
- Full TypeScript/Vitest/build, PostgreSQL/API concurrency, browser/mobile/accessibility and independent security acceptance remain pending. No migration/deployment/production/provider/money operation performed. Stage 11 remains PARTIAL.


## Batch 31 — Expanded high-risk verification and Owner final authority (15 November 2026)

- Added action-specific OTP/step-up purposes for claim evidence review, dispute resolution, Agent status/assignment changes, pricing approval and key finance review/approval/execution/reconciliation routes.
- Added `requireStepUp` to those routes while preserving role checks, maker/checker, provider feature gates and existing transaction/audit behavior.
- Added all purposes to the Admin/Owner workspace selector and expanded the static high-risk guard.
- Allowed Super Admin (Owner), as final authority, to approve their own refund/payout requests, pricing schedules and communications campaigns; Admin self-approval remains denied. Audit metadata records Owner final overrides. Financial executor independence and provider feature gates remain intact.
- Selected Node policy suite: 67/67 passed. High-risk static guard passed.
- Full typecheck/Vitest/build, PostgreSQL/API/concurrency, browser/mobile/accessibility and independent security acceptance remain pending. Step-up grant consumption remains a separate pre-action transaction; atomic consumption with business writes is still pending.
- Stage 11 remains PARTIAL. No migrations/deployment/provider/money/publication/item-release operations performed.


## Batch 32 — Transaction-coupled step-up consumption (15 November 2026)

- [x] Added a transaction-client helper that locks and consumes a purpose/user/session-bound grant in the protected business transaction.
- [x] Added non-consuming preflight middleware for transactional handlers; the transaction helper performs the authoritative single-use check.
- [x] Converted evidence review, dispute resolution, Agent assignment creation/cancellation, Owner direct-final report decisions and Admin/Owner report proposal review.
- [x] Grant consumption occurs after locked-record and business eligibility checks, before the consequential mutation.
- [x] Added a static guard and updated existing high-risk step-up guards.
- [ ] Convert remaining finance, pricing, Agent status, organisation status, communications, legal approval and Admin role lifecycle routes to transaction-coupled consumption.
- [ ] Add PostgreSQL integration tests for grant lock contention, replay rejection, expiry, rollback restoration and business-write atomicity.
- [ ] Complete full semantic typecheck/build/Vitest and API/browser/mobile/accessibility/independent security acceptance.

Verification: all applicable Stage 11 source guards passed; the combined existing Node policy suite passed 67/67; migration metadata confirms 15 ordered migrations and none applied. TypeScript syntax check, full typecheck and package build are not yet recorded. Stage 11 remains PARTIAL; production release remains blocked.


## Batch 33 — Combined transactional step-up and governance hardening (15 November 2026)

- [x] Refund reconciliation and payout reconciliation now consume grants inside the same transaction as the state/journal/audit updates.
- [x] Organisation status, pricing schedule approval and communications campaign approval now use transaction-coupled step-up consumption with locked revalidation.
- [x] Updated transactional and high-risk static guards; 11 workflows are now checked across Batches 32–33.
- [x] Combined Node policy suite passed 67/67; four changed TypeScript route files passed syntax transpilation.
- [ ] Remaining high-risk routes still require conversion; PostgreSQL locking/rollback/replay/expiry tests and full runtime/browser/independent acceptance remain pending.

Stage 11 remains PARTIAL. No migration, production database operation, provider call, money movement, external publishing, deployment or item release occurred.
