import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, claims, communicationConsents, dataRightsRequests, notificationPreferences, notifications, paymentTransactions, thirdPartyPayerAuthorizations, payoutDestinations, payoutRequests, refundRequests, reports, userRoles, users } from "../db/schema.js";
import { authenticate, requireRole, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { notifySafely } from "../services/notifications.js";
import { z } from "zod";

export const privacyRouter = Router();
privacyRouter.use(authenticate);

privacyRouter.get("/export", async (req, res, next) => {
  try {
    const userId = req.auth!.id;
    const [profile] = await db.select({ id: users.id, email: users.email, fullName: users.fullName, phoneMasked: users.phoneMasked,
      emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
    const [roles, ownReports, ownClaims, payments, payerAuthorizations, refunds, payouts, destinations, ownNotifications, rightsRequests, preferences, consents] = await Promise.all([
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
      db.select({ id: thirdPartyPayerAuthorizations.id, paymentTransactionId: thirdPartyPayerAuthorizations.paymentTransactionId,
        payerRelationship: thirdPartyPayerAuthorizations.payerRelationship, consentConfirmed: thirdPartyPayerAuthorizations.consentConfirmed,
        consentPolicyVersion: thirdPartyPayerAuthorizations.consentPolicyVersion, consentTextHash: thirdPartyPayerAuthorizations.consentTextHash,
        attestedAt: thirdPartyPayerAuthorizations.attestedAt, revokedAt: thirdPartyPayerAuthorizations.revokedAt })
        .from(thirdPartyPayerAuthorizations).where(eq(thirdPartyPayerAuthorizations.claimantUserId, userId)).orderBy(desc(thirdPartyPayerAuthorizations.createdAt)),
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
        .from(dataRightsRequests).where(eq(dataRightsRequests.userId, userId)).orderBy(desc(dataRightsRequests.createdAt)),
      db.select({ inAppCommunityUpdates: notificationPreferences.inAppCommunityUpdates, emailCommunityUpdates: notificationPreferences.emailCommunityUpdates,
        smsCommunityUpdates: notificationPreferences.smsCommunityUpdates, updatedAt: notificationPreferences.updatedAt })
        .from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1),
      db.select({ channel: communicationConsents.channel, purpose: communicationConsents.purpose, status: communicationConsents.status,
        policyVersion: communicationConsents.policyVersion, consentTextHash: communicationConsents.consentTextHash,
        grantedAt: communicationConsents.grantedAt, revokedAt: communicationConsents.revokedAt, createdAt: communicationConsents.createdAt })
        .from(communicationConsents).where(eq(communicationConsents.userId, userId)).orderBy(desc(communicationConsents.createdAt))
    ]);
    await db.insert(auditEvents).values({ actorId: userId, action: "privacy.personal_data_exported", resourceType: "user", resourceId: userId,
      outcome: "success", metadata: { reports: ownReports.length, claims: ownClaims.length, paymentRecords: payments.length, communicationConsentRecords: consents.length, filesIncluded: false } });
    res.json({ generatedAt: new Date().toISOString(), profile, roles, reports: ownReports, claims: ownClaims, payments, refunds, payouts,
      payoutDestinations: destinations, thirdPartyPayerAuthorizations: payerAuthorizations, notifications: ownNotifications, notificationPreferences: preferences[0] ?? null,
      communicationConsents: consents, dataRightsRequests: rightsRequests,
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

// The queue is deliberately metadata-only. Request narratives and reviewer notes are
// fetched through a separately audited detail endpoint when an authorised reviewer opens a case.
privacyRouter.get("/requests", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({
      status: z.enum(["received", "under_review", "fulfilled", "declined"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).max(100000).default(0)
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid privacy queue filters" });
    const filters = parsed.data.status ? [eq(dataRightsRequests.status, parsed.data.status)] : [];
    const where = filters.length ? and(...filters) : undefined;
    const [rows, [total]] = await Promise.all([
      db.select({ id: dataRightsRequests.id, requestType: dataRightsRequests.requestType,
        status: dataRightsRequests.status, createdAt: dataRightsRequests.createdAt,
        updatedAt: dataRightsRequests.updatedAt, resolvedAt: dataRightsRequests.resolvedAt })
        .from(dataRightsRequests).where(where).orderBy(desc(dataRightsRequests.createdAt))
        .limit(parsed.data.limit).offset(parsed.data.offset),
      db.select({ value: sql<number>`count(*)::int` }).from(dataRightsRequests).where(where)
    ]);
    res.json({ requests: rows, page: { limit: parsed.data.limit, offset: parsed.data.offset,
      total: total?.value ?? 0, hasMore: parsed.data.offset + rows.length < Number(total?.value ?? 0) } });
  } catch (error) { next(error); }
});

privacyRouter.get("/requests/:id", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [request] = await db.select({ id: dataRightsRequests.id, requestType: dataRightsRequests.requestType,
      details: dataRightsRequests.details, status: dataRightsRequests.status, reviewNote: dataRightsRequests.reviewNote,
      reviewedBy: dataRightsRequests.reviewedBy, createdAt: dataRightsRequests.createdAt,
      updatedAt: dataRightsRequests.updatedAt, resolvedAt: dataRightsRequests.resolvedAt })
      .from(dataRightsRequests).where(eq(dataRightsRequests.id, req.params.id)).limit(1);
    if (!request) return res.status(404).json({ error: "Privacy request not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.data_rights_request_detail_viewed",
      resourceType: "data_rights_request", resourceId: request.id, outcome: "success",
      metadata: { requestType: request.requestType } });
    res.json({ request, notice: "Access to this privacy-request narrative has been recorded." });
  } catch (error) { next(error); }
});

privacyRouter.post("/requests/:id/decision", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.privacy.request.decide")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["under_review", "fulfilled", "declined"]), reviewNote: z.string().trim().min(10).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A decision and documented review note are required" });
    const outcome = await db.transaction(async tx => {
      const [current] = await tx.select().from(dataRightsRequests).where(eq(dataRightsRequests.id, req.params.id)).limit(1).for("update");
      if (!current || !["received", "under_review"].includes(current.status)) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.privacy.request.decide");
      const [request] = await tx.update(dataRightsRequests).set({ status: parsed.data.status, reviewedBy: req.auth!.id,
        reviewNote: parsed.data.reviewNote, updatedAt: new Date(), resolvedAt: parsed.data.status === "fulfilled" || parsed.data.status === "declined" ? new Date() : null })
        .where(and(eq(dataRightsRequests.id, current.id), sql`status IN ('received','under_review')`)).returning();
      if (!request) return null;
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.data_rights_request_decided", resourceType: "data_rights_request", resourceId: request.id,
        outcome: "success", metadata: { requestType: request.requestType, status: request.status } });
      return request;
    });
    if (!outcome) return res.status(404).json({ error: "Open data-rights request not found" });
    const updated = outcome;
    notifySafely({ userId: updated.userId, type: "privacy_request_update", title: "Your privacy request was updated",
      body: `Your ${updated.requestType} request status is ${updated.status}. Review the note in your privacy workspace.`, link: "/workspace", dedupeKey: `privacy_request:${updated.id}:${updated.status}` });
    res.json({ request: updated, notice: "Decision recorded. Erasure is never automatic; applicable financial, safety and legal retention requirements must be reviewed." });
  } catch (error) { next(error); }
});
