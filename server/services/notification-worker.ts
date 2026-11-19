import { pool } from "../db/index.js";

/** Persist queued in-app notifications with retry and duplicate-delivery protection. */
export async function processNotificationOutboxBatch(limit = 25): Promise<number> {
  const due = await pool.query(`SELECT id FROM notification_outbox WHERE status IN ('pending','retry') AND next_attempt_at<=now()
    ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at LIMIT $1`, [Math.max(1, Math.min(100, limit))]);
  let delivered = 0;
  for (const candidate of due.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(`SELECT id,user_id,type,title,body,link,category,priority,attempt_count FROM notification_outbox
        WHERE id=$1 AND status IN ('pending','retry') AND next_attempt_at<=now() FOR UPDATE SKIP LOCKED`, [candidate.id]);
      if (!locked.rowCount) { await client.query("ROLLBACK"); continue; }
      const row = locked.rows[0];
      await client.query(`INSERT INTO notifications(outbox_id,user_id,type,title,body,link,category,priority)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(outbox_id) DO NOTHING`, [row.id,row.user_id,row.type,row.title,row.body,row.link,row.category,row.priority]);
      await client.query(`UPDATE notification_outbox SET status='delivered',attempt_count=attempt_count+1,delivered_at=now(),last_error_code=NULL WHERE id=$1`, [row.id]);
      await client.query("COMMIT");
      delivered++;
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
      const attempts = await pool.query(`UPDATE notification_outbox SET attempt_count=attempt_count+1,
        status=CASE WHEN attempt_count+1>=8 THEN 'dead' ELSE 'retry' END,
        next_attempt_at=now()+make_interval(secs=>LEAST(21600,30*(2::numeric^LEAST(attempt_count,9))::integer)),
        last_error_code='notification_persist_failed' WHERE id=$1 AND status IN ('pending','retry')`, [candidate.id]).catch(() => undefined);
      void attempts;
    } finally { client.release(); }
  }
  return delivered;
}
