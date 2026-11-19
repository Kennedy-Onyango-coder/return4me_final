import { Router } from "express";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { auditEvents, categoryProposals, guestReportAccess, guestReportVerifications, otpChallenges, reports } from "../db/schema.js";
import { requireTrustedOrigin } from "../security.js";
import { sendGuestReportTrackingLink, sendOtpEmail } from "../services/email.js";
import { COUNTIES } from "../../shared/contracts.js";
import { publicDisclosureIssue } from "../services/privacy.js";
import { hasRepresentativeDeclaration, requiresRepresentativeAuthority } from "../../shared/reporting-policy.js";
import { reportStatusAfterConsentChange, type PublicReportStatus } from "../../shared/reporting-policy.js";

export const guestReportsRouter = Router();

const categories = [
  "Personal belongings", "Documents and identity", "Electronics", "Jewellery and valuables",
  "School and work", "Transport-related", "Medical and assistive", "Children's items",
  "Cash and payment cards", "Household", "Other"
] as const;
const emailSchema = z.string().email().max(320).transform(value => value.toLowerCase().trim());
const otpPepper = process.env.OTP_HASH_SECRET || "development-otp-pepper-change-before-deploy";
const casePepper = process.env.CASE_TOKEN_HASH_SECRET || "development-case-token-pepper-change-before-deploy";
const otpHash = (email: string, code: string) => createHmac("sha256", otpPepper).update(`guest_report:${email}:${code}`).digest("hex");
const caseHash = (token: string) => createHmac("sha256", casePepper).update(token).digest("hex");
const maxAttempts = Math.min(Math.max(Number(process.env.OTP_MAX_ATTEMPTS || 5), 3), 8);
const referenceSchema = z.string().regex(/^R4M-[A-F0-9]{8}$/);

const guestReportSchema = z.object({
  email: emailSchema,
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

function readCookie(req: import("express").Request, name: string) {
  const prefix = `${name}=`;
  const item = (req.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function setGuestCookie(res: import("express").Response, reference: string, token: string) {
  const attributes = [
    `r4m_guest_case=${token}`,
    `Path=/api/reports/guest/${reference}`,
    "HttpOnly", "SameSite=Lax", "Max-Age=2592000"
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

guestReportsRouter.post("/request-code", requireTrustedOrigin, async (req, res, next) => {
  try {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address" });
    const email = parsed.data.email;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const ttl = Math.min(Math.max(Number(process.env.OTP_TTL_MINUTES || 10), 5), 15);

    const created = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guest-report:${email}`})::bigint)`);
      const recent = await tx.select({ id: otpChallenges.id }).from(otpChallenges)
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "guest_report"), gt(otpChallenges.createdAt, new Date(Date.now() - 60_000))))
        .limit(1);
      if (recent.length) return null;
      await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "guest_report"), isNull(otpChallenges.consumedAt)));
      const [row] = await tx.insert(otpChallenges).values({
        email, codeHash: otpHash(email, code), purpose: "guest_report",
        expiresAt: new Date(Date.now() + ttl * 60_000)
      }).returning({ id: otpChallenges.id });
      return row;
    });
    if (!created) return res.status(429).json({ error: "Please wait before requesting another verification code" });
    try {
      await sendOtpEmail(email, code);
    } catch (error) {
      await db.update(otpChallenges).set({ consumedAt: new Date() }).where(and(eq(otpChallenges.id, created.id), isNull(otpChallenges.consumedAt)));
      throw error;
    }
    return res.json({ message: "If the address is eligible, a verification code has been sent." });
  } catch (error) { next(error); }
});

guestReportsRouter.post("/verify-code", requireTrustedOrigin, async (req, res, next) => {
  try {
    const parsed = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid verification details" });
    const { email, code } = parsed.data;
    const rawProof = randomBytes(32).toString("base64url");
    const result = await db.transaction(async tx => {
      const [challenge] = await tx.select().from(otpChallenges)
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "guest_report"), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
        .orderBy(desc(otpChallenges.createdAt)).limit(1).for("update");
      if (!challenge || challenge.attempts >= maxAttempts) return false;
      const expected = Buffer.from(challenge.codeHash, "hex");
      const supplied = Buffer.from(otpHash(email, code), "hex");
      const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
      if (!matches) {
        await tx.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, challenge.id));
        return false;
      }
      const [consumed] = await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date()), sql`${otpChallenges.attempts} < ${maxAttempts}`))
        .returning({ id: otpChallenges.id });
      if (!consumed) return false;
      await tx.insert(guestReportVerifications).values({ email, tokenHash: caseHash(rawProof), expiresAt: new Date(Date.now() + 15 * 60_000) });
      await tx.insert(auditEvents).values({ actorId: null, action: "guest_report.email_verified", resourceType: "guest_email", resourceId: null, outcome: "success", metadata: { purpose: "guest_report" } });
      return true;
    });
    if (!result) return res.status(400).json({ error: "Code is invalid, expired or has reached its attempt limit" });
    return res.json({ verificationToken: rawProof, expiresInSeconds: 900, notice: "Email verified. Submit the report within 15 minutes. No account has been created." });
  } catch (error) { next(error); }
});

guestReportsRouter.post("/request-tracking-code", requireTrustedOrigin, async (req, res, next) => {
  try {
    const parsed = z.object({ reference: referenceSchema, email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid report reference and email address" });
    const { reference, email } = parsed.data;
    const [report] = await db.select({ id: reports.id }).from(reports)
      .where(and(eq(reports.reference, reference), eq(reports.reporterEmail, email), isNull(reports.reporterId)))
      .limit(1);
    // Do not disclose whether a report reference/email pair exists.
    if (!report) return res.json({ message: "If the details match a verified guest report, a code will be sent." });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const ttl = Math.min(Math.max(Number(process.env.OTP_TTL_MINUTES || 10), 5), 15);
    const created = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guest-tracking:${email}`})::bigint)`);
      const recent = await tx.select({ id: otpChallenges.id }).from(otpChallenges)
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "guest_tracking"), gt(otpChallenges.createdAt, new Date(Date.now() - 60_000))))
        .limit(1);
      if (recent.length) return null;
      await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "guest_tracking"), isNull(otpChallenges.consumedAt)));
      const [row] = await tx.insert(otpChallenges).values({ email, codeHash: otpHash(email, code), purpose: "guest_tracking", expiresAt: new Date(Date.now() + ttl * 60_000) }).returning({ id: otpChallenges.id });
      return row;
    });
    if (!created) return res.status(429).json({ error: "Please wait before requesting another tracking code" });
    try { await sendOtpEmail(email, code); }
    catch (error) {
      await db.update(otpChallenges).set({ consumedAt: new Date() }).where(and(eq(otpChallenges.id, created.id), isNull(otpChallenges.consumedAt)));
      throw error;
    }
    return res.json({ message: "If the details match a verified guest report, a code will be sent." });
  } catch (error) { next(error); }
});

guestReportsRouter.post("/resend-tracking-link", requireTrustedOrigin, async (req, res, next) => {
  try {
    const parsed = z.object({ reference: referenceSchema, email: emailSchema, code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid tracking recovery details" });
    const { reference, email, code } = parsed.data;
    const rawToken = randomBytes(32).toString("base64url");
    const recovery = await db.transaction(async tx => {
      const [challenge] = await tx.select().from(otpChallenges)
        .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, "guest_tracking"), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
        .orderBy(desc(otpChallenges.createdAt)).limit(1).for("update");
      if (!challenge || challenge.attempts >= maxAttempts) return null;
      const expected = Buffer.from(challenge.codeHash, "hex");
      const supplied = Buffer.from(otpHash(email, code), "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        await tx.update(otpChallenges).set({ attempts: sql`${otpChallenges.attempts} + 1` }).where(eq(otpChallenges.id, challenge.id));
        return null;
      }
      const [report] = await tx.select({ id: reports.id, reference: reports.reference })
        .from(reports).where(and(eq(reports.reference, reference), eq(reports.reporterEmail, email), isNull(reports.reporterId))).limit(1).for("update");
      if (!report) return null;
      const [consumed] = await tx.update(otpChallenges).set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
        .returning({ id: otpChallenges.id });
      if (!consumed) return null;
      const [newAccess] = await tx.insert(guestReportAccess).values({
        reportId: report.id, email, tokenHash: caseHash(rawToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000)
      }).returning({ id: guestReportAccess.id });
      return { ...report, accessId: newAccess.id };
    });
    if (!recovery) return res.status(400).json({ error: "The verification code is invalid, expired or the recovery details could not be matched" });
    const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const trackingUrl = `${appUrl}/#guest-report?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(rawToken)}`;
    try { await sendGuestReportTrackingLink({ email, reference, trackingUrl }); }
    catch {
      await db.update(guestReportAccess).set({ revokedAt: new Date() }).where(and(eq(guestReportAccess.id, recovery.accessId), isNull(guestReportAccess.revokedAt)));
      await db.insert(auditEvents).values({ actorId: null, action: "guest_report.tracking_reissue_email_failed", resourceType: "report", resourceId: recovery.id, outcome: "failure" });
      return res.status(503).json({ error: "The tracking email could not be delivered. Please try again later or contact support with your report reference." });
    }
    await db.update(guestReportAccess).set({ revokedAt: new Date() })
      .where(and(eq(guestReportAccess.reportId, recovery.id), ne(guestReportAccess.id, recovery.accessId), isNull(guestReportAccess.revokedAt)));
    await db.insert(auditEvents).values({ actorId: null, action: "guest_report.tracking_access_reissued", resourceType: "report", resourceId: recovery.id, outcome: "success" });
    return res.json({ notice: "A new private tracking link has been sent. Previous tracking links have been revoked." });
  } catch (error) { next(error); }
});

guestReportsRouter.post("/submit", requireTrustedOrigin, async (req, res, next) => {
  try {
    const parsed = guestReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the report details and representative information", details: parsed.error.flatten() });
    const proof = req.header("x-guest-verification") || "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(proof)) return res.status(401).json({ error: "Verify your email before submitting this report" });
    const data = parsed.data;
    const reference = `R4M-${randomBytes(4).toString("hex").toUpperCase()}`;
    const accessToken = randomBytes(32).toString("base64url");
    const now = new Date();

    const report = await db.transaction(async tx => {
      const [verification] = await tx.select().from(guestReportVerifications)
        .where(and(eq(guestReportVerifications.email, data.email), eq(guestReportVerifications.tokenHash, caseHash(proof)), isNull(guestReportVerifications.consumedAt), gt(guestReportVerifications.expiresAt, now)))
        .limit(1).for("update");
      if (!verification) return null;
      const [consumed] = await tx.update(guestReportVerifications).set({ consumedAt: now })
        .where(and(eq(guestReportVerifications.id, verification.id), isNull(guestReportVerifications.consumedAt), gt(guestReportVerifications.expiresAt, now)))
        .returning({ id: guestReportVerifications.id });
      if (!consumed) return null;

      const [created] = await tx.insert(reports).values({
        reference, kind: data.kind, reporterId: null, reporterEmail: data.email,
        reporterEmailVerifiedAt: now, reporterRelationship: data.reporterRelationship,
        subjectName: data.reporterRelationship === "self" ? null : data.subjectName,
        category: data.category, itemDescription: data.itemDescription, county: data.county,
        approximateLocation: data.approximateLocation, incidentDate: data.incidentDate,
        status: "submitted", publicListingConsent: data.publicListingConsent,
        publicDescription: data.publicListingConsent ? data.publicDescription : null,
        privateMetadata: {
          otherCategoryProposal: data.otherCategoryProposal || null,
          representativeDeclaration: data.representativeDeclaration || null,
          authorityReviewRequired: requiresRepresentativeAuthority(data.reporterRelationship),
          authorityStatus: requiresRepresentativeAuthority(data.reporterRelationship) ? "pending" : "not_required"
        }
      }).returning({ id: reports.id, reference: reports.reference, kind: reports.kind, status: reports.status, createdAt: reports.createdAt });
      if (data.category === "Other" && data.otherCategoryProposal && data.otherCategoryExplanation) {
        const [proposal] = await tx.insert(categoryProposals).values({
          proposedName: data.otherCategoryProposal, explanation: data.otherCategoryExplanation,
          proposedBy: null, proposedEmail: data.email, reportId: created.id
        }).returning({ id: categoryProposals.id });
        await tx.insert(auditEvents).values({ actorId: null, action: "guest_category.proposed_from_report", resourceType: "category_proposal", resourceId: proposal.id, outcome: "success" });
      }
      await tx.insert(guestReportAccess).values({
        reportId: created.id, email: data.email, tokenHash: caseHash(accessToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000)
      });
      await tx.insert(auditEvents).values({
        actorId: null, action: "guest_report.created", resourceType: "report", resourceId: created.id,
        outcome: "success", metadata: { kind: data.kind, reporterRelationship: data.reporterRelationship, publicConsent: data.publicListingConsent }
      });
      return created;
    });

    if (!report) return res.status(401).json({ error: "Email verification has expired or has already been used. Verify your email again." });
    const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const trackingUrl = `${appUrl}/#guest-report?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(accessToken)}`;
    try {
      await sendGuestReportTrackingLink({ email: data.email, reference, trackingUrl });
    } catch {
      await db.update(guestReportAccess).set({ revokedAt: new Date() }).where(and(eq(guestReportAccess.reportId, report.id), eq(guestReportAccess.tokenHash, caseHash(accessToken))));
      await db.insert(auditEvents).values({ actorId: null, action: "guest_report.tracking_email_failed", resourceType: "report", resourceId: report.id, outcome: "failure" });
      return res.status(201).json({ report, trackingEmail: "failed", notice: "Your report was saved, but we could not deliver the tracking link. Contact Return4me support using the report reference." });
    }
    return res.status(201).json({ report, trackingEmail: "sent", notice: "Your report was submitted. A secure tracking link has been sent to your verified email. No account was created." });
  } catch (error) { next(error); }
});

guestReportsRouter.post("/access", requireTrustedOrigin, async (req, res, next) => {
  try {
    const parsed = z.object({ reference: referenceSchema, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid tracking-link details" });
    const [access] = await db.select({ reportId: reports.id, reference: reports.reference })
      .from(guestReportAccess).innerJoin(reports, eq(guestReportAccess.reportId, reports.id))
      .where(and(eq(reports.reference, parsed.data.reference), eq(guestReportAccess.tokenHash, caseHash(parsed.data.token)), isNull(guestReportAccess.revokedAt), gt(guestReportAccess.expiresAt, new Date())))
      .limit(1);
    if (!access) return res.status(404).json({ error: "Tracking link is invalid or expired" });
    setGuestCookie(res, access.reference, parsed.data.token);
    return res.json({ reference: access.reference, accessExpiresInDays: 30 });
  } catch (error) { next(error); }
});

guestReportsRouter.patch("/:reference/public-consent", requireTrustedOrigin, async (req, res, next) => {
  try {
    const reference = referenceSchema.safeParse(req.params.reference);
    const parsed = z.object({ consent: z.boolean(), publicDescription: z.string().trim().max(600).optional() }).safeParse(req.body);
    if (!reference.success || !parsed.success) return res.status(400).json({ error: "Invalid report-consent request" });
    if (parsed.data.consent && !parsed.data.publicDescription?.trim()) return res.status(400).json({ error: "A separate public-safe description is required" });
    if (parsed.data.consent && parsed.data.publicDescription) {
      const issue = publicDisclosureIssue(parsed.data.publicDescription);
      if (issue) return res.status(400).json({ error: `Remove possible private ${issue} before enabling a public notice` });
    }
    const token = readCookie(req, "r4m_guest_case");
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return res.status(401).json({ error: "Open the secure tracking link sent to your verified email" });
    const result = await db.transaction(async tx => {
      const [access] = await tx.select({ accessId: guestReportAccess.id, reportId: reports.id, status: reports.status })
        .from(guestReportAccess).innerJoin(reports, eq(guestReportAccess.reportId, reports.id))
        .where(and(eq(reports.reference, reference.data), eq(guestReportAccess.tokenHash, caseHash(token)), isNull(guestReportAccess.revokedAt), gt(guestReportAccess.expiresAt, new Date())))
        .limit(1).for("update");
      if (!access) return null;
      const nextStatus = reportStatusAfterConsentChange(access.status as PublicReportStatus, parsed.data.consent);
      const [updated] = await tx.update(reports).set({
        publicListingConsent: parsed.data.consent,
        publicDescription: parsed.data.consent ? parsed.data.publicDescription : null,
        status: nextStatus,
        updatedAt: new Date()
      }).where(eq(reports.id, access.reportId)).returning({ reference: reports.reference, publicListingConsent: reports.publicListingConsent, status: reports.status });
      await tx.insert(auditEvents).values({ actorId: null, action: "guest_report.public_consent_changed", resourceType: "report", resourceId: access.reportId, outcome: "success", metadata: { consent: parsed.data.consent, statusResetForReview: nextStatus === "under_review" } });
      return updated;
    });
    if (!result) return res.status(404).json({ error: "Report not found or tracking access expired" });
    res.json({ report: result, notice: result.publicListingConsent ? "Consent recorded. The public-safe notice must pass a new review before publication." : "Public-notice consent withdrawn. The notice is no longer eligible for public display." });
  } catch (error) { next(error); }
});

guestReportsRouter.get("/:reference/tracking", async (req, res, next) => {
  try {
    const reference = referenceSchema.safeParse(req.params.reference);
    if (!reference.success) return res.status(404).json({ error: "Report not found" });
    const token = readCookie(req, "r4m_guest_case");
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return res.status(401).json({ error: "Open the secure tracking link sent to your verified email" });
    const [row] = await db.select({
      id: reports.id, reference: reports.reference, kind: reports.kind,
      category: reports.category, county: reports.county, status: reports.status,
      publicListingConsent: reports.publicListingConsent,
      createdAt: reports.createdAt, updatedAt: reports.updatedAt
    }).from(guestReportAccess).innerJoin(reports, eq(guestReportAccess.reportId, reports.id))
      .where(and(eq(reports.reference, reference.data), eq(guestReportAccess.tokenHash, caseHash(token)), isNull(guestReportAccess.revokedAt), gt(guestReportAccess.expiresAt, new Date())))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Report not found or tracking access has expired" });
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ report: row, notice: "This tracking view contains progress information only. It does not expose private evidence, exact locations or another person's contact details." });
  } catch (error) { next(error); }
});

