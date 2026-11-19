# Batch 23 — Stage 11 Admin queue ownership

Updated: 2026-11-14

## Scope delivered

This increment hardens the support queue and introduces controlled ticket ownership using the existing `support_tickets.assigned_to` field. No schema change or migration was added.

- Queue access remains restricted to active `support` and `admin` roles through the existing per-request authentication/role middleware.
- Queue query accepts only `status`, `limit`, and `offset`; repeated/array values, unknown keys, unsupported statuses, and out-of-range pagination are rejected.
- Queue response is a minimal DTO: ticket ID/reference, category, subject, priority, status, assignee, and timestamps. Requester ID and ticket description are excluded.
- Support staff see unassigned tickets and tickets assigned to themselves. Admins can see all tickets in the requested status.
- Assignment accepts only a UUID or explicit `null`, plus a mandatory 8–500 character reason. Unknown fields are rejected.
- Non-admin support staff may claim an unassigned ticket, release their own ticket, or leave their own assignment unchanged; they cannot take another support worker's ticket or assign another worker.
- Admins may assign/unassign any ticket, but the target must be an active, verified, non-suspended user with a non-revoked `support` role.
- Assignment locks the ticket row and couples the update with an audit event in one database transaction. Audit metadata records before/after assignee and the reason.

## Files changed

- `server/routes/support.ts`
- `shared/support-queue-policy.mjs`
- `shared/support-queue-policy.d.mts`
- `scripts/test-support-queue-policy.mjs`
- `scripts/verify-support-queue-ownership.mjs`
- `docs/BATCH23_ADMIN_QUEUE_OWNERSHIP.md`
- `docs/ROADMAP_1_TO_23_UPDATED.md`
- `docs/IMPLEMENTATION_REGISTER.md`
- `docs/IMPLEMENTATION_PROGRESS_2026-11-14.md`

## Verification performed

- Node native tests: **32/32 passed** across the existing audit query tests and new support queue policy tests.
- Support queue static guard: **PASS** for route role gates, bounded parser, minimal DTO, active verified support assignee checks, row lock and transaction-coupled audit.
- `node --check shared/support-queue-policy.mjs`: **PASS**.
- Traceability validator: **PASS**, 165 unique requirement IDs and referenced paths exist. This is path validation, not requirement coverage proof.
- Migration metadata validator: **PASS**, 12 ordered migrations recognised; no migration applied.
- Evidence matrix validator: **PASS**, 165 rows; independent acceptance remains explicit.
- Admin overview static guard: **PASS**.
- Admin audit explorer static guard: **PASS**.
- Full source verifier: **BLOCKED** because the archive has no installed `typescript` dependency (`ERR_MODULE_NOT_FOUND`).

## Not verified / remaining

- No dependency-backed TypeScript typecheck, production build, full Vitest suite, PostgreSQL integration, API authorization test, concurrency test, browser test, accessibility test, or independent security review ran.
- Transaction locking and database behavior are source-reviewed/static-guarded only; must be exercised against disposable PostgreSQL before acceptance.
- Support ticket message visibility and status mutation still require full role/object/field permission tests. Existing support message/status writes are not yet transactionally coupled to their audit rows.
- This increment does not implement the complete Admin/Owner queue catalogue, bulk actions, maker/checker approvals, re-authentication for high-risk actions, or Owner dashboard permission matrix.

## Status

Batch 23 support queue ownership: `IMPLEMENTED_UNVERIFIED`.
Stage 11: `PARTIAL` / in progress. Do not mark UX-020, UX-024, RBAC, or GOV requirements verified complete from these source checks.
No production deployment, production data access, provider call, payment, or migration was performed.
