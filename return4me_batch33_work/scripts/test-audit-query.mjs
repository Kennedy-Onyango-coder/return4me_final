import test from "node:test";
import assert from "node:assert/strict";
import { parseAuditQuery } from "../shared/audit-query.mjs";

test("uses bounded defaults", () => {
  const result = parseAuditQuery({});
  assert.equal(result.ok, true);
  assert.equal(result.value.limit, 25);
  assert.equal(result.value.offset, 0);
});

test("accepts valid filters and paired date bounds", () => {
  const result = parseAuditQuery({
    limit: "50", offset: "100", action: "claim.reviewed",
    resourceType: "claim", outcome: "success",
    from: "2026-01-01T00:00:00.000Z", to: "2026-03-31T23:59:59.999Z"
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.action, "claim.reviewed");
  assert.equal(result.value.from.toISOString(), "2026-01-01T00:00:00.000Z");
});

for (const [name, query] of [
  ["zero limit", {limit:"0"}],
  ["limit above 100", {limit:"101"}],
  ["negative offset", {offset:"-1"}],
  ["offset above cap", {offset:"100001"}],
  ["overlong action", {action:"x".repeat(101)}],
  ["one date bound only", {from:"2026-01-01"}],
  ["invalid date", {from:"not-a-date",to:"2026-01-02"}],
  ["reversed dates", {from:"2026-02-02",to:"2026-02-01"}],
  ["date range over 90 days", {from:"2026-01-01T00:00:00Z",to:"2026-04-02T00:00:00Z"}]
]) {
  test(`rejects ${name}`, () => assert.equal(parseAuditQuery(query).ok, false));
}

for (const [name, query] of [
  ["array-valued duplicate filter", {action:["one","two"]}],
  ["numeric filter value", {resourceType:42}],
  ["unsupported query key", {actorId:"someone"}],
  ["unknown outcome", {outcome:"pending"}],
  ["empty outcome is allowed", {outcome:""}]
]) {
  test(`validates ${name}`, () => {
    const result = parseAuditQuery(query);
    assert.equal(result.ok, name === "empty outcome is allowed");
  });
}
