import { Router } from "express";
import { notifySafely } from "../services/notifications.js";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, categoryProposals, itemCategories, pricingRules, pricingSchedules } from "../db/schema.js";
import { authenticate, requireRole, requireStepUp, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";

export const pricingRouter = Router();
pricingRouter.use(authenticate);
const builtInCategories = ["Personal belongings", "Documents and identity", "Electronics", "Jewellery and valuables", "School and work", "Transport-related", "Medical and assistive", "Children's items", "Cash and payment cards", "Household", "Other"];

const slugFor = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

pricingRouter.get("/categories", async (_req, res, next) => {
  try {
    const rows = await db.select({ id: itemCategories.id, name: itemCategories.name, slug: itemCategories.slug, active: itemCategories.active }).from(itemCategories).where(eq(itemCategories.active, true));
    const bySlug = new Map(rows.map(row => [row.slug, row]));
    const builtInSlugs = new Set(builtInCategories.map(slugFor));
    const categories = [
      ...builtInCategories.map(name => {
        const row = bySlug.get(slugFor(name));
        return { id: row?.id ?? null, name, slug: slugFor(name), active: true, source: "built_in" as const, seeded: Boolean(row) };
      }),
      ...rows.filter(row => !builtInSlugs.has(row.slug)).map(row => ({ ...row, source: "admin_approved" as const, seeded: true }))
    ];
    res.json({ categories });
  } catch (error) { next(error); }
});

pricingRouter.post("/categories/seed-builtins", requireRole("admin"), async (req, res, next) => {
  try {
    const createdBy = req.auth!.id;
    await db.transaction(async tx => {
      for (const name of builtInCategories) {
        const slug = slugFor(name);
        await tx.insert(itemCategories).values({ name, slug, description: "Standard Return4me item category", createdBy }).onConflictDoNothing();
      }
      await tx.insert(auditEvents).values({ actorId: createdBy, action: "pricing.categories_seeded", resourceType: "item_categories", outcome: "success", metadata: { standardCategoryCount: builtInCategories.length } });
    });
    const rows = await db.select({ id: itemCategories.id, name: itemCategories.name, slug: itemCategories.slug }).from(itemCategories).where(eq(itemCategories.active, true));
    res.json({ seeded: true, categories: rows, notice: "Standard categories now have database IDs. No price amounts were created or activated." });
  } catch (error) { next(error); }
});

pricingRouter.post("/category-proposals", async (req, res, next) => {
  try {
    const parsed = z.object({ proposedName: z.string().trim().min(2).max(100), explanation: z.string().trim().min(15).max(1000), reportId: z.string().uuid().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a category name and explain why it is needed" });
    const [proposal] = await db.insert(categoryProposals).values({ ...parsed.data, proposedBy: req.auth!.id, proposedEmail: req.auth!.email }).returning({ id: categoryProposals.id, proposedName: categoryProposals.proposedName, status: categoryProposals.status, createdAt: categoryProposals.createdAt });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "category.proposed", resourceType: "category_proposal", resourceId: proposal.id, outcome: "success" });
    res.status(201).json({ proposal, notice: "The proposal is private and pending administrator review. It is not a permanent category." });
  } catch (error) { next(error); }
});

pricingRouter.get("/category-proposals", requireRole("admin"), async (_req, res, next) => {
  try { res.json({ proposals: await db.select().from(categoryProposals).orderBy(desc(categoryProposals.createdAt)).limit(200) }); }
  catch (error) { next(error); }
});

pricingRouter.patch("/category-proposals/:proposalId", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["approved", "rejected"]), createPermanentCategory: z.boolean().default(false),
      reasonCode: z.enum(["approved_created", "approved_for_review", "not_unique", "insufficient_detail", "outside_supported_scope", "not_suitable"]).optional(),
      reviewNote: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid category review decision" });
    const result = await db.transaction(async (tx) => {
      const [proposal] = await tx.select().from(categoryProposals)
        .where(eq(categoryProposals.id, req.params.proposalId)).limit(1).for("update");
      if (!proposal) return fail(404, "Category proposal not found");
      if (proposal.status !== "pending") return fail(409, "Category proposal was already reviewed");
      if (parsed.data.createPermanentCategory && parsed.data.status !== "approved") {
        return fail(400, "A permanent category can only be created when the proposal is approved");
      }
      const reasonCode = parsed.data.status === "approved" ? (parsed.data.createPermanentCategory ? "approved_created" : "approved_for_review") : (parsed.data.reasonCode || "not_suitable");
      await tx.update(categoryProposals).set({ status: parsed.data.status, reviewedBy: req.auth!.id, reviewedAt: new Date(),
        reviewReasonCode: reasonCode, reviewNote: parsed.data.reviewNote || null }).where(eq(categoryProposals.id, proposal.id));
      if (parsed.data.status === "approved" && parsed.data.createPermanentCategory) {
        const slug = slugFor(proposal.proposedName);
        await tx.insert(itemCategories).values({ name: proposal.proposedName, slug, description: proposal.explanation, createdBy: req.auth!.id }).onConflictDoNothing();
      }
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "category.proposal_reviewed", resourceType: "category_proposal", resourceId: proposal.id, outcome: "success", metadata: { status: parsed.data.status, permanentCategoryCreated: parsed.data.status === "approved" && parsed.data.createPermanentCategory } });
      return succeed({ reviewed: true as const, status: parsed.data.status, permanentCategoryCreated: parsed.data.status === "approved" && parsed.data.createPermanentCategory,
        proposedBy: proposal.proposedBy, proposedName: proposal.proposedName, reasonCode, reviewNote: parsed.data.reviewNote || null });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    if (result.value.proposedBy) {
      const body = result.value.status === "approved"
        ? result.value.permanentCategoryCreated ? `Your proposed category “${result.value.proposedName}” was approved and created as a permanent category.` : `Your proposed category “${result.value.proposedName}” was approved for consideration. No permanent category was created.`
        : `Your proposed category “${result.value.proposedName}” was not approved. Reason: ${result.value.reasonCode}.${result.value.reviewNote ? ` Note: ${result.value.reviewNote}` : ""}`;
      notifySafely({ userId: result.value.proposedBy, type: "category_proposal_decision", title: result.value.status === "approved" ? "Your category proposal was approved" : "Your category proposal was not approved", body, link: "/workspace" });
    }
    res.json({ reviewed: true, status: result.value.status, permanentCategoryCreated: result.value.permanentCategoryCreated });
  } catch (error) { next(error); }
});

pricingRouter.post("/schedules", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ version: z.string().trim().min(2).max(40), currency: z.literal("KES"), effectiveFrom: z.string().datetime().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A version and KES currency are required" });
    const [schedule] = await db.insert(pricingSchedules).values({ version: parsed.data.version, currency: "KES", status: "draft", effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null, createdBy: req.auth!.id }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "pricing.schedule_created", resourceType: "pricing_schedule", resourceId: schedule.id, outcome: "success" });
    res.status(201).json({ schedule, notice: "Draft schedule created. It is not active and cannot be used to charge a claimant." });
  } catch (error) { next(error); }
});

pricingRouter.post("/schedules/:scheduleId/rules", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ categoryId: z.string().uuid(), subcategory: z.string().trim().max(100).optional(), amountKes: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/), rulePriority: z.number().int().min(1).max(100).default(10) }).safeParse(req.body);
    if (!parsed.success || Number(parsed.data.amountKes) <= 0) return res.status(400).json({ error: "Provide a positive KES amount and a valid category" });
    const [schedule] = await db.select().from(pricingSchedules).where(eq(pricingSchedules.id, req.params.scheduleId)).limit(1);
    if (!schedule) return res.status(404).json({ error: "Pricing schedule not found" });
    if (schedule.status !== "draft") return res.status(409).json({ error: "Only draft schedules can be changed" });
    const [rule] = await db.insert(pricingRules).values({ scheduleId: schedule.id, ...parsed.data }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "pricing.rule_created", resourceType: "pricing_rule", resourceId: rule.id, outcome: "success" });
    res.status(201).json({ rule });
  } catch (error) { next(error); }
});

pricingRouter.patch("/schedules/:scheduleId/approve", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.pricing.schedule.approve")(req, res, next), async (req, res, next) => {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [schedule] = await tx.select().from(pricingSchedules).where(eq(pricingSchedules.id, req.params.scheduleId)).limit(1).for("update");
      if (!schedule) return { error: "Pricing schedule not found", status: 404 } as const;
      if (schedule.createdBy === req.auth!.id && !req.auth!.roles.includes("owner")) return { error: "An Admin cannot approve their own schedule; the Super Admin (Owner) may make the final decision", status: 409 } as const;
      if (schedule.status !== "draft") return { error: "Only a draft schedule can be approved", status: 409 } as const;
      const rules = await tx.select().from(pricingRules).where(and(eq(pricingRules.scheduleId, schedule.id), eq(pricingRules.active, true)));
      if (!rules.length) return { error: "A schedule with no price rules cannot be approved", status: 409 } as const;
      const effectiveFrom = schedule.effectiveFrom || new Date();
      if (effectiveFrom > new Date()) return { error: "Future-effective schedules require a separately tested activation scheduler", status: 409 } as const;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.pricing.schedule.approve");
      const activeSchedules = await tx.select({ id: pricingSchedules.id }).from(pricingSchedules).where(eq(pricingSchedules.status, "active"));
      for (const active of activeSchedules) {
        if (active.id !== schedule.id) await tx.update(pricingSchedules).set({ status: "expired", effectiveUntil: new Date() }).where(eq(pricingSchedules.id, active.id));
      }
      await tx.update(pricingSchedules).set({ status: "active", approvedBy: req.auth!.id, approvedAt: new Date(), effectiveFrom }).where(eq(pricingSchedules.id, schedule.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "pricing.schedule_approved", resourceType: "pricing_schedule", resourceId: schedule.id, outcome: "success", metadata: { version: schedule.version, currency: "KES", ruleCount: rules.length, ownerFinalOverride: req.auth!.roles.includes("owner") && schedule.createdBy === req.auth!.id } });
      return { approved: true as const };
    });
    if ("error" in outcome) return res.status(outcome.status).json({ error: outcome.error });
    res.json({ approved: true, notice: "The versioned schedule is now active. Existing assessments retain their original schedule version." });
  } catch (error) { next(error); }
});

pricingRouter.get("/active-schedule", async (_req, res, next) => {
  try {
    const [schedule] = await db.select().from(pricingSchedules).where(eq(pricingSchedules.status, "active")).orderBy(desc(pricingSchedules.approvedAt)).limit(1);
    if (!schedule) return res.status(404).json({ error: "No approved pricing schedule is active" });
    const rules = await db.select().from(pricingRules).where(and(eq(pricingRules.scheduleId, schedule.id), eq(pricingRules.active, true)));
    res.json({ schedule: { version: schedule.version, currency: schedule.currency, effectiveFrom: schedule.effectiveFrom }, rules });
  } catch (error) { next(error); }
});
