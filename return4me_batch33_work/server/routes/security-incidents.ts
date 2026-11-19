import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, securityIncidents } from "../db/schema.js";
import { authenticate, requireRole } from "../security.js";

export const securityIncidentsRouter = Router();
securityIncidentsRouter.use(authenticate);

const incidentCategories = ["account_access", "privacy", "suspected_data_exposure", "suspicious_activity", "service_abuse", "other"] as const;

// Authenticated users can report a concern. Severity is deliberately assigned by
// authorised responders, not selected by the person making the report.
securityIncidentsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = z.object({
      category: z.enum(incidentCategories),
      summary: z.string().trim().min(8).max(240),
      details: z.string().trim().min(20).max(4000)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a category, short summary and enough detail for review" });
    const reference = `SEC-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [incident] = await db.insert(securityIncidents).values({
      reference, severity: "untriaged", category: parsed.data.category,
      summary: parsed.data.summary, details: parsed.data.details,
      reportedBy: req.auth!.id, status: "open"
    }).returning({ id: securityIncidents.id, reference: securityIncidents.reference, status: securityIncidents.status, detectedAt: securityIncidents.detectedAt });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "security.incident_reported", resourceType: "security_incident", resourceId: incident.id, outcome: "success", metadata: { category: parsed.data.category } });
    res.status(201).json({ incident, notice: "Your security report has been received for restricted review. Do not include passwords or one-time codes." });
  } catch (error) { next(error); }
});

securityIncidentsRouter.get("/mine", async (req, res, next) => {
  try {
    const rows = await db.select({
      id: securityIncidents.id, reference: securityIncidents.reference,
      severity: securityIncidents.severity, category: securityIncidents.category,
      summary: securityIncidents.summary, status: securityIncidents.status,
      detectedAt: securityIncidents.detectedAt,
      updatedAt: securityIncidents.updatedAt, closedAt: securityIncidents.closedAt
    }).from(securityIncidents).where(eq(securityIncidents.reportedBy, req.auth!.id)).orderBy(desc(securityIncidents.detectedAt));
    res.json({ incidents: rows });
  } catch (error) { next(error); }
});

securityIncidentsRouter.get("/queue", requireRole("trust_safety", "admin"), async (_req, res, next) => {
  try {
    const rows = await db.select().from(securityIncidents).orderBy(desc(securityIncidents.detectedAt)).limit(200);
    res.json({ incidents: rows, notice: "Restricted security incident data. Handle only for an authorised response purpose." });
  } catch (error) { next(error); }
});

securityIncidentsRouter.patch("/:incidentId", requireRole("trust_safety", "admin"), async (req, res, next) => {
  try {
    const parsed = z.object({
      status: z.enum(["open", "investigating", "contained", "resolved", "closed"]),
      severity: z.enum(["low", "medium", "high", "critical"]),
      resolution: z.string().trim().min(20).max(4000).optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide an incident status, severity and valid resolution details" });
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(securityIncidents).where(eq(securityIncidents.id, req.params.incidentId)).limit(1).for("update");
      if (!existing) return fail(404, "Security incident not found");
      if (["resolved", "closed"].includes(parsed.data.status) && !parsed.data.resolution) {
        return fail(400, "A documented resolution is required before an incident can be closed");
      }
      if (existing.status === "closed") return fail(409, "A closed incident cannot be changed through this workflow");
      const [updated] = await tx.update(securityIncidents).set({
        status: parsed.data.status,
        severity: parsed.data.severity,
        triagedBy: req.auth!.id,
        resolution: parsed.data.resolution ?? existing.resolution,
        updatedAt: new Date(),
        closedAt: ["resolved", "closed"].includes(parsed.data.status) ? new Date() : null
      }).where(eq(securityIncidents.id, existing.id)).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "security.incident_updated", resourceType: "security_incident", resourceId: existing.id, outcome: "success", metadata: { status: updated.status, severity: updated.severity } });
      return succeed({ incident: updated });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json({ incident: result.value.incident });
  } catch (error) { next(error); }
});
