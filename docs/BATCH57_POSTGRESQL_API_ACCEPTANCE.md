# Batch 57 — PostgreSQL, API authorization and concurrency acceptance

**Date:** 16 November 2026  
**Baseline:** Combined Batches 55–56 archive  
**Disposition:** PARTIAL — acceptance harness prepared; live PostgreSQL/API execution blocked by unavailable disposable database/runtime.

## Scope

Batch 57 is an acceptance stage, not permission to apply migrations or change production. It checks the evidence available for the new Admin/Owner governance controls and prepares repeatable disposable-PostgreSQL tests.

## Completed in this acceptance pass

- Re-extracted the exact Batch 55–56 archive and verified ZIP integrity and SHA-256 against the prior delivery.
- Re-ran the complete Node-native source test suite: 125/125 passed.
- Re-ran Batch 51 claim-governance source guard: 10/10 passed.
- Re-ran Batch 52–54 governance source guard: 16/16 passed.
- Re-ran Batch 55–56 Owner governance guard: 9/9 passed; inventory remains 122 route declarations across 21 route files, including 23 Admin router declarations.
- Re-ran migration metadata validation: 18 ordered migrations; no migration applied.
- Re-ran traceability validation: 168 unique requirement IDs and candidate source/test paths found.
- Re-ran evidence matrix validation: 168 rows.
- Added `scripts/integration/test-admin-governance-postgres.mjs`, a disposable-schema integration test that applies the repository's actual migration 0017 and checks trigger installation, rejected UPDATE/DELETE/TRUNCATE operations (SQLSTATE 55000), row preservation and permitted INSERTs.
- Added `scripts/verify-batch57-acceptance-readiness.mjs` and npm scripts `verify:batch57`, `test:admin-governance-postgres` and `test:postgres-governance`.

## Exact verification results

| Command | Result |
|---|---|
| `node --test scripts/test-*.mjs` | PASS — 125/125 |
| `node scripts/verify-batch51-claim-governance.mjs` | PASS — 10/10 source assertions |
| `node scripts/verify-batch52-54-governance.mjs` | PASS — 16/16 source assertions |
| `node scripts/verify-batch55-56-owner-governance.mjs` | PASS — 9/9 source assertions |
| `node scripts/verify-migrations.mjs` | PASS — 18 ordered migration files |
| `node scripts/verify-evidence-matrix.mjs` | PASS — 168 rows |
| `node scripts/verify-traceability.mjs` | PASS — 168 unique IDs |
| `node scripts/verify-batch57-acceptance-readiness.mjs` | PASS — 6/6 harness-readiness assertions |
| `node --test scripts/integration/test-admin-governance-postgres.mjs` | 5 tests SKIPPED — `TEST_DATABASE_URL` unavailable |
| `node --test scripts/integration/test-outbox-postgres.mjs` | 9 tests SKIPPED — `TEST_DATABASE_URL` unavailable |
| `node scripts/check-release-gates.mjs` | BLOCKED — 27 outstanding gates |

## Environment constraints

- No Docker executable, PostgreSQL client/server binary, `TEST_DATABASE_URL` or `DATABASE_URL` is available in this execution environment.
- `node_modules` is absent. The package declares `pg`, but dependencies were not installed.
- TypeScript source verification, typecheck, build and Vitest were not run because required packages and type definitions are unavailable.
- No API server was started; no HTTP request/response acceptance was performed.

## Required next evidence

1. Run `TEST_DATABASE_URL=<disposable-db> npm run test:postgres-governance`; require all 14 integration tests to execute and pass, not skip.
2. Run migration 0017 only inside the disposable test schema/database; prove update/delete/truncate fail and insert succeeds. Never point this test at production.
3. Run API-level tests with controlled Admin, Owner, claimant and unauthenticated identities. Prove Owner oversight returns 403 to non-Owners and verify response field allowlists.
4. Exercise object-level and tenant/organisation isolation for the route inventory. The 122-row CSV currently marks these runtime checks pending.
5. Run step-up expiry, wrong-session, replay, maker/checker race and collection-code concurrency tests against PostgreSQL.
6. Complete TypeScript typecheck/build, browser and accessibility acceptance in a dependency-complete environment.

## Safety

No migration was applied. No production database was accessed. No deployment, provider call, money movement, refund, payout, wallet transfer, item release, external publication, commit or push occurred.

**Batch 57 is not accepted.** The integration harness is prepared, but skipped tests are not passes. Stage 11 remains PARTIAL.
