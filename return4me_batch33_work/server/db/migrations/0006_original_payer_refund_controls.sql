-- Batch 10: original-payer refund controls and encrypted M-Pesa destination evidence.
-- No refund request is submitted to IntaSend by applying this migration.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS payer_phone_ciphertext text,
  ADD COLUMN IF NOT EXISTS payer_phone_fingerprint varchar(64);

ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS destination_type varchar(24) NOT NULL DEFAULT 'original_payer',
  ADD COLUMN IF NOT EXISTS original_payer_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(120) NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS provider_batch_id varchar(180),
  ADD COLUMN IF NOT EXISTS provider_transaction_id varchar(180),
  ADD COLUMN IF NOT EXISTS provider_outcome varchar(24),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_evidence_ref text,
  ADD COLUMN IF NOT EXISTS reconciliation_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS refund_request_idempotency_unique ON refund_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS payment_phone_fingerprint_idx ON payment_transactions(payer_phone_fingerprint);
