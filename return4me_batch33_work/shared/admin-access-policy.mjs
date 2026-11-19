/**
 * Server-owned Stage 11 capability catalogue. This is descriptive policy for
 * navigation and safe capability discovery; route middleware remains authoritative.
 * Owner is the highest authority across declared administrative capabilities.
 * Restricted data remains subject to authentication, route-level purpose checks,
 * audit logging and any explicitly retained safety gates.
 */
const matrix = Object.freeze([
  { capability: "admin.overview", label: "Operational overview", roles: ["admin", "owner"], dataClass: "aggregated", ownerAllowed: true },
  { capability: "admin.audit.read", label: "Read-only audit activity", roles: ["admin", "owner"], dataClass: "audit_metadata", ownerAllowed: true },
  { capability: "reports.queue.read", label: "Report review queue", roles: ["admin", "owner"], dataClass: "case_metadata", ownerAllowed: true },
  { capability: "claims.queue.read", label: "Claim triage queue", roles: ["admin", "owner"], dataClass: "case_metadata", ownerAllowed: true },
  { capability: "claims.detail.review", label: "Claim evidence and ownership review", roles: ["admin", "owner"], dataClass: "restricted_case", ownerAllowed: true },
  { capability: "disputes.detail.review", label: "Dispute investigation and resolution", roles: ["admin", "owner"], dataClass: "restricted_case", ownerAllowed: true },
  { capability: "appeals.detail.review", label: "Independent appeal review", roles: ["admin", "owner"], dataClass: "restricted_case", ownerAllowed: true },
  { capability: "evidence.review", label: "Protected evidence review", roles: ["admin", "owner"], dataClass: "restricted_evidence", ownerAllowed: true },
  { capability: "agents.manage", label: "Agent applications and assignments", roles: ["admin", "owner"], dataClass: "operational_personal", ownerAllowed: true },
  { capability: "organisations.manage", label: "Organisation verification and membership", roles: ["admin", "owner"], dataClass: "operational_personal", ownerAllowed: true },
  { capability: "support.queue", label: "Support ticket queue", roles: ["admin", "owner"], dataClass: "customer_support", ownerAllowed: true },
  { capability: "finance.operations", label: "Finance operations", roles: ["admin", "owner"], dataClass: "financial_restricted", ownerAllowed: true },
  { capability: "trust_safety.incidents", label: "Trust and safety incidents", roles: ["admin", "owner"], dataClass: "restricted_safety", ownerAllowed: true },
  { capability: "communications.manage", label: "Communications workflow", roles: ["admin", "owner"], dataClass: "content_governance", ownerAllowed: true },
  { capability: "governance.agreements.legal_approve", label: "Legal approval of Agent agreements", roles: ["owner"], dataClass: "governance_restricted", ownerAllowed: true },
  { capability: "admin.roles.manage", label: "Manage Admin access", roles: ["owner"], dataClass: "identity_and_access_restricted", ownerAllowed: true }
]);

export function getAdminCapabilityMatrix(roles = []) {
  const active = new Set(Array.isArray(roles) ? roles : []);
  if (active.has("owner")) return matrix.map(item => ({ capability: item.capability, label: item.label, dataClass: item.dataClass, permitted: true, ownerAllowed: true }));
  return matrix.map(item => ({
    capability: item.capability,
    label: item.label,
    dataClass: item.dataClass,
    permitted: item.roles.some(role => active.has(role)),
    ownerAllowed: item.ownerAllowed
  }));
}

export function canAccessAdminCapability(capability, roles = []) {
  const item = matrix.find(entry => entry.capability === capability);
  return Boolean(item && (roles.includes("owner") || item.roles.some(role => roles.includes(role))));
}
