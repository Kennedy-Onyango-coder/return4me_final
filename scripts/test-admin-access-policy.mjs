import test from "node:test";
import assert from "node:assert/strict";
import { getAdminCapabilityMatrix, canAccessAdminCapability } from "../shared/admin-access-policy.mjs";

test("Owner has final authority across all declared Admin capabilities", () => {
  const matrix = getAdminCapabilityMatrix(["owner"]);
  assert.ok(matrix.length > 0);
  assert.ok(matrix.every(x => x.permitted && x.ownerAllowed));
  assert.equal(canAccessAdminCapability("finance.operations", ["owner"]), true);
  assert.equal(canAccessAdminCapability("evidence.review", ["owner"]), true);
  assert.equal(canAccessAdminCapability("governance.agreements.legal_approve", ["owner"]), true);
  assert.equal(canAccessAdminCapability("admin.roles.manage", ["owner"]), true);
});

test("Admin has operational capability but not Owner-only legal approval", () => {
  assert.equal(canAccessAdminCapability("claims.detail.review", ["admin"]), true);
  assert.equal(canAccessAdminCapability("finance.operations", ["admin"]), true);
  assert.equal(canAccessAdminCapability("support.queue", ["admin"]), true);
  assert.equal(canAccessAdminCapability("governance.agreements.legal_approve", ["admin"]), false);
  assert.equal(canAccessAdminCapability("admin.roles.manage", ["admin"]), false);
});

test("legacy delegated role names do not create separate capability tiers", () => {
  for (const legacy of ["trust_safety", "finance", "support", "communications_writer"]) {
    assert.equal(canAccessAdminCapability("finance.operations", [legacy]), false);
    assert.equal(canAccessAdminCapability("claims.detail.review", [legacy]), false);
  }
});

test("unknown capabilities fail closed and caller roles are not mutated", () => {
  const roles = ["admin"];
  assert.equal(canAccessAdminCapability("made.up.capability", roles), false);
  const rows = getAdminCapabilityMatrix(roles);
  assert.equal(rows.every(row => typeof row.permitted === "boolean"), true);
  assert.deepEqual(roles, ["admin"]);
});
