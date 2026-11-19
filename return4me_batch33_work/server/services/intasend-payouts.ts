import { decryptPaymentPhone, paymentPiiConfigured } from "./payment-pii.js";

const BASE = "https://sandbox.intasend.com/api/v1";
export type PayoutVerdict = "completed" | "failed" | "cancelled" | "in_progress" | "unknown";

export function intasendPayoutEnabled(): boolean {
  return process.env.INTASEND_PAYOUT_ENABLED === "true" && process.env.INTASEND_ENVIRONMENT !== "live" &&
    !!process.env.INTASEND_SECRET_KEY?.trim() && paymentPiiConfigured() &&
    !!process.env.INTASEND_DISBURSEMENT_WALLET_ID?.trim() &&
    !!process.env.INTASEND_SETTLEMENT_WALLET_ID?.trim() &&
    process.env.INTASEND_DISBURSEMENT_WALLET_ID.trim() !== process.env.INTASEND_SETTLEMENT_WALLET_ID.trim() &&
    process.env.INTASEND_DISBURSEMENT_WALLET_VERIFIED === "true" &&
    process.env.INTASEND_DISBURSEMENT_WALLET_CURRENCY === "KES" &&
    process.env.INTASEND_DISBURSEMENT_WALLET_CAN_DISBURSE === "true";
}

export function classifyPayoutProviderStatus(raw: unknown): PayoutVerdict {
  if (typeof raw !== "string") return "unknown";
  const code = raw.trim().toUpperCase().split(/[\s\-–—:]+/)[0];
  if (code === "TS100") return "completed";
  if (["TF103", "TF105", "TF106"].includes(code)) return "failed";
  if (code === "TC108") return "cancelled";
  if (/^(TP|TH|TR)\d{3}$/.test(code) || ["TP", "TH", "TR"].includes(code)) return "in_progress";
  return "unknown";
}

async function request(path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.INTASEND_SECRET_KEY!.trim()}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => null);
    return { response, data: data && typeof data === "object" && !Array.isArray(data) ? data as any : null };
  } catch {
    return { response: null, data: null };
  } finally { clearTimeout(timer); }
}

export async function initiateIntaSendPayout(args: { destinationCiphertext: string; amountKes: string; claimReference: string; payoutRequestId: string }): Promise<{
  outcome: "accepted" | "unknown" | "rejected"; trackingId: string | null; transactionId: string | null; httpStatus: number | null;
}> {
  if (!intasendPayoutEnabled()) return { outcome: "rejected", trackingId: null, transactionId: null, httpStatus: null };
  const phone = decryptPaymentPhone(args.destinationCiphertext).replace(/^\+/, "");
  const walletId = process.env.INTASEND_DISBURSEMENT_WALLET_ID!.trim();
  const { response, data } = await request("/send-money/initiate/", {
    provider: "MPESA-B2C", currency: "KES", requires_approval: "NO", wallet_id: walletId,
    transactions: [{ name: "Return4me Reward", account: phone, amount: args.amountKes,
      narrative: `R4M-REWARD-${args.claimReference}`, idempotency_key: args.payoutRequestId }]
  });
  if (!response) return { outcome: "unknown", trackingId: null, transactionId: null, httpStatus: null };
  if (!response.ok) {
    const ambiguous = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500 || response.status >= 300 && response.status < 400;
    return { outcome: ambiguous ? "unknown" : "rejected", trackingId: null, transactionId: null, httpStatus: response.status };
  }
  const trackingId = typeof data?.tracking_id === "string" ? data.tracking_id : null;
  const rows = Array.isArray(data?.transactions) ? data.transactions : [];
  const exact = rows.length === 1 && String(rows[0]?.account ?? "") === phone;
  const transactionId = exact && (typeof rows[0]?.transaction_id === "string" || typeof rows[0]?.transaction_id === "number") ? String(rows[0].transaction_id) : null;
  const approvalRequired = String(data?.status_code ?? "").toUpperCase() === "BP103";
  return { outcome: approvalRequired || !trackingId || !transactionId ? "unknown" : "accepted", trackingId, transactionId, httpStatus: response.status };
}

export async function fetchIntaSendPayoutStatus(trackingId: string, transactionId: string): Promise<{ verified: boolean; verdict: PayoutVerdict; providerStatus: string | null; providerFeeKes: string | null; reason: string }> {
  if (!intasendPayoutEnabled()) return { verified: false, verdict: "unknown", providerStatus: null, providerFeeKes: null, reason: "payout_disabled" };
  const { response, data } = await request("/send-money/status/", { tracking_id: trackingId });
  if (!response?.ok || !data) return { verified: false, verdict: "unknown", providerStatus: null, providerFeeKes: null, reason: "provider_status_unavailable" };
  if (String(data.tracking_id ?? "") !== trackingId || !Array.isArray(data.transactions)) return { verified: false, verdict: "unknown", providerStatus: null, providerFeeKes: null, reason: "provider_tracking_mismatch" };
  const matches = data.transactions.filter((row: any) => String(row?.transaction_id ?? "") === transactionId);
  if (matches.length !== 1) return { verified: false, verdict: "unknown", providerStatus: null, providerFeeKes: null, reason: "provider_transaction_unmatched" };
  const raw = typeof matches[0].status_code === "string" ? matches[0].status_code : matches[0].status;
  const verdict = classifyPayoutProviderStatus(raw);
  const feeRaw = matches[0]?.charges;
  const fee = typeof feeRaw === "number" && Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw.toFixed(2) : typeof feeRaw === "string" && Number.isFinite(Number(feeRaw)) && Number(feeRaw) >= 0 ? Number(feeRaw).toFixed(2) : null;
  return { verified: true, verdict, providerStatus: typeof raw === "string" ? raw : null, providerFeeKes: fee, reason: "provider_status_retrieved" };
}
