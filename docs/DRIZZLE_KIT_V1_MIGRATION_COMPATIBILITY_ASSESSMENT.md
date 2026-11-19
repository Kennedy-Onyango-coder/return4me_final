# Drizzle Kit 1.0 migration compatibility assessment

**Repository:** `Kennedy-Onyango-coder/return4me_final`  
**Branch baseline:** `efb72080610c91d7db5832bd126c7b1222dd254f`  
**Assessment type:** Read-only source and migration-layout review  
**Decision:** Keep Drizzle Kit 0.31.11 for this batch; do not convert migrations or upgrade the ORM.

## Current dependency state

- `drizzle-orm`: package range `^0.45.2`
- `drizzle-kit`: package range `^0.31.10`, lockfile resolution `0.31.11`
- `sharp`: package range `^0.35.5`, lockfile resolution `0.35.5`
- The lockfile remediation clears the reported high-severity Sharp advisories.
- Four moderate audit findings remain through Drizzle Kit 0.31.11's deprecated `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@0.18.20` chain. The current `npm audit --audit-level=high` gate passes because the remaining findings are moderate; this is not a zero-advisory result.

## Existing migration format

The repository currently has 23 ordered SQL migrations, numbered `0000` through `0022`, and a legacy Drizzle 0.x metadata layout:

- `server/db/migrations/0000_*.sql` through `0022_*.sql`
- `server/db/migrations/meta/_journal.json` with 23 entries, journal version 7
- `server/db/migrations/meta/0000_snapshot.json`
- No later numbered snapshot files were present in the reviewed tree.

The current `drizzle.config.ts` points Drizzle Kit at `server/db/schema.ts` and `server/db/migrations`, using the PostgreSQL dialect. The repository's migration verifier explicitly requires the flat numbered SQL files and the shared `meta/_journal.json`; it is a 0.x-layout verifier and would need a deliberate redesign if the format changes.

## Why Drizzle Kit 1.0.0-rc.5 is not a drop-in security fix

The published 1.0 release-candidate migration format changes from flat SQL files plus a shared journal to one directory per migration containing `migration.sql` and `snapshot.json`. The documented upgrade requires the `drizzle-kit up` conversion step and a coordinated package upgrade; rc.5's Drizzle Kit also declares a `drizzle-orm >=1.0.0-rc.5` optional peer dependency.

The v1 migrator changes migration metadata handling and applies every missing local migration, including an older migration that may have been missed by the previous 0.x ordering behaviour. It also updates the migration metadata table. Consequently, a CLI-only upgrade or an unreviewed conversion could cause a deployment incompatibility or unexpected migration replay.

## Safe next-stage plan

1. Inventory the deployed database's migration metadata read-only, through an explicitly approved and properly connected staging environment. Compare it to all 23 local journal entries; do not assume CI's disposable database reflects production.
2. Establish a verified database backup and restore rehearsal before attempting any format conversion.
3. Create a separate migration-upgrade branch. Preserve the original migration tree and perform `drizzle-kit up` only on a disposable copy.
4. Review the complete generated directory tree, snapshots, SQL contents and mapping from each legacy journal entry. Check for missing, duplicated, reordered or unexpectedly regenerated SQL.
5. Upgrade `drizzle-kit` and `drizzle-orm` together to an exact, reviewed release-candidate version only after source/API compatibility review. Do not use floating prerelease ranges.
6. Test clean-database migration, upgrade from a representative 0.x database, migration idempotency, rollback/restore and readiness-journal checks on disposable PostgreSQL.
7. Re-run full CI and a non-production acceptance review before proposing any production migration or deployment.

## Verification boundary

This assessment used repository source and migration metadata only. No database was contacted for this assessment, no `drizzle-kit up` command was run, no migration file was changed, and no production or staging migration was applied.

**Status:** Moderate dependency advisory remains open. Drizzle Kit v1 migration conversion is a separate compatibility project, not authorised by this assessment. Production release remains `NOT_AUTHORISED`.
