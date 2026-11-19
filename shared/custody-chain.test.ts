import { describe, expect, it } from "vitest";
import { custodyEventHash, verifyCustodyChain, type CustodyChainEvent } from "./custody-chain.js";

function event(overrides: Partial<CustodyChainEvent> = {}): CustodyChainEvent {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reportId: "00000000-0000-4000-8000-000000000002",
    agentId: "00000000-0000-4000-8000-000000000003",
    eventType: "received",
    evidenceRef: null,
    notes: "received | inspected",
    actorId: "00000000-0000-4000-8000-000000000004",
    createdAt: "2026-11-14T06:00:00.123Z",
    sequenceNo: 1,
    previousHash: null,
    eventHash: null,
    hashVersion: "v2",
    ...overrides,
  };
}

describe("custody hash chain", () => {
  it("distinguishes null from an empty string and handles delimiter characters", () => {
    const base = event();
    expect(custodyEventHash(base)).not.toBe(custodyEventHash(event({ evidenceRef: "" })));
    expect(custodyEventHash(base)).not.toBe(custodyEventHash(event({ notes: "received inspected" })));
  });
  it("verifies a contiguous chain", () => {
    const first = event();
    first.eventHash = custodyEventHash(first);
    const second = event({ id: "00000000-0000-4000-8000-000000000005", eventType: "inspection_completed", sequenceNo: 2, previousHash: first.eventHash, createdAt: "2026-11-14T06:01:00.123Z" });
    second.eventHash = custodyEventHash(second);
    expect(verifyCustodyChain([second, first])).toEqual({ valid: true, checked: 2, errors: [] });
  });
  it("detects tampering, sequence gaps, and mixed-report input", () => {
    const first = event(); first.eventHash = custodyEventHash(first);
    const second = event({ id: "00000000-0000-4000-8000-000000000005", reportId: "00000000-0000-4000-8000-000000000006", sequenceNo: 3, previousHash: first.eventHash });
    second.eventHash = custodyEventHash(second);
    expect(verifyCustodyChain([first, second]).valid).toBe(false);
    expect(verifyCustodyChain([first, event({ hashVersion: "v1" })]).errors.some(e => e.reason.includes("Legacy"))).toBe(true);
  });
});
