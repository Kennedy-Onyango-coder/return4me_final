import { describe, expect, it } from "vitest";
import { classifyPayoutProviderStatus } from "./intasend-payouts.js";

describe("IntaSend per-transaction payout status", () => {
  it("confirms only the exact TS100 success code", () => {
    expect(classifyPayoutProviderStatus("TS100")).toBe("completed");
    expect(classifyPayoutProviderStatus("TS100 - Success")).toBe("completed");
    expect(classifyPayoutProviderStatus("TS101")).toBe("unknown");
    expect(classifyPayoutProviderStatus("TS10")).toBe("unknown");
  });
  it("keeps provider failures, cancellation and progress distinct", () => {
    expect(classifyPayoutProviderStatus("TF103")).toBe("failed");
    expect(classifyPayoutProviderStatus("TC108")).toBe("cancelled");
    expect(classifyPayoutProviderStatus("TP101")).toBe("in_progress");
    expect(classifyPayoutProviderStatus("TH101")).toBe("in_progress");
    expect(classifyPayoutProviderStatus("future-code")).toBe("unknown");
  });
});
