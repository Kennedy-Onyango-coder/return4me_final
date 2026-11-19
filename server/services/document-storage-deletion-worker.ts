import { pool } from "../db/index.js";
import { deletePrivateObjectStrict } from "./private-storage.js";

/** Idempotent private-object cleanup. Unlike payment operations, deletion can be safely retried. */
export async function processDocumentStorageDeletionBatch(limit = 20): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  // Recover jobs claimed by a process that died while calling object storage.
  await pool.query(`UPDATE document_storage_deletion_outbox SET status='retry', next_attempt_at=now(),
    last_error_code='worker_lease_expired', updated_at=now()
    WHERE status='processing' AND updated_at < now()-interval '5 minutes'`);
  const candidates = await pool.query(`WITH due AS (
      SELECT id FROM document_storage_deletion_outbox
      WHERE status IN ('pending','retry') AND next_attempt_at<=now()
      ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE document_storage_deletion_outbox o SET status='processing', updated_at=now()
      FROM due WHERE o.id=due.id RETURNING o.id,o.storage_key,o.attempt_count`, [boundedLimit]);
  let deleted = 0;
  for (const job of candidates.rows) {
    try {
      await deletePrivateObjectStrict(job.storage_key);
      await pool.query(`UPDATE document_storage_deletion_outbox SET status='deleted', attempt_count=attempt_count+1,
        deleted_at=now(), last_error_code=NULL, updated_at=now() WHERE id=$1 AND status='processing'`, [job.id]);
      deleted++;
    } catch {
      const nextAttempt = Number(job.attempt_count) + 1;
      await pool.query(`UPDATE document_storage_deletion_outbox SET status=$2, attempt_count=$3,
        next_attempt_at=now()+make_interval(secs=>LEAST(21600,30*(2::numeric^LEAST($3,9))::integer)),
        last_error_code='private_object_delete_failed', updated_at=now() WHERE id=$1 AND status='processing'`,
        [job.id, nextAttempt >= 8 ? 'dead' : 'retry', nextAttempt]);
    }
  }
  return deleted;
}
