import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
// Returns the text of a single route declaration, stopping at the next top-level
// `<name>Router.<verb>(` declaration. Nested callbacks close with `});` too, so a
// first-`});` slice silently truncates handlers and produces false negatives.
function routeSegment(source, route) {
  const at = source.indexOf(route);
  if (at === -1) return '';
  const rest = source.slice(at + route.length);
  const next = rest.search(/\n[a-zA-Z]+Router\.(?:get|post|patch|put|delete)\(/);
  return next >= 0 ? rest.slice(0, next) : rest;
}
const security = read('server/security.ts');
const policy = read('shared/admin-step-up-policy.mjs');
const auth = read('server/routes/auth.ts');
const ui = read('src/App.tsx');
const communications = read('server/routes/communications.ts');
assert.match(security, /export async function consumeStepUpGrantInTransaction\(tx: any, auth: AuthUser, purpose: string\)/);
assert.match(security, /\.limit\(1\)\.for\("update"\)/);
assert.match(security, /\.returning\(\{ id: adminStepUpGrants\.id \}\)/);
assert.match(security, /export function requireStepUpInTransaction\(purpose: string\)/);
assert.match(security, /req\.stepUpPurpose = purpose/);
assert.match(security, /export async function consumeStepUpGrantWithPgClient/);
assert.match(security, /FOR UPDATE/);

const cases = [
  ['server/routes/claim-evidence.ts', 'admin.claim.evidence.review', 'claimEvidenceRouter.patch("/claims/:claimId/evidence/:evidenceId/review"'],
  ['server/routes/disputes.ts', 'admin.dispute.resolve', 'disputesRouter.patch("/:disputeId/resolve"'],
  ['server/routes/claims.ts', 'admin.appeal.review', 'claimsRouter.patch("/appeals/:appealId/review"'],
  ['server/routes/agents.ts', 'admin.agent.assignment.create', 'agentsRouter.post("/assignments"'],
  ['server/routes/agents.ts', 'admin.agent.assignment.cancel', 'agentsRouter.patch("/assignments/:assignmentId/cancel"'],
  ['server/routes/agents.ts', 'admin.agent.status.change', 'agentsRouter.patch("/:id/status"'],
  ['server/routes/finance.ts', 'admin.finance.collection.review', 'financeRouter.post("/reconciliation/collections/:id/review"'],
  ['server/routes/finance.ts', 'admin.finance.refund.approve', 'financeRouter.post("/refund-requests/:id/approve"'],
  ['server/routes/finance.ts', 'admin.finance.payout.approve', 'financeRouter.post("/payout-requests/:id/approve"'],
  ['server/routes/finance.ts', 'admin.finance.refund.reconcile', 'financeRouter.post("/refund-requests/:id/reconcile"'],
  ['server/routes/finance.ts', 'admin.finance.payout.reconcile', 'financeRouter.post("/payout-requests/:id/reconcile"'],
  ['server/routes/finance.ts', 'admin.finance.payout_destination.verify', 'financeRouter.post("/payout-destinations/:id/verify"'],
  ['server/routes/organisations.ts', 'admin.organisation.status.change', 'organisationsRouter.patch("/:organisationId/status"'],
  ['server/routes/pricing.ts', 'admin.pricing.schedule.approve', 'pricingRouter.patch("/schedules/:scheduleId/approve"'],
  ['server/routes/communications.ts', 'admin.communications.approve', 'communicationsRouter.patch("/campaigns/:campaignId/approve"'],
  ['server/routes/communications.ts', 'admin.communications.approver.assign', 'communicationsRouter.put("/governance/approver"'],
  ['server/routes/communications.ts', 'admin.communications.publisher.assign', 'communicationsRouter.put("/governance/publisher"'],
  ['server/routes/communications.ts', 'admin.communications.schedule', 'communicationsRouter.post("/campaigns/:campaignId/schedule"'],
  ['server/routes/communications.ts', 'admin.communications.withdraw', 'communicationsRouter.post("/campaigns/:campaignId/withdraw"'],
  ['server/routes/privacy.ts', 'admin.privacy.request.decide', 'privacyRouter.post("/requests/:id/decision"'],
  ['server/routes/security-incidents.ts', 'admin.security_incident.update', 'securityIncidentsRouter.patch("/:incidentId"'],
];
for (const purpose of ["admin.communications.approver.assign", "admin.communications.publisher.assign", "admin.communications.schedule", "admin.communications.withdraw"]) {
  assert.ok(policy.includes(`"${purpose}"`), `Missing communications step-up policy ${purpose}`);
  assert.ok(auth.includes(`"${purpose}":`), `Missing communications OTP mapping ${purpose}`);
  assert.ok(ui.includes(`value="${purpose}"`), `Missing communications step-up UI choice ${purpose}`);
}
for (const [path, purpose, route] of cases) {
  const source = read(path);
  const routeAt = source.indexOf(route);
  assert.notEqual(routeAt, -1, `${path}: route exists`);
  // Slice to the next top-level route declaration: nested callbacks legitimately
  // close with `});`, so stopping at the first `});` truncates the handler.
  const routeText = routeSegment(source, route);
  assert.ok(routeText.includes(`requireStepUpInTransaction("${purpose}")`), `${purpose}: validation middleware attached`);
  assert.ok(routeText.includes(`consumeStepUpGrantInTransaction(tx, req.auth!, "${purpose}")`), `${purpose}: grant consumed inside transaction`);
  assert.ok(routeText.includes('db.transaction'), `${purpose}: transaction used`);
}

const agentDocuments = read('server/routes/agent-documents.ts');
for (const [purpose, route] of [['admin.agent.document.review', 'agentDocumentsRouter.patch("/admin/:agentId/:documentId/review"'], ['admin.agent.document.delete', 'agentDocumentsRouter.delete("/admin/:agentId/:documentId"']]) {
  const at = agentDocuments.indexOf(route);
  assert.notEqual(at, -1, `${purpose}: route exists`);
  const routeText = routeSegment(agentDocuments, route);
  assert.ok(routeText.includes(`requireStepUpInTransaction("${purpose}")`), `${purpose}: validation middleware attached`);
  assert.ok(routeText.includes(`consumeStepUpGrantInTransaction(tx, req.auth!, "${purpose}")`), `${purpose}: grant consumed in transaction`);
  assert.ok(routeText.includes('db.transaction'), `${purpose}: transaction used`);
}

const adminRoutes = read('server/routes/admin.ts');
for (const [purpose, route] of [['admin.role.grant', 'adminRouter.post("/users/:userId/admin-role"'], ['admin.role.revoke', 'adminRouter.delete("/users/:userId/admin-role"']]) {
  const at = adminRoutes.indexOf(route);
  assert.notEqual(at, -1, `${purpose}: route exists`);
  const routeText = adminRoutes.slice(at, adminRoutes.indexOf('\n  });', at) + 5);
  assert.ok(routeText.includes(`requireStepUpInTransaction("${purpose}")`), `${purpose}: validation middleware attached`);
  assert.ok(routeText.includes(`consumeStepUpGrantInTransaction(tx, req.auth!, "${purpose}")`), `${purpose}: grant consumed in transaction`);
}
assert.ok(adminRoutes.includes('requireStepUpInTransaction(reportDecisionPurpose(parsed.data.status))'));
assert.ok(adminRoutes.includes('consumeStepUpGrantInTransaction(tx, req.auth!, reportDecisionPurpose(parsed.data.status))'));
assert.ok(adminRoutes.includes('requireStepUpInTransaction("admin.report.approval.review")'));
assert.ok(adminRoutes.includes('consumeStepUpGrantInTransaction(tx, req.auth!, "admin.report.approval.review")'));

// Existing non-transactional high-risk endpoints retain the consuming middleware;
// they are not falsely represented as transaction-atomic by this batch.
const finance = read('server/routes/finance.ts');
assert.ok(finance.includes('requireStepUpInTransaction("admin.finance.refund.execute")'));
assert.ok(finance.includes('consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.refund.execute")'));
assert.ok(finance.includes('requireStepUpInTransaction("admin.finance.payout.execute")'));
assert.ok(finance.includes('consumeStepUpGrantWithPgClient(reservationClient, req.auth!, "admin.finance.payout.execute")'));
const refundProvider = read('server/services/intasend-refunds.ts');
assert.match(refundProvider, /idempotency_key:\s*args\.idempotencyKey/);
assert.match(finance, /idempotencyKey:\s*refundRequests\.idempotencyKey/);
assert.match(finance, /lockedRefund\.status !== "approved"/);
assert.match(finance, /lockedPayment\.payerPhoneFingerprint !== lockedRefund\.originalPayerFingerprint/);
assert.ok(finance.includes('requireStepUpInTransaction("admin.finance.reward.verify")'));
assert.ok(finance.includes('consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.reward.verify")'));
const settlementService = read('server/services/settlements.ts');
assert.ok(settlementService.includes('consumeStepUp?: (tx: any) => Promise<void>'));
assert.ok(settlementService.includes('if (consumeStepUp) await consumeStepUp(tx)'));
const agentOps = read('server/routes/agent-operations.ts');
assert.ok(agentOps.includes('requireStepUpInTransaction("admin.agreement.legal_approve")'));
assert.ok(agentOps.includes('consumeStepUpGrantWithPgClient(client, req.auth!, "admin.agreement.legal_approve")'));
assert.ok(agentOps.includes('await client.query("BEGIN")'));
assert.ok(agentOps.includes('await client.query("COMMIT")'));
for (const purpose of ['admin.finance.refund.reconcile', 'admin.finance.payout.reconcile']) assert.ok(finance.includes(`consumeStepUpGrantInTransaction(tx, req.auth!, "${purpose}")`));
console.log(`Transactional step-up source guard passed (${cases.length + 11} workflows; refund/payout execution reservations are transaction-bound and refund provider requests carry a stable idempotency key).`);

