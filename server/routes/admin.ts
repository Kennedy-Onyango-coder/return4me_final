import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, gt, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminActionApprovals, adminStepUpGrants, agents, auditEvents, caseDisputes, claimAppeals, claimEvidence, claims, custodyEvents, dataRightsRequests, documents, notificationOutbox, organisations, reports, securityIncidents, supportTickets, userRoles, userSessions, users } from "../db/schema.js";
import { authenticate, requireRole, requireStepUp, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { publicDisclosureIssue } from "../services/privacy.js";
import { notifySafely } from "../services/notifications.js";
import { sendGuestReportStatusEmail } from "../services/email.js";
import { publicNoticeBlockReason } from "../../shared/reporting-policy.js";
import { parseAuditQuery } from "../../shared/audit-query.mjs";
import { parseAdminQueueQuery } from "../../shared/admin-queue-policy.mjs";
import { getAdminCapabilityMatrix } from "../../shared/admin-access-policy.mjs";
import { adminGrantDenial, adminRevokeDenial } from "../../shared/admin-role-management-policy.mjs";
import { normalizePrivilegedRoles } from "../../shared/admin-role-policy.mjs";

export const adminRouter = Router();
adminRouter.use(authenticate);

// The Super Admin (Owner) alone manages the two privileged administrative roles.
// Owner bootstrap is handled by the one-time operator utility; routine Admin grants
// and revocations require Owner step-up, a reason and a transactional audit record.
adminRouter.get("/users", requireRole("owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().trim().min(3).max(320) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Provide an exact verified account email address." });
    const [user] = await db.select({ id: users.id, email: users.email, fullName: users.fullName,
      emailVerifiedAt: users.emailVerifiedAt, isSuspended: users.isSuspended })
      .from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
    const correlationId = randomUUID();
    if (!user) {
      await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.user_lookup_not_found", resourceType: "user", outcome: "not_found", correlationId, metadata: { emailDomain: parsed.data.email.toLowerCase().split("@").pop() || "unknown" } });
      return res.json({ user: null, notice: "No account matched that exact email address." });
    }
    const roles = await db.select({ role: userRoles.role }).from(userRoles)
      .where(and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.user_lookup", resourceType: "user", resourceId: user.id, outcome: "success", correlationId, metadata: { purpose: "admin_role_management_lookup" } });
    res.json({ user: { ...user, roles: normalizePrivilegedRoles(roles.map(row => row.role)) } });
  } catch (error) { next(error); }
});

adminRouter.post("/users/:userId/admin-role", requireRole("owner"),
  (req, res, next) => requireStepUpInTransaction("admin.role.grant")(req, res, next), async (req, res, next) => {
    try {
      const parsed = z.object({ reason: z.string().trim().min(10).max(500) }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Provide a reason of at least 10 characters." });
      if (!z.string().uuid().safeParse(req.params.userId).success) return res.status(400).json({ error: "Invalid account identifier." });
      const correlationId = randomUUID();
      const result = await db.transaction(async tx => {
        const [target] = await tx.select().from(users).where(eq(users.id, req.params.userId)).for("update");
        if (!target) return { error: "Target account was not found." } as const;
        const activeRoles = await tx.select({ role: userRoles.role }).from(userRoles)
          .where(and(eq(userRoles.userId, target.id), isNull(userRoles.revokedAt)));
        const denial = adminGrantDenial({ actorId: req.auth!.id, targetId: target.id, verified: Boolean(target.emailVerifiedAt), suspended: target.isSuspended, roles: activeRoles.map(row => row.role) });
        if (denial) return { error: denial === "self_grant_not_allowed" ? "The Owner cannot grant Admin to their own account." : denial === "target_account_unavailable" ? "Target account must be verified and not suspended." : denial === "owner_role_is_not_managed_here" ? "The Owner role cannot be granted or changed through Admin management." : "This account already has the Admin role." } as const;
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.role.grant");
        await tx.insert(userRoles).values({ userId: target.id, role: "admin", grantedBy: req.auth!.id });
        const now = new Date();
        await tx.update(userSessions).set({ revokedAt: now })
          .where(and(eq(userSessions.userId, target.id), isNull(userSessions.revokedAt)));
        await tx.update(adminStepUpGrants).set({ consumedAt: now })
          .where(and(eq(adminStepUpGrants.userId, target.id), isNull(adminStepUpGrants.consumedAt)));
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.role_granted", resourceType: "user", resourceId: target.id,
          outcome: "success", correlationId, metadata: { grantedRole: "admin", targetEmail: target.email, reason: parsed.data.reason, sessionsRevoked: true, authority: "super_admin_owner" } });
        return { error: null, user: { id: target.id, email: target.email } } as const;
      });
      if (result.error) return res.status(409).json({ error: result.error });
      return res.status(201).json({ user: result.user, notice: "Admin role granted and all existing sessions invalidated. The user must sign in again to access the Admin workspace." });
    } catch (error) { next(error); }
  });

adminRouter.delete("/users/:userId/admin-role", requireRole("owner"),
  (req, res, next) => requireStepUpInTransaction("admin.role.revoke")(req, res, next), async (req, res, next) => {
    try {
      const parsed = z.object({ reason: z.string().trim().min(10).max(500) }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Provide a reason of at least 10 characters." });
      if (!z.string().uuid().safeParse(req.params.userId).success) return res.status(400).json({ error: "Invalid account identifier." });
      const correlationId = randomUUID();
      const result = await db.transaction(async tx => {
        const [target] = await tx.select({ id: users.id, email: users.email }).from(users)
          .where(eq(users.id, req.params.userId)).for("update");
        if (!target) return { error: "Target account was not found." } as const;
        const activeRoles = await tx.select({ id: userRoles.id, role: userRoles.role }).from(userRoles)
          .where(and(eq(userRoles.userId, target.id), isNull(userRoles.revokedAt))).for("update");
        const denial = adminRevokeDenial({ actorId: req.auth!.id, targetId: target.id, roles: activeRoles.map(row => row.role) });
        if (denial) return { error: denial === "self_revocation_not_allowed" ? "The Owner cannot revoke their own session through Admin management." : denial === "owner_role_is_not_managed_here" ? "The Owner role cannot be revoked through Admin management." : "Target account does not have an active Admin role." } as const;
        const legacyAdminScopes = ["finance", "trust_safety", "communications_writer", "communications_approver", "communications_publisher", "support"];
        const activeAdminRows = activeRoles.filter(row => row.role === "admin" || legacyAdminScopes.includes(row.role));
        if (!activeAdminRows.length) return { error: "Target account does not have an active Admin role." } as const;
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.role.revoke");
        const now = new Date();
        await tx.update(userRoles).set({ revokedAt: now }).where(inArray(userRoles.id, activeAdminRows.map(row => row.id)));
        await tx.update(userSessions).set({ revokedAt: now })
          .where(and(eq(userSessions.userId, target.id), isNull(userSessions.revokedAt)));
        await tx.update(adminStepUpGrants).set({ consumedAt: now })
          .where(and(eq(adminStepUpGrants.userId, target.id), isNull(adminStepUpGrants.consumedAt)));
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.role_revoked", resourceType: "user", resourceId: target.id,
          outcome: "success", correlationId, metadata: { revokedRole: "admin", targetEmail: target.email, reason: parsed.data.reason, sessionsRevoked: true, revokedRoleRows: activeAdminRows.length, authority: "super_admin_owner" } });
        return { error: null, user: target } as const;
      });
      if (result.error) return res.status(409).json({ error: result.error });
      return res.json({ user: result.user, notice: "Admin role revoked and all active sessions invalidated." });
    } catch (error) { next(error); }
  });

// Capability discovery is safe for navigation and transparency only. Every
// protected endpoint continues to enforce its own server-side role gate.
adminRouter.get("/capabilities", requireRole("admin", "owner"), (req, res) => {
  res.json({ capabilities: getAdminCapabilityMatrix(req.auth!.roles), enforcement: "server_routes_are_authoritative" });
});

adminRouter.get("/overview", requireRole("admin", "owner"), async (_req, res, next) => {
  try {
    // Aggregated operational indicators only: no claimant, Agent, reporter, or
    // security-incident personal data is exposed by this executive summary.
    const [
      [reportTotal], [pendingReports], [agentTotal], [pendingAgents],
      [pendingClaims], [openDisputes], [pendingAppeals], [openSupport],
      [pendingDataRights], [openSecurityIncidents], [failedNotifications],
      [pendingOrganisations]
    ] = await Promise.all([
      db.select({ value: count() }).from(reports),
      db.select({ value: count() }).from(reports).where(inArray(reports.status, ["submitted", "under_review"])),
      db.select({ value: count() }).from(agents),
      db.select({ value: count() }).from(agents).where(eq(agents.status, "pending")),
      db.select({ value: count() }).from(claims).where(inArray(claims.status, ["submitted", "under_review", "disputed"])),
      db.select({ value: count() }).from(caseDisputes).where(inArray(caseDisputes.status, ["open", "investigating", "awaiting_information"])),
      db.select({ value: count() }).from(claimAppeals).where(inArray(claimAppeals.status, ["submitted", "under_review"])),
      db.select({ value: count() }).from(supportTickets).where(inArray(supportTickets.status, ["open", "in_progress", "waiting_user"])),
      db.select({ value: count() }).from(dataRightsRequests).where(inArray(dataRightsRequests.status, ["received", "under_review"])),
      db.select({ value: count() }).from(securityIncidents).where(inArray(securityIncidents.status, ["open", "investigating", "contained"])),
      db.select({ value: count() }).from(notificationOutbox).where(inArray(notificationOutbox.status, ["retry", "dead"])),
      db.select({ value: count() }).from(organisations).where(eq(organisations.status, "pending"))
    ]);
    res.json({
      reports: { total: reportTotal?.value ?? 0, pendingReview: pendingReports?.value ?? 0 },
      agents: { total: agentTotal?.value ?? 0, pendingApproval: pendingAgents?.value ?? 0 },
      operations: {
        claimsAwaitingReview: pendingClaims?.value ?? 0,
        openDisputes: openDisputes?.value ?? 0,
        appealsAwaitingReview: pendingAppeals?.value ?? 0,
        supportTicketsOpen: openSupport?.value ?? 0,
        dataRightsRequestsOpen: pendingDataRights?.value ?? 0,
        securityIncidentsOpen: openSecurityIncidents?.value ?? 0,
        notificationFailures: failedNotifications?.value ?? 0,
        organisationsAwaitingVerification: pendingOrganisations?.value ?? 0
      },
      financials: { state: "not_enabled", message: "Financial metrics are unavailable until verified payment and ledger workflows are implemented." },
      metricDefinitions: {
        reports: { source: "reports", window: "all_time_and_current_pending", pendingStatuses: ["submitted", "under_review"] },
        agents: { source: "agents", window: "all_time_and_current_pending", pendingStatuses: ["pending"] },
        claimsAwaitingReview: { source: "claims", window: "current_snapshot", statuses: ["submitted", "under_review", "disputed"] },
        openDisputes: { source: "case_disputes", window: "current_snapshot", statuses: ["open", "investigating", "awaiting_information"] },
        appealsAwaitingReview: { source: "claim_appeals", window: "current_snapshot", statuses: ["submitted", "under_review"] },
        supportTicketsOpen: { source: "support_tickets", window: "current_snapshot", statuses: ["open", "in_progress", "waiting_user"] },
        financials: { source: null, window: null, state: "not_enabled" }
      },
      limitations: ["Counts are operational indicators, not service-level or compliance attestations.", "Financial totals and provider balances are intentionally excluded.", "Queue records must be opened through their separately permissioned workspaces.", "Owner final authority is enforced through the separately authenticated, purpose-controlled and audited detail workflows; this aggregate overview intentionally does not inline claimant identity, protected evidence, private case narratives, payout details or restricted Trust & Safety records."]
    });
  } catch (e) { next(e); }
});

// Owner-only governance snapshot. This endpoint exposes aggregate counts only;
// it deliberately excludes account identities, case identifiers, evidence,
// provider references, financial balances and incident narratives.
adminRouter.get("/owner-oversight", requireRole("owner"), async (req, res, next) => {
  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [
      [pendingApprovals], [activeAdminGrants], [recentAuditEvents],
      [openSecurityIncidents], [openDataRightsRequests], [notificationFailures]
    ] = await Promise.all([
      db.select({ value: count() }).from(adminActionApprovals)
        .where(and(eq(adminActionApprovals.status, "pending"), gt(adminActionApprovals.expiresAt, now))),
      db.select({ value: count() }).from(userRoles)
        .where(and(eq(userRoles.role, "admin"), isNull(userRoles.revokedAt))),
      db.select({ value: count() }).from(auditEvents)
        .where(gte(auditEvents.createdAt, last24Hours)),
      db.select({ value: count() }).from(securityIncidents)
        .where(inArray(securityIncidents.status, ["open", "investigating", "contained"])),
      db.select({ value: count() }).from(dataRightsRequests)
        .where(inArray(dataRightsRequests.status, ["received", "under_review"])),
      db.select({ value: count() }).from(notificationOutbox)
        .where(inArray(notificationOutbox.status, ["retry", "dead"]))
    ]);
    const snapshot = {
      pendingAdminProposals: pendingApprovals?.value ?? 0,
      activeAdminRoleGrants: activeAdminGrants?.value ?? 0,
      auditEventsLast24Hours: recentAuditEvents?.value ?? 0,
      openSecurityIncidents: openSecurityIncidents?.value ?? 0,
      openDataRightsRequests: openDataRightsRequests?.value ?? 0,
      notificationFailures: notificationFailures?.value ?? 0,
      generatedAt: now.toISOString(),
      limitations: [
        "Counts are operational indicators, not compliance attestations.",
        "Admin role grants are counted as active role assignments, not deduplicated people.",
        "This snapshot does not expose case details, personal data, evidence or financial balances.",
        "Owner authority for consequential actions remains enforced by the corresponding action endpoint and its step-up and maker/checker controls."
      ]
    };
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "owner.oversight_snapshot_viewed",
      resourceType: "owner_oversight", outcome: "success", metadata: { snapshotFields: Object.keys(snapshot).filter(key => key !== "limitations") } });
    res.json({ oversight: snapshot });
  } catch (error) { next(error); }
});

// Read-only operational queues expose only the fields needed to triage work.
// Claimant identity, evidence summaries, dispute narratives and appeal grounds remain
// in their separately permissioned case workspaces.
adminRouter.get("/claims", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = parseAdminQueueQuery("claims", req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { status, limit, offset } = parsed.value;
    const rows = await db.select({ id: claims.id, reference: claims.reference, status: claims.status,
      reportReference: reports.reference, reportKind: reports.kind, category: reports.category,
      county: reports.county, createdAt: claims.createdAt, updatedAt: claims.updatedAt })
      .from(claims).innerJoin(reports, eq(claims.reportId, reports.id))
      .where(eq(claims.status, status as "submitted" | "under_review" | "approved" | "rejected" | "disputed" | "completed" | "cancelled"))
      .orderBy(desc(claims.createdAt)).limit(limit).offset(offset);
    res.json({ claims: rows, page: { limit, offset, hasMore: rows.length === limit } });
  } catch (error) { next(error); }
});

// Restricted claim details are fetched only after an authorised reviewer opens a
// metadata queue row. Never return storage keys or document bytes from this endpoint.
adminRouter.get("/claims/:claimId", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.claimId);
    if (!id.success) return res.status(400).json({ error: "A valid claim reference is required." });
    const [claim] = await db.select({ claim: claims, reportReference: reports.reference,
      reportKind: reports.kind, category: reports.category, county: reports.county })
      .from(claims).innerJoin(reports, eq(claims.reportId, reports.id))
      .where(eq(claims.id, id.data)).limit(1);
    if (!claim) return res.status(404).json({ error: "Claim not found." });
    const evidence = await db.select({ id: claimEvidence.id, evidenceType: claimEvidence.evidenceType,
      verificationStatus: claimEvidence.verificationStatus, reviewerId: claimEvidence.reviewerId,
      reviewedAt: claimEvidence.reviewedAt, createdAt: claimEvidence.createdAt,
      documentId: documents.id, filename: documents.originalFilename, mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus, documentVerificationStatus: documents.verificationStatus })
      .from(claimEvidence).innerJoin(documents, eq(claimEvidence.documentId, documents.id))
      .where(and(eq(claimEvidence.claimId, id.data), isNull(documents.deletedAt)))
      .orderBy(desc(claimEvidence.createdAt));
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.claim_detail_viewed",
      resourceType: "claim", resourceId: id.data, outcome: "success",
      metadata: { evidenceCount: evidence.length, view: "restricted_claim_detail" } });
    res.json({ claim: claim.claim, report: { reference: claim.reportReference, kind: claim.reportKind,
      category: claim.category, county: claim.county }, evidence });
  } catch (error) { next(error); }
});

adminRouter.get("/disputes", requireRole("admin", "trust_safety"), async (req, res, next) => {
  try {
    const parsed = parseAdminQueueQuery("disputes", req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { status, limit, offset } = parsed.value;
    const rows = await db.select({ id: caseDisputes.id, status: caseDisputes.status,
      reasonCode: caseDisputes.reasonCode, releaseHold: caseDisputes.releaseHold,
      settlementHold: caseDisputes.settlementHold, claimReference: claims.reference,
      reportReference: reports.reference, createdAt: caseDisputes.createdAt })
      .from(caseDisputes).innerJoin(claims, eq(caseDisputes.claimId, claims.id))
      .innerJoin(reports, eq(caseDisputes.reportId, reports.id))
      .where(eq(caseDisputes.status, status)).orderBy(desc(caseDisputes.createdAt)).limit(limit).offset(offset);
    res.json({ disputes: rows, page: { limit, offset, hasMore: rows.length === limit } });
  } catch (error) { next(error); }
});

adminRouter.get("/appeals", requireRole("admin", "trust_safety"), async (req, res, next) => {
  try {
    const parsed = parseAdminQueueQuery("appeals", req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { status, limit, offset } = parsed.value;
    const rows = await db.select({ id: claimAppeals.id, status: claimAppeals.status,
      claimReference: claims.reference, claimStatus: claims.status, reportReference: reports.reference,
      createdAt: claimAppeals.createdAt, reviewedAt: claimAppeals.reviewedAt })
      .from(claimAppeals).innerJoin(claims, eq(claimAppeals.claimId, claims.id))
      .innerJoin(reports, eq(claims.reportId, reports.id))
      .where(eq(claimAppeals.status, status)).orderBy(desc(claimAppeals.createdAt)).limit(limit).offset(offset);
    res.json({ appeals: rows, page: { limit, offset, hasMore: rows.length === limit } });
  } catch (error) { next(error); }
});

// Restricted dispute and appeal detail reads are separated from the metadata-only queues.
// Every successful narrative read records a dedicated access event without copying the narrative.
adminRouter.get("/disputes/:disputeId", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.disputeId);
    if (!id.success) return res.status(400).json({ error: "A valid dispute reference is required." });
    const [row] = await db.select({ dispute: caseDisputes, claimReference: claims.reference, claimStatus: claims.status,
      reportReference: reports.reference, reportKind: reports.kind, category: reports.category, county: reports.county })
      .from(caseDisputes).innerJoin(claims, eq(caseDisputes.claimId, claims.id))
      .innerJoin(reports, eq(caseDisputes.reportId, reports.id)).where(eq(caseDisputes.id, id.data)).limit(1);
    if (!row) return res.status(404).json({ error: "Dispute not found." });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.dispute_detail_viewed", resourceType: "dispute", resourceId: id.data, outcome: "success" });
    res.json({ dispute: row.dispute, case: { claimReference: row.claimReference, claimStatus: row.claimStatus,
      reportReference: row.reportReference, reportKind: row.reportKind, category: row.category, county: row.county } });
  } catch (error) { next(error); }
});

adminRouter.get("/appeals/:appealId", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.appealId);
    if (!id.success) return res.status(400).json({ error: "A valid appeal reference is required." });
    const [row] = await db.select({ appeal: claimAppeals, claimReference: claims.reference, claimStatus: claims.status,
      reportReference: reports.reference, reportKind: reports.kind, category: reports.category, county: reports.county })
      .from(claimAppeals).innerJoin(claims, eq(claimAppeals.claimId, claims.id))
      .innerJoin(reports, eq(claims.reportId, reports.id)).where(eq(claimAppeals.id, id.data)).limit(1);
    if (!row) return res.status(404).json({ error: "Appeal not found." });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.appeal_detail_viewed", resourceType: "claim_appeal", resourceId: id.data, outcome: "success" });
    res.json({ appeal: row.appeal, case: { claimReference: row.claimReference, claimStatus: row.claimStatus,
      reportReference: row.reportReference, reportKind: row.reportKind, category: row.category, county: row.county } });
  } catch (error) { next(error); }
});

// Read-only audit explorer. Metadata is intentionally excluded because event metadata
// may contain operational context that is not suitable for broad dashboard disclosure.
adminRouter.get("/audit-events", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = parseAuditQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { limit: rawLimit, offset: rawOffset, action, resourceType, outcome, from, to } = parsed.value;
    const filters = [
      ...(action ? [eq(auditEvents.action, action)] : []),
      ...(resourceType ? [eq(auditEvents.resourceType, resourceType)] : []),
      ...(outcome ? [eq(auditEvents.outcome, outcome)] : []),
      ...(from ? [gte(auditEvents.createdAt, from)] : []),
      ...(to ? [lte(auditEvents.createdAt, to)] : [])
    ];
    const where = filters.length ? and(...filters) : undefined;
    const [events, [total]] = await Promise.all([
      db.select({ id: auditEvents.id, actorId: auditEvents.actorId, action: auditEvents.action,
        resourceType: auditEvents.resourceType, resourceId: auditEvents.resourceId, correlationId: auditEvents.correlationId,
        outcome: auditEvents.outcome, createdAt: auditEvents.createdAt })
        .from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).limit(rawLimit).offset(rawOffset),
      db.select({ value: count() }).from(auditEvents).where(where)
    ]);
    res.json({ events, page: { limit: rawLimit, offset: rawOffset, total: total?.value ?? 0,
      hasMore: rawOffset + events.length < Number(total?.value ?? 0) } });
  } catch (error) { next(error); }
});

adminRouter.get("/evidence", requireRole("admin", "trust_safety"), async (_req, res, next) => {
  try {
    const rows = await db.select({
      evidenceId: claimEvidence.id, claimId: claims.id, claimReference: claims.reference,
      evidenceType: claimEvidence.evidenceType, verificationStatus: claimEvidence.verificationStatus,
      documentId: documents.id, originalFilename: documents.originalFilename,
      mimeType: documents.mimeType, sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus,
      createdAt: claimEvidence.createdAt
    }).from(claimEvidence)
      .innerJoin(claims, eq(claimEvidence.claimId, claims.id))
      .innerJoin(documents, eq(claimEvidence.documentId, documents.id))
      .where(and(eq(claimEvidence.verificationStatus, "under_review"), eq(documents.scanStatus, "clean"), isNull(documents.deletedAt)))
      .orderBy(desc(claimEvidence.createdAt)).limit(100);
    res.json({ evidence: rows });
  } catch (error) { next(error); }
});

adminRouter.get("/agent-documents", requireRole("admin"), async (_req, res, next) => {
  try {
    const rows = await db.select({
      documentId: documents.id, agentId: agents.id, businessName: agents.businessName,
      county: agents.county, resourceType: documents.resourceType,
      originalFilename: documents.originalFilename, mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes, scanStatus: documents.scanStatus,
      verificationStatus: documents.verificationStatus, createdAt: documents.createdAt
    }).from(documents).innerJoin(agents, eq(documents.resourceId, agents.id))
      .where(and(inArray(documents.resourceType, ["agent_identity", "agent_business", "agent_service_location"]), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt)).limit(200);
    const latest = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!latest.has(`${row.agentId}:${row.resourceType}`)) latest.set(`${row.agentId}:${row.resourceType}`, row);
    res.json({ documents: [...latest.values()].filter(row => row.scanStatus === "clean" && row.verificationStatus === "under_review") });
  } catch (error) { next(error); }
});

adminRouter.get("/reports", requireRole("admin"), async (_req, res, next) => {
  try {
    const rows = await db.select({
      id: reports.id, reference: reports.reference, kind: reports.kind,
      category: reports.category, county: reports.county, status: reports.status,
      publicListingConsent: reports.publicListingConsent, createdAt: reports.createdAt
    }).from(reports).orderBy(desc(reports.createdAt)).limit(200);
    res.json({ reports: rows });
  } catch (e) { next(e); }
});

const reportBulkSchema = z.object({
  action: z.literal("start_review"),
  reportIds: z.array(z.string().uuid()).min(1).max(50),
  reason: z.string().trim().min(10).max(500)
}).strict().refine(value => new Set(value.reportIds).size === value.reportIds.length, { message: "Duplicate report IDs are not allowed" });

// Preview is read-only. The execution endpoint re-locks and revalidates every row,
// so a stale preview cannot force an invalid transition or bypass a concurrent change.
adminRouter.post("/reports/bulk-preview", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = reportBulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Select 1–50 unique reports, choose start_review and provide a reason" });
    const rows = await db.select({ id: reports.id, reference: reports.reference, status: reports.status })
      .from(reports).where(inArray(reports.id, parsed.data.reportIds));
    const found = new Set(rows.map(row => row.id));
    const eligible = rows.filter(row => row.status === "submitted");
    const ineligible = parsed.data.reportIds.filter(id => !found.has(id) || !eligible.some(row => row.id === id));
    res.json({ action: "start_review", selected: parsed.data.reportIds.length,
      eligible: eligible.map(row => ({ id: row.id, reference: row.reference })),
      ineligibleCount: ineligible.length, requiresConfirmation: true,
      warning: "Preview does not reserve records. Execution rechecks every selected report and aborts all changes if any selection is no longer eligible." });
  } catch (error) { next(error); }
});

adminRouter.post("/reports/bulk", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = reportBulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Select 1–50 unique reports, choose start_review and provide a reason" });
    const result = await db.transaction(async tx => {
      const rows = await tx.select({ id: reports.id, reference: reports.reference, status: reports.status })
        .from(reports).where(inArray(reports.id, parsed.data.reportIds)).for("update");
      if (rows.length !== parsed.data.reportIds.length || rows.some(row => row.status !== "submitted")) {
        return { conflict: true as const };
      }
      const now = new Date();
      const updated = await tx.update(reports).set({ status: "under_review", updatedAt: now })
        .where(inArray(reports.id, parsed.data.reportIds)).returning({ id: reports.id, reference: reports.reference });
      await tx.insert(auditEvents).values(updated.map(row => ({ actorId: req.auth!.id,
        action: "report.bulk_started_review", resourceType: "report", resourceId: row.id,
        outcome: "success", metadata: { reason: parsed.data.reason, batchSize: updated.length } })));
      return { conflict: false as const, updated };
    });
    if (result.conflict) return res.status(409).json({ error: "At least one selected report changed or is no longer eligible. No reports were changed; refresh the queue and preview again." });
    res.json({ updated: result.updated, notice: `${result.updated.length} reports moved to review. No publication or rejection was performed.` });
  } catch (error) { next(error); }
});

const reportDecisionSchema = z.object({
  status: z.enum(["published", "rejected", "closed"]),
  reason: z.string().trim().min(10).max(1000)
}).strict();

const reportDecisionPurpose = (status: "published" | "rejected" | "closed") => `admin.report.status.${status}`;

async function validateReportDecision(report: typeof reports.$inferSelect, status: "published" | "rejected" | "closed") {
  if (report.status !== "under_review") return "Report must be in review before a consequential decision.";
  if (status !== "published") return null;
  const [received] = report.kind === "found"
    ? await db.select({ id: custodyEvents.id }).from(custodyEvents)
      .where(and(eq(custodyEvents.reportId, report.id), eq(custodyEvents.eventType, "received"))).limit(1)
    : [undefined];
  const disclosureIssue = report.publicDescription ? publicDisclosureIssue(report.publicDescription) : null;
  const blockReason = publicNoticeBlockReason({ kind: report.kind, consent: report.publicListingConsent,
    publicDescription: report.publicDescription, hasDisclosureIssue: Boolean(disclosureIssue),
    authorisedCustodyRecorded: Boolean(received) });
  if (blockReason === "consent_required" || blockReason === "description_required") return "Public publication requires explicit reporter consent and a separate public-safe description.";
  if (blockReason === "unsafe_description") return `Public publication is blocked by possible private ${disclosureIssue}. Edit the public-safe description first.`;
  if (blockReason === "authorised_custody_required") return "Found items cannot be publicly listed before authorised agent custody is documented.";
  return null;
}

// Admins propose; another Admin or the Owner makes the decision. The Owner is
// the final authority and may execute their own decision after step-up.
adminRouter.post("/reports/:id/decision-proposals", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = reportDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a consequential decision and provide a reason of at least 10 characters." });
    const correlationId = randomUUID();
    const [report] = await db.select().from(reports).where(eq(reports.id, req.params.id)).limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });
    const validationError = await validateReportDecision(report, parsed.data.status);
    if (validationError) return res.status(409).json({ error: validationError });
    const owner = req.auth!.roles.includes("owner");
    if (owner) {
      return requireStepUpInTransaction(reportDecisionPurpose(parsed.data.status))(req, res, async () => {
        try {
          const result = await db.transaction(async tx => {
            const [locked] = await tx.select().from(reports).where(eq(reports.id, report.id)).for("update");
            if (!locked || locked.status !== "under_review") return { conflict: true as const };
            if (parsed.data.status === "published") {
              const [received] = locked.kind === "found" ? await tx.select({ id: custodyEvents.id }).from(custodyEvents)
                .where(and(eq(custodyEvents.reportId, locked.id), eq(custodyEvents.eventType, "received"))).limit(1) : [undefined];
              const disclosureIssue = locked.publicDescription ? publicDisclosureIssue(locked.publicDescription) : null;
              const blockReason = publicNoticeBlockReason({ kind: locked.kind, consent: locked.publicListingConsent,
                publicDescription: locked.publicDescription, hasDisclosureIssue: Boolean(disclosureIssue), authorisedCustodyRecorded: Boolean(received) });
              if (blockReason) return { conflict: true as const };
            }
            await consumeStepUpGrantInTransaction(tx, req.auth!, reportDecisionPurpose(parsed.data.status));
            const [updated] = await tx.update(reports).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(reports.id, report.id)).returning();
            await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "report.owner_final_decision", resourceType: "report", resourceId: report.id, outcome: "success", correlationId, metadata: { status: parsed.data.status, reason: parsed.data.reason, decisionAuthority: "owner_final", makerChecker: "owner_direct_final" } });
            return { conflict: false as const, report: updated };
          });
          if (result.conflict) return res.status(409).json({ error: "Report changed or publication safety checks no longer pass. Refresh and review again." });
          const updatedReport = result.report;
          const message = parsed.data.status === "published" ? "Your report has passed review and the approved public-safe notice is now available." : parsed.data.status === "rejected" ? "Your report was not approved. Contact support if you need clarification." : "Your report has been closed.";
          if (report.reporterId) notifySafely({ userId: report.reporterId, type: "report_update", title: "Your report status changed", body: message, link: "/workspace" });
          else if (report.reporterEmail && report.reporterEmailVerifiedAt) void sendGuestReportStatusEmail({ email: report.reporterEmail, reference: report.reference, status: updatedReport.status }).catch(() => console.warn("Guest report status email could not be delivered"));
          return res.json({ report: updatedReport, decision: "owner_final" });
        } catch (error) { return next(error); }
      });
    }
    const proposal = await db.transaction(async tx => {
      const [pending] = await tx.select({ id: adminActionApprovals.id }).from(adminActionApprovals)
        .where(and(eq(adminActionApprovals.resourceType, "report"), eq(adminActionApprovals.resourceId, report.id),
          eq(adminActionApprovals.status, "pending"), gt(adminActionApprovals.expiresAt, new Date())))
        .limit(1).for("update");
      if (pending) return null;
      const [approval] = await tx.insert(adminActionApprovals).values({ action: `report.status.${parsed.data.status}`, resourceType: "report", resourceId: report.id,
        proposedBy: req.auth!.id, proposalReason: parsed.data.reason, payload: { status: parsed.data.status },
        expiresAt: new Date(Date.now() + 48 * 60 * 60_000) }).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.action_proposed", resourceType: "admin_action_approval", resourceId: approval.id, outcome: "success", correlationId, metadata: { action: approval.action, targetType: "report", targetId: report.id, reason: parsed.data.reason, expiresAt: approval.expiresAt } });
      return approval;
    });
    if (!proposal) return res.status(409).json({ error: "A pending proposal already exists for this report decision." });
    return res.status(202).json({ approval: proposal, notice: "Decision proposal recorded. A different Admin or the Owner must review it." });
  } catch (error) { next(error); }
});

adminRouter.get("/action-approvals", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const rows = await db.select({ id: adminActionApprovals.id, action: adminActionApprovals.action, resourceType: adminActionApprovals.resourceType,
      resourceId: adminActionApprovals.resourceId, proposedBy: adminActionApprovals.proposedBy, proposalReason: adminActionApprovals.proposalReason,
      status: adminActionApprovals.status, expiresAt: adminActionApprovals.expiresAt, createdAt: adminActionApprovals.createdAt })
      .from(adminActionApprovals).where(and(eq(adminActionApprovals.status, "pending"), gt(adminActionApprovals.expiresAt, new Date())))
      .orderBy(desc(adminActionApprovals.createdAt)).limit(100);
    res.json({ approvals: rows });
  } catch (error) { next(error); }
});

adminRouter.get("/action-approvals/history", requireRole("admin", "owner"), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["pending", "approved", "rejected"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid approval history filters." });
    const filters = parsed.data;
    const where = filters.status ? eq(adminActionApprovals.status, filters.status) : undefined;
    const rows = await db.select({ id: adminActionApprovals.id, action: adminActionApprovals.action, resourceType: adminActionApprovals.resourceType,
      status: adminActionApprovals.status, proposedBy: adminActionApprovals.proposedBy, reviewedBy: adminActionApprovals.reviewedBy,
      proposalReason: adminActionApprovals.proposalReason, reviewReason: adminActionApprovals.reviewReason,
      expiresAt: adminActionApprovals.expiresAt, createdAt: adminActionApprovals.createdAt, resolvedAt: adminActionApprovals.resolvedAt })
      .from(adminActionApprovals).where(where).orderBy(desc(adminActionApprovals.createdAt)).limit(filters.limit).offset(filters.offset);
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.action_approval_history_viewed", resourceType: "admin_action_approval", outcome: "success",
      metadata: { statusFilter: filters.status || "all", limit: filters.limit, offset: filters.offset, returned: rows.length, payloadExposed: false } });
    const now = Date.now();
    res.json({ approvals: rows.map(row => {
      const remainingMs = new Date(row.expiresAt).getTime() - now;
      const lifecycleStatus = row.status === "pending" && remainingMs <= 0 ? "expired" : row.status;
      const expiryState = row.status !== "pending" ? "not_applicable" : remainingMs <= 0 ? "expired" : remainingMs <= 6 * 60 * 60 * 1000 ? "expires_within_6_hours" : "active";
      return { ...row, lifecycleStatus, expiryState, expiresInMinutes: row.status === "pending" ? Math.ceil(remainingMs / 60000) : null };
    }), page: { limit: filters.limit, offset: filters.offset, returned: rows.length }, notice: "Approval history excludes proposal payloads and records access in the audit log. Expiry indicators are informational; expired proposals cannot be approved." });
  } catch (error) { next(error); }
});

adminRouter.post("/action-approvals/:id/review", requireRole("admin", "owner"), (req, res, next) => requireStepUpInTransaction("admin.report.approval.review")(req, res, next), async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(10).max(1000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose approve or reject and provide a review reason of at least 10 characters." });
    const correlationId = randomUUID();
    const outcome = await db.transaction(async tx => {
      const [approval] = await tx.select().from(adminActionApprovals).where(eq(adminActionApprovals.id, req.params.id)).for("update");
      if (!approval || approval.status !== "pending" || approval.expiresAt <= new Date()) return { error: "Approval is unavailable, expired or already decided." } as const;
      if (approval.proposedBy === req.auth!.id && !req.auth!.roles.includes("owner")) return { error: "An Admin cannot review their own proposal." } as const;
      if (approval.resourceType !== "report" || !approval.action.startsWith("report.status.")) return { error: "Unsupported approval action." } as const;
      const status = approval.action.slice("report.status.".length) as "published" | "rejected" | "closed";
      if (parsed.data.decision === "reject") {
        await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.report.approval.review");
        await tx.update(adminActionApprovals).set({ status: "rejected", reviewedBy: req.auth!.id, reviewReason: parsed.data.reason, updatedAt: new Date(), resolvedAt: new Date() }).where(eq(adminActionApprovals.id, approval.id));
        await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.action_rejected", resourceType: "admin_action_approval", resourceId: approval.id, outcome: "success", correlationId, metadata: { targetType: "report", targetId: approval.resourceId, makerId: approval.proposedBy, reason: parsed.data.reason } });
        return { rejected: true as const, report: null, approvalId: approval.id };
      }
      const [report] = await tx.select().from(reports).where(eq(reports.id, approval.resourceId)).for("update");
      if (!report || report.status !== "under_review") return { error: "Report changed since the proposal. No decision was applied." } as const;
      if (status === "published") {
        const [received] = report.kind === "found" ? await tx.select({ id: custodyEvents.id }).from(custodyEvents).where(and(eq(custodyEvents.reportId, report.id), eq(custodyEvents.eventType, "received"))).limit(1) : [undefined];
        const disclosureIssue = report.publicDescription ? publicDisclosureIssue(report.publicDescription) : null;
        const blockReason = publicNoticeBlockReason({ kind: report.kind, consent: report.publicListingConsent, publicDescription: report.publicDescription, hasDisclosureIssue: Boolean(disclosureIssue), authorisedCustodyRecorded: Boolean(received) });
        if (blockReason) return { error: "Publication safety checks no longer pass. No decision was applied." } as const;
      }
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.report.approval.review");
      const [updated] = await tx.update(reports).set({ status, updatedAt: new Date() }).where(eq(reports.id, report.id)).returning();
      await tx.update(adminActionApprovals).set({ status: "approved", reviewedBy: req.auth!.id, reviewReason: parsed.data.reason, updatedAt: new Date(), resolvedAt: new Date() }).where(eq(adminActionApprovals.id, approval.id));
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.action_approved", resourceType: "admin_action_approval", resourceId: approval.id, outcome: "success", correlationId, metadata: { action: approval.action, targetType: "report", targetId: report.id, makerId: approval.proposedBy, reason: parsed.data.reason, decisionAuthority: req.auth!.roles.includes("owner") ? "owner_final" : "admin_checker" } });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "report.status_changed", resourceType: "report", resourceId: report.id, outcome: "success", correlationId, metadata: { status, approvalId: approval.id, makerId: approval.proposedBy, proposalReason: approval.proposalReason, reviewReason: parsed.data.reason } });
      return { rejected: false as const, report: updated, approvalId: approval.id };
    });
    if ("error" in outcome) return res.status(409).json({ error: outcome.error });
    if (outcome.rejected) return res.json({ decision: "rejected", approvalId: outcome.approvalId, notice: "The proposal was rejected; the report was not changed." });
    const [report] = await db.select().from(reports).where(eq(reports.id, outcome.report!.id)).limit(1);
    const message = outcome.report!.status === "published" ? "Your report has passed review and the approved public-safe notice is now available." : outcome.report!.status === "rejected" ? "Your report was not approved. Contact support if you need clarification." : "Your report has been closed.";
    if (report?.reporterId) notifySafely({ userId: report.reporterId, type: "report_update", title: "Your report status changed", body: message, link: "/workspace" });
    else if (report?.reporterEmail && report.reporterEmailVerifiedAt) void sendGuestReportStatusEmail({ email: report.reporterEmail, reference: report.reference, status: outcome.report!.status }).catch(() => console.warn("Guest report status email could not be delivered"));
    return res.json({ decision: "approved", report: outcome.report, approvalId: outcome.approvalId, finalAuthority: req.auth!.roles.includes("owner") ? "owner" : "admin_checker" });
  } catch (error) { next(error); }
});

adminRouter.patch("/reports/:id/status", requireRole("admin"), async (req, res, next) => {
  const requestedStatus = req.body?.status;
  const highRiskPurpose = ({ published: "admin.report.status.published", rejected: "admin.report.status.rejected", closed: "admin.report.status.closed" } as Record<string, string>)[requestedStatus];
  if (highRiskPurpose) return res.status(409).json({ error: "Consequential report decisions must use the proposal and approval workflow." });
  return next();
}, async (req, res, next) => {
  try {
    const allowed = ["under_review", "published", "rejected", "closed"] as const;
    const status = req.body?.status;
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status transition" });
    const [existing] = await db.select().from(reports).where(eq(reports.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Report not found" });
    if (status === "published") {
      const [received] = existing.kind === "found"
        ? await db.select({ id: custodyEvents.id }).from(custodyEvents)
            .where(and(eq(custodyEvents.reportId, existing.id), eq(custodyEvents.eventType, "received"))).limit(1)
        : [undefined];
      const disclosureIssue = existing.publicDescription ? publicDisclosureIssue(existing.publicDescription) : null;
      const blockReason = publicNoticeBlockReason({
        kind: existing.kind,
        consent: existing.publicListingConsent,
        publicDescription: existing.publicDescription,
        hasDisclosureIssue: Boolean(disclosureIssue),
        authorisedCustodyRecorded: Boolean(received)
      });
      if (blockReason === "consent_required" || blockReason === "description_required") {
        return res.status(409).json({ error: "Public publication requires explicit reporter consent and a separate public-safe description" });
      }
      if (blockReason === "unsafe_description") {
        return res.status(409).json({ error: `Public publication is blocked by possible private ${disclosureIssue}. Edit the public-safe description first.` });
      }
      if (blockReason === "authorised_custody_required") {
        return res.status(409).json({ error: "Found items cannot be publicly listed before authorised agent custody is documented" });
      }
    }
    const [updated] = await db.update(reports).set({ status, updatedAt: new Date() })
      .where(eq(reports.id, existing.id)).returning();
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "report.status_changed", resourceType: "report", resourceId: updated.id, outcome: "success", metadata: { status } });
    const message = status === "published" ? "Your report has passed review and the approved public-safe notice is now available." : status === "rejected" ? "Your report was not approved. Contact support if you need clarification." : status === "closed" ? "Your report has been closed." : "Your report is being reviewed.";
    if (existing.reporterId) {
      notifySafely({ userId: existing.reporterId, type: "report_update", title: "Your report status changed", body: message, link: "/workspace" });
    } else if (existing.reporterEmail && existing.reporterEmailVerifiedAt) {
      void sendGuestReportStatusEmail({ email: existing.reporterEmail, reference: existing.reference, status: updated.status }).catch(() => console.warn("Guest report status email could not be delivered"));
    }
    res.json({ report: updated });
  } catch (e) { next(e); }
});
