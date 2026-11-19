import { Router } from "express";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { sendFinderDropoffInstructions } from "../services/email.js";
import { notifySafely } from "../services/notifications.js";
import { z } from "zod";
import { and, desc, eq, gt, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { agentAvailability, agentTrainingRecords, agents, assignments, auditEvents, custodyEvents, documents, handoverAuthorisations, reports, userRoles, users } from "../db/schema.js";
import { authenticate, requireRole, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { COUNTIES } from "../../shared/contracts.js";
import { custodyEventOrderingDecision } from "../../shared/workflow-policy.js";

export const agentsRouter = Router();
const dropoffPepper = process.env.CASE_TOKEN_HASH_SECRET || "development-case-token-pepper-change-before-deploy";
const hashDropoffCode = (code: string) => createHmac("sha256", dropoffPepper).update(code).digest("hex");

// Public directory includes only approved business identity and verified service contact.
// Private residential/identity data and unverified application details are never returned.
agentsRouter.get("/directory", async (_req, res, next) => {
  try {
    const directory = await db.select({ id: agents.id, businessName: agents.businessName, county: agents.county, servicePhone: agents.servicePhone })
      .from(agents).where(and(eq(agents.status, "active"), isNotNull(agents.servicePhoneVerifiedAt),
        sql`(SELECT outcome FROM agent_site_inspections WHERE agent_id=${agents.id} ORDER BY inspected_at DESC LIMIT 1) = 'approved'`,
        sql`(SELECT count(*) FROM agent_training_records WHERE agent_id=${agents.id} AND status='verified' AND expires_at>now() AND module_code IN ('custody_basics','privacy_safety','handover_incidents')) = 3`,
        sql`EXISTS(SELECT 1 FROM agent_agreements aa WHERE aa.agent_id=${agents.id} AND aa.version_id=(SELECT id FROM agent_agreement_versions WHERE legal_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1)`
      )).orderBy(agents.county);
    res.json({ agents: directory });
  } catch (error) { next(error); }
});

agentsRouter.use(authenticate);

agentsRouter.post("/applications", requireRole("claimant", "finder"), async (req, res, next) => {
  try {
    const parsed = z.object({ businessName: z.string().trim().min(2).max(180), serviceAddress: z.string().trim().min(5).max(240), servicePhone: z.string().trim().regex(/^(?:\+254|0)(?:7|1)\d{8}$/).optional(), county: z.enum(COUNTIES), capacityNotes: z.string().max(1500).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the agent application details" });
    const [existing] = await db.select().from(agents).where(eq(agents.userId, req.auth!.id)).limit(1);
    if (existing) return res.status(409).json({ error: "An agent application already exists for this account" });
    const [agent] = await db.insert(agents).values({ ...parsed.data, userId: req.auth!.id }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.application_submitted", resourceType: "agent", resourceId: agent.id, outcome: "success" });
    res.status(201).json({ agent: { id: agent.id, businessName: agent.businessName, county: agent.county, status: agent.status } });
  } catch (e) { next(e); }
});

agentsRouter.get("/me", async (req, res, next) => {
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.userId, req.auth!.id)).limit(1);
    if (!agent) return res.status(404).json({ error: "No agent application found" });
    const assigned = await db.select({
      assignmentId: assignments.id, assignmentStatus: assignments.status,
      reportId: reports.id, reference: reports.reference, kind: reports.kind,
      category: reports.category, county: reports.county,
      approximateLocation: reports.approximateLocation, reportStatus: reports.status
    }).from(assignments).innerJoin(reports, eq(assignments.reportId, reports.id)).where(eq(assignments.agentId, agent.id));
    res.json({ agent: { id: agent.id, businessName: agent.businessName, county: agent.county, status: agent.status }, assignments: assigned });
  } catch (e) { next(e); }
});

agentsRouter.get("/work-queue", requireRole("agent"), async (req, res, next) => {
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.userId, req.auth!.id)).limit(1);
    if (!agent || agent.status !== "active" || !agent.verifiedAt) return res.status(403).json({ error: "An active authorised agent account is required" });
    const queue = await db.select({
      assignmentId: assignments.id, assignmentStatus: assignments.status, assignedAt: assignments.assignedAt,
      reportId: reports.id, reportReference: reports.reference, category: reports.category,
      county: reports.county, approximateLocation: reports.approximateLocation,
      itemDescription: reports.itemDescription, reportStatus: reports.status, createdAt: reports.createdAt
    }).from(assignments).innerJoin(reports, eq(assignments.reportId, reports.id))
      .where(and(eq(assignments.agentId, agent.id), eq(assignments.status, "assigned")))
      .orderBy(desc(assignments.assignedAt));
    const events = queue.length ? await db.select({ reportId: custodyEvents.reportId, eventType: custodyEvents.eventType, createdAt: custodyEvents.createdAt }).from(custodyEvents).where(inArray(custodyEvents.reportId, queue.map(row => row.reportId))).orderBy(custodyEvents.sequenceNo) : [];
    const eventsByReport = new Map<string, typeof events>();
    for (const event of events) eventsByReport.set(event.reportId, [...(eventsByReport.get(event.reportId) || []), event]);
    const claimStates = queue.length ? await pool.query(`SELECT c.id claim_id,c.report_id,c.status claim_status,
        EXISTS(SELECT 1 FROM custody_handover_confirmations hc WHERE hc.claim_id=c.id AND hc.assignment_id=(SELECT x.id FROM assignments x WHERE x.report_id=c.report_id AND x.agent_id=$2 AND x.status='assigned' LIMIT 1)) claimant_confirmed,
        EXISTS(SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id WHERE pt.claim_id=c.id AND pt.status='confirmed' AND pa.status='paid') payment_confirmed
      FROM claims c WHERE c.report_id=ANY($1::uuid[])`, [queue.map(row => row.reportId), agent.id]) : { rows: [] };
    const claimByReport = new Map<string, any>(claimStates.rows.map((row: any) => [row.report_id, row]));
    const [availability] = await db.select().from(agentAvailability).where(eq(agentAvailability.agentId, agent.id)).limit(1);
    res.json({ agent: { id: agent.id, businessName: agent.businessName, county: agent.county }, assignments: queue.map(row => {
      const claim = claimByReport.get(row.reportId);
      return { ...row, custodyEvents: eventsByReport.get(row.reportId) || [], claimId: claim?.claim_id ?? null,
        claimStatus: claim?.claim_status ?? null, claimantConfirmed: Boolean(claim?.claimant_confirmed), paymentConfirmed: Boolean(claim?.payment_confirmed) };
    }), availability: availability ?? null });
  } catch (error) { next(error); }
});

agentsRouter.get("/availability/mine", requireRole("agent"), async (req, res, next) => {
  try {
    const [agent] = await db.select().from(agents).where(eq(agents.userId, req.auth!.id)).limit(1);
    if (!agent) return res.status(404).json({ error: "Agent application not found" });
    const [availability] = await db.select().from(agentAvailability).where(eq(agentAvailability.agentId, agent.id)).limit(1);
    res.json({ availability: availability ?? null });
  } catch (error) { next(error); }
});

agentsRouter.get("/assignments/admin", requireRole("admin"), async (_req, res, next) => {
  try {
    const rows = await db.select({
      assignment: assignments, reportReference: reports.reference, reportCounty: reports.county,
      reportCategory: reports.category, agentBusinessName: agents.businessName, agentCounty: agents.county
    }).from(assignments).innerJoin(reports, eq(assignments.reportId, reports.id)).innerJoin(agents, eq(assignments.agentId, agents.id))
      .orderBy(desc(assignments.assignedAt)).limit(300);
    res.json({ assignments: rows });
  } catch (error) { next(error); }
});

agentsRouter.get("/admin", requireRole("admin"), async (_req, res, next) => {
  try {
    const rows = await db.select({
      agent: {
        id: agents.id, businessName: agents.businessName, county: agents.county,
        status: agents.status, serviceAddress: agents.serviceAddress,
        servicePhone: agents.servicePhone, servicePhoneVerifiedAt: agents.servicePhoneVerifiedAt,
        capacityNotes: agents.capacityNotes, verifiedAt: agents.verifiedAt, createdAt: agents.createdAt
      },
      email: users.email
    }).from(agents).innerJoin(users, eq(agents.userId, users.id)).orderBy(desc(agents.createdAt));
    res.json({ agents: rows });
  } catch (e) { next(e); }
});

agentsRouter.patch("/:id/status", requireRole("admin"), (req, res, next) => requireStepUp("admin.agent.status.change")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["active", "suspended", "rejected"]), reason: z.string().trim().min(10).max(1000).optional() }).safeParse(req.body);
    if (!parsed.success || (parsed.data.status !== "active" && !parsed.data.reason)) return res.status(400).json({ error: "A reason of at least ten characters is required for suspension or rejection" });
    const [existing] = await db.select().from(agents).where(eq(agents.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Agent not found" });
    if (parsed.data.status === "active") {
      const requiredModules = ["custody_basics", "privacy_safety", "handover_incidents"];
      const training = await db.select().from(agentTrainingRecords).where(eq(agentTrainingRecords.agentId, existing.id));
      const verifiedModules = new Set(training.filter((row) => row.status === "verified" && row.expiresAt && row.expiresAt > new Date()).map((row) => row.moduleCode));
      const requiredDocuments = ["agent_identity", "agent_business", "agent_service_location"];
      const agentDocuments = await db.select({ resourceType: documents.resourceType, verificationStatus: documents.verificationStatus, scanStatus: documents.scanStatus, expiresAt: documents.expiresAt, createdAt: documents.createdAt })
        .from(documents).where(eq(documents.resourceId, existing.id)).orderBy(desc(documents.createdAt));
      const latestDocumentStatus = new Map<string, { verificationStatus: string; scanStatus: string; expiresAt: Date | null }>();
      for (const document of agentDocuments) {
        if (!latestDocumentStatus.has(document.resourceType)) latestDocumentStatus.set(document.resourceType, document);
      }
      const documentsVerified = requiredDocuments.every(type => {
        const latest = latestDocumentStatus.get(type);
        return latest?.verificationStatus === "verified" && latest.scanStatus === "clean" && (!latest.expiresAt || latest.expiresAt > new Date());
      });
      const [agreement] = await pool.query(`SELECT aa.id FROM agent_agreements aa
        JOIN agent_agreement_versions av ON av.id=aa.version_id
        WHERE aa.agent_id=$1 AND av.id=(SELECT id FROM agent_agreement_versions WHERE legal_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1)
        LIMIT 1`, [existing.id]).then(r => r.rows);
      const [inspection] = await pool.query(`SELECT outcome FROM agent_site_inspections WHERE agent_id=$1 ORDER BY inspected_at DESC LIMIT 1`, [existing.id]).then(r => r.rows);
      if (!requiredModules.every((module) => verifiedModules.has(module)) || !documentsVerified || !agreement || inspection?.outcome !== "approved") {
        return res.status(409).json({ error: "Agent activation is blocked until identity/business/location documents are malware-cleared and verified, all three training assessments are current (80% pass; 12-month validity), the current legally approved agreement is accepted, and the latest service-site inspection is approved." });
      }
    }
    const [updated] = await db.transaction(async tx => {
      const [agent] = await tx.update(agents).set({ status: parsed.data.status, verifiedAt: parsed.data.status === "active" ? new Date() : null })
        .where(eq(agents.id, existing.id)).returning();
      if (parsed.data.status === "active") {
        const [activeRole] = await tx.select().from(userRoles).where(and(eq(userRoles.userId, existing.userId), eq(userRoles.role, "agent"), isNull(userRoles.revokedAt))).limit(1);
        if (!activeRole) await tx.insert(userRoles).values({ userId: existing.userId, role: "agent", grantedBy: req.auth!.id });
      } else {
        await tx.update(userRoles).set({ revokedAt: new Date() }).where(and(eq(userRoles.userId, existing.userId), eq(userRoles.role, "agent"), isNull(userRoles.revokedAt)));
      }
      return [agent];
    });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.status_changed", resourceType: "agent", resourceId: updated.id, outcome: "success", metadata: { status: updated.status, reason: parsed.data.reason ?? null } });
    res.json({ agent: updated });
  } catch (e) { next(e); }
});


agentsRouter.patch("/:id/service-phone", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ servicePhone: z.string().trim().regex(/^(?:\+254|0)(?:7|1)\d{8}$/), verified: z.literal(true) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a valid Kenyan service number and explicit verification" });
    const [updated] = await db.update(agents).set({ servicePhone: parsed.data.servicePhone, servicePhoneVerifiedAt: new Date() }).where(eq(agents.id, req.params.id)).returning({ id: agents.id, servicePhone: agents.servicePhone, servicePhoneVerifiedAt: agents.servicePhoneVerifiedAt });
    if (!updated) return res.status(404).json({ error: "Agent not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.service_phone_verified", resourceType: "agent", resourceId: updated.id, outcome: "success" });
    res.json({ agent: updated });
  } catch (error) { next(error); }
});

// Training completion is recorded only by the server-scored assessment route in agent-operations.ts.

agentsRouter.post("/assignments/:assignmentId/dropoff-code", requireRole("admin"), async (req, res, next) => {
  try {
    const [entry] = await db.select({
      assignment: assignments, report: reports, agent: agents, finder: users,
      reporterEmail: reports.reporterEmail, reporterEmailVerifiedAt: reports.reporterEmailVerifiedAt
    }).from(assignments).innerJoin(reports, eq(assignments.reportId, reports.id))
      .innerJoin(agents, eq(assignments.agentId, agents.id)).leftJoin(users, eq(reports.reporterId, users.id))
      .where(eq(assignments.id, req.params.assignmentId)).limit(1);
    if (!entry || entry.report.kind !== "found" || entry.assignment.status !== "assigned" || entry.agent.status !== "active") return res.status(409).json({ error: "An active found-item assignment is required" });
    const finderEmail = entry.finder?.email || entry.reporterEmail;
    const finderEmailVerified = Boolean(entry.finder?.emailVerifiedAt || entry.reporterEmailVerifiedAt);
    if (!finderEmail || !finderEmailVerified) return res.status(409).json({ error: "Finder email must be verified before issuing drop-off instructions" });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    const [authorization] = await db.transaction(async (tx) => {
      const [lockedAssignment] = await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, entry.assignment.id)).limit(1).for("update");
      if (!lockedAssignment) throw new Error("Assignment is no longer available");
      const [active] = await tx.select({ id: handoverAuthorisations.id }).from(handoverAuthorisations)
        .where(and(eq(handoverAuthorisations.reportId, entry.report.id), eq(handoverAuthorisations.assignmentId, entry.assignment.id), eq(handoverAuthorisations.purpose, "finder_dropoff"), isNull(handoverAuthorisations.consumedAt), gt(handoverAuthorisations.expiresAt, new Date())))
        .limit(1).for("update");
      if (active) throw new Error("An unexpired Finder drop-off code is already active");
      return tx.insert(handoverAuthorisations).values({ reportId: entry.report.id, assignmentId: entry.assignment.id, purpose: "finder_dropoff", codeHash: hashDropoffCode(code), expiresAt, createdBy: req.auth!.id }).returning();
    });
    try {
      await sendFinderDropoffInstructions({ email: finderEmail, reference: entry.report.reference, businessName: entry.agent.businessName, county: entry.agent.county, servicePhone: entry.agent.servicePhoneVerifiedAt ? entry.agent.servicePhone : null, code });
    } catch {
      await db.update(handoverAuthorisations).set({ consumedAt: new Date() }).where(eq(handoverAuthorisations.id, authorization.id));
      return res.status(503).json({ error: "Drop-off code delivery failed. The code was invalidated; request a new one after resolving email delivery." });
    }
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "custody.dropoff_code_issued", resourceType: "assignment", resourceId: entry.assignment.id, outcome: "success", metadata: { expiresAt: expiresAt.toISOString(), delivery: "email" } });
    res.status(201).json({ issued: true, expiresAt, notice: "The code was sent privately to the verified Finder email. It is not returned by the API." });
  } catch (error) { next(error); }
});

agentsRouter.post("/availability", requireRole("agent"), async (req, res, next) => {
  try {
    const parsed = z.object({ available: z.boolean(), capacityLimit: z.number().int().min(0).max(50) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid availability settings" });
    const [agent] = await db.select().from(agents).where(and(eq(agents.userId, req.auth!.id), eq(agents.status, "active"))).limit(1);
    if (!agent) return res.status(403).json({ error: "An active authorised agent account is required" });
    const [availability] = await db.insert(agentAvailability).values({ agentId: agent.id, available: parsed.data.available, capacityLimit: parsed.data.capacityLimit, currentLoad: 0 }).onConflictDoUpdate({ target: agentAvailability.agentId, set: { available: parsed.data.available, capacityLimit: parsed.data.capacityLimit, updatedAt: new Date() } }).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.availability_updated", resourceType: "agent", resourceId: agent.id, outcome: "success", metadata: { available: availability.available, capacityLimit: availability.capacityLimit } });
    res.json({ availability });
  } catch (error) { next(error); }
});

agentsRouter.post("/assignments", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.agent.assignment.create")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ reportId: z.string().uuid(), agentId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid assignment details" });
    const result = await db.transaction(async (tx) => {
      // Lock the report first so two administrators cannot assign the same case
      // concurrently to different agents.
      const [report] = await tx.select().from(reports).where(eq(reports.id, parsed.data.reportId)).limit(1).for("update");
      if (!report) return fail(404, "Report not found");
      if (report.kind !== "found" || ["closed", "rejected"].includes(report.status)) return fail(409, "Only an active found-item case can be assigned");
      const [agent] = await tx.select().from(agents).where(eq(agents.id, parsed.data.agentId)).limit(1).for("update");
      if (!agent || agent.status !== "active" || !agent.verifiedAt) return fail(409, "Only an approved, active agent can receive assignments");
      if (agent.county !== report.county) return fail(409, "Agent is not approved for this report county");
      const eligibility = await pool.query(`SELECT
        (SELECT outcome FROM agent_site_inspections WHERE agent_id=$1 ORDER BY inspected_at DESC LIMIT 1) AS latest_site_outcome,
        (SELECT count(*) FROM agent_training_records WHERE agent_id=$1 AND status='verified' AND expires_at>now() AND module_code IN ('custody_basics','privacy_safety','handover_incidents')) AS current_training_count,
        (SELECT count(*) FROM agent_agreements aa WHERE aa.agent_id=$1 AND aa.version_id=(SELECT id FROM agent_agreement_versions WHERE legal_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1)) AS legal_agreement_count`, [agent.id]);
      const eligible = eligibility.rows[0];
      if (eligible.latest_site_outcome !== "approved" || Number(eligible.current_training_count) !== 3 || Number(eligible.legal_agreement_count) < 1) return fail(409, "Agent is not currently eligible: approved site inspection, current training and legally approved agreement acceptance are required");
      const [existingAssignment] = await tx.select().from(assignments).where(and(eq(assignments.reportId, report.id), eq(assignments.status, "assigned"))).limit(1);
      if (existingAssignment) return fail(409, "This report already has an active assignment");
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.agent.assignment.create");
      const [capacity] = await tx.update(agentAvailability).set({ currentLoad: sql`${agentAvailability.currentLoad} + 1`, updatedAt: new Date() })
        .where(and(eq(agentAvailability.agentId, agent.id), eq(agentAvailability.available, true), sql`${agentAvailability.currentLoad} < ${agentAvailability.capacityLimit}`)).returning({ id: agentAvailability.id });
      if (!capacity) return fail(409, "The agent is not available or has reached verified assignment capacity");
      const [created] = await tx.insert(assignments).values({ reportId: report.id, agentId: agent.id, assignedBy: req.auth!.id }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.assignment_created", resourceType: "assignment", resourceId: created.id, outcome: "success" });
      return succeed({ assignment: created, reportReference: report.reference, reporterId: report.reporterId });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    if (result.value.reporterId) notifySafely({ userId: result.value.reporterId, type: "agent_assignment", title: "An authorised agent was assigned", body: `An authorised service agent has been assigned to found report ${result.value.reportReference}. Check your verified email for separate drop-off instructions.`, link: "/workspace" });
    res.status(201).json({ assignment: result.value.assignment, notice: "Assignment recorded. Finder drop-off code delivery remains a separate communication step." });
  } catch (error) { next(error); }
});

agentsRouter.patch("/assignments/:assignmentId/cancel", requireRole("admin"), (req, res, next) => requireStepUpInTransaction("admin.agent.assignment.cancel")(req, res, next), async (req, res, next) => {
  try {
    const result = await db.transaction(async (tx) => {
      const [assignment] = await tx.select().from(assignments).where(eq(assignments.id, req.params.assignmentId)).limit(1).for("update");
      if (!assignment || assignment.status !== "assigned") return fail(404, "An active assignment was not found");
      const [received] = await tx.select().from(custodyEvents).where(and(eq(custodyEvents.reportId, assignment.reportId), eq(custodyEvents.eventType, "received"))).limit(1);
      if (received) return fail(409, "An assignment cannot be cancelled after physical custody has been recorded. Escalate for controlled reassignment or incident review.");
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.agent.assignment.cancel");
      const [updated] = await tx.update(assignments).set({ status: "cancelled" }).where(and(eq(assignments.id, assignment.id), eq(assignments.status, "assigned"))).returning();
      await tx.update(agentAvailability).set({ currentLoad: sql`GREATEST(${agentAvailability.currentLoad} - 1, 0)`, updatedAt: new Date() }).where(eq(agentAvailability.agentId, assignment.agentId));
      await tx.update(handoverAuthorisations).set({ consumedAt: new Date() }).where(and(eq(handoverAuthorisations.assignmentId, assignment.id), isNull(handoverAuthorisations.consumedAt)));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "agent.assignment_cancelled", resourceType: "assignment", resourceId: assignment.id, outcome: "success", metadata: { capacityReleased: true } });
      return succeed({ assignment: updated });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json({ assignment: result.value.assignment, notice: "Assignment cancelled, unused drop-off codes invalidated and capacity restored." });
  } catch (error) { next(error); }
});

agentsRouter.post("/custody-events", requireRole("agent"), async (req, res, next) => {
  try {
    const parsed = z.object({ reportId: z.string().uuid(), eventType: z.enum(["received", "inspection_completed", "handover_ready", "released"]), dropoffCode: z.string().regex(/^\d{6}$/).optional(), collectionCode: z.string().regex(/^\d{6}$/).optional(), notes: z.string().max(1200).optional(), evidenceRef: z.string().max(500).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid custody event" });
    const [agent] = await db.select().from(agents).where(and(eq(agents.userId, req.auth!.id), eq(agents.status, "active"))).limit(1);
    if (!agent) return res.status(403).json({ error: "An active authorised agent account is required" });

    // Lock the assignment while checking its event history. This serialises concurrent
    // receipt attempts and keeps code consumption + receipt creation in one transaction.
    const result = await db.transaction(async (tx) => {
      const [assignment] = await tx.select().from(assignments)
        .where(and(eq(assignments.reportId, parsed.data.reportId), eq(assignments.agentId, agent.id), eq(assignments.status, "assigned")))
        .limit(1).for("update");
      if (!assignment) return fail(403, "This report is not assigned to your agent account");
      const priorEvents = await tx.select().from(custodyEvents).where(eq(custodyEvents.reportId, parsed.data.reportId)).orderBy(custodyEvents.sequenceNo);
      const lastTransferIndex = priorEvents.map(event => event.eventType).lastIndexOf("custody_transfer");
      const currentCustodySegment = priorEvents.slice(lastTransferIndex + 1);
      const ordering = custodyEventOrderingDecision({
        hasReceived: lastTransferIndex >= 0 || priorEvents.some(event => event.eventType === "received"),
        hasInspected: currentCustodySegment.some(event => event.eventType === "inspection_completed"),
        hasHandoverReady: currentCustodySegment.some(event => event.eventType === "handover_ready")
      }, parsed.data.eventType);
      // Sequence is validated before the feature gates so an out-of-order request is always reported
      // as an ordering conflict (409) and never as a disabled feature. No gate is bypassed here.
      if (!ordering.allowed) return fail(409, ordering.message);
      if (parsed.data.eventType === "released") {
        const releaseGate = await tx.execute(sql`SELECT c.id AS claim_id FROM claims c
          JOIN assignments x ON x.report_id=c.report_id AND x.status='assigned' AND x.agent_id=${agent.id}
          JOIN agents a ON a.id=x.agent_id AND a.status='active' AND a.verified_at IS NOT NULL
          WHERE c.report_id=${parsed.data.reportId} AND c.status='approved'
            AND EXISTS(SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id
              WHERE pt.claim_id=c.id AND pt.status='confirmed' AND pa.status='paid')
            AND EXISTS(SELECT 1 FROM agent_collection_checks k WHERE k.claim_id=c.id AND k.assignment_id=x.id AND k.authority_status IN ('verified','not_required'))
            AND EXISTS(SELECT 1 FROM handover_authorisations h WHERE h.claim_id=c.id AND h.assignment_id=x.id AND h.purpose='claimant_collection' AND h.consumed_at IS NOT NULL)
            AND EXISTS(SELECT 1 FROM custody_events ready WHERE ready.report_id=c.report_id AND ready.agent_id=x.agent_id AND ready.event_type='handover_ready'
              AND ready.sequence_no>COALESCE((SELECT max(prev.sequence_no) FROM custody_events prev WHERE prev.report_id=c.report_id AND prev.event_type='custody_transfer'),0))
            AND EXISTS(SELECT 1 FROM custody_handover_confirmations hc WHERE hc.claim_id=c.id AND hc.assignment_id=x.id AND hc.claimant_id=c.claimant_id AND hc.agent_id=x.agent_id)
            AND EXISTS(SELECT 1 FROM agent_appointments ap WHERE ap.claim_id=c.id AND ap.assignment_id=x.id AND ap.status='confirmed' AND ap.starts_at<=now() AND ap.ends_at>=now())
            AND NOT EXISTS(SELECT 1 FROM case_disputes d WHERE d.claim_id=c.id AND d.release_hold=true AND d.status NOT IN ('resolved','closed','dismissed'))
          FOR UPDATE OF c`);
        const gateRows = (releaseGate as any).rows ?? [];
        if (!gateRows.length) return fail(423, "Final release requires verified payment, claimant identity/authority, consumed collection code, active appointment, claimant confirmation and no dispute/legal hold");
        const claimId = gateRows[0].claim_id as string;
        await tx.execute(sql`UPDATE claims SET status='completed',updated_at=now() WHERE id=${claimId} AND status='approved'`);
      }
      if (parsed.data.eventType === "handover_ready") {
        if (!parsed.data.collectionCode) return fail(400, "The claimant collection code is required");
        const paid = await pool.query(`SELECT 1 FROM payment_transactions pt JOIN payment_assessments pa ON pa.id=pt.assessment_id
          JOIN claims c ON c.id=pt.claim_id WHERE c.report_id=$1 AND c.status='approved' AND pt.status='confirmed' AND pa.status='paid' LIMIT 1`, [parsed.data.reportId]);
        if (!paid.rowCount) return fail(423, "Provider-confirmed claimant payment is required before collection handover readiness");
        const appointment = await pool.query(`SELECT 1 FROM agent_appointments ap JOIN claims c ON c.id=ap.claim_id
          WHERE ap.assignment_id=$1 AND ap.agent_id=$2 AND c.report_id=$3 AND c.status='approved' AND ap.status='confirmed' AND ap.starts_at<=now() AND ap.ends_at>=now() LIMIT 1`, [assignment.id, agent.id, parsed.data.reportId]);
        if (!appointment.rowCount) return fail(409, "A confirmed collection appointment must be active at the approved service location before handover readiness can be recorded");
        const [check] = await tx.select().from(handoverAuthorisations)
          .where(and(eq(handoverAuthorisations.reportId, parsed.data.reportId), eq(handoverAuthorisations.assignmentId, assignment.id), eq(handoverAuthorisations.purpose, "claimant_collection"), isNull(handoverAuthorisations.consumedAt), gt(handoverAuthorisations.expiresAt, new Date())))
          .orderBy(desc(handoverAuthorisations.createdAt)).limit(1).for("update");
        if (!check || check.attempts >= 5) return fail(409, "Collection code is invalid, expired or locked");
        const expected = Buffer.from(check.codeHash, "hex");
        const supplied = Buffer.from(hashDropoffCode(parsed.data.collectionCode), "hex");
        const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
        if (!valid) {
          const attempts = check.attempts + 1;
          await tx.update(handoverAuthorisations).set({ attempts, ...(attempts >= 5 ? { consumedAt: new Date() } : {}) }).where(eq(handoverAuthorisations.id, check.id));
          return fail(400, "Collection code is invalid");
        }
        const [consumed] = await tx.update(handoverAuthorisations).set({ consumedAt: new Date() }).where(and(eq(handoverAuthorisations.id, check.id), isNull(handoverAuthorisations.consumedAt), gt(handoverAuthorisations.expiresAt, new Date()))).returning({ id: handoverAuthorisations.id });
        if (!consumed) return fail(409, "Collection code was already used or expired");
      }

      if (parsed.data.eventType === "received") {
        if (!parsed.data.dropoffCode) return fail(400, "The Finder drop-off code is required to record receipt");
        const [authorization] = await tx.select().from(handoverAuthorisations)
          .where(and(eq(handoverAuthorisations.reportId, parsed.data.reportId), eq(handoverAuthorisations.assignmentId, assignment.id), eq(handoverAuthorisations.purpose, "finder_dropoff"), isNull(handoverAuthorisations.consumedAt), gt(handoverAuthorisations.expiresAt, new Date())))
          .orderBy(desc(handoverAuthorisations.createdAt)).limit(1).for("update");
        if (!authorization || authorization.attempts >= 5) return fail(409, "Drop-off code is invalid, expired or locked");
        const expected = Buffer.from(authorization.codeHash, "hex");
        const supplied = Buffer.from(hashDropoffCode(parsed.data.dropoffCode), "hex");
        const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);
        if (!valid) {
          const attempts = authorization.attempts + 1;
          await tx.update(handoverAuthorisations).set({ attempts, ...(attempts >= 5 ? { consumedAt: new Date() } : {}) }).where(eq(handoverAuthorisations.id, authorization.id));
          await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "custody.dropoff_code_rejected", resourceType: "assignment", resourceId: assignment.id, outcome: "denied", metadata: { attempts } });
          return fail(400, "Drop-off code is invalid");
        }
        const [consumed] = await tx.update(handoverAuthorisations).set({ consumedAt: new Date() })
          .where(and(eq(handoverAuthorisations.id, authorization.id), isNull(handoverAuthorisations.consumedAt), gt(handoverAuthorisations.expiresAt, new Date())))
          .returning({ id: handoverAuthorisations.id });
        if (!consumed) return fail(409, "Drop-off code was already used or expired");
      }

      // Database trigger serialises report-level appends and owns sequence/hash generation.
      const eventPayload = { reportId: parsed.data.reportId, agentId: agent.id, eventType: parsed.data.eventType, notes: parsed.data.notes ?? null, evidenceRef: parsed.data.evidenceRef ?? null, actorId: req.auth!.id };
      const [event] = await tx.insert(custodyEvents).values(eventPayload).returning();
      if (parsed.data.eventType === "inspection_completed") {
        // Match the original payment clock: 24 hours starts only when the
        // assigned Agent has physically received and inspected the item.
        await tx.execute(sql`UPDATE payment_assessments SET payment_window_expires_at=now()+interval '24 hours'
          WHERE claim_id IN (SELECT id FROM claims WHERE report_id=${parsed.data.reportId} AND status='approved')
            AND status='claimant_confirmed'`);
      }
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "custody.event_recorded", resourceType: "custody_event", resourceId: event.id, outcome: "success", metadata: { eventType: event.eventType } });
      return succeed({ event });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    if (result.value.event.eventType === "released") {
      const [claim] = await db.select({ claimantId: claims.claimantId }).from(claims).where(eq(claims.reportId, parsed.data.reportId)).limit(1);
      if (claim) notifySafely({ userId: claim.claimantId, type: "handover_complete", title: "Your item handover is complete", body: "The assigned Agent recorded final release after the required payment and claimant confirmation checks. Keep this confirmation in your workspace.", link: "/workspace" });
    }
    res.status(201).json({ event: result.value.event, ...(result.value.event.eventType === "released" ? { finalRelease: "completed" } : {}) });
  } catch (e) { next(e); }
});
