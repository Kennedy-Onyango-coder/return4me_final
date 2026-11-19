import test from "node:test";
import assert from "node:assert/strict";

function canReview({ reviewerId, proposerId, reviewerRoles, status, expiresAt, now = new Date() }) {
  if (status !== "pending" || new Date(expiresAt) <= now) return false;
  if (reviewerId === proposerId && !reviewerRoles.includes("owner")) return false;
  return reviewerRoles.includes("admin") || reviewerRoles.includes("owner");
}

test("Admin cannot approve or reject own proposal",()=>{
  assert.equal(canReview({reviewerId:"a",proposerId:"a",reviewerRoles:["admin"],status:"pending",expiresAt:"2030-01-01T00:00:00Z",now:new Date("2029-01-01")}),false);
});
test("different Admin can review an Admin proposal",()=>{
  assert.equal(canReview({reviewerId:"b",proposerId:"a",reviewerRoles:["admin"],status:"pending",expiresAt:"2030-01-01T00:00:00Z",now:new Date("2029-01-01")}),true);
});
test("Owner can finally approve own or another Admin proposal",()=>{
  assert.equal(canReview({reviewerId:"o",proposerId:"o",reviewerRoles:["owner"],status:"pending",expiresAt:"2030-01-01T00:00:00Z",now:new Date("2029-01-01")}),true);
  assert.equal(canReview({reviewerId:"o",proposerId:"a",reviewerRoles:["owner"],status:"pending",expiresAt:"2030-01-01T00:00:00Z",now:new Date("2029-01-01")}),true);
});
test("expired or decided proposals cannot be reviewed",()=>{
  assert.equal(canReview({reviewerId:"b",proposerId:"a",reviewerRoles:["admin"],status:"pending",expiresAt:"2020-01-01T00:00:00Z",now:new Date("2021-01-01")}),false);
  assert.equal(canReview({reviewerId:"b",proposerId:"a",reviewerRoles:["admin"],status:"approved",expiresAt:"2030-01-01T00:00:00Z",now:new Date("2029-01-01")}),false);
});
