import test from "node:test";
import assert from "node:assert/strict";
import { adminGrantDenial, adminRevokeDenial } from "../shared/admin-role-management-policy.mjs";

test("Owner can grant Admin only to another verified, active, non-admin, non-Owner account", () => {
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"candidate", verified:true, suspended:false, roles:["claimant"] }), null);
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"owner", verified:true, suspended:false, roles:[] }), "self_grant_not_allowed");
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"candidate", verified:false, suspended:false, roles:[] }), "target_account_unavailable");
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"candidate", verified:true, suspended:true, roles:[] }), "target_account_unavailable");
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"candidate", verified:true, suspended:false, roles:["admin"] }), "admin_role_already_active");
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"candidate", verified:true, suspended:false, roles:["finance"] }), "admin_role_already_active");
  assert.equal(adminGrantDenial({ actorId:"owner", targetId:"candidate", verified:true, suspended:false, roles:["owner"] }), "owner_role_is_not_managed_here");
});

test("Only Owner can invoke the endpoint and only an active Admin can be revoked", () => {
  assert.equal(adminRevokeDenial({ actorId:"owner", targetId:"admin", roles:["admin"] }), null);
  assert.equal(adminRevokeDenial({ actorId:"owner", targetId:"legacy-admin", roles:["trust_safety"] }), null);
  assert.equal(adminRevokeDenial({ actorId:"owner", targetId:"owner", roles:["admin"] }), "self_revocation_not_allowed");
  assert.equal(adminRevokeDenial({ actorId:"owner", targetId:"other", roles:["owner"] }), "owner_role_is_not_managed_here");
  assert.equal(adminRevokeDenial({ actorId:"owner", targetId:"other", roles:["claimant"] }), "admin_role_not_active");
});
