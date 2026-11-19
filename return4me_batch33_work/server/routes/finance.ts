import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, assignments, caseDisputes, claims, custodyEvents, financialJournals, financialPostings, itemCategories, paymentAssessments, paymentTransactions, payoutDestinations, payoutRequests, refundRequests, rewardAuthorizations, reconciliationItems, pricingRules, pricingSchedules, reports, settlements } from "../db/schema.js";
import { authenticate, requireRole, requireStepUp, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { hasAdminAuthority } from "../../shared/admin-role-policy.mjs";
import { notifySafely } from "../services/notifications.js";
import { intasendRefundEnabled, initiateIntaSendRefund } from "../services/intasend-refunds.js";
import { intasendCollectionEnabled } from "../services/intasend-collections.js";
import { canApproveRefund, canExecuteRefund, canRequestOriginalPayerRefund } from "../../shared/refund-policy.js";
import { normalizeKenyanMpesaPhone } from "../../shared/payment-collection-policy.js";
import { activePaymentPiiVersion, encryptPaymentPhone, fingerprintPaymentPhone, paymentPiiConfigured } from "../services/payment-pii.js";
import { verifyRewardAuthorizationAndCreateSettlement } from "../services/settlements.js";
import { intasendPayoutEnabled, initiateIntaSendPayout, fetchIntaSendPayoutStatus } from "../services/intasend-payouts.js";
import { evaluatePayoutPreflight } from "../../shared/financial-policy.js";
import { rotatePaymentPiiBatch } from "../services/payment-pii-rotation.js";

export const financeRouter = Router();
financeRouter.use(authenticate);

financeRouter.get("/readiness", requireRole("finance", "admin", "owner"), async (_req, res) => {
  res.json({
    capability: "controlled_finance",
    liveCollectionEnabled: false,
    liveRefundEnabled: false,
    livePayoutEnabled: false,
    sandboxCollectionEnabled: intasendCollectionEnabled(),
    sandboxRefundEnabled: intasendRefundEnabled(),
    sandboxPayoutEnabled: intasendPayoutEnabled(),
    automatedSettlementApprovalEnabled: true,
    payoutInitiationManualOnly: true,
    blockers: [
      "All provider execution flags default to disabled and only sandbox hosts are supported",
      "IntaSend API, webhook and per-transaction payout status contracts require deployment-specific acceptance",
      "Collection/disbursement/settlement wallet identity, capability and available liquidity require operator evidence",
      "Migrations, immutable journals, reconciliation, refund and payout workflows require disposable-PostgreSQL acceptance",
      "Beneficiary KYC, destination verification, maker-checker and manual payout controls require independent review",
      "Kenyan payments, tax and accounting professional review is outstanding; no live money movement is authorised"
    ]
  });
});

financeRouter.get("/ledger/journals", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: financialJournals.id, sourceType: financialJournals.sourceType, sourceId: financialJournals.sourceId, currency: financialJournals.currency, memo: financialJournals.memo, createdAt: financialJournals.createdAt }).from(financialJournals).orderBy(desc(financialJournals.createdAt)).limit(200);
    const ids = rows.map(row => row.id);
    const postings = ids.length ? await db.select().from(financialPostings).where(or(...ids.map(id => eq(financialPostings.journalId, id)))) : [];
    res.json({ journals: rows.map(journal => ({ ...journal, postings: postings.filter(posting => posting.journalId === journal.id) })), notice: "Read-only immutable journal view. Corrections require a separate correcting journal." });
  } catch (error) { next(error); }
});

financeRouter.get("/payment-transactions", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: paymentTransactions.id, claimId: claims.id, claimReference: reports.reference,
      amountKes: paymentTransactions.amountKes, status: paymentTransactions.status, providerState: paymentTransactions.providerState,
      payerPhoneMasked: paymentTransactions.payerPhoneMasked, createdAt: paymentTransactions.createdAt, confirmedAt: paymentTransactions.confirmedAt,
      assessmentStatus: paymentAssessments.status })
      .from(paymentTransactions).innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).innerJoin(reports, eq(reports.id, claims.reportId))
      .innerJoin(paymentAssessments, eq(paymentAssessments.id, paymentTransactions.assessmentId))
      .orderBy(desc(paymentTransactions.createdAt)).limit(300);
    res.json({ payments: rows });
  } catch (error) { next(error); }
});

financeRouter.get("/eligible-claims", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT c.id,c.status,r.reference,pt.amount_kes payment_amount_kes,released.created_at released_at
      FROM claims c JOIN reports r ON r.id=c.report_id
      JOIN assignments x ON x.report_id=c.report_id AND x.status='assigned'
      JOIN agents a ON a.id=x.agent_id AND a.status='active' AND a.verified_at IS NOT NULL
      JOIN custody_events released ON released.report_id=c.report_id AND released.agent_id=a.id AND released.event_type='released'
      JOIN payment_transactions pt ON pt.claim_id=c.id AND pt.status='confirmed'
      JOIN payment_assessments pa ON pa.id=pt.assessment_id AND pa.status='paid'
      WHERE c.status='completed' AND NOT EXISTS(SELECT 1 FROM settlements s WHERE s.claim_id=c.id)
        AND NOT EXISTS(SELECT 1 FROM reward_authorizations ra WHERE ra.claim_id=c.id)
        AND NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=c.id AND d.settlement_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
      ORDER BY released.created_at DESC LIMIT 200`);
    res.json({ claims: result.rows });
  } catch (error) { next(error); }
});

financeRouter.get("/settlements", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: settlements.id, claimId: settlements.claimId, grossKes: settlements.grossKes, finderKes: settlements.finderKes, agentKes: settlements.agentKes, platformKes: settlements.platformKes, finderPercent: settlements.finderPercent, agentPercent: settlements.agentPercent, platformPercent: settlements.platformPercent, status: settlements.status, settleAt: settlements.settleAt, approvedAt: settlements.approvedAt, approvalMode: settlements.approvalMode, payoutInitiatedAt: settlements.payoutInitiatedAt, createdAt: settlements.createdAt }).from(settlements).orderBy(desc(settlements.createdAt)).limit(200);
    res.json({ settlements: rows, notice: "Read-only financial view. No payout or settlement state can be changed from this endpoint." });
  } catch (error) { next(error); }
});

// Create a transparent, versioned price assessment only after an authorised human
// reviewer has approved the ownership claim. This does NOT initiate collection.
financeRouter.post("/assessments", requireRole("finance", "admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ claimId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A valid claim is required" });
    const result = await db.transaction(async (tx) => {
      const [claim] = await tx.select().from(claims).where(eq(claims.id, parsed.data.claimId)).limit(1).for("update");
      if (!claim) return fail(404, "Claim not found");
      if (claim.status !== "approved") return fail(409, "An assessment can only be prepared after ownership approval");
      const [existing] = await tx.select().from(paymentAssessments).where(eq(paymentAssessments.claimId, claim.id)).orderBy(desc(paymentAssessments.createdAt)).limit(1);
      if (existing && ["awaiting_claimant_confirmation", "claimant_confirmed", "collection_pending", "paid"].includes(existing.status)) {
        return succeed({ assessment: existing, reused: true });
      }
      const [report] = await tx.select().from(reports).where(eq(reports.id, claim.reportId)).limit(1);
      if (!report) return fail(409, "The related report could not be found");
      const now = new Date();
      const [schedule] = await tx.select().from(pricingSchedules).where(and(
        eq(pricingSchedules.status, "active"),
        or(isNull(pricingSchedules.effectiveFrom), lte(pricingSchedules.effectiveFrom, now)),
        or(isNull(pricingSchedules.effectiveUntil), gt(pricingSchedules.effectiveUntil, now))
      )).orderBy(desc(pricingSchedules.approvedAt)).limit(1);
      if (!schedule) return fail(409, "No currently effective approved KES pricing schedule is available");
      const [category] = await tx.select().from(itemCategories).where(and(eq(itemCategories.name, report.category), eq(itemCategories.active, true))).limit(1);
      if (!category) return fail(409, "This category has no approved pricing category record. Ask an administrator to seed or approve the category first.");
      const [rule] = await tx.select().from(pricingRules).where(and(eq(pricingRules.scheduleId, schedule.id), eq(pricingRules.categoryId, category.id), eq(pricingRules.active, true), isNull(pricingRules.subcategory))).orderBy(asc(pricingRules.rulePriority)).limit(1);
      if (!rule || Number(rule.amountKes) <= 0) return fail(409, "No active category-level price rule exists. A manual assessment workflow is not enabled.");
      const amount = Number(rule.amountKes).toFixed(2);
      const [assessment] = await tx.insert(paymentAssessments).values({
        claimId: claim.id,
        scheduleId: schedule.id,
        amountKes: amount,
        lineItems: [{ label: `Recovery service — ${report.category}`, amountKes: amount }],
        status: "awaiting_claimant_confirmation",
        createdBy: req.auth!.id
      }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.assessment_created", resourceType: "payment_assessment", resourceId: assessment.id, outcome: "success", metadata: { claimId: claim.id, scheduleVersion: schedule.version, amountKes: amount, currency: "KES" } });
      return succeed({ assessment, reused: false });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    if (!result.value.reused) {
      const [claim] = await db.select().from(claims).where(eq(claims.id, result.value.assessment.claimId)).limit(1);
      if (claim) notifySafely({ userId: claim.claimantId, type: "payment_assessment", title: "A recovery-service assessment is ready", body: "Review the itemised KES assessment in your workspace. No payment has been requested or charged.", link: "/workspace" });
    }
    res.status(result.value.reused ? 200 : 201).json({ assessment: result.value.assessment, notice: "This is an itemised assessment only. It has not charged the claimant; payment collection is a separate explicit step and is available only when the sandbox controls are enabled." });
  } catch (error) { next(error); }
});

financeRouter.get("/assessments", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select().from(paymentAssessments).orderBy(desc(paymentAssessments.createdAt)).limit(200);
    res.json({ assessments: rows, notice: "Read-only assessment view. No payment is initiated from this endpoint." });
  } catch (error) { next(error); }
});

financeRouter.get("/claims/:claimId/assessment", async (req, res, next) => {
  try {
    const [claim] = await db.select().from(claims).where(eq(claims.id, req.params.claimId)).limit(1);
    if (!claim) return res.status(404).json({ error: "Claim not found" });
    const claimantAccess = claim.claimantId === req.auth!.id;
    const financeAccess = hasAdminAuthority(req.auth!.roles);
    if (!claimantAccess && !financeAccess) return res.status(403).json({ error: "You cannot view this assessment" });
    const [assessment] = await db.select().from(paymentAssessments).where(eq(paymentAssessments.claimId, claim.id)).orderBy(desc(paymentAssessments.createdAt)).limit(1);
    if (!assessment) return res.status(404).json({ error: "No price assessment is available yet" });
    res.json({ assessment, notice: "The assessment is not a payment receipt and no charge has been made." });
  } catch (error) { next(error); }
});

// Claimant confirmation records consent to the displayed amount only. Collection
// remains a separate, short-window action gated by sandbox provider and payment-safety controls.
financeRouter.post("/assessments/:assessmentId/confirm", async (req, res, next) => {
  try {
    const [assessment] = await db.select().from(paymentAssessments).where(eq(paymentAssessments.id, req.params.assessmentId)).limit(1);
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    const [claim] = await db.select().from(claims).where(eq(claims.id, assessment.claimId)).limit(1);
    if (!claim || claim.claimantId !== req.auth!.id) return res.status(403).json({ error: "Only the verified claimant may confirm this assessment" });
    if (assessment.status !== "awaiting_claimant_confirmation" || claim.status !== "approved") return res.status(409).json({ error: "This assessment is not available for confirmation" });
    const [inspection] = await db.select({ createdAt: custodyEvents.createdAt }).from(custodyEvents)
      .innerJoin(assignments, and(eq(assignments.reportId, custodyEvents.reportId), eq(assignments.agentId, custodyEvents.agentId), eq(assignments.status, "assigned")))
      .where(and(eq(custodyEvents.reportId, claim.reportId), eq(custodyEvents.eventType, "inspection_completed")))
      .orderBy(desc(custodyEvents.createdAt)).limit(1);
    const paymentWindowExpiresAt = inspection ? new Date(new Date(inspection.createdAt).getTime() + 24 * 60 * 60 * 1000) : null;
    const [updated] = await db.update(paymentAssessments).set({ status: "claimant_confirmed", confirmedBy: req.auth!.id, confirmedAt: new Date(), paymentWindowExpiresAt })
      .where(and(eq(paymentAssessments.id, assessment.id), eq(paymentAssessments.status, "awaiting_claimant_confirmation"))).returning();
    if (!updated) return res.status(409).json({ error: "Assessment has already changed; refresh and review the current status" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.assessment_confirmed_by_claimant", resourceType: "payment_assessment", resourceId: assessment.id, outcome: "success", metadata: { amountKes: assessment.amountKes, currency: "KES" } });
    res.json({ assessment: updated, notice: "Your confirmation was recorded. The 24-hour payment window opens after the assigned Agent records physical receipt and completes the item inspection. No charge has been made." });
  } catch (error) { next(error); }
});



financeRouter.get("/reconciliation/collections", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: reconciliationItems.id, externalReference: reconciliationItems.externalReference,
      internalReference: reconciliationItems.internalReference, amountKes: reconciliationItems.amountKes,
      expectedAmountKes: reconciliationItems.expectedAmountKes, providerAmountKes: reconciliationItems.providerAmountKes,
      varianceKes: reconciliationItems.varianceKes, currency: reconciliationItems.currency, reasonCode: reconciliationItems.reasonCode,
      status: reconciliationItems.status, reviewedBy: reconciliationItems.reviewedBy, reviewedAt: reconciliationItems.reviewedAt,
      resolutionNote: reconciliationItems.resolutionNote, evidenceRef: reconciliationItems.evidenceRef, createdAt: reconciliationItems.createdAt })
      .from(reconciliationItems).where(eq(reconciliationItems.source, "intasend_collection"))
      .orderBy(desc(reconciliationItems.createdAt)).limit(300);
    res.json({ items: rows, notice: "Reconciliation exceptions are evidence queues only; this view cannot confirm a payment or move funds." });
  } catch (error) { next(error); }
});

financeRouter.post("/reconciliation/collections/:id/review", requireRole("finance", "admin"), (req, res, next) => requireStepUp("admin.finance.collection.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["keep_open", "resolve"]), note: z.string().trim().min(10).max(1500), evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A review decision, explanatory note and evidence reference are required" });
    const [updated] = await db.update(reconciliationItems).set({ status: parsed.data.decision === "resolve" ? "resolved" : "unmatched",
      reviewedBy: req.auth!.id, reviewedAt: new Date(), resolutionNote: parsed.data.note, evidenceRef: parsed.data.evidenceRef })
      .where(and(eq(reconciliationItems.id, req.params.id), eq(reconciliationItems.source, "intasend_collection"), eq(reconciliationItems.status, "unmatched"))).returning();
    if (!updated) return res.status(404).json({ error: "An open collection reconciliation exception was not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.collection_reconciliation_reviewed", resourceType: "reconciliation_item", resourceId: updated.id,
      outcome: "success", metadata: { decision: parsed.data.decision, evidenceRecorded: true } });
    res.json({ item: updated, notice: "Review recorded. This action does not alter payment confirmation, the ledger or a claimant balance." });
  } catch (error) { next(error); }
});

financeRouter.post("/collection-intents", requireRole("finance", "admin"), (_req, res) => {
  res.status(423).json({ error: "Use the claimant-owned payment-session endpoint. Collection remains disabled unless the IntaSend environment gate is explicitly enabled." });
});

financeRouter.post("/payout-requests", requireRole("finance", "admin"), (_req, res) => {
  res.status(423).json({ error: "Payout initiation is disabled. No real-money movement is authorised by this build." });
});

financeRouter.get("/refund-requests", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: refundRequests.id, paymentTransactionId: refundRequests.paymentTransactionId, amountKes: refundRequests.amountKes,
      reason: refundRequests.reason, destinationType: refundRequests.destinationType, destinationFingerprint: refundRequests.destinationFingerprint,
      status: refundRequests.status, requestedBy: refundRequests.requestedBy, reviewedBy: refundRequests.reviewedBy, approvedAt: refundRequests.approvedAt,
      executedBy: refundRequests.executedBy, providerBatchId: refundRequests.providerBatchId, providerTransactionId: refundRequests.providerTransactionId,
      providerOutcome: refundRequests.providerOutcome, submittedAt: refundRequests.submittedAt, reconciledAt: refundRequests.reconciledAt,
      reconciliationNote: refundRequests.reconciliationNote, reconciliationEvidenceRef: refundRequests.reconciliationEvidenceRef, createdAt: refundRequests.createdAt })
      .from(refundRequests).orderBy(desc(refundRequests.createdAt)).limit(200);
    res.json({ refunds: rows, notice: "Refund decisions and provider outcomes are separate. An accepted initiation is not a completed refund." });
  } catch (error) { next(error); }
});

// A refund is an explicit administrator decision, never an automatic consequence of rejection.
// The destination is fixed to the encrypted original M-Pesa payer; alternate destinations are not offered.
financeRouter.post("/refund-requests", requireRole("finance", "admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ paymentTransactionId: z.string().uuid(), reason: z.string().trim().min(10).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A confirmed payment transaction and refund reason are required" });
    const [payment] = await db.select({ id: paymentTransactions.id, claimId: paymentTransactions.claimId, amountKes: paymentTransactions.amountKes,
      status: paymentTransactions.status, payerPhoneFingerprint: paymentTransactions.payerPhoneFingerprint, payerPhoneCiphertext: paymentTransactions.payerPhoneCiphertext,
      claimStatus: claims.status, assessmentStatus: paymentAssessments.status })
      .from(paymentTransactions).innerJoin(claims, eq(claims.id, paymentTransactions.claimId))
      .innerJoin(paymentAssessments, eq(paymentAssessments.id, paymentTransactions.assessmentId))
      .where(eq(paymentTransactions.id, parsed.data.paymentTransactionId)).limit(1);
    if (!payment) return res.status(404).json({ error: "Payment transaction not found" });
    const active = await db.select({ id: refundRequests.id }).from(refundRequests)
      .where(and(eq(refundRequests.paymentTransactionId, payment.id), inArray(refundRequests.status, ["requested", "approved", "submitting", "unknown"]))).limit(1);
    if (!canRequestOriginalPayerRefund({ paymentConfirmed: payment.status === "confirmed" && payment.assessmentStatus === "paid",
      claimCompleted: payment.claimStatus === "completed", originalPayerFingerprintAvailable: !!payment.payerPhoneFingerprint, activeRefundExists: active.length > 0 })) {
      return res.status(409).json({ error: "A full refund request requires a confirmed payment, retained original-payer evidence, a pre-handover claim and no active refund request" });
    }
    const [refund] = await db.insert(refundRequests).values({ paymentTransactionId: payment.id, requestedBy: req.auth!.id,
      amountKes: payment.amountKes, reason: parsed.data.reason, destinationType: "original_payer",
      destinationFingerprint: payment.payerPhoneFingerprint, originalPayerFingerprint: payment.payerPhoneFingerprint, status: "requested" }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_requested", resourceType: "refund_request", resourceId: refund.id,
      outcome: "success", metadata: { paymentTransactionId: payment.id, amountKes: payment.amountKes, destinationType: "original_payer" } });
    const [refundClaim] = await db.select({ claimantId: claims.claimantId }).from(claims).innerJoin(paymentTransactions, eq(paymentTransactions.claimId, claims.id)).where(eq(paymentTransactions.id, payment.id)).limit(1);
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", title: "A refund request is under review", body: "An administrator has recorded a refund request for your payment. This is not confirmation that a refund has been sent.", link: "/workspace" });
    res.status(201).json({ refund, notice: "Refund requested for the original M-Pesa payer only. No provider request has been sent." });
  } catch (error) { next(error); }
});

financeRouter.post("/refund-requests/:id/approve", requireRole("admin"), (req, res, next) => requireStepUp("admin.finance.refund.approve")(req, res, next), async (req, res, next) => {
  try {
    const [refund] = await db.select().from(refundRequests).where(eq(refundRequests.id, req.params.id)).limit(1);
    if (!refund) return res.status(404).json({ error: "Refund request not found" });
    if (!canApproveRefund(refund.requestedBy, req.auth!.id, refund.status, req.auth!.roles.includes("owner"))) return res.status(409).json({ error: "Approval requires a different administrator and a pending refund request" });
    const [updated] = await db.update(refundRequests).set({ status: "approved", reviewedBy: req.auth!.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(refundRequests.id, refund.id), eq(refundRequests.status, "requested"))).returning();
    if (!updated) return res.status(409).json({ error: "Refund request changed; refresh before approving" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_approved", resourceType: "refund_request", resourceId: refund.id,
      outcome: "success", metadata: { requesterIndependent: refund.requestedBy !== req.auth!.id, ownerFinalOverride: req.auth!.roles.includes("owner") && refund.requestedBy === req.auth!.id, destinationType: "original_payer" } });
    const [refundClaim] = await db.select({ claimantId: claims.claimantId }).from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId))
      .innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).where(eq(refundRequests.id, refund.id)).limit(1);
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", title: "Your refund request was approved", body: "The refund request was approved for a separate provider submission. Approval is not confirmation that funds have been returned.", link: "/workspace" });
    res.json({ refund: updated, notice: "Refund approval recorded. Submission is a separate controlled action." });
  } catch (error) { next(error); }
});

financeRouter.post("/refund-requests/:id/execute", requireRole("finance", "admin"), (req, res, next) => requireStepUp("admin.finance.refund.execute")(req, res, next), async (req, res, next) => {
  if (!intasendRefundEnabled()) return res.status(423).json({ error: "IntaSend refund submission is disabled. No provider request was sent." });
  try {
    const [refund] = await db.select({ id: refundRequests.id, paymentTransactionId: refundRequests.paymentTransactionId, amountKes: refundRequests.amountKes,
      requestedBy: refundRequests.requestedBy, approvedBy: refundRequests.reviewedBy, status: refundRequests.status,
      payerPhoneCiphertext: paymentTransactions.payerPhoneCiphertext, payerPhoneFingerprint: paymentTransactions.payerPhoneFingerprint,
      originalPayerFingerprint: refundRequests.originalPayerFingerprint, destinationFingerprint: refundRequests.destinationFingerprint,
      assessmentId: paymentTransactions.assessmentId, claimStatus: claims.status, claimReference: reports.reference })
      .from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId))
      .innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).innerJoin(reports, eq(reports.id, claims.reportId))
      .where(eq(refundRequests.id, req.params.id)).limit(1);
    if (!refund) return res.status(404).json({ error: "Refund request not found" });
    if (!canExecuteRefund({ status: refund.status, requestedBy: refund.requestedBy, approvedBy: refund.approvedBy, executorId: req.auth!.id }) ||
      refund.claimStatus === "completed" || !refund.payerPhoneCiphertext || !refund.payerPhoneFingerprint ||
      refund.payerPhoneFingerprint !== refund.originalPayerFingerprint || refund.destinationFingerprint !== refund.originalPayerFingerprint) return res.status(409).json({ error: "Refund execution requires independent approval, the original payer destination and a pre-handover claim" });
    const reserved = await db.transaction(async tx => {
      const [row] = await tx.update(refundRequests).set({ status: "submitting", executedBy: req.auth!.id, submittedAt: new Date(), providerOutcome: "submitting", updatedAt: new Date() })
        .where(and(eq(refundRequests.id, refund.id), eq(refundRequests.status, "approved"))).returning();
      if (row && refund.assessmentId) await tx.update(paymentAssessments).set({ status: "refunding" }).where(eq(paymentAssessments.id, refund.assessmentId));
      return row;
    });
    if (!reserved) return res.status(409).json({ error: "Refund submission was already reserved or the request changed" });
    const provider = await initiateIntaSendRefund({ payerPhoneCiphertext: refund.payerPhoneCiphertext, amountKes: String(refund.amountKes), claimReference: refund.claimReference });
    const [updated] = await db.update(refundRequests).set({ status: provider.outcome, providerOutcome: provider.outcome,
      providerBatchId: provider.providerBatchId, providerTransactionId: provider.providerTransactionId,
      providerReference: provider.providerBatchId ?? provider.providerTransactionId, updatedAt: new Date() })
      .where(and(eq(refundRequests.id, refund.id), eq(refundRequests.status, "submitting"))).returning();
    if (provider.outcome === "rejected" && refund.assessmentId) await db.update(paymentAssessments).set({ status: "paid" }).where(eq(paymentAssessments.id, refund.assessmentId));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_provider_submission", resourceType: "refund_request", resourceId: refund.id,
      outcome: provider.outcome, metadata: { httpStatus: provider.httpStatus, providerReferenceRecorded: !!provider.providerBatchId || !!provider.providerTransactionId } });
    const [refundClaim] = await db.select({ claimantId: claims.claimantId }).from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId))
      .innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).where(eq(refundRequests.id, refund.id)).limit(1);
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", title: "Your refund submission status changed",
      body: provider.outcome === "unknown" ? "The provider may have accepted the refund request, but completion is not confirmed. Do not make another payment or refund request; reconciliation is required." : "The provider refused the refund initiation. No refund completion is recorded.", link: "/workspace" });
    res.status(provider.outcome === "unknown" ? 202 : 200).json({ refund: updated, notice: provider.outcome === "unknown"
      ? "The provider may have accepted the refund. It remains unresolved; do not submit it again. Independent reconciliation is required."
      : "The provider refused the initiation request. No refund completion is recorded." });
  } catch (error) { next(error); }
});

financeRouter.post("/refund-requests/:id/reconcile", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.refund.reconcile")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ outcome: z.enum(["confirmed_refunded", "confirmed_not_executed", "unknown"]), note: z.string().trim().min(10).max(1500), evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A reconciliation outcome, note and evidence reference are required" });
    const result = await db.transaction(async tx => {
      const [refund] = await tx.select().from(refundRequests).where(eq(refundRequests.id, req.params.id)).limit(1).for("update");
      if (!refund || !["unknown", "submitting"].includes(refund.status)) return null;
      if (refund.requestedBy === req.auth!.id || refund.executedBy === req.auth!.id) return null;
      const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, refund.paymentTransactionId)).limit(1).for("update");
      if (!payment || payment.status !== "confirmed") return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.refund.reconcile");
      if (parsed.data.outcome === "confirmed_refunded") {
        await tx.update(paymentTransactions).set({ status: "refunded", updatedAt: new Date() }).where(and(eq(paymentTransactions.id, payment.id), eq(paymentTransactions.status, "confirmed")));
        if (payment.assessmentId) await tx.update(paymentAssessments).set({ status: "refunded" }).where(eq(paymentAssessments.id, payment.assessmentId));
        const [journal] = await tx.insert(financialJournals).values({ sourceType: "refund", sourceId: refund.id, idempotencyKey: `refund:${refund.id}`,
          currency: "KES", memo: "Provider-evidenced full refund of claimant recovery-service collection" }).onConflictDoNothing().returning();
        if (journal) await tx.insert(financialPostings).values([
          { journalId: journal.id, accountCode: "UNCLASSIFIED_COLLECTIONS_LIABILITY", debitKes: refund.amountKes, creditKes: "0.00", memo: "Reverse claimant collection liability after evidenced refund" },
          { journalId: journal.id, accountCode: "PROVIDER_COLLECTION_CLEARING", debitKes: "0.00", creditKes: refund.amountKes, memo: "Refund paid to original M-Pesa payer" }
        ]);
      }
      if (parsed.data.outcome === "confirmed_not_executed" && payment.assessmentId) await tx.update(paymentAssessments).set({ status: "paid" }).where(eq(paymentAssessments.id, payment.assessmentId));
      const nextStatus = parsed.data.outcome === "confirmed_refunded" ? "refunded" : parsed.data.outcome === "confirmed_not_executed" ? "rejected" : "unknown";
      const [updated] = await tx.update(refundRequests).set({ status: nextStatus, providerOutcome: parsed.data.outcome,
        reconciledAt: new Date(), reconciliationNote: parsed.data.note, reconciliationEvidenceRef: parsed.data.evidenceRef, updatedAt: new Date() })
        .where(eq(refundRequests.id, refund.id)).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_reconciled", resourceType: "refund_request", resourceId: refund.id,
        outcome: "success", metadata: { outcome: parsed.data.outcome, evidenceRecorded: true, transactionUpdated: parsed.data.outcome === "confirmed_refunded" } });
      return updated;
    });
    if (!result) return res.status(409).json({ error: "Refund cannot be reconciled by this administrator in its current state" });
    const [refundClaim] = await db.select({ claimantId: claims.claimantId }).from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId))
      .innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).where(eq(refundRequests.id, result.id)).limit(1);
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", title: result.status === "refunded" ? "Your refund was confirmed" : "Your refund status was updated",
      body: result.status === "refunded" ? "Independent reconciliation confirmed the refund. Your original item handover record remains unchanged." : "An administrator updated the refund review. Check your workspace for the current status.", link: "/workspace" });
    res.json({ refund: result, notice: "Reconciliation evidence recorded. A confirmed refund is posted as a correcting journal; no automatic retry is available." });
  } catch (error) { next(error); }
});

// Beneficiary-owned M-Pesa destination: encrypted at rest, masked in every projection.
financeRouter.get("/payout-destinations/mine", requireRole("finder", "agent"), async (req, res, next) => {
  try {
    const rows = await db.select({ id: payoutDestinations.id, phoneMasked: payoutDestinations.phoneMasked, status: payoutDestinations.status,
      verifiedAt: payoutDestinations.verifiedAt, createdAt: payoutDestinations.createdAt })
      .from(payoutDestinations).where(eq(payoutDestinations.userId, req.auth!.id)).orderBy(desc(payoutDestinations.createdAt)).limit(10);
    res.json({ destinations: rows });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-destinations/mine", requireRole("finder", "agent"), async (req, res, next) => {
  try {
    const parsed = z.object({ phone: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A valid Kenyan M-Pesa number is required" });
    const phone = normalizeKenyanMpesaPhone(parsed.data.phone);
    if (!phone) return res.status(400).json({ error: "Enter a valid Kenyan M-Pesa number" });
    if (!paymentPiiConfigured()) return res.status(423).json({ error: "Secure payout-destination storage is not configured" });
    const result = await db.transaction(async tx => {
      await tx.update(payoutDestinations).set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(payoutDestinations.userId, req.auth!.id), inArray(payoutDestinations.status, ["pending", "verified"])));
      const [destination] = await tx.insert(payoutDestinations).values({ userId: req.auth!.id, method: "mpesa_b2c",
        phoneMasked: `${phone.slice(0,4)}******${phone.slice(-3)}`, phoneCiphertext: encryptPaymentPhone(phone), fingerprint: fingerprintPaymentPhone(phone), status: "pending" }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_destination_submitted", resourceType: "payout_destination", resourceId: destination.id,
        outcome: "success", metadata: { method: "mpesa_b2c", masked: true, requiresManualVerification: true } });
      return destination;
    });
    res.status(201).json({ destination: { id: result.id, phoneMasked: result.phoneMasked, status: result.status, createdAt: result.createdAt }, notice: "Destination submitted for manual verification. A 48-hour cooling period applies after verification." });
  } catch (error) { next(error); }
});

financeRouter.get("/payout-destinations/pending", requireRole("admin", "finance", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: payoutDestinations.id, userId: payoutDestinations.userId, phoneMasked: payoutDestinations.phoneMasked,
      status: payoutDestinations.status, createdAt: payoutDestinations.createdAt }).from(payoutDestinations)
      .where(eq(payoutDestinations.status, "pending")).orderBy(asc(payoutDestinations.createdAt)).limit(200);
    res.json({ destinations: rows });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-destinations/:id/verify", requireRole("admin"), (req, res, next) => requireStepUp("admin.finance.payout_destination.verify")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Verification evidence reference is required" });
    const [destination] = await db.update(payoutDestinations).set({ status: "verified", verifiedBy: req.auth!.id, verifiedAt: new Date(), evidenceRef: parsed.data.evidenceRef, updatedAt: new Date() })
      .where(and(eq(payoutDestinations.id, req.params.id), eq(payoutDestinations.status, "pending"))).returning();
    if (!destination) return res.status(404).json({ error: "Pending payout destination not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_destination_verified", resourceType: "payout_destination", resourceId: destination.id,
      outcome: "success", metadata: { evidenceRecorded: true, phoneMasked: true } });
    notifySafely({ userId: destination.userId, type: "payout_destination", title: "Your payout destination was verified", body: "Your M-Pesa payout destination was verified. A 48-hour cooling period applies before it can be used for a payout.", link: "/workspace" });
    res.json({ destination: { id: destination.id, userId: destination.userId, phoneMasked: destination.phoneMasked, status: destination.status, verifiedAt: destination.verifiedAt }, notice: "Destination verified. Payout eligibility begins after the 48-hour cooling period." });
  } catch (error) { next(error); }
});

financeRouter.post("/reward-authorizations", requireRole("finance", "admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ claimId: z.string().uuid(), grossKes: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
      fundingSource: z.enum(["sponsor", "organisation", "platform_budget", "other"]), sourceReference: z.string().trim().min(4).max(180), evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success || Number(parsed.data?.grossKes ?? 0) <= 0) return res.status(400).json({ error: "A positive KES reward amount, funding source and evidence reference are required" });
    const claim = await pool.query(`SELECT c.id,c.status FROM claims c WHERE c.id=$1`, [parsed.data.claimId]);
    if (!claim.rowCount || claim.rows[0].status !== "completed") return res.status(409).json({ error: "Reward funding can be authorised only for a completed handover" });
    const [authorization] = await db.insert(rewardAuthorizations).values({ claimId: parsed.data.claimId, grossKes: parsed.data.grossKes,
      fundingSource: parsed.data.fundingSource, sourceReference: parsed.data.sourceReference, evidenceRef: parsed.data.evidenceRef, createdBy: req.auth!.id }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.reward_funding_submitted", resourceType: "reward_authorization", resourceId: authorization.id,
      outcome: "success", metadata: { claimId: authorization.claimId, grossKes: authorization.grossKes, fundingSource: authorization.fundingSource } });
    res.status(201).json({ authorization, notice: "Reward funding evidence submitted for independent verification. It is not derived from the claimant recovery-service charge." });
  } catch (error) { next(error); }
});

financeRouter.get("/reward-authorizations", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select().from(rewardAuthorizations).orderBy(desc(rewardAuthorizations.createdAt)).limit(200);
    res.json({ authorizations: rows });
  } catch (error) { next(error); }
});

financeRouter.post("/reward-authorizations/:id/verify", requireRole("admin"), (req, res, next) => requireStepUp("admin.finance.reward.verify")(req, res, next), async (req, res, next) => {
  try {
    const settlement = await verifyRewardAuthorizationAndCreateSettlement(req.params.id, req.auth!.id);
    res.json({ settlement, notice: "Reward funding verified and allocation snapshot booked. Settlement approval will occur only after the 48-hour eligibility time; payout remains manual." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "verification_failed";
    if (["reward_authorization_not_pending", "reward_authorization_requires_independent_verifier", "claim_not_settlement_eligible_or_beneficiaries_unverified"].includes(code)) return res.status(409).json({ error: code });
    next(error);
  }
});

financeRouter.post("/settlements/:id/payout-requests", requireRole("finance", "admin"), async (req, res, next) => {
  try {
    const gate = await pool.query(`SELECT s.id,s.claim_id,s.finder_user_id,s.agent_user_id,s.finder_kes,s.agent_kes,s.status settlement_status,
        c.status claim_status, r.reporter_id, a.user_id current_agent_user_id,
        EXISTS(SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id WHERE pt.claim_id=c.id AND pt.status='confirmed' AND pa.status='paid') payment_confirmed,
        EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=c.id AND d.settlement_hold=true AND d.status NOT IN ('resolved','closed','dismissed')) dispute_hold
      FROM settlements s JOIN claims c ON c.id=s.claim_id JOIN reports r ON r.id=c.report_id
      JOIN assignments x ON x.report_id=c.report_id AND x.status='assigned' JOIN agents a ON a.id=x.agent_id AND a.status='active' AND a.verified_at IS NOT NULL
      WHERE s.id=$1`, [req.params.id]);
    if (!gate.rowCount) return res.status(404).json({ error: "Settlement not found" });
    const s = gate.rows[0];
    if (s.settlement_status !== "approved" || s.claim_status !== "completed" || !s.payment_confirmed || s.dispute_hold ||
      s.reporter_id !== s.finder_user_id || s.current_agent_user_id !== s.agent_user_id) return res.status(423).json({ error: "Settlement, handover, payment or dispute gates are not satisfied" });
    const destinations = await db.select().from(payoutDestinations).where(and(inArray(payoutDestinations.userId, [s.finder_user_id, s.agent_user_id]),
      eq(payoutDestinations.status, "verified"), lte(payoutDestinations.verifiedAt, new Date(Date.now() - 48 * 60 * 60 * 1000))));
    const finderDestination = destinations.find(d => d.userId === s.finder_user_id);
    const agentDestination = destinations.find(d => d.userId === s.agent_user_id);
    const requests = [];
    if (Number(s.finder_kes) > 0) {
      if (!finderDestination) return res.status(423).json({ error: "Finder payout destination must be manually verified and pass the 48-hour cooling period" });
      requests.push({ settlementId: s.id, beneficiaryUserId: s.finder_user_id, amountKes: s.finder_kes, destinationFingerprint: finderDestination.fingerprint,
        destinationCiphertext: finderDestination.phoneCiphertext, status: "draft", createdBy: req.auth!.id });
    }
    if (Number(s.agent_kes) > 0) {
      if (!agentDestination) return res.status(423).json({ error: "Agent payout destination must be manually verified and pass the 48-hour cooling period" });
      requests.push({ settlementId: s.id, beneficiaryUserId: s.agent_user_id, amountKes: s.agent_kes, destinationFingerprint: agentDestination.fingerprint,
        destinationCiphertext: agentDestination.phoneCiphertext, status: "draft", createdBy: req.auth!.id });
    }
    if (!requests.length) return res.status(409).json({ error: "No positive Finder or Agent payout legs exist for this allocation" });
    const existing = await db.select({ id: payoutRequests.id }).from(payoutRequests).where(eq(payoutRequests.settlementId, s.id)).limit(1);
    if (existing.length) return res.status(409).json({ error: "Payout legs already exist for this settlement; do not duplicate them" });
    const created = await db.insert(payoutRequests).values(requests).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_requests_created", resourceType: "settlement", resourceId: s.id,
      outcome: "success", metadata: { payoutLegCount: created.length, amounts: created.map(p => p.amountKes) } });
    res.status(201).json({ payoutRequests: created.map(({ destinationCiphertext, ...p }) => p), notice: "Draft payout legs created. Each requires independent approval and a separate manual submission." });
  } catch (error) { next(error); }
});

financeRouter.get("/payout-requests", requireRole("finance", "admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: payoutRequests.id, settlementId: payoutRequests.settlementId, beneficiaryUserId: payoutRequests.beneficiaryUserId,
      amountKes: payoutRequests.amountKes, destinationFingerprint: payoutRequests.destinationFingerprint, status: payoutRequests.status,
      createdBy: payoutRequests.createdBy, approvedBy: payoutRequests.approvedBy, executedBy: payoutRequests.executedBy,
      providerBatchId: payoutRequests.providerBatchId, providerTransactionId: payoutRequests.providerTransactionId,
      providerOutcome: payoutRequests.providerOutcome, providerConfirmedAt: payoutRequests.providerConfirmedAt, createdAt: payoutRequests.createdAt })
      .from(payoutRequests).orderBy(desc(payoutRequests.createdAt)).limit(300);
    res.json({ payoutRequests: rows, notice: "Payout acceptance is not completion. Only authoritative TS100 status confirms a payout." });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-requests/:id/refresh-destination", requireRole("finance", "admin"), async (req, res, next) => {
  try {
    const [request] = await db.select().from(payoutRequests).where(eq(payoutRequests.id, req.params.id)).limit(1);
    if (!request || !["draft", "approved"].includes(request.status) || request.submittedAt) return res.status(409).json({ error: "Only an unsubmitted draft/approved payout request can refresh its destination" });
    const [destination] = await db.select().from(payoutDestinations).where(and(eq(payoutDestinations.userId, request.beneficiaryUserId), eq(payoutDestinations.status, "verified"))).limit(1);
    if (!destination || !destination.verifiedAt || destination.verifiedAt.getTime() > Date.now() - 48 * 60 * 60 * 1000) return res.status(423).json({ error: "A verified destination with an elapsed 48-hour cooling period is required" });
    const [updated] = await db.update(payoutRequests).set({ destinationFingerprint: destination.fingerprint, destinationCiphertext: destination.phoneCiphertext,
      status: "draft", createdBy: req.auth!.id, approvedBy: null, updatedAt: new Date() }).where(eq(payoutRequests.id, request.id)).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_destination_snapshot_refreshed", resourceType: "payout_request", resourceId: request.id,
      outcome: "success", metadata: { approvalReset: true, destinationMasked: true } });
    res.json({ payoutRequest: { id: updated.id, status: updated.status, destinationFingerprint: updated.destinationFingerprint }, notice: "Destination snapshot refreshed. Independent approval is required again." });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-requests/:id/approve", requireRole("admin"), (req, res, next) => requireStepUp("admin.finance.payout.approve")(req, res, next), async (req, res, next) => {
  try {
    const [request] = await db.select().from(payoutRequests).where(eq(payoutRequests.id, req.params.id)).limit(1);
    if (!request || request.status !== "draft" || (request.createdBy === req.auth!.id && !req.auth!.roles.includes("owner"))) return res.status(409).json({ error: "A different administrator or the Super Admin (Owner) must approve a draft payout request" });
    const [updated] = await db.update(payoutRequests).set({ status: "approved", approvedBy: req.auth!.id, updatedAt: new Date() })
      .where(and(eq(payoutRequests.id, request.id), eq(payoutRequests.status, "draft"))).returning();
    if (!updated) return res.status(409).json({ error: "Payout request changed; refresh before approving" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_request_approved", resourceType: "payout_request", resourceId: request.id,
      outcome: "success", metadata: { makerChecker: request.createdBy !== req.auth!.id, ownerFinalOverride: req.auth!.roles.includes("owner") && request.createdBy === req.auth!.id } });
    res.json({ payoutRequest: { id: updated.id, status: updated.status, approvedBy: updated.approvedBy }, notice: "Payout request approved. Execution remains a separate manually authorised action." });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-requests/:id/execute", requireRole("finance", "admin"), (req, res, next) => requireStepUp("admin.finance.payout.execute")(req, res, next), async (req, res, next) => {
  if (!intasendPayoutEnabled()) return res.status(423).json({ error: "IntaSend payout submission is disabled or the verified KES disbursement wallet is not configured" });
  try {
    const gate = await pool.query(`SELECT p.id,p.settlement_id,p.beneficiary_user_id,p.amount_kes,p.destination_fingerprint,p.destination_ciphertext,
        p.status,p.created_by,p.approved_by,p.idempotency_key,s.status settlement_status,s.finder_user_id,s.agent_user_id,c.id claim_id,c.status claim_status,
        r.reference claim_reference,pt.status payment_status,
        d.fingerprint current_destination_fingerprint,d.status destination_status,d.verified_at,
        EXISTS(SELECT 1 FROM case_disputes cd WHERE cd.claim_id=c.id AND cd.settlement_hold=true AND cd.status NOT IN ('resolved','closed','dismissed')) dispute_hold
      FROM payout_requests p JOIN settlements s ON s.id=p.settlement_id JOIN claims c ON c.id=s.claim_id JOIN reports r ON r.id=c.report_id
      JOIN payment_transactions pt ON pt.claim_id=c.id AND pt.status='confirmed'
      JOIN payment_assessments pa ON pa.id=pt.assessment_id AND pa.status='paid'
      JOIN payout_destinations d ON d.user_id=p.beneficiary_user_id AND d.status='verified'
      WHERE p.id=$1 AND p.status='approved' ORDER BY pt.created_at DESC LIMIT 1`, [req.params.id]);
    if (!gate.rowCount) return res.status(409).json({ error: "Approved payout request, confirmed payment or current verified destination not found" });
    const p = gate.rows[0];
    const destinationVerified = p.destination_status === "verified" && p.current_destination_fingerprint === p.destination_fingerprint && p.destination_ciphertext && p.verified_at && new Date(p.verified_at).getTime() <= Date.now() - 48 * 60 * 60 * 1000;
    const walletVerified = !!process.env.INTASEND_DISBURSEMENT_WALLET_ID?.trim() && process.env.INTASEND_DISBURSEMENT_WALLET_VERIFIED === "true" &&
      process.env.INTASEND_DISBURSEMENT_WALLET_CURRENCY === "KES" && process.env.INTASEND_DISBURSEMENT_WALLET_CAN_DISBURSE === "true";
    const preflight = evaluatePayoutPreflight({ settlementApproved: ["approved", "payout_pending"].includes(p.settlement_status), paymentProviderConfirmed: p.payment_status === "confirmed",
      recoveryHandoverConfirmed: p.claim_status === "completed", disputeHold: !!p.dispute_hold, legalHold: !!p.dispute_hold,
      beneficiaryVerified: !!destinationVerified, destinationRecentlyChanged: !destinationVerified,
      sufficientWorkingWalletFunds: process.env.INTASEND_DISBURSEMENT_WALLET_FUNDS_VERIFIED === "true", workingWalletVerifiedForDisbursement: walletVerified,
      payoutAlreadyExists: false, initiatorId: p.created_by, approverId: p.approved_by });
    if (!preflight.allowed || req.auth!.id === p.created_by || req.auth!.id === p.approved_by) return res.status(423).json({ error: "Payout preflight failed", blockers: [...preflight.blockers, ...(req.auth!.id === p.created_by || req.auth!.id === p.approved_by ? ["Executor must be independent of creator and approver"] : [])] });
    const reservationClient = await pool.connect();
    let reserved = false;
    try {
      await reservationClient.query("BEGIN");
      const reservation = await reservationClient.query(`WITH locked_claim AS (
          SELECT c.id claim_id,s.id settlement_id FROM claims c JOIN settlements s ON s.claim_id=c.id
          WHERE s.id=(SELECT settlement_id FROM payout_requests WHERE id=$1) AND s.status IN ('approved','payout_pending') AND c.status='completed'
          FOR UPDATE OF c,s
        )
        UPDATE payout_requests p SET status='submitting',initiated_by=$2,executed_by=$2,submitted_at=now(),provider_outcome='submitting',updated_at=now()
        WHERE p.id=$1 AND p.status='approved' AND p.destination_ciphertext IS NOT NULL
          AND EXISTS(SELECT 1 FROM locked_claim lc WHERE lc.settlement_id=p.settlement_id)
          AND EXISTS(SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id
            WHERE pt.claim_id=(SELECT claim_id FROM settlements WHERE id=p.settlement_id) AND pt.status='confirmed' AND pa.status='paid')
          AND EXISTS(SELECT 1 FROM payout_destinations d WHERE d.user_id=p.beneficiary_user_id AND d.status='verified'
            AND d.fingerprint=p.destination_fingerprint AND d.verified_at<=now()-interval '48 hours')
          AND NOT EXISTS(SELECT 1 FROM case_disputes cd WHERE cd.claim_id=(SELECT claim_id FROM settlements WHERE id=p.settlement_id)
            AND cd.settlement_hold=true AND cd.status NOT IN ('resolved','closed','dismissed')) RETURNING p.id`, [p.id, req.auth!.id]);
      if (!reservation.rowCount) { await reservationClient.query("ROLLBACK"); return res.status(409).json({ error: "Payout preflight changed or a dispute hold was raised; no provider request was sent" }); }
      await reservationClient.query("UPDATE settlements SET status='payout_pending',payout_initiated_at=COALESCE(payout_initiated_at,now()) WHERE id=$1", [p.settlement_id]);
      await reservationClient.query("COMMIT");
      reserved = true;
    } catch (error) { await reservationClient.query("ROLLBACK"); throw error; }
    finally { reservationClient.release(); }
    if (!reserved) return res.status(409).json({ error: "Payout request already reserved or changed; do not retry" });
    const provider = await initiateIntaSendPayout({ destinationCiphertext: p.destination_ciphertext, amountKes: String(p.amount_kes), claimReference: p.claim_reference, payoutRequestId: p.idempotency_key });
    const nextStatus = provider.outcome === "accepted" ? "accepted" : provider.outcome;
    const [updated] = await db.update(payoutRequests).set({ status: nextStatus, providerOutcome: provider.outcome,
      providerBatchId: provider.trackingId, providerTransactionId: provider.transactionId, providerReference: provider.trackingId ?? provider.transactionId,
      updatedAt: new Date() }).where(and(eq(payoutRequests.id, p.id), eq(payoutRequests.status, "submitting"))).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_provider_submission", resourceType: "payout_request", resourceId: p.id,
      outcome: provider.outcome, metadata: { httpStatus: provider.httpStatus, trackingReferenceRecorded: !!provider.trackingId, transactionBound: !!provider.transactionId } });
    notifySafely({ userId: p.beneficiary_user_id, type: "payout_update", title: "Your reward payout was submitted", body: provider.outcome === "accepted" ? "The provider accepted the payout request. The transfer is not yet confirmed." : provider.outcome === "unknown" ? "The payout outcome is unresolved. Do not request another payout; reconciliation is required." : "The provider refused the payout initiation. No payout completion is recorded.", link: "/workspace" });
    res.status(provider.outcome === "unknown" ? 202 : 200).json({ payoutRequest: { id: updated.id, status: updated.status, providerBatchId: updated.providerBatchId, providerTransactionId: updated.providerTransactionId },
      notice: provider.outcome === "accepted" ? "Provider accepted the payout batch. The individual transfer is not yet confirmed." : provider.outcome === "unknown" ? "Payout outcome is unresolved. Do not resubmit; reconcile the provider record." : "Provider refused the payout initiation. No payout completion is recorded." });
  } catch (error) { next(error); }
});

financeRouter.get("/payout-requests/:id/status", requireRole("finance", "admin", "owner"), async (req, res, next) => {
  try {
    const [request] = await db.select().from(payoutRequests).where(eq(payoutRequests.id, req.params.id)).limit(1);
    if (!request) return res.status(404).json({ error: "Payout request not found" });
    if (!["accepted", "unknown"].includes(request.status) || !request.providerBatchId || !request.providerTransactionId) return res.json({ payoutRequest: { id: request.id, status: request.status }, notice: "No exact provider transaction binding is available; no status is inferred." });
    const provider = await fetchIntaSendPayoutStatus(request.providerBatchId, request.providerTransactionId);
    if (!provider.verified) return res.status(202).json({ payoutRequest: { id: request.id, status: request.status }, reconciliation: provider.reason });
    if (provider.verdict === "completed") {
      await db.transaction(async tx => {
        const [locked] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, request.id)).limit(1).for("update");
        if (!locked || !["accepted", "unknown"].includes(locked.status)) return;
        const [settlement] = await tx.select().from(settlements).where(eq(settlements.id, locked.settlementId)).limit(1).for("update");
        if (!settlement) return;
        const payableAccount = locked.beneficiaryUserId === settlement.finderUserId ? "FINDER_REWARD_PAYABLE" : "AGENT_REWARD_PAYABLE";
        const [journal] = await tx.insert(financialJournals).values({ sourceType: "payout", sourceId: locked.id, idempotencyKey: `payout:${locked.id}`,
          currency: "KES", memo: "Provider-confirmed Finder/Agent reward payout" }).onConflictDoNothing().returning();
        if (journal) await tx.insert(financialPostings).values([
          { journalId: journal.id, accountCode: payableAccount, debitKes: locked.amountKes, creditKes: "0.00", memo: "Settle beneficiary reward payable" },
          { journalId: journal.id, accountCode: "PROVIDER_PAYOUT_CLEARING", debitKes: "0.00", creditKes: locked.amountKes, memo: "Provider-confirmed M-Pesa disbursement" }
        ]);
        if (provider.providerFeeKes && Number(provider.providerFeeKes) > 0) {
          await tx.update(payoutRequests).set({ providerFeeKes: provider.providerFeeKes, providerFeeVerifiedAt: new Date() }).where(eq(payoutRequests.id, locked.id));
          const [feeJournal] = await tx.insert(financialJournals).values({ sourceType: "provider_fee", sourceId: `${locked.id}:fee`, idempotencyKey: `payout-fee:${locked.id}`,
            currency: "KES", memo: "Verified IntaSend disbursement fee borne by platform" }).onConflictDoNothing().returning();
          if (feeJournal) await tx.insert(financialPostings).values([
            { journalId: feeJournal.id, accountCode: "PLATFORM_PROVIDER_FEES_EXPENSE", debitKes: provider.providerFeeKes, creditKes: "0.00", memo: "IntaSend disbursement fee; platform expense" },
            { journalId: feeJournal.id, accountCode: "PROVIDER_PAYOUT_CLEARING", debitKes: "0.00", creditKes: provider.providerFeeKes, memo: "Provider fee deducted from disbursement wallet" }
          ]);
        }
        await tx.update(payoutRequests).set({ status: "completed", providerOutcome: "completed", providerConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(payoutRequests.id, locked.id));
        const remaining = await tx.select({ id: payoutRequests.id }).from(payoutRequests).where(and(eq(payoutRequests.settlementId, settlement.id), sql`${payoutRequests.status}<>'completed'`));
        if (!remaining.length) await tx.update(settlements).set({ status: "paid" }).where(eq(settlements.id, settlement.id));
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_provider_confirmed", resourceType: "payout_request", resourceId: locked.id,
          outcome: "success", metadata: { providerStatus: provider.providerStatus, providerFeeRecorded: !!provider.providerFeeKes } });
      });
    } else if (provider.verdict === "failed" || provider.verdict === "cancelled") {
      await db.update(payoutRequests).set({ status: "rejected", providerOutcome: provider.verdict, updatedAt: new Date() })
        .where(and(eq(payoutRequests.id, request.id), inArray(payoutRequests.status, ["accepted", "unknown"])));
    } else if (provider.verdict === "in_progress") {
      await db.update(payoutRequests).set({ status: "accepted", providerOutcome: "in_progress", updatedAt: new Date() })
        .where(and(eq(payoutRequests.id, request.id), inArray(payoutRequests.status, ["accepted", "unknown"])));
    }
    const [updated] = await db.select({ id: payoutRequests.id, status: payoutRequests.status, providerOutcome: payoutRequests.providerOutcome,
      providerConfirmedAt: payoutRequests.providerConfirmedAt, beneficiaryUserId: payoutRequests.beneficiaryUserId }).from(payoutRequests).where(eq(payoutRequests.id, request.id)).limit(1);
    if (updated?.status === "completed") notifySafely({ userId: updated.beneficiaryUserId, type: "payout_update", title: "Your reward payout was confirmed", body: "The provider confirmed your reward payout. Review the payout record in your workspace.", link: "/workspace" });
    res.json({ payoutRequest: updated, providerStatus: provider.providerStatus, notice: "Only the provider's exact per-transaction TS100 status completes a payout. No automatic retry is performed." });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-requests/:id/reconcile", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.payout.reconcile")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ outcome: z.enum(["confirmed_completed", "confirmed_not_executed", "unknown"]),
      note: z.string().trim().min(10).max(1500), evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A provider-evidence outcome, note and evidence reference are required" });
    const result = await db.transaction(async tx => {
      const [request] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, req.params.id)).limit(1).for("update");
      if (!request || !["submitting", "accepted", "unknown", "rejected"].includes(request.status) ||
        request.createdBy === req.auth!.id || request.approvedBy === req.auth!.id || request.executedBy === req.auth!.id) return null;
      const [settlement] = await tx.select().from(settlements).where(eq(settlements.id, request.settlementId)).limit(1).for("update");
      if (!settlement) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.payout.reconcile");
      let nextStatus = "unknown";
      if (parsed.data.outcome === "confirmed_completed") {
        const account = request.beneficiaryUserId === settlement.finderUserId ? "FINDER_REWARD_PAYABLE" : "AGENT_REWARD_PAYABLE";
        const [journal] = await tx.insert(financialJournals).values({ sourceType: "payout", sourceId: request.id, idempotencyKey: `payout:${request.id}`,
          currency: "KES", memo: "Independently evidenced provider-completed Finder/Agent reward payout" }).onConflictDoNothing().returning();
        if (journal) await tx.insert(financialPostings).values([
          { journalId: journal.id, accountCode: account, debitKes: request.amountKes, creditKes: "0.00", memo: "Settle beneficiary reward payable" },
          { journalId: journal.id, accountCode: "PROVIDER_PAYOUT_CLEARING", debitKes: "0.00", creditKes: request.amountKes, memo: "Independently evidenced M-Pesa disbursement" }
        ]);
        nextStatus = "completed";
      } else if (parsed.data.outcome === "confirmed_not_executed") nextStatus = "rejected";
      const [updated] = await tx.update(payoutRequests).set({ status: nextStatus, providerOutcome: parsed.data.outcome,
        providerConfirmedAt: nextStatus === "completed" ? new Date() : null, updatedAt: new Date() }).where(eq(payoutRequests.id, request.id)).returning();
      if (nextStatus === "completed") {
        const remaining = await tx.select({ id: payoutRequests.id }).from(payoutRequests).where(and(eq(payoutRequests.settlementId, settlement.id), sql`${payoutRequests.status}<>'completed'`));
        if (!remaining.length) await tx.update(settlements).set({ status: "paid" }).where(eq(settlements.id, settlement.id));
      }
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_manually_reconciled", resourceType: "payout_request", resourceId: request.id,
        outcome: "success", metadata: { providerEvidenceOutcome: parsed.data.outcome, evidenceRecorded: true, retryPermitted: false } });
      return updated;
    });
    if (!result) return res.status(409).json({ error: "Payout cannot be reconciled by this administrator in its current state" });
    const [beneficiary] = await db.select({ userId: payoutRequests.beneficiaryUserId }).from(payoutRequests).where(eq(payoutRequests.id, result.id)).limit(1);
    if (beneficiary) notifySafely({ userId: beneficiary.userId, type: "payout_update", title: "Your reward payout status was updated", body: result.status === "completed" ? "Independent reconciliation confirmed your reward payout." : "An administrator updated the payout reconciliation record. No automatic retry was made.", link: "/workspace" });
    res.json({ payoutRequest: { id: result.id, status: result.status, providerOutcome: result.providerOutcome }, notice: "Manual reconciliation recorded. This action cannot resubmit or retry a payout." });
  } catch (error) { next(error); }
});


financeRouter.post("/security/payment-pii/rotate", requireRole("admin"), async (req, res, next) => {
  if (process.env.PAYMENT_PII_ROTATION_ENABLED !== "true") return res.status(423).json({ error: "Payment PII key rotation is disabled" });
  if (!paymentPiiConfigured() || activePaymentPiiVersion() === "v1") return res.status(423).json({ error: "Configure a newer active encryption key and retain all old version keys before rotation" });
  try {
    const parsed = z.object({ limit: z.number().int().min(1).max(500).default(100) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid rotation batch size" });
    const result = await rotatePaymentPiiBatch(parsed.data.limit);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "security.payment_pii_key_rotation", resourceType: "payment_pii", resourceId: result.activeVersion,
      outcome: "success", metadata: { ...result, plaintextReturned: false } });
    res.json({ rotation: result, notice: "Encrypted payment and payout phone records were re-encrypted. Fingerprints were preserved; no plaintext was returned." });
  } catch (error) { next(error); }
});
