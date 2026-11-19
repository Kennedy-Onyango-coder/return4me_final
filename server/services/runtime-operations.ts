import type { PoolClient } from "pg";
import { pool, workerLockPool } from "../db/index.js";
import { operationalLog } from "../observability.js";

const activeWorkers = new Set<string>();

/**
 * Records worker liveness without storing exception text, payloads or personal data.
 * A PostgreSQL session advisory lock coordinates the same worker across API instances;
 * a dedicated small pool prevents lock sessions from consuming application query slots.
 */
export async function runObservedWorker(name: string, operation: () => Promise<unknown>) {
  if (activeWorkers.has(name)) {
    operationalLog("warn", "worker.run.skipped_local_overlap", { worker: name });
    return undefined;
  }
  activeWorkers.add(name);
  let lockClient: PoolClient | undefined;
  let lockAcquired = false;
  try {
    lockClient = await workerLockPool.connect();
    const lock = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [name]
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      operationalLog("info", "worker.run.skipped_distributed_overlap", { worker: name });
      return undefined;
    }

    const startedAt = new Date();
    await pool.query(`INSERT INTO runtime_worker_heartbeats (worker_name,status,last_started_at,updated_at)
      VALUES ($1,'running',$2,now()) ON CONFLICT (worker_name) DO UPDATE SET status='running',
      last_started_at=EXCLUDED.last_started_at, updated_at=now()`, [name, startedAt]);
    const result = await operation();
    await pool.query(`UPDATE runtime_worker_heartbeats SET status='healthy', last_completed_at=now(),
      successful_runs=successful_runs+1, last_error_code=NULL, updated_at=now() WHERE worker_name=$1`, [name]);
    operationalLog("info", "worker.run.completed", { worker: name });
    return result;
  } catch (error) {
    try {
      await pool.query(`INSERT INTO runtime_worker_heartbeats (worker_name,status,last_failure_at,last_error_code,failed_runs,updated_at)
        VALUES ($1,'degraded',now(),'worker_execution_failed',1,now()) ON CONFLICT (worker_name) DO UPDATE SET
        status='degraded', last_failure_at=now(), last_error_code='worker_execution_failed',
        failed_runs=runtime_worker_heartbeats.failed_runs+1, updated_at=now()`, [name]);
    } catch { /* Runtime telemetry must not mask the original worker failure. */ }
    operationalLog("error", "worker.run.failed", { worker: name });
    throw error;
  } finally {
    if (lockClient) {
      if (lockAcquired) {
        try {
          await lockClient.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [name]);
        } catch {
          // Closing the session releases any remaining session-level advisory locks.
          lockClient.release(true);
          lockClient = undefined;
        }
      }
      lockClient?.release();
    }
    activeWorkers.delete(name);
  }
}

/** Close the dedicated lock pool during graceful API shutdown. */
export async function closeWorkerLockPool() {
  await workerLockPool.end();
}
