import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_VERSION = 1;
const MIGRATION_FOLDER_PATTERN = /^\\d{14}_[A-Za-z0-9_-]+$/;

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing or is not valid JSON: ${error.message}`);
  }
}

function assertRegularFile(filePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular, non-symlink file: ${filePath}`);
  }
}

export function captureLegacyMigrationManifest(migrationsDirectory) {
  const directory = path.resolve(migrationsDirectory);
  const journalPath = path.join(directory, "meta", "_journal.json");
  assertRegularFile(journalPath, "Legacy migration journal");
  const journal = readJson(journalPath, "Legacy migration journal");
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("Legacy migration journal must contain at least one entry");
  }

  const seenTags = new Set();
  const migrations = journal.entries.map((entry, index) => {
    if (entry.idx !== index) throw new Error(`Legacy journal index gap at ${index}`);
    if (typeof entry.tag !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.tag)) {
      throw new Error(`Unsafe or missing migration tag at journal index ${index}`);
    }
    if (seenTags.has(entry.tag)) throw new Error(`Duplicate legacy migration tag: ${entry.tag}`);
    seenTags.add(entry.tag);
    const sqlPath = path.join(directory, `${entry.tag}.sql`);
    assertRegularFile(sqlPath, `Legacy SQL for ${entry.tag}`);
    return {
      index,
      tag: entry.tag,
      when: entry.when ?? null,
      sha256: sha256(sqlPath),
    };
  });

  const metaDirectory = path.join(directory, "meta");
  const snapshots = fs.readdirSync(metaDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^\\d{4}_snapshot\\.json$/.test(entry.name))
    .map(entry => {
      const snapshotPath = path.join(metaDirectory, entry.name);
      readJson(snapshotPath, `Legacy snapshot ${entry.name}`);
      return { file: entry.name, sha256: sha256(snapshotPath) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  return {
    manifestVersion: MANIFEST_VERSION,
    sourceFormat: "drizzle-kit-0.x-flat",
    sourceDirectory: path.basename(directory),
    journalSha256: sha256(journalPath),
    migrationCount: migrations.length,
    migrations,
    snapshots,
  };
}

function assertSameMultiset(expected, actual, label) {
  const left = [...expected].sort();
  const right = [...actual].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new Error(`${label} differ from the pre-conversion manifest`);
  }
}

export function verifyConvertedMigrationDirectory(manifest, convertedDirectory) {
  if (manifest?.manifestVersion !== MANIFEST_VERSION ||
      manifest?.sourceFormat !== "drizzle-kit-0.x-flat" ||
      !Array.isArray(manifest.migrations) ||
      manifest.migrationCount !== manifest.migrations.length) {
    throw new Error("Unsupported or malformed pre-conversion manifest");
  }

  const directory = path.resolve(convertedDirectory);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Converted migration directory does not exist: ${directory}`);
  }
  if (fs.existsSync(path.join(directory, "meta"))) {
    throw new Error("Converted directory still contains legacy meta/; conversion is incomplete");
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const folders = entries.filter(entry => entry.isDirectory());
  const strayFiles = entries.filter(entry => entry.isFile());
  if (strayFiles.length) {
    throw new Error(`Unexpected files remain at converted migration root: ${strayFiles.map(x => x.name).join(", ")}`);
  }
  if (folders.length !== manifest.migrationCount) {
    throw new Error(`Expected ${manifest.migrationCount} migration folders; found ${folders.length}`);
  }

  const convertedHashes = [];
  const folderNames = new Set();
  for (const folder of folders) {
    if (!MIGRATION_FOLDER_PATTERN.test(folder.name)) {
      throw new Error(`Invalid v1 migration folder name: ${folder.name}`);
    }
    if (folderNames.has(folder.name)) throw new Error(`Duplicate migration folder: ${folder.name}`);
    folderNames.add(folder.name);

    const folderPath = path.join(directory, folder.name);
    const children = fs.readdirSync(folderPath, { withFileTypes: true });
    const childNames = children.map(child => child.name).sort();
    if (childNames.length !== 2 || childNames[0] !== "migration.sql" || childNames[1] !== "snapshot.json" ||
        children.some(child => !child.isFile() || child.isSymbolicLink())) {
      throw new Error(`Migration folder ${folder.name} must contain only migration.sql and snapshot.json`);
    }

    const sqlPath = path.join(folderPath, "migration.sql");
    const snapshotPath = path.join(folderPath, "snapshot.json");
    assertRegularFile(sqlPath, `Converted SQL for ${folder.name}`);
    assertRegularFile(snapshotPath, `Converted snapshot for ${folder.name}`);
    const snapshot = readJson(snapshotPath, `Converted snapshot for ${folder.name}`);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || Object.keys(snapshot).length === 0) {
      throw new Error(`Converted snapshot for ${folder.name} must be a non-empty JSON object`);
    }
    convertedHashes.push(sha256(sqlPath));
  }

  assertSameMultiset(
    manifest.migrations.map(migration => migration.sha256),
    convertedHashes,
    "Converted migration SQL SHA-256 inventory",
  );

  return {
    migrationCount: folders.length,
    folderNames: [...folderNames].sort(),
    sqlFilesByteIdentical: true,
    snapshotsValidJson: true,
    databaseContacted: false,
    migrationsApplied: false,
  };
}

function usage() {
  process.stderr.write(
    "Usage:\n" +
    "  node scripts/drizzle-v1-conversion.mjs capture <legacy-migrations-dir> <manifest-output.json>\n" +
    "  node scripts/drizzle-v1-conversion.mjs verify <manifest.json> <converted-migrations-dir>\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const [command, first, second] = process.argv.slice(2);
  try {
    if (command === "capture" && first && second) {
      const manifest = captureLegacyMigrationManifest(first);
      fs.writeFileSync(path.resolve(second), `${JSON.stringify(manifest, null, 2)}\\n`, { flag: "wx" });
      process.stdout.write(
        `Captured ${manifest.migrationCount} legacy migrations and ${manifest.snapshots.length} snapshots.\\n` +
        `Manifest: ${path.resolve(second)}\\nNo database was contacted and no migration was applied.\\n`,
      );
    } else if (command === "verify" && first && second) {
      const manifest = readJson(path.resolve(first), "Pre-conversion manifest");
      const result = verifyConvertedMigrationDirectory(manifest, second);
      process.stdout.write(
        `Drizzle v1 conversion inventory passed: ${result.migrationCount} migration folders; ` +
        "all SQL files are byte-identical and all snapshots are valid JSON.\\n" +
        "No database was contacted and no migration was applied.\\n",
      );
    } else {
      usage();
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`Drizzle v1 conversion inventory failed: ${error.message}\\n`);
    process.exitCode = 1;
  }
}
