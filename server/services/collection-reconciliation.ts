import { pool } from "../db/index.js";
import { fetchCollectionStatus } from "./intasend-collections.js";
import { decideProviderCollection } from "../../shared/payment-collection-policy.js";
import { claimantCollectionJournalLines, centsToKes } from "../../shared/ledger-policy.js";
import { notifySafely } from "./notifications.js";

export type ReconcileResult = { outcome: "confirmed" | "already_confirmed" | "pending" | "failed" | "unknown" | "refused"; reason?: string };

/** One canonical provider-status verification and atomic local confirmation path. */
export async function reconcileIntaSendCollection(args: { invoiceId: string; apiReference?: string | null }): Promise<ReconcileResult> {
  const lookup = await pool.query(`SELECT p.id,p.claim_id,p.assessment_id,p.amount_kes,p.status,p.idempotency_key,p.provider_invoice_id,p.created_at,
      a.status assessment_status,a.payment_window_expires_at,c.claimant_id
    FROM payment_transactions p JOIN payment_assessments a ON a.id=p.assessment_id JOIN claims c ON c.id=p.claim_id
    WHERE p.provider='intasend' AND (p.provider_invoice_id=$1 OR ($2::text IS NOT NULL AND p.idempotency_key=$2))
    ORDER BY p.created_at DESC LIMIT 1`, [args.invoiceId, args.apiReference ?? null]);
  if (!lookup.rowCount) return { outcome: "refused", reason: "transaction_not_found" };
  const local = lookup.rows[0];
  if (local.provider_invoice_id && local.provider_invoice_id !== args.invoiceId) {
    await recordCollectionException({ invoiceId: args.invoiceId, transactionId: local.id, expectedAmount: local.amount_kes, reason: "invoice_binding_mismatch" });
    return { outcome: "refused", reason: "invoice_binding_mismatch" };
  }
  if (local.payment_window_expires_at && new Date(local.created_at).getTime() > new Date(local.payment_window_expires_at).getTime()) return { outcome: "refused", reason: "payment_attempt_started_after_window" };
  if (args.apiReference && local.idempotency_key !== args.apiReference) {
    await recordCollectionException({ invoiceId: args.invoiceId, transactionId: local.id, expectedAmount: local.amount_kes, reason: "api_reference_mismatch" });
    return { outcome: "refused", reason: "api_reference_mismatch" };
  }
  if (local.status === "confirmed") return { outcome: "already_confirmed" };
  if (!["claimant_confirmed", "collection_pending"].includes(local.assessment_status)) {
    await recordCollectionException({ invoiceId: args.invoiceId, transactionId: local.id, expectedAmount: local.amount_kes, reason: "assessment_not_payable" });
    return { outcome: "refused", reason: "assessment_not_payable" };
  }

  // Persist the lookup attempt even when the provider is unavailable, so a claimant
  // polling every few seconds cannot turn an outage into an API hammer.
  await pool.query("UPDATE payment_transactions SET last_verified_at=now(),updated_at=now() WHERE id=$1 AND status<>'confirmed'", [local.id]);
  const verified = await fetchCollectionStatus(args.invoiceId);
  const invoice = verified.invoice;
  if (!verified.ok || !invoice) return { outcome: "unknown", reason: verified.errorCode ?? "provider_status_unavailable" };
  if (String(invoice.invoice_id ?? "") !== args.invoiceId) {
    await recordCollectionException({ invoiceId: args.invoiceId, transactionId: local.id, expectedAmount: local.amount_kes, providerAmount: invoice.value, currency: invoice.currency, reason: "provider_invoice_mismatch" });
    return { outcome: "refused", reason: "provider_invoice_mismatch" };
  }
  if (String(invoice.api_ref ?? "") !== local.idempotency_key) {
    await recordCollectionException({ invoiceId: args.invoiceId, transactionId: local.id, expectedAmount: local.amount_kes, providerAmount: invoice.value, currency: invoice.currency, reason: "provider_api_reference_mismatch" });
    return { outcome: "refused", reason: "provider_api_reference_mismatch" };
  }
  const state = String(invoice.state ?? "UNKNOWN").toUpperCase() as any;
  const decision = decideProviderCollection({
    state,
    currency: invoice.currency,
    providerAmount: invoice.value,
    expectedAmount: local.amount_kes,
    invoiceMatches: String(invoice.invoice_id ?? "") === args.invoiceId,
    transactionBelongsToClaim: String(invoice.api_ref ?? "") === local.idempotency_key
  });
  if (decision === "refuse") {
    await recordCollectionException({ invoiceId: args.invoiceId, transactionId: local.id, expectedAmount: local.amount_kes, providerAmount: invoice.value, currency: invoice.currency, reason: "provider_facts_mismatch" });
    return { outcome: "refused", reason: "provider_facts_mismatch" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(`SELECT p.id,p.claim_id,p.assessment_id,p.amount_kes,p.status,p.idempotency_key,p.provider_invoice_id,a.status assessment_status
      FROM payment_transactions p JOIN payment_assessments a ON a.id=p.assessment_id WHERE p.id=$1 FOR UPDATE OF p,a`, [local.id]);
    if (!locked.rowCount) { await client.query("ROLLBACK"); return { outcome: "refused", reason: "transaction_disappeared" }; }
    const current = locked.rows[0];
    if (current.provider_invoice_id && current.provider_invoice_id !== args.invoiceId) { await client.query("ROLLBACK"); return { outcome: "refused", reason: "invoice_binding_mismatch" }; }
    if (current.status === "confirmed") { await client.query("COMMIT"); return { outcome: "already_confirmed" }; }
    if (!["claimant_confirmed", "collection_pending"].includes(current.assessment_status)) { await client.query("ROLLBACK"); return { outcome: "refused", reason: "assessment_not_payable" }; }
    if (decision === "confirm") {
      const providerReceipt = typeof invoice.mpesa_reference === "string" ? invoice.mpesa_reference : typeof invoice.provider_ref === "string" ? invoice.provider_ref : null;
      const providerFee = typeof invoice.charges === "number" && Number.isFinite(invoice.charges) && invoice.charges >= 0 ? invoice.charges.toFixed(2)
        : typeof invoice.charges === "string" && Number.isFinite(Number(invoice.charges)) && Number(invoice.charges) >= 0 ? Number(invoice.charges).toFixed(2) : null;
      await client.query(`UPDATE payment_transactions SET status='confirmed',provider_invoice_id=$2,provider_reference=$2,provider_state=$3,
        provider_receipt=$4,provider_fee_kes=$5,provider_fee_verified_at=CASE WHEN $5::numeric IS NULL THEN NULL ELSE now() END,
        last_verified_at=now(),confirmed_at=now(),updated_at=now() WHERE id=$1 AND status<>'confirmed'`,
        [current.id, args.invoiceId, state, providerReceipt, providerFee]);
      await client.query(`UPDATE payment_assessments SET status='paid' WHERE id=$1 AND status IN ('claimant_confirmed','collection_pending')`, [current.assessment_id]);

      // Conservative accounting: a claimant recovery-service collection is held
      // as an unclassified liability, not automatically recognised as revenue.
      // Provider fees are stored as evidence only; fee treatment awaits policy review.
      const collectionJournal = claimantCollectionJournalLines(String(current.amount_kes));
      const journal = await client.query(`INSERT INTO financial_journals(source_type,source_id,idempotency_key,currency,memo)
        VALUES('collection',$1,$2,'KES','Provider-confirmed claimant recovery-service collection; liability pending accounting classification')
        ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`, [current.id, `collection:${current.id}`]);
      if (journal.rowCount) {
        for (const line of collectionJournal.lines) {
          await client.query(`INSERT INTO financial_postings(journal_id,account_code,debit_kes,credit_kes,memo) VALUES($1,$2,$3,$4,$5)`,
            [journal.rows[0].id, line.accountCode, centsToKes(line.debitCents), centsToKes(line.creditCents), line.memo]);
        }
      }
      const receiptNumber = `R4M-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(current.id).slice(0,12).toUpperCase()}`;
      await client.query(`INSERT INTO payment_receipts(receipt_number,payment_transaction_id,claimant_id,amount_kes,currency,receipt_kind,disclaimer)
        VALUES($1,$2,$3,$4,'KES','payment_confirmation','Payment confirmation only; not a tax invoice.') ON CONFLICT(payment_transaction_id) DO NOTHING`,
        [receiptNumber, current.id, local.claimant_id, String(current.amount_kes)]);
      await client.query(`INSERT INTO audit_events(actor_id,action,resource_type,resource_id,outcome,metadata)
        VALUES(NULL,'finance.collection_provider_confirmed','payment_transaction',$1,'success',jsonb_build_object('provider','intasend','invoiceBound',true,'currency','KES','journalPosted',true,'receiptIssued',true))`, [current.id]);
      await client.query("COMMIT");
      notifySafely({ userId: local.claimant_id, type: "payment_confirmed", category: "financial", priority: "critical", title: "Your payment was confirmed", body: "Your recovery-service payment is confirmed. A payment receipt is available in your workspace; item release still requires the separate handover steps.", link: "/workspace", dedupeKey: `payment_confirmed:${current.id}` });
      return { outcome: "confirmed" };
    }
    const nextStatus = decision === "record_failure" ? "failed" : decision === "remain_pending" ? "pending" : "unknown";
    await client.query(`UPDATE payment_transactions SET status=$2,provider_invoice_id=COALESCE(provider_invoice_id,$3),provider_reference=COALESCE(provider_reference,$3),
      provider_state=$4,last_verified_at=now(),updated_at=now() WHERE id=$1 AND status<>'confirmed'`, [current.id, nextStatus, args.invoiceId, state]);
    await client.query("COMMIT");
    return { outcome: decision === "record_failure" ? "failed" : decision === "remain_pending" ? "pending" : "unknown" };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}


async function recordCollectionException(args: { invoiceId: string; transactionId: string; expectedAmount: string | number; providerAmount?: unknown; currency?: unknown; reason: string }) {
  const expected = Number(args.expectedAmount);
  const rawProvider = typeof args.providerAmount === "number" ? args.providerAmount : typeof args.providerAmount === "string" ? Number(args.providerAmount) : NaN;
  const provider = Number.isFinite(rawProvider) && rawProvider >= 0 ? rawProvider : null;
  const currency = typeof args.currency === "string" && /^[A-Z]{3}$/.test(args.currency.toUpperCase()) ? args.currency.toUpperCase() : "UNK";
  await pool.query(`INSERT INTO reconciliation_items(source,external_reference,internal_reference,amount_kes,variance_kes,expected_amount_kes,provider_amount_kes,currency,reason_code,status)
    VALUES('intasend_collection',$1,$2,$3,$4,$3,$5,$6,$7,'unmatched') ON CONFLICT DO NOTHING`,
    [args.invoiceId, args.transactionId, String(expected), provider === null ? "0.00" : (provider - expected).toFixed(2), provider === null ? null : provider.toFixed(2), currency, args.reason]);
}
