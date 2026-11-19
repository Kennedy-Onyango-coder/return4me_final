import test from "node:test";
import assert from "node:assert/strict";
import { parseSupportAssignment, parseSupportQueueQuery } from "../shared/support-queue-policy.mjs";
const uuid = "123e4567-e89b-42d3-a456-426614174000";
test("queue defaults to open with bounded pagination", () => assert.deepEqual(parseSupportQueueQuery({}), { ok: true, value: { status: "open", limit: 25, offset: 0 } }));
test("queue accepts a supported status and scalar pagination", () => assert.equal(parseSupportQueueQuery({ status: "in_progress", limit: "50", offset: "10" }).ok, true));
for (const query of [{ unexpected: "x" }, { status: ["open"] }, { status: "pending" }, { limit: "101" }, { offset: "-1" }, { limit: 2.5 }]) {
  test(`queue rejects ${JSON.stringify(query)}`, () => assert.equal(parseSupportQueueQuery(query).ok, false));
}
test("assignment accepts UUID and reason", () => assert.deepEqual(parseSupportAssignment({ assignedTo: uuid, reason: "Taking ownership" }), { ok: true, value: { assignedTo: uuid, reason: "Taking ownership" } }));
test("assignment accepts explicit unassignment", () => assert.equal(parseSupportAssignment({ assignedTo: null, reason: "Returning to queue" }).ok, true));
for (const body of [{ assignedTo: "not-a-uuid", reason: "Taking ownership" }, { assignedTo: uuid }, { assignedTo: uuid, reason: "short" }, { assignedTo: uuid, reason: "Taking ownership", extra: true }, null, []]) {
  test(`assignment rejects ${JSON.stringify(body)}`, () => assert.equal(parseSupportAssignment(body).ok, false));
}
