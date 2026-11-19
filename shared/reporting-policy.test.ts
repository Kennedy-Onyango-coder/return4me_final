import { describe, expect, it } from "vitest";
import {
  canApproveRepresentedClaim,
  canApproveClaimEvidence,
  hasRepresentativeDeclaration,
  publicNoticeBlockReason,
  reportStatusAfterConsentChange,
  requiresRepresentativeAuthority,
} from "./reporting-policy.js";

describe("reporting and representation policy", () => {
  it("requires a declaration when reporting for another person", () => {
    expect(requiresRepresentativeAuthority("self")).toBe(false);
    expect(requiresRepresentativeAuthority("parent_guardian")).toBe(true);
    expect(hasRepresentativeDeclaration({ relationship: "self" })).toBe(true);
    expect(hasRepresentativeDeclaration({ relationship: "family_representative", subjectName: "A Person" })).toBe(false);
    expect(hasRepresentativeDeclaration({ relationship: "parent_guardian", subjectName: "A Person", declaration: "I am their parent and submit this report on their behalf." })).toBe(true);
  });

  it("does not permit representative claim approval before authority verification", () => {
    expect(canApproveRepresentedClaim({ relationship: "owner", authorityVerificationStatus: "not_required" })).toBe(true);
    expect(canApproveRepresentedClaim({ relationship: "family_representative", authorityVerificationStatus: "pending" })).toBe(false);
    expect(canApproveRepresentedClaim({ relationship: "parent_guardian", authorityVerificationStatus: "rejected" })).toBe(false);
    expect(canApproveRepresentedClaim({ relationship: "parent_guardian", authorityVerificationStatus: "verified" })).toBe(true);
  });

  it("requires verified ownership evidence before claim approval", () => {
    expect(canApproveClaimEvidence([])).toBe(false);
    expect(canApproveClaimEvidence([{ evidenceType: "ownership_support", status: "under_review" }])).toBe(false);
    expect(canApproveClaimEvidence([{ evidenceType: "representative_authority", status: "verified" }])).toBe(false);
    expect(canApproveClaimEvidence([{ evidenceType: "ownership_support", status: "verified" }])).toBe(true);
    expect(canApproveClaimEvidence([
      { evidenceType: "ownership_support", status: "verified" },
      { evidenceType: "representative_authority", status: "under_review" }
    ])).toBe(false);
  });

  it("moves an already-published notice back to review when consent is enabled", () => {
    expect(reportStatusAfterConsentChange("published", true)).toBe("under_review");
    expect(reportStatusAfterConsentChange("matched", true)).toBe("under_review");
    expect(reportStatusAfterConsentChange("submitted", true)).toBe("submitted");
    expect(reportStatusAfterConsentChange("published", false)).toBe("published");
  });

  it("blocks publication without consent, a safe description and found-item custody", () => {
    expect(publicNoticeBlockReason({ kind: "lost", consent: false, publicDescription: "A wallet", hasDisclosureIssue: false, authorisedCustodyRecorded: false })).toBe("consent_required");
    expect(publicNoticeBlockReason({ kind: "lost", consent: true, publicDescription: "", hasDisclosureIssue: false, authorisedCustodyRecorded: false })).toBe("description_required");
    expect(publicNoticeBlockReason({ kind: "lost", consent: true, publicDescription: "Call 0712345678", hasDisclosureIssue: true, authorisedCustodyRecorded: false })).toBe("unsafe_description");
    expect(publicNoticeBlockReason({ kind: "found", consent: true, publicDescription: "Blue backpack", hasDisclosureIssue: false, authorisedCustodyRecorded: false })).toBe("authorised_custody_required");
    expect(publicNoticeBlockReason({ kind: "found", consent: true, publicDescription: "Blue backpack", hasDisclosureIssue: false, authorisedCustodyRecorded: true })).toBeNull();
  });
});
