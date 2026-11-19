import { Router } from "express";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { auditEvents, organisationActivities, organisationInvitations, organisationMembers, organisations, reports, userRoles, users } from "../db/schema.js";
import { authenticate, requireRole, requireStepUp, requireStepUpInTransaction, consumeStepUpGrantInTransaction } from "../security.js";
import { sendOrganisationInvitation } from "../services/email.js";
import { COUNTIES } from "../../shared/contracts.js";
import { publicDisclosureIssue } from "../services/privacy.js";

export const organisationsRouter = Router();
organisationsRouter.use(authenticate);
const invitationPepper = process.env.CASE_TOKEN_HASH_SECRET || "development-case-token-pepper-change-before-deploy";
const hashInvitation = (token: string) => createHmac("sha256", invitationPepper).update(token).digest("hex");
const orgPermissions = ["org_admin", "case_coordinator", "report_viewer"] as const;

async function membership(organisationId: string, userId: string) {
  const [record] = await db.select({ member: organisationMembers, organisation: organisations })
    .from(organisationMembers).innerJoin(organisations, eq(organisationMembers.organisationId, organisations.id))
    .where(and(eq(organisationMembers.organisationId, organisationId), eq(organisationMembers.userId, userId), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt)))
    .limit(1);
  return record;
}

organisationsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(2).max(220), registrationNumber: z.string().trim().max(120).optional(), county: z.enum(COUNTIES) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the organisation details" });
    const created = await db.transaction(async (tx) => {
      const [organisation] = await tx.insert(organisations).values({ ...parsed.data, status: "pending" }).returning();
      await tx.insert(organisationMembers).values({ organisationId: organisation.id, userId: req.auth!.id, permission: "org_admin", acceptedAt: new Date() });
      const [activeRole] = await tx.select().from(userRoles).where(and(eq(userRoles.userId, req.auth!.id), eq(userRoles.role, "organisation"), isNull(userRoles.revokedAt))).limit(1);
      if (!activeRole) await tx.insert(userRoles).values({ userId: req.auth!.id, role: "organisation" });
      await tx.insert(organisationActivities).values({ organisationId: organisation.id, actorId: req.auth!.id, action: "organisation.created", resourceType: "organisation", resourceId: organisation.id });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.created", resourceType: "organisation", resourceId: organisation.id, outcome: "success" });
      return organisation;
    });
    res.status(201).json({ organisation: created, notice: "Your organisation is pending verification.value. Case functions are unavailable until approval." });
  } catch (error) { next(error); }
});

organisationsRouter.get("/mine", async (req, res, next) => {
  try {
    const rows = await db.select({ organisation: organisations, permission: organisationMembers.permission, joinedAt: organisationMembers.acceptedAt })
      .from(organisationMembers).innerJoin(organisations, eq(organisationMembers.organisationId, organisations.id))
      .where(and(eq(organisationMembers.userId, req.auth!.id), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt)));
    res.json({ organisations: rows });
  } catch (error) { next(error); }
});

organisationsRouter.post("/:organisationId/invitations", async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email().max(320).transform((value) => value.toLowerCase().trim()), permission: z.enum(orgPermissions) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a valid email and organisation permission" });
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || access.member.permission !== "org_admin" || !access.organisation.verifiedAt || access.organisation.status !== "active") return res.status(403).json({ error: "Only an organisation administrator of an approved organisation may invite members" });
    if (parsed.data.email === req.auth!.email.toLowerCase()) return res.status(400).json({ error: "You already have an organisation membership" });
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInvitation(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const [invite] = await db.insert(organisationInvitations).values({ organisationId: access.organisation.id, email: parsed.data.email, permission: parsed.data.permission, tokenHash, invitedBy: req.auth!.id, expiresAt }).returning({ id: organisationInvitations.id });
    const base = process.env.PUBLIC_APP_URL || "http://localhost:5173";
    const inviteUrl = `${base.replace(/\/$/, "")}/accept-organisation-invitation?token=${encodeURIComponent(token)}`;
    try {
      await sendOrganisationInvitation(parsed.data.email, access.organisation.name, inviteUrl);
    } catch (error) {
      await db.update(organisationInvitations).set({ revokedAt: new Date() }).where(eq(organisationInvitations.id, invite.id));
      throw error;
    }
    await db.insert(organisationActivities).values({ organisationId: access.organisation.id, actorId: req.auth!.id, action: "member.invited", resourceType: "invitation", resourceId: invite.id, metadata: { permission: parsed.data.permission } });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.member_invited", resourceType: "organisation", resourceId: access.organisation.id, outcome: "success", metadata: { permission: parsed.data.permission } });
    res.status(201).json({ invitation: { id: invite.id, email: parsed.data.email, expiresAt }, notice: "Invitation sent. The invitee must verify their email and accept using their individual account." });
  } catch (error) { next(error); }
});

organisationsRouter.post("/accept-invitation", async (req, res, next) => {
  try {
    const parsed = z.object({ token: z.string().min(32).max(128) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid invitation" });
    const tokenHash = hashInvitation(parsed.data.token);
    const result = await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(organisationInvitations)
        .where(and(eq(organisationInvitations.tokenHash, tokenHash), isNull(organisationInvitations.acceptedAt), isNull(organisationInvitations.revokedAt)))
        .limit(1).for("update");
      if (!invite || invite.expiresAt <= new Date() || invite.email.toLowerCase() !== req.auth!.email.toLowerCase()) {
        return fail(400, "Invitation is invalid, expired or belongs to another verified email");
      }
      const [organisation] = await tx.select().from(organisations).where(eq(organisations.id, invite.organisationId)).limit(1);
      if (!organisation || organisation.status !== "active" || !organisation.verifiedAt) return fail(409, "The organisation must be approved before members can join");
      const [existing] = await tx.select().from(organisationMembers).where(and(eq(organisationMembers.organisationId, invite.organisationId), eq(organisationMembers.userId, req.auth!.id))).limit(1);
      if (existing) {
        await tx.update(organisationMembers).set({ permission: invite.permission, acceptedAt: new Date(), revokedAt: null, invitedBy: invite.invitedBy }).where(eq(organisationMembers.id, existing.id));
      } else {
        await tx.insert(organisationMembers).values({ organisationId: invite.organisationId, userId: req.auth!.id, permission: invite.permission, invitedBy: invite.invitedBy, acceptedAt: new Date() });
      }
      await tx.update(organisationInvitations).set({ acceptedAt: new Date() }).where(eq(organisationInvitations.id, invite.id));
      const [activeRole] = await tx.select().from(userRoles).where(and(eq(userRoles.userId, req.auth!.id), eq(userRoles.role, "organisation"), isNull(userRoles.revokedAt))).limit(1);
      if (!activeRole) await tx.insert(userRoles).values({ userId: req.auth!.id, role: "organisation" });
      await tx.insert(organisationActivities).values({ organisationId: invite.organisationId, actorId: req.auth!.id, action: "member.joined", resourceType: "organisation_member", resourceId: req.auth!.id });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.invitation_accepted", resourceType: "organisation", resourceId: invite.organisationId, outcome: "success" });
      return succeed({ accepted: true, organisationId: invite.organisationId });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json(result.value);
  } catch (error) { next(error); }
});

organisationsRouter.get("/:organisationId/members", async (req, res, next) => {
  try {
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || access.member.permission !== "org_admin" || access.organisation.status !== "active" || !access.organisation.verifiedAt) return res.status(403).json({ error: "An administrator of an approved organisation is required" });
    const members = await db.select({ id: organisationMembers.id, userId: organisationMembers.userId, email: users.email, permission: organisationMembers.permission, acceptedAt: organisationMembers.acceptedAt, revokedAt: organisationMembers.revokedAt })
      .from(organisationMembers).innerJoin(users, eq(organisationMembers.userId, users.id))
      .where(and(eq(organisationMembers.organisationId, req.params.organisationId), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt)));
    res.json({ members });
  } catch (error) { next(error); }
});

organisationsRouter.get("/:organisationId/reports", async (req, res, next) => {
  try {
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || !access.organisation.verifiedAt || access.organisation.status !== "active") return res.status(403).json({ error: "Approved organisation membership is required" });
    const rows = await db.select({ id: reports.id, reference: reports.reference, kind: reports.kind, category: reports.category, county: reports.county, status: reports.status, createdAt: reports.createdAt })
      .from(reports).where(eq(reports.organisationId, req.params.organisationId)).orderBy(desc(reports.createdAt));
    res.json({ reports: rows });
  } catch (error) { next(error); }
});

organisationsRouter.post("/:organisationId/reports", async (req, res, next) => {
  try {
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || !access.organisation.verifiedAt || access.organisation.status !== "active" || !["org_admin", "case_coordinator"].includes(access.member.permission)) return res.status(403).json({ error: "Approved organisation case-coordinator access is required" });
    const parsed = z.object({ kind: z.enum(["lost", "found"]), category: z.string().trim().min(2).max(100), itemDescription: z.string().trim().min(15).max(4000), county: z.enum(COUNTIES), publicListingConsent: z.boolean().default(false), publicDescription: z.string().trim().max(600).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the organisation report fields" });
    if (parsed.data.publicListingConsent && !parsed.data.publicDescription?.trim()) return res.status(400).json({ error: "A separate public-safe description is required when consent is given" });
    if (parsed.data.publicListingConsent && parsed.data.publicDescription) {
      const issue = publicDisclosureIssue(parsed.data.publicDescription);
      if (issue) return res.status(400).json({ error: `Remove possible private ${issue} from the public-safe description` });
    }
    const reference = `R4M-${randomBytes(4).toString("hex").toUpperCase()}`;
    const [report] = await db.insert(reports).values({ ...parsed.data, reporterId: req.auth!.id, reporterEmail: req.auth!.email, reporterEmailVerifiedAt: new Date(), organisationId: access.organisation.id, reference, status: "submitted", privateMetadata: { submittedOnBehalfOfOrganisation: true } }).returning({ id: reports.id, reference: reports.reference, status: reports.status });
    await db.insert(organisationActivities).values({ organisationId: access.organisation.id, actorId: req.auth!.id, action: "report.created", resourceType: "report", resourceId: report.id });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.report_created", resourceType: "report", resourceId: report.id, outcome: "success", metadata: { organisationId: access.organisation.id } });
    res.status(201).json({ report });
  } catch (error) { next(error); }
});

organisationsRouter.patch("/:organisationId/members/:memberId", async (req, res, next) => {
  try {
    const parsed = z.object({ permission: z.enum(orgPermissions) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid organisation permission" });
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || access.member.permission !== "org_admin" || access.organisation.status !== "active" || !access.organisation.verifiedAt) return res.status(403).json({ error: "An administrator of an approved organisation is required" });
    if (req.params.memberId === access.member.id) return res.status(409).json({ error: "You cannot change your own organisation permission" });
    const result = await db.transaction(async tx => {
      const [organisation] = await tx.select().from(organisations).where(eq(organisations.id, req.params.organisationId)).limit(1).for("update");
      if (!organisation || organisation.status !== "active" || !organisation.verifiedAt) return fail(409, "Organisation is not active");
      const [member] = await tx.select().from(organisationMembers).where(and(eq(organisationMembers.id, req.params.memberId), eq(organisationMembers.organisationId, req.params.organisationId), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt))).limit(1).for("update");
      if (!member) return fail(404, "Active organisation member not found");
      if (member.userId === req.auth!.id) return fail(409, "You cannot change your own organisation permission");
      if (member.permission === "org_admin" && parsed.data.permission !== "org_admin") {
        const admins = await tx.select().from(organisationMembers).where(and(eq(organisationMembers.organisationId, organisation.id), eq(organisationMembers.permission, "org_admin"), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt)));
        if (admins.length <= 1) return fail(409, "The last organisation administrator cannot be demoted");
      }
      const [updated] = await tx.update(organisationMembers).set({ permission: parsed.data.permission }).where(eq(organisationMembers.id, member.id)).returning({ id: organisationMembers.id, userId: organisationMembers.userId, permission: organisationMembers.permission });
      await tx.insert(organisationActivities).values({ organisationId: organisation.id, actorId: req.auth!.id, action: "member.permission_changed", resourceType: "organisation_member", resourceId: member.id, metadata: { permission: parsed.data.permission } });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.member_permission_changed", resourceType: "organisation_member", resourceId: member.id, outcome: "success", metadata: { permission: parsed.data.permission } });
      return succeed({ member: updated });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json({ member: result.value.member });
  } catch (error) { next(error); }
});

organisationsRouter.delete("/:organisationId/members/:memberId", async (req, res, next) => {
  try {
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || access.member.permission !== "org_admin" || access.organisation.status !== "active" || !access.organisation.verifiedAt) return res.status(403).json({ error: "An administrator of an approved organisation is required" });
    if (req.params.memberId === access.member.id) return res.status(409).json({ error: "You cannot revoke your own organisation membership from this screen" });
    const result = await db.transaction(async tx => {
      const [organisation] = await tx.select().from(organisations).where(eq(organisations.id, req.params.organisationId)).limit(1).for("update");
      if (!organisation || organisation.status !== "active" || !organisation.verifiedAt) return fail(409, "Organisation is not active");
      const [member] = await tx.select().from(organisationMembers).where(and(eq(organisationMembers.id, req.params.memberId), eq(organisationMembers.organisationId, req.params.organisationId), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt))).limit(1).for("update");
      if (!member) return fail(404, "Active organisation member not found");
      if (member.userId === req.auth!.id) return fail(409, "You cannot revoke your own organisation membership from this screen");
      if (member.permission === "org_admin") {
        const admins = await tx.select().from(organisationMembers).where(and(eq(organisationMembers.organisationId, organisation.id), eq(organisationMembers.permission, "org_admin"), isNull(organisationMembers.revokedAt), isNotNull(organisationMembers.acceptedAt)));
        if (admins.length <= 1) return fail(409, "The last organisation administrator cannot be removed");
      }
      const [updated] = await tx.update(organisationMembers).set({ revokedAt: new Date() }).where(eq(organisationMembers.id, member.id)).returning({ id: organisationMembers.id, revokedAt: organisationMembers.revokedAt });
      await tx.insert(organisationActivities).values({ organisationId: organisation.id, actorId: req.auth!.id, action: "member.access_revoked", resourceType: "organisation_member", resourceId: member.id });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.member_access_revoked", resourceType: "organisation_member", resourceId: member.id, outcome: "success" });
      return succeed({ member: updated });
    });
    if (isRouteFailure(result)) return res.status(result.status).json({ error: result.error });
    res.json({ member: result.value.member });
  } catch (error) { next(error); }
});

organisationsRouter.get("/:organisationId/invitations", async (req, res, next) => {
  try {
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || access.member.permission !== "org_admin" || access.organisation.status !== "active" || !access.organisation.verifiedAt) return res.status(403).json({ error: "An administrator of an approved organisation is required" });
    const invitations = await db.select({ id: organisationInvitations.id, email: organisationInvitations.email, permission: organisationInvitations.permission, expiresAt: organisationInvitations.expiresAt, createdAt: organisationInvitations.createdAt, acceptedAt: organisationInvitations.acceptedAt, revokedAt: organisationInvitations.revokedAt })
      .from(organisationInvitations).where(eq(organisationInvitations.organisationId, req.params.organisationId)).orderBy(desc(organisationInvitations.createdAt));
    res.json({ invitations });
  } catch (error) { next(error); }
});

organisationsRouter.delete("/:organisationId/invitations/:invitationId", async (req, res, next) => {
  try {
    const access = await membership(req.params.organisationId, req.auth!.id);
    if (!access || access.member.permission !== "org_admin" || access.organisation.status !== "active" || !access.organisation.verifiedAt) return res.status(403).json({ error: "An administrator of an approved organisation is required" });
    const [invite] = await db.update(organisationInvitations).set({ revokedAt: new Date() })
      .where(and(eq(organisationInvitations.id, req.params.invitationId), eq(organisationInvitations.organisationId, req.params.organisationId), isNull(organisationInvitations.acceptedAt), isNull(organisationInvitations.revokedAt))).returning({ id: organisationInvitations.id });
    if (!invite) return res.status(404).json({ error: "Pending invitation not found" });
    await db.insert(organisationActivities).values({ organisationId: req.params.organisationId, actorId: req.auth!.id, action: "invitation.revoked", resourceType: "invitation", resourceId: invite.id });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.invitation_revoked", resourceType: "invitation", resourceId: invite.id, outcome: "success" });
    res.json({ revoked: true });
  } catch (error) { next(error); }
});

organisationsRouter.patch("/:organisationId/status", requireRole("admin", "owner"), (req,res,next)=>requireStepUpInTransaction("admin.organisation.status.change")(req,res,next), async (req, res, next) => {
  try {
    const parsed = z.object({ status: z.enum(["active", "rejected", "suspended"]), reason: z.string().trim().min(10).max(1000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose an organisation status and provide a reason of at least 10 characters" });
    const correlationId = randomUUID();
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(organisations).where(eq(organisations.id, req.params.organisationId)).limit(1).for("update");
      if (!current) return null;
      await consumeStepUpGrantInTransaction(tx, req.auth!, "admin.organisation.status.change");
      const [updated] = await tx.update(organisations).set({ status: parsed.data.status, verifiedAt: parsed.data.status === "active" ? new Date() : null }).where(eq(organisations.id, current.id)).returning();
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "organisation.status_changed", resourceType: "organisation", resourceId: updated.id, outcome: "success", correlationId, metadata: { previousStatus: current.status, status: updated.status, reason: parsed.data.reason, authority: req.auth!.roles.includes("owner") ? "owner_final" : "admin_operational" } });
      return updated;
    });
    if (!result) return res.status(404).json({ error: "Organisation not found" });
    res.json({ organisation: result });
  } catch (error) { next(error); }
});
