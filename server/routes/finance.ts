import { Router } from "express";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, assignments, caseDisputes, claims, custodyEvents, financialJournals, financialPostings, itemCategories, paymentAssessments, paymentTransactions, payoutDestinations, payoutRequests, refundRequests, rewardAuthorizations, reconciliationItems, providerOperationOutbox, financePeriodCloseRequests, settlementAllocationReviews, payoutDestinationVerificationEvents, dormantLiabilityReviews, providerReversalCases, providerStatementEvidence, pricingRules, pricingSchedules, reports, settlements } from "../db/schema.js";
import { authenticate, requireRole, requireStepUpInTransaction, consumeStepUpGrantInTransaction, consumeStepUpGrantWithPgClient } from "../security.js";
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

// Metadata-only queue for collection attempts whose provider request outcome is unresolved
// and for which no provider invoice reference was persisted. This queue cannot retry, confirm,
// fail, or otherwise mutate a payment transaction.
financeRouter.get("/collections/unresolved-sessions", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
      staleAfterMinutes: z.coerce.number().int().min(5).max(10080).default(5)
    }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid unresolved collection filters." });
    const { limit, offset, staleAfterMinutes } = parsed.data;
    const total = await pool.query(`SELECT COUNT(*)::int AS total
      FROM payment_transactions p
      WHERE p.provider='intasend' AND p.provider_invoice_id IS NULL
        AND p.status IN ('initiated','pending','unknown')
        AND p.created_at <= now() - ($1::int * interval '1 minute')`, [staleAfterMinutes]);
    const rows = await pool.query(`SELECT p.id,p.status,p.amount_kes,p.provider_state,p.created_at,p.updated_at,p.session_expires_at,
        c.reference AS claim_reference
      FROM payment_transactions p JOIN claims c ON c.id=p.claim_id
      WHERE p.provider='intasend' AND p.provider_invoice_id IS NULL
        AND p.status IN ('initiated','pending','unknown')
        AND p.created_at <= now() - ($1::int * interval '1 minute')
      ORDER BY p.created_at ASC LIMIT $2 OFFSET $3`, [staleAfterMinutes, limit, offset]);
    const now = Date.now();
    const sessions = rows.rows.map((row: any) => ({ ...row,
      ageMinutes: Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 60000)) }));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.unresolved_collection_sessions_viewed",
      resourceType: "payment_reconciliation_queue", outcome: "success",
      metadata: { total: Number(total.rows[0]?.total || 0), limit, offset, staleAfterMinutes, providerInvoiceReferencesExposed: false, payerDataExposed: false } });
    res.json({ sessions, page: { limit, offset, total: Number(total.rows[0]?.total || 0) }, staleAfterMinutes,
      automaticRetry: false, stateMutation: false,
      notice: "Read-only attention queue for stale collection attempts without a persisted provider invoice. Age is an investigation signal, not proof of payment or non-payment. No provider request, retry, payment confirmation or status change is performed." });
  } catch (error) { next(error); }
});

financeRouter.get("/collections/unresolved-sessions/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT p.id,p.status,p.amount_kes,p.provider_state,p.payer_phone_masked,
        p.session_expires_at,p.last_verified_at,p.created_at,p.updated_at,c.reference AS claim_reference,
        a.status AS assessment_status,a.payment_window_expires_at
      FROM payment_transactions p JOIN claims c ON c.id=p.claim_id
      LEFT JOIN payment_assessments a ON a.id=p.assessment_id
      WHERE p.id=$1 AND p.provider='intasend' AND p.provider_invoice_id IS NULL
        AND p.status IN ('initiated','pending','unknown')`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Unresolved collection session not found" });
    const session = result.rows[0];
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.unresolved_collection_session_detail_viewed",
      resourceType: "payment_transaction", resourceId: session.id, outcome: "success",
      metadata: { providerInvoiceReferencePresent: false, payerPhoneMaskedOnly: true, ciphertextExposed: false } });
    res.json({ session, automaticRetry: false, stateMutation: false,
      notice: "Restricted read-only detail. A missing provider invoice cannot be treated as proof that no request reached the provider. Resolve only through a separately authorised evidence process; this endpoint cannot retry or change payment state." });
  } catch (error) { next(error); }
});

// Read-only operational recovery queue. It deliberately exposes no beneficiary destination,
// payer PII, ciphertext, request payload or automatic retry action.
financeRouter.get("/provider-operations/attention", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["reserved", "dispatching", "unknown"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0), staleAfterMinutes: z.coerce.number().int().min(5).max(1440).default(5) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid provider attention queue filters." });
    const filters = parsed.data;
    const where = filters.status ? and(eq(providerOperationOutbox.status, filters.status)) : inArray(providerOperationOutbox.status, ["reserved", "dispatching", "unknown"]);
    const [totalRow] = await db.select({ value: count() }).from(providerOperationOutbox).where(where);
    const rows = await db.select({ id: providerOperationOutbox.id, operationType: providerOperationOutbox.operationType,
      status: providerOperationOutbox.status, attemptCount: providerOperationOutbox.attemptCount,
      dispatchStartedAt: providerOperationOutbox.dispatchStartedAt, createdAt: providerOperationOutbox.createdAt,
      updatedAt: providerOperationOutbox.updatedAt })
      .from(providerOperationOutbox).where(where).orderBy(asc(providerOperationOutbox.createdAt)).limit(filters.limit).offset(filters.offset);
    const now = Date.now();
    const operations = rows.map(row => ({ ...row, ageMinutes: Math.max(0, Math.floor((now - new Date(row.createdAt).getTime()) / 60000)),
      stale: now - new Date(row.updatedAt).getTime() >= filters.staleAfterMinutes * 60000 }));
    res.json({ operations, page: { limit: filters.limit, offset: filters.offset, total: Number(totalRow?.value || 0) }, staleAfterMinutes: filters.staleAfterMinutes,
      automaticRetry: false, notice: "Metadata-only read-only queue. Stale is an attention indicator, not proof of provider failure; verify independently before any separately authorised recovery. no retry is initiated here." });
  } catch (error) { next(error); }
});

financeRouter.get("/provider-operations/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [operation] = await db.select({ id: providerOperationOutbox.id, operationType: providerOperationOutbox.operationType,
      resourceId: providerOperationOutbox.resourceId, idempotencyKey: providerOperationOutbox.idempotencyKey,
      status: providerOperationOutbox.status, requestedBy: providerOperationOutbox.requestedBy,
      attemptCount: providerOperationOutbox.attemptCount, providerReference: providerOperationOutbox.providerReference,
      httpStatus: providerOperationOutbox.httpStatus, dispatchStartedAt: providerOperationOutbox.dispatchStartedAt,
      resolvedAt: providerOperationOutbox.resolvedAt, createdAt: providerOperationOutbox.createdAt,
      updatedAt: providerOperationOutbox.updatedAt })
      .from(providerOperationOutbox).where(eq(providerOperationOutbox.id, req.params.id)).limit(1);
    if (!operation) return res.status(404).json({ error: "Provider operation not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.provider_operation_detail_viewed",
      resourceType: "provider_operation_outbox", resourceId: operation.id, outcome: "success",
      metadata: { operationType: operation.operationType, status: operation.status, requestPayloadExposed: false } });
    res.json({ operation, automaticRetry: false, notice: "Read-only provider operation detail. This view cannot dispatch, retry or alter provider state." });
  } catch (error) { next(error); }
});

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

financeRouter.get("/ledger/journals", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ sourceType: z.string().trim().min(1).max(80).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid financial journal queue filters." });
    const filters = parsed.data;
    const where = filters.sourceType ? eq(financialJournals.sourceType, filters.sourceType) : undefined;
    const [totalRow] = await db.select({ value: count() }).from(financialJournals).where(where);
    const baseQuery = db.select({ id: financialJournals.id, sourceType: financialJournals.sourceType,
      currency: financialJournals.currency, createdAt: financialJournals.createdAt }).from(financialJournals);
    const rows = where
      ? await baseQuery.where(where).orderBy(desc(financialJournals.createdAt)).limit(filters.limit).offset(filters.offset)
      : await baseQuery.orderBy(desc(financialJournals.createdAt)).limit(filters.limit).offset(filters.offset);
    res.json({ journals: rows, page: { limit: filters.limit, offset: filters.offset, total: Number(totalRow?.value || 0) },
      notice: "Metadata-only read-only journal queue. Source references, memo and posting breakdown require separately audited detail access." });
  } catch (error) { next(error); }
});

// Read-only account-level ledger summaries and journal-integrity exceptions.
// No correction, posting, settlement or provider action is exposed by this endpoint.
financeRouter.get("/ledger/reconciliation-overview", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ accountCode: z.string().trim().min(1).max(60).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ledger reconciliation filters." });
    const { accountCode, limit } = parsed.data;
    const accounts = await pool.query(`SELECT account_code,
        COALESCE(SUM(debit_kes),0)::numeric(14,2)::text debit_kes,
        COALESCE(SUM(credit_kes),0)::numeric(14,2)::text credit_kes,
        COALESCE(SUM(debit_kes-credit_kes),0)::numeric(14,2)::text net_debit_kes,
        COUNT(*)::int posting_count, MAX(created_at) last_posted_at
      FROM financial_postings
      WHERE ($1::text IS NULL OR account_code=$1)
      GROUP BY account_code ORDER BY account_code LIMIT $2`, [accountCode || null, limit]);
    const exceptions = await pool.query(`SELECT j.id,j.source_type,j.currency,j.created_at,
        COUNT(p.id)::int posting_count,
        COALESCE(SUM(p.debit_kes),0)::numeric(14,2)::text debit_kes,
        COALESCE(SUM(p.credit_kes),0)::numeric(14,2)::text credit_kes
      FROM financial_journals j LEFT JOIN financial_postings p ON p.journal_id=j.id
      GROUP BY j.id,j.source_type,j.currency,j.created_at
      HAVING COUNT(p.id)=0 OR ABS(COALESCE(SUM(p.debit_kes),0)-COALESCE(SUM(p.credit_kes),0)) > 0.005
      ORDER BY j.created_at DESC LIMIT $1`, [limit]);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.ledger_reconciliation_overview_viewed", resourceType: "financial_ledger", outcome: "success",
      metadata: { accountFilterApplied: Boolean(accountCode), accountCount: accounts.rows.length, exceptionCount: exceptions.rows.length, limit, readOnly: true } });
    res.json({ accounts: accounts.rows, journalExceptions: exceptions.rows,
      notice: "Read-only ledger reconciliation view. Account net is debit less credit; exceptions require investigation and a separate authorised correcting journal. No ledger data was changed." });
  } catch (error) { next(error); }
});

// Consolidated, metadata-only Finance control totals for account reconciliation and
// period-close preparation. This is a read-only report, not a close or settlement action.
financeRouter.get("/reconciliation/control-totals", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [collectionRows, refundRows, payoutRows, providerRows, paymentRows, journalRows] = await Promise.all([
      pool.query(`SELECT source,status,COUNT(*)::int item_count,
          COALESCE(SUM(amount_kes),0)::numeric(14,2)::text amount_kes,
          COALESCE(SUM(variance_kes),0)::numeric(14,2)::text variance_kes,
          MIN(created_at) oldest_created_at
        FROM reconciliation_items GROUP BY source,status ORDER BY source,status`),
      pool.query(`SELECT status,COUNT(*)::int item_count,COALESCE(SUM(amount_kes),0)::numeric(14,2)::text amount_kes,
          MIN(created_at) oldest_created_at FROM refund_requests GROUP BY status ORDER BY status`),
      pool.query(`SELECT status,COUNT(*)::int item_count,COALESCE(SUM(amount_kes),0)::numeric(14,2)::text amount_kes,
          MIN(created_at) oldest_created_at FROM payout_requests GROUP BY status ORDER BY status`),
      pool.query(`SELECT operation_type,status,COUNT(*)::int item_count,MIN(created_at) oldest_created_at,
          MIN(updated_at) oldest_last_update FROM provider_operation_outbox GROUP BY operation_type,status ORDER BY operation_type,status`),
      pool.query(`SELECT status,COUNT(*)::int item_count,COALESCE(SUM(amount_kes),0)::numeric(14,2)::text amount_kes,
          MIN(created_at) oldest_created_at FROM payment_transactions GROUP BY status ORDER BY status`),
      pool.query(`SELECT COUNT(*)::int exception_count FROM (
          SELECT j.id FROM financial_journals j LEFT JOIN financial_postings p ON p.journal_id=j.id
          GROUP BY j.id HAVING COUNT(p.id)=0 OR ABS(COALESCE(SUM(p.debit_kes),0)-COALESCE(SUM(p.credit_kes),0)) > 0.005
        ) journal_exceptions`)
    ]);
    const openReconciliation = collectionRows.rows.filter((r:any) => r.status !== "resolved").reduce((n:number,r:any) => n + Number(r.item_count), 0);
    const openRefunds = refundRows.rows.filter((r:any) => !["refunded", "rejected"].includes(r.status)).reduce((n:number,r:any) => n + Number(r.item_count), 0);
    const openPayouts = payoutRows.rows.filter((r:any) => !["completed", "rejected"].includes(r.status)).reduce((n:number,r:any) => n + Number(r.item_count), 0);
    const providerAttention = providerRows.rows.filter((r:any) => ["reserved", "dispatching", "unknown"].includes(r.status)).reduce((n:number,r:any) => n + Number(r.item_count), 0);
    const journalExceptions = Number(journalRows.rows[0]?.exception_count || 0);
    const blockers = { collectionReconciliation: openReconciliation, refundLifecycle: openRefunds,
      payoutLifecycle: openPayouts, providerOperations: providerAttention, journalIntegrity: journalExceptions };
    const blockerSignalCount = Object.values(blockers).reduce((n, value) => n + value, 0);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.reconciliation_control_totals_viewed",
      resourceType: "financial_control_totals", outcome: "success",
      metadata: { blockers, blockerSignalCount, countsMayOverlap: true, readOnly: true, periodClosePerformed: false, providerEvidenceMatchedAutomatically: false } });
    res.json({ generatedAt: new Date().toISOString(), collections: collectionRows.rows, refunds: refundRows.rows,
      payouts: payoutRows.rows, providerOperations: providerRows.rows, payments: paymentRows.rows,
      periodClosePreparation: { blockers, blockerSignalCount, countsMayOverlap: true, status: blockerSignalCount === 0 ? "no_open_operational_exceptions_detected" : "exceptions_require_review",
        readyForClose: false, independentFinanceApprovalRequired: true, periodClosePerformed: false },
      readOnly: true, snapshotConsistency: "best_effort_non_transactional", notice: "Aggregated operational control totals only. Category counts may overlap across related records. The report is a best-effort, non-transactional snapshot, not a provider-to-ledger match, does not certify completeness, and does not close an accounting period. Resolve exceptions using separately authorised workflows and obtain independent Finance approval." });
  } catch (error) { next(error); }
});

// Aged-liability view is metadata-only. It never forfeits, transfers, settles or writes off a balance.
financeRouter.get("/liabilities/aging", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ minimumDays: z.coerce.number().int().min(30).max(3650).default(90) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid liability aging threshold." });
    const [settlementsAged, payoutsAged, refundsAged] = await Promise.all([
      pool.query(`SELECT 'settlement'::text liability_type, status, COUNT(*)::int item_count,
          COALESCE(SUM(gross_kes),0)::numeric(14,2)::text amount_kes,
          MIN(created_at) oldest_created_at, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-MIN(created_at)))/86400))::int oldest_age_days
        FROM settlements WHERE status IN ('eligible','approved','payout_pending','on_hold')
          AND created_at <= now()-($1::int * interval '1 day') GROUP BY status ORDER BY status`, [parsed.data.minimumDays]),
      pool.query(`SELECT 'payout'::text liability_type, status, COUNT(*)::int item_count,
          COALESCE(SUM(amount_kes),0)::numeric(14,2)::text amount_kes,
          MIN(created_at) oldest_created_at, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-MIN(created_at)))/86400))::int oldest_age_days
        FROM payout_requests WHERE status NOT IN ('completed','rejected')
          AND created_at <= now()-($1::int * interval '1 day') GROUP BY status ORDER BY status`, [parsed.data.minimumDays]),
      pool.query(`SELECT 'refund'::text liability_type, status, COUNT(*)::int item_count,
          COALESCE(SUM(amount_kes),0)::numeric(14,2)::text amount_kes,
          MIN(created_at) oldest_created_at, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-MIN(created_at)))/86400))::int oldest_age_days
        FROM refund_requests WHERE status NOT IN ('refunded','rejected')
          AND created_at <= now()-($1::int * interval '1 day') GROUP BY status ORDER BY status`, [parsed.data.minimumDays])
    ]);
    const liabilities = [...settlementsAged.rows, ...payoutsAged.rows, ...refundsAged.rows];
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.aged_liabilities_viewed", resourceType: "financial_liabilities", outcome: "success",
      metadata: { minimumDays: parsed.data.minimumDays, groups: liabilities.length, rowLevelBeneficiaryDataExposed: false, forfeiturePerformed: false } });
    res.json({ generatedAt: new Date().toISOString(), minimumDays: parsed.data.minimumDays, liabilities,
      policy: { automaticForfeiture: false, writeOff: false, transfer: false, beneficiaryContactAndLegalReviewRequired: true },
      notice: "Aging identifies unresolved financial obligations only. No balance is forfeited, transferred, written off or automatically settled. Dormant funds remain liabilities until a separately authorised and legally reviewed resolution." });
  } catch (error) { next(error); }
});

// Capture an immutable allocation review without rewriting a historical settlement snapshot.
financeRouter.post("/settlements/:id/allocation-review", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.settlement.allocation_review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ note: z.string().trim().min(10).max(1500), status: z.enum(["needs_accounting_review","accepted_for_historical_record"]) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A review status and documented rationale are required." });
    const result = await db.transaction(async tx => {
      const [settlement] = await tx.select().from(settlements).where(eq(settlements.id, req.params.id)).limit(1).for("update");
      if (!settlement) return null;
      if (settlement.approvedBy === req.auth!.id) return { conflict: true as const };
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.settlement.allocation_review");
      const variance = Number(settlement.finderPercent) !== 33 || Number(settlement.agentPercent) !== 25 || Number(settlement.platformPercent) !== 42 ||
        Math.abs(Number(settlement.finderKes) - Number(settlement.grossKes) * .33) > .01 ||
        Math.abs(Number(settlement.agentKes) - Number(settlement.grossKes) * .25) > .01;
      const [review] = await tx.insert(settlementAllocationReviews).values({ settlementId: settlement.id, reviewedPolicyVersion: "33-25-42-v1",
        snapshotFinderPercent: settlement.finderPercent, snapshotAgentPercent: settlement.agentPercent, snapshotPlatformPercent: settlement.platformPercent,
        snapshotFinderKes: settlement.finderKes, snapshotAgentKes: settlement.agentKes, snapshotPlatformKes: settlement.platformKes,
        varianceDetected: variance, reviewStatus: variance ? "needs_accounting_review" : parsed.data.status,
        reviewedBy: req.auth!.id, reviewNote: parsed.data.note }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.settlement_allocation_review_recorded", resourceType: "settlement", resourceId: settlement.id,
        outcome: "success", metadata: { reviewId: review.id, varianceDetected: variance, historicalSnapshotChanged: false } });
      return { review, variance };
    });
    if (!result) return res.status(404).json({ error: "Settlement not found" });
    if ("conflict" in result) return res.status(409).json({ error: "The settlement approver cannot independently review this allocation." });
    res.status(201).json({ review: result.review, varianceDetected: result.variance, historicalSnapshotChanged: false,
      notice: "Allocation review recorded as a separate immutable evidence record. Historical settlement amounts and percentages were not changed." });
  } catch (error) { next(error); }
});

financeRouter.get("/liabilities/review-register", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["needs_contact","contact_attempted","disputed","legal_hold","resolved"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid liability review filters." });
    const rows = await db.select({ id: dormantLiabilityReviews.id, liabilityType: dormantLiabilityReviews.liabilityType,
      liabilityReference: dormantLiabilityReviews.liabilityReference, amountKes: dormantLiabilityReviews.amountKes,
      agingDays: dormantLiabilityReviews.agingDays, reviewStatus: dormantLiabilityReviews.reviewStatus,
      lastContactAt: dormantLiabilityReviews.lastContactAt, updatedAt: dormantLiabilityReviews.updatedAt })
      .from(dormantLiabilityReviews).where(parsed.data.status ? eq(dormantLiabilityReviews.reviewStatus, parsed.data.status) : undefined)
      .orderBy(desc(dormantLiabilityReviews.agingDays)).limit(parsed.data.limit);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.liability_review_register_viewed", resourceType: "financial_liabilities", outcome: "success",
      metadata: { returned: rows.length, beneficiaryIdentityExposed: false } });
    res.json({ liabilities: rows, notice: "This is a manual contact and legal-review register. A liability cannot be forfeited or written off through this workspace." });
  } catch (error) { next(error); }
});

financeRouter.post("/liabilities/review-register", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.liability.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ liabilityType: z.enum(["settlement","payout","refund","unclaimed_reward"]), liabilityReference: z.string().trim().min(4).max(160),
      amountKes: z.string().regex(/^\d+(?:\.\d{1,2})?$/), agingDays: z.number().int().min(0).max(36500),
      reviewStatus: z.enum(["needs_contact","contact_attempted","disputed","legal_hold","resolved"]),
      evidenceReference: z.string().trim().min(4).max(500).optional(), note: z.string().trim().min(10).max(1500) }).strict().safeParse(req.body);
    if (!parsed.success || Number(parsed.data?.amountKes ?? 0) < 0) return res.status(400).json({ error: "Provide valid liability reference, amount, aging and documented review details." });
    const [row] = await db.insert(dormantLiabilityReviews).values({ liabilityType: parsed.data.liabilityType, liabilityReference: parsed.data.liabilityReference,
      amountKes: parsed.data.amountKes, agingDays: parsed.data.agingDays, reviewStatus: parsed.data.reviewStatus,
      lastContactAt: parsed.data.reviewStatus === "contact_attempted" ? new Date() : null,
      evidenceReference: parsed.data.evidenceReference, reviewedBy: req.auth!.id, reviewNote: parsed.data.note })
      .onConflictDoUpdate({ target: [dormantLiabilityReviews.liabilityType, dormantLiabilityReviews.liabilityReference],
        set: { amountKes: parsed.data.amountKes, agingDays: parsed.data.agingDays, reviewStatus: parsed.data.reviewStatus,
          lastContactAt: parsed.data.reviewStatus === "contact_attempted" ? new Date() : null, evidenceReference: parsed.data.evidenceReference,
          reviewedBy: req.auth!.id, reviewNote: parsed.data.note, updatedAt: new Date() } }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.liability_review_recorded", resourceType: "financial_liability_review", resourceId: row.id,
      outcome: "success", metadata: { liabilityType: row.liabilityType, reviewStatus: row.reviewStatus, forfeitureOrWriteOff: false } });
    res.status(201).json({ liability: row, notice: "Liability review recorded. No funds were transferred, forfeited, written off or otherwise moved." });
  } catch (error) { next(error); }
});

// Provider statement evidence is registered by reference and hash; this endpoint does not upload, parse or reconcile a statement.
financeRouter.get("/provider-statements", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const rows = await db.select({ id: providerStatementEvidence.id, provider: providerStatementEvidence.provider,
      periodStart: providerStatementEvidence.periodStart, periodEnd: providerStatementEvidence.periodEnd,
      declaredRowCount: providerStatementEvidence.declaredRowCount, status: providerStatementEvidence.status,
      createdAt: providerStatementEvidence.createdAt, reviewedAt: providerStatementEvidence.reviewedAt,
      uploadedBy: providerStatementEvidence.uploadedBy })
      .from(providerStatementEvidence).orderBy(desc(providerStatementEvidence.createdAt)).limit(100);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.provider_statement_queue_viewed", resourceType: "provider_statement_evidence",
      outcome: "success", metadata: { returned: rows.length, fileContentExposed: false } });
    res.json({ statements: rows.map(({ uploadedBy, ...row }) => ({ ...row, canReview: uploadedBy !== req.auth!.id })), notice: "Metadata-only evidence register. Statement parsing and provider-to-ledger matching are not performed by this register." });
  } catch (error) { next(error); }
});

financeRouter.post("/provider-statements", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.provider_statement.register")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ provider: z.enum(["intasend"]), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), evidenceReference: z.string().trim().min(4).max(500),
      contentSha256: z.string().regex(/^[a-f0-9]{64}$/i), declaredRowCount: z.number().int().min(0).max(1000000) }).strict()
      .refine(v => v.periodEnd >= v.periodStart, { message: "Statement period end must not precede start." }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide provider, period, evidence reference, SHA-256 and declared row count." });
    const row = await db.transaction(async tx => {
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.provider_statement.register");
      const [created] = await tx.insert(providerStatementEvidence).values({ provider: parsed.data.provider,
        periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd, evidenceReference: parsed.data.evidenceReference,
        contentSha256: parsed.data.contentSha256.toLowerCase(), declaredRowCount: parsed.data.declaredRowCount, uploadedBy: req.auth!.id }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.provider_statement_evidence_registered", resourceType: "provider_statement_evidence",
        resourceId: created.id, outcome: "success", metadata: { provider: created.provider, contentHashRecorded: true, statementParsed: false } });
      return created;
    });
    res.status(201).json({ statement: { id: row.id, provider: row.provider, periodStart: row.periodStart, periodEnd: row.periodEnd,
      declaredRowCount: row.declaredRowCount, status: row.status }, notice: "Statement evidence reference recorded. This does not import, parse, reconcile or certify provider transactions." });
  } catch (error) { next(error); }
});

financeRouter.post("/provider-statements/:id/review", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.provider_statement.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["verified","rejected"]), note: z.string().trim().min(10).max(1500) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a review decision and rationale." });
    const row = await db.transaction(async tx => {
      const [current] = await tx.select().from(providerStatementEvidence).where(eq(providerStatementEvidence.id, req.params.id)).limit(1).for("update");
      if (!current || current.status !== "received" || current.uploadedBy === req.auth!.id) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.provider_statement.review");
      const [updated] = await tx.update(providerStatementEvidence).set({ status: parsed.data.decision, reviewedBy: req.auth!.id,
        reviewNote: parsed.data.note, reviewedAt: new Date() }).where(and(eq(providerStatementEvidence.id, current.id), eq(providerStatementEvidence.status, "received"))).returning();
      if (!updated) return null;
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.provider_statement_evidence_reviewed", resourceType: "provider_statement_evidence",
        resourceId: updated.id, outcome: "success", metadata: { decision: updated.status, makerCheckerSeparated: true, ledgerReconciled: false } });
      return updated;
    });
    if (!row) return res.status(409).json({ error: "Statement evidence not found, already reviewed, or independent reviewer separation failed." });
    res.json({ statement: { id: row.id, status: row.status, reviewedAt: row.reviewedAt }, ledgerReconciled: false,
      notice: "Evidence registration reviewed. This decision does not reconcile ledger entries or alter payment status." });
  } catch (error) { next(error); }
});

financeRouter.get("/provider-reversals", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const rows = await db.select({ id: providerReversalCases.id, paymentTransactionId: providerReversalCases.paymentTransactionId,
      reversalType: providerReversalCases.reversalType, amountKes: providerReversalCases.amountKes,
      status: providerReversalCases.status, reportedAt: providerReversalCases.reportedAt, reviewedAt: providerReversalCases.reviewedAt,
      reportedBy: providerReversalCases.reportedBy, reviewedBy: providerReversalCases.reviewedBy })
      .from(providerReversalCases).orderBy(desc(providerReversalCases.reportedAt)).limit(100);
    res.json({ cases: rows.map(({ reportedBy, reviewedBy, ...row }) => ({ ...row,
      canReview: reportedBy !== req.auth!.id && (row.status === "received" || reviewedBy !== req.auth!.id) })), notice: "Metadata-only provider reversal queue. Financial and custody states are not changed by viewing a reversal." });
  } catch (error) { next(error); }
});

financeRouter.post("/provider-reversals", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.provider_reversal.register")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ paymentTransactionId: z.string().uuid(), reversalType: z.enum(["chargeback","provider_return","refund_reversal","other"]),
      amountKes: z.string().regex(/^\d+(?:\.\d{1,2})?$/), providerReference: z.string().trim().min(4).max(180),
      evidenceReference: z.string().trim().min(4).max(500), evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/i) }).strict().safeParse(req.body);
    if (!parsed.success || Number(parsed.data?.amountKes ?? 0) <= 0) return res.status(400).json({ error: "Provide a valid payment, reversal amount, provider reference and evidence hash." });
    const row = await db.transaction(async tx => {
      const [payment] = await tx.select({ id: paymentTransactions.id, amountKes: paymentTransactions.amountKes }).from(paymentTransactions)
        .where(eq(paymentTransactions.id, parsed.data.paymentTransactionId)).limit(1).for("update");
      if (!payment) return null;
      const [existing] = await tx.select({ total: sql<string>`COALESCE(SUM(${providerReversalCases.amountKes}),0)::text` })
        .from(providerReversalCases).where(eq(providerReversalCases.paymentTransactionId, payment.id));
      if (Number(existing?.total || 0) + Number(parsed.data.amountKes) > Number(payment.amountKes)) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.provider_reversal.register");
      const [created] = await tx.insert(providerReversalCases).values({ paymentTransactionId: parsed.data.paymentTransactionId,
        reversalType: parsed.data.reversalType, amountKes: parsed.data.amountKes, providerReference: parsed.data.providerReference,
        evidenceReference: parsed.data.evidenceReference, evidenceHash: parsed.data.evidenceSha256.toLowerCase(), reportedBy: req.auth!.id }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.provider_reversal_registered", resourceType: "provider_reversal_case",
        resourceId: created.id, outcome: "success", metadata: { reversalType: created.reversalType, amountKes: created.amountKes, paymentStateChanged: false, custodyChanged: false } });
      return created;
    });
    if (!row) return res.status(409).json({ error: "Payment not found or cumulative provider reversal amounts would exceed the original collection." });
    res.status(201).json({ case: { id: row.id, status: row.status, reversalType: row.reversalType, amountKes: row.amountKes },
      notice: "Provider reversal recorded for independent review. No payment status, financial journal, settlement or item custody state was changed." });
  } catch (error) { next(error); }
});

financeRouter.post("/provider-reversals/:id/review", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.provider_reversal.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["under_review","confirmed","disputed","not_a_reversal"]), note: z.string().trim().min(10).max(1500) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a reversal review decision and rationale." });
    const row = await db.transaction(async tx => {
      const [current] = await tx.select().from(providerReversalCases).where(eq(providerReversalCases.id, req.params.id)).limit(1).for("update");
      if (!current || current.reportedBy === req.auth!.id || !["received","under_review"].includes(current.status) ||
        (current.status === "under_review" && (current.reviewedBy === req.auth!.id || parsed.data.decision === "under_review"))) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.provider_reversal.review");
      const [updated] = await tx.update(providerReversalCases).set({ status: parsed.data.decision, reviewedBy: req.auth!.id,
        reviewNote: parsed.data.note, reviewedAt: new Date() }).where(and(eq(providerReversalCases.id, current.id), eq(providerReversalCases.status, current.status))).returning();
      if (!updated) return null;
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.provider_reversal_reviewed", resourceType: "provider_reversal_case",
        resourceId: updated.id, outcome: "success", metadata: { decision: updated.status, makerCheckerSeparated: true, financialStateChanged: false, custodyChanged: false } });
      return updated;
    });
    if (!row) return res.status(409).json({ error: "Reversal case not found, already reviewed, or independent reviewer separation failed." });
    res.json({ case: { id: row.id, status: row.status, reviewedAt: row.reviewedAt }, financialStateChanged: false, custodyChanged: false,
      notice: "Review recorded. A separate authorised correcting-journal workflow and custody assessment are required; neither is performed here." });
  } catch (error) { next(error); }
});

// Period-close is deliberately a review workflow, not an accounting close or posting operation.
financeRouter.get("/period-close-requests", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const rows = await db.select({ id: financePeriodCloseRequests.id, periodStart: financePeriodCloseRequests.periodStart,
      periodEnd: financePeriodCloseRequests.periodEnd, status: financePeriodCloseRequests.status,
      submittedAt: financePeriodCloseRequests.submittedAt, reviewedAt: financePeriodCloseRequests.reviewedAt,
      submittedBy: financePeriodCloseRequests.submittedBy })
      .from(financePeriodCloseRequests).orderBy(desc(financePeriodCloseRequests.submittedAt)).limit(100);
    res.json({ requests: rows.map(({ submittedBy, ...row }) => ({ ...row, canReview: submittedBy !== req.auth!.id })), notice: "Metadata-only period review queue. Approval permits external accountant review only; it does not close a period or post journals." });
  } catch (error) { next(error); }
});

financeRouter.post("/period-close-requests", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      evidenceReference: z.string().trim().min(4).max(500) }).strict().refine(v => v.periodEnd >= v.periodStart, { message: "Period end must not precede period start." }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a valid period range and finance evidence reference." });
    const snapshotResult = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM payment_transactions WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')) payment_count,
      (SELECT COUNT(*)::int FROM reconciliation_items WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day') AND status <> 'resolved') open_reconciliation_count,
      (SELECT COUNT(*)::int FROM refund_requests WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day') AND status NOT IN ('refunded','rejected')) open_refund_count,
      (SELECT COUNT(*)::int FROM payout_requests WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day') AND status NOT IN ('completed','rejected')) open_payout_count,
      (SELECT COUNT(*)::int FROM provider_operation_outbox WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day') AND status IN ('reserved','dispatching','unknown')) provider_attention_count,
      (SELECT COUNT(*)::int FROM (SELECT j.id FROM financial_journals j LEFT JOIN financial_postings p ON p.journal_id=j.id WHERE j.created_at >= $1::date AND j.created_at < ($2::date + interval '1 day') GROUP BY j.id HAVING COUNT(p.id)=0 OR ABS(COALESCE(SUM(p.debit_kes),0)-COALESCE(SUM(p.credit_kes),0)) > .005) journal_exceptions) journal_exception_count`, [parsed.data.periodStart, parsed.data.periodEnd]);
    const snapshot = snapshotResult.rows[0] ?? {};
    const payload = { periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd, controls: snapshot,
      snapshotType: "best_effort_non_transactional", closePerformed: false, sourceMatchingCertified: false };
    const snapshotHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const [request] = await db.insert(financePeriodCloseRequests).values({ periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd,
      snapshotHash, snapshotPayload: payload, evidenceReference: parsed.data.evidenceReference, submittedBy: req.auth!.id }).returning({
        id: financePeriodCloseRequests.id, periodStart: financePeriodCloseRequests.periodStart, periodEnd: financePeriodCloseRequests.periodEnd,
        snapshotHash: financePeriodCloseRequests.snapshotHash, status: financePeriodCloseRequests.status, submittedAt: financePeriodCloseRequests.submittedAt });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.period_close_review_submitted", resourceType: "finance_period_close_request", resourceId: request.id,
      outcome: "success", metadata: { snapshotHash, periodStart: request.periodStart, periodEnd: request.periodEnd, closePerformed: false } });
    res.status(201).json({ request, notice: "Period evidence snapshot submitted for independent review. This does not close the period, certify provider matching, release funds or post a journal." });
  } catch (error) { next(error); }
});

financeRouter.post("/period-close-requests/:id/review", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.finance.period_close.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["approve_for_external_accounting_review","return","reject"]), note: z.string().trim().min(10).max(1500) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a review decision and provide a documented rationale." });
    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(financePeriodCloseRequests).where(eq(financePeriodCloseRequests.id, req.params.id)).limit(1).for("update");
      if (!current || current.status !== "submitted" || current.submittedBy === req.auth!.id) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.period_close.review");
      const status = parsed.data.decision === "approve_for_external_accounting_review" ? "approved_for_external_accounting_review" : parsed.data.decision === "return" ? "returned" : "rejected";
      const [row] = await tx.update(financePeriodCloseRequests).set({ status, reviewedBy: req.auth!.id, reviewNote: parsed.data.note, reviewedAt: new Date() })
        .where(and(eq(financePeriodCloseRequests.id, current.id), eq(financePeriodCloseRequests.status, "submitted"))).returning();
      if (!row) return null;
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.period_close_review_decided", resourceType: "finance_period_close_request", resourceId: row.id,
        outcome: "success", metadata: { status, makerCheckerSeparated: true, periodActuallyClosed: false } });
      return row;
    });
    if (!updated) return res.status(409).json({ error: "Request not found, already reviewed, or independent reviewer separation was not satisfied." });
    res.json({ request: updated, periodActuallyClosed: false, notice: "Review decision recorded. This workflow does not close an accounting period or post financial journals." });
  } catch (error) { next(error); }
});

// Compare immutable historical settlement snapshots with the currently approved 33/25/42 policy.
// This endpoint reports differences only; it never rewrites a stored allocation.
financeRouter.get("/settlements/policy-review", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid settlement policy review filters." });
    const { limit, offset } = parsed.data;
    const mismatch = `finder_percent<>33 OR agent_percent<>25 OR platform_percent<>42 OR finder_kes<>ROUND(gross_kes*0.33,2) OR agent_kes<>ROUND(gross_kes*0.25,2) OR platform_kes<>(gross_kes-ROUND(gross_kes*0.33,2)-ROUND(gross_kes*0.25,2))`;
    const total = await pool.query(`SELECT COUNT(*)::int total FROM settlements WHERE ${mismatch}`);
    const rows = await pool.query(`SELECT id,gross_kes::text gross_kes,finder_kes::text finder_kes,agent_kes::text agent_kes,platform_kes::text platform_kes,
        finder_percent,agent_percent,platform_percent,allocation_policy_version,allocation_snapshot_at,allocation_snapshot_source,status,created_at
      FROM settlements WHERE ${mismatch} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.settlement_policy_review_viewed", resourceType: "settlement", outcome: "success",
      metadata: { policy: "33/25/42", limit, offset, returned: rows.rows.length, total: Number(total.rows[0]?.total || 0), historicalSnapshotsRewritten: false } });
    res.json({ policy: { finderPercent: 33, agentPercent: 25, platformPercent: 42 }, settlements: rows.rows,
      page: { limit, offset, total: Number(total.rows[0]?.total || 0) }, historicalSnapshotsRewritten: false,
      notice: "Differences are reported for review only. Historical settlement allocations are immutable snapshots and are never silently migrated or recalculated." });
  } catch (error) { next(error); }
});

financeRouter.get("/ledger/journals/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [journal] = await db.select({ id: financialJournals.id, sourceType: financialJournals.sourceType,
      sourceId: financialJournals.sourceId, idempotencyKey: financialJournals.idempotencyKey,
      currency: financialJournals.currency, memo: financialJournals.memo, createdBy: financialJournals.createdBy,
      createdTxid: financialJournals.createdTxid, createdAt: financialJournals.createdAt })
      .from(financialJournals).where(eq(financialJournals.id, req.params.id)).limit(1);
    if (!journal) return res.status(404).json({ error: "Financial journal not found" });
    const postings = await db.select({ id: financialPostings.id, accountCode: financialPostings.accountCode,
      debitKes: financialPostings.debitKes, creditKes: financialPostings.creditKes,
      memo: financialPostings.memo, createdAt: financialPostings.createdAt })
      .from(financialPostings).where(eq(financialPostings.journalId, journal.id)).orderBy(asc(financialPostings.createdAt));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.ledger_journal_detail_viewed",
      resourceType: "financial_journal", resourceId: journal.id, outcome: "success",
      metadata: { postingCount: postings.length, immutableJournal: true } });
    res.json({ journal: { ...journal, postings }, notice: "Read-only immutable journal detail. Corrections require a separate correcting journal." });
  } catch (error) { next(error); }
});

financeRouter.get("/payment-transactions", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: paymentTransactions.id, claimReference: reports.reference,
      amountKes: paymentTransactions.amountKes, status: paymentTransactions.status,
      createdAt: paymentTransactions.createdAt, confirmedAt: paymentTransactions.confirmedAt,
      assessmentStatus: paymentAssessments.status })
      .from(paymentTransactions).innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).innerJoin(reports, eq(reports.id, claims.reportId))
      .innerJoin(paymentAssessments, eq(paymentAssessments.id, paymentTransactions.assessmentId))
      .orderBy(desc(paymentTransactions.createdAt)).limit(300);
    res.json({ payments: rows, notice: "Metadata-only queue. Payer and provider evidence is available through separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/payment-transactions/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [payment] = await db.select({ id: paymentTransactions.id, claimId: paymentTransactions.claimId, claimReference: reports.reference,
      provider: paymentTransactions.provider, providerReference: paymentTransactions.providerReference, providerInvoiceId: paymentTransactions.providerInvoiceId,
      providerReceipt: paymentTransactions.providerReceipt, amountKes: paymentTransactions.amountKes, status: paymentTransactions.status,
      providerState: paymentTransactions.providerState, payerPhoneMasked: paymentTransactions.payerPhoneMasked,
      providerFeeKes: paymentTransactions.providerFeeKes, providerFeeVerifiedAt: paymentTransactions.providerFeeVerifiedAt,
      lastVerifiedAt: paymentTransactions.lastVerifiedAt, createdAt: paymentTransactions.createdAt, confirmedAt: paymentTransactions.confirmedAt,
      assessmentStatus: paymentAssessments.status })
      .from(paymentTransactions).innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).innerJoin(reports, eq(reports.id, claims.reportId))
      .innerJoin(paymentAssessments, eq(paymentAssessments.id, paymentTransactions.assessmentId)).where(eq(paymentTransactions.id, req.params.id)).limit(1);
    if (!payment) return res.status(404).json({ error: "Payment transaction not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payment_detail_viewed", resourceType: "payment_transaction", resourceId: payment.id, outcome: "success", metadata: { payerCiphertextExposed: false, payerPhoneMasked: true } });
    res.json({ payment });
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

financeRouter.get("/settlements", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: settlements.id, grossKes: settlements.grossKes, status: settlements.status,
      settleAt: settlements.settleAt, approvedAt: settlements.approvedAt, payoutInitiatedAt: settlements.payoutInitiatedAt,
      createdAt: settlements.createdAt }).from(settlements).orderBy(desc(settlements.createdAt)).limit(200);
    res.json({ settlements: rows, notice: "Metadata-only financial queue. Allocation and beneficiary details require separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/settlements/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [settlement] = await db.select({ id: settlements.id, claimId: settlements.claimId, finderUserId: settlements.finderUserId,
      agentUserId: settlements.agentUserId, grossKes: settlements.grossKes, finderKes: settlements.finderKes, agentKes: settlements.agentKes,
      platformKes: settlements.platformKes, finderPercent: settlements.finderPercent, agentPercent: settlements.agentPercent,
      platformPercent: settlements.platformPercent, allocationPolicyVersion: settlements.allocationPolicyVersion,
      allocationSnapshotAt: settlements.allocationSnapshotAt, allocationSnapshotSource: settlements.allocationSnapshotSource,
      status: settlements.status, settleAt: settlements.settleAt,
      approvedAt: settlements.approvedAt, approvedBy: settlements.approvedBy, approvalMode: settlements.approvalMode,
      payoutInitiatedAt: settlements.payoutInitiatedAt, createdAt: settlements.createdAt })
      .from(settlements).where(eq(settlements.id, req.params.id)).limit(1);
    if (!settlement) return res.status(404).json({ error: "Settlement not found" });
    const allocationReviews = await db.select({ id: settlementAllocationReviews.id, reviewedPolicyVersion: settlementAllocationReviews.reviewedPolicyVersion,
      snapshotFinderPercent: settlementAllocationReviews.snapshotFinderPercent, snapshotAgentPercent: settlementAllocationReviews.snapshotAgentPercent,
      snapshotPlatformPercent: settlementAllocationReviews.snapshotPlatformPercent, varianceDetected: settlementAllocationReviews.varianceDetected,
      reviewStatus: settlementAllocationReviews.reviewStatus, reviewedBy: settlementAllocationReviews.reviewedBy,
      reviewNote: settlementAllocationReviews.reviewNote, createdAt: settlementAllocationReviews.createdAt })
      .from(settlementAllocationReviews).where(eq(settlementAllocationReviews.settlementId, settlement.id)).orderBy(desc(settlementAllocationReviews.createdAt));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.settlement_detail_viewed", resourceType: "settlement", resourceId: settlement.id, outcome: "success", metadata: { allocationDetailsViewed: true, allocationReviewCount: allocationReviews.length } });
    res.json({ settlement: { ...settlement, allocationReviews } });
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
      if (claim) notifySafely({ userId: claim.claimantId, type: "payment_assessment", category: "financial", priority: "high", title: "A recovery-service assessment is ready", body: "Review the itemised KES assessment in your workspace. No payment has been requested or charged.", link: "/workspace", dedupeKey: `payment_assessment:${result.value.assessment.id}` });
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
    // Keep claimant consent, the assessment state change and its audit event in one
    // transaction. The lock order is report -> claim -> active assignment -> assessment,
    // matching the custody/release workflows and serializing against claim/assignment changes.
    const result = await db.transaction(async tx => {
      const [candidate] = await tx.select({ reportId: claims.reportId }).from(claims)
        .where(eq(claims.id, req.params.assessmentId ? sql`(select claim_id from payment_assessments where id = ${req.params.assessmentId})` : sql`null`))
        .limit(1);
      if (!candidate) return fail(404, "Assessment not found");

      const [report] = await tx.select({ id: reports.id }).from(reports)
        .where(eq(reports.id, candidate.reportId)).limit(1).for("update");
      if (!report) return fail(404, "Related report not found");

      const [claim] = await tx.select().from(claims)
        .where(eq(claims.id, sql`(select claim_id from payment_assessments where id = ${req.params.assessmentId})`))
        .limit(1).for("update");
      if (!claim || claim.reportId !== candidate.reportId || claim.claimantId !== req.auth!.id) {
        return fail(403, "Only the verified claimant may confirm this assessment");
      }
      if (claim.status !== "approved") return fail(409, "This assessment is not available for confirmation");

      const [assignment] = await tx.select({ agentId: assignments.agentId }).from(assignments)
        .where(and(eq(assignments.reportId, claim.reportId), eq(assignments.status, "assigned")))
        .limit(1).for("update");

      const [assessment] = await tx.select().from(paymentAssessments)
        .where(and(eq(paymentAssessments.id, req.params.assessmentId), eq(paymentAssessments.claimId, claim.id)))
        .limit(1).for("update");
      if (!assessment) return fail(404, "Assessment not found");
      if (assessment.status !== "awaiting_claimant_confirmation") {
        return fail(409, "This assessment is not available for confirmation");
      }

      const [inspection] = assignment ? await tx.select({ createdAt: custodyEvents.createdAt }).from(custodyEvents)
        .where(and(eq(custodyEvents.reportId, claim.reportId), eq(custodyEvents.agentId, assignment.agentId), eq(custodyEvents.eventType, "inspection_completed")))
        .orderBy(desc(custodyEvents.createdAt)).limit(1) : [undefined];
      const paymentWindowExpiresAt = inspection ? new Date(new Date(inspection.createdAt).getTime() + 24 * 60 * 60 * 1000) : null;
      const [updated] = await tx.update(paymentAssessments)
        .set({ status: "claimant_confirmed", confirmedBy: req.auth!.id, confirmedAt: new Date(), paymentWindowExpiresAt })
        .where(and(eq(paymentAssessments.id, assessment.id), eq(paymentAssessments.status, "awaiting_claimant_confirmation")))
        .returning();
      if (!updated) return fail(409, "Assessment has already changed; refresh and review the current status");

      await tx.insert(auditEvents).values({
        actorId: req.auth!.id,
        action: "finance.assessment_confirmed_by_claimant",
        resourceType: "payment_assessment",
        resourceId: assessment.id,
        outcome: "success",
        metadata: { amountKes: assessment.amountKes, currency: "KES" }
      });
      return succeed({ assessment: updated });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json({
      assessment: result.value.assessment,
      notice: "Your confirmation was recorded. The 24-hour payment window opens after the assigned Agent records physical receipt and completes the item inspection. No charge has been made."
    });
  } catch (error) { next(error); }
});

financeRouter.get("/reconciliation/matching-candidates", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(300).default(100), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid reconciliation candidate filters." });
    const result = await pool.query(`
      SELECT r.id AS reconciliation_item_id, r.external_reference AS provider_invoice_reference,
        r.internal_reference, r.amount_kes::text AS recorded_amount_kes,
        r.expected_amount_kes::text AS expected_amount_kes, r.provider_amount_kes::text AS provider_amount_kes,
        r.currency, r.reason_code, r.status AS review_status, r.created_at,
        p.id AS payment_transaction_id, p.status AS payment_status,
        p.provider_invoice_id, p.provider_reference, p.amount_kes::text AS transaction_amount_kes,
        p.confirmed_at,
        COALESCE(j.journal_count,0)::int AS journal_count,
        COALESCE(j.posting_count,0)::int AS posting_count,
        COALESCE(j.debit_kes,0)::numeric(14,2)::text AS journal_debit_kes,
        COALESCE(j.credit_kes,0)::numeric(14,2)::text AS journal_credit_kes,
        CASE
          WHEN p.id IS NULL THEN 'unlinked_transaction'
          WHEN p.provider_invoice_id IS DISTINCT FROM r.external_reference THEN 'invoice_reference_mismatch'
          WHEN p.status <> 'confirmed' THEN 'transaction_not_confirmed'
          WHEN r.expected_amount_kes IS NULL OR r.provider_amount_kes IS NULL OR p.amount_kes <> r.expected_amount_kes OR r.provider_amount_kes <> r.expected_amount_kes OR r.currency <> 'KES' THEN 'amount_or_currency_mismatch'
          WHEN COALESCE(j.journal_count,0) <> 1 THEN 'journal_missing_or_duplicated'
          WHEN COALESCE(j.posting_count,0) < 2 OR ABS(COALESCE(j.debit_kes,0)-COALESCE(j.credit_kes,0)) > 0.005 THEN 'journal_unbalanced_or_incomplete'
          ELSE 'candidate_supported'
        END AS candidate_state
      FROM reconciliation_items r
      LEFT JOIN payment_transactions p ON p.id::text = r.internal_reference AND p.provider = 'intasend'
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT fj.id) AS journal_count, COUNT(fp.id) AS posting_count,
          COALESCE(SUM(fp.debit_kes),0) AS debit_kes, COALESCE(SUM(fp.credit_kes),0) AS credit_kes
        FROM financial_journals fj LEFT JOIN financial_postings fp ON fp.journal_id=fj.id
        WHERE fj.source_type='collection' AND fj.source_id=p.id::text
      ) j ON p.id IS NOT NULL
      WHERE r.source='intasend_collection'
      ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`, [parsed.data.limit, parsed.data.offset]);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.reconciliation_candidates_viewed",
      resourceType: "reconciliation_queue", outcome: "success",
      metadata: { returnedCount: result.rows.length, limit: parsed.data.limit, offset: parsed.data.offset, mutationsPerformed: false } });
    res.json({ candidates: result.rows, page: { limit: parsed.data.limit, offset: parsed.data.offset },
      notice: "Read-only candidate assessment based on the transaction UUID recorded by the reconciliation writer, provider invoice binding, confirmed payment, KES amount and balanced collection journal. candidate_supported is not a reconciliation decision; no item, payment, journal or ledger status is changed." });
  } catch (error) { next(error); }
});

// Read-only evidence completeness summary. Missing evidence is surfaced, never inferred
// from aggregate balances; this endpoint cannot reconcile, approve or execute operations.
financeRouter.get("/evidence-completeness", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const [refunds, payouts] = await Promise.all([
      pool.query(`SELECT status, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE provider_reference IS NOT NULL AND provider_reference <> '')::int AS with_provider_reference,
        COUNT(*) FILTER (WHERE provider_outcome IS NOT NULL AND provider_outcome <> '')::int AS with_provider_outcome,
        COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)::int AS with_submission_time,
        COUNT(*) FILTER (WHERE reconciled_at IS NOT NULL AND reconciliation_evidence_ref IS NOT NULL AND reconciliation_note IS NOT NULL)::int AS with_complete_reconciliation_evidence
        FROM refund_requests GROUP BY status ORDER BY status`),
      pool.query(`SELECT pr.status, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE pr.provider_reference IS NOT NULL AND pr.provider_reference <> '')::int AS with_provider_reference,
        COUNT(*) FILTER (WHERE pr.provider_outcome IS NOT NULL AND pr.provider_outcome <> '')::int AS with_provider_outcome,
        COUNT(*) FILTER (WHERE pr.submitted_at IS NOT NULL)::int AS with_submission_time,
        COUNT(*) FILTER (WHERE pr.provider_confirmed_at IS NOT NULL)::int AS with_provider_confirmation_time,
        COUNT(*) FILTER (WHERE fj.id IS NOT NULL)::int AS with_payout_journal
        FROM payout_requests pr LEFT JOIN financial_journals fj ON fj.source_type='payout' AND fj.source_id=pr.id::text
        GROUP BY pr.status ORDER BY pr.status`)
    ]);
    await db.insert(auditEvents).values({ actorId: _req.auth!.id, action: "finance.evidence_completeness_viewed",
      resourceType: "finance_evidence_summary", outcome: "success",
      metadata: { refundStatusGroups: refunds.rows.length, payoutStatusGroups: payouts.rows.length, rowLevelPiiExposed: false } });
    res.json({ refunds: refunds.rows, payouts: payouts.rows,
      notice: "Metadata-only evidence completeness indicators. Counts do not establish provider authenticity, successful settlement, accounting completeness or legal sufficiency. No records are changed and no provider operation is initiated." });
  } catch (error) { next(error); }
});

financeRouter.get("/reconciliation/collections", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: reconciliationItems.id, amountKes: reconciliationItems.amountKes,
      varianceKes: reconciliationItems.varianceKes, currency: reconciliationItems.currency, reasonCode: reconciliationItems.reasonCode,
      status: reconciliationItems.status, createdAt: reconciliationItems.createdAt })
      .from(reconciliationItems).where(eq(reconciliationItems.source, "intasend_collection"))
      .orderBy(desc(reconciliationItems.createdAt)).limit(300);
    res.json({ items: rows, notice: "Metadata-only evidence queue. Provider references, notes and evidence are available through separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/reconciliation/collections/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [item] = await db.select({ id: reconciliationItems.id, source: reconciliationItems.source,
      externalReference: reconciliationItems.externalReference, internalReference: reconciliationItems.internalReference,
      amountKes: reconciliationItems.amountKes, expectedAmountKes: reconciliationItems.expectedAmountKes,
      providerAmountKes: reconciliationItems.providerAmountKes, varianceKes: reconciliationItems.varianceKes,
      currency: reconciliationItems.currency, reasonCode: reconciliationItems.reasonCode, status: reconciliationItems.status,
      reviewedBy: reconciliationItems.reviewedBy, reviewedAt: reconciliationItems.reviewedAt,
      resolutionNote: reconciliationItems.resolutionNote, evidenceRef: reconciliationItems.evidenceRef, createdAt: reconciliationItems.createdAt })
      .from(reconciliationItems).where(and(eq(reconciliationItems.id, req.params.id), eq(reconciliationItems.source, "intasend_collection"))).limit(1);
    if (!item) return res.status(404).json({ error: "Reconciliation item not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.reconciliation_detail_viewed", resourceType: "reconciliation_item", resourceId: item.id, outcome: "success", metadata: { providerEvidenceViewed: true } });
    res.json({ item });
  } catch (error) { next(error); }
});

financeRouter.post("/reconciliation/collections/:id/review", requireRole("finance", "admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.collection.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["keep_open", "resolve"]), note: z.string().trim().min(10).max(1500), evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A review decision, explanatory note and evidence reference are required" });
    const updated = await db.transaction(async tx => {
      const [existing] = await tx.select({ id: reconciliationItems.id }).from(reconciliationItems)
        .where(and(eq(reconciliationItems.id, req.params.id), eq(reconciliationItems.source, "intasend_collection"), eq(reconciliationItems.status, "unmatched"))).for("update");
      if (!existing) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.collection.review");
      const [row] = await tx.update(reconciliationItems).set({ status: parsed.data.decision === "resolve" ? "resolved" : "unmatched",
        reviewedBy: req.auth!.id, reviewedAt: new Date(), resolutionNote: parsed.data.note, evidenceRef: parsed.data.evidenceRef })
        .where(and(eq(reconciliationItems.id, existing.id), eq(reconciliationItems.source, "intasend_collection"), eq(reconciliationItems.status, "unmatched"))).returning();
      if (!row) throw new Error("Collection reconciliation item changed while locked");
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.collection_reconciliation_reviewed", resourceType: "reconciliation_item", resourceId: row.id,
        outcome: "success", metadata: { decision: parsed.data.decision, evidenceRecorded: true } });
      return row;
    });
    if (!updated) return res.status(404).json({ error: "An open collection reconciliation exception was not found" });
    res.json({ item: updated, notice: "Review recorded. This action does not alter payment confirmation, the ledger or a claimant balance." });
  } catch (error) { next(error); }
});

financeRouter.post("/collection-intents", requireRole("finance", "admin"), (_req, res) => {
  res.status(423).json({ error: "Use the claimant-owned payment-session endpoint. Collection remains disabled unless the IntaSend environment gate is explicitly enabled." });
});

financeRouter.post("/payout-requests", requireRole("finance", "admin"), (_req, res) => {
  res.status(423).json({ error: "Payout initiation is disabled. No real-money movement is authorised by this build." });
});

financeRouter.get("/refund-requests", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: refundRequests.id, paymentTransactionId: refundRequests.paymentTransactionId,
      amountKes: refundRequests.amountKes, status: refundRequests.status, destinationType: refundRequests.destinationType,
      approvedAt: refundRequests.approvedAt, submittedAt: refundRequests.submittedAt, reconciledAt: refundRequests.reconciledAt,
      createdAt: refundRequests.createdAt })
      .from(refundRequests).orderBy(desc(refundRequests.createdAt)).limit(200);
    res.json({ refunds: rows, notice: "Metadata-only refund queue. Reasons, provider references and reconciliation evidence require separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/refund-requests/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [refund] = await db.select({ id: refundRequests.id, paymentTransactionId: refundRequests.paymentTransactionId,
      amountKes: refundRequests.amountKes, reason: refundRequests.reason, destinationType: refundRequests.destinationType,
      destinationFingerprint: refundRequests.destinationFingerprint, status: refundRequests.status, requestedBy: refundRequests.requestedBy,
      reviewedBy: refundRequests.reviewedBy, approvedAt: refundRequests.approvedAt, executedBy: refundRequests.executedBy,
      providerReference: refundRequests.providerReference, providerBatchId: refundRequests.providerBatchId,
      providerTransactionId: refundRequests.providerTransactionId, providerOutcome: refundRequests.providerOutcome,
      submittedAt: refundRequests.submittedAt, reconciledAt: refundRequests.reconciledAt,
      reconciliationNote: refundRequests.reconciliationNote, reconciliationEvidenceRef: refundRequests.reconciliationEvidenceRef,
      createdAt: refundRequests.createdAt })
      .from(refundRequests).where(eq(refundRequests.id, req.params.id)).limit(1);
    if (!refund) return res.status(404).json({ error: "Refund request not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_detail_viewed", resourceType: "refund_request", resourceId: refund.id, outcome: "success", metadata: { reasonAndProviderEvidenceViewed: true } });
    res.json({ refund });
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
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", category: "financial", priority: "high", title: "A refund request is under review", body: "An administrator has recorded a refund request for your payment. This is not confirmation that a refund has been sent.", link: "/workspace", dedupeKey: `refund_requested:${refund.id}` });
    res.status(201).json({ refund, notice: "Refund requested for the original M-Pesa payer only. No provider request has been sent." });
  } catch (error) { next(error); }
});

financeRouter.post("/refund-requests/:id/approve", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.refund.approve")(req, res, next), async (req, res, next) => {
  try {
    const approval = await db.transaction(async tx => {
      const [refund] = await tx.select().from(refundRequests).where(eq(refundRequests.id, req.params.id)).for("update");
      if (!refund) return { kind: "missing" as const };
      if (!canApproveRefund(refund.requestedBy, req.auth!.id, refund.status, req.auth!.roles.includes("owner"))) return { kind: "ineligible" as const };
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.refund.approve");
      const [updated] = await tx.update(refundRequests).set({ status: "approved", reviewedBy: req.auth!.id, approvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(refundRequests.id, refund.id), eq(refundRequests.status, "requested"))).returning();
      if (!updated) return { kind: "ineligible" as const };
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_approved", resourceType: "refund_request", resourceId: refund.id,
        outcome: "success", metadata: { requesterIndependent: refund.requestedBy !== req.auth!.id, ownerFinalOverride: req.auth!.roles.includes("owner") && refund.requestedBy === req.auth!.id, destinationType: "original_payer" } });
      return { kind: "approved" as const, refund, updated };
    });
    if (approval.kind === "missing") return res.status(404).json({ error: "Refund request not found" });
    if (approval.kind !== "approved") return res.status(409).json({ error: "Approval requires a different administrator and a pending refund request" });
    const { refund, updated } = approval;
    const [refundClaim] = await db.select({ claimantId: claims.claimantId }).from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId))
      .innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).where(eq(refundRequests.id, refund.id)).limit(1);
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", category: "financial", priority: "high", title: "Your refund request was approved", body: "The refund request was approved for a separate provider submission. Approval is not confirmation that funds have been returned.", link: "/workspace", dedupeKey: `refund_approved:${refund.id}` });
    res.json({ refund: updated, notice: "Refund approval recorded. Submission is a separate controlled action." });
  } catch (error) { next(error); }
});

financeRouter.post("/refund-requests/:id/execute", requireRole("finance", "admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.refund.execute")(req, res, next), async (req, res, next) => {
  if (!intasendRefundEnabled()) return res.status(423).json({ error: "IntaSend refund submission is disabled. No provider request was sent." });
  try {
    const [refund] = await db.select({ id: refundRequests.id, paymentTransactionId: refundRequests.paymentTransactionId, amountKes: refundRequests.amountKes,
      requestedBy: refundRequests.requestedBy, approvedBy: refundRequests.reviewedBy, status: refundRequests.status, idempotencyKey: refundRequests.idempotencyKey,
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
      const [lockedRefund] = await tx.select().from(refundRequests).where(eq(refundRequests.id, refund.id)).limit(1).for("update");
      if (!lockedRefund || lockedRefund.status !== "approved" || lockedRefund.requestedBy === req.auth!.id || lockedRefund.reviewedBy === req.auth!.id ||
        lockedRefund.destinationType !== "original_payer" || lockedRefund.destinationFingerprint !== lockedRefund.originalPayerFingerprint) return null;
      const [lockedPayment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, lockedRefund.paymentTransactionId)).limit(1).for("update");
      if (!lockedPayment || lockedPayment.status !== "confirmed" || !lockedPayment.payerPhoneCiphertext ||
        lockedPayment.payerPhoneFingerprint !== lockedRefund.originalPayerFingerprint) return null;
      const [lockedClaim] = await tx.select({ id: claims.id, status: claims.status }).from(claims)
        .where(eq(claims.id, lockedPayment.claimId)).limit(1).for("update");
      if (!lockedClaim || lockedClaim.status === "completed") return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.refund.execute");
      const [row] = await tx.update(refundRequests).set({ status: "submitting", executedBy: req.auth!.id, submittedAt: new Date(), providerOutcome: "submitting", updatedAt: new Date() })
        .where(and(eq(refundRequests.id, refund.id), eq(refundRequests.status, "approved"))).returning();
      if (row) {
        await tx.insert(providerOperationOutbox).values({ operationType: "refund", resourceId: refund.id,
          idempotencyKey: lockedRefund.idempotencyKey, requestedBy: req.auth!.id, status: "reserved" });
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_submission_reserved", resourceType: "refund_request",
          resourceId: refund.id, outcome: "success", metadata: { providerCallPending: true, durableOutboxRecorded: true } });
      }
      if (row && refund.assessmentId) await tx.update(paymentAssessments).set({ status: "refunding" }).where(eq(paymentAssessments.id, refund.assessmentId));
      return row;
    });
    if (!reserved) return res.status(409).json({ error: "Refund submission was already reserved or the request changed" });
    await db.update(providerOperationOutbox).set({ status: "dispatching", attemptCount: sql`${providerOperationOutbox.attemptCount} + 1`, dispatchStartedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(providerOperationOutbox.idempotencyKey, refund.idempotencyKey), eq(providerOperationOutbox.status, "reserved")));
    const provider = await initiateIntaSendRefund({ payerPhoneCiphertext: refund.payerPhoneCiphertext, amountKes: String(refund.amountKes), claimReference: refund.claimReference, idempotencyKey: refund.idempotencyKey });
    const [updated] = await db.update(refundRequests).set({ status: provider.outcome, providerOutcome: provider.outcome,
      providerBatchId: provider.providerBatchId, providerTransactionId: provider.providerTransactionId,
      providerReference: provider.providerBatchId ?? provider.providerTransactionId, updatedAt: new Date() })
      .where(and(eq(refundRequests.id, refund.id), eq(refundRequests.status, "submitting"))).returning();
    await db.update(providerOperationOutbox).set({ status: provider.outcome, providerReference: provider.providerBatchId ?? provider.providerTransactionId,
      httpStatus: provider.httpStatus, updatedAt: new Date() }).where(eq(providerOperationOutbox.idempotencyKey, refund.idempotencyKey));
    if (provider.outcome === "rejected" && refund.assessmentId) await db.update(paymentAssessments).set({ status: "paid" }).where(eq(paymentAssessments.id, refund.assessmentId));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.refund_provider_submission", resourceType: "refund_request", resourceId: refund.id,
      outcome: provider.outcome, metadata: { httpStatus: provider.httpStatus, providerReferenceRecorded: !!provider.providerBatchId || !!provider.providerTransactionId } });
    const [refundClaim] = await db.select({ claimantId: claims.claimantId }).from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId))
      .innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).where(eq(refundRequests.id, refund.id)).limit(1);
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", category: "financial", priority: "high", title: "Your refund submission status changed",
      body: provider.outcome === "unknown" ? "The provider may have accepted the refund request, but completion is not confirmed. Do not make another payment or refund request; reconciliation is required." : "The provider refused the refund initiation. No refund completion is recorded.", link: "/workspace", dedupeKey: `refund_submitted:${refund.id}:${provider.outcome}` });
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
      await tx.update(providerOperationOutbox).set({ status: parsed.data.outcome === "unknown" ? "unknown" : "reconciled",
        resolvedAt: parsed.data.outcome === "unknown" ? null : new Date(), updatedAt: new Date() })
        .where(and(eq(providerOperationOutbox.resourceId, refund.id), eq(providerOperationOutbox.operationType, "refund")));
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
    if (refundClaim) notifySafely({ userId: refundClaim.claimantId, type: "refund_update", category: "financial", priority: "high", title: result.status === "refunded" ? "Your refund was confirmed" : "Your refund status was updated",
      body: result.status === "refunded" ? "Independent reconciliation confirmed the refund. Your original item handover record remains unchanged." : "An administrator updated the refund review. Check your workspace for the current status.", link: "/workspace", dedupeKey: `refund_reconciled:${result.id}:${result.status}` });
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
    const rows = await db.select({ id: payoutDestinations.id, status: payoutDestinations.status,
      createdAt: payoutDestinations.createdAt }).from(payoutDestinations)
      .where(eq(payoutDestinations.status, "pending")).orderBy(asc(payoutDestinations.createdAt)).limit(200);
    res.json({ destinations: rows, notice: "Metadata-only verification queue. Beneficiary identity and masked destination require separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/payout-destinations/:id/admin-detail", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [destination] = await db.select({ id: payoutDestinations.id, userId: payoutDestinations.userId,
      method: payoutDestinations.method, phoneMasked: payoutDestinations.phoneMasked, status: payoutDestinations.status,
      verifiedBy: payoutDestinations.verifiedBy, verifiedAt: payoutDestinations.verifiedAt,
      evidenceRef: payoutDestinations.evidenceRef, createdAt: payoutDestinations.createdAt })
      .from(payoutDestinations).where(eq(payoutDestinations.id, req.params.id)).limit(1);
    if (!destination) return res.status(404).json({ error: "Payout destination not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_destination_detail_viewed", resourceType: "payout_destination", resourceId: destination.id, outcome: "success", metadata: { phoneMaskedOnly: true, ciphertextExposed: false } });
    res.json({ destination });
  } catch (error) { next(error); }
});

financeRouter.get("/payout-destinations/:id/verification-history", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const rows = await db.select({ id: payoutDestinationVerificationEvents.id, outcome: payoutDestinationVerificationEvents.outcome,
      evidenceReferenceHash: payoutDestinationVerificationEvents.evidenceReferenceHash, note: payoutDestinationVerificationEvents.note,
      verifierUserId: payoutDestinationVerificationEvents.verifierUserId, verifiedAt: payoutDestinationVerificationEvents.verifiedAt })
      .from(payoutDestinationVerificationEvents).where(eq(payoutDestinationVerificationEvents.payoutDestinationId, req.params.id))
      .orderBy(desc(payoutDestinationVerificationEvents.verifiedAt));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_destination_verification_history_viewed", resourceType: "payout_destination",
      resourceId: req.params.id, outcome: "success", metadata: { eventCount: rows.length, rawEvidenceReferenceExposed: false } });
    res.json({ events: rows });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-destinations/:id/verify", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.payout_destination.verify")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ evidenceRef: z.string().trim().min(4).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Verification evidence reference is required" });
    const destination = await db.transaction(async tx => {
      const [pending] = await tx.select().from(payoutDestinations).where(and(eq(payoutDestinations.id, req.params.id), eq(payoutDestinations.status, "pending"))).limit(1).for("update");
      if (!pending || pending.userId === req.auth!.id) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.payout_destination.verify");
      const [updated] = await tx.update(payoutDestinations).set({ status: "verified", verifiedBy: req.auth!.id, verifiedAt: new Date(), evidenceRef: parsed.data.evidenceRef, updatedAt: new Date() })
        .where(and(eq(payoutDestinations.id, pending.id), eq(payoutDestinations.status, "pending"))).returning();
      if (!updated) return null;
      await tx.insert(payoutDestinationVerificationEvents).values({ payoutDestinationId: updated.id, beneficiaryUserId: updated.userId,
        verifierUserId: req.auth!.id, outcome: "verified", evidenceReferenceHash: createHash("sha256").update(parsed.data.evidenceRef).digest("hex"),
        note: "Manual beneficiary destination verification recorded; source evidence reference is retained on the destination record." });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_destination_verified", resourceType: "payout_destination", resourceId: updated.id,
        outcome: "success", metadata: { evidenceRecorded: true, phoneMasked: true } });
      return updated;
    });
    if (!destination) return res.status(404).json({ error: "Pending payout destination not found" });
    notifySafely({ userId: destination.userId, type: "payout_destination", category: "financial", priority: "high", title: "Your payout destination was verified", body: "Your M-Pesa payout destination was verified. A 48-hour cooling period applies before it can be used for a payout.", link: "/workspace", dedupeKey: `payout_destination_verified:${destination.id}` });
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

financeRouter.get("/reward-authorizations", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: rewardAuthorizations.id, claimId: rewardAuthorizations.claimId,
      grossKes: rewardAuthorizations.grossKes, status: rewardAuthorizations.status,
      createdAt: rewardAuthorizations.createdAt, verifiedAt: rewardAuthorizations.verifiedAt })
      .from(rewardAuthorizations).orderBy(desc(rewardAuthorizations.createdAt)).limit(200);
    res.json({ authorizations: rows, notice: "Metadata-only funding queue. Sponsor/source/evidence details require separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/reward-authorizations/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [authorization] = await db.select({ id: rewardAuthorizations.id, claimId: rewardAuthorizations.claimId,
      grossKes: rewardAuthorizations.grossKes, fundingSource: rewardAuthorizations.fundingSource,
      sourceReference: rewardAuthorizations.sourceReference, evidenceRef: rewardAuthorizations.evidenceRef,
      status: rewardAuthorizations.status, createdBy: rewardAuthorizations.createdBy, verifiedBy: rewardAuthorizations.verifiedBy,
      verifiedAt: rewardAuthorizations.verifiedAt, createdAt: rewardAuthorizations.createdAt })
      .from(rewardAuthorizations).where(eq(rewardAuthorizations.id, req.params.id)).limit(1);
    if (!authorization) return res.status(404).json({ error: "Reward authorization not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.reward_authorization_detail_viewed", resourceType: "reward_authorization", resourceId: authorization.id, outcome: "success", metadata: { fundingEvidenceViewed: true } });
    res.json({ authorization });
  } catch (error) { next(error); }
});

financeRouter.post("/reward-authorizations/:id/verify", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.reward.verify")(req, res, next), async (req, res, next) => {
  try {
    const settlement = await verifyRewardAuthorizationAndCreateSettlement(req.params.id, req.auth!.id, tx => consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.reward.verify"));
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

financeRouter.get("/payout-requests", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const rows = await db.select({ id: payoutRequests.id, settlementId: payoutRequests.settlementId,
      amountKes: payoutRequests.amountKes, status: payoutRequests.status, providerConfirmedAt: payoutRequests.providerConfirmedAt,
      createdAt: payoutRequests.createdAt })
      .from(payoutRequests).orderBy(desc(payoutRequests.createdAt)).limit(300);
    res.json({ payoutRequests: rows, notice: "Metadata-only payout queue. Beneficiary, destination fingerprint and provider evidence require separately audited detail access." });
  } catch (error) { next(error); }
});

financeRouter.get("/payout-requests/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [payoutRequest] = await db.select({ id: payoutRequests.id, settlementId: payoutRequests.settlementId,
      beneficiaryUserId: payoutRequests.beneficiaryUserId, amountKes: payoutRequests.amountKes,
      destinationFingerprint: payoutRequests.destinationFingerprint, status: payoutRequests.status,
      createdBy: payoutRequests.createdBy, initiatedBy: payoutRequests.initiatedBy, approvedBy: payoutRequests.approvedBy,
      executedBy: payoutRequests.executedBy, providerReference: payoutRequests.providerReference,
      providerBatchId: payoutRequests.providerBatchId, providerTransactionId: payoutRequests.providerTransactionId,
      providerOutcome: payoutRequests.providerOutcome, providerFeeKes: payoutRequests.providerFeeKes,
      providerFeeVerifiedAt: payoutRequests.providerFeeVerifiedAt, submittedAt: payoutRequests.submittedAt,
      providerConfirmedAt: payoutRequests.providerConfirmedAt, createdAt: payoutRequests.createdAt, updatedAt: payoutRequests.updatedAt })
      .from(payoutRequests).where(eq(payoutRequests.id, req.params.id)).limit(1);
    if (!payoutRequest) return res.status(404).json({ error: "Payout request not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_detail_viewed", resourceType: "payout_request", resourceId: payoutRequest.id, outcome: "success", metadata: { destinationCiphertextExposed: false, beneficiaryMetadataViewed: true } });
    res.json({ payoutRequest });
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

financeRouter.post("/payout-requests/:id/approve", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.payout.approve")(req, res, next), async (req, res, next) => {
  try {
    const approval = await db.transaction(async tx => {
      const [request] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, req.params.id)).for("update");
      if (!request || request.status !== "draft" || (request.createdBy === req.auth!.id && !req.auth!.roles.includes("owner"))) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.finance.payout.approve");
      const [updated] = await tx.update(payoutRequests).set({ status: "approved", approvedBy: req.auth!.id, updatedAt: new Date() })
        .where(and(eq(payoutRequests.id, request.id), eq(payoutRequests.status, "draft"))).returning();
      if (!updated) return null;
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_request_approved", resourceType: "payout_request", resourceId: request.id,
        outcome: "success", metadata: { makerChecker: request.createdBy !== req.auth!.id, ownerFinalOverride: req.auth!.roles.includes("owner") && request.createdBy === req.auth!.id } });
      return { request, updated };
    });
    if (!approval) return res.status(409).json({ error: "A different administrator or the Super Admin (Owner) must approve a draft payout request" });
    const { request, updated } = approval;
    res.json({ payoutRequest: { id: updated.id, status: updated.status, approvedBy: updated.approvedBy }, notice: "Payout request approved. Execution remains a separate manually authorised action." });
  } catch (error) { next(error); }
});

financeRouter.post("/payout-requests/:id/execute", requireRole("finance", "admin"), (req, res, next) => requireStepUpInTransaction("admin.finance.payout.execute")(req, res, next), async (req, res, next) => {
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
      await consumeStepUpGrantWithPgClient(reservationClient, req.auth!, "admin.finance.payout.execute");
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
      await reservationClient.query(`INSERT INTO provider_operation_outbox(operation_type,resource_id,idempotency_key,requested_by,status)
        VALUES('payout',$1,$2,$3,'reserved')`, [p.id, p.idempotency_key, req.auth!.id]);
      await reservationClient.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata)
        VALUES($1,'finance.payout_submission_reserved','payout_request',$2,'success',jsonb_build_object('providerCallPending',true,'durableOutboxRecorded',true))`, [req.auth!.id, p.id]);
      await reservationClient.query("COMMIT");
      reserved = true;
    } catch (error) { await reservationClient.query("ROLLBACK"); throw error; }
    finally { reservationClient.release(); }
    if (!reserved) return res.status(409).json({ error: "Payout request already reserved or changed; do not retry" });
    await pool.query(`UPDATE provider_operation_outbox SET status='dispatching',attempt_count=attempt_count+1,dispatch_started_at=now(),updated_at=now()
      WHERE idempotency_key=$1 AND status='reserved'`, [p.idempotency_key]);
    const provider = await initiateIntaSendPayout({ destinationCiphertext: p.destination_ciphertext, amountKes: String(p.amount_kes), claimReference: p.claim_reference, payoutRequestId: p.idempotency_key });
    const nextStatus = provider.outcome === "accepted" ? "accepted" : provider.outcome;
    const [updated] = await db.update(payoutRequests).set({ status: nextStatus, providerOutcome: provider.outcome,
      providerBatchId: provider.trackingId, providerTransactionId: provider.transactionId, providerReference: provider.trackingId ?? provider.transactionId,
      updatedAt: new Date() }).where(and(eq(payoutRequests.id, p.id), eq(payoutRequests.status, "submitting"))).returning();
    await db.update(providerOperationOutbox).set({ status: provider.outcome, providerReference: provider.trackingId ?? provider.transactionId,
      httpStatus: provider.httpStatus, updatedAt: new Date() }).where(eq(providerOperationOutbox.idempotencyKey, p.idempotency_key));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_provider_submission", resourceType: "payout_request", resourceId: p.id,
      outcome: provider.outcome, metadata: { httpStatus: provider.httpStatus, trackingReferenceRecorded: !!provider.trackingId, transactionBound: !!provider.transactionId } });
    notifySafely({ userId: p.beneficiary_user_id, type: "payout_update", category: "financial", priority: "high", title: "Your reward payout was submitted", body: provider.outcome === "accepted" ? "The provider accepted the payout request. The transfer is not yet confirmed." : provider.outcome === "unknown" ? "The payout outcome is unresolved. Do not request another payout; reconciliation is required." : "The provider refused the payout initiation. No payout completion is recorded.", link: "/workspace", dedupeKey: `payout_submitted:${p.id}:${provider.outcome}` });
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
        await tx.update(providerOperationOutbox).set({ status: "reconciled", resolvedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(providerOperationOutbox.resourceId, locked.id), eq(providerOperationOutbox.operationType, "payout")));
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_provider_confirmed", resourceType: "payout_request", resourceId: locked.id,
          outcome: "success", metadata: { providerStatus: provider.providerStatus, providerFeeRecorded: !!provider.providerFeeKes } });
      });
    } else if (provider.verdict === "failed" || provider.verdict === "cancelled") {
      await db.update(payoutRequests).set({ status: "rejected", providerOutcome: provider.verdict, updatedAt: new Date() })
        .where(and(eq(payoutRequests.id, request.id), inArray(payoutRequests.status, ["accepted", "unknown"])));
      await db.update(providerOperationOutbox).set({ status: "reconciled", resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(providerOperationOutbox.resourceId, request.id), eq(providerOperationOutbox.operationType, "payout")));
    } else if (provider.verdict === "in_progress") {
      await db.update(payoutRequests).set({ status: "accepted", providerOutcome: "in_progress", updatedAt: new Date() })
        .where(and(eq(payoutRequests.id, request.id), inArray(payoutRequests.status, ["accepted", "unknown"])));
    }
    const [updated] = await db.select({ id: payoutRequests.id, status: payoutRequests.status, providerOutcome: payoutRequests.providerOutcome,
      providerConfirmedAt: payoutRequests.providerConfirmedAt, beneficiaryUserId: payoutRequests.beneficiaryUserId }).from(payoutRequests).where(eq(payoutRequests.id, request.id)).limit(1);
    if (updated?.status === "completed") notifySafely({ userId: updated.beneficiaryUserId, type: "payout_update", category: "financial", priority: "high", title: "Your reward payout was confirmed", body: "The provider confirmed your reward payout. Review the payout record in your workspace.", link: "/workspace", dedupeKey: `payout_confirmed:${updated.id}` });
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
      await tx.update(providerOperationOutbox).set({ status: parsed.data.outcome === "unknown" ? "unknown" : "reconciled",
        resolvedAt: parsed.data.outcome === "unknown" ? null : new Date(), updatedAt: new Date() })
        .where(and(eq(providerOperationOutbox.resourceId, request.id), eq(providerOperationOutbox.operationType, "payout")));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "finance.payout_manually_reconciled", resourceType: "payout_request", resourceId: request.id,
        outcome: "success", metadata: { providerEvidenceOutcome: parsed.data.outcome, evidenceRecorded: true, retryPermitted: false } });
      return updated;
    });
    if (!result) return res.status(409).json({ error: "Payout cannot be reconciled by this administrator in its current state" });
    const [beneficiary] = await db.select({ userId: payoutRequests.beneficiaryUserId }).from(payoutRequests).where(eq(payoutRequests.id, result.id)).limit(1);
    if (beneficiary) notifySafely({ userId: beneficiary.userId, type: "payout_update", category: "financial", priority: "high", title: "Your reward payout status was updated", body: result.status === "completed" ? "Independent reconciliation confirmed your reward payout." : "An administrator updated the payout reconciliation record. No automatic retry was made.", link: "/workspace", dedupeKey: `payout_reconciled:${result.id}:${result.status}` });
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
