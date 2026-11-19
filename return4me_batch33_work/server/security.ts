import type { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db/index.js";
import { adminStepUpGrants, userRoles, userSessions, users } from "./db/schema.js";
import type { Role } from "../shared/contracts.js";
import { hasRoleAuthority, normalizePrivilegedRoles } from "../shared/admin-role-policy.mjs";

const configuredSecret = process.env.SESSION_HASH_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("SESSION_HASH_SECRET must be at least 32 characters in production");
}
if (process.env.NODE_ENV === "production" && (!process.env.OTP_HASH_SECRET || process.env.OTP_HASH_SECRET.length < 32 || process.env.OTP_HASH_SECRET === configuredSecret)) {
  throw new Error("OTP_HASH_SECRET must be a separate random secret of at least 32 characters in production");
}
if (process.env.NODE_ENV === "production" && (!process.env.CASE_TOKEN_HASH_SECRET || process.env.CASE_TOKEN_HASH_SECRET.length < 32 || [configuredSecret, process.env.OTP_HASH_SECRET].includes(process.env.CASE_TOKEN_HASH_SECRET))) {
  throw new Error("CASE_TOKEN_HASH_SECRET must be a third separate random secret of at least 32 characters in production");
}
const sessionPepper = configuredSecret || "development-session-pepper-change-before-deploy";
const SESSION_COOKIE = "r4m_session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const production = process.env.NODE_ENV === "production";

export type AuthUser = { id: string; email: string; roles: Role[]; sessionId: string };
declare global { namespace Express { interface Request { auth?: AuthUser; stepUpPurpose?: string } } }

function hashSessionToken(token: string) {
  return createHmac("sha256", sessionPepper).update(token).digest("hex");
}

export async function issueSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [session] = await db.insert(userSessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt }).returning({ id: userSessions.id });
  return { id: session.id, token, expiresAt };
}

export function setSessionCookie(res: Response, token: string) {
  const attributes = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=7200"];
  if (production) attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

export function clearSessionCookie(res: Response) {
  const attributes = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"];
  if (production) attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

function readSessionCookie(req: Request) {
  const entry = (req.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  const token = entry ? entry.slice(SESSION_COOKIE.length + 1) : null;
  // A raw session token is exactly 32 random bytes encoded as base64url (43 chars).
  // Reject malformed or oversized cookie values before hashing or querying.
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function hasTrustedOrigin(req: Request) {
  const origin = req.header("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(process.env.WEB_ORIGIN || "http://localhost:5173").origin; }
  catch { return false; }
}

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  if (!hasTrustedOrigin(req)) return res.status(403).json({ error: "Request origin could not be verified" });
  next();
}

// Revoke the cookie's session when possible, even if its expiry has passed, then
// clear the browser cookie. The raw token is never returned to application code.
export async function revokeSessionFromRequest(req: Request) {
  const token = readSessionCookie(req);
  if (!token) return;
  await db.update(userSessions).set({ revokedAt: new Date() })
    .where(and(eq(userSessions.tokenHash, hashSessionToken(token)), isNull(userSessions.revokedAt)));
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readSessionCookie(req);
    if (!token) return res.status(401).json({ error: "Authentication required" });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !hasTrustedOrigin(req)) {
      return res.status(403).json({ error: "Request origin could not be verified" });
    }
    const [session] = await db.select().from(userSessions).where(and(
      eq(userSessions.tokenHash, hashSessionToken(token)),
      isNull(userSessions.revokedAt),
      gt(userSessions.expiresAt, new Date())
    )).limit(1);
    if (!session) return res.status(401).json({ error: "Session expired or revoked" });
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user || user.isSuspended || !user.emailVerifiedAt) return res.status(401).json({ error: "Account is unavailable or unverified" });
    const roles = await db.select({ role: userRoles.role }).from(userRoles)
      .where(and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)));
    // Stage 11 governance model: exactly two privileged administrative roles.
    // Legacy delegated admin scopes are normalized to Admin; the Owner remains
    // the sole final authority. Customer/Agent roles remain unchanged.
    const normalizedRoles = normalizePrivilegedRoles(roles.map(row => row.role)) as Role[];
    req.auth = { id: user.id, email: user.email, roles: normalizedRoles, sessionId: session.id };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Authentication required" });
    if (!hasRoleAuthority(req.auth.roles, allowed)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}



/**
 * Consume a single-use grant using the same database transaction as the protected
 * state change. A rollback therefore restores the grant as well as the business
 * record; concurrent requests serialize on the grant row.
 */
export async function consumeStepUpGrantInTransaction(tx: any, auth: AuthUser, purpose: string) {
  const now = new Date();
  const [grant] = await tx.select({ id: adminStepUpGrants.id }).from(adminStepUpGrants)
    .where(and(eq(adminStepUpGrants.userId, auth.id), eq(adminStepUpGrants.sessionId, auth.sessionId),
      eq(adminStepUpGrants.purpose, purpose), isNull(adminStepUpGrants.consumedAt), gt(adminStepUpGrants.expiresAt, now)))
    .limit(1).for("update");
  if (!grant) throw new Error("Recent step-up verification is required for this action");
  const [updated] = await tx.update(adminStepUpGrants).set({ consumedAt: now })
    .where(and(eq(adminStepUpGrants.id, grant.id), isNull(adminStepUpGrants.consumedAt), gt(adminStepUpGrants.expiresAt, now)))
    .returning({ id: adminStepUpGrants.id });
  if (!updated) throw new Error("Recent step-up verification is required for this action");
}

/** Validate a grant before entering a handler; the handler must consume it inside
 * its business transaction with consumeStepUpGrantInTransaction. */
export function requireStepUpInTransaction(purpose: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Authentication required" });
    try {
      const [grant] = await db.select({ id: adminStepUpGrants.id }).from(adminStepUpGrants)
        .where(and(eq(adminStepUpGrants.userId, req.auth.id), eq(adminStepUpGrants.sessionId, req.auth.sessionId),
          eq(adminStepUpGrants.purpose, purpose), isNull(adminStepUpGrants.consumedAt), gt(adminStepUpGrants.expiresAt, new Date())))
        .limit(1);
      if (!grant) return res.status(403).json({ error: "Recent step-up verification is required for this action" });
      req.stepUpPurpose = purpose;
      next();
    } catch { return res.status(503).json({ error: "Step-up verification could not be checked" }); }
  };
}

/** Consume a single-use, five-minute step-up grant bound to this user and session. */
export function requireStepUp(purpose: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Authentication required" });
    try {
      const consumed = await db.transaction(async tx => {
        const [grant] = await tx.select({ id: adminStepUpGrants.id }).from(adminStepUpGrants)
          .where(and(eq(adminStepUpGrants.userId, req.auth!.id), eq(adminStepUpGrants.sessionId, req.auth!.sessionId),
            eq(adminStepUpGrants.purpose, purpose), isNull(adminStepUpGrants.consumedAt), gt(adminStepUpGrants.expiresAt, new Date())))
          .limit(1).for("update");
        if (!grant) return false;
        const [updated] = await tx.update(adminStepUpGrants).set({ consumedAt: new Date() })
          .where(and(eq(adminStepUpGrants.id, grant.id), isNull(adminStepUpGrants.consumedAt), gt(adminStepUpGrants.expiresAt, new Date())))
          .returning({ id: adminStepUpGrants.id });
        return Boolean(updated);
      });
      if (!consumed) return res.status(403).json({ error: "Recent step-up verification is required for this action" });
      next();
    } catch { return res.status(503).json({ error: "Step-up verification could not be checked" }); }
  };
}
