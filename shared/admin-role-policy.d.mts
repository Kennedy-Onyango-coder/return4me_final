export function normalizePrivilegedRoles(roles?: string[]): string[];
export function hasRoleAuthority(userRoles?: string[], allowedRoles?: string[]): boolean;
export function isCanonicalAdminRole(role: string): boolean;
export function hasAdminAuthority(roles?: string[]): boolean;
