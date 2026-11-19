import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/index.js";
import { verifyIntaSendChallenge } from "../services/intasend-collections.js";
import { reconcileIntaSendCollection } from "../services/collection-reconciliation.js";

export const intasendWebhookRouter = Router();

intasendWebhookRouter.post("/intasend", async (req, res, next) => {
  const parsed = z.object({
    challenge: z.string().optional(), topic: z.string().optional(), invoice_id: z.string().optional(),
    api_ref: z.string().optional(), state: z.string().optional(), provider_ref: z.string().optional()
  }).passthrough().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid webhook payload" });
  if (!verifyIntaSendChallenge(parsed.data.challenge)) return res.status(401).json({ error: "Webhook authentication failed" });
  const event = parsed.data;
  if (event.topic && event.topic !== "collection_event") return res.json({ status: "ignored" });
  if (!event.invoice_id || !event.api_ref) return res.status(400).json({ error: "Required provider references are missing" });
  const eventKey = createHash("sha256").update([event.invoice_id, event.api_ref, event.state ?? "", event.provider_ref ?? ""].join("|")).digest("hex");
  try {
    const inserted = await pool.query(`INSERT INTO payment_webhook_deliveries(provider,provider_event_key,provider_invoice_id,api_reference,topic,state,authenticated,outcome)
      VALUES('intasend',$1,$2,$3,$4,$5,true,'received') ON CONFLICT(provider,provider_event_key) DO NOTHING RETURNING id`,
      [eventKey, event.invoice_id, event.api_ref, event.topic ?? "collection_event", event.state ?? null]);
    if (!inserted.rowCount) return res.status(200).json({ status: "ok", outcome: "duplicate_delivery" });
    const result = await reconcileIntaSendCollection({ invoiceId: event.invoice_id, apiReference: event.api_ref });
    const status = result.outcome === "confirmed" || result.outcome === "already_confirmed" ? 200
      : result.outcome === "pending" || result.outcome === "unknown" ? 202
      : result.outcome === "failed" ? 200 : 409;
    await pool.query("UPDATE payment_webhook_deliveries SET outcome=$2,processed_at=now() WHERE id=$1", [inserted.rows[0].id, result.outcome]);
    return res.status(status).json({ status: status < 300 ? "ok" : "refused", outcome: result.outcome });
  } catch (error) {
    await pool.query("UPDATE payment_webhook_deliveries SET outcome='processing_error' WHERE provider_event_key=$1", [eventKey]).catch(() => undefined);
    return next(error);
  }
});
