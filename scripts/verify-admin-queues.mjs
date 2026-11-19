import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const route = await readFile(new URL("../server/routes/admin.ts", import.meta.url), "utf8");
for (const [path, role] of [["claims", 'requireRole("admin", "owner")'], ["disputes", 'requireRole("admin", "trust_safety")'], ["appeals", 'requireRole("admin", "trust_safety")']]) {
  const match = route.match(new RegExp(`adminRouter\\.get\\("/${path}"[\\s\\S]*?\\n\\}\\);`));
  assert.ok(match, `${path} queue route exists`);
  assert.ok(match[0].includes(role), `${path} queue role gate`);
  assert.ok(match[0].includes(`parseAdminQueueQuery("${path}"`), `${path} strict query parser`);
  assert.ok(match[0].includes(".limit(limit).offset(offset)"), `${path} bounded pagination`);
}
const claims = route.match(/adminRouter\.get\("\/claims"[\s\S]*?\n\}\);/)?.[0] ?? "";
const disputes = route.match(/adminRouter\.get\("\/disputes"[\s\S]*?\n\}\);/)?.[0] ?? "";
const appeals = route.match(/adminRouter\.get\("\/appeals"[\s\S]*?\n\}\);/)?.[0] ?? "";
assert.doesNotMatch(claims, /claimantId|ownershipEvidenceSummary|representedPersonName|authorityDeclaration|disputeReason/);
assert.doesNotMatch(disputes, /description|resolution|openedBy|resolvedBy/);
assert.doesNotMatch(appeals, /grounds|reviewerNote|submittedBy|reviewedBy/);
console.log("Admin queue static guard passed: role gates, strict filters, bounded pagination and privacy-minimised projections are present. Static guard only.");
