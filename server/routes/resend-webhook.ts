import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { communicationsDeliveryEvents } from "../db/schema.js";

export const resendWebhookRouter = Router();

type RequestWithRawBody = Request & { rawBody?: Buffer };

function validSvixSignature(req: RequestWithRawBody, secret: string) {
  const id = req.header("svix-id");
  const timestamp = req.header("svix-timestamp");
  const signatureHeader = req.header("svix-signature");
  const rawBody = req.rawBody;
  if (!id || id.length > 180 || !timestamp || !signatureHeader || signatureHeader.length > 1024 || !rawBody || !/^\d+$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
  const encodedSecret = secret.replace(/^whsec_/, "");
  const key = Buffer.from(encodedSecret, "base64");
  if (key.length < 16) return false;
  const signedContent = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");
  return signatureHeader.split(" ").some(part => {
    const [version, supplied] = part.split(",", 2);
    if (version !== "v1" || !supplied) return false;
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

resendWebhookRouter.post("/resend", async (req, res, next) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "Resend delivery-event ingestion is not configured" });
  const rawRequest = req as RequestWithRawBody;
  if (!validSvixSignature(rawRequest, secret)) return res.status(401).json({ error: "Webhook signature is invalid or expired" });
  const parsed = z.object({
    type: z.enum(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.opened", "email.clicked", "email.failed"]),
    created_at: z.string().optional(),
    data: z.object({ email_id: z.string().min(1).max(180), to: z.union([z.string(), z.array(z.string())]).optional() }).passthrough()
  }).passthrough().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Unsupported delivery-event payload" });
  const eventId = req.header("svix-id")!;
  const eventType = ({
    "email.sent": "accepted", "email.delivered": "delivered", "email.delivery_delayed": "delayed",
    "email.bounced": "bounced", "email.complained": "complained", "email.opened": "opened",
    "email.clicked": "clicked", "email.failed": "failed"
  } as const)[parsed.data.type];
  const recipients = Array.isArray(parsed.data.data.to) ? parsed.data.data.to : parsed.data.data.to ? [parsed.data.data.to] : [];
  const configuredHashSecret = process.env.CASE_TOKEN_HASH_SECRET || process.env.SESSION_HASH_SECRET;
  if (!configuredHashSecret && process.env.NODE_ENV === "production") return res.status(503).json({ error: "Recipient hashing is not configured" });
  const hashSecret = configuredHashSecret || "development-resend-event-hash";
  const recipientHash = recipients.length ? createHash("sha256").update(`${hashSecret}:${recipients.map(x => x.trim().toLowerCase()).sort().join(",")}`).digest("hex") : null;
  const messageReferenceHash = createHash("sha256").update(parsed.data.data.email_id).digest("hex");
  const occurredAt = parsed.data.created_at && !Number.isNaN(Date.parse(parsed.data.created_at)) ? new Date(parsed.data.created_at) : new Date();
  try {
    const [inserted] = await db.insert(communicationsDeliveryEvents).values({ channel: "email", provider: "resend", providerEventId: eventId,
      eventType, recipientHash, messageReferenceHash, occurredAt, metadata: { eventType: parsed.data.type } })
      .onConflictDoNothing().returning({ id: communicationsDeliveryEvents.id });
    return res.status(200).json({ status: "ok", outcome: inserted ? "recorded" : "duplicate" });
  } catch (error) { return next(error); }
});
