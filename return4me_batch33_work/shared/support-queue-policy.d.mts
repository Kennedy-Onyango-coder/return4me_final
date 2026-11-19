export type SupportQueueQuery = { status: "open" | "in_progress" | "waiting_user" | "resolved" | "closed"; limit: number; offset: number };
export function parseSupportQueueQuery(query: Record<string, unknown>): { ok: true; value: SupportQueueQuery } | { ok: false; error: string };
export function parseSupportAssignment(body: unknown): { ok: true; value: { assignedTo: string | null; reason: string } } | { ok: false; error: string };
