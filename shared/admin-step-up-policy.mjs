const purposes = new Set([
  "admin.report.status.published",
  "admin.report.status.rejected",
  "admin.report.status.closed",
  "admin.report.approval.review",
  "admin.role.grant",
  "admin.role.revoke",
  "admin.agreement.legal_approve",
  "admin.communications.approve",
  "admin.communications.approver.assign",
  "admin.communications.publisher.assign",
  "admin.communications.schedule",
  "admin.communications.withdraw",
  "admin.organisation.status.change",
  "admin.claim.evidence.review",
  "admin.claim.authority.review",
  "admin.claim.ownership.review",
  "admin.agent.dropoff_code.issue",
  "admin.claim.collection_code.issue",
  "admin.claim.collection_identity.check",
  "admin.agent.service_phone.verify",
  "admin.dispute.resolve",
  "admin.appeal.review",
  "admin.agent.status.change",
  "admin.agent.document.review",
  "admin.agent.document.delete",
  "admin.agent.assignment.create",
  "admin.agent.assignment.cancel",
  "admin.pricing.schedule.approve",
  "admin.finance.collection.review",
  "admin.finance.settlement.allocation_review",
  "admin.finance.liability.review",
  "admin.finance.period_close.review",
  "admin.finance.provider_statement.register",
  "admin.finance.provider_statement.review",
  "admin.finance.provider_reversal.register",
  "admin.finance.provider_reversal.review",
  "admin.finance.refund.approve",
  "admin.finance.refund.execute",
  "admin.finance.refund.reconcile",
  "admin.finance.payout_destination.verify",
  "admin.finance.reward.verify",
  "admin.finance.payout.approve",
  "admin.finance.payout.execute",
  "admin.finance.payout.reconcile",
  "admin.privacy.request.decide",
  "admin.security_incident.update",
  "admin.privacy.legal_hold.create",
  "admin.privacy.legal_hold.release",
  "admin.privacy.retention.propose",
  "admin.security.risk_review.create",
  "admin.security.risk_review.resolve",
  "admin.security.incident.assess"
]);

export function isSupportedStepUpPurpose(value) {
  return typeof value === "string" && purposes.has(value);
}

export function reportStatusStepUpPurpose(status) {
  if (status === "published" || status === "rejected" || status === "closed") return `admin.report.status.${status}`;
  return null;
}

export function stepUpGrantIsUsable(grant, context, now = new Date()) {
  if (!grant || !context || !isSupportedStepUpPurpose(grant.purpose)) return false;
  const expiresAt = new Date(grant.expiresAt);
  return grant.userId === context.userId && grant.sessionId === context.sessionId &&
    grant.purpose === context.purpose && grant.consumedAt == null &&
    Number.isFinite(expiresAt.getTime()) && expiresAt > now;
}
