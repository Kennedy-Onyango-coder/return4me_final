# Return4me master roadmap — Stages 1–23 and implementation batches through 57

**Updated:** 16 November 2026  
**Baseline:** Combined Batches 55–56 archive, extended with Batch 57 acceptance harness and report.

## Current checkpoint

Batches 55–56 provide a static inventory of 122 privileged route declarations across 21 route files and an Owner-only aggregate oversight dashboard. Batch 57 re-ran source checks and 125 Node-native tests, and prepared a disposable PostgreSQL integration harness for audit immutability. PostgreSQL tests were skipped because no disposable database runtime/URL is available. API, object/field/tenant and concurrency runtime acceptance remain open.

## Stage roadmap

| Stage | Status | Remaining acceptance / work |
|---|---|---|
| Stages 1–10 | Existing implementation; acceptance open | Requirement-level API, DB, browser and independent acceptance remain open. |
| Stage 11 — Admin/Owner governance | **PARTIAL** | Batches 50–56 source work exists; Batch 57 harness prepared but runtime blocked. PostgreSQL/API authorization, object/field/tenant checks, maker/checker concurrency, browser/accessibility and independent acceptance remain. |
| Stage 12 — Finance | PARTIAL | Ledger, provider evidence, settlement/payout/refund reconciliation and financial acceptance remain. Live money movement remains separately controlled. |
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
| 57 | PostgreSQL/API authorization/concurrency acceptance | **PARTIAL — harness prepared; DB/API execution blocked** |
| 58 | Browser, accessibility, independent security and Stage 11 acceptance | Pending |

## Batch 57 verification checkpoint

- `node --test scripts/test-*.mjs`: 125/125 passed.
- Batch 51 source guard: 10/10; Batch 52–54: 16/16; Batch 55–56: 9/9.
- Batch 57 acceptance-readiness guard: 6/6.
- 18 ordered migrations validated; none applied.
- Traceability: 168 unique IDs; evidence matrix: 168 rows.
- PostgreSQL harness prepared for migration 0017: five tests cover trigger creation, update/delete/truncate rejection, row preservation and insert permission.
- Existing PostgreSQL outbox/step-up harness contains nine further integration tests.
- All 14 PostgreSQL integration tests were skipped because `TEST_DATABASE_URL`, Docker and PostgreSQL runtime are unavailable. Skipped is NOT passed.
- Release check reports 27 outstanding gates.

## Next acceptance gates

1. Execute `npm run test:postgres-governance` against a disposable PostgreSQL database with `TEST_DATABASE_URL`; require all 14 tests to execute and pass.
2. Exercise API endpoints with unauthenticated, claimant, Admin and Owner identities; inspect actual HTTP status and response fields.
3. Test object ownership, field projections, organisation/tenant boundaries and negative-ID substitution across privileged routes.
4. Test maker/checker race conditions, step-up replay/expiry and collection-code concurrency.
5. Run typecheck/build and browser/accessibility checks in a dependency-complete environment.
6. Obtain independent security/privacy acceptance and separate production authorization.

**No stage is declared fully accepted or production-ready.** No production migration, deployment, provider call, money movement, refund, payout, item release or external publication is authorized by this archive.
