/** Pure, fail-closed policy for the claimant recovery-service collection lifecycle. */
export const CLAIM_PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PAYMENT_SESSION_WINDOW_MS = 15 * 60 * 1000;

export type ProviderCollectionState = "COMPLETE" | "PENDING" | "PROCESSING" | "RETRY" | "PARTIAL" | "FAILED" | "CANCELED" | "UNKNOWN";
export type CollectionDecision = "confirm" | "remain_pending" | "record_failure" | "unknown" | "refuse";

export function normalizeKenyanMpesaPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input.replace(/[\s()-]/g, "");
  const e164 = compact.startsWith("+254") ? compact : compact.startsWith("254") ? `+${compact}` : compact.startsWith("0") ? `+254${compact.slice(1)}` : null;
  return e164 && /^\+254[17]\d{8}$/.test(e164) ? e164 : null;
}

export function decideProviderCollection(args: {
  state: ProviderCollectionState;
  currency: unknown;
  providerAmount: unknown;
  expectedAmount: unknown;
  invoiceMatches: boolean;
  transactionBelongsToClaim: boolean;
}): CollectionDecision {
  if (!args.invoiceMatches || !args.transactionBelongsToClaim || args.currency !== "KES") return "refuse";
  const paid = typeof args.providerAmount === "number" ? args.providerAmount : typeof args.providerAmount === "string" && args.providerAmount.trim() ? Number(args.providerAmount) : NaN;
  const expected = typeof args.expectedAmount === "number" ? args.expectedAmount : Number(args.expectedAmount);
  if (!Number.isFinite(paid) || !Number.isFinite(expected) || paid <= 0 || Math.abs(paid - expected) > 0.001) return "refuse";
  if (args.state === "COMPLETE") return "confirm";
  if (["PENDING", "PROCESSING", "RETRY", "PARTIAL"].includes(args.state)) return "remain_pending";
  if (["FAILED", "CANCELED"].includes(args.state)) return "record_failure";
  return "unknown";
}

export function paymentSessionCanBeReused(status: string, expiresAt: Date | string, now = Date.now()): boolean {
  return ["initiated", "pending", "unknown"].includes(status) && new Date(expiresAt).getTime() > now;
}

export function mayOpenNewPaymentSession(args: { assessmentStatus: string; paymentWindowExpiresAt: Date | string | null; now?: number }): boolean {
  if (args.assessmentStatus !== "claimant_confirmed" && args.assessmentStatus !== "collection_pending") return false;
  if (!args.paymentWindowExpiresAt) return false;
  return new Date(args.paymentWindowExpiresAt).getTime() > (args.now ?? Date.now());
}
