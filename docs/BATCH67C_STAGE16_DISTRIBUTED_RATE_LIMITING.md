# Batch 67C — Stage 16 distributed public-directory rate limiting

**Date:** 17 November 2026  
**Status:** Source implementation completed; database/runtime verification intentionally deferred.

## Scope implemented

- Added `server/services/postgres-rate-limit-store.ts`, an `express-rate-limit` store using PostgreSQL atomic upserts.
- Public Agent directory requests now share a 30-request / 15-minute counter across application instances using the same database, rather than independent in-memory counters.
- Store keys are SHA-256 digests; raw IP/key values are not written to the rate-limit table.
- Counter increment and window rollover are performed in one PostgreSQL statement. Expired-row cleanup is opportunistic and bounded to every 256 increments per process.
- Added migration `0022_distributed_rate_limits.sql` and appended journal entry index 22. Migration is prepared only and has not been applied.
- Updated AGENT-003 and INT-005 source references and implementation notes. All verification and acceptance states remain unchanged.

## Operational assumptions and limitations

- The shared store depends on the PostgreSQL database being available. Store failures propagate; it does not silently fall back to a weaker per-process limiter.
- All API instances must use the same database and apply migration 0022 before this endpoint can operate with the new store. The `/readyz` expected timestamp baseline was extended to include the 23rd journal entry. Until the migration is applied in an authorised environment, the new limiter cannot be considered operational.
- The store hashes the key before persistence, but IP-based rate limiting remains subject to correct Express proxy trust configuration. Proxy trust and client-IP spoofing must be reviewed before production.
- Opportunistic cleanup is not a substitute for monitoring table growth or scheduled maintenance at scale.
- The public directory limiter is shared; other Express rate limiters remain process-local unless separately migrated.
- No rate-limit response, bypass, concurrency or multi-instance behaviour has been tested.

## Verification intentionally not run

No unit/contract tests, static scripts, typecheck, build, lint, PostgreSQL connection, migration replay/application, API request, browser, load, multi-instance concurrency, proxy/IP-spoofing, security, performance, accessibility or provider checks were run. This follows the implementation-only instruction. The archive ZIP integrity check is packaging verification only.

## Safety and release

No production migration, deployment, provider operation, funds movement, commit or push occurred. AGENT-003 remains IMPLEMENTED_UNVERIFIED; INT-005 remains NOT_VERIFIED; Stage 16 remains PARTIAL. Independent acceptance and release remain pending/unauthorised.
