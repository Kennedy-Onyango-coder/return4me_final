# Batch 67H — Appointment lifecycle and workspace state integrity

**Date:** 18 November 2026  
**Scope:** Stage 1–10 claimant/Agent appointment lifecycle and handover workspace  
**Status:** Source implementation completed; technical verification and independent acceptance pending.

## Gaps addressed

Appointment request and Agent confirmation/decline routes previously used standalone SQL updates/inserts without serializing against assignment cancellation/reassignment, claim decisions, disputes or legal holds. Confirmation checked only the appointment's Agent user and requested state; it did not revalidate that the Agent still held the active assignment, remained active/verified, or that the claim was still approved. Appointment request creation lacked a transaction-bound audit record. Claimant workspace indicators could also reflect an old custody segment or confirmation from a previous assignment.

## Source changes

### `server/routes/agent-operations.ts`

- Appointment request now resolves the claim/report, then locks report -> claim -> assignment/Agent and rechecks claimant ownership, approved claim state, active assignment, active verified Agent, a covering published availability window, no active release-holding dispute and no active legal hold on claim/report/assignment.
- Appointment insertion and audit record commit together. Overlap-trigger conflicts remain a controlled 409 response.
- Agent confirmation now locks report -> claim -> assignment/Agent -> appointment and verifies current Agent ownership, active/verified status, approved claim, requested state and a future appointment. Dispute/legal-hold gates are rechecked before confirmation; update and audit are atomic.
- Agent decline now requires the current active verified Agent, approved claim, active assignment and requested appointment; update and audit are atomic.
- Agent appointment listings now include the related report reference.
- Claimant assignment summaries now scope handover readiness to the current Agent/current custody segment and claimant confirmation to the exact active assignment; they expose the latest appointment status and time.

### `server/routes/agents.ts`

- Agent work-queue claim state now selects the current approved claim preferentially (otherwise the latest completed claim) and scopes claimant confirmation to the current assignment and claimant/Agent pair, avoiding stale cross-assignment confirmation indicators.

### `src/App.tsx`

- Agent appointment cards identify the report reference.
- Claimant appointment workspace displays the latest appointment status/time.
- Agent handover guidance now explicitly includes legal holds alongside dispute holds.

## Locking and policy notes

Appointment creation and Agent decisions use report -> claim -> assignment -> appointment ordering, consistent with Batch 67G final release and claimant confirmation. Assignment cancellation/reassignment locks the assignment and cancels existing requested/confirmed appointments; a concurrent appointment request/confirmation therefore either commits before cancellation and is then cancelled, or observes the inactive assignment and fails closed. No payment, release or settlement policy was changed.

## Verification record

No application tests, static verifier scripts, typecheck, lint, build, PostgreSQL connection, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. This follows the instruction to defer the verification programme until all source implementation stages are complete. Source inspection is not technical acceptance.

No schema or migration change. No production migration, provider call, payment, refund, payout, external notification, item release, deployment, commit or push occurred.

## Roadmap

Stages 1–10 and 11–17 remain **PARTIAL**. CUST-004 remains **IMPLEMENTED_UNVERIFIED**; INT-007 remains **NOT_VERIFIED**. All 173 independent acceptance decisions remain **PENDING**. Production release remains **NOT_AUTHORISED**.

## Next batch

Batch 67I continues cross-stage lifecycle review, focusing on appointment expiry/no-show handling, cancellation and rescheduling rules, claimant-facing visibility of Agent decisions, and ensuring collection-code issuance cannot use a stale or no-longer-current appointment. Verification remains deferred until implementation completion and Batch 68 source freeze.
