import test from "node:test";
import assert from "node:assert/strict";
import { parseAdminQueueQuery } from "../shared/admin-queue-policy.mjs";
for (const [queue, status] of [["claims", "submitted"], ["disputes", "open"], ["appeals", "submitted"]]) {
  test(`${queue} queue defaults to its pending status`, () => assert.deepEqual(parseAdminQueueQuery(queue, {}), { ok: true, value: { status, limit: 25, offset: 0 } }));
  test(`${queue} queue accepts bounded scalar pagination`, () => assert.equal(parseAdminQueueQuery(queue, { status, limit: "100", offset: "20" }).ok, true));
}
for (const [queue, query] of [["claims", { status: ["submitted"] }], ["disputes", { surprise: "x" }], ["appeals", { limit: "101" }], ["claims", { offset: "-1" }], ["disputes", { status: "pending" }], ["appeals", { limit: 5 }]]) {
  test(`${queue} queue rejects ${JSON.stringify(query)}`, () => assert.equal(parseAdminQueueQuery(queue, query).ok, false));
}
test("unknown queue is rejected", () => assert.equal(parseAdminQueueQuery("evidence", {}).ok, false));
