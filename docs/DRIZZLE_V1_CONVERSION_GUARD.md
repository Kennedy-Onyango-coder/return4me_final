# Drizzle v1 conversion guard

This guard prepares a reversible, offline comparison for the future Drizzle 0.x-to-v1 migration-folder conversion. It does not install packages, run Drizzle Kit, connect to a database, or apply migrations.

## 1. Capture the current 0.x migration inventory

Run from the repository root in PowerShell:

```powershell
npm run db:migration-v1:capture -- server/db/migrations ../return4me-drizzle-v1-manifest.json
```

The manifest is deliberately written outside the repository. It records the legacy journal hash, ordered migration tags and SHA-256 hashes of all 23 migration SQL files, plus hashes of the legacy snapshots that exist.

Keep this manifest safe and unchanged. Do not place it inside `server/db/migrations`.

## 2. Verify a converted copy

After a separately authorised conversion has been performed on a disposable copy (not on the working project), verify that copy from the repository root:

```powershell
npm run db:migration-v1:verify -- ../return4me-drizzle-v1-manifest.json ../return4me-drizzle-v1-converted
```

The converted directory argument must point to the directory containing the per-migration v1 folders. The guard checks that:

- the number of v1 migration folders equals the captured legacy migration count;
- folder names use the 14-digit timestamp plus migration-name form;
- each folder contains only `migration.sql` and `snapshot.json`;
- each snapshot is valid, non-empty JSON; and
- the multiset of SHA-256 hashes for converted `migration.sql` files exactly matches the original SQL inventory.

The comparison is hash-based and supports identical SQL contents without assuming folder sort order. It does not claim that a database's applied migration history matches local files, and it does not validate Drizzle's internal snapshot-chain semantics. Those require separate review and the official `drizzle-kit check` after a successful conversion.

## 3. Run the guard tests

```powershell
npm run test:drizzle-v1-conversion
```

The focused tests cover capture, successful verification, changed SQL, missing folders, leftover legacy metadata, malformed snapshots, and duplicate journal tags. The focused test is also part of `npm run verify:all`.

## Safety boundary

The current Return4me migration folder remains in its original Drizzle 0.x format. Do not run `drizzle-kit up` against the working project. The conversion command can replace the flat SQL files and legacy `meta/` directory. A future conversion stage must use a clean, disposable copy and an explicit backup/restore and database-history reconciliation plan. No conversion, database inspection, or database migration is performed by this guard.
