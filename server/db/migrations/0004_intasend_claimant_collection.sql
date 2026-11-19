-- Batch 7: claimant recovery-service collection sessions and durable webhook receipts.
-- No provider call is made by applying this migration; collection remains disabled by default.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS assessment_id uuid,
  ADD COLUMN IF NOT EXISTS provider_invoice_id varchar(180),
  ADD COLUMN IF NOT EXISTS payer_phone_masked varchar(24),
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_state varchar(32),
  ADD COLUMN IF NOT EXISTS provider_receipt varchar(80),
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE payment_assessments
  ADD COLUMN IF NOT EXISTS payment_window_expires_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_transactions_assessment_fk') THEN
    ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_assessment_fk
      FOREIGN KEY (assessment_id) REFERENCES payment_assessments(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_invoice_unique
  ON payment_transactions(provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_assessment_idx ON payment_transactions(assessment_id);

CREATE TABLE IF NOT EXISTS payment_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL DEFAULT 'intasend',
  provider_event_key varchar(220) NOT NULL,
  provider_invoice_id varchar(180),
  api_reference varchar(120),
  topic varchar(60),
  state varchar(32),
  authenticated boolean NOT NULL DEFAULT false,
  outcome varchar(40) NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_key)
);
CREATE INDEX IF NOT EXISTS payment_webhook_invoice_idx ON payment_webhook_deliveries(provider_invoice_id, received_at DESC);
