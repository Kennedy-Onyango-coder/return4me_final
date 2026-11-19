import { normalizePrivilegedRoles } from "./admin-role-policy.mjs";

/** Pure decision policy for Owner-managed Admin access. */
export function adminGrantDenial({ actorId, targetId, verified, suspended, roles = [] }) {
  if (!actorId || !targetId || actorId === targetId) return "self_grant_not_allowed";
  if (!verified || suspended) return "target_account_unavailable";
  const normalized = normalizePrivilegedRoles(roles);
  if (normalized.includes("owner")) return "owner_role_is_not_managed_here";
  if (normalized.includes("admin")) return "admin_role_already_active";
  return null;
}

export function adminRevokeDenial({ actorId, targetId, roles = [] }) {
  if (!actorId || !targetId || actorId === targetId) return "self_revocation_not_allowed";
  const normalized = normalizePrivilegedRoles(roles);
  if (normalized.includes("owner")) return "owner_role_is_not_managed_here";
  if (!normalized.includes("admin")) return "admin_role_not_active";
  return null;
}
