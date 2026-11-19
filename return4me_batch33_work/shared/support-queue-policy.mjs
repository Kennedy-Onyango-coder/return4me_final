const statuses = new Set(["open", "in_progress", "waiting_user", "resolved", "closed"]);

export function parseSupportQueueQuery(query) {
  const allowed = new Set(["status", "limit", "offset"]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) return { ok: false, error: `Unsupported support queue filter: ${key}.` };
    if (query[key] !== undefined && typeof query[key] !== "string") {
      return { ok: false, error: `Support queue filter ${key} must be supplied exactly once as text.` };
    }
  }
  const status = typeof query.status === "string" ? query.status.trim() : "open";
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!statuses.has(status)) return { ok: false, error: "Unsupported support ticket status." };
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
    return { ok: false, error: "Invalid pagination. Limit must be 1–100 and offset 0–100000." };
  }
  return { ok: true, value: { status, limit, offset } };
}

export function parseSupportAssignment(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid assignment request." };
  const keys = Object.keys(body);
  if (keys.some((key) => !["assignedTo", "reason"].includes(key))) return { ok: false, error: "Unsupported assignment field." };
  if (!(body.assignedTo === null || (typeof body.assignedTo === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.assignedTo)))) {
    return { ok: false, error: "Assignee must be a valid user ID or null." };
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 8 || body.reason.trim().length > 500) {
    return { ok: false, error: "Provide an assignment reason of 8–500 characters." };
  }
  return { ok: true, value: { assignedTo: body.assignedTo, reason: body.reason.trim() } };
}
