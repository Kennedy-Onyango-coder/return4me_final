import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  captureLegacyMigrationManifest,
  verifyConvertedMigrationDirectory,
} from "./drizzle-v1-conversion.mjs";

function fixture(t, count = 2) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "return4me-drizzle-v1-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, "legacy");
  const meta = path.join(legacy, "meta");
  fs.mkdirSync(meta, { recursive: true });
  const entries = [];
  const sql = [];
  for (let index = 0; index < count; index++) {
    const tag = `${String(index).padStart(4, "0")}_migration_${index}`;
    const content = `-- migration ${index}\\nCREATE TABLE test_${index} (id integer);\\n`;
    fs.writeFileSync(path.join(legacy, `${tag}.sql`), content);
    sql.push(content);
    entries.push({ idx: index, tag, when: 1700000000000 + index });
  }
  fs.writeFileSync(path.join(meta, "_journal.json"), JSON.stringify({ version: "7", entries }));
  fs.writeFileSync(path.join(meta, "0000_snapshot.json"), JSON.stringify({ id: "snapshot-0", version: "7" }));
  const converted = path.join(root, "converted");
  fs.mkdirSync(converted);
  for (let index = 0; index < count; index++) {
    const folder = path.join(converted, `202611190900${String(index).padStart(2, "0")}_migration_${index}`);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "migration.sql"), sql[index]);
    fs.writeFileSync(path.join(folder, "snapshot.json"), JSON.stringify({ id: `v1-${index}`, prevId: index ? `v1-${index - 1}` : "00000000-0000-0000-0000-000000000000" }));
  }
  return { legacy, converted, sql };
}

test("captures ordered legacy SQL hashes and available snapshots", t => {
  const { legacy, sql } = fixture(t);
  const manifest = captureLegacyMigrationManifest(legacy);
  assert.equal(manifest.migrationCount, 2);
  assert.equal(manifest.snapshots.length, 1);
  assert.deepEqual(manifest.migrations.map(item => item.sha256),
    sql.map(value => crypto.createHash("sha256").update(value).digest("hex")));
});

test("accepts a converted v1 folder tree with byte-identical SQL", t => {
  const { legacy, converted } = fixture(t);
  const manifest = captureLegacyMigrationManifest(legacy);
  const result = verifyConvertedMigrationDirectory(manifest, converted);
  assert.equal(result.migrationCount, 2);
  assert.equal(result.sqlFilesByteIdentical, true);
  assert.equal(result.snapshotsValidJson, true);
  assert.equal(result.databaseContacted, false);
  assert.equal(result.migrationsApplied, false);
});

test("rejects changed migration SQL", t => {
  const { legacy, converted } = fixture(t);
  const manifest = captureLegacyMigrationManifest(legacy);
  const sqlPath = path.join(converted, "20261119090000_migration_0", "migration.sql");
  fs.appendFileSync(sqlPath, "-- changed\\n");
  assert.throws(() => verifyConvertedMigrationDirectory(manifest, converted), /SHA-256 inventory/);
});

test("rejects a missing migration folder", t => {
  const { legacy, converted } = fixture(t);
  const manifest = captureLegacyMigrationManifest(legacy);
  fs.rmSync(path.join(converted, "20261119090001_migration_1"), { recursive: true });
  assert.throws(() => verifyConvertedMigrationDirectory(manifest, converted), /Expected 2 migration folders/);
});

test("rejects a legacy meta directory left in the converted tree", t => {
  const { legacy, converted } = fixture(t);
  const manifest = captureLegacyMigrationManifest(legacy);
  fs.mkdirSync(path.join(converted, "meta"));
  assert.throws(() => verifyConvertedMigrationDirectory(manifest, converted), /still contains legacy meta/);
});

test("rejects malformed converted snapshots", t => {
  const { legacy, converted } = fixture(t);
  const manifest = captureLegacyMigrationManifest(legacy);
  fs.writeFileSync(path.join(converted, "20261119090000_migration_0", "snapshot.json"), "{");
  assert.throws(() => verifyConvertedMigrationDirectory(manifest, converted), /not valid JSON/);
});

test("rejects duplicate or unsafe legacy journal tags", t => {
  const { legacy } = fixture(t);
  const journalPath = path.join(legacy, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries[1].tag = journal.entries[0].tag;
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  assert.throws(() => captureLegacyMigrationManifest(legacy), /Duplicate legacy migration tag/);
});
