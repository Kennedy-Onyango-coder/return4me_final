import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditEvents, communicationConsents, communicationsCampaigns, communicationsDeliveryEvents,
  communicationsGovernance, communicationsPublications, communicationsTemplates,
  custodyEvents, notificationPreferences, reports, userRoles, users
} from "../db/schema.js";
import { authenticate, consumeStepUpGrantInTransaction, requireRole, requireStepUpInTransaction } from "../security.js";
import { publicDisclosureIssue } from "../services/privacy.js";

export const communicationsRouter = Router();
communicationsRouter.use(authenticate);

const COMMUNITY_EMAIL_CONSENT_VERSION = "2026-11-v1";
const COMMUNITY_EMAIL_CONSENT_TEXT = "I agree to receive optional Return4me community and service-awareness updates by email. I can withdraw this consent at any time. This does not affect essential account, security, claim or financial notifications.";
const consentTextHash = createHash("sha256").update(COMMUNITY_EMAIL_CONSENT_TEXT).digest("hex");

async function getPublisherUserId() {
  const [row] = await db.select({ publisherUserId: communicationsGovernance.publisherUserId })
    .from(communicationsGovernance).where(eq(communicationsGovernance.singletonId, 1)).limit(1);
  return row?.publisherUserId ?? null;
}

async function validateFoundNotice(tx: any, campaign: { purpose: string; reportId: string | null }) {
  if (campaign.purpose !== "found_notice") return null;
  if (!campaign.reportId) return "A found notice must be linked to a found report";
  const [report] = await tx.select({ id: reports.id, kind: reports.kind, publicListingConsent: reports.publicListingConsent, status: reports.status })
    .from(reports).where(eq(reports.id, campaign.reportId)).limit(1);
  if (!report || report.kind !== "found" || !report.publicListingConsent || report.status !== "published")
    return "The linked found report must remain published with reporter consent";
  const [custody] = await tx.select({ id: custodyEvents.id }).from(custodyEvents)
    .where(and(eq(custodyEvents.reportId, report.id), eq(custodyEvents.eventType, "handover_ready"))).limit(1);
  if (!custody) return "The linked found report no longer has the required authorised custody state";
  return null;
}

async function validateCampaignPrivacy(tx: any, campaignId: string) {
  const [campaign] = await tx.select({ title: communicationsCampaigns.title }).from(communicationsCampaigns)
    .where(eq(communicationsCampaigns.id, campaignId)).limit(1);
  const publications = await tx.select({ body: communicationsPublications.body }).from(communicationsPublications)
    .where(eq(communicationsPublications.campaignId, campaignId));
  if (!publications.length) return "Campaign has no channel content";
  const issueInTitle = publicDisclosureIssue(campaign?.title ?? "");
  if (issueInTitle) return `A privacy review is required: possible ${issueInTitle} in campaign title`;
  for (const publication of publications) {
    const issue = publicDisclosureIssue(publication.body);
    if (issue) return `A privacy review is required: possible ${issue}`;
  }
  return null;
}

async function mayApprove(tx: any, userId: string, roles: string[], creatorId: string) {
  if (userId === creatorId) return false;
  if (roles.includes("owner")) return true; // Owner retains final authority but never self-approves.
  const [row] = await tx.select({ approverUserId: communicationsGovernance.approverUserId })
    .from(communicationsGovernance).where(eq(communicationsGovernance.singletonId, 1)).limit(1).for("update");
  return (row?.approverUserId ?? null) === userId;
}

communicationsRouter.get("/governance", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const [row] = await db.select({ approverUserId: communicationsGovernance.approverUserId,
      publisherUserId: communicationsGovernance.publisherUserId, updatedAt: communicationsGovernance.updatedAt }).from(communicationsGovernance)
      .where(eq(communicationsGovernance.singletonId, 1)).limit(1);
    res.json({ governance: row ?? { approverUserId: null, publisherUserId: null, updatedAt: null },
      rule: "One designated Admin Communications Approver and one designated Admin Publisher; creator, approver, scheduler and publisher duties are separated; Owner may make final decisions for work created by another user." });
  } catch (error) { next(error); }
});

communicationsRouter.put("/governance/approver", requireRole("owner"),
  (req, res, next) => requireStepUpInTransaction("admin.communications.approver.assign")(req, res, next), async (req, res, next) => {
    const parsed = z.object({ approverUserId: z.string().uuid(), reason: z.string().trim().min(10).max(500) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Select an active Admin account and provide a reason" });
    if (parsed.data.approverUserId === req.auth!.id) return res.status(400).json({ error: "The Owner cannot be designated as the separate Communications Approver" });
    try {
      const result = await db.transaction(async tx => {
        const [account] = await tx.select({ id: users.id, isSuspended: users.isSuspended, emailVerifiedAt: users.emailVerifiedAt })
          .from(users).where(eq(users.id, parsed.data.approverUserId)).limit(1);
        const [activeAdmin] = await tx.select({ id: userRoles.id }).from(userRoles)
          .where(and(eq(userRoles.userId, parsed.data.approverUserId), eq(userRoles.role, "admin"), isNull(userRoles.revokedAt))).limit(1);
        if (!account || account.isSuspended || !account.emailVerifiedAt || !activeAdmin) return null;
        const [currentGovernance] = await tx.select({ publisherUserId: communicationsGovernance.publisherUserId }).from(communicationsGovernance)
          .where(eq(communicationsGovernance.singletonId, 1)).limit(1).for("update");
        if (currentGovernance?.publisherUserId === account.id) return { conflict: true } as const;
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.approver.assign");
        await tx.insert(communicationsGovernance).values({ singletonId: 1, approverUserId: account.id, updatedBy: req.auth!.id, updatedAt: new Date() })
          .onConflictDoUpdate({ target: communicationsGovernance.singletonId, set: { approverUserId: account.id, updatedBy: req.auth!.id, updatedAt: new Date() } });
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.approver_assigned", resourceType: "communications_governance", resourceId: "1", outcome: "success", metadata: { approverUserId: account.id, reason: parsed.data.reason } });
        return { approverUserId: account.id };
      });
      if (!result) return res.status(400).json({ error: "The selected account must be an active, verified Admin" });
      if ("conflict" in result) return res.status(409).json({ error: "The same Admin cannot be both Communications Approver and Publisher" });
      res.json({ governance: result, notice: "The designated Communications Approver was updated. Existing approvals are unchanged." });
    } catch (error) { next(error); }
  });

communicationsRouter.put("/governance/publisher", requireRole("owner"),
  (req, res, next) => requireStepUpInTransaction("admin.communications.publisher.assign")(req, res, next), async (req, res, next) => {
    const parsed = z.object({ publisherUserId: z.string().uuid(), reason: z.string().trim().min(10).max(500) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Select an active Admin account and provide a reason" });
    if (parsed.data.publisherUserId === req.auth!.id) return res.status(400).json({ error: "The Owner cannot be designated as the separate Communications Publisher" });
    try {
      const result = await db.transaction(async tx => {
        const [account] = await tx.select({ id: users.id, isSuspended: users.isSuspended, emailVerifiedAt: users.emailVerifiedAt })
          .from(users).where(eq(users.id, parsed.data.publisherUserId)).limit(1);
        const [activeAdmin] = await tx.select({ id: userRoles.id }).from(userRoles)
          .where(and(eq(userRoles.userId, parsed.data.publisherUserId), eq(userRoles.role, "admin"), isNull(userRoles.revokedAt))).limit(1);
        if (!account || account.isSuspended || !account.emailVerifiedAt || !activeAdmin) return null;
        const [currentGovernance] = await tx.select({ approverUserId: communicationsGovernance.approverUserId }).from(communicationsGovernance)
          .where(eq(communicationsGovernance.singletonId, 1)).limit(1).for("update");
        if (currentGovernance?.approverUserId === account.id) return { conflict: true } as const;
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.publisher.assign");
        await tx.insert(communicationsGovernance).values({ singletonId: 1, publisherUserId: account.id, updatedBy: req.auth!.id, updatedAt: new Date() })
          .onConflictDoUpdate({ target: communicationsGovernance.singletonId, set: { publisherUserId: account.id, updatedBy: req.auth!.id, updatedAt: new Date() } });
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.publisher_assigned", resourceType: "communications_governance", resourceId: "1", outcome: "success", metadata: { publisherUserId: account.id, reason: parsed.data.reason } });
        return { publisherUserId: account.id };
      });
      if (!result) return res.status(400).json({ error: "The selected account must be an active, verified Admin" });
      if ("conflict" in result) return res.status(409).json({ error: "The same Admin cannot be both Communications Approver and Publisher" });
      res.json({ governance: result, notice: "The designated Communications Publisher was updated." });
    } catch (error) { next(error); }
  });

communicationsRouter.get("/campaigns", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const campaigns = await db.select().from(communicationsCampaigns).orderBy(desc(communicationsCampaigns.createdAt)).limit(100);
    const ids = campaigns.map(item => item.id);
    const publications = ids.length ? await db.select().from(communicationsPublications)
      .where(inArray(communicationsPublications.campaignId, ids)) : [];
    res.json({ campaigns: campaigns.map(campaign => ({ ...campaign, publications: publications.filter(item => item.campaignId === campaign.id) })) });
  } catch (error) { next(error); }
});

communicationsRouter.get("/templates", requireRole("admin", "owner"), async (_req, res, next) => {
  try { res.json({ templates: await db.select().from(communicationsTemplates).orderBy(desc(communicationsTemplates.createdAt)).limit(200) }); }
  catch (error) { next(error); }
});

communicationsRouter.post("/templates", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ code: z.string().trim().min(2).max(80), channel: z.enum(["email", "facebook", "telegram"]), subject: z.string().trim().max(200).optional(), body: z.string().trim().min(20).max(8000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the template details" });
    const privacyIssue = publicDisclosureIssue(`${parsed.data.subject ?? ""}\n${parsed.data.body}`);
    if (privacyIssue) return res.status(400).json({ error: `Remove possible private ${privacyIssue} before saving public communications` });
    const template = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.code}), hashtext(${parsed.data.channel}))`);
      const existing = await tx.select({ version: communicationsTemplates.version }).from(communicationsTemplates)
        .where(and(eq(communicationsTemplates.code, parsed.data.code), eq(communicationsTemplates.channel, parsed.data.channel)))
        .orderBy(desc(communicationsTemplates.version)).limit(1);
      const version = (existing[0]?.version || 0) + 1;
      const [created] = await tx.insert(communicationsTemplates).values({ ...parsed.data, version, createdBy: req.auth!.id, status: "draft" }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.template_created", resourceType: "communications_template", resourceId: created.id, outcome: "success", metadata: { channel: created.channel, version } });
      return created;
    });
    res.status(201).json({ template });
  } catch (error) { next(error); }
});

communicationsRouter.post("/templates/:templateId/submit", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const outcome = await db.transaction(async tx => {
      const [template] = await tx.select().from(communicationsTemplates).where(eq(communicationsTemplates.id, req.params.templateId)).limit(1).for("update");
      if (!template) return { status: 404, error: "Template not found" } as const;
      if (template.createdBy !== req.auth!.id) return { status: 403, error: "Only the template creator may submit this version" } as const;
      if (template.status !== "draft") return { status: 409, error: "Only draft templates can be submitted" } as const;
      const issue = publicDisclosureIssue(template.body);
      if (issue) return { status: 409, error: `Template privacy review failed: possible ${issue}` } as const;
      const [updated] = await tx.update(communicationsTemplates).set({ status: "pending_approval" }).where(eq(communicationsTemplates.id, template.id)).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.template_submitted", resourceType: "communications_template", resourceId: template.id, outcome: "success" });
      return { template: updated };
    });
    if ("error" in outcome) return res.status(outcome.status ?? 500).json({ error: outcome.error });
    res.json({ template: outcome.template });
  } catch (error) { next(error); }
});

communicationsRouter.patch("/templates/:templateId/approve", requireRole("admin", "owner"),
  (req, res, next) => requireStepUpInTransaction("admin.communications.approve")(req, res, next), async (req, res, next) => {
    try {
      const parsed = z.object({ decision: z.enum(["approve", "return_for_revision"]), note: z.string().trim().min(5).max(1000) }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Provide a valid template decision and review note" });
      const outcome = await db.transaction(async tx => {
        const [template] = await tx.select().from(communicationsTemplates).where(eq(communicationsTemplates.id, req.params.templateId)).limit(1).for("update");
        if (!template) return { status: 404, error: "Template not found" } as const;
        if (template.createdBy === req.auth!.id) return { status: 409, error: "A creator cannot review their own template version" } as const;
        if (template.status !== "pending_approval") return { status: 409, error: "Template is not awaiting approval" } as const;
        const issue = publicDisclosureIssue(`${template.subject ?? ""}\n${template.body}`);
        if (issue) return { status: 409, error: `Template privacy review failed: possible ${issue}` } as const;
        const designated = await mayApprove(tx, req.auth!.id, req.auth!.roles, template.createdBy);
        if (!designated) return { status: 403, error: "Only the designated Communications Approver or a separate Owner may review this template" } as const;
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.approve");
        const nextStatus = parsed.data.decision === "approve" ? "approved" : "returned_for_revision";
        const [updated] = await tx.update(communicationsTemplates).set({ status: nextStatus,
          approvedBy: parsed.data.decision === "approve" ? req.auth!.id : null,
          approvedAt: parsed.data.decision === "approve" ? new Date() : null }).where(eq(communicationsTemplates.id, template.id)).returning();
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.template_reviewed", resourceType: "communications_template", resourceId: template.id, outcome: "success", metadata: { version: template.version, decision: parsed.data.decision, reviewNote: parsed.data.note, ownerOverride: req.auth!.roles.includes("owner") } });
        return { template: updated };
      });
      if ("error" in outcome) return res.status(outcome.status ?? 500).json({ error: outcome.error });
      res.json({ template: outcome.template });
    } catch (error) { next(error); }
  });

communicationsRouter.post("/campaigns", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ title: z.string().trim().min(3).max(180), purpose: z.enum(["service_update", "safety_notice", "found_notice", "community_information", "scam_warning"]), reportId: z.string().uuid().optional(), content: z.string().trim().min(20).max(8000), channels: z.array(z.enum(["email", "facebook", "telegram"])).min(1).max(3) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the campaign details and selected channels" });
    const privacyIssue = publicDisclosureIssue(`${parsed.data.title}\n${parsed.data.content}`);
    if (privacyIssue) return res.status(400).json({ error: `Remove possible private ${privacyIssue} before submitting this content` });
    if (parsed.data.purpose === "found_notice") {
      if (!parsed.data.reportId) return res.status(400).json({ error: "A found notice must be linked to a report with authorised custody" });
      const [report] = await db.select({ id: reports.id, kind: reports.kind, publicListingConsent: reports.publicListingConsent, status: reports.status })
        .from(reports).where(eq(reports.id, parsed.data.reportId)).limit(1);
      if (!report || report.kind !== "found" || !report.publicListingConsent || report.status !== "published")
        return res.status(409).json({ error: "The found report must be published with reporter consent before a public notice can be drafted" });
      const [custody] = await db.select({ id: custodyEvents.id }).from(custodyEvents)
        .where(and(eq(custodyEvents.reportId, report.id), eq(custodyEvents.eventType, "handover_ready"))).limit(1);
      if (!custody) return res.status(409).json({ error: "The found item must have an authorised custody record before a public notice can be drafted" });
    }
    const campaign = await db.transaction(async tx => {
      const [created] = await tx.insert(communicationsCampaigns).values({ reportId: parsed.data.reportId ?? null, title: parsed.data.title, purpose: parsed.data.purpose, createdBy: req.auth!.id, status: "draft" }).returning();
      for (const channel of [...new Set(parsed.data.channels)]) {
        await tx.insert(communicationsPublications).values({ campaignId: created.id, channel, body: parsed.data.content, status: "draft" });
      }
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_created", resourceType: "communications_campaign", resourceId: created.id, outcome: "success", metadata: { channels: [...new Set(parsed.data.channels)], reportLinked: Boolean(parsed.data.reportId), purpose: parsed.data.purpose } });
      return created;
    });
    res.status(201).json({ campaign });
  } catch (error) { next(error); }
});

communicationsRouter.post("/campaigns/:campaignId/submit", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const outcome = await db.transaction(async tx => {
      const [campaign] = await tx.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, req.params.campaignId)).limit(1).for("update");
      if (!campaign) return { status: 404, error: "Campaign not found" } as const;
      if (campaign.createdBy !== req.auth!.id) return { status: 403, error: "Only the campaign creator may submit this draft" } as const;
      if (campaign.status !== "draft") return { status: 409, error: "Only draft campaigns can be submitted" } as const;
      const privacyError = await validateCampaignPrivacy(tx, campaign.id);
      if (privacyError) return { status: 409, error: privacyError } as const;
      const foundNoticeError = await validateFoundNotice(tx, campaign);
      if (foundNoticeError) return { status: 409, error: foundNoticeError } as const;
      const [updated] = await tx.update(communicationsCampaigns).set({ status: "pending_approval" }).where(eq(communicationsCampaigns.id, campaign.id)).returning();
      await tx.update(communicationsPublications).set({ status: "pending_approval" }).where(eq(communicationsPublications.campaignId, campaign.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_submitted", resourceType: "communications_campaign", resourceId: campaign.id, outcome: "success" });
      return { campaign: updated };
    });
    if ("error" in outcome) return res.status(outcome.status ?? 500).json({ error: outcome.error });
    res.json({ campaign: outcome.campaign });
  } catch (error) { next(error); }
});

communicationsRouter.patch("/campaigns/:campaignId/approve", requireRole("admin", "owner"),
  (req, res, next) => requireStepUpInTransaction("admin.communications.approve")(req, res, next), async (req, res, next) => {
    try {
      const parsed = z.object({ decision: z.enum(["approve", "return_for_revision"]), note: z.string().trim().min(5).max(1000) }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Provide a valid approval decision and review note" });
      const outcome = await db.transaction(async tx => {
        const [campaign] = await tx.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, req.params.campaignId)).limit(1).for("update");
        if (!campaign) return { error: "Campaign not found", status: 404 } as const;
        if (campaign.createdBy === req.auth!.id) return { error: "A campaign creator cannot approve their own content, including as Owner" , status: 409 } as const;
        if (campaign.status !== "pending_approval") return { error: "Campaign is not awaiting approval", status: 409 } as const;
        const privacyError = await validateCampaignPrivacy(tx, campaign.id);
        if (privacyError) return { error: privacyError, status: 409 } as const;
        const foundNoticeError = await validateFoundNotice(tx, campaign);
        if (foundNoticeError) return { error: foundNoticeError, status: 409 } as const;
        if (!(await mayApprove(tx, req.auth!.id, req.auth!.roles, campaign.createdBy))) return { error: "Only the designated Communications Approver or a separate Owner may approve this campaign", status: 403 } as const;
        const nextStatus = parsed.data.decision === "approve" ? "approved" : "returned_for_revision";
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.approve");
        const [updated] = await tx.update(communicationsCampaigns).set({ status: nextStatus, approvedBy: req.auth!.id, approvedAt: new Date() }).where(eq(communicationsCampaigns.id, campaign.id)).returning();
        await tx.update(communicationsPublications).set({ status: nextStatus }).where(eq(communicationsPublications.campaignId, campaign.id));
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_reviewed", resourceType: "communications_campaign", resourceId: campaign.id, outcome: "success", metadata: { decision: parsed.data.decision, reviewNote: parsed.data.note, ownerOverride: req.auth!.roles.includes("owner") } });
        return { campaign: updated };
      });
      if ("error" in outcome) return res.status(outcome.status ?? 500).json({ error: outcome.error });
      res.json({ campaign: outcome.campaign, notice: "Approval is separate from publishing. No message has been sent or posted." });
    } catch (error) { next(error); }
  });

communicationsRouter.post("/campaigns/:campaignId/schedule", requireRole("admin", "owner"),
  (req, res, next) => requireStepUpInTransaction("admin.communications.schedule")(req, res, next), async (req, res, next) => {
    try {
      const parsed = z.object({ scheduledAt: z.string().datetime() }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Provide a valid scheduled publication time" });
      const scheduledAt = new Date(parsed.data.scheduledAt);
      if (scheduledAt.getTime() < Date.now() + 5 * 60_000 || scheduledAt.getTime() > Date.now() + 365 * 24 * 60 * 60_000)
        return res.status(400).json({ error: "Schedule must be at least five minutes and no more than one year in the future" });
      const outcome = await db.transaction(async tx => {
        const [campaign] = await tx.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, req.params.campaignId)).limit(1).for("update");
        if (!campaign) return { status: 404, error: "Campaign not found" } as const;
        if (campaign.status !== "approved" || !campaign.approvedBy || campaign.approvedBy === campaign.createdBy)
          return { status: 409, error: "Only independently approved campaigns can be scheduled" } as const;
        const foundNoticeError = await validateFoundNotice(tx, campaign);
        if (foundNoticeError) return { status: 409, error: foundNoticeError } as const;
        const privacyError = await validateCampaignPrivacy(tx, campaign.id);
        if (privacyError) return { status: 409, error: privacyError } as const;
        if (req.auth!.id === campaign.createdBy || req.auth!.id === campaign.approvedBy)
          return { status: 409, error: "The scheduler must be separate from both the campaign creator and approver" } as const;
        const [governance] = await tx.select({ publisherUserId: communicationsGovernance.publisherUserId }).from(communicationsGovernance)
          .where(eq(communicationsGovernance.singletonId, 1)).limit(1).for("update");
        if (governance?.publisherUserId !== req.auth!.id) return { status: 403, error: "Only the designated Communications Publisher may schedule this campaign" } as const;
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.schedule");
        const [updated] = await tx.update(communicationsCampaigns).set({ scheduledAt }).where(eq(communicationsCampaigns.id, campaign.id)).returning();
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_scheduled", resourceType: "communications_campaign", resourceId: campaign.id, outcome: "success", metadata: { scheduledAt: scheduledAt.toISOString(), externalPublishingEnabled: false } });
        return { campaign: updated };
      });
      if ("error" in outcome) return res.status(outcome.status ?? 500).json({ error: outcome.error });
      res.json({ campaign: outcome.campaign, notice: "Schedule recorded. External publishing remains disabled; no automatic message will be sent." });
    } catch (error) { next(error); }
  });

communicationsRouter.post("/campaigns/:campaignId/withdraw", requireRole("admin", "owner"),
  (req, res, next) => requireStepUpInTransaction("admin.communications.withdraw")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ reason: z.string().trim().min(10).max(1000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a withdrawal or correction reason" });
    const outcome = await db.transaction(async tx => {
      const [campaign] = await tx.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, req.params.campaignId)).limit(1).for("update");
      if (!campaign) return { status: 404, error: "Campaign not found" } as const;
      if (["withdrawn", "takedown_pending"].includes(campaign.status)) return { status: 409, error: "Campaign has already been withdrawn or referred for takedown" } as const;
      const publications = await tx.select().from(communicationsPublications).where(eq(communicationsPublications.campaignId, campaign.id));
      const requiresTakedown = publications.some(item => Boolean(item.publishedAt));
      const nextStatus = requiresTakedown ? "takedown_pending" : "withdrawn";
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.withdraw");
      const now = new Date();
      const [updated] = await tx.update(communicationsCampaigns).set({ status: nextStatus, withdrawnAt: now, withdrawnBy: req.auth!.id, withdrawalReason: parsed.data.reason }).where(eq(communicationsCampaigns.id, campaign.id)).returning();
      await tx.update(communicationsPublications).set({ status: requiresTakedown ? "takedown_pending" : "withdrawn", withdrawnAt: now, withdrawnBy: req.auth!.id, withdrawalReason: parsed.data.reason }).where(eq(communicationsPublications.campaignId, campaign.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_withdrawn", resourceType: "communications_campaign", resourceId: campaign.id, outcome: "success", metadata: { reason: parsed.data.reason, requiresExternalTakedown: requiresTakedown } });
      return { campaign: updated, requiresTakedown };
    });
    if ("error" in outcome) return res.status(outcome.status ?? 500).json({ error: outcome.error });
    res.json({ campaign: outcome.campaign, notice: outcome.requiresTakedown ? "Withdrawal recorded; external takedown requires separately authorised manual action." : "Campaign withdrawn before publication." });
  } catch (error) { next(error); }
});

communicationsRouter.get("/publishing-queue", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const queue = await db.select({ publication: communicationsPublications, campaign: communicationsCampaigns })
      .from(communicationsPublications).innerJoin(communicationsCampaigns, eq(communicationsPublications.campaignId, communicationsCampaigns.id))
      .where(eq(communicationsCampaigns.status, "approved")).orderBy(desc(communicationsPublications.createdAt));
    res.json({ queue, externalPublishingEnabled: false });
  } catch (error) { next(error); }
});

communicationsRouter.post("/publications/:publicationId/publish", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const [publication] = await db.select().from(communicationsPublications).where(eq(communicationsPublications.id, req.params.publicationId)).limit(1);
    if (!publication) return res.status(404).json({ error: "Publication not found" });
    const [campaign] = await db.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, publication.campaignId)).limit(1);
    if (!campaign || campaign.status !== "approved" || !campaign.approvedBy || campaign.approvedBy === campaign.createdBy) return res.status(409).json({ error: "A separate approval is required before publishing" });
    const prePublishChecks = await db.transaction(async tx => ({ foundNoticeError: await validateFoundNotice(tx, campaign), privacyError: await validateCampaignPrivacy(tx, campaign.id) }));
    if (prePublishChecks.foundNoticeError) return res.status(409).json({ error: prePublishChecks.foundNoticeError });
    if (prePublishChecks.privacyError) return res.status(409).json({ error: prePublishChecks.privacyError });
    if (req.auth!.id === campaign.createdBy || req.auth!.id === campaign.approvedBy) return res.status(409).json({ error: "The publisher must be separate from both the campaign creator and approver" });
    const designatedPublisher = await getPublisherUserId();
    if (designatedPublisher !== req.auth!.id) return res.status(403).json({ error: "Only the designated Communications Publisher may publish approved content" });
    await db.transaction(async tx => {
      await tx.update(communicationsPublications).set({ attempts: sql`${communicationsPublications.attempts} + 1`, lastErrorCode: "external_channel_disabled" }).where(eq(communicationsPublications.id, publication.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.publish_blocked", resourceType: "communications_publication", resourceId: publication.id, outcome: "denied", metadata: { channel: publication.channel, reason: "external_channel_disabled" } });
    });
    res.status(423).json({ error: "External publishing is disabled until channel credentials, consent, privacy, moderation, delivery and takedown controls are independently accepted." });
  } catch (error) { next(error); }
});

communicationsRouter.get("/delivery-health", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    const eventRows = await db.select({ channel: communicationsDeliveryEvents.channel, eventType: communicationsDeliveryEvents.eventType,
      count: sql<number>`count(*)::int` }).from(communicationsDeliveryEvents)
      .where(sql`${communicationsDeliveryEvents.occurredAt} >= now() - interval '30 days'`)
      .groupBy(communicationsDeliveryEvents.channel, communicationsDeliveryEvents.eventType);
    const outboxRows = await db.execute(sql`SELECT status, count(*)::int AS count FROM notification_outbox GROUP BY status`);
    res.json({ windowDays: 30, deliveryEvents: eventRows, inAppOutbox: outboxRows.rows,
      piiExposed: false, providerWebhookIngestionEnabled: false,
      notice: "Delivery event ingestion is not connected to a provider. Counts reflect only recorded events and must not be interpreted as complete deliverability metrics." });
  } catch (error) { next(error); }
});

communicationsRouter.get("/consents/me", async (req, res, next) => {
  try {
    const consents = await db.select({ channel: communicationConsents.channel, purpose: communicationConsents.purpose,
      status: communicationConsents.status, policyVersion: communicationConsents.policyVersion,
      grantedAt: communicationConsents.grantedAt, revokedAt: communicationConsents.revokedAt })
      .from(communicationConsents).where(eq(communicationConsents.userId, req.auth!.id)).orderBy(desc(communicationConsents.createdAt)).limit(50);
    res.json({ consents });
  } catch (error) { next(error); }
});

communicationsRouter.post("/consents", async (req, res, next) => {
  try {
    const parsed = z.object({ channel: z.enum(["email", "sms"]), purpose: z.literal("community_updates"), action: z.enum(["grant", "revoke"]),
      policyVersion: z.string().trim().min(3).max(40), consentConfirmed: z.boolean().optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid communication consent request" });
    if (parsed.data.channel === "sms") return res.status(423).json({ error: "SMS is not enabled for launch and cannot be subscribed to yet" });
    if (parsed.data.policyVersion !== COMMUNITY_EMAIL_CONSENT_VERSION) return res.status(409).json({ error: "The consent text version has changed. Refresh the preference screen before continuing." });
    if (parsed.data.action === "grant" && parsed.data.consentConfirmed !== true) return res.status(400).json({ error: "Explicit confirmation is required to grant email consent" });
    const result = await db.transaction(async tx => {
      if (parsed.data.action === "grant") {
        await tx.update(communicationConsents).set({ status: "revoked", revokedAt: new Date() })
          .where(and(eq(communicationConsents.userId, req.auth!.id), eq(communicationConsents.channel, "email"), eq(communicationConsents.purpose, "community_updates"), eq(communicationConsents.status, "granted")));
        const [consent] = await tx.insert(communicationConsents).values({ userId: req.auth!.id, channel: "email", purpose: "community_updates", status: "granted",
          policyVersion: COMMUNITY_EMAIL_CONSENT_VERSION, consentTextHash, source: "account_settings", grantedAt: new Date() }).returning({ id: communicationConsents.id, grantedAt: communicationConsents.grantedAt });
        await tx.insert(notificationPreferences).values({ userId: req.auth!.id, emailCommunityUpdates: true }).onConflictDoUpdate({
          target: notificationPreferences.userId, set: { emailCommunityUpdates: true, updatedAt: new Date() }
        });
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.email_consent_granted", resourceType: "communication_consent", resourceId: consent.id, outcome: "success", metadata: { purpose: "community_updates", policyVersion: COMMUNITY_EMAIL_CONSENT_VERSION, consentTextHash } });
        return { status: "granted", consent };
      }
      const [active] = await tx.update(communicationConsents).set({ status: "revoked", revokedAt: new Date() })
        .where(and(eq(communicationConsents.userId, req.auth!.id), eq(communicationConsents.channel, "email"), eq(communicationConsents.purpose, "community_updates"), eq(communicationConsents.status, "granted")))
        .returning({ id: communicationConsents.id });
      await tx.insert(notificationPreferences).values({ userId: req.auth!.id, emailCommunityUpdates: false }).onConflictDoUpdate({
        target: notificationPreferences.userId, set: { emailCommunityUpdates: false, updatedAt: new Date() }
      });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.email_consent_revoked", resourceType: "communication_consent", resourceId: active?.id ?? req.auth!.id, outcome: "success", metadata: { purpose: "community_updates" } });
      return { status: "revoked" };
    });
    res.json({ consent: result, notice: parsed.data.action === "grant" ? "Optional community email consent recorded. Essential account, security and financial messages remain governed separately." : "Community email consent withdrawn. Essential account, security and financial messages remain governed separately." });
  } catch (error) { next(error); }
});
