# Batch 30 — Additional high-risk administrative step-up controls

**Date:** 15 November 2026  
**Status:** Source implementation added; database/API/browser and independent acceptance pending.

## Scope implemented

1. Added explicit, allowlisted step-up purposes for:
   - Owner-only legal approval of Agent agreement versions (`admin.agreement.legal_approve`).
   - Admin/Owner communications campaign approval (`admin.communications.approve`).
   - Admin/Owner organisation status changes (`admin.organisation.status.change`).
2. Added matching email OTP challenge-purpose mappings. Legal approval is explicitly Owner-only at both step-up request and verification.
3. Added server middleware to the legal approval and communications approval endpoints.
4. Organisation status changes now require step-up, a strict reason-bearing request, a row lock, a correlation ID, and state/audit writes in one database transaction.
5. Added matching purpose choices to the authenticated Admin/Owner workspace.
6. Extended step-up policy tests and added a static guard covering all three workflows.

## Safety boundaries

- External communications publishing remains disabled. This batch only protects the internal approval decision; it does not publish or send content.
- Legal approval still requires explicit confirmation and a documented review note; the Owner-only gate remains authoritative.
- Organisation status changes remain limited to `active`, `rejected` and `suspended`; a reason is mandatory.
- Step-up grants remain session-bound, purpose-bound, single-use and five-minute. The existing middleware consumes a grant before the downstream route transaction; an operation failure may require fresh verification. This is fail-closed but is not atomic with the business transaction and remains a hardening item.
- No provider calls, production data, role changes, migrations or deployments were performed.

## Verification status

- Node-native policy tests: **66/66 passed** across all existing Stage 11 policy suites.
- Stage 11 static guards, including the new high-risk step-up guard: passed.
- Migration metadata: **15 ordered migrations** validated; migrations 0013 and 0014 remain unapplied.
- Changed TypeScript/TSX files: six files parsed without syntax diagnostics using the globally installed TypeScript transpiler.
- Full `npm run typecheck`: blocked because the recovered project has no installed `@types/node` or `vite/client` dependencies.
- Full Vitest and production build: not run.
- Full TypeScript, Vitest, production build: pending; dependencies were not installed in the recovered archive environment.
- PostgreSQL migrations and API integration/concurrency tests: pending.
- Browser/mobile/accessibility and independent security acceptance: pending.
- Stage 11 remains PARTIAL; no requirement is marked VERIFIED_COMPLETE by source checks alone.
