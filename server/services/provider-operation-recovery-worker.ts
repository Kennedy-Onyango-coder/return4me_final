import { pool } from "../db/index.js";

/** Converts abandoned reservations to unknown; never retries or contacts a payment provider. */
export async function markStaleProviderOperationsUnknown(limit = 50): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await pool.query(`WITH stale AS (
      SELECT id FROM provider_operation_outbox
      WHERE status IN ('reserved','dispatching')
        AND COALESCE(dispatch_started_at, created_at) < now()-interval '5 minutes'
      ORDER BY COALESCE(dispatch_started_at, created_at) LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE provider_operation_outbox o SET status='unknown', updated_at=now()
      FROM stale WHERE o.id=stale.id RETURNING o.id`, [boundedLimit]);
  return result.rowCount ?? 0;
}
