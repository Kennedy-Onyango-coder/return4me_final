import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, communicationsCampaigns, communicationsPublications, communicationsTemplates } from "../db/schema.js";
import { authenticate, requireRole, requireStepUp, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { publicDisclosureIssue } from "../services/privacy.js";

export const communicationsRouter = Router();
communicationsRouter.use(authenticate);


communicationsRouter.get("/templates", requireRole("communications_writer", "communications_approver", "communications_publisher", "admin"), async (_req, res, next) => {
  try { res.json({ templates: await db.select().from(communicationsTemplates).orderBy(desc(communicationsTemplates.createdAt)).limit(200) }); }
  catch (error) { next(error); }
});

communicationsRouter.post("/templates", requireRole("communications_writer"), async (req, res, next) => {
  try {
    const parsed = z.object({ code: z.string().trim().min(2).max(80), channel: z.enum(["email", "facebook", "telegram"]), subject: z.string().trim().max(200).optional(), body: z.string().trim().min(20).max(8000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the template details" });
    const privacyIssue = publicDisclosureIssue(parsed.data.body);
    if (privacyIssue) return res.status(400).json({ error: `Remove possible private ${privacyIssue} before saving public communications` });
    const existing = await db.select().from(communicationsTemplates).where(and(eq(communicationsTemplates.code, parsed.data.code), eq(communicationsTemplates.channel, parsed.data.channel))).orderBy(desc(communicationsTemplates.version)).limit(1);
    const version = (existing[0]?.version || 0) + 1;
    const [template] = await db.insert(communicationsTemplates).values({ ...parsed.data, version, createdBy: req.auth!.id, status: "draft" }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.template_created", resourceType: "communications_template", resourceId: template.id, outcome: "success", metadata: { channel: template.channel, version } });
    res.status(201).json({ template });
  } catch (error) { next(error); }
});

communicationsRouter.post("/campaigns", requireRole("communications_writer"), async (req, res, next) => {
  try {
    const parsed = z.object({ title: z.string().trim().min(3).max(180), purpose: z.enum(["service_update", "safety_notice", "found_notice", "community_information", "scam_warning"]), content: z.string().trim().min(20).max(8000), channels: z.array(z.enum(["email", "facebook", "telegram"])).min(1).max(3) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the campaign details and selected channels" });
    const privacyIssue = publicDisclosureIssue(parsed.data.content);
    if (privacyIssue) return res.status(400).json({ error: `Remove possible private ${privacyIssue} before submitting this content` });
    const campaign = await db.transaction(async (tx) => {
      const [created] = await tx.insert(communicationsCampaigns).values({ title: parsed.data.title, purpose: parsed.data.purpose, createdBy: req.auth!.id, status: "draft" }).returning();
      for (const channel of [...new Set(parsed.data.channels)]) {
        await tx.insert(communicationsPublications).values({ campaignId: created.id, channel, body: parsed.data.content, status: "draft" });
      }
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_created", resourceType: "communications_campaign", resourceId: created.id, outcome: "success", metadata: { channels: parsed.data.channels } });
      return created;
    });
    res.status(201).json({ campaign });
  } catch (error) { next(error); }
});

communicationsRouter.post("/campaigns/:campaignId/submit", requireRole("communications_writer"), async (req, res, next) => {
  try {
    const [campaign] = await db.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, req.params.campaignId)).limit(1);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.createdBy !== req.auth!.id) return res.status(403).json({ error: "Only the campaign creator may submit this draft" });
    if (campaign.status !== "draft") return res.status(409).json({ error: "Only draft campaigns can be submitted" });
    const publications = await db.select().from(communicationsPublications).where(eq(communicationsPublications.campaignId, campaign.id));
    if (!publications.length) return res.status(409).json({ error: "Campaign has no channel content" });
    for (const publication of publications) {
      const privacyIssue = publicDisclosureIssue(publication.body);
      if (privacyIssue) return res.status(409).json({ error: `A privacy review is required: possible ${privacyIssue}` });
    }
    const [updated] = await db.update(communicationsCampaigns).set({ status: "pending_approval" }).where(eq(communicationsCampaigns.id, campaign.id)).returning();
    await db.update(communicationsPublications).set({ status: "pending_approval" }).where(eq(communicationsPublications.campaignId, campaign.id));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_submitted", resourceType: "communications_campaign", resourceId: campaign.id, outcome: "success" });
    res.json({ campaign: updated });
  } catch (error) { next(error); }
});

communicationsRouter.patch("/campaigns/:campaignId/approve", requireRole("admin", "owner"), (req,res,next)=>requireStepUpInTransaction("admin.communications.approve")(req,res,next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["approve", "return_for_revision"]), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid approval decision" });
    const outcome = await db.transaction(async tx => {
      const [campaign] = await tx.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, req.params.campaignId)).limit(1).for("update");
      if (!campaign) return { error: "Campaign not found", status: 404 } as const;
      if (campaign.createdBy === req.auth!.id && !req.auth!.roles.includes("owner")) return { error: "An Admin cannot approve their own content; the Super Admin (Owner) may make the final decision", status: 409 } as const;
      if (campaign.status !== "pending_approval") return { error: "Campaign is not awaiting approval", status: 409 } as const;
      const nextStatus = parsed.data.decision === "approve" ? "approved" : "returned_for_revision";
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.communications.approve");
      const [updated] = await tx.update(communicationsCampaigns).set({ status: nextStatus, approvedBy: req.auth!.id, approvedAt: new Date() }).where(eq(communicationsCampaigns.id, campaign.id)).returning();
      await tx.update(communicationsPublications).set({ status: nextStatus }).where(eq(communicationsPublications.campaignId, campaign.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "communications.campaign_reviewed", resourceType: "communications_campaign", resourceId: campaign.id, outcome: "success", metadata: { decision: parsed.data.decision, notePresent: Boolean(parsed.data.note), ownerFinalOverride: req.auth!.roles.includes("owner") && campaign.createdBy === req.auth!.id } });
      return { campaign: updated };
    });
    if ("error" in outcome) return res.status(outcome.status).json({ error: outcome.error });
    res.json({ campaign: outcome.campaign, notice: "Approval is separate from publishing. No message has been sent or posted." });
  } catch (error) { next(error); }
});

communicationsRouter.get("/publishing-queue", requireRole("communications_publisher"), async (_req, res, next) => {
  try {
    const queue = await db.select({ publication: communicationsPublications, campaign: communicationsCampaigns })
      .from(communicationsPublications).innerJoin(communicationsCampaigns, eq(communicationsPublications.campaignId, communicationsCampaigns.id))
      .where(eq(communicationsCampaigns.status, "approved")).orderBy(desc(communicationsPublications.createdAt));
    res.json({ queue });
  } catch (error) { next(error); }
});

communicationsRouter.post("/publications/:publicationId/publish", requireRole("communications_publisher"), async (req, res) => {
  const [publication] = await db.select().from(communicationsPublications).where(eq(communicationsPublications.id, req.params.publicationId)).limit(1);
  if (!publication) return res.status(404).json({ error: "Publication not found" });
  const [campaign] = await db.select().from(communicationsCampaigns).where(eq(communicationsCampaigns.id, publication.campaignId)).limit(1);
  if (!campaign || campaign.status !== "approved" || !campaign.approvedBy || campaign.approvedBy === campaign.createdBy) return res.status(409).json({ error: "A separate approval is required before publishing" });
  // Facebook and Telegram credentials/permissions are intentionally not invoked until independently verified.
  // Resend bulk communications also remain disabled until consent, unsubscribe and deliverability controls pass.
  return res.status(423).json({ error: "External publishing is disabled until channel credentials, privacy review, consent, retry and delivery controls are verified." });
});
