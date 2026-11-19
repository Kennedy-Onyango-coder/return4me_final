export const COUNTIES = [
  "Mombasa","Kwale","Kilifi","Tana River","Lamu","Taita-Taveta","Garissa","Wajir","Mandera",
  "Marsabit","Isiolo","Meru","Tharaka-Nithi","Embu","Kitui","Machakos","Makueni","Nyandarua",
  "Nyeri","Kirinyaga","Murang'a","Kiambu","Turkana","West Pokot","Samburu","Trans Nzoia",
  "Uasin Gishu","Elgeyo-Marakwet","Nandi","Baringo","Laikipia","Nakuru","Narok","Kajiado",
  "Kericho","Bomet","Kakamega","Vihiga","Bungoma","Busia","Siaya","Kisumu","Homa Bay",
  "Migori","Kisii","Nyamira","Nairobi"
] as const;

export type Role = "claimant" | "finder" | "agent" | "organisation" | "admin" | "owner";
export type ReportKind = "lost" | "found";
export type ReportStatus = "submitted" | "under_review" | "published" | "matched" | "closed" | "rejected";
export const PAYMENT_ALLOCATION = { finder: 33, agent: 25, platform: 42 } as const;
