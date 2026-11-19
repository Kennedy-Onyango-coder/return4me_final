import { describe, expect, it } from "vitest";
import { canApproveRefund, canExecuteRefund, canRequestOriginalPayerRefund, classifyRefundInitiation } from "./refund-policy.js";

describe("original-payer refund policy", () => {
  it("requires confirmed payment, a pre-handover claim and original payer evidence", () => {
    const base = { paymentConfirmed: true, claimCompleted: false, originalPayerFingerprintAvailable: true, activeRefundExists: false };
    expect(canRequestOriginalPayerRefund(base)).toBe(true);
    expect(canRequestOriginalPayerRefund({ ...base, claimCompleted: true })).toBe(false);
    expect(canRequestOriginalPayerRefund({ ...base, originalPayerFingerprintAvailable: false })).toBe(false);
    expect(canRequestOriginalPayerRefund({ ...base, activeRefundExists: true })).toBe(false);
  });
  it("requires independent refund approval and execution", () => {
    expect(canApproveRefund("maker", "checker", "requested")).toBe(true);
    expect(canApproveRefund("maker", "maker", "requested")).toBe(false);
    expect(canApproveRefund("maker", "maker", "requested", true)).toBe(true);
    expect(canApproveRefund("maker", "owner", "requested", true)).toBe(true);
    expect(canApproveRefund("maker", "maker", "approved", true)).toBe(false);
    expect(canExecuteRefund({ status: "approved", requestedBy: "maker", approvedBy: "checker", executorId: "executor" })).toBe(true);
    expect(canExecuteRefund({ status: "approved", requestedBy: "maker", approvedBy: "checker", executorId: "checker" })).toBe(false);
  });
  it("never treats an accepted refund initiation as a completed refund", () => {
    expect(classifyRefundInitiation({ httpStatus: 200, responseJsonValid: true })).toBe("unknown");
    expect(classifyRefundInitiation({ httpStatus: 500, responseJsonValid: false })).toBe("unknown");
    expect(classifyRefundInitiation({ httpStatus: 400, responseJsonValid: true })).toBe("rejected");
    expect(classifyRefundInitiation({ httpStatus: null, responseJsonValid: false })).toBe("unknown");
  });
});
