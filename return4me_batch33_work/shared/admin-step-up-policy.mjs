const purposes = new Set([
  "admin.report.status.published",
  "admin.report.status.rejected",
  "admin.report.status.closed",
  "admin.report.approval.review",
  "admin.role.grant",
  "admin.role.revoke",
  "admin.agreement.legal_approve",
  "admin.communications.approve",
  "admin.organisation.status.change",
  "admin.claim.evidence.review",
  "admin.dispute.resolve",
  "admin.agent.status.change",
  "admin.agent.assignment.create",
  "admin.agent.assignment.cancel",
  "admin.pricing.schedule.approve",
  "admin.finance.collection.review",
  "admin.finance.refund.approve",
  "admin.finance.refund.execute",
  "admin.finance.refund.reconcile",
  "admin.finance.payout_destination.verify",
  "admin.finance.reward.verify",
  "admin.finance.payout.approve",
  "admin.finance.payout.execute",
  "admin.finance.payout.reconcile"
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
