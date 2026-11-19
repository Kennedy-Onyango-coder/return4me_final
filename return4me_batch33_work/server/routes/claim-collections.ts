import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/index.js";
import { authenticate, requireRole } from "../security.js";
import { intasendCollectionEnabled, initiateMpesaStk } from "../services/intasend-collections.js";
import { normalizeKenyanMpesaPhone, paymentSessionCanBeReused, mayOpenNewPaymentSession, PAYMENT_SESSION_WINDOW_MS } from "../../shared/payment-collection-policy.js";
import { reconcileIntaSendCollection } from "../services/collection-reconciliation.js";
import { encryptPaymentPhone, fingerprintPaymentPhone } from "../services/payment-pii.js";

export const claimCollectionsRouter = Router();
claimCollectionsRouter.use(authenticate, requireRole("claimant"));

claimCollectionsRouter.post("/assessments/:assessmentId/payment-sessions", async (req, res, next) => {
  const parsed = z.object({ payerPhone: z.string().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payment details" });
  const phone = normalizeKenyanMpesaPhone(parsed.data.payerPhone ?? "");
  if (!phone) return res.status(400).json({ error: "Enter a valid Kenyan M-Pesa phone number" });
  if (!intasendCollectionEnabled()) return res.status(423).json({ error: "IntaSend collection is disabled. No payment request has been sent." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT a.id assessment_id,a.claim_id,a.amount_kes,a.status assessment_status,a.payment_window_expires_at,
        c.claimant_id,c.status claim_status
      FROM payment_assessments a JOIN claims c ON c.id=a.claim_id WHERE a.id=$1
        AND EXISTS(SELECT 1 FROM assignments x JOIN agents ag ON ag.id=x.agent_id AND ag.status='active' AND ag.verified_at IS NOT NULL
          JOIN custody_events ce ON ce.report_id=c.report_id AND ce.agent_id=x.agent_id AND ce.event_type='inspection_completed'
          WHERE x.report_id=c.report_id AND x.status='assigned') FOR UPDATE OF a,c`, [req.params.assessmentId]);
    if (!found.rowCount || found.rows[0].claimant_id !== req.auth!.id) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Assessment not found" }); }
    const a = found.rows[0];
    if (a.claim_status !== "approved" || !mayOpenNewPaymentSession({ assessmentStatus: a.assessment_status, paymentWindowExpiresAt: a.payment_window_expires_at })) {
      await client.query("ROLLBACK"); return res.status(409).json({ error: "The approved assessment is not within its active payment window" });
    }
    const existing = await client.query(`SELECT id,status,provider_invoice_id,session_expires_at,amount_kes,payer_phone_masked
      FROM payment_transactions WHERE assessment_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [a.assessment_id]);
    if (existing.rowCount && existing.rows[0].provider_invoice_id && paymentSessionCanBeReused(existing.rows[0].status, existing.rows[0].session_expires_at ?? new Date(0))) {
      const row = existing.rows[0]; await client.query("COMMIT");
      return res.json({ paymentSession: { id: row.id, status: row.status, amountKes: row.amount_kes, providerInvoiceId: row.provider_invoice_id, expiresAt: row.session_expires_at, payerPhone: row.payer_phone_masked }, reused: true });
    }
    if (existing.rowCount && ["initiated", "pending", "unknown"].includes(existing.rows[0].status)) {
      await client.query("UPDATE payment_transactions SET status='unknown',updated_at=now() WHERE id=$1", [existing.rows[0].id]);
      await client.query("COMMIT");
      return res.status(409).json({ error: "A previous payment attempt has an unresolved outcome. It will not be resubmitted; request reconciliation before trying again." });
    }
    const id = randomUUID();
    const idempotencyKey = id;
    const expiresAt = new Date(Date.now() + PAYMENT_SESSION_WINDOW_MS);
    await client.query(`INSERT INTO payment_transactions(id,claim_id,assessment_id,provider,amount_kes,status,idempotency_key,payer_phone_masked,payer_phone_ciphertext,payer_phone_fingerprint,session_expires_at)
      VALUES($1,$2,$3,'intasend',$4,'initiated',$5,$6,$7,$8,$9)`, [id, a.claim_id, a.assessment_id, a.amount_kes, idempotencyKey,
      `${phone.slice(0,4)}******${phone.slice(-3)}`, encryptPaymentPhone(phone), fingerprintPaymentPhone(phone), expiresAt]);
    await client.query("UPDATE payment_assessments SET status='collection_pending' WHERE id=$1 AND status IN ('claimant_confirmed','collection_pending')", [a.assessment_id]);
    await client.query("COMMIT");

    const provider = await initiateMpesaStk({ phone, amountKes: String(a.amount_kes), apiRef: idempotencyKey });
    if (!provider.ok || !provider.invoice?.invoice_id) {
      await pool.query("UPDATE payment_transactions SET status=$2,provider_state=$3,updated_at=now() WHERE id=$1 AND status='initiated'", [id, provider.ambiguous ? "unknown" : "failed", provider.errorCode ?? "INITIATION_RESPONSE_INVALID"]);
      if (provider.ambiguous) return res.status(202).json({ paymentSession: { id, status: "unknown", expiresAt }, notice: "The request outcome is uncertain. Do not pay again; reconciliation is required." });
      return res.status(502).json({ error: "The provider did not accept the payment request. No payment confirmation was recorded." });
    }
    await pool.query(`UPDATE payment_transactions SET status='pending',provider_invoice_id=$2,provider_reference=$2,provider_state=$3,updated_at=now()
      WHERE id=$1 AND status='initiated'`, [id, provider.invoice.invoice_id, String(provider.invoice.state ?? "PENDING")]);
    res.status(201).json({ paymentSession: { id, status: "pending", amountKes: String(a.amount_kes), providerInvoiceId: provider.invoice.invoice_id, expiresAt }, notice: "Approve the M-Pesa prompt. Payment is confirmed only after provider verification." });
  } catch (error) { try { await client.query("ROLLBACK"); } catch {} next(error); }
  finally { client.release(); }
});

claimCollectionsRouter.get("/payment-sessions/:transactionId", async (req, res, next) => {
  try {
    const found = await pool.query(`SELECT p.id,p.claim_id,p.status,p.amount_kes,p.provider_invoice_id,p.provider_state,p.payer_phone_masked,p.session_expires_at,p.last_verified_at,c.claimant_id
      FROM payment_transactions p JOIN claims c ON c.id=p.claim_id WHERE p.id=$1 AND p.provider='intasend'`, [req.params.transactionId]);
    if (!found.rowCount || found.rows[0].claimant_id !== req.auth!.id) return res.status(404).json({ error: "Payment session not found" });
    let row = found.rows[0];
    if (row.status !== "confirmed" && row.provider_invoice_id && (!row.last_verified_at || Date.now() - new Date(row.last_verified_at).getTime() > 15000)) {
      await reconcileIntaSendCollection({ invoiceId: row.provider_invoice_id });
      const refreshed = await pool.query("SELECT status,provider_state,last_verified_at FROM payment_transactions WHERE id=$1", [row.id]);
      if (refreshed.rowCount) row = { ...row, ...refreshed.rows[0] };
    }
    res.json({ paymentSession: { id: row.id, status: row.status, amountKes: row.amount_kes, providerInvoiceId: row.provider_invoice_id, providerState: row.provider_state, payerPhone: row.payer_phone_masked, expiresAt: row.session_expires_at }, notice: "A browser redirect or M-Pesa prompt is not proof of payment; only provider-verified status is authoritative." });
  } catch (error) { next(error); }
});


claimCollectionsRouter.get("/payment-sessions/:transactionId/receipt", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT r.receipt_number,r.amount_kes,r.currency,r.issued_at,r.receipt_kind,r.disclaimer,
        p.provider_invoice_id,p.provider_receipt,c.reference claim_reference
      FROM payment_receipts r JOIN payment_transactions p ON p.id=r.payment_transaction_id
      JOIN claims c ON c.id=p.claim_id WHERE p.id=$1 AND r.claimant_id=$2 AND p.status='confirmed'`, [req.params.transactionId, req.auth!.id]);
    if (!result.rowCount) return res.status(404).json({ error: "A confirmed payment receipt was not found" });
    res.json({ receipt: result.rows[0], notice: "This is a payment confirmation receipt, not a tax invoice." });
  } catch (error) { next(error); }
});

claimCollectionsRouter.get("/assessments/:assessmentId/payment-sessions/latest", async (req, res, next) => {
  try {
    const assessmentResult = await pool.query(`SELECT a.id,c.claimant_id FROM payment_assessments a JOIN claims c ON c.id=a.claim_id WHERE a.id=$1`, [req.params.assessmentId]);
    const assessment = assessmentResult.rows[0];
    if (!assessment || assessment.claimant_id !== req.auth!.id) return res.status(404).json({ error: "Assessment not found" });
    const result = await pool.query(`SELECT id,status,amount_kes,provider_invoice_id,provider_state,payer_phone_masked,session_expires_at
      FROM payment_transactions WHERE assessment_id=$1 AND provider='intasend' ORDER BY created_at DESC LIMIT 1`, [assessment.id]);
    if (!result.rowCount) return res.status(404).json({ error: "No payment session has been created" });
    const row = result.rows[0];
    res.json({ paymentSession: { id: row.id, status: row.status, amountKes: row.amount_kes, providerInvoiceId: row.provider_invoice_id,
      providerState: row.provider_state, payerPhone: row.payer_phone_masked, expiresAt: row.session_expires_at } });
  } catch (error) { next(error); }
});
