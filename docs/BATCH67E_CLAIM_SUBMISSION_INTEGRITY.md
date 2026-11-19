# Batch 67E — Claim submission integrity

**Date:** 18 November 2026  
**Scope:** Stage 1–10 claim lifecycle source correction  
**Status:** Source implementation completed; technical verification and independent acceptance pending.

## Gap addressed

The claim creation route previously read a published found report and inserted a claim without a transaction lock or a same-claimant duplicate check. Two simultaneous requests from one claimant could therefore create duplicate claims. A new claim could also be submitted while the claimant's prior rejected claim still had an appeal under review.

## Source changes

`server/routes/claims.ts` now:

1. Starts a database transaction and locks the requested report row with `FOR UPDATE`.
2. Rechecks that the locked report exists, is a `found` report and remains `published`.
3. Preserves the self-claim restriction for the report submitter.
4. Locks prior claim rows for the same `(report_id, claimant_id)` pair.
5. Rejects another claim when a prior claim is `submitted`, `under_review`, `approved`, `disputed` or `completed`.
6. Rejects a new submission when a prior `rejected` claim has an appeal in `submitted` or `under_review` status.
7. Allows distinct claimants to submit competing claims for the same found report. Rejected claims without an open appeal and cancelled claims remain retryable.
8. Inserts the claim and `claim.created` audit event in the same transaction. The report submitter notification is invoked only after the transaction succeeds.

The report-row lock serializes claim-creation requests for the same report; the prior-claim-row lock coordinates the duplicate check with appeal decisions that lock the claim before reopening it. This is a source-level concurrency design, not a verified concurrency result.

## Files updated

- `server/routes/claims.ts`
- `docs/BATCH67E_CLAIM_SUBMISSION_INTEGRITY.md`
- `docs/ROADMAP_1_TO_67_UPDATED.md`
- `docs/IMPLEMENTATION_PROGRESS_2026-11-18.md`
- `docs/IMPLEMENTATION_REGISTER.md`
- `docs/REQUIREMENT_TRACEABILITY.csv`
- `docs/REQUIREMENT_EVIDENCE_MATRIX.csv`
- `docs/CROSS_STAGE_INTEGRATION_SEAM_REGISTER.csv`
- `docs/SOURCE_MANIFEST_BATCH67E.csv`
- `README_BATCH67E.txt`

## Verification record

No application tests, typecheck, build, lint, database connection, migration replay, API test, browser test, concurrency test, security test, performance test, accessibility test or provider sandbox test was run. This follows the instruction to defer testing until all implementation stages are complete. Source changes were inspected while preparing this batch; source inspection is not technical acceptance.

No migration or schema change was made. No production migration, provider call, payment, refund, payout, notification dispatch, publication, item release, deployment, commit or push occurred.

## Roadmap status

Stages 1–10 and 11–17 remain **PARTIAL**. CLAIM-001 remains **PARTIAL**; INT-017 remains **NOT_VERIFIED**. All 173 independent acceptance decisions remain **PENDING**. Production release remains **NOT_AUTHORISED**.

## Next batch

Batch 67F: inspect and close the next bounded representative-authority lifecycle seam across evidence, collection identity and handover. Preserve manual independent authority verification and existing payment/release policy. Do not run the deferred verification programme before all implementation stages and Batch 68 source freeze are complete.
