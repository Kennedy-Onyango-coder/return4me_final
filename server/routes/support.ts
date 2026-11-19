import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditEvents, supportMessages, supportTickets, userRoles, users } from "../db/schema.js";
import { authenticate, requireRole } from "../security.js";
import { hasAdminAuthority } from "../../shared/admin-role-policy.mjs";
import { parseSupportAssignment, parseSupportQueueQuery } from "../../shared/support-queue-policy.mjs";

export const supportRouter = Router();
supportRouter.use(authenticate);

supportRouter.post("/tickets", async (req, res, next) => {
  try {
    const parsed = z.object({ category: z.enum(["account", "report", "claim", "agent", "organisation", "payment", "safety", "other"]), subject: z.string().trim().min(5).max(180), description: z.string().trim().min(20).max(4000), relatedReportId: z.string().uuid().optional(), relatedClaimId: z.string().uuid().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the support request details" });
    const reference = `SUP-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [ticket] = await db.insert(supportTickets).values({ ...parsed.data, requesterId: req.auth!.id, reference, priority: parsed.data.category === "safety" ? "high" : "normal" }).returning();
    await db.insert(supportMessages).values({ ticketId: ticket.id, authorId: req.auth!.id, body: parsed.data.description, visibility: "customer" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "support.ticket_created", resourceType: "support_ticket", resourceId: ticket.id, outcome: "success" });
    res.status(201).json({ ticket: { id: ticket.id, reference: ticket.reference, status: ticket.status, createdAt: ticket.createdAt } });
  } catch (error) { next(error); }
});

supportRouter.get("/mine", async (req, res, next) => {
  try {
    const tickets = await db.select().from(supportTickets).where(eq(supportTickets.requesterId, req.auth!.id)).orderBy(desc(supportTickets.createdAt));
    res.json({ tickets });
  } catch (error) { next(error); }
});

supportRouter.get("/queue", requireRole("support", "admin"), async (req, res, next) => {
  try {
    const parsed = parseSupportQueueQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { status, limit, offset } = parsed.value;
    const isAdmin = hasAdminAuthority(req.auth!.roles);
    const visibility = isAdmin
      ? eq(supportTickets.status, status)
      : and(eq(supportTickets.status, status), or(eq(supportTickets.assignedTo, req.auth!.id), isNull(supportTickets.assignedTo)));
    const tickets = await db.select({
      id: supportTickets.id, reference: supportTickets.reference, category: supportTickets.category,
      subject: supportTickets.subject, priority: supportTickets.priority, status: supportTickets.status,
      assignedTo: supportTickets.assignedTo, createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt
    }).from(supportTickets).where(visibility).orderBy(desc(supportTickets.priority), desc(supportTickets.createdAt)).limit(limit).offset(offset);
    res.json({ tickets, page: { limit, offset, hasMore: tickets.length === limit } });
  } catch (error) { next(error); }
});

supportRouter.patch("/tickets/:ticketId/assignment", requireRole("support", "admin"), async (req, res, next) => {
  try {
    const parsed = parseSupportAssignment(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const isAdmin = hasAdminAuthority(req.auth!.roles);
    const result = await db.transaction(async (tx) => {
      const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, req.params.ticketId)).limit(1).for("update");
      if (!ticket) return { kind: "missing" as const };
      if (!isAdmin && ticket.assignedTo && ticket.assignedTo !== req.auth!.id) return { kind: "forbidden" as const };
      if (!isAdmin && parsed.value.assignedTo !== null && parsed.value.assignedTo !== req.auth!.id) return { kind: "forbidden" as const };
      if (parsed.value.assignedTo) {
        const [eligible] = await tx.select({ id: users.id }).from(users)
          .innerJoin(userRoles, eq(userRoles.userId, users.id))
          .where(and(eq(users.id, parsed.value.assignedTo), eq(users.isSuspended, false), isNotNull(users.emailVerifiedAt), inArray(userRoles.role, ["admin", "owner"]), isNull(userRoles.revokedAt)))
          .limit(1);
        if (!eligible) return { kind: "invalid_assignee" as const };
      }
      const [updated] = await tx.update(supportTickets).set({ assignedTo: parsed.value.assignedTo, updatedAt: new Date() })
        .where(eq(supportTickets.id, ticket.id)).returning({ id: supportTickets.id, reference: supportTickets.reference, assignedTo: supportTickets.assignedTo, updatedAt: supportTickets.updatedAt });
      await tx.insert(auditEvents).values({
        actorId: req.auth!.id, action: "support.ticket_assignment_changed", resourceType: "support_ticket",
        resourceId: ticket.id, outcome: "success",
        metadata: { before: { assignedTo: ticket.assignedTo }, after: { assignedTo: updated.assignedTo }, reason: parsed.value.reason }
      });
      return { kind: "updated" as const, ticket: updated };
    });
    if (result.kind === "missing") return res.status(404).json({ error: "Support ticket not found" });
    if (result.kind === "forbidden") return res.status(403).json({ error: "You may only claim or release tickets assigned to you" });
    if (result.kind === "invalid_assignee") return res.status(400).json({ error: "Assignee must be an active, verified Admin or Owner" });
    res.json({ ticket: result.ticket });
  } catch (error) { next(error); }
});

supportRouter.get("/tickets/:ticketId/messages", async (req, res, next) => {
  try {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, req.params.ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });
    const privileged = hasAdminAuthority(req.auth!.roles);
    if (!privileged && ticket.requesterId !== req.auth!.id && ticket.assignedTo !== req.auth!.id) return res.status(403).json({ error: "You cannot view this ticket" });
    const messageQuery = db.select().from(supportMessages).where(privileged
      ? eq(supportMessages.ticketId, ticket.id)
      : and(eq(supportMessages.ticketId, ticket.id), eq(supportMessages.visibility, "customer")));
    const messages = await messageQuery.orderBy(supportMessages.createdAt);
    res.json({ messages });
  } catch (error) { next(error); }
});

supportRouter.post("/tickets/:ticketId/messages", async (req, res, next) => {
  try {
    const parsed = z.object({ body: z.string().trim().min(2).max(4000), visibility: z.enum(["customer", "internal"]).default("customer") }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Message is required" });
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, req.params.ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });
    const privileged = hasAdminAuthority(req.auth!.roles);
    if (!privileged && ticket.requesterId !== req.auth!.id) return res.status(403).json({ error: "You cannot reply to this ticket" });
    if (parsed.data.visibility === "internal" && !privileged) return res.status(403).json({ error: "Internal notes are restricted to support staff" });
    const [message] = await db.insert(supportMessages).values({ ticketId: ticket.id, authorId: req.auth!.id, body: parsed.data.body, visibility: parsed.data.visibility }).returning();
    await db.update(supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "support.message_added", resourceType: "support_ticket", resourceId: ticket.id, outcome: "success", metadata: { visibility: parsed.data.visibility } });
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

supportRouter.patch("/tickets/:ticketId/status", requireRole("support", "admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["open", "in_progress", "waiting_user", "resolved", "closed"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid support status" });
    const [updated] = await db.update(supportTickets).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(supportTickets.id, req.params.ticketId)).returning();
    if (!updated) return res.status(404).json({ error: "Support ticket not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "support.ticket_status_changed", resourceType: "support_ticket", resourceId: updated.id, outcome: "success", metadata: { status: updated.status } });
    res.json({ ticket: updated });
  } catch (error) { next(error); }
});
