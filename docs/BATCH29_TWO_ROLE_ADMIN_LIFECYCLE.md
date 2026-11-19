# Batch 29 — Two-role Admin and Super Admin (Owner) lifecycle

**Date:** 15 November 2026  
**Status:** Source implementation added; runtime and independent acceptance pending.

## Governing model

There are exactly two privileged administrative role types in application code:

- **Admin** — operational administration across the platform.
- **Super Admin (Owner)** — highest administrative authority and final decision-maker.

Claimant, Finder, Agent and Organisation roles remain separate non-administrative roles. Legacy database enum labels are retained only for migration compatibility and are normalized to Admin in authenticated application sessions.

## Batch 29 changes

1. Finance assessment detail authorization now uses canonical Admin/Owner authority rather than checking the retired `finance` label directly.
2. Demo role selection now shows only Claimant, Finder, Agent, Organisation, Admin and Super Admin (Owner). Finance, Trust & Safety, communications and support appear as Admin operational areas, not separate privileged roles.
3. The role-grant CLI no longer grants Admin. It can bootstrap the configured first Owner only when no active Owner exists; promotion revokes any previous Admin/legacy operational scopes from that account.
4. Migration `0013_two_privileged_admin_roles.sql` now revokes legacy delegated scope rows and ensures a user holds either Admin or Owner, not both.
5. Added Owner-only exact-email account lookup, Admin grant and Admin revoke endpoints. Account lookups are audit logged without storing the full searched email in audit metadata.
6. Admin grants and revocations require distinct session-bound, single-use, five-minute step-up purposes, a reason, a correlation ID and a transaction-coupled audit event.
7. Both Admin grant and revocation invalidate all existing target sessions and consume remaining step-up grants. Revocation also removes legacy Admin-scope role rows so a legacy role cannot silently restore Admin on the next login.
8. The Owner workspace exposes the Admin account management UI. The Owner cannot use it to create another Owner or grant Admin to themselves. Admin cannot access the Owner-only role management endpoints or request the associated step-up grants.
9. Added the `admin.roles.manage` Owner-only capability and pure role-management policy tests.

## Verification

- Node-native policy tests: **66/66 passed**.
- Stage 11 static guards passed for step-up, access matrix, queue parsing, support ownership, overview, audit explorer, bulk actions, role policy, maker/checker, Owner bootstrap, role management, traceability and evidence matrix.
- Traceability: 166 unique IDs validated.
- Migration metadata: 15 ordered migrations validated. Migrations 0013 and 0014 are not applied.
- Global TypeScript parser found no syntax diagnostics in changed TypeScript/TSX files.

## Acceptance still pending

- Full `npm ci`, TypeScript semantic check, Vitest and production build. Dependency installation timed out in this environment; `tsc --noEmit` remains blocked by missing `@types/node` and `vite/client`.
- PostgreSQL application of migrations 0013 and 0014 on a disposable database, including legacy role normalization and concurrent role grant/revoke tests.
- API authorization tests for Admin denial, Owner allow, step-up purpose mismatch, replay, expired grants, target self-grant, duplicate grants, Owner protection, and session invalidation.
- Browser tests for the Owner account-management panel and Admin workspace role visibility.
- Independent security and accessibility acceptance.

No role was actually granted or revoked. No migration was applied to any database. No production data, payment, provider, deployment or item-release action was performed.
