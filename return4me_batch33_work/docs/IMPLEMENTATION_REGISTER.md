# Implementation register — Return4me clean-room rebuild

`MASTER_REQUIREMENTS.md` is the detailed product contract. `ROADMAP_1_TO_17.md` records current stage status and approved invariants.

Status definitions:
- `VERIFIED_COMPLETE`: implementation and acceptance evidence pass.
- `IMPLEMENTED_UNVERIFIED`: code exists; full runtime/database/acceptance proof is pending.
- `PARTIAL`: some approved requirements exist; material behavior remains unfinished.
- `BLOCKED`: cannot safely proceed without provider credentials, legal sign-off, storage/scanner, or separate authorisation.
- `NOT_STARTED`: no implementation exists.

## Code traceability

| ID | Requirement area | Source paths | Current status | Acceptance evidence still required |
|---|---|---|---|---|
| BASE-001 | Modular project/runtime | `package.json`, `server/index.ts`, `src/`, `shared/` | IMPLEMENTED_UNVERIFIED | Clean npm install, complete typecheck/build and fresh Windows setup |
| AUTH-001 | Email OTP identity | `server/routes/auth.ts`, `server/services/email.ts`, `server/security.ts` | PARTIAL | Race/concurrency tests, global abuse tests, production email and session hardening |
| RBAC-001 | Server roles | `server/security.ts`, `shared/contracts.ts`, `shared/admin-role-policy.mjs`, `shared/admin-bootstrap-policy.mjs`, `scripts/grant-role.ts` | PARTIAL | Full permission matrix including object/field scoping and revoke/session tests; verify Owner bootstrap and Owner-approved Admin provisioning against disposable PostgreSQL |
| REPORT-001 | Lost/found reports | `server/routes/reports.ts`, `server/routes/guest-reports.ts`, `server/db/schema.ts`, `src/App.tsx` | PARTIAL | DB/API tests; guest email delivery/tracking round trip; guardian authority verification; complete consent/retention/data-rights coverage |
| MATCH-001 | Private matching and candidate review | `shared/matching-policy.ts`, `server/routes/matching.ts`, `server/db/schema.ts` | IMPLEMENTED_UNVERIFIED | DB migration, false-positive/permission tests, manual matching path, performance tests |
| CLAIM-001 | Claim review | `server/routes/claims.ts`, `server/routes/disputes.ts`, `server/db/schema.ts`, `shared/reporting-policy.ts` | PARTIAL | Full runtime tests for owner/representative approval matrix, mandatory verified ownership-support evidence, represented-person authority evidence, appeal independence, multiple claimant conflict and legal holds (the pure policy helpers have been strict-typechecked and smoke-tested only) |
| EVID-001 | Claim evidence upload and private document delivery | `server/routes/claim-evidence.ts`, `server/services/malware-scan.ts`, `server/services/private-storage.ts`, `shared/document-policy.ts`, `server/db/schema.ts` | IMPLEMENTED_UNVERIFIED | Install dependencies; test with ClamAV and disposable PostgreSQL; malware/EICAR test; access-control, retention, S3 policy and backup acceptance |
| TRUST-001 | Disputes and holds | `server/routes/disputes.ts`, `server/db/schema.ts` | IMPLEMENTED_UNVERIFIED | Race-safe hold enforcement and dispute integration tests; legal/stolen-property flow |
| AGENT-001 | Application/activation | `server/routes/agents.ts`, `server/db/schema.ts` | PARTIAL | Upload/scanner, training product, agreements, document verification and service-site review |
| AGENT-002 | Verified public directory | `server/routes/agents.ts` | IMPLEMENTED_UNVERIFIED | Directory DTO/privacy test and database acceptance |
| CUST-001 | Assignment/capacity/drop-off code | `server/routes/agents.ts`, `server/services/email.ts`, `server/db/schema.ts` | PARTIAL | Reassignment/cancellation load repair, SMTP delivery test and custody concurrency tests |
| CUST-002 | Collection and final release | `shared/workflow-policy.ts`, `server/routes/agents.ts`, `server/routes/agent-operations.ts` | PARTIAL | Batch 7 adds verified-payment gates to code issuance, handover readiness and claimant confirmation; final release lifecycle and DB acceptance remain pending |
| ORG-001 | Organisation registration/membership | `server/routes/organisations.ts`, `server/db/schema.ts` | IMPLEMENTED_UNVERIFIED | Cross-tenant isolation, invitations, revoke/leave, member role mutation and audit integration tests |
| ORG-002 | Organisation case access | `server/routes/organisations.ts` | IMPLEMENTED_UNVERIFIED | Full read/write test matrix for `org_admin`, `case_coordinator`, `report_viewer` |
| PRICE-001 | Category proposals | `server/routes/pricing.ts`, `server/db/schema.ts`, `src/App.tsx` | IMPLEMENTED_UNVERIFIED | DB/UI tests for guest and authenticated proposals, concurrent review, slug collision and permission denial |
| PRICE-002 | Versioned KES schedules | `server/routes/pricing.ts`, `server/db/schema.ts` | PARTIAL | Built-in category seeding, assessments, precedence, effective-date history and claimant confirmation |
| PAY-001 | Provider collection | `server/routes/claim-collections.ts`, `server/routes/intasend-webhook.ts`, `server/services/intasend-collections.ts`, `server/services/collection-reconciliation.ts`, `shared/payment-collection-policy.ts`, `server/db/migrations/0004_intasend_claimant_collection.sql` | IMPLEMENTED_UNVERIFIED | Source includes guarded STK, challenge-authenticated webhook and authoritative status reconciliation; collection disabled by default; typecheck, DB/API, sandbox and independent acceptance pending |
| PAY-002 | Ledger and allocation | `shared/financial-policy.ts`, `shared/ledger-policy.ts`, `server/services/ledger.ts`, `server/services/collection-reconciliation.ts`, `server/services/settlements.ts`, `server/db/schema.ts`, migrations 0003/0005/0007 | PARTIAL | Claimant collection liabilities and verified reward allocations are journalled; full period close, historical snapshots, chargebacks and professional acceptance remain pending |
| PAY-003 | Settlements | `shared/financial-policy.ts`, `server/services/settlements.ts`, `server/services/settlement-worker.ts`, `server/routes/finance.ts`, `server/db/schema.ts`, `server/db/migrations/0007_reward_settlement_payout_controls.sql` | IMPLEMENTED_UNVERIFIED | Separate verified reward funding, 33/25/42 snapshots, release+48h eligibility and dispute-aware auto-approval are source-added; DB/concurrency/accounting acceptance pending |
| PAY-004 | Payout initiation | `shared/financial-policy.ts`, `server/routes/finance.ts`, `server/services/intasend-payouts.ts`, `server/services/payment-pii.ts`, `server/db/schema.ts`, `server/db/migrations/0007_reward_settlement_payout_controls.sql` | PARTIAL | Encrypted beneficiary destination, cooling period, three-person controls, sandbox-only IntaSend B2C and TS100 confirmation are source-added; wallet/liquidity and provider acceptance pending; disabled by default |
| PAY-005 | Refunds/reversals | `server/db/schema.ts`, `server/routes/finance.ts`, `server/services/payment-pii.ts`, `server/services/intasend-refunds.ts`, `shared/refund-policy.ts`, migration 0006 | PARTIAL | Original-payer request/approval, sandbox-only submission and manual evidence reconciliation are source-added; post-handover reversals/chargebacks and provider acceptance remain pending; disabled by default |
| COMM-001 | Email/in-app communication | `server/routes/notifications.ts`, `server/services/notifications.ts`, `server/services/notification-worker.ts`, `server/db/migrations/0008_notification_outbox.sql`, `src/App.tsx` | PARTIAL | In-app durable outbox/retry/read controls are source-added; email/SMS consent, delivery/bounce/complaint and transactional enqueue atomicity remain pending |
| COMM-002 | Campaign approval | `server/routes/communications.ts`, `server/db/schema.ts` | IMPLEMENTED_UNVERIFIED | Role matrix, PII screening, publication retries and cross-channel acceptance |
| COMM-003 | FB/Telegram publishing | `server/routes/communications.ts` | BLOCKED | Verify existing credentials, provider terms, scopes, content policy, retries and duplicate suppression |
| FILE-001 | Secure file storage and WebP | `server/db/schema.ts` | BLOCKED | Private object storage, file signature validation, malware scanner, image processing/EXIF and ACL tests |
| DOC-001 | Document verification lifecycle | `server/db/schema.ts`, `server/routes/agents.ts` | PARTIAL | Upload/view/download/resubmit/expiry/delete workflow and malware evidence |
| SUPPORT-001 | Support workflow | `server/routes/support.ts`, `server/db/schema.ts`, `shared/support-queue-policy.mjs`, `scripts/test-support-queue-policy.mjs` | IMPLEMENTED_UNVERIFIED | Batch 23 adds bounded queue filters, minimal queue DTO, support/admin visibility scoping, active verified support assignee checks and row-locked transaction-coupled assignment audit; PostgreSQL/API concurrency, message visibility, status mutation, attachment policy and SLA tests remain |
| UX-001 | Public website/design | `src/App.tsx`, `src/styles.css` | PARTIAL | Authenticated UI, real approved imagery, browser/device and WCAG 2.2 AA audit |
| UX-002 | Role dashboards | `src/components/DemoExperience.tsx`, `src/demo/data.ts` | IMPLEMENTED_UNVERIFIED | Connect actual API-backed role screens; demo must remain clearly separate from production data |
| SEC-001 | Security baseline | `server/index.ts`, `server/security.ts`, `server/routes/` | PARTIAL | HttpOnly secure sessions/CSRF, MFA, threat modelling, penetration test, security incident response and audit retention |
| OPS-001 | Observability/DR/deployment | `docs/ARCHITECTURE.md`, `docs/TESTING.md` | NOT_STARTED | Monitoring, alerting, encrypted backups, restore tests, RPO/RTO, rollback runbooks |
| LEGAL-001 | Kenya privacy/payments/tax review | `docs/ROADMAP_1_TO_17.md` | BLOCKED | Qualified Kenyan privacy, payment, consumer and accounting review; ODPC obligations/DPIA assessment |
| GOV-001 | Consolidated contract | `docs/MASTER_REQUIREMENTS.md`, `docs/ROADMAP_1_TO_17.md` | IMPLEMENTED_UNVERIFIED | Review approved-decision provenance against full chat history and acceptance IDs |
| GOV-002 | Traceability/evidence | `docs/IMPLEMENTATION_REGISTER.md`, `docs/BUILD_STATUS.md` | PARTIAL | Add exact test and migration IDs after runtime environment is available |

## 14 November 2026 source additions

- `shared/custody-chain.ts`, `shared/custody-chain.test.ts`, `server/db/migrations/0002_custody_chain_v2.sql`: versioned canonical hash, deterministic verification, database-owned sequence/hash generation, advisory-lock serialisation and append-only row/table guards.
- `server/routes/agent-operations.ts`: transfer confirmation is transactionally tied to the actual current assigned Agent and current approved claimant; reassignment checks both identities rather than role labels alone.
- `shared/ledger-policy.ts`, `shared/ledger-policy.test.ts`, `server/services/ledger.ts`, `server/db/migrations/0003_financial_journal.sql`: immutable, balanced KES double-entry journal foundation with deferred database balance enforcement and idempotency; read-only journal endpoint added. Provider collection, payouts, refunds and settlement automation remain disabled.
- `docs/REQUIREMENT_TRACEABILITY.csv`: individual traceability for all 165 requirement IDs, with source paths, test paths and remaining acceptance evidence.

## Batch 4 additions

- `server/routes/guest-reports.ts`, `server/services/email.ts`, `server/db/schema.ts`, `src/App.tsx`: no-account guest lost/found reporting, email OTP, short-lived single-use submission proof, 30-day hashed tracking access, path-scoped HttpOnly cookie exchange, limited tracking DTO, guest consent update/revocation and email-OTP tracking-link recovery/reissue with revocation of prior tokens.
- `server/routes/reports.ts`: authenticated reporter relationship, subject attribution, category proposal intake and consent re-review after a previously published notice.
- `server/routes/claims.ts`, `server/db/schema.ts`, `src/App.tsx`: claimant representation declarations, separate authority-document verification, independent appeal submissions/review and claim re-opening without automatic approval.
- `server/routes/admin.ts`, `shared/reporting-policy.ts`: shared public publication gates (consent, safe text and authorised custody for found items), used by Admin publication.
- `server/routes/pricing.ts`, `src/App.tsx`: Admin category-proposal review queue; row-locked approval/rejection and explicit permanent-category creation option.
- `shared/reporting-policy.ts`, `shared/reporting-policy.test.ts`: pure policy functions and unit tests for representative declarations, claim-approval authority, consent re-review and found-item custody publication gates.

## Batch 2 additions

- `src/components/DemoExperience.tsx`, `src/demo/data.ts`, `.env.demo`: frontend-only role preview, no API or database calls, sample-only in-memory interactions.
- `shared/matching-policy.ts`, `shared/workflow-policy.ts`: deterministic matching and release/custody policy functions.
- `server/routes/matching.ts`: restricted candidate evaluation and human candidate review.
- `server/routes/disputes.ts`: dispute opening, hold application and separately authorised resolution.
- `server/routes/organisations.ts`: organisation onboarding, hashed invitations, verified-email acceptance, member and tenant-scoped report APIs.
- `server/routes/support.ts`: ticket, customer/internal message and restricted queue APIs.
- `server/routes/pricing.ts`: category proposals and draft/approved KES schedule lifecycle.
- `server/routes/communications.ts`: templates, campaign draft/approval and a fail-closed external publishing endpoint.
- `server/routes/finance.ts`: itemised assessments, sandbox-gated collection/refund/payout flows, settlement and payout controls, reconciliation, privacy key-rotation controls and Finance/Admin APIs. Provider execution remains disabled by default.
- `server/db/schema.ts`: matching, evidence, disputes, organisation invitations/activity, agent training/availability, handover authorisation, support, pricing, payment assessment, payout/refund, reconciliation, communications, scan events, security incidents, policy versions, category proposals, notification outbox, reward funding, payout destinations and data-rights requests.
- `server/routes/agents.ts`: verified service directory, activation prerequisites, training/document gates, availability/capacity, assignment checks and one-time Finder drop-off code verification.
- `shared/matching-policy.test.ts`, `shared/finance-safety.test.ts`: domain safety policy tests.

## Build evidence in current preparation environment

- TypeScript/TSX syntax transpilation: 77 `.ts`/`.tsx` source files, zero syntax diagnostics (current verification run).
- Dependency-free strict TypeScript check: `shared/contracts.ts`, `shared/financial-policy.ts`, `shared/matching-policy.ts`, and `shared/workflow-policy.ts` passed before the final documentation-only edits.
- `npm install --ignore-scripts --no-audit --no-fund` timed out in this environment. There is no complete `node_modules` tree.
- Full project `tsc --noEmit`, Vitest, Vite build, Drizzle migration generation, PostgreSQL integration tests, browser tests and accessibility tests have not run; current preparation environment has no `node_modules/.bin/tsc` or `node_modules/.bin/vitest`.

Never upgrade an item to `VERIFIED_COMPLETE` solely because it has a route, table or screen.


## Batch 5 source additions (current ZIP; `IMPLEMENTED_UNVERIFIED`)

| Requirement | Implementation | Status | Remaining acceptance |
|---|---|---|---|
| AGENT-001 / AGENT-002 | `server/routes/agent-documents.ts`, `server/routes/agent-operations.ts`, `server/routes/agents.ts`, migration `0001_batch5_agent_custody.sql` | IMPLEMENTED_UNVERIFIED | PostgreSQL/API tests; manual identity/business review; malware/S3 acceptance; legal approval and activation-gate tests |
| AGENT-003 | `server/routes/agents.ts` public directory current-compliance predicates | IMPLEMENTED_UNVERIFIED | Directory privacy/expiry/consent tests and query-plan review |
| AGENT-004 | `server/routes/agent-operations.ts` recommendations, assignment reassignment and capacity reconciliation | IMPLEMENTED_UNVERIFIED | Concurrent capacity/assignment tests; custody-transfer two-party tests; role/abuse tests |
| AGENT-005 | `src/App.tsx` Agent training, agreement, appointment and custody surfaces | PARTIAL | Full dashboard details, browser/device and accessibility acceptance |
| CUST-001 / CUST-002 | `server/routes/agents.ts`, `server/routes/agent-operations.ts`, `server/services/email.ts` | IMPLEMENTED_UNVERIFIED | HMAC/code attempt tests, provider email tests and DB concurrency acceptance |
| CUST-003 | `server/routes/agents.ts`, migration `0001_batch5_agent_custody.sql` | IMPLEMENTED_UNVERIFIED | Verify legacy hash backfill, append-only trigger and event-chain tamper tests |
| CUST-004 / CUST-005 | `server/routes/agent-operations.ts`, `src/App.tsx` | PARTIAL | In-person identity evidence process, representative authority, appointment and dual-confirmation integration acceptance; final release blocked |
| DOC-001 | `server/routes/agent-documents.ts`, `server/db/schema.ts` | IMPLEMENTED_UNVERIFIED | Expiry, resubmission, soft-delete/storage purge, private ACL and malware tests |
| FILE-001 | Existing private storage/malware services | BLOCKED | Actual private object storage and ClamAV runtime configuration and acceptance |

No new row is `VERIFIED_COMPLETE`. See `docs/BATCH5_IMPLEMENTATION.md` for the full endpoint inventory and environment constraints.


## Batches 7–13 continuation register (current source tree)

| Batch | Source implementation | Status | Acceptance still required |
|---|---|---|---|
| 7 | `server/services/intasend-collections.ts`, `server/routes/claim-collections.ts`, `server/routes/intasend-webhook.ts`, `server/services/collection-reconciliation.ts`, migration 0004 | IMPLEMENTED_UNVERIFIED | Disposable PostgreSQL, sandbox contract, webhook replay/amount/idempotency/unknown tests; disabled by default |
| 8 | `server/routes/agent-operations.ts`, `server/routes/agents.ts`, `server/routes/claim-collections.ts` | IMPLEMENTED_UNVERIFIED | Claimant payment + dual confirmation + appointment + identity + dispute gates; browser/concurrency tests |
| 9 | `server/services/ledger.ts`, `server/services/collection-reconciliation.ts`, migration 0005 | IMPLEMENTED_UNVERIFIED | Journal constraints, reconciliation, immutable posting and PostgreSQL acceptance |
| 10 | `server/services/intasend-refunds.ts`, `server/routes/finance.ts`, migration 0006 | PARTIAL | Original-payer refund, independent approval, sandbox-only submission; provider status, post-handover reversals and chargebacks remain open |
| 11 | `server/services/settlements.ts`, `server/services/settlement-worker.ts`, `server/services/intasend-payouts.ts`, migration 0007 | IMPLEMENTED_UNVERIFIED | Verified external reward funding, 33/25/42 snapshot, 48-hour auto-approval, manual payout maker-checker-executor, TS100; wallet/provider/DB acceptance pending |
| 12 | `server/services/notifications.ts`, `server/services/notification-worker.ts`, `server/routes/notifications.ts`, `src/App.tsx`, migrations 0008–0009 | IMPLEMENTED_UNVERIFIED | In-app outbox/retry/read controls and claimant/Agent/Finance workspaces; external email/SMS/social and browser acceptance pending |
| 13 | `server/services/payment-pii.ts`, `server/services/payment-pii-rotation.ts`, `server/routes/privacy.ts`, migration 0010, `src/App.tsx` | PARTIAL | Versioned PII rotation and personal data rights source-added; retention, DPIA, distributed limits, MFA policy, independent security/accessibility acceptance pending |

The 11 SQL migrations (`0000`–`0010`) are source files with ordered metadata; none has been applied in this preparation environment. No requirement is `VERIFIED_COMPLETE`.

## Batch 14 source additions (current ZIP; `IMPLEMENTED_UNVERIFIED` / release blocked)

| Requirement | Implementation | Status | Remaining acceptance |
|---|---|---|---|
| GOV-004 / GOV-005 | `scripts/check-release-gates.mjs`, `package.json` `release:check`, `docs/BATCH14_PRODUCTION_READINESS.md` | IMPLEMENTED_UNVERIFIED | Obtain all independent sign-offs and owner release approval; gate is intentionally blocked by default |
| SEC-013 | `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`, `docs/runbooks/backup-restore.md` | PARTIAL | Run encrypted backup and restore rehearsal, verify off-site replication, approve RPO/RTO and key management |
| SEC-012 | `docs/runbooks/incident-response.md` | PARTIAL | Incident exercise, counsel review, escalation rota and breach-notification acceptance |

The CI workflow does not deploy. The backup/restore scripts have not been executed. No production release is authorised.

## Batch 17 governance update — 14 November 2026

The following governance artifacts have been added to the current package:

- `REQUIREMENT_EVIDENCE_MATRIX.csv` — 165 requirements with separate specification, implementation, technical verification, independent acceptance and release authorization dimensions. Exact test-name and execution evidence fields remain blank until evidenced.
- `CONFLICT_REGISTER.md` — records differences between the saved archive's older Batch 16 evidence and the later owner-reported Cline results without overwriting historical records.
- `RISK_REGISTER.csv` — records deferred Batch 16 items and provider, finance, legal, privacy, storage, communications, operational and release dependencies.
- `INDEPENDENT_ACCEPTANCE_TEMPLATE.md` and `RELEASE_AUTHORIZATION_CHECKLIST.md` — provide evidence and release review templates.
- `scripts/verify-evidence-matrix.mjs` — prevents `VERIFIED_COMPLETE` from being used without mapped tests, execution evidence, technical pass and independent acceptance.

Current requirement status remains 135 `PARTIAL`, 22 `IMPLEMENTED_UNVERIFIED`, 8 `BLOCKED`, 0 `VERIFIED_COMPLETE`. The governance documents are source-added but not independently accepted. See `ROADMAP_1_TO_17_UPDATED.md` for stage-by-stage remaining work.


## Stage 20 — Audit Explorer Filters and Query Hardening (2026-11-14)

- Source added: action/resource/outcome/date filters, paired 90-day date-range limit, audit chronology index migration `0011_audit_created_index.sql`, and updated schema/static guard.
- Status: source-added; static/database/API/browser acceptance remains pending. No migration was applied in this environment.


## Batch 21 — Audit query validation

Added `shared/audit-query.mjs` and `shared/audit-query.d.mts`; the Admin/Owner audit API now delegates query-string validation to this dependency-free boundary. Added 11 Node-native tests covering valid inputs and malformed/abusive bounds. `node --test scripts/test-audit-query.mjs` passed 11/11. Static audit, evidence, traceability and migration checks passed. Full application typecheck/test/build and API/database/browser acceptance remain pending; no requirement was promoted to verified complete.

## Batch 23 source additions

- Support queue ownership: strict queue query parser; bounded pagination; minimal queue DTO; support workers see unassigned/self-assigned work while admins see all; assignment limited to active, verified, non-suspended support-role users; support workers can claim/release only their own tickets; admin assignment is row-locked and transactionally audited with before/after and reason. See `docs/BATCH23_ADMIN_QUEUE_OWNERSHIP.md`.


## 14 November 2026 — Batch 24 queue catalogue source additions

- `UX-020` / `UX-024` remain `PARTIAL` / `IMPLEMENTED_UNVERIFIED`; Batch 24 adds read-only Admin claims, disputes and appeals queue endpoints in `server/routes/admin.ts`.
- Queue DTOs intentionally omit claimant identity, ownership/evidence summaries, dispute narratives/resolutions, appeal grounds/reviewer notes and submitter/reviewer IDs.
- Admin-only claim queue; Admin/Trust & Safety dispute and appeal queues. All use strict allowlisted status filters and bounded pagination via `shared/admin-queue-policy.mjs`.
- Node-native policy tests and source static guard are included. PostgreSQL/API role and object access, runtime query plans, browser and independent acceptance remain pending.


## Batch 25 — Admin/Owner capability matrix

- Added `shared/admin-access-policy.mjs`, `GET /api/admin/capabilities`, an authenticated workspace capability summary and explicit overview metric definitions. Owner access remains aggregate/governance scoped; the capability catalogue does not replace route authorization.
- Combined Node-native tests: 48/48 passed. Static capability, queue, support, overview, audit, traceability, migration and evidence checks passed.
- Dependency installation timed out; typecheck, Vitest, build, PostgreSQL/API/browser/accessibility and independent acceptance remain pending.
- UX-025 bulk actions and high-risk re-authentication are still open. Batch 25 is `IMPLEMENTED_UNVERIFIED`; Stage 11 remains `PARTIAL`.

- Constrained Admin report bulk start-review now has a preview/confirm lifecycle, strict validation, row locks, all-or-nothing update and transaction-coupled per-report audit. `scripts/verify-admin-bulk-actions.mjs` is a static guard only; runtime API/DB/concurrency/browser acceptance remains open. UX-025 is partial, not complete.


## Batch 28 — Consolidated Stage 11 governance continuation (2026-11-15)

- Corrected role-gate normalization so canonical Admin inherits historical finance, Trust & Safety, communications and support route scopes; Owner remains final authority and Owner-only routes remain restricted.
- Removed a direct legacy Trust & Safety role check from protected evidence access.
- Added report consequential-decision proposals and approval queue. Admin cannot review their own proposal; a different Admin or Owner may review; Owner may execute a direct final decision after step-up.
- Added five-minute, session-bound, single-use step-up for proposal review; re-locks proposal/report, revalidates current report state and publication safety, and commits decision plus audit in one transaction.
- Added correlation IDs to these decision audit events and surfaced correlation IDs in the audit explorer.
- Added migration `0014_admin_action_approvals.sql`; prepared but not applied.
- Node policy tests 63/63 pass; Stage 11 static guards, traceability, migration metadata and evidence matrix pass. Full dependency-backed typecheck, Vitest, build, PostgreSQL/API/concurrency/browser/device/accessibility and independent security acceptance remain pending. Stage 11 remains PARTIAL.
