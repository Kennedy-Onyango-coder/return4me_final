export type ReporterRelationship = "self" | "parent_guardian" | "family_representative";
export type PublicReportKind = "lost" | "found";
export type PublicReportStatus = "submitted" | "under_review" | "published" | "matched" | "closed" | "rejected";

export function requiresRepresentativeAuthority(relationship: ReporterRelationship): boolean {
  return relationship !== "self";
}

export function hasRepresentativeDeclaration(input: {
  relationship: ReporterRelationship;
  subjectName?: string | null;
  declaration?: string | null;
}): boolean {
  if (!requiresRepresentativeAuthority(input.relationship)) return true;
  return Boolean(input.subjectName?.trim() && input.declaration?.trim());
}

export type ClaimantRelationship = "owner" | "parent_guardian" | "family_representative";

export function canApproveRepresentedClaim(input: {
  relationship: ClaimantRelationship;
  authorityVerificationStatus: string;
}): boolean {
  // "owner" is the claimant workflow's self-claim value; "self" is used only
  // on report creation. Do not conflate the two or accidentally block owner claims.
  return input.relationship === "owner" || input.authorityVerificationStatus === "verified";
}

export function canApproveClaimEvidence(evidence: readonly { evidenceType: string; status: string }[]): boolean {
  // Require at least one verified ownership-support document and make sure every
  // uploaded document has been reviewed before an ownership decision is approved.
  return evidence.length > 0
    && evidence.some(item => item.evidenceType === "ownership_support" && item.status === "verified")
    && evidence.every(item => item.status === "verified");
}

export function reportStatusAfterConsentChange(
  current: PublicReportStatus,
  consent: boolean
): PublicReportStatus {
  // A previously published/matched notice must be re-reviewed after consent is newly enabled.
  if (consent && (current === "published" || current === "matched")) return "under_review";
  return current;
}

export type PublicNoticeBlockReason = "consent_required" | "description_required" | "unsafe_description" | "authorised_custody_required";
export function publicNoticeBlockReason(input: {
  kind: PublicReportKind;
  consent: boolean;
  publicDescription?: string | null;
  hasDisclosureIssue: boolean;
  authorisedCustodyRecorded: boolean;
}): PublicNoticeBlockReason | null {
  if (!input.consent) return "consent_required";
  if (!input.publicDescription?.trim()) return "description_required";
  if (input.hasDisclosureIssue) return "unsafe_description";
  if (input.kind === "found" && !input.authorisedCustodyRecorded) return "authorised_custody_required";
  return null;
}
