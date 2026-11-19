import { describe, expect, it } from "vitest";
import { decideProviderCollection, mayOpenNewPaymentSession, normalizeKenyanMpesaPhone, paymentSessionCanBeReused } from "./payment-collection-policy";

describe("claimant collection policy", () => {
  it("normalizes Kenyan M-Pesa numbers without accepting malformed values", () => {
    expect(normalizeKenyanMpesaPhone("0712 345 678")).toBe("+254712345678");
    expect(normalizeKenyanMpesaPhone("+254712345678")).toBe("+254712345678");
    expect(normalizeKenyanMpesaPhone("071234")).toBeNull();
    expect(normalizeKenyanMpesaPhone(712345678)).toBeNull();
  });
  it("confirms only exact KES COMPLETE provider facts", () => {
    const base = { state: "COMPLETE" as const, currency: "KES", providerAmount: "150.00", expectedAmount: "150.00", invoiceMatches: true, transactionBelongsToClaim: true };
    expect(decideProviderCollection(base)).toBe("confirm");
    expect(decideProviderCollection({ ...base, currency: "USD" })).toBe("refuse");
    expect(decideProviderCollection({ ...base, providerAmount: "149.99" })).toBe("refuse");
    expect(decideProviderCollection({ ...base, invoiceMatches: false })).toBe("refuse");
    expect(decideProviderCollection({ ...base, transactionBelongsToClaim: false })).toBe("refuse");
  });
  it("never treats pending, partial, or unknown outcomes as payment", () => {
    const base = { currency: "KES", providerAmount: 150, expectedAmount: 150, invoiceMatches: true, transactionBelongsToClaim: true };
    expect(decideProviderCollection({ ...base, state: "PENDING" })).toBe("remain_pending");
    expect(decideProviderCollection({ ...base, state: "PARTIAL" })).toBe("remain_pending");
    expect(decideProviderCollection({ ...base, state: "FAILED" })).toBe("record_failure");
    expect(decideProviderCollection({ ...base, state: "UNKNOWN" })).toBe("unknown");
  });
  it("allows reuse only for unresolved sessions before their short expiry", () => {
    const expiry = new Date(Date.now() + 60_000);
    expect(paymentSessionCanBeReused("pending", expiry)).toBe(true);
    expect(paymentSessionCanBeReused("confirmed", expiry)).toBe(false);
    expect(paymentSessionCanBeReused("unknown", new Date(Date.now() - 1000))).toBe(false);
  });
  it("requires claimant-confirmed assessment and active 24-hour window", () => {
    const expiry = new Date(Date.now() + 60_000);
    expect(mayOpenNewPaymentSession({ assessmentStatus: "claimant_confirmed", paymentWindowExpiresAt: expiry })).toBe(true);
    expect(mayOpenNewPaymentSession({ assessmentStatus: "paid", paymentWindowExpiresAt: expiry })).toBe(false);
    expect(mayOpenNewPaymentSession({ assessmentStatus: "claimant_confirmed", paymentWindowExpiresAt: new Date(Date.now() - 1000) })).toBe(false);
  });
});
