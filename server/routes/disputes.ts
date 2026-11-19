import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, caseDisputes, claims, reports, settlements } from "../db/schema.js";
import { authenticate, requireRole, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { hasAdminAuthority } from "../../shared/admin-role-policy.mjs";
import { notifySafely } from "../services/notifications.js";

export const disputesRouter = Router();
disputesRouter.use(authenticate);

const activeDisputeStatuses = ["open", "investigating", "awaiting_information"] as const;

disputesRouter.post("/claims/:claimId", async (req, res, next) => {
  try {
    const parsed = z.object({
      reasonCode: z.enum(["ownership", "item_condition", "agent_conduct", "safety", "legal_concern", "payment", "other"]),
      description: z.string().trim().min(20).max(3000)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Describe the dispute and select a valid reason" });

    const result = await db.transaction(async (tx) => {
      const [claim] = await tx.select().from(claims).where(eq(claims.id, req.params.claimId)).limit(1).for("update");
      if (!claim) return fail(404, "Claim not found");
      const [report] = await tx.select().from(reports).where(eq(reports.id, claim.reportId)).limit(1);
      if (!report) return fail(404, "Related report not found");
      if (claim.claimantId !== req.auth!.id && report.reporterId !== req.auth!.id && !hasAdminAuthority(req.auth!.roles)) {
        return fail(403, "You are not a participant in this case");
      }
      if (["completed", "cancelled"].includes(claim.status)) return fail(409, "A closed claim cannot be disputed through this workflow");
      const [existing] = await tx.select({ id: caseDisputes.id }).from(caseDisputes)
        .where(and(eq(caseDisputes.claimId, claim.id), inArray(caseDisputes.status, [...activeDisputeStatuses])))
        .limit(1);
      if (existing) return fail(409, "An active dispute already exists for this claim");

      const [dispute] = await tx.insert(caseDisputes).values({
        claimId: claim.id, reportId: report.id, openedBy: req.auth!.id,
        reasonCode: parsed.data.reasonCode, description: parsed.data.description,
        releaseHold: true, settlementHold: true
      }).returning();
      await tx.update(claims).set({ status: "disputed", disputeReason: parsed.data.reasonCode, updatedAt: new Date() }).where(eq(claims.id, claim.id));
      await tx.update(settlements).set({ status: "on_hold" }).where(eq(settlements.claimId, claim.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "case.dispute_opened", resourceType: "claim", resourceId: claim.id, outcome: "success", metadata: { reasonCode: parsed.data.reasonCode, releaseHold: true, settlementHold: true } });
      return succeed({ dispute, reportId: report.id, claimantId: claim.claimantId, reporterId: report.reporterId });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    for (const userId of new Set([result.value.claimantId, result.value.reporterId].filter((value): value is string => Boolean(value)))) {
      notifySafely({ userId, type: "case_hold", category: "security", priority: "high", title: "A case has been placed on hold", body: "A dispute has paused the affected recovery and settlement while an authorised review takes place.", link: "/workspace", dedupeKey: `case_hold:${result.value.dispute.id}:${userId}` });
    }
    res.status(201).json({ dispute: result.value.dispute, notice: "The affected release and settlement are on hold pending authorised review." });
  } catch (error) { next(error); }
});

disputesRouter.get("/mine", async (req, res, next) => {
  try {
    const rows = await db.select({ dispute: caseDisputes, claimReference: claims.reference, reportReference: reports.reference })
      .from(caseDisputes).innerJoin(claims, eq(caseDisputes.claimId, claims.id)).innerJoin(reports, eq(caseDisputes.reportId, reports.id))
      .where(or(eq(caseDisputes.openedBy, req.auth!.id), eq(claims.claimantId, req.auth!.id), eq(reports.reporterId, req.auth!.id)))
      .orderBy(desc(caseDisputes.createdAt));
    res.json({ disputes: rows });
  } catch (error) { next(error); }
});

disputesRouter.patch("/:disputeId/resolve", requireRole("trust_safety", "admin"), (req, res, next) => requireStepUpInTransaction("admin.dispute.resolve")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({
      resolution: z.string().trim().min(20).max(3000),
      outcome: z.enum(["return_to_review", "uphold_claim_rejection", "close_dispute"])
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a documented resolution and outcome" });

    const result = await db.transaction(async (tx) => {
      const [dispute] = await tx.select().from(caseDisputes).where(eq(caseDisputes.id, req.params.disputeId)).limit(1).for("update");
      if (!dispute) return fail(404, "Dispute not found");
      if (dispute.openedBy === req.auth!.id) return fail(409, "The person who opened a dispute cannot resolve it");
      if (!activeDisputeStatuses.includes(dispute.status as typeof activeDisputeStatuses[number])) return fail(409, "Dispute has already been resolved or is not active");
      const claimStatus = parsed.data.outcome === "uphold_claim_rejection" ? "rejected" : "under_review";
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.dispute.resolve");
      const [updated] = await tx.update(caseDisputes).set({ status: "resolved", resolution: parsed.data.resolution, resolvedBy: req.auth!.id, resolvedAt: new Date(), releaseHold: false, settlementHold: false })
        .where(and(eq(caseDisputes.id, dispute.id), inArray(caseDisputes.status, [...activeDisputeStatuses]))).returning();
      if (!updated) return fail(409, "Dispute changed concurrently; refresh and review it again");
      await tx.update(claims).set({ status: claimStatus, updatedAt: new Date() }).where(and(eq(claims.id, dispute.claimId), eq(claims.status, "disputed")));
      // Settlement is deliberately not auto-released when a dispute is resolved.
      await tx.update(settlements).set({ status: "ineligible" }).where(and(eq(settlements.claimId, dispute.claimId), eq(settlements.status, "on_hold")));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "case.dispute_resolved", resourceType: "dispute", resourceId: dispute.id, outcome: "success", metadata: { outcome: parsed.data.outcome, settlementRequiresReassessment: true } });
      return succeed({ dispute: updated, claimStatus, claimId: dispute.claimId });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    const [claim] = await db.select().from(claims).where(eq(claims.id, result.value.claimId)).limit(1);
    if (claim) notifySafely({ userId: claim.claimantId, type: "claim_update", title: "Your dispute review has been updated", body: "An authorised reviewer recorded a decision. Any collection or settlement remains subject to separate eligibility checks.", link: "/workspace", dedupeKey: `dispute_resolved:${result.value.dispute.id}` });
    res.json({ dispute: result.value.dispute, claimStatus: result.value.claimStatus, notice: "The dispute hold is recorded as resolved. Release and settlement eligibility must be independently reassessed; no release or payout is initiated." });
  } catch (error) { next(error); }
});
