import fs from "node:fs";
import path from "node:path";

const directory = "server/db/migrations";
const journal = JSON.parse(fs.readFileSync(path.join(directory, "meta/_journal.json"), "utf8"));
const entries = journal.entries ?? [];
if (!entries.length) throw new Error("Migration journal has no entries");
for (let index = 0; index < entries.length; index++) {
  const entry = entries[index];
  if (entry.idx !== index) throw new Error(`Migration index gap at ${index}`);
  if (!entry.tag || !fs.existsSync(path.join(directory, `${entry.tag}.sql`))) throw new Error(`Missing SQL migration for ${entry.tag}`);
}
const names = entries.map(entry => entry.tag);
if (new Set(names).size !== names.length) throw new Error("Duplicate migration tags found");
console.log(`Migration metadata check passed: ${entries.length} ordered SQL migrations (${names.join(", ")}). No migration was applied.`);
