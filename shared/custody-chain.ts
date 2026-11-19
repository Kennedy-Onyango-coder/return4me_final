import { createHash } from "node:crypto";

export type CustodyChainEvent = {
  id: string;
  reportId: string;
  agentId: string;
  eventType: string;
  evidenceRef: string | null;
  notes: string | null;
  actorId: string;
  createdAt: Date | string;
  sequenceNo: number;
  previousHash: string | null;
  eventHash: string | null;
  hashVersion?: "v1" | "v2" | string;
};

const DOMAIN = "return4me.custody.v2";

function field(value: string | null): string {
  if (value === null) return "-1:";
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function canonicalTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid custody event timestamp");
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");
}

export function custodyEventCanonicalPayload(event: CustodyChainEvent): string {
  return [
    DOMAIN,
    event.id,
    event.reportId,
    event.agentId,
    event.eventType,
    event.evidenceRef,
    event.notes,
    event.actorId,
    canonicalTimestamp(event.createdAt),
    String(event.sequenceNo),
    event.previousHash,
  ].map(field).join("");
}

export function custodyEventHash(event: CustodyChainEvent): string {
  return createHash("sha256").update(custodyEventCanonicalPayload(event), "utf8").digest("hex");
}

export type CustodyChainVerification = {
  valid: boolean;
  checked: number;
  errors: Array<{ eventId: string; reason: string }>;
};

/** Verify a single report's v2 chain. Legacy v1 rows are explicitly unverified. */
export function verifyCustodyChain(events: readonly CustodyChainEvent[]): CustodyChainVerification {
  const errors: CustodyChainVerification["errors"] = [];
  const ordered = [...events].sort((a, b) => a.sequenceNo - b.sequenceNo || a.id.localeCompare(b.id));
  const reportIds = new Set(ordered.map(event => event.reportId));
  if (reportIds.size > 1) errors.push({ eventId: "*", reason: "Input contains more than one report" });
  let previous: string | null = null;
  ordered.forEach((event, index) => {
    if (event.hashVersion !== "v2") {
      errors.push({ eventId: event.id, reason: "Legacy or unknown hash version is not verifiable by the v2 verifier" });
      previous = event.eventHash;
      return;
    }
    if (event.sequenceNo !== index + 1) errors.push({ eventId: event.id, reason: "Sequence is not contiguous from 1" });
    if (event.previousHash !== previous) errors.push({ eventId: event.id, reason: "Previous hash does not match the preceding event" });
    if (!event.eventHash || custodyEventHash(event) !== event.eventHash) errors.push({ eventId: event.id, reason: "Event hash does not match canonical event data" });
    previous = event.eventHash;
  });
  return { valid: errors.length === 0, checked: ordered.length, errors };
}
