import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const security = read('server/security.ts');
assert.match(security, /export async function consumeStepUpGrantInTransaction\(tx: any, auth: AuthUser, purpose: string\)/);
assert.match(security, /\.limit\(1\)\.for\("update"\)/);
assert.match(security, /\.returning\(\{ id: adminStepUpGrants\.id \}\)/);
assert.match(security, /export function requireStepUpInTransaction\(purpose: string\)/);
assert.match(security, /req\.stepUpPurpose = purpose/);

const cases = [
  ['server/routes/claim-evidence.ts', 'admin.claim.evidence.review', 'claimEvidenceRouter.patch("/claims/:claimId/evidence/:evidenceId/review"'],
  ['server/routes/disputes.ts', 'admin.dispute.resolve', 'disputesRouter.patch("/:disputeId/resolve"'],
  ['server/routes/agents.ts', 'admin.agent.assignment.create', 'agentsRouter.post("/assignments"'],
  ['server/routes/agents.ts', 'admin.agent.assignment.cancel', 'agentsRouter.patch("/assignments/:assignmentId/cancel"'],
  ['server/routes/finance.ts', 'admin.finance.refund.reconcile', 'financeRouter.post("/refund-requests/:id/reconcile"'],
  ['server/routes/finance.ts', 'admin.finance.payout.reconcile', 'financeRouter.post("/payout-requests/:id/reconcile"'],
  ['server/routes/organisations.ts', 'admin.organisation.status.change', 'organisationsRouter.patch("/:organisationId/status"'],
  ['server/routes/pricing.ts', 'admin.pricing.schedule.approve', 'pricingRouter.patch("/schedules/:scheduleId/approve"'],
  ['server/routes/communications.ts', 'admin.communications.approve', 'communicationsRouter.patch("/campaigns/:campaignId/approve"'],
];
for (const [path, purpose, route] of cases) {
  const source = read(path);
  const routeAt = source.indexOf(route);
  assert.notEqual(routeAt, -1, `${path}: route exists`);
  const routeText = source.slice(routeAt, source.indexOf('\n});', routeAt) + 4);
  assert.ok(routeText.includes(`requireStepUpInTransaction("${purpose}")`), `${purpose}: validation middleware attached`);
  assert.ok(routeText.includes(`consumeStepUpGrantInTransaction(tx, req.auth!, "${purpose}")`), `${purpose}: grant consumed inside transaction`);
  assert.ok(routeText.includes('db.transaction'), `${purpose}: transaction used`);
}

const adminRoutes = read('server/routes/admin.ts');
assert.ok(adminRoutes.includes('requireStepUpInTransaction(reportDecisionPurpose(parsed.data.status))'));
assert.ok(adminRoutes.includes('consumeStepUpGrantInTransaction(tx, req.auth!, reportDecisionPurpose(parsed.data.status))'));
assert.ok(adminRoutes.includes('requireStepUpInTransaction("admin.report.approval.review")'));
assert.ok(adminRoutes.includes('consumeStepUpGrantInTransaction(tx, req.auth!, "admin.report.approval.review")'));

// Existing non-transactional high-risk endpoints retain the consuming middleware;
// they are not falsely represented as transaction-atomic by this batch.
const finance = read('server/routes/finance.ts');
assert.ok(finance.includes('requireStepUp("admin.finance.refund.execute")'));
for (const purpose of ['admin.finance.refund.reconcile', 'admin.finance.payout.reconcile']) assert.ok(finance.includes(`consumeStepUpGrantInTransaction(tx, req.auth!, "${purpose}")`));
console.log(`Transactional step-up source guard passed (${cases.length + 2} workflows; legacy non-transactional middleware retained where not refactored).`);
