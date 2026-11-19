import { describe, expect, it } from "vitest";
import { evaluatePayoutPreflight, classifyPaymentRetry, providerConfirmationIsAuthoritative, allocateGrossKes, getSettlementEligibilityTime } from "./financial-policy";

describe("financial safety gates", () => {
  it("keeps reward allocation independent and exactly balanced at the approved 33/25/42 split", () => {
    const allocation = allocateGrossKes(100);
    expect(allocation.finderCents).toBe(3300);
    expect(allocation.agentCents).toBe(2500);
    expect(allocation.platformCents).toBe(4200);
    expect(allocation.finderCents + allocation.agentCents + allocation.platformCents).toBe(allocation.grossCents);
  });
  it("sets settlement eligibility exactly 48 hours after recovery handover", () => {
    const handover = new Date("2026-11-01T10:00:00.000Z");
    expect(getSettlementEligibilityTime(handover).toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });
  it("blocks payout when the destination changed recently", () => {
    const result = evaluatePayoutPreflight({ settlementApproved: true, paymentProviderConfirmed: true, recoveryHandoverConfirmed: true, disputeHold: false, legalHold: false, beneficiaryVerified: true, destinationRecentlyChanged: true, sufficientWorkingWalletFunds: true, workingWalletVerifiedForDisbursement: true, payoutAlreadyExists: false, initiatorId: "admin-1", approverId: "admin-2" });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("Destination change hold is active");
  });
  it("requires a separate approver", () => {
    const result = evaluatePayoutPreflight({ settlementApproved: true, paymentProviderConfirmed: true, recoveryHandoverConfirmed: true, disputeHold: false, legalHold: false, beneficiaryVerified: true, destinationRecentlyChanged: false, sufficientWorkingWalletFunds: true, workingWalletVerifiedForDisbursement: true, payoutAlreadyExists: false, initiatorId: "same-user", approverId: "same-user" });
    expect(result.allowed).toBe(false);
  });
  it("does not invite duplicate payment after a timeout", () => {
    expect(classifyPaymentRetry("timeout").retryAllowed).toBe(false);
    expect(classifyPaymentRetry("pending").retryAllowed).toBe(false);
  });
  it("requires authenticated idempotent provider evidence", () => {
    expect(providerConfirmationIsAuthoritative({ authenticatedCallback: false, idempotencyVerified: true, providerStatus: "COMPLETE" })).toBe(false);
    expect(providerConfirmationIsAuthoritative({ authenticatedCallback: true, idempotencyVerified: true, providerStatus: "COMPLETE" })).toBe(true);
  });
});
