import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { custodyEventHash, verifyCustodyChain, type CustodyChainEvent } from "../../shared/custody-chain.js";

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, "server/db/migrations/0002_custody_chain_v2.sql"), "utf8");
const route = readFileSync(resolve(root, "server/routes/agent-operations.ts"), "utf8");
const agentRoute = readFileSync(resolve(root, "server/routes/agents.ts"), "utf8");

function event(overrides: Partial<CustodyChainEvent> = {}): CustodyChainEvent {
  return {
    id: "00000000-0000-4000-8000-000000000001", reportId: "00000000-0000-4000-8000-000000000002",
    agentId: "00000000-0000-4000-8000-000000000003", eventType: "received", evidenceRef: null,
    notes: null, actorId: "00000000-0000-4000-8000-000000000004", createdAt: "2026-11-14T06:00:00.000Z",
    sequenceNo: 1, previousHash: null, eventHash: null, hashVersion: "v2", ...overrides,
  };
}

describe("custody chain integrity controls", () => {
  it("uses database-generated canonical hashes and append-only guards", () => {
    expect(migration).toContain("return4me_custody_event_hash");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("BEFORE TRUNCATE");
    expect(migration).toContain("hash_version='v2'");
  });
  it("does not accept application-computed hash or sequence values on transfer insert", () => {
    expect(route).toContain("INSERT INTO custody_events(report_id,agent_id,event_type,notes,actor_id)");
    expect(route).not.toContain("JSON.stringify(payload)");
    expect(agentRoute).toContain("Database trigger serialises report-level appends and owns sequence/hash generation");
    expect(agentRoute).not.toContain("createHash(\"sha256\").update(JSON.stringify(eventPayload))");
  });
  it("verifies the canonical event digest and flags altered data", () => {
    const original = event(); original.eventHash = custodyEventHash(original);
    expect(verifyCustodyChain([original]).valid).toBe(true);
    expect(verifyCustodyChain([{ ...original, notes: "altered" }]).valid).toBe(false);
  });
  it("requires current Agent and current approved claimant identities for transfer", () => {
    expect(route).toContain("current assigned Agent and current approved claimant must each confirm");
    expect(route).toContain("isAgent && isClaimant");
    expect(route).toContain("FOR UPDATE OF x");
    expect(route).toContain("Transfer confirmations are only accepted after physical custody has begun");
  });
});
