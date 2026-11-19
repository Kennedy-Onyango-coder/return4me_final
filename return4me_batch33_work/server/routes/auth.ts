import { Router } from "express";
import { z } from "zod";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { fail, succeed, isRouteFailure } from "../http-result.js";
import { adminStepUpGrants, auditEvents, otpChallenges, userRoles, userSessions, users } from "../db/schema.js";
import { sendOtpEmail } from "../services/email.js";
import { authenticate, clearSessionCookie, issueSession, requireTrustedOrigin, revokeSessionFromRequest, setSessionCookie } from "../security.js";
import { hasAdminAuthority } from "../../shared/admin-role-policy.mjs";

export const authRouter = Router();
const emailSchema = z.string().email().max(320).transform(v => v.toLowerCase().trim());
const otpPepper = process.env.OTP_HASH_SECRET || "development-otp-pepper-change-before-deploy";
const hash = (v: string) => createHmac("sha256", otpPepper).update(v).digest("hex");
const maxAttempts = Math.min(Math.max(Number(process.env.OTP_MAX_ATTEMPTS || 5), 3), 8);
const ownerOnlyStepUpPurposes = new Set(["admin.role.grant", "admin.role.revoke", "admin.agreement.legal_approve"]);
const stepUpChallengePurpose: Record<string, string> = {
  "admin.report.status.published": "admin_step_up_publish",
  "admin.report.status.rejected": "admin_step_up_reject",
  "admin.report.status.closed": "admin_step_up_close",
  "admin.report.approval.review": "admin_step_up_review",
  "admin.role.grant": "admin_step_up_role_grant",
  "admin.role.revoke": "admin_step_up_role_revoke",
  "admin.agreement.legal_approve": "admin_step_up_agreement_legal_approve",
  "admin.communications.approve": "admin_step_up_communications_approve",
  "admin.organisation.status.change": "admin_step_up_organisation_status",
  "admin.claim.evidence.review": "admin_step_up_evidence_review",
  "admin.dispute.resolve": "admin_step_up_dispute_resolve",
  "admin.agent.status.change": "admin_step_up_agent_status",
  "admin.agent.assignment.create": "admin_step_up_agent_assignment_create",
  "admin.agent.assignment.cancel": "admin_step_up_agent_assignment_cancel",
  "admin.pricing.schedule.approve": "admin_step_up_pricing_approve",
  "admin.finance.collection.review": "admin_step_up_collection_review",
  "admin.finance.refund.approve": "admin_step_up_refund_approve",
  "admin.finance.refund.execute": "admin_step_up_refund_execute",
  "admin.finance.refund.reconcile": "admin_step_up_refund_reconcile",
  "admin.finance.payout_destination.verify": "admin_step_up_payout_destination_verify",
  "admin.finance.reward.verify": "admin_step_up_reward_verify",
  "admin.finance.payout.approve": "admin_step_up_payout_approve",
  "admin.finance.payout.execute": "admin_step_up_payout_execute",
  "admin.finance.payout.reconcile": "admin_step_up_payout_reconcile"
};


// Email-first sign-in. A new verified address receives the limited claimant role;
// privileged roles are provisioned through a separately controlled admin process.
authRouter.post("/request-code", async (req, res, next) => {
  try {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address" });
    const email = parsed.data.email;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const ttl = Math.min(Math.max(Number(process.env.OTP_TTL_MINUTES || 10), 5), 15);
    // Serialize issuance by a stable per-email advisory lock. This closes the
    // simultaneous-request gap left by a check-then-insert cooldown query.
    const challenge = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email})::bigint)`);
      const recent = await tx.select({ id: otpChallenges.id }).from(otpChallenges)
        .where(and(eq(otpChallenges.email, email), gt(otpChallenges.createdAt, new Date(Date.now() - 60_000))))
        .limit(1);
      if (recent.length) return null;
      // Only one active sign-in challenge is allowed per address. A new request
      // invalidates the prior code before creating the replacement.
      await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "sign_in"), isNull(otpChallenges.consumedAt)));
      const [created] = await tx.insert(otpChallenges).values({ email, codeHash: hash(code), purpose: "sign_in", expiresAt: new Date(Date.now() + ttl * 60_000) }).returning({ id: otpChallenges.id });
      return created;
    });
    if (!challenge) return res.status(429).json({ error: "Please wait before requesting another code" });
    try {
      await sendOtpEmail(email, code);
    } catch (error) {
      await db.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)));
      throw error;
    }
    return res.json({ message: "If the address is eligible, a verification code has been sent." });
  } catch (e) { next(e); }
});

authRouter.post("/verify-code", async (req, res, next) => {
  try {
    const parsed = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid verification details" });
    const { email, code } = parsed.data;
    const verification = await db.transaction(async (tx) => {
      // Lock the newest active challenge so simultaneous verification requests cannot
      // race the attempt counter or consume the same one-time code more than once.
      const [challenge] = await tx.select().from(otpChallenges)
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "sign_in"), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
        .orderBy(desc(otpChallenges.createdAt)).limit(1).for("update");
      if (!challenge || challenge.attempts >= maxAttempts) return fail(400, "Code is invalid or expired");
      const expected = Buffer.from(challenge.codeHash, "hex");
      const received = Buffer.from(hash(code), "hex");
      const matches = expected.length === received.length && timingSafeEqual(expected, received);
      if (!matches) {
        await tx.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, challenge.id));
        return fail(400, "Code is invalid or expired");
      }
      const [consumed] = await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date()), sql`${otpChallenges.attempts} < ${maxAttempts}`))
        .returning({ id: otpChallenges.id });
      if (!consumed) return fail(400, "Code is invalid or expired");

      let [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1).for("update");
      if (!user) {
        [user] = await tx.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
        await tx.insert(userRoles).values({ userId: user.id, role: "claimant" });
      } else if (!user.emailVerifiedAt) {
        [user] = await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
      }
      if (user.isSuspended) return fail(403, "This account is suspended");
      const roles = await tx.select({ role: userRoles.role }).from(userRoles)
        .where(and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)));
      await tx.insert(auditEvents).values({ actorId: user.id, action: "auth.email_otp_verified", resourceType: "user", resourceId: user.id, outcome: "success" });
      return succeed({ user: { id: user.id, email: user.email, roles: roles.map(r => r.role) } });
    });
    if (isRouteFailure(verification)) return res.status(verification.status).json({ error: verification.error });
    const session = await issueSession(verification.value.user.id);
    setSessionCookie(res, session.token);
    return res.json({ user: verification.value.user, sessionExpiresAt: session.expiresAt });
  } catch (e) { next(e); }
});

// Privileged step-up verification is bound to the current authenticated session.
authRouter.post("/step-up/request", authenticate, async (req, res, next) => {
  try {
    if (!hasAdminAuthority(req.auth!.roles)) return res.status(403).json({ error: "Admin access required" });
    const parsed = z.object({ purpose: z.string().min(1).max(100) }).strict().safeParse(req.body);
    if (!parsed.success || !Object.hasOwn(stepUpChallengePurpose, parsed.data.purpose)) return res.status(400).json({ error: "Unsupported step-up purpose" });
    if (ownerOnlyStepUpPurposes.has(parsed.data.purpose) && !req.auth!.roles.includes("owner")) return res.status(403).json({ error: "Super Admin (Owner) access is required for this verification." });
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.auth!.id)).limit(1);
    if (!user) return res.status(401).json({ error: "Account unavailable" });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const ttl = 5;
    const challenge = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'stepup:' + req.auth!.id})::bigint)`);
      const recent = await tx.select({ id: otpChallenges.id }).from(otpChallenges)
        .where(and(eq(otpChallenges.email, user.email), eq(otpChallenges.purpose, stepUpChallengePurpose[parsed.data.purpose]), gt(otpChallenges.createdAt, new Date(Date.now() - 60_000))))
        .limit(1);
      if (recent.length) return null;
      await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.email, user.email), eq(otpChallenges.purpose, stepUpChallengePurpose[parsed.data.purpose]), isNull(otpChallenges.consumedAt)));
      const [created] = await tx.insert(otpChallenges).values({ email: user.email, codeHash: hash(code), purpose: stepUpChallengePurpose[parsed.data.purpose], expiresAt: new Date(Date.now() + ttl * 60_000) }).returning({ id: otpChallenges.id });
      return created;
    });
    if (!challenge) return res.status(429).json({ error: "Wait before requesting another verification code" });
    try { await sendOtpEmail(user.email, code); } catch (error) {
      await db.update(otpChallenges).set({ consumedAt: new Date() }).where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)));
      throw error;
    }
    res.json({ message: "A step-up verification code has been sent to your verified account email.", expiresInSeconds: 300 });
  } catch (error) { next(error); }
});

authRouter.post("/step-up/verify", authenticate, async (req, res, next) => {
  try {
    if (!hasAdminAuthority(req.auth!.roles)) return res.status(403).json({ error: "Admin access required" });
    const parsed = z.object({ purpose: z.string().min(1).max(100), code: z.string().regex(/^\d{6}$/) }).strict().safeParse(req.body);
    if (!parsed.success || !Object.hasOwn(stepUpChallengePurpose, parsed.data.purpose)) return res.status(400).json({ error: "Invalid step-up verification details" });
    if (ownerOnlyStepUpPurposes.has(parsed.data.purpose) && !req.auth!.roles.includes("owner")) return res.status(403).json({ error: "Super Admin (Owner) access is required for this verification." });
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.auth!.id)).limit(1);
    if (!user) return res.status(401).json({ error: "Account unavailable" });
    const result = await db.transaction(async tx => {
      const [challenge] = await tx.select().from(otpChallenges).where(and(eq(otpChallenges.email, user.email), eq(otpChallenges.purpose, stepUpChallengePurpose[parsed.data.purpose]), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
        .orderBy(desc(otpChallenges.createdAt)).limit(1).for("update");
      if (!challenge || challenge.attempts >= maxAttempts) return false;
      const expected = Buffer.from(challenge.codeHash, "hex"); const received = Buffer.from(hash(parsed.data.code), "hex");
      const matches = expected.length === received.length && timingSafeEqual(expected, received);
      if (!matches) { await tx.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, challenge.id)); return false; }
      const [consumed] = await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date()), sql`${otpChallenges.attempts} < ${maxAttempts}`)).returning({ id: otpChallenges.id });
      if (!consumed) return false;
      await tx.update(adminStepUpGrants).set({ consumedAt: new Date() }).where(and(eq(adminStepUpGrants.userId, req.auth!.id), eq(adminStepUpGrants.sessionId, req.auth!.sessionId), isNull(adminStepUpGrants.consumedAt)));
      await tx.insert(adminStepUpGrants).values({ userId: req.auth!.id, sessionId: req.auth!.sessionId, purpose: parsed.data.purpose, expiresAt: new Date(Date.now() + 5 * 60_000) });
      await tx.insert(auditEvents).values({ actorId: req.auth!.id, action: "admin.step_up_verified", resourceType: "user_session", resourceId: req.auth!.sessionId, outcome: "success", metadata: { purpose: parsed.data.purpose } });
      return true;
    });
    if (!result) return res.status(400).json({ error: "Verification code is invalid or expired" });
    res.json({ message: "Step-up verification complete. The grant is single-use and expires in five minutes." });
  } catch (error) { next(error); }
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: { id: req.auth!.id, email: req.auth!.email, roles: req.auth!.roles } });
});

authRouter.get("/sessions", authenticate, async (req, res, next) => {
  try {
    const rows = await db.select({ id: userSessions.id, createdAt: userSessions.createdAt, expiresAt: userSessions.expiresAt, revokedAt: userSessions.revokedAt })
      .from(userSessions).where(eq(userSessions.userId, req.auth!.id)).orderBy(desc(userSessions.createdAt)).limit(50);
    res.json({ sessions: rows.map(row => ({ ...row, current: row.id === req.auth!.sessionId })) });
  } catch (error) { next(error); }
});

authRouter.delete("/sessions/:sessionId", authenticate, async (req, res, next) => {
  try {
    const [revoked] = await db.update(userSessions).set({ revokedAt: new Date() })
      .where(and(eq(userSessions.id, req.params.sessionId), eq(userSessions.userId, req.auth!.id), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id });
    if (!revoked) return res.status(404).json({ error: "Active session not found" });
    await db.insert(auditEvents).values({ actorId: req.auth!.id, action: "auth.session_revoked", resourceType: "user_session", resourceId: revoked.id, outcome: "success" });
    if (revoked.id === req.auth!.sessionId) clearSessionCookie(res);
    res.status(204).end();
  } catch (error) { next(error); }
});

authRouter.post("/logout", requireTrustedOrigin, async (req, res, next) => {
  try {
    await revokeSessionFromRequest(req);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) { next(error); }
});
