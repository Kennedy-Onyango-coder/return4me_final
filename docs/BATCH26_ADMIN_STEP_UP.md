# Batch 26 — Stage 11 privileged step-up authentication

Date: 2026-11-15

## Source implementation

- Added a server-side `admin_step_up_grants` table, bound to both the authenticated user and exact session. Grants expire after five minutes and are single-use.
- Added authenticated Admin-only `/api/auth/step-up/request` and `/api/auth/step-up/verify` endpoints. The verification code is delivered to the already verified account email using the existing OTP delivery service.
- Step-up purposes are explicit and action-scoped: report publication, report rejection and report closure. The OTP challenge purpose itself is also action-specific, preventing a code requested for one action from being exchanged for another purpose.
- Verification reuses the existing OTP HMAC hashing, constant-time comparison, attempt cap and expiry controls. Challenge consumption and grant creation occur in one transaction; the grant is session-bound and audited.
- `requireStepUp` locks and consumes a matching grant before the consequential report status route proceeds. A grant cannot be replayed across users, sessions, purposes or requests.
- Added an Admin UI panel for requesting and verifying the appropriate one-time code before those report status actions.
- Added migration `0012_admin_step_up_grants.sql`; migration metadata now records 13 ordered migrations. No migration was applied.

## Verification

- Combined dependency-free Node policy tests: **51/51 passed** across step-up, Admin access, Admin queue, support queue and audit query policies.
- Admin step-up static guard: PASS.
- Admin capability, queue, support ownership, overview, audit explorer and bulk-action static guards: PASS.
- Traceability: 165 requirement IDs validated.
- Migration metadata: 13 ordered SQL migrations validated; no DB migration applied.
- Evidence matrix: 165 rows validated.

## Acceptance limitations

- No PostgreSQL instance was available for applying migration 0012 or exercising challenge issuance, concurrent verification, session revocation, grant replay and route execution.
- Full TypeScript, Vitest, production build, API integration, browser/mobile and accessibility tests have not been run in this checkpoint.
- This step-up control covers only the three named report transitions. It does not yet cover every consequential Admin/Owner action.
- Maker/checker approval workflows remain incomplete. Step-up is not a substitute for independent approval.
- No requirement is promoted to `VERIFIED_COMPLETE`; SEC-001 and Stage 11 remain `PARTIAL`.

## Status

Batch 26: `IMPLEMENTED_UNVERIFIED`.
Stage 11: `PARTIAL` / in progress.


## Batch 27 — Two-role administrative authority (2026-11-15)

**Source implementation added; database/runtime acceptance pending.** The administrative model is consolidated to exactly two application-visible privileged roles: `admin` and `owner` (Super Admin). Legacy delegated scopes (`finance`, `trust_safety`, `support`, and communications subroles) are normalized to `admin` at authentication and have a migration prepared to revoke their separate active role rows after granting canonical Admin. The legacy PostgreSQL enum labels remain for compatibility until a separately reviewed schema cleanup; they are not exposed as application `Role` values.

Owner is the final authority: server-side `requireRole` grants Owner access to privileged role-gated operations, and the capability catalogue exposes every declared capability to Owner. Admin retains operational access but cannot exercise Owner-only legal approval. Customer, Finder, Agent and organisation roles are unchanged. Audit, step-up, and workflow-specific controls remain applicable; Owner authority is not an audit bypass.

**Migration:** `0013_two_privileged_admin_roles.sql` is prepared and NOT applied. **Not yet implemented in this batch:** report maker/checker proposal and approval workflow; Owner final-decision workflow UI; broad operational queue detail authorization; comprehensive step-up coverage.

**Verification boundary:** role-policy tests and static guards are source-level only. TypeScript, Vitest, database migration, API integration, concurrent authorization, browser and independent security acceptance remain pending.
