# Return4me master roadmap — Stages 1–23 and implementation batches through 56

**Updated:** 16 November 2026  
**Baseline:** `Return4me_Batches52-54_Combined_Stage11_Governance_2026-11-16.zip`

## Current checkpoint

Combined Batches 55–56 add a source-derived inventory of 122 privileged API route declarations across 21 route files and a new Owner-only aggregate oversight dashboard. The Admin/Owner capability catalogue is expanded. The route inventory explicitly marks object, field, tenant/organisation and runtime verification as pending; static middleware detection is not treated as acceptance.

## Stage roadmap

| Stage | Status | Remaining acceptance / work |
|---|---|---|
| Stages 1–10 | Existing implementation; acceptance open | Requirement-level API, DB, browser and independent acceptance remain open. |
| Stage 11 — Admin/Owner governance | **PARTIAL** | Batches 50–56 source work exists. PostgreSQL/API authorization, object/field/tenant checks, maker/checker concurrency, browser/accessibility and independent acceptance remain. |
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
| 54 | Audit-event immutability migration 0017 | Prepared, **not applied** |
| 55 | Admin/Owner privileged route inventory and capability catalogue | Source inventory completed; object/field/tenant verification pending |
| 56 | Owner-only oversight dashboard | Source implemented; HTTP/browser acceptance pending |
| 57 | Disposable PostgreSQL, API, authorization and concurrency acceptance | Pending |
| 58 | Browser, accessibility, independent security and Stage 11 acceptance | Pending |

## Batch 55–56 verification checkpoint

- 122 privileged route declarations inventoried across 21 route files; 23 declarations in `adminRouter`.
- All inventoried privileged routes had source-detected authentication and role gates.
- Owner oversight route is declared Owner-only, returns aggregate metrics and records a dedicated audit event.
- Owner-only UI panel is conditionally mounted for the Owner role.
- Node-native tests: 125/125 passed across `scripts/test-*.mjs`.
- Batch 55–56 focused tests: 6/6 passed.
- Batch 51 source guard: passed 10/10.
- Batch 52–54 source guard: passed 16/16.
- Migration metadata: 18 ordered migrations validate; none applied.
- Traceability: 168 unique requirement IDs and referenced paths validate; this is not proof of requirement coverage.
- Evidence matrix: 168 rows validate; independent acceptance remains open.
- TypeScript source verifier blocked because the `typescript` package is absent in the extracted environment.

## Current release and acceptance gates

1. Install dependencies only in a controlled disposable environment, then run TypeScript typecheck, Vite build and Vitest.
2. Run migration 0017 against disposable PostgreSQL; prove UPDATE, DELETE and TRUNCATE are rejected and normal INSERT works. Do not apply to production.
3. Exercise every privileged route class with unauthenticated, wrong-role, Admin and Owner identities.
4. Test object ownership, field projections, organisation/tenant boundaries and negative-ID substitution.
5. Test maker/checker race conditions, expired step-up grants, replay and concurrent reviewers.
6. Inspect Owner oversight HTTP responses and audit entries; verify no row-level personal or financial data leaks.
7. Complete browser, mobile/responsive, keyboard and accessibility testing.
8. Obtain independent security/privacy acceptance and separate production authorization.

**No stage is declared fully accepted or production-ready by this roadmap.** No production migration, deployment, provider call, money movement, refund, payout, item release or external publication is authorized by this archive.
