import { describe, expect, it } from "vitest";
import { canRecordCustodyEvent, canReleaseItem, canTransitionClaim, custodyEventOrderingDecision } from "./workflow-policy.js";

describe("claim transition policy", () => {
  it("requires review before approval", () => {
    expect(canTransitionClaim("submitted", "approved")).toBe(false);
    expect(canTransitionClaim("submitted", "under_review")).toBe(true);
    expect(canTransitionClaim("under_review", "approved")).toBe(true);
  });
  it("does not allow leaving terminal states", () => {
    expect(canTransitionClaim("completed", "disputed")).toBe(false);
    expect(canTransitionClaim("cancelled", "under_review")).toBe(false);
  });
});

describe("custody and release gates", () => {
  const authorised = true;
  it("requires receipt before inspection", () => {
    expect(canRecordCustodyEvent([], "inspection_completed", authorised)).toBe(false);
    expect(canRecordCustodyEvent(["received"], "inspection_completed", authorised)).toBe(true);
  });
  it("does not permit handover-ready while payment/identity gates are absent", () => {
    expect(canRecordCustodyEvent(["received", "inspection_completed"], "handover_ready", authorised)).toBe(false);
    expect(canRecordCustodyEvent(["received", "inspection_completed"], "handover_ready", authorised, true)).toBe(true);
  });
  it("permits the release event policy only after handover-ready and the external gates pass", () => {
    expect(canRecordCustodyEvent(["received", "inspection_completed", "handover_ready"], "released", authorised, true)).toBe(true);
    expect(canRecordCustodyEvent(["received", "inspection_completed"], "released", authorised, true)).toBe(false);
  });
  it("requires every independent release gate", () => {
    const passed = {
      claimApproved: true, paymentConfirmed: true, collectionCodeConsumed: true,
      claimantIdentityVerified: true, authorisedAgent: true, disputeOrLegalHold: false,
      handoverConfirmedByBoth: true
    };
    expect(canReleaseItem(passed)).toBe(true);
    expect(canReleaseItem({ ...passed, paymentConfirmed: false })).toBe(false);
    expect(canReleaseItem({ ...passed, disputeOrLegalHold: true })).toBe(false);
    expect(canReleaseItem({ ...passed, handoverConfirmedByBoth: false })).toBe(false);
  });
});

describe("custody event ordering", () => {
  const empty = { hasReceived: false, hasInspected: false, hasHandoverReady: false };
  const received = { ...empty, hasReceived: true };
  const inspected = { ...received, hasInspected: true };

  it("accepts the approved receipt then inspection sequence", () => {
    expect(custodyEventOrderingDecision(empty, "received")).toEqual({ allowed: true });
    expect(custodyEventOrderingDecision(received, "inspection_completed")).toEqual({ allowed: true });
  });

  it("rejects inspection before physical receipt", () => {
    expect(custodyEventOrderingDecision(empty, "inspection_completed")).toEqual({
      allowed: false,
      message: "Record physical receipt before inspection"
    });
  });

  it("rejects a duplicate receipt", () => {
    expect(custodyEventOrderingDecision(received, "received")).toEqual({
      allowed: false,
      message: "Receipt has already been recorded"
    });
  });

  it("rejects handover-ready before inspection instead of reporting a disabled feature", () => {
    // The route used to answer 423 for every handover_ready request, which made its
    // "inspection before handover" comparison unreachable. Ordering is decided first, so an
    // out-of-sequence request is reported as an ordering conflict and the gate still blocks the
    // in-sequence one afterwards.
    expect(custodyEventOrderingDecision(received, "handover_ready")).toEqual({
      allowed: false,
      message: "Complete and record inspection before marking handover ready"
    });
    expect(custodyEventOrderingDecision(inspected, "handover_ready")).toEqual({ allowed: true });
  });

  it("requires handover-ready before release", () => {
    expect(custodyEventOrderingDecision(inspected, "released")).toEqual({ allowed: false, message: "Record verified handover readiness before release" });
    expect(custodyEventOrderingDecision({ ...inspected, hasHandoverReady: true }, "released")).toEqual({ allowed: true });
  });

  it("rejects a duplicate handover-ready record", () => {
    expect(custodyEventOrderingDecision({ ...inspected, hasHandoverReady: true }, "handover_ready")).toEqual({
      allowed: false,
      message: "Handover readiness has already been recorded"
    });
  });

  it("is never a substitute for the workflow gate", () => {
    // Passing the ordering layer must not be enough to persist handover-ready or release.
    expect(canRecordCustodyEvent(["received", "inspection_completed"], "handover_ready", true)).toBe(false);
    expect(canRecordCustodyEvent(["received", "inspection_completed"], "handover_ready", true, true)).toBe(true);
    expect(canRecordCustodyEvent(["received", "inspection_completed", "handover_ready"], "released", true, true)).toBe(true);
    expect(canRecordCustodyEvent(["received", "inspection_completed"], "handover_ready", false, true)).toBe(false);
  });
});
