import test from "node:test";
import assert from "node:assert/strict";
import { normalizePrivilegedRoles, hasRoleAuthority, isCanonicalAdminRole } from "../shared/admin-role-policy.mjs";

test("only Admin and Owner are exposed as privileged application roles", () => {
  assert.deepEqual(normalizePrivilegedRoles(["finance", "trust_safety", "support", "claimant"]), ["admin", "claimant"]);
  assert.equal(isCanonicalAdminRole("admin"), true);
  assert.equal(isCanonicalAdminRole("owner"), true);
  for (const role of ["finance", "trust_safety", "support", "communications_writer"]) assert.equal(isCanonicalAdminRole(role), false);
});

test("Admin can perform Admin-scoped tasks but cannot assume Owner-only legal authority", () => {
  assert.equal(hasRoleAuthority(["admin"], ["admin"]), true);
  assert.equal(hasRoleAuthority(["admin"], ["owner"]), false);
});

test("Owner is final authority across privileged role-gated operations", () => {
  for (const gate of [["admin"], ["finance"], ["trust_safety"], ["communications_publisher"], ["support"], ["owner"]]) {
    assert.equal(hasRoleAuthority(["owner"], gate), true, gate.join(","));
  }
});

test("legacy delegated scopes collapse to Admin and never create additional tiers", () => {
  const roles = normalizePrivilegedRoles(["finance", "trust_safety", "communications_writer", "communications_approver", "communications_publisher", "support"]);
  assert.deepEqual(roles, ["admin"]);
});

test("customer and Agent roles do not gain administrative authority", () => {
  assert.equal(hasRoleAuthority(["claimant"], ["admin"]), false);
  assert.equal(hasRoleAuthority(["agent"], ["admin"]), false);
});


test("canonical Admin inherits former operational scope gates after consolidation", () => {
  for (const gate of [["finance"], ["trust_safety"], ["support"], ["communications_writer"], ["communications_approver"], ["communications_publisher"]]) {
    assert.equal(hasRoleAuthority(["admin"], gate), true, gate.join(","));
  }
});
