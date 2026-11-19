-- Batch 11: externally funded reward authorization, beneficiary destinations,
-- 48-hour settlement approval and manually controlled payout legs.
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS approval_mode varchar(24);

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS destination_ciphertext text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(120) DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS provider_batch_id varchar(180),
  ADD COLUMN IF NOT EXISTS provider_transaction_id varchar(180),
  ADD COLUMN IF NOT EXISTS provider_outcome varchar(24),
  ADD COLUMN IF NOT EXISTS provider_fee_kes numeric(14,2),
  ADD COLUMN IF NOT EXISTS provider_fee_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payout_requests ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE payout_requests ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payout_request_settlement_beneficiary_unique ON payout_requests(settlement_id,beneficiary_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS payout_request_idempotency_unique ON payout_requests(idempotency_key);

CREATE TABLE IF NOT EXISTS payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  method varchar(24) NOT NULL DEFAULT 'mpesa_b2c',
  phone_masked varchar(24) NOT NULL,
  phone_ciphertext text NOT NULL,
  fingerprint varchar(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_destination_user_status_idx ON payout_destinations(user_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payout_destination_active_user_unique ON payout_destinations(user_id) WHERE status IN ('pending','verified');

CREATE TABLE IF NOT EXISTS reward_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES claims(id),
  gross_kes numeric(14,2) NOT NULL CHECK (gross_kes > 0),
  funding_source varchar(80) NOT NULL,
  source_reference varchar(180) NOT NULL,
  evidence_ref text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending_verification',
  created_by uuid NOT NULL REFERENCES users(id),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_authorization_status_idx ON reward_authorizations(status,created_at DESC);
