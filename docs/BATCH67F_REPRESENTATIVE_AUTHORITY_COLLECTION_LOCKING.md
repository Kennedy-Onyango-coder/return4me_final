# Batch 67F — Representative authority and collection-check serialization

**Date:** 18 November 2026  
**Scope:** Stage 1–10 claim-to-handover integration  
**Status:** Source implementation completed; technical verification and independent acceptance pending.

## Gap addressed

The Admin in-person claimant/representative collection-check route previously used a single `INSERT ... SELECT` without explicitly locking the approved claim and current active assignment. A concurrent claim-state change or Agent reassignment could race the check write, potentially associating the check with a stale assignment or a claim whose state changed during processing.

## Source change

`server/routes/agent-operations.ts` now:

1. Begins the existing PostgreSQL transaction and selects the approved claim plus its active assignment under `FOR UPDATE OF c,x`.
2. Rechecks the relationship-specific condition while those rows are locked: owner claims require `not_required`; represented claims require independently verified claim authority and `verified`.
3. Writes or updates `agent_collection_checks` against the exact locked claim, claimant and assignment IDs.
4. Consumes the Admin step-up grant and inserts the audit event in the same transaction.
5. Rolls back without recording a check when the approved claim/current assignment/authority conditions are not met.

This preserves the existing independent Admin/Trust & Safety representative-authority review, in-person identity check, separate collection-code issuer, payment confirmation, active appointment, claimant confirmation, dispute/legal hold and final Agent release gates. It stores no raw identity number and does not change the payment or release policy.

## Verification record

No application tests, typecheck, build, lint, PostgreSQL connection, migration replay, API, browser, concurrency, security, performance, accessibility or provider sandbox checks were run. This follows the instruction to defer testing until all implementation stages are complete. The change was inspected against the existing schema and route; this is source inspection, not technical acceptance.

No schema or migration change. No production migration, provider call, payment, refund, payout, external notification, item release, deployment, commit or push occurred.

## Roadmap

Stages 1–10 and 11–17 remain **PARTIAL**. CUST-004 remains **IMPLEMENTED_UNVERIFIED**; INT-007 remains **NOT_VERIFIED**. All 173 independent acceptance decisions remain **PENDING**. Production release remains **NOT_AUTHORISED**.

## Next batch

Batch 67G continues the Stage 1–10 custody and claimant-handover review, focusing on the remaining Agent release/claimant confirmation race and any stale appointment, assignment, dispute or legal-hold state transition. Preserve deferred testing until all source implementation stages and Batch 68 source freeze are complete.
