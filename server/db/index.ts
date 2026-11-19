import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
function boundedInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return parsed;
}
const idleTimeoutMillis = boundedInteger("PG_IDLE_TIMEOUT_MS", 30000, 1000, 300000);
const connectionTimeoutMillis = boundedInteger("PG_CONNECTION_TIMEOUT_MS", 5000, 250, 60000);
const ssl = process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: boundedInteger("PG_POOL_MAX", 10, 1, 50),
  idleTimeoutMillis,
  connectionTimeoutMillis,
  allowExitOnIdle: false,
  ssl
});

/** Separate sessions keep advisory worker locks independent of application-pool saturation. */
export const workerLockPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis,
  connectionTimeoutMillis,
  allowExitOnIdle: false,
  ssl
});

export const db = drizzle(pool, { schema });
