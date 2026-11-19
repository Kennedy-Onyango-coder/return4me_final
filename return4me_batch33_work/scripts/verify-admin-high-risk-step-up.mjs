import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const auth = await readFile(new URL("../server/routes/auth.ts", import.meta.url), "utf8");
const policy = await readFile(new URL("../shared/admin-step-up-policy.mjs", import.meta.url), "utf8");
const communications = await readFile(new URL("../server/routes/communications.ts", import.meta.url), "utf8");
const organisations = await readFile(new URL("../server/routes/organisations.ts", import.meta.url), "utf8");
const agentOps = await readFile(new URL("../server/routes/agent-operations.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const evidence = await readFile(new URL("../server/routes/claim-evidence.ts", import.meta.url), "utf8");
const disputes = await readFile(new URL("../server/routes/disputes.ts", import.meta.url), "utf8");
const agents = await readFile(new URL("../server/routes/agents.ts", import.meta.url), "utf8");
const pricing = await readFile(new URL("../server/routes/pricing.ts", import.meta.url), "utf8");
const finance = await readFile(new URL("../server/routes/finance.ts", import.meta.url), "utf8");
const addedPurposes = [
  "admin.claim.evidence.review", "admin.dispute.resolve", "admin.agent.status.change",
  "admin.agent.assignment.create", "admin.agent.assignment.cancel", "admin.pricing.schedule.approve",
  "admin.finance.collection.review", "admin.finance.refund.approve", "admin.finance.refund.execute",
  "admin.finance.refund.reconcile", "admin.finance.payout_destination.verify", "admin.finance.reward.verify",
  "admin.finance.payout.approve", "admin.finance.payout.execute", "admin.finance.payout.reconcile"
];
for (const purpose of ["admin.agreement.legal_approve", "admin.communications.approve", "admin.organisation.status.change", ...addedPurposes]) {
  assert.ok(policy.includes(`"${purpose}"`), `Missing policy purpose ${purpose}`);
  assert.ok(auth.includes(`"${purpose}"`), `Missing OTP challenge mapping ${purpose}`);
  assert.ok(ui.includes(`value="${purpose}"`), `Missing workspace step-up choice ${purpose}`);
}
assert.match(auth, /ownerOnlyStepUpPurposes[\s\S]*admin\.agreement\.legal_approve/);
assert.match(agentOps, /legal-approve", requireRole\("owner"\), \(req,res,next\)=>requireStepUp\("admin\.agreement\.legal_approve"\)/);
assert.match(communications, /campaigns\/:campaignId\/approve", requireRole\("admin", "owner"\), \(req,res,next\)=>requireStepUpInTransaction\("admin\.communications\.approve"\)/);
assert.match(organisations, /:\s*organisationId\/status", requireRole\("admin", "owner"\), \(req,res,next\)=>requireStepUpInTransaction\("admin\.organisation\.status\.change"\)/);
assert.match(organisations, /tx\.insert\(auditEvents\)[\s\S]*correlationId/);
console.log("High-risk step-up guard passed for agreement legal approval, communications approval and organisation status decisions. Static guard only.");

assert.match(evidence, /evidence\/\:evidenceId\/review", requireRole\("admin", "trust_safety"\), \(req, res, next\) => requireStepUpInTransaction\("admin.claim.evidence.review"\)/);
assert.match(disputes, /:disputeId\/resolve", requireRole\("trust_safety", "admin"\), \(req, res, next\) => requireStepUpInTransaction\("admin.dispute.resolve"\)/);
assert.ok(agents.includes(`requireStepUp("admin.agent.status.change")`));
for (const purpose of ["admin.agent.assignment.create", "admin.agent.assignment.cancel"]) assert.ok(agents.includes(`requireStepUpInTransaction("${purpose}")`));
assert.ok(pricing.includes('requireStepUpInTransaction("admin.pricing.schedule.approve")'));
for (const purpose of addedPurposes.filter(p => p.startsWith("admin.finance."))) {
  assert.ok(finance.includes(`requireStepUp("${purpose}")`) || finance.includes(`requireStepUpInTransaction("${purpose}")`), purpose);
}
console.log("Additional high-risk step-up route guard passed. Static guard only.");

assert.match(finance, /canApproveRefund\(refund\.requestedBy, req\.auth!\.id, refund\.status, req\.auth!\.roles\.includes\("owner"\)\)/);
assert.match(finance, /request\.createdBy === req\.auth!\.id && !req\.auth!\.roles\.includes\("owner"\)/);
const communicationsText = communications;
const pricingText = await readFile(new URL("../server/routes/pricing.ts", import.meta.url), "utf8");
assert.match(communicationsText, /campaign\.createdBy === req\.auth!\.id && !req\.auth!\.roles\.includes\("owner"\)/);
assert.match(pricingText, /schedule\.createdBy === req\.auth!\.id && !req\.auth!\.roles\.includes\("owner"\)/);
console.log("Owner final-approval override checks passed. Static guard only.");
