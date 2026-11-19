# Batch 25 — Stage 11 Admin/Owner capability matrix

Date: 2026-11-14

## Source implementation

- Added `shared/admin-access-policy.mjs` and declarations with a server-owned capability catalogue for Admin, Owner, Trust & Safety, Finance, Support and communications roles.
- Added authenticated `GET /api/admin/capabilities`; its own route is role-gated and derives the response from the freshly loaded session roles. It is a discovery/navigation aid only; every protected route remains authoritative.
- Added the Admin/Owner capability summary to the authenticated workspace. It distinguishes available and unassigned capabilities and warns that visibility does not grant access.
- Owner capability catalogue intentionally allows aggregate overview, read-only audit metadata and the explicitly owner-only Agent-agreement legal approval. It does not grant protected claim/dispute/appeal/evidence, finance, Trust & Safety, support, or operational-personal-data access.
- Added metric definitions to `/admin/overview`: source tables, current-snapshot/all-time scope and status definitions, plus explicit unavailable financial metrics.
- Added an Admin-only bulk `start_review` lifecycle for reports: strict selection/reason schema, read-only preview, explicit UI confirmation, row-lock/revalidation at execution, all-or-nothing transaction, and one audit event per changed report. It cannot publish, reject, approve ownership or bypass the ordinary review flow.
- Added dependency-free tests for Owner boundaries, Admin/Trust & Safety/Finance/Support role boundaries, unknown capabilities and fail-closed behavior.

## Verification

- Combined Node-native tests for Admin access policy, Admin queue policy, support queue policy and audit query: **48/48 passed**.
- Admin capability static guard: **PASS**.
- Admin queue static guard: **PASS**.
- Support ownership static guard: **PASS**.
- Admin overview static guard: **PASS**.
- Admin audit explorer static guard: **PASS**.
- Traceability validator: **PASS**, 165 unique requirement IDs; path existence is not coverage proof.
- Migration metadata: **PASS**, 12 ordered migrations; no migration applied.
- Evidence matrix: **PASS**, 165 rows; independent acceptance remains open.

## Not verified / remaining Stage 11 work

- `scripts/verify-admin-bulk-actions.mjs` passes its static route/UI guard. Bulk-action API/database/concurrency and browser behavior are not runtime-verified.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out. `node_modules/.bin/tsc` and `node_modules/.bin/vitest` remain absent; TypeScript typecheck, full Vitest and production build are not run.
- PostgreSQL integration, API-level authorization, role revocation/session tests, object/field isolation, browser, mobile, keyboard/screen-reader, accessibility and independent security acceptance remain pending.
- UX-025 is now `PARTIAL`: only report `start_review` is supported. Other bulk operations, object/field-level policy coverage, browser confirmation/accessibility and runtime concurrency acceptance remain open.
- High-risk re-authentication / step-up authentication is not implemented as a Stage 11 control. Existing maker/checker protections in selected workflows do not establish a complete administrative separation-of-duties system.
- Queue-detail views, full operational queue coverage and field-level policy tests remain incomplete. The new capability catalogue is not a substitute for route-by-route authorization verification.
- No database migration, production operation, live payment, payout, release, or external publishing was performed.

## Status

Batch 25: `IMPLEMENTED_UNVERIFIED`.
Stage 11: remains `PARTIAL`; do not mark UX-020–UX-026 or governance/security requirements `VERIFIED_COMPLETE` based on this batch.
