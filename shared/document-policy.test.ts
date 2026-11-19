import { describe, expect, it } from "vitest";
import {
  canApproveClaimWithEvidence, isAllowedEvidenceMime, isEvidenceSizeAllowed,
  MAX_EVIDENCE_BYTES, sanitizeEvidenceFilename
} from "./document-policy.js";

describe("document policy", () => {
  it("accepts only the approved evidence MIME types", () => {
    expect(isAllowedEvidenceMime("application/pdf")).toBe(true);
    expect(isAllowedEvidenceMime("image/jpeg")).toBe(true);
    expect(isAllowedEvidenceMime("image/png")).toBe(true);
    expect(isAllowedEvidenceMime("image/webp")).toBe(true);
    expect(isAllowedEvidenceMime("image/svg+xml")).toBe(false);
    expect(isAllowedEvidenceMime("application/zip")).toBe(false);
  });

  it("enforces the ten megabyte boundary", () => {
    expect(isEvidenceSizeAllowed(1)).toBe(true);
    expect(isEvidenceSizeAllowed(MAX_EVIDENCE_BYTES)).toBe(true);
    expect(isEvidenceSizeAllowed(MAX_EVIDENCE_BYTES + 1)).toBe(false);
    expect(isEvidenceSizeAllowed(0)).toBe(false);
    expect(isEvidenceSizeAllowed(-1)).toBe(false);
    expect(isEvidenceSizeAllowed(1.5)).toBe(false);
  });

  it("prevents a claim decision while uploaded evidence is not verified", () => {
    expect(canApproveClaimWithEvidence([])).toBe(true);
    expect(canApproveClaimWithEvidence(["verified", "verified"])).toBe(true);
    expect(canApproveClaimWithEvidence(["verified", "under_review"])).toBe(false);
    expect(canApproveClaimWithEvidence(["rejected"])).toBe(false);
  });

  it("removes path separators and control characters from filenames", () => {
    expect(sanitizeEvidenceFilename("..\\private\\id.pdf\u0000")).toBe(".._private_id.pdf");
    expect(sanitizeEvidenceFilename("/tmp/passport.pdf")).toBe("_tmp_passport.pdf");
  });
});
