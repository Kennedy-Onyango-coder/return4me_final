# Change log — Batch 17 governance consolidation

**Date:** 14 November 2026

## Added

- `docs/REQUIREMENT_EVIDENCE_MATRIX.csv` with one row for each of the 165 approved requirement IDs and distinct status dimensions.
- `docs/CONFLICT_REGISTER.md` documenting stale Batch 16 evidence and source-baseline inconsistencies.
- `docs/RISK_REGISTER.csv` tracking deferred security, authorization, accessibility, DR, provider, finance, legal/privacy, storage and release risks.
- `docs/INDEPENDENT_ACCEPTANCE_TEMPLATE.md` and `docs/RELEASE_AUTHORIZATION_CHECKLIST.md`.
- `scripts/verify-evidence-matrix.mjs` and `npm run verify:evidence`.
- Updated `npm run verify:all` to include evidence-matrix validation.
- Updated roadmap, implementation register, README, build status and delivery manifest.
- Preserved the owner-supplied Batch 16 Cline report as a separately attributed evidence record.

## Changed

- Strengthened traceability validation to check that every cited implementation path and exact candidate test path exists; removed stale/nonexistent test paths and broad wildcard patterns from the traceability CSV.
- Kept all requirement statuses unchanged. No requirement was promoted to `VERIFIED_COMPLETE`.

## Verification

- `npm run verify:all`: PASS.
- `npm run typecheck`: BLOCKED by absent `@types/node` and `vite/client`.
- `npm test`: NOT RUN; Vitest is not installed.
- `npm run build`: BLOCKED at typecheck due missing dependencies.
- `npm run release:check`: FAIL-CLOSED with 27 outstanding gates.

No database migration, provider request, money movement, external publication or deployment was performed.


## Batch 19 — Admin/Owner audit explorer
- Added a role-protected, read-only audit event endpoint with bounded pagination and filters.
- Excluded audit metadata from the response projection.
- Added Admin/Owner audit activity viewer and static verification guard.
- Runtime, browser and independent acceptance remain pending.
