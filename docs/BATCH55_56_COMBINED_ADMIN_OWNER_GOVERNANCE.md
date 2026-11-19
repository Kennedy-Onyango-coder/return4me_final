# Batches 55–56 — Combined Admin permission inventory and Owner oversight

**Date:** 16 November 2026  
**Baseline:** Combined Batches 52–54 archive  
**Scope:** source-level inventory of privileged routes, expanded capability catalogue, and an Owner-only aggregate oversight dashboard.

## Batch 55 — Admin/Owner permission inventory

- Added `docs/ADMIN_OWNER_PERMISSION_MATRIX_BATCH55.csv`.
- The inventory contains **122 privileged route declarations across 21 route files**, including **23 routes in `adminRouter`**.
- Each row records source file/line, HTTP method, mounted API path, role gate, authentication signal, read/write classification, step-up middleware signal, broad data classification, and whether an audit reference was found near the handler.
- Each row explicitly leaves object-level, field-level, tenant/organisation isolation and runtime acceptance pending until API/database negative and positive tests are run.
- Expanded the descriptive capability catalogue to include privacy requests, security incidents, Agent documents and operations, pricing governance, support management and finance oversight.
- Added `scripts/verify-batch55-56-owner-governance.mjs` to regenerate the route inventory and fail if a discovered privileged route lacks a detected authentication or role gate.

The inventory is a static source map, not a complete proof of authorization. Role gates do not by themselves prove that an individual object belongs to the caller's permitted scope, that every selected field is appropriate, or that tenant boundaries hold. The parser is also not a TypeScript AST/security analyzer. These questions remain explicit Batch 57 runtime acceptance items.

## Batch 56 — Owner-only oversight

- Added `GET /api/admin/owner-oversight`, protected by `requireRole("owner")`.
- Returns aggregate counts only: pending Admin proposals, active Admin role grants, audit events in the last 24 hours, open security incidents, open data-rights requests and notification failures.
- The endpoint does not return account identities, case IDs, evidence, narratives, provider references or financial balances.
- Each successful snapshot read records `owner.oversight_snapshot_viewed` in `audit_events`.
- Added an Owner-only dashboard panel in `src/App.tsx`. Admin users do not mount or call this Owner-only panel.
- The panel explains that active Admin grants are role assignments rather than deduplicated people and that aggregate counts are not compliance attestations.

## Verification

| Command | Result | Evidence level |
|---|---:|---|
| `node scripts/verify-batch55-56-owner-governance.mjs` | 9/9 checks passed; 122 route declarations inventoried | Static source inventory |
| `node --test scripts/test-batch55-56-owner-governance.mjs` | 6/6 passed | Node-native source/policy tests |
| `node --test scripts/test-*.mjs` | 125/125 passed | Complete Node-native script test suite |
| `node scripts/verify-batch51-claim-governance.mjs` | 10/10 passed | Static source assertions |
| `node scripts/verify-batch52-54-governance.mjs` | 16/16 passed | Static source assertions |
| `node scripts/verify-migrations.mjs` | 18 ordered migrations validated | Metadata only; no SQL executed |
| `node scripts/verify-traceability.mjs` | 168 IDs and referenced paths validated | Traceability consistency only |
| `node scripts/verify-evidence-matrix.mjs` | 168 rows validated | Evidence-matrix consistency only |
| `node scripts/verify-source.mjs` | Blocked | `typescript` package missing |

## Not verified / still pending

- Full TypeScript typecheck, Vite production build and Vitest.
- PostgreSQL execution of migration 0017 and database trigger behaviour.
- HTTP tests for Owner-only endpoint (Owner success; Admin, claimant and unauthenticated denial).
- Real response inspection to prove aggregate-only field projection.
- Object-level, field-level, row ownership and tenant/organisation isolation tests across all 122 privileged routes.
- API concurrency and maker/checker race tests.
- Browser integration, responsive layout, keyboard navigation and accessibility.
- Independent security review and Stage 11 acceptance.

## Safety boundaries

No migration was applied. No production database, provider, deployment, money movement, refund, payout, item release or external publication was performed. No commit or push was made. The prepared audit immutability migration 0017 remains unapplied.

**Stage 11 remains PARTIAL.** This batch completes a source-level route inventory and Owner oversight panel, not runtime or independent acceptance.
