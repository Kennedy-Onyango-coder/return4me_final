import { Router } from "express";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, claimAppeals, claimEvidence, claims, documents, reports } from "../db/schema.js";
import { authenticate, requireRole } from "../security.js";
import { notifySafely } from "../services/notifications.js";
import { canTransitionClaim, type ClaimStatus } from "../../shared/workflow-policy.js";
import { canApproveClaimEvidence, canApproveRepresentedClaim, type ClaimantRelationship } from "../../shared/reporting-policy.js";

export const claimsRouter = Router();
claimsRouter.use(authenticate);

claimsRouter.post("/", requireRole("claimant"), async (req, res, next) => {
  try {
    const parsed = z.object({
      reportId: z.string().uuid(),
      evidenceSummary: z.string().trim().min(20).max(3000),
      claimantRelationship: z.enum(["owner", "parent_guardian", "family_representative"]).default("owner"),
      representedPersonName: z.string().trim().min(2).max(180).optional(),
      authorityDeclaration: z.string().trim().min(30).max(1500).optional()
    }).superRefine((value, ctx) => {
      if (value.claimantRelationship !== "owner" && (!value.representedPersonName || !value.authorityDeclaration)) {
        ctx.addIssue({ code: "custom", path: ["representedPersonName"], message: "Provide the represented person's name and explain your authority to act on their behalf" });
      }
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a report and enough ownership or representative information for review", details: parsed.error.flatten() });
    const [report] = await db.select().from(reports).where(eq(reports.id, parsed.data.reportId)).limit(1);
    if (!report || report.kind !== "found" || report.status !== "published") return res.status(404).json({ error: "This found report is not available for claims" });
    if (report.reporterId === req.auth!.id || (report.reporterEmail && report.reporterEmail.toLowerCase() === req.auth!.email.toLowerCase())) {
      return res.status(400).json({ error: "You cannot claim a found report that you submitted" });
    }
    const ref = `CLM-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [claim] = await db.insert(claims).values({
      reference: ref, reportId: report.id, claimantId: req.auth!.id,
      status: "submitted", ownershipEvidenceSummary: parsed.data.evidenceSummary,
      claimantRelationship: parsed.data.claimantRelationship,
      representedPersonName: parsed.data.claimantRelationship === "owner" ? null : parsed.data.representedPersonName,
      authorityDeclaration: parsed.data.claimantRelationship === "owner" ? null : parsed.data.authorityDeclaration,
      authorityVerificationStatus: parsed.data.claimantRelationship === "owner" ? "not_required" : "pending"
    }).returning({ id: claims.id, reference: claims.reference, status: claims.status, createdAt: claims.createdAt });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.created", resourceType: "claim", resourceId: claim.id, outcome: "success", metadata: { claimantRelationship: parsed.data.claimantRelationship } });
    if (report.reporterId) notifySafely({ userId: report.reporterId, type: "claim_update", title: "A claim was submitted", body: `A claim for found report ${report.reference} is awaiting authorised review. Claimant identity and evidence remain private.`, link: "/workspace" });
    res.status(201).json({ claim, notice: parsed.data.claimantRelationship === "owner" ? "Your claim was submitted for ownership review." : "Your representative claim was submitted. Authority must be independently verified before ownership approval." });
  } catch (e) { next(e); }
});

claimsRouter.get("/mine", async (req, res, next) => {
  try {
    const rows = await db.select().from(claims).where(eq(claims.claimantId, req.auth!.id)).orderBy(desc(claims.createdAt));
    res.json({ claims: rows });
  } catch (e) { next(e); }
});

claimsRouter.get("/admin", requireRole("admin", "trust_safety"), async (_req, res, next) => {
  try { res.json({ claims: await db.select().from(claims).orderBy(desc(claims.createdAt)).limit(200) }); }
  catch (e) { next(e); }
});

claimsRouter.patch("/:id/authority-review", requireRole("admin", "trust_safety"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["verified", "rejected"]), note: z.string().trim().min(5).max(1000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide an authority review decision and rationale" });
    const result = await db.transaction(async tx => {
      const [claim] = await tx.select().from(claims).where(eq(claims.id, req.params.id)).limit(1).for("update");
      if (!claim) return fail(404, "Claim not found");
      if (claim.claimantRelationship === "owner") return fail(409, "This claimant is recorded as the owner; representative-authority review does not apply");
      if (!["submitted", "under_review"].includes(claim.status)) return fail(409, "Authority cannot be changed after the claim decision");
      if (parsed.data.status === "verified") {
        const authorityRows = await tx.select({ evidence: claimEvidence, document: documents })
          .from(claimEvidence).innerJoin(documents, eq(claimEvidence.documentId, documents.id))
          .where(and(eq(claimEvidence.claimId, claim.id), eq(claimEvidence.evidenceType, "representative_authority"), eq(claimEvidence.verificationStatus, "verified"), eq(documents.scanStatus, "clean"), isNull(documents.deletedAt)));
        if (!authorityRows.length) return fail(409, "A malware-cleared, independently reviewed representative_authority document is required");
      }
      const [updated] = await tx.update(claims).set({
        authorityVerificationStatus: parsed.data.status,
        authorityVerifiedBy: req.auth!.id,
        authorityVerifiedAt: parsed.data.status === "verified" ? new Date() : null,
        updatedAt: new Date()
      }).where(eq(claims.id, claim.id)).returning({ id: claims.id, authorityVerificationStatus: claims.authorityVerificationStatus, authorityVerifiedAt: claims.authorityVerifiedAt });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.representative_authority_reviewed", resourceType: "claim", resourceId: claim.id, outcome: "success", metadata: { status: parsed.data.status, note: parsed.data.note } });
      return succeed({ claim: updated });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json({ claim: result.value.claim, notice: "Representative authority review recorded separately from the ownership decision." });
  } catch (error) { next(error); }
});

claimsRouter.patch("/:id/review", requireRole("admin", "trust_safety"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["under_review", "approved", "rejected"]), reason: z.string().trim().max(1000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid review decision" });
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(claims).where(eq(claims.id, req.params.id)).limit(1).for("update");
      if (!existing) return fail(404, "Claim not found");
      if (!canTransitionClaim(existing.status as ClaimStatus, parsed.data.status)) return fail(409, "This claim cannot make that transition. Start a review before approving or rejecting; disputed cases require Trust & Safety resolution.");
      if (parsed.data.status === "approved") {
        if (!canApproveRepresentedClaim({ relationship: existing.claimantRelationship as ClaimantRelationship, authorityVerificationStatus: existing.authorityVerificationStatus })) {
          return fail(409, "Representative authority must be independently verified before approving this ownership claim.");
        }
        const attachedEvidence = await tx.select({ evidenceType: claimEvidence.evidenceType, status: claimEvidence.verificationStatus })
          .from(claimEvidence).where(eq(claimEvidence.claimId, existing.id));
        if (!canApproveClaimEvidence(attachedEvidence)) {
          return fail(409, "At least one ownership-support document must be uploaded, malware-cleared and independently verified. Every uploaded document must have a completed review before approval.");
        }
      }
      const [updated] = await tx.update(claims).set({
        status: parsed.data.status, reviewedBy: req.auth!.id, reviewedAt: new Date(),
        approvedAt: parsed.data.status === "approved" ? new Date() : existing.approvedAt,
        updatedAt: new Date()
      }).where(eq(claims.id, existing.id)).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.reviewed", resourceType: "claim", resourceId: existing.id, outcome: "success", metadata: { status: parsed.data.status, reasonPresent: Boolean(parsed.data.reason) } });
      return succeed({ claim: updated, claimantId: existing.claimantId });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    const claimantMessage = parsed.data.status === "approved" ? "Your ownership claim has been approved for the next recovery steps." : parsed.data.status === "rejected" ? "Your ownership claim was not approved. You may submit an appeal or contact support." : "Your ownership claim is under review.";
    notifySafely({ userId: result.value.claimantId, type: "claim_update", title: "Your claim status changed", body: claimantMessage, link: "/workspace" });
    res.json({ claim: result.value.claim });
  } catch (e) { next(e); }
});

claimsRouter.post("/:id/appeals", async (req, res, next) => {
  try {
    const parsed = z.object({ grounds: z.string().trim().min(40).max(3000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Explain why you believe the claim decision should be reconsidered" });
    const result = await db.transaction(async tx => {
      const [claim] = await tx.select().from(claims).where(and(eq(claims.id, req.params.id), eq(claims.claimantId, req.auth!.id))).limit(1).for("update");
      if (!claim) return fail(404, "Claim not found");
      if (claim.status !== "rejected") return fail(409, "An appeal is available only after a claim has been rejected");
      const [open] = await tx.select().from(claimAppeals).where(and(eq(claimAppeals.claimId, claim.id), inArray(claimAppeals.status, ["submitted", "under_review"]))).limit(1);
      if (open) return fail(409, "An appeal is already open for this claim");
      const [appeal] = await tx.insert(claimAppeals).values({ claimId: claim.id, submittedBy: req.auth!.id, grounds: parsed.data.grounds }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.appeal_submitted", resourceType: "claim_appeal", resourceId: appeal.id, outcome: "success" });
      return succeed({ appeal });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ appeal: result.value.appeal, notice: "Your appeal was recorded for an independent review. The original claim decision remains unchanged until the appeal is decided." });
  } catch (error) { next(error); }
});

claimsRouter.get("/appeals/mine", async (req, res, next) => {
  try {
    const rows = await db.select({ appeal: claimAppeals, claimReference: claims.reference, claimStatus: claims.status })
      .from(claimAppeals).innerJoin(claims, eq(claimAppeals.claimId, claims.id))
      .where(eq(claimAppeals.submittedBy, req.auth!.id)).orderBy(desc(claimAppeals.createdAt));
    res.json({ appeals: rows });
  } catch (error) { next(error); }
});

claimsRouter.get("/appeals/queue", requireRole("admin", "trust_safety"), async (_req, res, next) => {
  try {
    const rows = await db.select({ appeal: claimAppeals, claim: claims })
      .from(claimAppeals).innerJoin(claims, eq(claimAppeals.claimId, claims.id))
      .where(inArray(claimAppeals.status, ["submitted", "under_review"]))
      .orderBy(desc(claimAppeals.createdAt)).limit(200);
    res.json({ appeals: rows });
  } catch (error) { next(error); }
});

claimsRouter.patch("/appeals/:appealId/review", requireRole("admin", "trust_safety"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["under_review", "upheld", "declined"]), note: z.string().trim().min(10).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide an appeal review decision and rationale" });
    const result = await db.transaction(async tx => {
      const [appeal] = await tx.select().from(claimAppeals).where(eq(claimAppeals.id, req.params.appealId)).limit(1).for("update");
      if (!appeal) return fail(404, "Appeal not found");
      if (!["submitted", "under_review"].includes(appeal.status)) return fail(409, "This appeal has already been decided");
      const [claim] = await tx.select().from(claims).where(eq(claims.id, appeal.claimId)).limit(1).for("update");
      if (!claim) return fail(404, "Claim not found");
      if (claim.reviewedBy === req.auth!.id) return fail(409, "The original claim reviewer cannot decide the appeal");
      if (parsed.data.status !== "under_review" && appeal.status !== "under_review") return fail(409, "Start the independent appeal review before recording a final decision");
      const final = parsed.data.status === "upheld" || parsed.data.status === "declined";
      const [updated] = await tx.update(claimAppeals).set({
        status: parsed.data.status, reviewerNote: parsed.data.note,
        reviewedBy: final ? req.auth!.id : appeal.reviewedBy,
        reviewedAt: final ? new Date() : appeal.reviewedAt
      }).where(eq(claimAppeals.id, appeal.id)).returning();
      if (parsed.data.status === "upheld") {
        await tx.update(claims).set({ status: "under_review", reviewedBy: null, reviewedAt: null, approvedAt: null, updatedAt: new Date() }).where(eq(claims.id, claim.id));
      }
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "claim.appeal_reviewed", resourceType: "claim_appeal", resourceId: appeal.id, outcome: "success", metadata: { status: parsed.data.status, claimReopened: parsed.data.status === "upheld" } });
      return succeed({ appeal: updated, claimantId: claim.claimantId });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    notifySafely({ userId: result.value.claimantId, type: "claim_update", title: "Your claim appeal was updated", body: parsed.data.status === "upheld" ? "Your appeal was upheld and the claim has returned to independent review. Ownership has not been automatically approved." : parsed.data.status === "declined" ? "Your appeal was reviewed and declined. Contact support if you need clarification." : "An independent reviewer has started reviewing your appeal.", link: "/workspace" });
    res.json({ appeal: result.value.appeal, notice: parsed.data.status === "upheld" ? "Appeal upheld; the claim was reopened for a fresh review, not automatically approved." : "Appeal review recorded." });
  } catch (error) { next(error); }
});
