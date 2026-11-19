import { createHash } from "node:crypto";
import { pool } from "../db/index.js";

type IncrementResult = { totalHits: number; resetTime: Date };

/**
 * Shared express-rate-limit store backed by PostgreSQL.
 * Raw client keys (normally IP addresses) are never persisted: only SHA-256
 * digests are stored. Store failures intentionally propagate so callers do
 * not silently fall back to per-process limits.
 */
export function createPostgresRateLimitStore() {
  let windowMs = 15 * 60_000;
  let incrementsSinceCleanup = 0;

  const store = {
    init(options: { windowMs?: number }) {
      if (typeof options.windowMs === "number" && Number.isFinite(options.windowMs) && options.windowMs > 0) {
        windowMs = Number(options.windowMs);
      }
    },

    async increment(key: string): Promise<IncrementResult> {
      const digest = createHash("sha256").update(key).digest("hex");
      const result = await pool.query<{ total_hits: number; expires_at: Date }>(
        `INSERT INTO distributed_rate_limits (key_hash, total_hits, expires_at)
         VALUES ($1, 1, now() + ($2::bigint * interval '1 millisecond'))
         ON CONFLICT (key_hash) DO UPDATE SET
           total_hits = CASE
             WHEN distributed_rate_limits.expires_at <= now() THEN 1
             ELSE distributed_rate_limits.total_hits + 1
           END,
           expires_at = CASE
             WHEN distributed_rate_limits.expires_at <= now()
               THEN now() + ($2::bigint * interval '1 millisecond')
             ELSE distributed_rate_limits.expires_at
           END
         RETURNING total_hits, expires_at`,
        [digest, windowMs]
      );

      incrementsSinceCleanup += 1;
      if (incrementsSinceCleanup >= 256) {
        incrementsSinceCleanup = 0;
        // Opportunistic bounded cleanup; never blocks or changes the counter result.
        void pool.query("DELETE FROM distributed_rate_limits WHERE expires_at <= now()")
          .catch((error) => console.error("[rate-limit-store] expired-row cleanup failed", error));
      }

      const row = result.rows[0];
      return { totalHits: Number(row.total_hits), resetTime: new Date(row.expires_at) };
    },

    async decrement(key: string) {
      const digest = createHash("sha256").update(key).digest("hex");
      await pool.query(
        "UPDATE distributed_rate_limits SET total_hits = GREATEST(0, total_hits - 1) WHERE key_hash = $1",
        [digest]
      );
    },

    async resetKey(key: string) {
      const digest = createHash("sha256").update(key).digest("hex");
      await pool.query("DELETE FROM distributed_rate_limits WHERE key_hash = $1", [digest]);
    },

    async get(key: string) {
      const digest = createHash("sha256").update(key).digest("hex");
      const result = await pool.query<{ total_hits: number; expires_at: Date }>(
        "SELECT total_hits, expires_at FROM distributed_rate_limits WHERE key_hash = $1 AND expires_at > now()",
        [digest]
      );
      const row = result.rows[0];
      return row ? { totalHits: Number(row.total_hits), resetTime: new Date(row.expires_at) } : undefined;
    }
  };

  return store;
}
