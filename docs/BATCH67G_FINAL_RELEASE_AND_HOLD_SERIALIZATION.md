# Batch 67G — Final release and legal-hold serialization

**Date:** 18 November 2026  
**Scope:** Stage 1–10 custody, claimant confirmation, dispute and legal-hold integration  
**Status:** Source implementation completed; technical verification and independent acceptance pending.

## Gaps addressed

The final Agent release and claimant confirmation paths did not share one explicit aggregate lock order. Claimant confirmation used a standalone insert followed by a separate audit insert, allowing confirmation/audit atomicity gaps and stale assignment association. The final release gate checked active dispute holds but did not query the Stage 14 `privacy_legal_holds` table. Legal-hold creation also inserted generic subject records without locking a claim, report or assignment subject, leaving a hold-versus-release race.

## Source changes

### `server/routes/agents.ts`

- Final release now locks the report, exactly one approved claim, and then the current assignment before evaluating release conditions.
- Final release fails closed unless exactly one approved claim exists for the report.
- The release gate checks provider-confirmed payment, Admin collection identity/authority check, consumed collection authorisation, current custody-segment readiness, claimant confirmation, active confirmed appointment, no active release-holding dispute, and no active legal hold targeting the claim, report or assignment.
- The claim completion update and `released` custody event remain in the same transaction; the completion update must return the expected row.
- Post-commit completion notification is addressed to the claimant of the exact completed claim, not an arbitrary claim selected by report ID.

### `server/routes/agent-operations.ts`

- Claimant handover confirmation now runs in one explicit transaction.
- It resolves the report, then locks report -> claim -> active assignment in the same order as final release.
- It rechecks claimant ownership, approved status, one active assignment, confirmed payment, current Agent readiness, absence of active release-holding disputes and absence of active legal holds.
- Confirmation insertion and audit insertion commit or roll back together. A late confirmation cannot be attached after claim completion or against a superseded assignment.

### `server/routes/security-governance.ts`

- Legal-hold creation locks the target row when `subjectType` is `claim`, `report` or `assignment` before inserting the active hold.
- Missing typed subjects return 404.
- This gives the hold creator and final-release transaction a common serialization point. Other generic subject types retain their existing governance behaviour and are not automatically wired into the item-release gate.
- The endpoint notice now explains that active claim/report/assignment holds block final item release where integrated; a hold record is not a legal determination.

## Locking and policy notes

The shared release lock order is report -> claim -> assignment. Dispute creation already locks the claim before changing it to disputed; a release that obtains the claim first can complete only before the dispute is committed, while a dispute that obtains it first changes the claim state and makes release fail closed. Legal-hold creation locks its exact supported subject. Assignment cancellation is serialized by the assignment lock. Expired appointments fail the existing time-window gate. No automatic release, payment, refund, settlement or payout behaviour was introduced.

## Verification record

No application tests, static verifier scripts, typecheck, lint, build, PostgreSQL connection, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. This follows the instruction to defer the verification programme until all source implementation stages are complete. Source inspection is not technical acceptance.

No schema or migration change. No production migration, provider call, payment, refund, payout, external notification, item release, deployment, commit or push occurred.

## Roadmap

Stages 1–10 and 11–17 remain **PARTIAL**. CUST-004 remains **IMPLEMENTED_UNVERIFIED**; INT-004 and INT-007 remain **NOT_VERIFIED**. All 173 independent acceptance decisions remain **PENDING**. Production release remains **NOT_AUTHORISED**.

## Next batch

Batch 67H continues the cross-stage source review, prioritising the appointment lifecycle and all transitions that can invalidate collection readiness (expiry, decline, cancellation, reassignment and service-location changes), then the matching claimant/Agent workspace state. Verification remains deferred until implementation completion and Batch 68 source freeze.
