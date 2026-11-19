import { Router } from "express";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { auditEvents, privacyLegalHolds, privacyRetentionPolicies, riskReviewCases, riskReviewEvents, securityIncidentAssessments, securityIncidents } from "../db/schema.js";
import { authenticate, consumeStepUpGrantInTransaction, requireRole, requireStepUpInTransaction } from "../security.js";

export const securityGovernanceRouter = Router();
securityGovernanceRouter.use(authenticate, requireRole("admin", "owner"));
const ref = (prefix: string) => `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;

securityGovernanceRouter.get("/overview", async (_req, res, next) => {
  try {
    const [holds, risks, incidents, policies] = await Promise.all([
      db.select({ id: privacyLegalHolds.id, reference: privacyLegalHolds.reference, subjectType: privacyLegalHolds.subjectType, subjectId: privacyLegalHolds.subjectId, reasonCode: privacyLegalHolds.reasonCode, createdAt: privacyLegalHolds.createdAt }).from(privacyLegalHolds).where(eq(privacyLegalHolds.status, "active")).orderBy(desc(privacyLegalHolds.createdAt)).limit(100),
      db.select({ id: riskReviewCases.id, reference: riskReviewCases.reference, subjectType: riskReviewCases.subjectType, subjectId: riskReviewCases.subjectId, signalCode: riskReviewCases.signalCode, severity: riskReviewCases.severity, status: riskReviewCases.status, createdAt: riskReviewCases.createdAt }).from(riskReviewCases).where(isNull(riskReviewCases.resolvedAt)).orderBy(desc(riskReviewCases.createdAt)).limit(100),
      db.select({ id: securityIncidents.id, reference: securityIncidents.reference, severity: securityIncidents.severity, status: securityIncidents.status, detectedAt: securityIncidents.detectedAt }).from(securityIncidents).where(isNull(securityIncidents.closedAt)).orderBy(desc(securityIncidents.detectedAt)).limit(100),
      db.select().from(privacyRetentionPolicies).orderBy(desc(privacyRetentionPolicies.createdAt)).limit(100)
    ]);
    res.json({ legalHolds: holds, riskReviews: risks, openIncidents: incidents, retentionPolicies: policies, notice: "Risk signals are leads for human review, not findings of misconduct. Retention periods remain inactive until legal-basis review and approval." });
  } catch (error) { next(error); }
});

securityGovernanceRouter.post("/legal-holds", (req, res, next) => requireStepUpInTransaction("admin.privacy.legal_hold.create")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ subjectType: z.string().trim().min(2).max(60), subjectId: z.string().trim().min(1).max(120), reasonCode: z.enum(["litigation", "law_enforcement", "regulatory", "safeguarding", "dispute", "other"]), authorityReference: z.string().trim().max(180).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a subject, recognised hold reason and optional authority reference" });
    const created = await db.transaction(async tx => {
      // Holds targeting claims, reports or assignments lock that exact subject
      // before insertion. The final-release workflow takes the same subject lock
      // before evaluating active holds, closing the hold-versus-release race.
      let subjectExists = true;
      if (parsed.data.subjectType === "claim") {
        const target = await tx.execute(sql`SELECT id FROM claims WHERE id::text=${parsed.data.subjectId} FOR UPDATE`);
        subjectExists = ((target as any).rows ?? []).length > 0;
      } else if (parsed.data.subjectType === "report") {
        const target = await tx.execute(sql`SELECT id FROM reports WHERE id::text=${parsed.data.subjectId} FOR UPDATE`);
        subjectExists = ((target as any).rows ?? []).length > 0;
      } else if (parsed.data.subjectType === "assignment") {
        const target = await tx.execute(sql`SELECT id FROM assignments WHERE id::text=${parsed.data.subjectId} FOR UPDATE`);
        subjectExists = ((target as any).rows ?? []).length > 0;
      }
      if (!subjectExists) throw new Error("Legal hold subject was not found");
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.privacy.legal_hold.create");
      const [row] = await tx.insert(privacyLegalHolds).values({ reference: ref("HOLD"), ...parsed.data, createdBy: req.auth!.id }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.legal_hold_created", resourceType: "privacy_legal_hold", resourceId: row.id, outcome: "success", metadata: { subjectType: row.subjectType, reasonCode: row.reasonCode } });
      return row;
    });
    res.status(201).json({ legalHold: created, notice: "An active hold targeting a claim, report or assignment blocks final item release in the integrated custody workflow. Retention enforcement depends on the approved retention worker; a hold record does not determine legal validity." });
  } catch (error) { if (error instanceof Error && error.message === "Legal hold subject was not found") return res.status(404).json({ error: error.message }); next(error); }
});

securityGovernanceRouter.post("/legal-holds/:id/release", (req, res, next) => requireStepUpInTransaction("admin.privacy.legal_hold.release")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ reason: z.string().trim().min(10).max(1000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A documented release reason is required" });
    const result = await db.transaction(async tx => {
      const [hold] = await tx.select().from(privacyLegalHolds).where(and(eq(privacyLegalHolds.id, req.params.id), eq(privacyLegalHolds.status, "active"))).limit(1).for("update");
      if (!hold) return null;
      if (hold.createdBy === req.auth!.id) throw new Error("The creator cannot release their own legal hold");
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.privacy.legal_hold.release");
      const [updated] = await tx.update(privacyLegalHolds).set({ status: "released", releasedBy: req.auth!.id, releaseReason: parsed.data.reason, releasedAt: new Date() }).where(eq(privacyLegalHolds.id, hold.id)).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.legal_hold_released", resourceType: "privacy_legal_hold", resourceId: hold.id, outcome: "success", metadata: { reason: parsed.data.reason } });
      return updated;
    });
    if (!result) return res.status(404).json({ error: "Active legal hold not found" });
    res.json({ legalHold: result });
  } catch (error) { if (error instanceof Error && error.message.includes("creator cannot")) return res.status(409).json({ error: error.message }); next(error); }
});

securityGovernanceRouter.post("/risk-reviews", (req, res, next) => requireStepUpInTransaction("admin.security.risk_review.create")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ subjectUserId: z.string().uuid().optional(), subjectType: z.string().trim().min(2).max(60), subjectId: z.string().trim().min(1).max(120), signalCode: z.string().trim().min(2).max(80), signalSource: z.string().trim().min(2).max(80), signalEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(), severity: z.enum(["low", "medium", "high", "critical"]), rationale: z.string().trim().min(10).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a valid risk signal, subject, severity and factual rationale" });
    const created = await db.transaction(async tx => {
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.security.risk_review.create");
      const [row] = await tx.insert(riskReviewCases).values({ reference: ref("RISK"), ...parsed.data, createdBy: req.auth!.id }).returning();
      await tx.insert(riskReviewEvents).values({ caseId: row.id, actorId: req.auth!.id, eventType: "signal_recorded", rationale: parsed.data.rationale, evidenceHash: parsed.data.signalEvidenceHash });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "security.risk_review_created", resourceType: "risk_review_case", resourceId: row.id, outcome: "success", metadata: { signalCode: row.signalCode, severity: row.severity } });
      return row;
    });
    res.status(201).json({ riskReview: created, notice: "A risk signal is not proof of fraud. No account restriction, payment hold or adverse action was applied." });
  } catch (error) { next(error); }
});

securityGovernanceRouter.patch("/risk-reviews/:id", (req, res, next) => requireStepUpInTransaction("admin.security.risk_review.resolve")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["investigating", "monitoring", "resolved"]), outcome: z.enum(["no_issue", "policy_breach", "refer_legal", "insufficient_evidence"]), rationale: z.string().trim().min(20).max(1500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a review status, outcome and documented rationale" });
    const result = await db.transaction(async tx => {
      const [row] = await tx.select().from(riskReviewCases).where(eq(riskReviewCases.id, req.params.id)).limit(1).for("update");
      if (!row || row.status === "resolved") return null;
      if (row.createdBy === req.auth!.id) throw new Error("The signal creator cannot decide their own risk review");
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.security.risk_review.resolve");
      const [updated] = await tx.update(riskReviewCases).set({ status: parsed.data.status, outcome: parsed.data.outcome, rationale: parsed.data.rationale, reviewedBy: req.auth!.id, updatedAt: new Date(), resolvedAt: parsed.data.status === "resolved" ? new Date() : null }).where(eq(riskReviewCases.id, row.id)).returning();
      await tx.insert(riskReviewEvents).values({ caseId: row.id, actorId: req.auth!.id, eventType: parsed.data.status, rationale: parsed.data.rationale });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "security.risk_review_updated", resourceType: "risk_review_case", resourceId: row.id, outcome: "success", metadata: { status: updated.status, outcome: updated.outcome } });
      return updated;
    });
    if (!result) return res.status(404).json({ error: "Open risk review not found" });
    res.json({ riskReview: result });
  } catch (error) { if (error instanceof Error && error.message.includes("creator cannot")) return res.status(409).json({ error: error.message }); next(error); }
});

securityGovernanceRouter.post("/incidents/:id/assessment", (req, res, next) => requireStepUpInTransaction("admin.security.incident.assess")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ affectedDataClasses: z.array(z.string().trim().min(2).max(60)).max(30), affectedPeopleEstimate: z.number().int().min(0).optional(), accessConfirmed: z.boolean(), containmentAt: z.string().datetime().optional(), counselReviewStatus: z.enum(["pending", "requested", "reviewed"]), regulatorAssessmentStatus: z.enum(["pending", "not_required_subject_to_counsel", "required_subject_to_counsel", "completed"]), subjectNotificationStatus: z.enum(["pending", "not_required_subject_to_counsel", "required_subject_to_counsel", "completed"]), assessmentNotes: z.string().trim().min(20).max(3000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide affected data classes, impact assessment and documented escalation status" });
    const result = await db.transaction(async tx => {
      const [incident] = await tx.select({ id: securityIncidents.id }).from(securityIncidents).where(eq(securityIncidents.id, req.params.id)).limit(1);
      if (!incident) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.security.incident.assess");
      const [assessment] = await tx.insert(securityIncidentAssessments).values({ incidentId: incident.id, assessedBy: req.auth!.id, ...parsed.data, containmentAt: parsed.data.containmentAt ? new Date(parsed.data.containmentAt) : null }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "security.incident_assessed", resourceType: "security_incident", resourceId: incident.id, outcome: "success", metadata: { affectedDataClasses: parsed.data.affectedDataClasses, accessConfirmed: parsed.data.accessConfirmed } });
      return assessment;
    });
    if (!result) return res.status(404).json({ error: "Security incident not found" });
    res.status(201).json({ assessment: result, notice: "Notification decisions remain subject to qualified Kenyan legal review; this record does not itself submit a regulator or data-subject notice." });
  } catch (error) { next(error); }
});

securityGovernanceRouter.post("/retention-policies", (req, res, next) => requireStepUpInTransaction("admin.privacy.retention.propose")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ recordClass: z.string().trim().min(2).max(80), purpose: z.string().trim().min(20).max(500), retentionDays: z.number().int().min(1).max(36500), policyVersion: z.string().trim().min(1).max(40) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a record class, purpose, retention period and policy version" });
    await db.transaction(async tx => {
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.privacy.retention.propose");
      const [row] = await tx.insert(privacyRetentionPolicies).values({ ...parsed.data, active: false, legalBasisReview: "pending" }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "privacy.retention_policy_proposed", resourceType: "privacy_retention_policy", resourceId: row.id, outcome: "success", metadata: { recordClass: row.recordClass, retentionDays: row.retentionDays } });
    });
    res.status(201).json({ proposed: true, active: false, notice: "Retention proposal recorded only. It cannot trigger deletion until legal-basis review, separate approval, legal-hold checks and an independently accepted deletion worker are in place." });
  } catch (error) { next(error); }
});
