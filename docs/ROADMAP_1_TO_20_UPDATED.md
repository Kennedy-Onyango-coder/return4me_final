# Return4me Roadmap — Stages 1–21

**Updated:** 2026-11-14  
**Baseline archive:** `Return4me_Stages_1-18_AdminOverview_2026-11-14.zip`

## Stage status

| Stage | Scope | Current status |
|---|---|---|
| 1–3 | Core product, users and reporting | Source baseline present; requirement acceptance remains open |
| 4 | Matching | Source implementation reported; independent acceptance remains open |
| 5 | Claims | Partial; requirement-level acceptance remains open |
| 6 | Agent operations | Partial; requirement-level acceptance remains open |
| 7 | Contact and custody | Partial; requirement-level acceptance remains open |
| 8 | Organisations | Source implementation reported; independent acceptance remains open |
| 9 | Trust and safety | Partial; independent acceptance remains open |
| 10 | Public website and experience | Partial; UX requirements remain open |
| 11 | Admin Console and Owner Dashboard | Batch 18 operational aggregate indicators and Batch 19 read-only audit explorer added; queue coverage, separation-of-duties and acceptance remain open |
| 12 | Financial architecture | Partial; provider execution and financial controls require further technical and independent acceptance; live money movement remains disabled |
| 13 | Communications | Partial; external publishing remains disabled pending credentials, consent and acceptance |
| 14 | Security and privacy | Partial; independent security/privacy reviews and several operational proofs remain outstanding |
| 15 | UX and accessibility | Partial; WCAG and cross-browser acceptance not completed |
| 16 | Technical architecture | Partial; typecheck/build/runtime, backup-restore and operational acceptance remain outstanding |
| 17 | Governance | Evidence and governance documentation consolidated; independent acceptance not engaged |
| 18 | Admin overview hardening | Source changes added; static guard passed; runtime and independent acceptance pending |
| 19 | Admin/Owner audit explorer | Read-only API and workspace viewer added; static guard passed; API authorization, database, browser and independent acceptance pending |

## Evidence status

The source traceability matrix contains 165 requirements. Current recorded distribution remains:

- 135 `PARTIAL`
- 22 `IMPLEMENTED_UNVERIFIED`
- 8 `BLOCKED`
- 0 `VERIFIED_COMPLETE`

Batch 18 and Batch 19 additions do not automatically change the status of any requirement. The requirement matrix must only be advanced when the specific acceptance evidence exists.

## Batch 19 implementation detail

- `GET /api/admin/audit-events` is protected by authentication and `admin`/`owner` role checks.
- Pagination and filters are bounded and validated.
- Response deliberately omits metadata.
- Workspace UI is read-only and supports loading older events.
- Static guard: `scripts/verify-admin-audit-explorer.mjs`.

## Verification performed for this archive

Passed: traceability path check, migration metadata check, evidence matrix structure check, admin overview static guard, and admin audit explorer static guard.

Not run: full `npm run verify:all`, TypeScript typecheck, Vitest suite, production build, PostgreSQL integration, browser/accessibility review, independent security review and production release gate closure. Dependency installation timed out in this packaging environment; the archive is delivered without `node_modules`.

No migration was applied, no production data was changed, no provider calls or money movement were made, and no deployment occurred.


## Stage 20 — Audit Explorer Filters and Query Hardening

- **Source added:** Admin/Owner audit action, resource, outcome, and paired date filters; maximum 90-day server/client date window; audit chronology index migration `0011_audit_created_index.sql`; schema and static guard updated.
- **Technical verification:** static guard and migration metadata must be executed on this archive.
- **Acceptance:** PostgreSQL migration, authenticated role matrix, query-plan/performance, API edge cases, browser/accessibility and independent security review remain pending.
- **Release:** blocked; no migration applied and no production release authorised.

## Stage 21 — Audit query validation and executable tests

- Dependency-free query parser extracted from the Admin/Owner audit API.
- 11 Node-native boundary tests added and executed: 11 passed, 0 failed.
- Static audit-explorer guard updated and passed.
- Full typecheck, full Vitest suite, PostgreSQL/API integration, browser/accessibility and independent acceptance remain pending.
- No requirement status was promoted to `VERIFIED_COMPLETE`.
