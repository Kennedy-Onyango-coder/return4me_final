import { pool } from "../db/index.js";
import { activePaymentPiiVersion, decryptPaymentPhone, encryptPaymentPhone } from "./payment-pii.js";

export async function rotatePaymentPiiBatch(limit = 100): Promise<{ paymentTransactions: number; payoutDestinations: number; payoutRequests: number; activeVersion: string }> {
  const activeVersion = activePaymentPiiVersion();
  if (activeVersion === "v1") throw new Error("Set PAYMENT_PII_ACTIVE_KEY_VERSION to a configured newer key before rotation");
  const batchSize = Math.max(1, Math.min(500, Math.floor(limit)));
  const client = await pool.connect();
  const counts = { paymentTransactions: 0, payoutDestinations: 0, payoutRequests: 0, activeVersion };
  try {
    await client.query("BEGIN");
    const paymentRows = await client.query(`SELECT id,payer_phone_ciphertext FROM payment_transactions
      WHERE payer_phone_ciphertext IS NOT NULL AND payer_phone_ciphertext NOT LIKE $1 ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [`${activeVersion}:%`, batchSize]);
    for (const row of paymentRows.rows) {
      const ciphertext = encryptPaymentPhone(decryptPaymentPhone(row.payer_phone_ciphertext));
      await client.query("UPDATE payment_transactions SET payer_phone_ciphertext=$1 WHERE id=$2", [ciphertext,row.id]);
      counts.paymentTransactions++;
    }
    const destinationRows = await client.query(`SELECT id,phone_ciphertext FROM payout_destinations
      WHERE phone_ciphertext NOT LIKE $1 ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [`${activeVersion}:%`, batchSize]);
    for (const row of destinationRows.rows) {
      const ciphertext = encryptPaymentPhone(decryptPaymentPhone(row.phone_ciphertext));
      await client.query("UPDATE payout_destinations SET phone_ciphertext=$1,updated_at=now() WHERE id=$2", [ciphertext,row.id]);
      counts.payoutDestinations++;
    }
    const payoutRows = await client.query(`SELECT id,destination_ciphertext FROM payout_requests
      WHERE destination_ciphertext IS NOT NULL AND destination_ciphertext NOT LIKE $1 ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [`${activeVersion}:%`, batchSize]);
    for (const row of payoutRows.rows) {
      const ciphertext = encryptPaymentPhone(decryptPaymentPhone(row.destination_ciphertext));
      await client.query("UPDATE payout_requests SET destination_ciphertext=$1,updated_at=now() WHERE id=$2", [ciphertext,row.id]);
      counts.payoutRequests++;
    }
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
