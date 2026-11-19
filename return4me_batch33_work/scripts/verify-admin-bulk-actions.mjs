import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const route = await readFile(new URL("../server/routes/admin.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const preview = route.match(/adminRouter\.post\("\/reports\/bulk-preview"[\s\S]*?\n\}\);/)?.[0] ?? "";
const execute = route.match(/adminRouter\.post\("\/reports\/bulk"[\s\S]*?\n\}\);/)?.[0] ?? "";
assert.ok(preview, "bulk preview route exists");
assert.ok(execute, "bulk execution route exists");
for (const block of [preview, execute]) {
  assert.match(block, /requireRole\("admin"\)/);
  assert.match(block, /reportBulkSchema/);
}
assert.match(preview, /requiresConfirmation: true/);
assert.match(execute, /db\.transaction/);
assert.match(execute, /\.for\("update"\)/);
assert.match(execute, /bulk_started_review/);
assert.match(execute, /No reports were changed/);
assert.match(ui, /Preview selected/);
assert.match(ui, /Confirm and start review/);
assert.match(ui, /window\.confirm/);
console.log("Admin bulk-action static guard passed: Admin gate, preview, explicit confirmation, row-lock/revalidation and transaction-coupled audit present. Static guard only.");
