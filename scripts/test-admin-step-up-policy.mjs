import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedStepUpPurpose, reportStatusStepUpPurpose, stepUpGrantIsUsable } from "../shared/admin-step-up-policy.mjs";

test("only explicitly enumerated high-risk report purposes are accepted", () => {
  assert.equal(isSupportedStepUpPurpose("admin.report.status.published"), true);
  assert.equal(isSupportedStepUpPurpose("admin.report.status.rejected"), true);
  assert.equal(isSupportedStepUpPurpose("admin.report.status.closed"), true);
  assert.equal(isSupportedStepUpPurpose("admin.user.role.grant"), false);
  assert.equal(isSupportedStepUpPurpose(["admin.report.status.published"]), false);
});

test("only consequential report status transitions require step-up", () => {
  assert.equal(reportStatusStepUpPurpose("published"), "admin.report.status.published");
  assert.equal(reportStatusStepUpPurpose("rejected"), "admin.report.status.rejected");
  assert.equal(reportStatusStepUpPurpose("closed"), "admin.report.status.closed");
  assert.equal(reportStatusStepUpPurpose("under_review"), null);
});

test("step-up grants are bound to user, session and purpose and cannot be replayed", () => {
  const now = new Date("2026-11-15T02:00:00Z");
  const grant = { userId:"u1", sessionId:"s1", purpose:"admin.report.status.published", expiresAt:"2026-11-15T02:05:00Z", consumedAt:null };
  const context = { userId:"u1", sessionId:"s1", purpose:"admin.report.status.published" };
  assert.equal(stepUpGrantIsUsable(grant, context, now), true);
  assert.equal(stepUpGrantIsUsable(grant, {...context,userId:"u2"}, now), false);
  assert.equal(stepUpGrantIsUsable(grant, {...context,sessionId:"s2"}, now), false);
  assert.equal(stepUpGrantIsUsable(grant, {...context,purpose:"admin.report.status.closed"}, now), false);
  assert.equal(stepUpGrantIsUsable({...grant,consumedAt:now}, context, now), false);
  assert.equal(stepUpGrantIsUsable({...grant,expiresAt:"2026-11-15T01:59:59Z"}, context, now), false);
});

test("maker-checker review has a distinct supported step-up purpose", () => {
  assert.equal(isSupportedStepUpPurpose("admin.report.approval.review"), true);
  assert.equal(isSupportedStepUpPurpose("admin.report.approval.anything"), false);
  assert.equal(isSupportedStepUpPurpose("admin.role.grant"), true);
  assert.equal(isSupportedStepUpPurpose("admin.role.revoke"), true);
  assert.equal(isSupportedStepUpPurpose("admin.agreement.legal_approve"), true);
  assert.equal(isSupportedStepUpPurpose("admin.communications.approve"), true);
  assert.equal(isSupportedStepUpPurpose("admin.communications.approver.assign"), true);
  assert.equal(isSupportedStepUpPurpose("admin.communications.publisher.assign"), true);
  assert.equal(isSupportedStepUpPurpose("admin.communications.schedule"), true);
  assert.equal(isSupportedStepUpPurpose("admin.communications.withdraw"), true);
  assert.equal(isSupportedStepUpPurpose("admin.organisation.status.change"), true);
  assert.equal(isSupportedStepUpPurpose("admin.role.owner.grant"), false);
});


test("additional operational high-risk purposes are explicitly allowlisted", () => {
  const purposes = [
    "admin.claim.evidence.review", "admin.dispute.resolve", "admin.agent.status.change",
    "admin.agent.assignment.create", "admin.agent.assignment.cancel", "admin.pricing.schedule.approve",
    "admin.finance.collection.review", "admin.finance.refund.approve", "admin.finance.refund.execute",
    "admin.finance.refund.reconcile", "admin.finance.payout_destination.verify", "admin.finance.reward.verify",
    "admin.finance.payout.approve", "admin.finance.payout.execute", "admin.finance.payout.reconcile"
  ];
  for (const purpose of purposes) assert.equal(isSupportedStepUpPurpose(purpose), true, purpose);
  assert.equal(isSupportedStepUpPurpose("admin.finance.wallet.transfer"), false);
});


test("privacy decisions and security incident updates require distinct supported step-up purposes", () => {
  assert.equal(isSupportedStepUpPurpose("admin.privacy.request.decide"), true);
  assert.equal(isSupportedStepUpPurpose("admin.security_incident.update"), true);
  assert.equal(isSupportedStepUpPurpose("admin.privacy.request.erase"), false);
  assert.equal(isSupportedStepUpPurpose("admin.security_incident.delete"), false);
});
