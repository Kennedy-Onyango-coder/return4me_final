import { describe, expect, it } from "vitest";
import { COUNTIES, PAYMENT_ALLOCATION } from "../../shared/contracts.js";
import { allocateGrossKes, evaluateSettlementEligibility, getSettlementEligibilityTime } from "../../shared/financial-policy.js";

describe("shared product contracts", () => {
  it("contains the 47 Kenyan counties without duplicates", () => {
    expect(COUNTIES).toHaveLength(47);
    expect(new Set(COUNTIES).size).toBe(47);
  });
  it("keeps the approved target allocation at 100 percent", () => {
    expect(PAYMENT_ALLOCATION.finder + PAYMENT_ALLOCATION.agent + PAYMENT_ALLOCATION.platform).toBe(100);
    expect(PAYMENT_ALLOCATION).toEqual({ finder: 33, agent: 25, platform: 42 });
  });
  it("allocates currency cents without losing any amount", () => {
    const result = allocateGrossKes(1000);
    expect(result.grossCents).toBe(100000);
    expect(result.finderCents + result.agentCents + result.platformCents).toBe(result.grossCents);
    expect([result.finderCents, result.agentCents, result.platformCents]).toEqual([33000, 25000, 42000]);
  });
  it("sets the eligibility time 48 hours after recovery", () => {
    const recovered = new Date("2026-01-01T10:00:00.000Z");
    expect(getSettlementEligibilityTime(recovered).toISOString()).toBe("2026-01-03T10:00:00.000Z");
  });
  it("holds settlement until the timer passes and no holds remain", () => {
    const settleAt = new Date("2026-01-03T10:00:00.000Z");
    const base = { paymentConfirmedAt: new Date("2026-01-01T09:00:00.000Z"), recoveryConfirmedAt: new Date("2026-01-01T10:00:00.000Z"), settleAt, disputeHold: false, legalHold: false };
    expect(evaluateSettlementEligibility({ ...base, now: new Date("2026-01-03T09:59:59.000Z") }).eligible).toBe(false);
    expect(evaluateSettlementEligibility({ ...base, now: new Date("2026-01-03T10:00:00.000Z") }).eligible).toBe(true);
    expect(evaluateSettlementEligibility({ ...base, disputeHold: true, now: new Date("2026-01-04T10:00:00.000Z") }).eligible).toBe(false);
  });
});
