import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, claims, dataRightsRequests, notifications, paymentTransactions, payoutDestinations, payoutRequests, refundRequests, reports, userRoles, users } from "../db/schema.js";
import { authenticate, requireRole } from "../security.js";
import { notifySafely } from "../services/notifications.js";
import { z } from "zod";

export const privacyRouter = Router();
privacyRouter.use(authenticate);

privacyRouter.get("/export", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const [profile] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phoneMasked: users.phoneMasked,
      emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
    const [roles, ownReports, ownClaims, payments, refunds, payouts, destinations, ownNotifications, rightsRequests] = await Promise.all([
      db.select({ role: userRoles.role, grantedAt: userRoles.grantedAt }).from(userRoles).where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt))),
      db.select({ id: reports.id, reference: reports.reference, kind: reports.kind, category: reports.category, itemDescription: reports.itemDescription,
        county: reports.county, approximateLocation: reports.approximateLocation, incidentDate: reports.incidentDate, status: reports.status,
        publicListingConsent: reports.publicListingConsent, createdAt: reports.createdAt, updatedAt: reports.updatedAt })
        .from(reports).where(eq(reports.reporterId, userId)).orderBy(desc(reports.createdAt)),
      db.select({ id: claims.id, reportId: claims.reportId, status: claims.status, createdAt: claims.createdAt, updatedAt: claims.updatedAt })
        .from(claims).where(eq(claims.claimantId, userId)).orderBy(desc(claims.createdAt)),
      db.select({ id: paymentTransactions.id, claimId: paymentTransactions.claimId, assessmentId: paymentTransactions.assessmentId,
        amountKes: paymentTransactions.amountKes, status: paymentTransactions.status, provider: paymentTransactions.provider,
        providerState: paymentTransactions.providerState, providerInvoiceId: paymentTransactions.providerInvoiceId,
        payerPhoneMasked: paymentTransactions.payerPhoneMasked, createdAt: paymentTransactions.createdAt, confirmedAt: paymentTransactions.confirmedAt })
        .from(paymentTransactions).innerJoin(claims, eq(claims.id, paymentTransactions.claimId)).where(eq(claims.claimantId, userId)).orderBy(desc(paymentTransactions.createdAt)),
      db.select({ id: refundRequests.id, paymentTransactionId: refundRequests.paymentTransactionId, amountKes: refundRequests.amountKes,
        status: refundRequests.status, providerOutcome: refundRequests.providerOutcome, providerReference: refundRequests.providerReference,
        createdAt: refundRequests.createdAt, providerConfirmedAt: refundRequests.providerConfirmedAt })
        .from(refundRequests).innerJoin(paymentTransactions, eq(paymentTransactions.id, refundRequests.paymentTransactionId)).innerJoin(claims, eq(claims.id, paymentTransactions.claimId))
        .where(eq(claims.claimantId, userId)).orderBy(desc(refundRequests.createdAt)),
      db.select({ id: payoutRequests.id, settlementId: payoutRequests.settlementId, amountKes: payoutRequests.amountKes, status: payoutRequests.status,
        providerOutcome: payoutRequests.providerOutcome, providerReference: payoutRequests.providerReference, createdAt: payoutRequests.createdAt,
        providerConfirmedAt: payoutRequests.providerConfirmedAt }).from(payoutRequests).where(eq(payoutRequests.beneficiaryUserId, userId)).orderBy(desc(payoutRequests.createdAt)),
      db.select({ id: payoutDestinations.id, method: payoutDestinations.method, phoneMasked: payoutDestinations.phoneMasked, status: payoutDestinations.status,
        verifiedAt: payoutDestinations.verifiedAt, createdAt: payoutDestinations.createdAt }).from(payoutDestinations).where(eq(payoutDestinations.userId, userId)).orderBy(desc(payoutDestinations.createdAt)),
      db.select({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body, readAt: notifications.readAt, createdAt: notifications.createdAt })
        .from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)),
      db.select({ id: dataRightsRequests.id, requestType: dataRightsRequests.requestType, details: dataRightsRequests.details, status: dataRightsRequests.status,
        reviewNote: dataRightsRequests.reviewNote, createdAt: dataRightsRequests.createdAt, resolvedAt: dataRightsRequests.resolvedAt })
        .from(dataRightsRequests).where(eq(dataRightsRequests.userId, userId)).orderBy(desc(dataRightsRequests.createdAt))
    ]);
    await db.insert(auditEvents).values({ actorId: userId, action: "privacy.personal_data_exported", resourceType: "user", resourceId: userId,
      outcome: "success", metadata: { reports: ownReports.length, claims: ownClaims.length, paymentRecords: payments.length, filesIncluded: false } });
    res.json({ generatedAt: new Date().toISOString(), profile, roles, reports: ownReports, claims: ownClaims, payments, refunds, payouts,
      payoutDestinations: destinations, notifications: ownNotifications, dataRightsRequests: rightsRequests,
      exclusions: ["Raw identity/KYC documents and uploaded file bytes", "Encryption keys, ciphertext and internal HMAC fingerprints", "Other users' information", "Internal fraud/security investigation notes"] });
  } catch (error) { next(error); }
});

privacyRouter.post("/requests", async (req, res, next) => {
  try {
    const parsed = z.object({ requestType: z.enum(["access", "rectification", "erasure", "restriction"]), details: z.string().trim().min(10).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a data-rights request type and provide details" });
    const [request] = await db.insert(dataRightsRequests).values({ userId: req.auth!.id, requestType: parsed.data.requestType, details: parsed.data.details }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.data_rights_request_created", resourceType: "data_rights_request", resourceId: request.id,
      outcome: "success", metadata: { requestType: request.requestType } });
    res.status(201).json({ request, notice: "Your request was recorded for review. No data was automatically deleted or changed." });
  } catch (error) { next(error); }
});

privacyRouter.get("/requests/mine", async (req, res, next) => {
  try {
    const rows = await db.select().from(dataRightsRequests).where(eq(dataRightsRequests.userId, req.auth!.id)).orderBy(desc(dataRightsRequests.createdAt)).limit(100);
    res.json({ requests: rows });
  } catch (error) { next(error); }
});

privacyRouter.get("/requests", requireRole("admin", "owner", "trust_safety"), async (_req, res, next) => {
  try {
    const rows = await db.select().from(dataRightsRequests).orderBy(desc(dataRightsRequests.createdAt)).limit(300);
    res.json({ requests: rows });
  } catch (error) { next(error); }
});

privacyRouter.post("/requests/:id/decision", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["under_review", "fulfilled", "declined"]), reviewNote: z.string().trim().min(10).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A decision and documented review note are required" });
    const updated = await db.transaction(async tx => {
      const [request] = await tx.update(dataRightsRequests).set({ status: parsed.data.status, reviewedBy: req.auth!.id,
        reviewNote: parsed.data.reviewNote, updatedAt: new Date(), resolvedAt: parsed.data.status === "fulfilled" || parsed.data.status === "declined" ? new Date() : null })
        .where(and(eq(dataRightsRequests.id, req.params.id), sql`status IN ('received','under_review')`)).returning();
      if (!request) return null;
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.data_rights_request_decided", resourceType: "data_rights_request", resourceId: request.id,
        outcome: "success", metadata: { requestType: request.requestType, status: request.status } });
      return request;
    });
    if (!updated) return res.status(404).json({ error: "Open data-rights request not found" });
    notifySafely({ userId: updated.userId, type: "privacy_request_update", title: "Your privacy request was updated",
      body: `Your ${updated.requestType} request status is ${updated.status}. Review the note in your privacy workspace.`, link: "/workspace" });
    res.json({ request: updated, notice: "Decision recorded. Erasure is never automatic; applicable financial, safety and legal retention requirements must be reviewed." });
  } catch (error) { next(error); }
});
