# Return4me master roadmap — Stages 1–23 and implementation batches through 58

**Updated:** 16 November 2026  
**Baseline:** Batch 57 complete project archive, extended with Batch 58 unresolved collection attention queue.

## Current checkpoint

Batches 55–56 provide a static inventory of 122 privileged route declarations across 21 route files and an Owner-only aggregate oversight dashboard. Batch 57 prepared PostgreSQL/API acceptance harnesses. Batch 58 adds a read-only, audited Admin/Owner queue and detail view for stale claimant collection attempts without provider invoice references. Per the user instruction, application tests are deferred until implementation across all stages is complete; no Batch 58 test results are claimed. PostgreSQL/API, object/field/tenant and concurrency acceptance remain open.

## Stage roadmap

| Stage | Status | Remaining acceptance / work |
|---|---|---|
| Stages 1–10 | Existing implementation; acceptance open | Requirement-level API, DB, browser and independent acceptance remain open. |
| Stage 11 — Admin/Owner governance | **PARTIAL** | Batches 50–56 source work exists; Batch 57 harness prepared. Remaining implementation includes completing route-by-route object/field/tenant authorization, any uncovered case ownership controls and Owner oversight requirements. Runtime/API/database/browser/independent acceptance is deferred until all-stage implementation is complete. |
| Stage 12 — Finance | PARTIAL | Batch 58 adds the missing unresolved collection-session attention queue. Provider contract/sandbox acceptance, ledger and historical snapshots, wallet/beneficiary verification, refund lifecycle, automated provider reconciliation and accounting acceptance remain. Live money movement remains separately controlled. |
| Stage 13 — Communications | PARTIAL | Delivery, consent, retries, privacy and provider acceptance remain. External publication remains disabled pending authorization. |
| Stage 14 — Security/privacy | PARTIAL | Independent security/privacy review, tenant isolation, data lifecycle, retention and incident controls remain. |
| Stage 15 — UX/accessibility | PARTIAL | Full responsive, keyboard and WCAG 2.2 AA browser acceptance remains. |
| Stage 16 — Technical architecture | PARTIAL | Typecheck/build, PostgreSQL runtime, backup/restore, observability, RPO/RTO and operations acceptance remain. |
| Stage 17 — Governance | PARTIAL | Evidence-to-test mapping, independent acceptance and release authorization remain. |
| Stages 18–23 | Historical incremental work | Preserve prior stage evidence; acceptance remains requirement-specific and not inferred from static guards. |

## Stage 11 batch tracker

| Batch | Scope | Status |
|---|---|---|
| 50 | Finance evidence matching | Source complete in baseline; acceptance open |
| 51 | Claim queue privacy and restricted detail | Source implemented; runtime acceptance open |
| 52 | Claim and collection maker/checker safeguards | Source implemented; concurrency/API acceptance open |
| 53 | Additional purpose-bound high-risk step-up | Source implemented; runtime acceptance open |
| 54 | Audit-event immutability migration 0017 | Prepared, **not applied**; disposable PG test harness added in Batch 57 but not run |
| 55 | Admin/Owner privileged route inventory and capability catalogue | Source inventory completed; object/field/tenant verification pending |
| 56 | Owner-only oversight dashboard | Source implemented; HTTP/browser acceptance pending |
| 57 | PostgreSQL/API authorization/concurrency acceptance harness | Prepared; execution deferred until all-stage implementation is complete |
| 58 | Unresolved collection attempts without provider invoice reference | Source implemented; tests deferred |
| 59 | Remaining Stage 12 finance lifecycle implementation | Pending |
| 60 | Stage 13 communications and notification lifecycle completion | Pending |
| 61 | Stage 14 security, privacy, fraud and incident-response source completion | Pending |
| 62 | Stage 15 UX, role journeys and accessibility implementation completion | Pending |
| 63 | Stage 16 architecture, observability, backup/restore and operational tooling | Pending |
| 64 | Stage 17 evidence governance, traceability and release controls | Pending |
| 65 | Stages 1–10 source-gap closure across product, identity, reports, matching, claims, agents, custody, organisations, Trust & Safety and public experience | Pending |
| 66 | Cross-stage source reconciliation, integration wiring and implementation freeze | Pending |
| 67 | Consolidated technical testing, browser/accessibility and independent acceptance | Pending; begin only after Batch 66 |
| 59 | Remaining Stage 12 finance source gaps | Pending |
| 60 | Remaining Stage 13–17 source implementation gaps | Pending |
| 61 | Cross-stage implementation reconciliation and source freeze | Pending |
| 62 | Consolidated technical testing, browser/accessibility and independent acceptance | Pending; run after implementation is complete |

## Batch 57 verification checkpoint (historical; Batch 58 tests intentionally deferred)

- `node --test scripts/test-*.mjs`: 125/125 passed.
- Batch 51 source guard: 10/10; Batch 52–54: 16/16; Batch 55–56: 9/9.
- Batch 57 acceptance-readiness guard: 6/6.
- 18 ordered migrations validated; none applied.
- Traceability: 168 unique IDs; evidence matrix: 168 rows.
- PostgreSQL harness prepared for migration 0017: five tests cover trigger creation, update/delete/truncate rejection, row preservation and insert permission.
- Existing PostgreSQL outbox/step-up harness contains nine further integration tests.
- All 14 PostgreSQL integration tests were skipped because `TEST_DATABASE_URL`, Docker and PostgreSQL runtime are unavailable. Skipped is NOT passed.
- Release check reports 27 outstanding gates.

## Eventual acceptance gates — do not start until all-stage implementation is complete

1. Execute `npm run test:postgres-governance` against a disposable PostgreSQL database with `TEST_DATABASE_URL`; require all 14 tests to execute and pass.
2. Exercise API endpoints with unauthenticated, claimant, Admin and Owner identities; inspect actual HTTP status and response fields.
3. Test object ownership, field projections, organisation/tenant boundaries and negative-ID substitution across privileged routes.
4. Test maker/checker race conditions, step-up replay/expiry and collection-code concurrency.
5. Run typecheck/build and browser/accessibility checks in a dependency-complete environment.
6. Obtain independent security/privacy acceptance and separate production authorization.

**No stage is declared fully accepted or production-ready.** Batch 58 application tests are intentionally not run at this implementation checkpoint. No production migration, deployment, provider call, money movement, refund, payout, item release or external publication is authorized by this archive.
