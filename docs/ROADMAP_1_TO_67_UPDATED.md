# Return4me master roadmap — updated through Batch 67J

**Date:** 21 November 2026  
**Source baseline:** Cumulative Batches 59–67C archive, with Batch 67D, 67E, 67F, 67G, 67H, 67I and 67J source additions recorded in this package.  
**Overall status:** Implementation in progress; not accepted and not production ready.

## Stage status

| Stage | Scope | Status after Batch 67J |
|---|---|---|
| 1–10 | Product foundations, identity, reports, claims, matching, custody, Agents, organisations and trust | PARTIAL — claim evidence review/approval and duplicate claim-submission serialization improved; remaining lifecycle and UI gaps remain |
| 11 | Admin and Owner governance | PARTIAL |
| 12 | Finance, ledger, settlement and reconciliation | PARTIAL |
| 13 | Communications and delivery governance | PARTIAL |
| 14 | Security, privacy, fraud and retention | PARTIAL |
| 15 | UX and accessibility | PARTIAL |
| 16 | Architecture and operations | PARTIAL — distributed worker locks, migration-journal readiness/shutdown, and shared directory rate limiting source-added; runtime verification pending |
| 17 | Governance and evidence | PARTIAL — traceability updated; independent evidence and approvals pending |

## Batch progression

| Batch | Work | Status |
|---|---|---|
| 59–65 | Finance, communications, security/privacy, UX, architecture, governance and Stage 1–10 foundations | Source additions retained; relevant stages remain partial/unverified |
| 66 | Cross-stage source inventory, integration seam register and source baseline snapshot | Completed as a documented snapshot; not final implementation freeze |
| 67A | PostgreSQL session advisory locks for same-named workers across API instances | Source added; runtime concurrency acceptance pending |
| 67B | Fail-closed exact ordered migration timestamp check in `/readyz`; close both DB pools on graceful shutdown | Source added; runtime database/API acceptance pending |
| 67C | Shared PostgreSQL rate limiting for public Agent directory; migration 0022 prepared | Source added; migration unapplied and runtime acceptance pending |
| 67D | Serialize claim evidence review with ownership approval/upload; reject evidence review after claim decision | Source added; PostgreSQL/API race acceptance pending |
| 67E | Serialize claim submissions per found report; prevent same-claimant duplicate active/completed claims and block submissions while an appeal is open, without preventing different-claimant competition | Source added; PostgreSQL/API/concurrency acceptance pending |
| 67F | Serialize Admin in-person claimant/representative collection checks against claim-state and Agent-assignment changes | Source added; PostgreSQL race and end-to-end handover acceptance pending |
| 67G | Serialize claimant confirmation, final Agent release and claim/report/assignment legal holds using a shared lock order; bind completion notification to the exact completed claim | Source added; PostgreSQL/API/concurrency/hold-race acceptance pending |
| 67H | Serialize appointment request/confirm/decline against claim, assignment and hold changes; make appointment audits atomic; correct current-assignment workspace indicators | Source added; PostgreSQL/API/concurrency/appointment-race acceptance pending |
| 67I | Serialize collection-code issuance with report/claim/assignment/appointment state; require current confirmed appointment, paid claim, current identity check and no active dispute/legal hold; expire code no later than appointment end | Source added; PostgreSQL/API/concurrency and delivery acceptance pending |
| 67J | Appointment expiry, cancellation/rescheduling, collection-authorisation invalidation, manual no-show and claimant-visible outcomes | Source added; GitHub CI passed on 21 November 2026; local/API/PostgreSQL/concurrency/browser and independent acceptance pending |
| 67K onward | Remaining source implementation gaps | Pending |
| 68 | Final cross-stage integration review and implementation freeze after source gaps close | Pending |
| 69 | Consolidated tests, controlled database replay, security/accessibility/performance verification and independent acceptance | Deferred until Batch 68 and explicit user authorization |

## Batch 67D implementation details

`server/routes/claim-evidence.ts` now locks the parent claim before locking evidence/document rows, using the same lock order as claim approval and evidence upload. Evidence review is limited to claims in `submitted` or `under_review`; attempts after a decision return 409. Step-up consumption, evidence/document updates and audit insertion remain in the same transaction. No migration was required.

This source change addresses a possible race in which evidence could be changed after claim approval. PostgreSQL concurrency proof, API tests, full typecheck/build and independent acceptance remain pending.

## Verification policy and current record

The baseline archive passed ZIP integrity inspection. Batches 67D–67I source and governance edits were made without runtime verification at that stage. Batch 67J was subsequently verified by GitHub Actions run 44818456352 on commit 0030ebd5a447952dd54162e2bd64e190aa3b14ed: verify:all (including the Batch 67J source verifier), typecheck, disposable CI database migration, 35 Vitest files / 168 tests, production build and npm audit --audit-level=high all passed. The build emitted the existing large-chunk warning; npm audit reported moderate-severity dependency findings but no high-severity failure. This CI run is not a substitute for local verification, dedicated appointment API/PostgreSQL concurrency/browser acceptance or independent acceptance.

No production migration, provider call, payment, refund, payout, message, publication, item release, deployment, commit or push was performed. Migration 0022 remains prepared and unapplied. All 173 independent acceptance decisions remain PENDING. Production release remains NOT_AUTHORISED.

## Next implementation work

Batch 67J source implementation is complete and its CI checks passed. Any remaining source gaps from the cumulative inventory must be addressed as Batch 67K onward before Batch 68. Batch 68 is not a substitute for implementation. Batch 69 may begin only after all source implementation work and Batch 68 freeze are complete, with disposable infrastructure and separately authorised provider sandbox credentials. Live provider operations and production actions remain disabled.


## Batch 67E implementation details

`server/routes/claims.ts` now locks the found-report row before checking publication eligibility and creating a claim. It then locks prior claims for the same claimant/report pair. Duplicate `submitted`, `under_review`, `approved`, `disputed` and `completed` claims are rejected with HTTP 409. A rejected claim with a still-open appeal also blocks a new submission. Rejected claims without an open appeal and cancelled claims remain retryable. The report lock serializes claim creation while allowing distinct claimants to submit competing claims. Claim insertion and audit insertion share a transaction; the reporter notification is invoked after commit. No schema or migration was required.

Source inspection only; all application/runtime/database/concurrency/security/UI verification remains deferred. CLAIM-001 and INT-017 remain unverified/partial pending the deferred verification programme and independent acceptance.


## Batch 67F implementation details

`server/routes/agent-operations.ts` now locks the approved claim and active assignment before recording the Admin's in-person collection identity/representative-authority check. Relationship-specific authority is rechecked while locked, and the check is written against the exact locked claim, claimant and assignment. Step-up grant consumption and audit insertion remain transaction-bound. This prevents a source-level race with claim-state changes or Agent reassignment. Existing independent authority verification, payment, appointment, claimant confirmation, dispute/legal hold and final release gates remain unchanged. CUST-004 remains IMPLEMENTED_UNVERIFIED and INT-007 remains NOT_VERIFIED pending the deferred PostgreSQL/API/concurrency/end-to-end verification.

No application tests, typecheck, build, lint, database, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. No production action, payment, item release, deployment, commit or push occurred.

**Next:** Batch 67G — inspect the final Agent release and claimant-confirmation transaction for races with assignment changes, stale appointments, dispute/legal holds and claim completion.


## Batch 67G implementation details

`server/routes/agents.ts` now serializes final release with a report -> approved claim -> assignment lock order, requires exactly one approved claim, checks active `privacy_legal_holds` for claim/report/assignment subjects in addition to release-holding disputes, and commits claim completion with the released custody event. The post-commit notification targets the exact completed claim's claimant. `server/routes/agent-operations.ts` now records claimant handover confirmation and audit atomically under the same lock order, rechecking payment, readiness, dispute and legal-hold gates. `server/routes/security-governance.ts` locks claim/report/assignment subjects before creating a hold, closing the hold-versus-release insertion race for those supported subject types. No schema or migration was required.

No tests, typecheck, build, lint, database, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. All remain deferred. CUST-004 remains IMPLEMENTED_UNVERIFIED; INT-004 and INT-007 remain NOT_VERIFIED. All 173 independent acceptance decisions remain PENDING; production release remains NOT_AUTHORISED.


## Batch 67H implementation details

`server/routes/agent-operations.ts` now serializes appointment request, confirmation and decline with report -> claim -> assignment locks, rechecks active claim/assignment/Agent and relevant dispute/legal-hold gates, and writes appointment audit records in the same transaction. `server/routes/agents.ts` scopes Agent work-queue claimant confirmation to the current assignment and prefers the current approved claim. Claimant assignment summaries now scope readiness/confirmation to the current Agent/custody segment and expose latest appointment status/time. `src/App.tsx` shows appointment report references/status and mentions legal holds in release guidance. No schema or migration change.

No tests, typecheck, build, lint, database, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. CUST-004 remains IMPLEMENTED_UNVERIFIED; INT-007 remains NOT_VERIFIED. All 173 independent acceptance decisions remain PENDING; production release remains NOT_AUTHORISED.


## Batch 67I implementation details

`server/routes/agent-operations.ts` now issues claimant collection codes under a consistent report -> claim -> assignment -> appointment lock order. Issuance rechecks the currently approved claim, current active verified Agent assignment, exact claim/assignment identity check, a confirmed future appointment beginning within 24 hours and ending in the future, provider-confirmed paid assessment, and absence of active release-holding disputes or legal holds on claim/report/assignment. The authorization expires at the earlier of 24 hours or the appointment end. Delivery failure invalidates only the authorization for that exact claim and assignment. This prevents stale, held or unpaid appointment contexts from receiving a usable code. No schema or migration change.

No tests, typecheck, build, lint, database, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. All remain deferred by instruction. Appointment cancellation/rescheduling/no-show lifecycle is not implemented by this batch and remains an open item for subsequent source work.


## Batch 67J implementation details

server/routes/agent-operations.ts now lazily expires overdue **requested** appointments by changing them to the existing cancelled status and writing an audit event in the same transaction when claimant or Agent appointment workspaces are loaded. The new-request path also expires an overdue request for that exact claim/assignment before checking for an active appointment. It does not introduce an expired status and does not automatically change confirmed appointments to no_show.

Claimants and the currently assigned active verified Agent may cancel a requested or confirmed appointment. A confirmed appointment cannot be cancelled after its scheduled end; only the currently assigned Agent may then record a no-show. Cancellation and no-show both invalidate any unused claimant_collection authorisation for the exact report, claim and assignment in the same transaction as the appointment outcome and audit event. Rescheduling is a fresh appointment request after cancellation; an active requested/confirmed appointment blocks another request.

The new manual no-show endpoint requires the current approved claim, active verified Agent assignment, exact appointment/claim/assignment binding, confirmed status and ends_at <= now(). It has no automatic timer, no grace period and no claimant/Admin no-show path. Claimant and Agent workspaces now expose appointment outcomes and the permitted actions.

No migration was added. The existing appointment status vocabulary is retained. Source-level tests and a dedicated source verifier were added. GitHub Actions run 44818456352 passed on commit 0030ebd5a447952dd54162e2bd64e190aa3b14ed: verify:all (including verify:batch67j), typecheck, disposable CI migration, 35 test files / 168 tests, build and npm audit --audit-level=high. The build retains the existing large-chunk warning and audit reports moderate findings only. Local verification, dedicated appointment API/PostgreSQL concurrency/browser testing and independent acceptance remain pending. All independent acceptance decisions remain pending and production release remains not authorised.
