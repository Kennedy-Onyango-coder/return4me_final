-- Batch 9: claimant collection accounting, receipt evidence and reconciliation exceptions.
-- This records a confirmed collection as a liability pending professional classification;
-- it does not recognise platform revenue or allocate Finder/Agent rewards.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS provider_fee_kes numeric(14,2),
  ADD COLUMN IF NOT EXISTS provider_fee_verified_at timestamptz;

ALTER TABLE reconciliation_items
  ADD COLUMN IF NOT EXISTS expected_amount_kes numeric(14,2),
  ADD COLUMN IF NOT EXISTS provider_amount_kes numeric(14,2),
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS reason_code varchar(64),
  ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number varchar(48) NOT NULL UNIQUE,
  payment_transaction_id uuid NOT NULL UNIQUE REFERENCES payment_transactions(id),
  claimant_id uuid NOT NULL REFERENCES users(id),
  amount_kes numeric(14,2) NOT NULL CHECK (amount_kes > 0),
  currency varchar(3) NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  receipt_kind varchar(32) NOT NULL DEFAULT 'payment_confirmation',
  disclaimer text NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_receipts_claimant_idx ON payment_receipts(claimant_id,issued_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_collection_exception_unique
  ON reconciliation_items(source,external_reference,internal_reference,reason_code)
  WHERE source='intasend_collection' AND reason_code IS NOT NULL;
