/**
 * Parse and validate audit explorer query parameters before building a database query.
 * Kept dependency-free so the boundary conditions can be exercised with Node's test runner.
 * @param {Record<string, unknown>} query
 * @returns {{ok:true, value:{limit:number,offset:number,action:string,resourceType:string,outcome:string,from:Date|null,to:Date|null}}|{ok:false,error:string}}
 */
export function parseAuditQuery(query) {
  const allowedKeys = new Set(["limit", "offset", "action", "resourceType", "outcome", "from", "to"]);
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) return { ok: false, error: `Unsupported audit filter: ${key}.` };
    if (query[key] !== undefined && typeof query[key] !== "string") {
      return { ok: false, error: `Audit filter ${key} must be supplied exactly once as text.` };
    }
  }
  const scalar = (key) => typeof query[key] === "string" ? query[key].trim() : "";
  const rawLimit = query.limit === undefined ? 25 : Number(query.limit);
  const rawOffset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100 ||
      !Number.isInteger(rawOffset) || rawOffset < 0 || rawOffset > 100000) {
    return { ok: false, error: "Invalid pagination. Limit must be 1–100 and offset 0–100000." };
  }

  const action = scalar("action");
  const resourceType = scalar("resourceType");
  const outcome = scalar("outcome");
  if (action.length > 100 || resourceType.length > 80 || outcome.length > 30) {
    return { ok: false, error: "Audit filters exceed permitted lengths." };
  }
  if (outcome && !["success", "failure", "denied"].includes(outcome)) {
    return { ok: false, error: "Outcome must be success, failure, or denied." };
  }

  const rawFrom = scalar("from");
  const rawTo = scalar("to");
  const from = rawFrom ? new Date(rawFrom) : null;
  const to = rawTo ? new Date(rawTo) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) ||
      Boolean(from) !== Boolean(to) ||
      (from && to && (from > to || to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000))) {
    return { ok: false, error: "Provide both audit date bounds, in order, within a maximum 90-day window." };
  }

  return { ok: true, value: { limit: rawLimit, offset: rawOffset, action, resourceType, outcome, from, to } };
}
