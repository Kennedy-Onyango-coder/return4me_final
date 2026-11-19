/** Exactly two privileged administrative roles are exposed to application code. */
const legacyAdminScopes = new Set(["finance", "trust_safety", "communications_writer", "communications_approver", "communications_publisher", "support"]);
const privilegedRoles = new Set(["admin", "owner", ...legacyAdminScopes]);

export function normalizePrivilegedRoles(roles = []) {
  const normalized = new Set();
  for (const role of Array.isArray(roles) ? roles : []) {
    normalized.add(legacyAdminScopes.has(role) ? "admin" : role);
  }
  return [...normalized];
}

export function hasRoleAuthority(userRoles = [], allowedRoles = []) {
  const roles = normalizePrivilegedRoles(userRoles);
  // Route declarations may still use historical scope labels. Normalize both
  // sides so the canonical Admin role retains the operational permissions that
  // those labels represented before the two-role consolidation.
  const normalizedAllowed = normalizePrivilegedRoles(allowedRoles);
  const ownerHasFinalAuthority = roles.includes("owner") && allowedRoles.some(role => privilegedRoles.has(role));
  return ownerHasFinalAuthority || normalizedAllowed.some(role => roles.includes(role));
}

export function isCanonicalAdminRole(role) {
  return role === "admin" || role === "owner";
}

export function hasAdminAuthority(roles = []) {
  const normalized = normalizePrivilegedRoles(roles);
  return normalized.includes("admin") || normalized.includes("owner");
}
