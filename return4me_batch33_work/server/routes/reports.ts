import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, categoryProposals, reports, userRoles } from "../db/schema.js";
import { authenticate } from "../security.js";
import { COUNTIES } from "../../shared/contracts.js";
import { publicDisclosureIssue } from "../services/privacy.js";
import { hasRepresentativeDeclaration, requiresRepresentativeAuthority } from "../../shared/reporting-policy.js";
import { notifySafely } from "../services/notifications.js";
import { reportStatusAfterConsentChange, type PublicReportStatus } from "../../shared/reporting-policy.js";

export const reportsRouter = Router();
const categories = ["Personal belongings", "Documents and identity", "Electronics", "Jewellery and valuables", "School and work", "Transport-related", "Medical and assistive", "Children's items", "Cash and payment cards", "Household", "Other"] as const;
const createSchema = z.object({
  kind: z.enum(["lost", "found"]),
  category: z.enum(categories),
  otherCategoryProposal: z.string().trim().min(2).max(100).optional(),
  otherCategoryExplanation: z.string().trim().min(15).max(1000).optional(),
  itemDescription: z.string().trim().min(15).max(4000),
  county: z.enum(COUNTIES),
  approximateLocation: z.string().trim().max(240).optional(),
  incidentDate: z.string().date().optional(),
  publicListingConsent: z.boolean().default(false),
  publicDescription: z.string().trim().max(600).optional(),
  reporterRelationship: z.enum(["self", "parent_guardian", "family_representative"]).default("self"),
  subjectName: z.string().trim().min(2).max(180).optional(),
  representativeDeclaration: z.string().trim().min(30).max(1500).optional()
}).superRefine((value, ctx) => {
  if (value.category === "Other" && (!value.otherCategoryProposal || !value.otherCategoryExplanation)) {
    ctx.addIssue({ code: "custom", path: ["otherCategoryProposal"], message: "Provide the proposed category name and explain why it is needed" });
  }
  if (value.publicListingConsent && !value.publicDescription?.trim()) {
    ctx.addIssue({ code: "custom", path: ["publicDescription"], message: "A separate public-safe description is required when you consent to a public notice" });
  }
  if (value.publicListingConsent && value.publicDescription) {
    const issue = publicDisclosureIssue(value.publicDescription);
    if (issue) ctx.addIssue({ code: "custom", path: ["publicDescription"], message: `Remove possible private ${issue} from the public-safe description` });
  }
  if (requiresRepresentativeAuthority(value.reporterRelationship) && !hasRepresentativeDeclaration({
    relationship: value.reporterRelationship, subjectName: value.subjectName, declaration: value.representativeDeclaration
  })) {
    ctx.addIssue({ code: "custom", path: ["subjectName"], message: "When reporting for someone else, provide their name and explain your authority to act on their behalf" });
  }
});

reportsRouter.get("/public", async (_req, res, next) => {
  try {
    const rows = await db.select({
      id: reports.id, reference: reports.reference, kind: reports.kind,
      category: reports.category, publicDescription: reports.publicDescription,
      county: reports.county, status: reports.status, createdAt: reports.createdAt
    }).from(reports).where(and(eq(reports.kind, "found"), eq(reports.publicListingConsent, true), inArray(reports.status, ["published", "matched"])))
      .orderBy(desc(reports.createdAt)).limit(50);
    res.json({ reports: rows });
  } catch (e) { next(e); }
});

reportsRouter.post("/", authenticate, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the report details and try again", details: parsed.error.flatten() });
    const data = parsed.data;
    const reference = `R4M-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [report] = await db.insert(reports).values({
      kind: data.kind, category: data.category, itemDescription: data.itemDescription,
      county: data.county, approximateLocation: data.approximateLocation,
      incidentDate: data.incidentDate, reporterId: req.auth!.id, reporterEmail: req.auth!.email,
      reporterEmailVerifiedAt: new Date(), reporterRelationship: data.reporterRelationship,
      subjectName: data.reporterRelationship === "self" ? null : data.subjectName, reference,
      status: "submitted", publicListingConsent: data.publicListingConsent,
      publicDescription: data.publicListingConsent ? data.publicDescription : null,
      privateMetadata: {
        otherCategoryProposal: data.otherCategoryProposal || null,
        representativeDeclaration: data.representativeDeclaration || null,
        authorityReviewRequired: data.reporterRelationship !== "self",
        authorityStatus: data.reporterRelationship === "self" ? "not_required" : "pending"
      }
    }).returning({ id: reports.id, reference: reports.reference, status: reports.status, createdAt: reports.createdAt });
    if (data.category === "Other" && data.otherCategoryProposal && data.otherCategoryExplanation) {
      const [proposal] = await db.insert(categoryProposals).values({
        proposedName: data.otherCategoryProposal, explanation: data.otherCategoryExplanation,
        proposedBy: req.auth!.id, proposedEmail: req.auth!.email, reportId: report.id
      }).returning({ id: categoryProposals.id });
      await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "category.proposed_from_report", resourceType: "category_proposal", resourceId: proposal.id, outcome: "success" });
    }
    if (data.kind === "found") {
      const [finderRole] = await db.select().from(userRoles).where(and(eq(userRoles.userId, req.auth!.id), eq(userRoles.role, "finder"), isNull(userRoles.revokedAt))).limit(1);
      if (!finderRole) await db.insert(userRoles).values({ userId: req.auth!.id, role: "finder" });
    }
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "report.created", resourceType: "report", resourceId: report.id, outcome: "success", metadata: { kind: data.kind } });
    notifySafely({ userId: req.auth!.id, type: "report_update", title: "Your report was received", body: `Report ${report.reference} has been submitted for review. Keep your reference for future updates.`, link: "/workspace" });
    res.status(201).json({ report });
  } catch (e) { next(e); }
});

reportsRouter.patch("/:id/public-consent", authenticate, async (req, res, next) => {
  try {
    const parsed = z.object({ consent: z.boolean(), publicDescription: z.string().trim().max(600).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid public-notice consent" });
    if (parsed.data.consent && !parsed.data.publicDescription?.trim()) return res.status(400).json({ error: "A separate public-safe description is required" });
    if (parsed.data.consent && parsed.data.publicDescription) {
      const issue = publicDisclosureIssue(parsed.data.publicDescription);
      if (issue) return res.status(400).json({ error: `Remove possible private ${issue} before enabling a public notice` });
    }
    const result = await db.transaction(async tx => {
      const [existing] = await tx.select().from(reports)
        .where(and(eq(reports.id, req.params.id), eq(reports.reporterId, req.auth!.id)))
        .limit(1).for("update");
      if (!existing) return null;
      const status = reportStatusAfterConsentChange(existing.status as PublicReportStatus, parsed.data.consent);
      const [updated] = await tx.update(reports).set({
        publicListingConsent: parsed.data.consent,
        publicDescription: parsed.data.consent ? parsed.data.publicDescription : null,
        status, updatedAt: new Date()
      }).where(eq(reports.id, existing.id)).returning({ id: reports.id, publicListingConsent: reports.publicListingConsent, status: reports.status });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "report.public_consent_changed", resourceType: "report", resourceId: updated.id, outcome: "success", metadata: { consent: updated.publicListingConsent, statusResetForReview: status === "under_review" && existing.status !== "under_review" } });
      return updated;
    });
    if (!result) return res.status(404).json({ error: "Report not found" });
    res.json({ report: result, notice: result.publicListingConsent ? "Consent recorded. If a notice was already published, it must pass a new review." : "Public-notice consent withdrawn; the notice is no longer eligible for public display." });
  } catch (e) { next(e); }
});

reportsRouter.get("/mine", authenticate, async (req, res, next) => {
  try {
    const rows = await db.select().from(reports).where(eq(reports.reporterId, req.auth!.id)).orderBy(desc(reports.createdAt));
    res.json({ reports: rows });
  } catch (e) { next(e); }
});
