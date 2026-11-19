import "dotenv/config";
import { eq, isNull, and, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db/index.js";
import { users, userRoles, auditEvents } from "../server/db/schema.js";
import { canBootstrapOwner } from "../shared/admin-bootstrap-policy.mjs";

const [emailArg, roleArg] = process.argv.slice(2);
const allowed = ["owner", "finder", "agent", "organisation", "claimant"] as const;
if (!emailArg || !allowed.includes(roleArg as typeof allowed[number])) {
  console.error("Usage: npm run grant-role -- verified-email owner|finder|agent|organisation|claimant (Admin roles are granted only by the Super Admin in the authenticated workspace)");
  process.exitCode = 1;
} else {
  try {
    const email = emailArg.toLowerCase().trim();
    await db.transaction(async tx => {
      // Serialize all operator role grants to prevent concurrent Owner bootstraps.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('return4me_privileged_role_grants')::bigint)`);
      const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1).for("update");
      if (!user || !user.emailVerifiedAt || user.isSuspended) throw new Error("An active, previously verified account with that email must exist first.");
      const [active] = await tx.select({ id: userRoles.id }).from(userRoles)
        .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, roleArg as typeof allowed[number]), isNull(userRoles.revokedAt))).limit(1);
      if (active) throw new Error("That active role already exists.");

      let actorId: string | null = null;
      let supersededAdminScopes = 0;
      if (roleArg === "owner") {
        const activeOwners = await tx.select({ userId: userRoles.userId }).from(userRoles)
          .where(and(eq(userRoles.role, "owner"), isNull(userRoles.revokedAt)));
        if (!canBootstrapOwner({ targetEmail: email, configuredEmail: process.env.OWNER_BOOTSTRAP_EMAIL, activeOwnerCount: activeOwners.length })) {
          throw new Error("Owner can only be bootstrapped once, for OWNER_BOOTSTRAP_EMAIL, when no active Owner exists.");
        }
        const legacyAdminScopes = ["admin", "finance", "trust_safety", "communications_writer", "communications_approver", "communications_publisher", "support"] as const;
        const priorScopes = await tx.select({ id: userRoles.id }).from(userRoles)
          .where(and(eq(userRoles.userId, user.id), inArray(userRoles.role, legacyAdminScopes), isNull(userRoles.revokedAt))).for("update");
        if (priorScopes.length) {
          await tx.update(userRoles).set({ revokedAt: new Date() }).where(inArray(userRoles.id, priorScopes.map(row => row.id)));
          supersededAdminScopes = priorScopes.length;
        }
      }

      await tx.insert(userRoles).values({ userId: user.id, role: roleArg as typeof allowed[number], grantedBy: actorId });
      await tx.insert(auditEvents).values({ actorId, action: roleArg === "owner" ? "admin.owner_bootstrapped" : "auth.role_granted_by_operator",
        resourceType: "user", resourceId: user.id, outcome: "success",
        metadata: { grantedRole: roleArg, targetEmail: email, approvalAuthority: roleArg === "owner" ? "one_time_bootstrap" : "operator_process", supersededAdminScopes } });
    });
    console.info(`${roleArg} role granted to ${email}. Sign out and sign in again to refresh the session.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Role grant failed");
    process.exitCode = 1;
  } finally { await pool.end(); }
}
