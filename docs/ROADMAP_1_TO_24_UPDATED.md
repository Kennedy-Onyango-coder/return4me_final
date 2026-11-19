# Return4me roadmap — Stages 1–43

Updated: 2026-11-16

## Current checkpoint
Batch 43 adds restricted dispute/appeal detail workspaces with audited narrative access; Batch 42 added privacy/security restricted workspaces and Batch 41 added sensitive privacy/security step-up controls: two privileged roles, with Admin operational authority and Super Admin/Owner final authority: there are exactly two application-visible privileged roles (Admin and Super Admin/Owner), and Owner is the final authority. The implementation and role-policy tests are source-level progress; Stage 11 remains PARTIAL.

| Stage / batch | Status | Evidence / remaining work |
|---|---|---|
| Stages 1–10 | Existing source baseline; acceptance open | Requirement-by-requirement runtime and independent acceptance remain outstanding. |
| Stage 11 — Admin/Owner | Source implementation expanded; acceptance open | Two privileged roles (Admin and Super Admin/Owner), legacy-scope route normalization, report maker/checker, Owner final decisions, session-bound step-up review, pending-approval queue and correlation-linked audit events are source-added. Remaining: complete the remaining step-up conversions and extend maker/checker to other consequential domains; finish object/field-level detail authorization and queue coverage (Batch 42 adds metadata-only privacy/security queues and audited detail reads); expand bulk workflows; run PostgreSQL/API/concurrency/browser/mobile/accessibility and independent security acceptance. |
| Stage 12 — Finance | Incomplete | Finance workflows require remaining implementation, accounting reconciliation, provider evidence and controlled acceptance. Live money movement remains disabled. |
| Stage 13 — Communications | Incomplete | Delivery, consent, retries, privacy and external-provider acceptance remain. External publishing remains disabled. |
| Stage 14 — Security/privacy | Incomplete | Full API/object/field/tenant authorization matrix, independent security/privacy reviews and incident controls remain. |
| Stage 15 — UX/accessibility | Incomplete | Full responsive and WCAG 2.2 AA browser/accessibility acceptance remains. |
| Stage 16 — Technical architecture | Incomplete | Backup/restore proof, RPO/RTO approval, observability and operational acceptance remain. |
| Stage 17 — Governance | Documentation consolidated; acceptance open | Per-requirement mapped test/technical evidence and independent review are still incomplete. |
| Batches 18–21 | Source changes present; acceptance open | Admin overview, audit explorer, filters and initial query tests. |
| Batch 22 | Source task + tests complete; acceptance open | Strict audit query allowlist, scalar validation, outcome allowlist; 16/16 Node tests pass. |
| Batch 23 | Support queue ownership source increment complete; acceptance open | Minimal queue DTO, support/admin scoping, bounded query parser, active verified support assignee validation, row-locked transactional assignment + audit; combined policy suite 32/32 and static guard pass. Full typecheck/API/DB/browser acceptance blocked/pending. |

## Original approved Stages 1–17

The refreshed stage-by-stage implementation and acceptance status is maintained in [`ROADMAP_1_TO_17.md`](ROADMAP_1_TO_17.md) and the dated progress matrix in [`IMPLEMENTATION_PROGRESS_2026-11-14.md`](IMPLEMENTATION_PROGRESS_2026-11-14.md). All 17 original stages remain below independent acceptance; none is declared `VERIFIED_COMPLETE`.

## Current evidence boundaries
- Traceability: 166 unique requirement IDs and referenced source/candidate test paths validate. Candidate test paths are not proof that each requirement is covered.
- Evidence matrix: 166 rows validate; independent acceptance and release evidence remain explicit.
- Migrations: 17 ordered migration files validate; no migration was applied in this checkpoint.
- Static guards: admin overview and audit explorer guards pass.
- Full typecheck/build/Vitest/PostgreSQL/API/browser/accessibility/independent reviews: not run or not accepted in this environment. The full source verifier is blocked because TypeScript dependencies are not installed in this extracted archive.
- Production release: blocked; no production authorization is implied by this archive.


## Batch 24 — Admin claims, disputes and appeals queues

- Added read-only paginated `/api/admin/claims`, `/api/admin/disputes`, and `/api/admin/appeals` endpoints.
- Claims are Admin-only; disputes and appeals are Admin/Trust & Safety, consistent with their existing workflow roles. Owner is not automatically granted sensitive case-level access.
- Queue query filters are strict and bounded. DTOs exclude claimant IDs, sensitive evidence/ownership summaries, dispute narratives/resolutions, appeal grounds/reviewer notes and submitter/reviewer IDs.
- Node-native policy tests passed 45/45 across audit, support and Admin queue policies. Admin queue static guard, support ownership guard, traceability, migration metadata, evidence matrix, Admin overview and audit explorer guards passed.
- TypeScript typecheck remains blocked by missing Node/Vite type definitions. PostgreSQL/API/browser/accessibility and independent acceptance remain pending. No migrations or production operations were performed.
- Batch 24 status: `IMPLEMENTED_UNVERIFIED`; Stage 11 remains `PARTIAL`.


## Batch 25 — Admin/Owner capability matrix

- Added `shared/admin-access-policy.mjs` and `GET /api/admin/capabilities` for role-derived capability discovery. Batch 27 supersedes this initial matrix: Owner is the final authority across every declared Admin capability, including protected case/evidence, finance, Trust & Safety, Support and operational data, subject to authentication and audit controls.
- Added a role-aware capability summary to the authenticated workspace and metric source/window/status definitions to the Admin/Owner overview.
- Combined Node-native Admin-access, Admin-queue, support-queue and audit-query tests: **48/48 passed**. Capability, Admin queue, support, overview, audit explorer, traceability, migration metadata and evidence matrix static checks passed.
- Dependency installation timed out; TypeScript, Vitest and build remain unavailable. PostgreSQL/API/browser/accessibility and independent acceptance remain pending. Other bulk actions and complete high-risk re-authentication remain unimplemented.
- Batch 25: `IMPLEMENTED_UNVERIFIED`. Stage 11 remains `PARTIAL`.


## Batch 26 — Privileged step-up authentication

- Added single-use five-minute step-up grants bound to the authenticated user and exact session, with action-specific purposes for report publication, rejection and closure.
- Added Admin-only OTP request and verification endpoints, using existing verified-email delivery, constant-time OTP comparison, attempt limits, action-specific challenge purposes and transactional challenge/grant consumption.
- Protected the three consequential report status transitions with step-up middleware and added an Admin UI request/verify panel.
- Added migration 0012 and updated migration journal to 13 ordered migrations; no migration applied.
- Combined dependency-free Node policy tests: 51/51 pass; all existing Admin/support/audit static guards, traceability, migration metadata and evidence matrix checks pass.
- Batch 26 is `IMPLEMENTED_UNVERIFIED`; Stage 11 remains `PARTIAL`. Maker/checker separation, broader queue/detail coverage, full TypeScript/Vitest/build, PostgreSQL/API/browser/accessibility and independent acceptance remain open.


## Batch 27 — Two-role administrative authority (2026-11-15)

**Source implementation added; database/runtime acceptance pending.** The administrative model is consolidated to exactly two application-visible privileged roles: `admin` and `owner` (Super Admin). Legacy delegated scopes (`finance`, `trust_safety`, `support`, and communications subroles) are normalized to `admin` at authentication and have a migration prepared to revoke their separate active role rows after granting canonical Admin. The legacy PostgreSQL enum labels remain for compatibility until a separately reviewed schema cleanup; they are not exposed as application `Role` values.

Owner is the final authority: server-side `requireRole` grants Owner access to privileged role-gated operations, and the capability catalogue exposes every declared capability to Owner. Admin retains operational access but cannot exercise Owner-only legal approval. Customer, Finder, Agent and organisation roles are unchanged. Audit, step-up, and workflow-specific controls remain applicable; Owner authority is not an audit bypass.

**Migration:** `0013_two_privileged_admin_roles.sql` is prepared and NOT applied. **Implemented in the consolidated Stage 11 continuation:** report maker/checker proposal and approval workflow; Owner final-decision workflow UI; approval queue; report-decision step-up. Broad operational queue detail authorization and comprehensive step-up coverage remain pending.

**Verification boundary:** role-policy tests and static guards are source-level only. TypeScript, Vitest, database migration, API integration, concurrent authorization, browser and independent security acceptance remain pending.


## Batch 27 — Two-role administrative authority

- Canonical application-visible privileged roles are exactly `admin` and `owner` (Super Admin). Customer, Finder, Agent and organisation roles remain unchanged.
- Legacy delegated roles normalize to Admin at authentication. A migration adds canonical Admin to legacy scope holders (unless they already have Admin or Owner), then revokes the legacy active role rows. Legacy PostgreSQL enum labels remain only for migration compatibility.
- Owner is final authority across all privileged `requireRole` gates and all declared capability-matrix entries. Admin has operational authority but cannot perform Owner-only legal approval. Explicit handler-level checks were updated so Owner authority is not accidentally blocked.
- Role-grant CLI now provisions only canonical Admin/Owner and customer/Agent roles.
- Combined dependency-free Node policy tests: **57/57 passed**. Two-role policy, access matrix, step-up, queue, support and audit static guards pass except the source type verifier which is blocked by missing TypeScript dependency.
- Migration 0013 is prepared, not applied. TypeScript/build/Vitest, DB migration/runtime, API/concurrency, browser/mobile/accessibility and independent security acceptance remain pending. Maker/checker and comprehensive step-up remain open.


## Consolidated Stage 11 governance implementation — 15 November 2026

- Corrected route authorization normalization: historical operational scope gates now map to canonical Admin; Owner remains final authority; Owner-only gates remain Owner-only.
- Added report decision maker/checker workflow: Admin proposals, distinct Admin or Owner reviewer, Owner direct final decision, 48-hour expiry, step-up for review, stale-state revalidation, and transactional decision/audit writes.
- Added pending approval queue API and workspace review controls.
- Added migration `0014_admin_action_approvals.sql`; migration is prepared but NOT applied.
- Remaining Stage 11 work: extend maker/checker to other consequential domains; full detail-field authorization review; full operational queue coverage; comprehensive step-up coverage; DB/API concurrency/browser/mobile/accessibility and independent security acceptance.
- No requirements are marked VERIFIED_COMPLETE by this source change alone.


## Consolidated Stage 11 continuation — Maker/checker and authorization correction

- Corrected `hasRoleAuthority` to normalize historical route-scope declarations as well as authenticated user roles. Canonical Admin now inherits former finance, Trust & Safety, support and communications route gates; Owner remains final authority; Owner-only gates remain Owner-only.
- Removed a remaining direct legacy Trust & Safety role check from private evidence access; central Admin authority is used instead.
- Added report decision proposals for publish/reject/close. Admin proposals expire after 48 hours and require a different Admin or Owner to review. Admin self-review is denied server-side and disabled in the UI.
- Owner can make and finally decide their own report decision after action-specific step-up.
- Added pending approval API and UI; review requires session-bound single-use step-up; report and approval state are re-locked/revalidated and decision plus audit are committed in one transaction. Notifications are attempted only after commit.
- Added audit correlation IDs for these consequential decision events and migration `0014_admin_action_approvals.sql` (also adds `audit_events.correlation_id`).
- Static/policy checks pass; migration remains unapplied. TypeScript/build/Vitest, PostgreSQL/API concurrency, browser/device/accessibility and independent security acceptance remain pending. Stage 11 is not declared complete.

## Batch 29 — Two-role consistency and privileged role provisioning
- [x] Finance assessment detail authorization uses canonical Admin/Owner authority.
- [x] Demo role selector exposes only Claimant, Finder, Agent, Organisation, Admin and Super Admin (Owner); no legacy delegated admin role choices.
- [x] Admin demo workspace groups finance, Trust & Safety, communications and support as operational responsibilities.
- [x] Owner bootstrap is restricted to the configured first Owner account when no active Owner exists.
- [x] Routine Admin grants/revocations are available only through the Owner-authenticated workspace, with step-up, reason, audit and session invalidation.
- [ ] Database/API tests and independent verification of role provisioning remain pending.


### Batch 29 continuation — Owner-controlled Admin account lifecycle
- [x] Owner-only account lookup by exact email.
- [x] Owner-only Admin grant with reason, fresh step-up and audit.
- [x] Owner-only Admin revocation with reason, fresh step-up, session invalidation and audit.
- [x] Prevent self-grant, duplicate Admin, and mutation of the Owner role through the Admin role manager.
- [x] Remove routine Admin grant from CLI; retain one-time Owner bootstrap only.
- [ ] PostgreSQL concurrency/API authorization/browser and independent security acceptance remain pending.


## Batch 30 — Additional high-risk step-up controls (15 November 2026)
- [x] Owner-only Agent agreement legal approval requires a distinct step-up purpose and fresh verification.
- [x] Communications campaign approval by Admin or Owner requires fresh step-up; writer/checker separation remains enforced and external publishing remains disabled.
- [x] Organisation status changes require Admin/Owner authority, a reason, fresh step-up, row lock, and transaction-coupled audit with correlation ID.
- [x] Step-up purpose choices added to the Admin/Owner workspace; policy tests and static guard added.
- [ ] Make step-up grant consumption atomic with each protected business transaction where feasible.
- [ ] Complete full typecheck/build/Vitest, PostgreSQL/API/concurrency, browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. These source changes do not establish independent acceptance or production readiness.


## Batch 31 — Expanded high-risk verification and Owner final authority (15 November 2026)
- [x] Add action-specific step-up purposes for evidence review, dispute resolution, Agent status/assignments, pricing approval and key finance review/approval/execution/reconciliation operations.
- [x] Enforce step-up at the matching route layer while preserving existing role checks and business gates.
- [x] Expose the added step-up purposes in the Admin/Owner workspace.
- [x] Permit Owner final approval of own refund/payout requests, pricing schedules and communications campaigns; keep Admin self-approval blocked and audit Owner overrides.
- [ ] Make step-up grant consumption atomic with each protected business transaction.
- [ ] Complete full maker/checker review across all consequential workflows, remaining queue/detail authorization and expanded bulk operations.
- [ ] Complete TypeScript/Vitest/build, PostgreSQL/API/concurrency, browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. No requirement is VERIFIED_COMPLETE from this source batch alone.


## Batch 32 — Transaction-coupled step-up consumption (15 November 2026)
- [x] Transaction-bound, row-locked, purpose/user/session-specific grant consumption helper.
- [x] Non-consuming transactional step-up preflight middleware.
- [x] Atomic grant consumption added to six transactional workflows: evidence review, dispute resolution, assignment create/cancel, Owner direct report decision and report approval review.
- [ ] Remaining non-transactional step-up routes still consume before the business transaction and require refactoring.
- [ ] PostgreSQL locking/rollback/replay/expiry integration proof, full typecheck/build/Vitest, API/browser/mobile/accessibility and independent security acceptance remain pending.

Stage 11 remains PARTIAL. No production action or migration was performed.


## Batch 33 — Combined transactional step-up and governance hardening (15 November 2026)
- [x] Convert refund reconciliation and payout reconciliation to transaction-coupled grant consumption after locked-record eligibility checks.
- [x] Convert organisation status changes to transaction-coupled grant consumption.
- [x] Convert pricing schedule approval to locked revalidation and atomic grant/state/audit transaction.
- [x] Convert communications campaign approval to locked revalidation and atomic grant/campaign/publication/audit transaction; external publishing remains disabled.
- [x] Extend transactional step-up source guard to 11 workflows across Batches 32–33.
- [ ] Convert remaining Agent status, finance review/approval/execution, legal approval and Admin role lifecycle routes.
- [ ] Add PostgreSQL integration tests for lock contention, grant replay, expiry, rollback restoration and business-write atomicity.
- [ ] Complete full typecheck/build/Vitest, API authorization/concurrency, object/field access, browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. No migrations or production operations were performed.


## Batch 34 — Combined finance and administrative governance hardening (15 November 2026)
- [x] Convert Agent status changes to transaction-coupled step-up consumption with row lock, role changes and audit in one transaction.
- [x] Convert collection reconciliation review to transaction-coupled grant consumption and audit.
- [x] Convert refund approval to locked, revalidated maker/checker/Owner-final approval with atomic grant, state and audit.
- [x] Convert payout approval to locked, revalidated maker/checker/Owner-final approval with atomic grant, state and audit.
- [x] Convert Owner Admin grant/revoke to transaction-coupled grant consumption alongside role/session/audit changes.
- [x] Extend transactional step-up source guard to 17 workflows across Batches 32–34.
- [ ] Convert remaining finance verification and Owner legal-approval routes where a local transaction can safely contain the protected operation.
- [ ] Design and test provider-execution step-up/idempotency boundaries; do not claim remote calls can be atomic with SQL.
- [ ] Add PostgreSQL lock contention, replay, expiry and rollback-restoration tests; full typecheck/build/Vitest; API/browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. No production actions or migrations were performed.


## Batch 35 checkpoint — 15 November 2026

- [x] Payout destination verification now uses transaction-coupled step-up consumption with a locked pending record and transactional audit.
- [x] Reward authorization verification now consumes the grant in the settlement/journal transaction after eligibility checks.
- [x] Owner-only Agent agreement legal approval now consumes the grant on the same PostgreSQL transaction as the legal approval and audit.
- [x] Transactional source guard covers 21 workflows across Batches 32–35.
- [ ] Provider refund/payout execution remains separately gated; local SQL transactions cannot make a remote provider call atomic. Provider idempotency/outbox and runtime acceptance remain open.
- [ ] PostgreSQL integration/concurrency tests, full semantic typecheck/build/Vitest, API/browser/mobile/accessibility and independent security acceptance remain pending.

Stage 11 remains PARTIAL. Production release remains blocked; no migrations or production/provider/money/publication/release operations were performed.


## Batch 36 — Transactional provider reservations and Agent-document governance (15 November 2026)

- [x] Refund execution now validates the grant without consuming it, locks/revalidates the refund, original-payer payment and claim, then consumes the grant in the same transaction as the `approved` → `submitting` reservation.
- [x] Payout execution now validates step-up before handler execution and consumes it using the PostgreSQL client inside the same transaction as the payout reservation and settlement update; reservation rollback restores the grant.
- [x] Refund provider initiation now transmits the persisted refund idempotency key (the key already has a unique database index); this reduces duplicate-submission risk but does not establish the provider's idempotency contract.
- [x] Admin Agent-document review and deletion now require distinct action-specific step-up purposes, consumed in the same transaction as document state and audit changes.
- [x] Transactional source guard now covers 25 workflows; combined Node policy suite passed 67/67; all listed Admin governance guards passed; five changed TS/TSX files passed syntax transpilation.
- [ ] Provider API idempotency contract, outbox/recovery, timeout/ambiguous-result reconciliation and sandbox acceptance remain pending. Remote provider calls are not part of the SQL transaction.
- [ ] Object-store deletion failure/retry acceptance, PostgreSQL grant replay/expiry/lock contention/rollback tests, full semantic typecheck/build/Vitest, API/browser/mobile/accessibility and independent security acceptance remain pending.

Stage 11 remains PARTIAL. No migrations, production database changes, provider calls, money movement, deployment, external publishing or item release were performed.

## Batch 37 checkpoint — Durable provider-operation intent (15 November 2026)

- [x] Refund and payout reservations now create durable provider-operation outbox records in the same database transaction as their local submission reservations and step-up consumption.
- [x] Dispatch start and provider outcomes/references are recorded; verified payout status and manual reconciliation update outbox resolution.
- [x] Admin/Owner read-only attention queue exposes only operational identifiers/status metadata for reserved, dispatching and unknown operations. No automatic retry or resubmission path is provided.
- [x] Added migration `0015_provider_operation_outbox.sql` and Drizzle schema; migration metadata now lists 16 ordered migrations.
- [x] New provider-outbox source guard passed; combined Node policy suite passed 67/67; existing Admin, support, step-up, traceability and evidence guards passed.
- [ ] PostgreSQL migration/runtime/crash-window/replay/concurrency acceptance and IntaSend idempotency-contract verification remain pending. Full semantic typecheck/build/Vitest, API/browser/mobile/accessibility and independent security acceptance remain pending.

Stage 11 remains PARTIAL. Migration 0015 is prepared but unapplied. No production/provider/money/publication/deployment/release operations were performed.


## Batch 38 — Provider crash recovery and private-document deletion recovery (15 November 2026)
- [x] Add a bounded provider-operation recovery sweep that marks stale `reserved`/`dispatching` operations `unknown` after five minutes, using `FOR UPDATE SKIP LOCKED`; it never retries or contacts the provider.
- [x] Add a private-document storage-deletion outbox; document soft-delete, storage-key enqueue and audit are atomic.
- [x] Add strict idempotent object deletion worker with bounded exponential retry, eight-attempt dead-letter threshold and stale processing-lease recovery.
- [x] Add privacy-minimized Admin/Owner storage-deletion attention queue; storage keys are not exposed.
- [x] Migration `0016_document_storage_deletion_outbox.sql` and migration journal entry prepared; migration remains unapplied.
- [x] Batch 38 recovery source guard, provider outbox guard, migration metadata, evidence matrix and traceability checks passed; combined Node policy suite 67/67 passed.
- [ ] PostgreSQL migration/runtime/concurrency/crash-window tests, object-storage failure/retry tests, full semantic TypeScript check/build/Vitest, API/object-field authorization, browser/mobile/accessibility and independent security acceptance remain pending.

Stage 11 remains PARTIAL. No migration or production/provider/money/publication/deployment/release operation was performed.

## Batch 39 — 15 November 2026

- [x] Add opt-in disposable PostgreSQL integration tests for provider/document outbox and step-up transaction invariants (harness implemented; execution skipped without `TEST_DATABASE_URL`).
- [x] Add focused Admin/Owner and Agent-document object-scope source guard.
- [x] Re-run source policy, recovery, outbox, transactional step-up, migration, evidence and traceability checks.
- [ ] Execute PostgreSQL integration tests against a disposable PostgreSQL instance.
- [ ] Complete exhaustive Admin object/field authorization review and independent security acceptance.
- [ ] Complete full dependency-backed typecheck, Vitest/build, browser/mobile/accessibility acceptance.
- [ ] Production release remains blocked; no migration or live operation is authorized by this batch.


## Batch 40 — 15 November 2026

- [x] Update disposable PostgreSQL integration tests to apply the actual repository migrations 0015 and 0016 in an isolated schema.
- [x] Add coverage for migration constraints, rollback, idempotency, grant identity/session/purpose/expiry, concurrent grant consumption, stale provider recovery, no automatic retry of unknown outcomes, document deletion deduplication/dead-letter and lease recovery.
- [x] Add Batch 40 authorization/outbox source guard and include it in `verify:all`.
- [ ] Execute all nine PostgreSQL tests against a disposable PostgreSQL database (`TEST_DATABASE_URL` not configured; all skipped).
- [ ] Run actual worker tests with disposable object storage; finish exhaustive Admin object/field authorization review.
- [ ] Restore dependencies and run full TypeScript, Vitest, production build, browser/mobile/accessibility and independent security acceptance.

Stage 11 remains PARTIAL. Migrations 0015 and 0016 remain unapplied. Production release remains blocked.


## Batch 41 — 16 November 2026

- [x] Require action-specific step-up for Admin/Owner privacy data-rights decisions; row-lock and revalidate the request, then consume the grant, update state and write audit in one transaction.
- [x] Require action-specific step-up for Admin/Owner security incident updates; row-lock and revalidate the incident, then consume the grant, update state and write audit in one transaction.
- [x] Add both purposes to OTP challenge mapping, shared allowlist and Admin/Owner workspace.
- [x] Add source guard and policy regression test; combined Node policy suite 68/68; 27 transactional step-up workflow paths source-checked.
- [ ] PostgreSQL/API concurrency and rollback acceptance; full typecheck/Vitest/build; browser/mobile/accessibility and independent security acceptance remain pending.

Stage 11 remains PARTIAL. No migration, production database, provider, money, deployment, external publication or item-release operation was performed.


## Batch 42 — 16 November 2026

- [x] Split privacy-request queues from narrative detail: metadata-only paginated queue, separately authorised detail endpoint and audited detail reads.
- [x] Split security-incident queues from narrative detail: metadata-only paginated queue with status/severity filters, separately authorised detail endpoint and audited detail reads.
- [x] Add Admin/Owner Restricted Governance UI for privacy and incident review using existing purpose-specific step-up workflows.
- [ ] Tests, typecheck, build and runtime acceptance intentionally deferred while implementation continues, per user direction.
- [ ] Complete remaining Admin object/field/tenant authorization review and independent security/accessibility acceptance.

Stage 11 remains PARTIAL. No migration, production database, provider, money, deployment, external publication or item-release operation was performed.


## Batch 43 — Restricted dispute and appeal workspaces

- Added Admin/Owner-only restricted dispute and appeal detail endpoints, metadata-only queue preservation, audited detail reads and a read-only case workspace with status filters.
- No case assignment migration was added because the shared assignment lifecycle and reviewer ownership policy require design approval. The new case-detail workspace is read-only; the existing appeal decision route now requires transaction-bound purpose-specific step-up.
- Batch 43 non-PostgreSQL verification: 156 TypeScript/TSX syntax transpilation checks with zero diagnostics; 74/74 Node-native tests; Batch 43 static guard 12/12; transactional step-up guard covers 28 workflows; prior source guards pass; traceability 166 IDs, evidence matrix 166 rows and migration metadata 17 ordered migrations pass.
- Full TypeScript blocked by missing `@types/node` and `vite/client`; project-local source verifier blocked by missing TypeScript package. PostgreSQL intentionally not run. Vitest/build, API/browser/accessibility and independent acceptance remain pending.
- Stage 11 PARTIAL; production release blocked.


## Batch 51 update — 2026-11-16 (follow-on to Batch 50)

Batch 51 combines claim queue privacy, restricted claim detail, detail-read audit and claimant/reviewer separation. The authoritative batch evidence is `BATCH51_COMBINED_CLAIM_GOVERNANCE.md`. This is a follow-on delta; historical Batch 49/50 counts elsewhere in this roadmap are not retroactively changed. Stage 11 remains PARTIAL. Database/API runtime, browser/accessibility and independent acceptance remain pending.

---

## 16 November 2026 — Combined Batches 52–54 update

| Batch | Scope | Source status | Acceptance status |
|---|---|---|---|
| 50 | Finance evidence matching | Complete in baseline archive | Runtime/independent acceptance outstanding |
| 51 | Claim queue privacy, restricted detail and reviewer separation | Implemented in baseline archive | PostgreSQL/API/browser/independent acceptance outstanding |
| 52 | Claim and collection handover maker/checker safeguards | Implemented in this combined archive | Runtime and independent acceptance pending |
| 53 | Additional purpose-specific step-up controls for claim, collection and Agent code workflows | Implemented in this combined archive | Runtime and independent acceptance pending |
| 54 | Append-only audit event trigger migration | Prepared in this combined archive | Migration not applied; PostgreSQL trigger acceptance pending |
| 55 | Complete route/action/object/field/tenant permission matrix | Pending | Not started |
| 56 | Owner dashboard and remaining queue/detail coverage | Pending | Not started |
| 57 | Integrated PostgreSQL/API acceptance | Pending | Blocked on disposable test database and runtime setup |
| 58 | Browser/accessibility and independent acceptance | Pending | Not started |

Stage 11 remains **PARTIAL**. Source implementation is not equivalent to runtime verification, independent acceptance, or production authorization.
