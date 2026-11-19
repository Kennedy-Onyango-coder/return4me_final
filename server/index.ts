import "dotenv/config";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { reportsRouter } from "./routes/reports.js";
import { guestReportsRouter } from "./routes/guest-reports.js";
import { claimsRouter } from "./routes/claims.js";
import { agentsRouter } from "./routes/agents.js";
import { agentOperationsRouter } from "./routes/agent-operations.js";
import { adminRouter } from "./routes/admin.js";
import { notificationsRouter } from "./routes/notifications.js";
import { matchingRouter } from "./routes/matching.js";
import { disputesRouter } from "./routes/disputes.js";
import { organisationsRouter } from "./routes/organisations.js";
import { supportRouter } from "./routes/support.js";
import { pricingRouter } from "./routes/pricing.js";
import { communicationsRouter } from "./routes/communications.js";
import { privacyRouter } from "./routes/privacy.js";
import { financeRouter } from "./routes/finance.js";
import { claimCollectionsRouter } from "./routes/claim-collections.js";
import { intasendWebhookRouter } from "./routes/intasend-webhook.js";
import { resendWebhookRouter } from "./routes/resend-webhook.js";
import { autoApproveDueSettlements } from "./services/settlement-worker.js";
import { processNotificationOutboxBatch } from "./services/notification-worker.js";
import { processDocumentStorageDeletionBatch } from "./services/document-storage-deletion-worker.js";
import { markStaleProviderOperationsUnknown } from "./services/provider-operation-recovery-worker.js";
import { securityIncidentsRouter } from "./routes/security-incidents.js";
import { securityGovernanceRouter } from "./routes/security-governance.js";
import { claimEvidenceRouter } from "./routes/claim-evidence.js";
import { agentDocumentsRouter } from "./routes/agent-documents.js";
import { assertPrivateStorageConfigured } from "./services/private-storage.js";
import { pool, workerLockPool } from "./db/index.js";
import { operationalLog, requestObservability } from "./observability.js";
import { closeWorkerLockPool, runObservedWorker } from "./services/runtime-operations.js";

if (process.env.NODE_ENV === "production") {
  const requiredHttps = [process.env.WEB_ORIGIN, process.env.PUBLIC_APP_URL];
  if (requiredHttps.some(value => !value || !value.startsWith("https://"))) {
    throw new Error("Production WEB_ORIGIN and PUBLIC_APP_URL must be HTTPS URLs");
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Production email delivery must be configured before starting the API");
  }
  if (!process.env.CLAMAV_HOST) throw new Error("Production CLAMAV_HOST is required; evidence uploads fail closed without scanning");
  assertPrivateStorageConfigured();
  if (!process.env.S3_BUCKET || !process.env.S3_REGION) throw new Error("Production private S3 bucket and region must be configured");
}

// Keep this ordered baseline synchronized with server/db/migrations/meta/_journal.json.
// Drizzle records each journal entry's `when` value in drizzle.__drizzle_migrations.created_at.
const EXPECTED_MIGRATION_TIMESTAMPS = [
  "1794484746551", "1794556005000", "1794632640000", "1794632700000",
  "1794652800000", "1794656400000", "1794660000000", "1794663600000",
  "1794667200000", "1794670800000", "1794674400000", "1794678000000",
  "1794700800000", "1794704400000", "1794708000000", "1794711600000",
  "1794715200000", "1794798000000", "1794910000000", "1794940000000",
  "1794950000000", "1794953600000", "1794957200000"
] as const;

const app = express();
app.disable("x-powered-by");
app.use(requestObservability);
pool.on("error", () => operationalLog("error", "database.pool.idle_client_error"));
workerLockPool.on("error", () => operationalLog("error", "database.worker_lock_pool.idle_client_error"));
app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false }));
app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb", verify(req, _res, buffer) { (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.use("/api", rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }), authRouter);
app.use("/api/reports/guest", rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }), guestReportsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/claims", claimsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/agent-operations", agentOperationsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/matching", matchingRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/organisations", organisationsRouter);
app.use("/api/support", supportRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/communications", communicationsRouter);
app.use("/api/privacy", privacyRouter);
app.use("/api/finance", financeRouter);
app.use("/api/collections", claimCollectionsRouter);
app.use("/api/webhooks", intasendWebhookRouter);
app.use("/api/webhooks", resendWebhookRouter);
app.use("/api/security-incidents", securityIncidentsRouter);
app.use("/api/security-governance", securityGovernanceRouter);
app.use("/api/agent-documents", agentDocumentsRouter);
app.use("/api", claimEvidenceRouter);
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok", service: "return4me-api" }));
app.get("/readyz", async (_req, res) => {
  try {
    const migrationTable = await pool.query<{ present: boolean }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present"
    );
    if (migrationTable.rows[0]?.present !== true) {
      return res.status(503).json({ status: "not_ready", database: "connected", migrationJournal: { status: "missing", expectedEntries: EXPECTED_MIGRATION_TIMESTAMPS.length } });
    }
    const appliedMigrations = await pool.query<{ created_at: string }>(
      "SELECT created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC"
    );
    const appliedTimestamps = appliedMigrations.rows.map(row => String(row.created_at));
    const migrationJournalMatches = appliedTimestamps.length === EXPECTED_MIGRATION_TIMESTAMPS.length &&
      EXPECTED_MIGRATION_TIMESTAMPS.every((timestamp, index) => appliedTimestamps[index] === timestamp);
    if (!migrationJournalMatches) {
      return res.status(503).json({
        status: "not_ready", database: "connected",
        migrationJournal: {
          status: "mismatch",
          expectedEntries: EXPECTED_MIGRATION_TIMESTAMPS.length,
          appliedEntries: appliedTimestamps.length
        }
      });
    }

    const result = await pool.query(`SELECT to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.claims') IS NOT NULL AS claims,
      to_regclass('public.payment_transactions') IS NOT NULL AS payment_transactions,
      to_regclass('public.financial_journals') IS NOT NULL AS financial_journals,
      to_regclass('public.payout_destinations') IS NOT NULL AS payout_destinations,
      to_regclass('public.notification_outbox') IS NOT NULL AS notification_outbox,
      to_regclass('public.notification_preferences') IS NOT NULL AS notification_preferences,
      to_regclass('public.communication_consents') IS NOT NULL AS communication_consents,
      to_regclass('public.communications_governance') IS NOT NULL AS communications_governance,
      to_regclass('public.communications_delivery_events') IS NOT NULL AS communications_delivery_events,
      to_regclass('public.data_rights_requests') IS NOT NULL AS data_rights_requests,
      to_regclass('public.document_storage_deletion_outbox') IS NOT NULL AS document_storage_deletion_outbox,
      to_regclass('public.provider_operation_outbox') IS NOT NULL AS provider_operation_outbox,
      to_regclass('public.privacy_legal_holds') IS NOT NULL AS privacy_legal_holds,
      to_regclass('public.privacy_retention_policies') IS NOT NULL AS privacy_retention_policies,
      to_regclass('public.risk_review_cases') IS NOT NULL AS risk_review_cases,
      to_regclass('public.document_access_events') IS NOT NULL AS document_access_events,
      to_regclass('public.security_incident_assessments') IS NOT NULL AS security_incident_assessments,
      to_regclass('public.runtime_worker_heartbeats') IS NOT NULL AS runtime_worker_heartbeats`);
    const missing = Object.entries(result.rows[0]).filter(([, ready]) => ready !== true).map(([name]) => name);
    if (missing.length) return res.status(503).json({ status: "not_ready", database: "connected", missingSchema: missing, migrationJournal: { status: "current", entries: appliedTimestamps.length } });
    res.json({ status: "ready", database: "connected", schema: "required_tables_present", migrationJournal: { status: "current", entries: appliedTimestamps.length } });
  } catch { res.status(503).json({ status: "not_ready", database: "unavailable" }); }
});
app.get("/api/health", async (_req, res) => {
  try { await pool.query("select 1"); res.json({ status: "ok", database: "connected" }); }
  catch { res.status(503).json({ status: "degraded", database: "unavailable" }); }
});

if (process.env.NODE_ENV === "production") {
  const webRoot = path.resolve(process.cwd(), "dist");
  if (existsSync(path.join(webRoot, "index.html"))) {
    app.use(express.static(webRoot, { index: false, fallthrough: true }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(webRoot, "index.html"), error => { if (error) next(error); });
    });
  }
}
app.use((_req, res) => res.status(404).json({ error: "Route not found", requestId: res.locals.requestId }));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  operationalLog("error", "http.request.unhandled_error", { requestId: String(res.locals.requestId || "unknown") });
  res.status(500).json({ error: "An unexpected error occurred", requestId: res.locals.requestId });
});

const port = Number(process.env.PORT || 4000);
const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 15000);
if (!Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1000 || shutdownTimeoutMs > 120000) {
  throw new Error("SHUTDOWN_TIMEOUT_MS must be an integer between 1000 and 120000");
}
const server = app.listen(port, () => operationalLog("info", "http.server.started", { port, environment: process.env.NODE_ENV || "development" }));
// Approved policy: settlement eligibility may auto-approve after 48 hours,
// but this worker never creates/submits a payout or contacts IntaSend.
const settlementApprovalTimer = setInterval(() => {
  void runObservedWorker("settlement-eligibility", autoApproveDueSettlements).catch(() => operationalLog("warn", "worker.failure_contained", { worker: "settlement-eligibility" }));
}, 60_000);
settlementApprovalTimer.unref();
void runObservedWorker("settlement-eligibility", autoApproveDueSettlements).catch(() => operationalLog("warn", "worker.initial_failure_contained", { worker: "settlement-eligibility" }));
const providerRecoveryTimer = setInterval(() => {
  void runObservedWorker("provider-operation-recovery", markStaleProviderOperationsUnknown).catch(() => operationalLog("warn", "worker.failure_contained", { worker: "provider-operation-recovery" }));
}, 60_000);
providerRecoveryTimer.unref();
void runObservedWorker("provider-operation-recovery", markStaleProviderOperationsUnknown).catch(() => operationalLog("warn", "worker.initial_failure_contained", { worker: "provider-operation-recovery" }));
const documentDeletionTimer = setInterval(() => {
  void runObservedWorker("document-storage-deletion", processDocumentStorageDeletionBatch).catch(() => operationalLog("warn", "worker.failure_contained", { worker: "document-storage-deletion" }));
}, 15_000);
documentDeletionTimer.unref();
void runObservedWorker("document-storage-deletion", processDocumentStorageDeletionBatch).catch(() => operationalLog("warn", "worker.initial_failure_contained", { worker: "document-storage-deletion" }));
const notificationOutboxTimer = setInterval(() => {
  void runObservedWorker("notification-outbox", processNotificationOutboxBatch).catch(() => operationalLog("warn", "worker.failure_contained", { worker: "notification-outbox" }));
}, 10_000);
notificationOutboxTimer.unref();
void runObservedWorker("notification-outbox", processNotificationOutboxBatch).catch(() => operationalLog("warn", "worker.initial_failure_contained", { worker: "notification-outbox" }));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(settlementApprovalTimer);
  clearInterval(notificationOutboxTimer);
  clearInterval(documentDeletionTimer);
  clearInterval(providerRecoveryTimer);
  operationalLog("info", "process.shutdown.started");
  try {
    const forceClose = setTimeout(() => {
      operationalLog("error", "process.shutdown.deadline_exceeded");
      server.closeAllConnections?.();
      process.exitCode = 1;
    }, shutdownTimeoutMs);
    forceClose.unref();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.all([pool.end(), closeWorkerLockPool()]);
    clearTimeout(forceClose);
    operationalLog("info", "process.shutdown.completed");
    process.exitCode = 0;
  } catch {
    operationalLog("error", "process.shutdown.failed");
    process.exitCode = 1;
  }
}
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
