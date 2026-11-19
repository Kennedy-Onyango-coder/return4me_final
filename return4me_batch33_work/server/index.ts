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
import { autoApproveDueSettlements } from "./services/settlement-worker.js";
import { processNotificationOutboxBatch } from "./services/notification-worker.js";
import { securityIncidentsRouter } from "./routes/security-incidents.js";
import { claimEvidenceRouter } from "./routes/claim-evidence.js";
import { agentDocumentsRouter } from "./routes/agent-documents.js";
import { assertPrivateStorageConfigured } from "./services/private-storage.js";
import { pool } from "./db/index.js";

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

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false }));
app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));
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
app.use("/api/security-incidents", securityIncidentsRouter);
app.use("/api/agent-documents", agentDocumentsRouter);
app.use("/api", claimEvidenceRouter);
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/readyz", async (_req, res) => {
  try {
    const result = await pool.query(`SELECT to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.claims') IS NOT NULL AS claims,
      to_regclass('public.payment_transactions') IS NOT NULL AS payment_transactions,
      to_regclass('public.financial_journals') IS NOT NULL AS financial_journals,
      to_regclass('public.payout_destinations') IS NOT NULL AS payout_destinations,
      to_regclass('public.notification_outbox') IS NOT NULL AS notification_outbox,
      to_regclass('public.data_rights_requests') IS NOT NULL AS data_rights_requests`);
    const missing = Object.entries(result.rows[0]).filter(([, ready]) => ready !== true).map(([name]) => name);
    if (missing.length) return res.status(503).json({ status: "not_ready", database: "connected", missingSchema: missing });
    res.json({ status: "ready", database: "connected", schema: "required_tables_present" });
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
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Request failed");
  res.status(500).json({ error: "An unexpected error occurred" });
});

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => console.info(`Return4me API listening on ${port}`));
// Approved policy: settlement eligibility may auto-approve after 48 hours,
// but this worker never creates/submits a payout or contacts IntaSend.
const settlementApprovalTimer = setInterval(() => {
  void autoApproveDueSettlements().catch(() => console.warn("Settlement eligibility sweep failed; no payout was initiated."));
}, 60_000);
settlementApprovalTimer.unref();
void autoApproveDueSettlements().catch(() => console.warn("Initial settlement eligibility sweep failed; no payout was initiated."));
const notificationOutboxTimer = setInterval(() => {
  void processNotificationOutboxBatch().catch(() => console.warn("Notification outbox worker failed; queued entries remain available for retry."));
}, 10_000);
notificationOutboxTimer.unref();
void processNotificationOutboxBatch().catch(() => console.warn("Initial notification outbox drain failed; queued entries remain available for retry."));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(settlementApprovalTimer);
  clearInterval(notificationOutboxTimer);
  try {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
    process.exitCode = 0;
  } catch {
    console.warn("Graceful shutdown encountered an error");
    process.exitCode = 1;
  }
}
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
