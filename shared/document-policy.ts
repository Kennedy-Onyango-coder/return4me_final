export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_EVIDENCE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf"
} as const;

export type EvidenceMimeType = keyof typeof SUPPORTED_EVIDENCE_TYPES;
export type EvidenceReviewStatus = "under_review" | "verified" | "rejected" | "expired";

export function isAllowedEvidenceMime(mime: string): mime is EvidenceMimeType {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_EVIDENCE_TYPES, mime);
}

export function isEvidenceSizeAllowed(size: number) {
  return Number.isInteger(size) && size > 0 && size <= MAX_EVIDENCE_BYTES;
}

export function sanitizeEvidenceFilename(input: string) {
  const filename = (input || "evidence-file")
    .normalize("NFKC")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (filename || "evidence-file").slice(0, 255);
}

/** A claim may be decided using private written evidence alone, but an uploaded
 * file cannot be ignored while it is pending, rejected or expired. */
export function canApproveClaimWithEvidence(statuses: EvidenceReviewStatus[]) {
  return statuses.every(status => status === "verified");
}
