export type AdminQueueName = "claims" | "disputes" | "appeals";
export type AdminQueueQuery = { status: string; limit: number; offset: number };
export function parseAdminQueueQuery(queue: AdminQueueName, query: Record<string, unknown>): { ok: true; value: AdminQueueQuery } | { ok: false; error: string };
