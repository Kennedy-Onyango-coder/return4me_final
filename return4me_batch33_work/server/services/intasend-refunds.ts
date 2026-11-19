import { decryptPaymentPhone, paymentPiiConfigured } from "./payment-pii.js";
import { classifyRefundInitiation } from "../../shared/refund-policy.js";

export function intasendRefundEnabled(): boolean {
  return process.env.INTASEND_REFUND_ENABLED === "true" && process.env.INTASEND_ENVIRONMENT !== "live" &&
    !!process.env.INTASEND_SECRET_KEY?.trim() && paymentPiiConfigured();
}

export async function initiateIntaSendRefund(args: { payerPhoneCiphertext: string; amountKes: string; claimReference: string }): Promise<{
  outcome: "unknown" | "rejected"; providerBatchId: string | null; providerTransactionId: string | null; httpStatus: number | null;
}> {
  if (!intasendRefundEnabled()) return { outcome: "rejected", providerBatchId: null, providerTransactionId: null, httpStatus: null };
  const secret = process.env.INTASEND_SECRET_KEY!.trim();
  const phone = decryptPaymentPhone(args.payerPhoneCiphertext);
  const base = "https://sandbox.intasend.com/api/v1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${base}/send-money/initiate/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ provider: "MPESA-B2C", currency: "KES", transactions: [{ name: "Return4me Refund", account: phone.replace(/^\+/, ""), amount: args.amountKes, narrative: `R4M-REFUND-${args.claimReference}` }] }),
      signal: controller.signal
    });
    let payload: any = null;
    let valid = false;
    try { payload = await response.json(); valid = payload !== null && typeof payload === "object" && !Array.isArray(payload); } catch { valid = false; }
    const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
    const providerTransactionId = transactions.length === 1 && (typeof transactions[0]?.transaction_id === "string" || typeof transactions[0]?.transaction_id === "number")
      ? String(transactions[0].transaction_id) : null;
    const providerBatchId = typeof payload?.tracking_id === "string" ? payload.tracking_id : null;
    return { outcome: classifyRefundInitiation({ httpStatus: response.status, responseJsonValid: valid }), providerBatchId, providerTransactionId, httpStatus: response.status };
  } catch {
    return { outcome: "unknown", providerBatchId: null, providerTransactionId: null, httpStatus: null };
  } finally { clearTimeout(timeout); }
}
