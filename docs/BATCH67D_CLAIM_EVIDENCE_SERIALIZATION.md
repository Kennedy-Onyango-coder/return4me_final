# Batch 67D — Claim evidence lifecycle serialization

**Date:** 18 November 2026  
**Baseline:** `Return4me_Batches59-67C_Combined_Distributed_Rate_Limiting_2026-11-17.zip`  
**Scope:** CLAIM-001 / claim-evidence review and ownership-decision integration  
**Status:** Source implementation added; runtime and database verification deferred.

## 1. Finding

The evidence-review route previously locked the evidence/document rows but did not lock or re-check the parent claim status. Claim approval and evidence upload already serialize on the claim row. A reviewer could therefore potentially change an evidence decision after claim approval, or race an evidence review against the ownership decision.

## 2. Source change

Updated `server/routes/claim-evidence.ts`:

- Evidence review now locks the parent claim row first, before locking evidence/document rows.
- It follows the same parent-claim-first lock order used by claim approval and evidence upload.
- Evidence review is permitted only while the claim is `submitted` or `under_review`.
- A closed/decided claim returns HTTP 409 with direction to the authorised appeal/correction workflow.
- Missing claim/evidence remains a 404; evidence without a clean malware scan returns 409.
- Step-up grant consumption, reviewer attribution, document/evidence status updates and audit insertion remain transaction-bound.
- No schema or migration change was required.

This is a source-level concurrency correction. It does not prove PostgreSQL locking behavior until deferred race tests run.

## 3. Verification record

| Activity | Result |
|---|---|
| Baseline archive ZIP integrity | Passed (`unzip -t`; no archive errors) |
| Source inspection | Completed |
| Claim evidence route source change | Completed |
| Traceability/evidence/implementation register updates | Completed |
| Application tests | NOT RUN — deferred by user instruction |
| TypeScript / build / lint | NOT RUN |
| PostgreSQL lock/race tests | NOT RUN |
| API/browser/security/accessibility tests | NOT RUN |
| Migration replay | NOT RUN; no migration added |

No tests were run. No production migration, provider call, payment, message, item release, deployment, commit or push was performed.

## 4. Roadmap after Batch 67D

- Stages 1–10: PARTIAL — claim-evidence review/approval serialization improved; remaining report, claim, custody, Agent and organisation gaps remain.
- Stage 11: PARTIAL.
- Stage 12: PARTIAL.
- Stage 13: PARTIAL.
- Stage 14: PARTIAL.
- Stage 15: PARTIAL.
- Stage 16: PARTIAL — Batches 67A–67C source additions retained; runtime/operations acceptance pending.
- Stage 17: PARTIAL.
- Batch 67A: source added — distributed worker coordination.
- Batch 67B: source added — exact migration-journal readiness and shutdown closure.
- Batch 67C: source added — PostgreSQL shared public-directory rate limiting; migration 0022 prepared, unapplied.
- Batch 67D: source added — claim evidence review lock-order and post-decision mutation guard.
- Batch 67E onward: remaining source gaps across Stage 1–10 lifecycle and other partial requirements.
- Batch 68: final cross-stage integration and source freeze, only after source gaps are addressed.
- Batch 69: consolidated tests and independent acceptance after Batch 68 and explicit test authorisation.

All 173 independent acceptance decisions remain PENDING. No requirement is promoted to VERIFIED_COMPLETE. Production release remains NOT_AUTHORISED.

## 5. Next implementation batch — Batch 67E

Continue Stage 1–10 lifecycle review, prioritising the next concrete claimant/custody gap. Inspect report-to-claim transitions, claimant/representative evidence, dispute/appeal interactions and final handover surfaces. Select a bounded source change only after tracing the relevant route, schema, UI and governance rows. Preserve all existing payment, dispute, identity, custody-chain and release gates. Do not run tests until all implementation stages are complete.
