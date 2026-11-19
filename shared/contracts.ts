export const COUNTIES = [
  "Mombasa","Kwale","Kilifi","Tana River","Lamu","Taita-Taveta","Garissa","Wajir","Mandera",
  "Marsabit","Isiolo","Meru","Tharaka-Nithi","Embu","Kitui","Machakos","Makueni","Nyandarua",
  "Nyeri","Kirinyaga","Murang'a","Kiambu","Turkana","West Pokot","Samburu","Trans Nzoia",
  "Uasin Gishu","Elgeyo-Marakwet","Nandi","Baringo","Laikipia","Nakuru","Narok","Kajiado",
  "Kericho","Bomet","Kakamega","Vihiga","Bungoma","Busia","Siaya","Kisumu","Homa Bay",
  "Migori","Kisii","Nyamira","Nairobi"
] as const;

export type Role = "claimant" | "finder" | "agent" | "organisation" | "admin" | "owner";
// Historical delegated administrator scopes remain valid in route declarations.
// shared/admin-role-policy.mjs normalizes them to the canonical Admin role.
export const LEGACY_ADMIN_SCOPES = ["finance", "trust_safety", "communications_writer", "communications_approver", "communications_publisher", "support"] as const;
export type LegacyAdminScope = typeof LEGACY_ADMIN_SCOPES[number];
export type RouteRole = Role | LegacyAdminScope;
export type ReportKind = "lost" | "found";
export type ReportStatus = "submitted" | "under_review" | "published" | "matched" | "closed" | "rejected";
export const PAYMENT_ALLOCATION = { finder: 33, agent: 25, platform: 42 } as const;
