const queueStatuses = {
  claims: new Set(["submitted", "under_review", "approved", "rejected", "disputed", "completed", "cancelled"]),
  disputes: new Set(["open", "investigating", "awaiting_information", "resolved", "closed", "dismissed"]),
  appeals: new Set(["submitted", "under_review", "upheld", "declined"])
};

const defaults = { claims: "submitted", disputes: "open", appeals: "submitted" };

export function parseAdminQueueQuery(queue, query) {
  if (!Object.hasOwn(queueStatuses, queue)) return { ok: false, error: "Unsupported admin queue." };
  const allowed = new Set(["status", "limit", "offset"]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) return { ok: false, error: `Unsupported queue filter: ${key}.` };
    if (query[key] !== undefined && typeof query[key] !== "string") return { ok: false, error: `Queue filter ${key} must be supplied exactly once as text.` };
  }
  const status = typeof query.status === "string" ? query.status.trim() : defaults[queue];
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!queueStatuses[queue].has(status)) return { ok: false, error: "Unsupported queue status." };
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
    return { ok: false, error: "Invalid pagination. Limit must be 1–100 and offset 0–100000." };
  }
  return { ok: true, value: { status, limit, offset } };
}
