import { createHash, timingSafeEqual } from "node:crypto";
import { paymentPiiConfigured } from "./payment-pii.js";

const DEFAULT_SANDBOX_BASE = "https://sandbox.intasend.com/api/v1";

export type IntaSendInvoice = { invoice_id?: string; state?: string; value?: number | string; currency?: string; api_ref?: string; [key: string]: unknown };
export type IntaSendResult = { ok: boolean; status: number; invoice: IntaSendInvoice | null; ambiguous: boolean; errorCode?: string };

export function intasendCollectionEnabled(): boolean {
  return process.env.INTASEND_COLLECTION_ENABLED === "true" && process.env.INTASEND_ENVIRONMENT !== "live" && !!process.env.INTASEND_SECRET_KEY?.trim() && !!process.env.INTASEND_WEBHOOK_CHALLENGE?.trim() && paymentPiiConfigured();
}

function baseUrl(): string {
  // This clean-room release intentionally supports sandbox only. A live host
  // cannot be selected by an environment override; production enablement needs
  // a separately reviewed release change and explicit owner authorisation.
  return DEFAULT_SANDBOX_BASE;
}

async function providerRequest(path: string, body: Record<string, unknown>): Promise<IntaSendResult> {
  const secret = process.env.INTASEND_SECRET_KEY?.trim();
  if (!secret) return { ok: false, status: 0, invoice: null, ambiguous: false, errorCode: "provider_not_configured" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as any;
    const invoice = payload?.invoice && typeof payload.invoice === "object" ? payload.invoice : payload;
    if (!response.ok) return { ok: false, status: response.status, invoice: invoice && typeof invoice === "object" ? invoice : null, ambiguous: response.status >= 500, errorCode: `provider_http_${response.status}` };
    return { ok: true, status: response.status, invoice: invoice && typeof invoice === "object" ? invoice : null, ambiguous: !invoice?.invoice_id };
  } catch (error) {
    return { ok: false, status: 0, invoice: null, ambiguous: true, errorCode: error instanceof Error && error.name === "AbortError" ? "provider_timeout" : "provider_network_error" };
  } finally { clearTimeout(timeout); }
}

export async function initiateMpesaStk(args: { phone: string; amountKes: string; apiRef: string }): Promise<IntaSendResult> {
  if (!intasendCollectionEnabled()) return { ok: false, status: 0, invoice: null, ambiguous: false, errorCode: "collection_disabled" };
  return providerRequest("/payment/mpesa-stk-push/", { amount: Number(args.amountKes), phone_number: args.phone, api_ref: args.apiRef });
}

export async function fetchCollectionStatus(invoiceId: string): Promise<IntaSendResult> {
  if (!intasendCollectionEnabled()) return { ok: false, status: 0, invoice: null, ambiguous: false, errorCode: "collection_disabled" };
  return providerRequest("/payment/status/", { invoice_id: invoiceId });
}

export function verifyIntaSendChallenge(received: unknown): boolean {
  const expected = process.env.INTASEND_WEBHOOK_CHALLENGE;
  if (typeof received !== "string" || !expected || !expected.trim()) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
