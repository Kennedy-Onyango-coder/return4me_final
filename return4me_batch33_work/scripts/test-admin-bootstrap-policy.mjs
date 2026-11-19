import test from "node:test";
import assert from "node:assert/strict";
import { canBootstrapOwner } from "../shared/admin-bootstrap-policy.mjs";

test("Owner bootstrap requires exact configured email and no active Owner", () => {
  assert.equal(canBootstrapOwner({ targetEmail: "OWNER@example.com", configuredEmail: "owner@example.com", activeOwnerCount: 0 }), true);
  assert.equal(canBootstrapOwner({ targetEmail: "other@example.com", configuredEmail: "owner@example.com", activeOwnerCount: 0 }), false);
  assert.equal(canBootstrapOwner({ targetEmail: "owner@example.com", configuredEmail: "owner@example.com", activeOwnerCount: 1 }), false);
  assert.equal(canBootstrapOwner({ targetEmail: "owner@example.com", configuredEmail: "", activeOwnerCount: 0 }), false);
});

