-- Stage 12 finance lifecycle evidence. Prepared only; never applied automatically.
-- No provider call, payout, refund, ledger posting or period close is performed by this migration.

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS allocation_policy_version varchar(48) NOT NULL DEFAULT 'legacy_snapshot_unversioned',
  ADD COLUMN IF NOT EXISTS allocation_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS allocation_snapshot_source varchar(32) NOT NULL DEFAULT 'legacy_existing';

CREATE TABLE IF NOT EXISTS third_party_payer_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL UNIQUE REFERENCES payment_transactions(id),
  claim_id uuid NOT NULL REFERENCES claims(id),
  claimant_user_id uuid NOT NULL REFERENCES users(id),
  payer_relationship varchar(24) NOT NULL CHECK (payer_relationship IN ('self','family','friend','employer','organisation','other')),
  payer_fingerprint varchar(64) NOT NULL,
  consent_confirmed boolean NOT NULL DEFAULT false,
  consent_policy_version varchar(48) NOT NULL,
  consent_text_hash varchar(64) NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((payer_relationship='self' AND consent_confirmed=true) OR (payer_relationship<>'self' AND consent_confirmed=true))
);
CREATE INDEX IF NOT EXISTS third_party_payer_claim_idx ON third_party_payer_authorizations(claim_id, created_at);
CREATE INDEX IF NOT EXISTS third_party_payer_claimant_idx ON third_party_payer_authorizations(claimant_user_id, created_at);

CREATE TABLE IF NOT EXISTS settlement_allocation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES settlements(id),
  reviewed_policy_version varchar(48) NOT NULL,
  snapshot_finder_percent integer NOT NULL,
  snapshot_agent_percent integer NOT NULL,
  snapshot_platform_percent integer NOT NULL,
  snapshot_finder_kes numeric(14,2) NOT NULL,
  snapshot_agent_kes numeric(14,2) NOT NULL,
  snapshot_platform_kes numeric(14,2) NOT NULL,
  variance_detected boolean NOT NULL,
  review_status varchar(24) NOT NULL DEFAULT 'recorded' CHECK (review_status IN ('recorded','needs_accounting_review','accepted_for_historical_record')),
  reviewed_by uuid NOT NULL REFERENCES users(id),
  review_note varchar(1500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlement_allocation_review_idx ON settlement_allocation_reviews(settlement_id, created_at);

CREATE TABLE IF NOT EXISTS payout_destination_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_destination_id uuid NOT NULL REFERENCES payout_destinations(id),
  beneficiary_user_id uuid NOT NULL REFERENCES users(id),
  verifier_user_id uuid NOT NULL REFERENCES users(id),
  outcome varchar(24) NOT NULL CHECK (outcome IN ('verified','rejected','reverification_required')),
  evidence_reference_hash varchar(64) NOT NULL,
  note varchar(1000) NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  CHECK (beneficiary_user_id <> verifier_user_id)
);
CREATE INDEX IF NOT EXISTS payout_destination_verification_history_idx ON payout_destination_verification_events(payout_destination_id, verified_at);

CREATE TABLE IF NOT EXISTS finance_period_close_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  snapshot_hash varchar(64) NOT NULL,
  snapshot_payload jsonb NOT NULL,
  evidence_reference varchar(500) NOT NULL,
  submitted_by uuid NOT NULL REFERENCES users(id),
  status varchar(32) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved_for_external_accounting_review','returned','rejected')),
  reviewed_by uuid REFERENCES users(id),
  review_note varchar(1500),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (period_end >= period_start),
  CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by)
);
CREATE INDEX IF NOT EXISTS finance_period_close_status_idx ON finance_period_close_requests(status, period_end DESC);

CREATE TABLE IF NOT EXISTS dormant_liability_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_type varchar(32) NOT NULL CHECK (liability_type IN ('settlement','payout','refund','unclaimed_reward')),
  liability_reference varchar(160) NOT NULL,
  beneficiary_user_id uuid REFERENCES users(id),
  amount_kes numeric(14,2) NOT NULL CHECK (amount_kes >= 0),
  currency varchar(3) NOT NULL DEFAULT 'KES',
  aging_days integer NOT NULL CHECK (aging_days >= 0),
  review_status varchar(24) NOT NULL DEFAULT 'needs_contact' CHECK (review_status IN ('needs_contact','contact_attempted','disputed','legal_hold','resolved')),
  last_contact_at timestamptz,
  evidence_reference varchar(500),
  reviewed_by uuid REFERENCES users(id),
  review_note varchar(1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(liability_type, liability_reference)
);
CREATE INDEX IF NOT EXISTS dormant_liability_aging_idx ON dormant_liability_reviews(review_status, aging_days DESC);

-- Immutable historical finance evidence; updates/deletes require a correcting record rather than rewrite.
CREATE OR REPLACE FUNCTION prevent_finance_evidence_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION 'Finance evidence cannot be truncated' USING ERRCODE='55000';
  END IF;
  RAISE EXCEPTION 'Finance evidence is append-only; record a superseding review instead' USING ERRCODE='55000';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS settlement_allocation_reviews_no_update ON settlement_allocation_reviews;
CREATE TRIGGER settlement_allocation_reviews_no_update BEFORE UPDATE OR DELETE ON settlement_allocation_reviews FOR EACH ROW EXECUTE FUNCTION prevent_finance_evidence_mutation();
DROP TRIGGER IF EXISTS payout_destination_verification_events_no_update ON payout_destination_verification_events;
CREATE TRIGGER payout_destination_verification_events_no_update BEFORE UPDATE OR DELETE ON payout_destination_verification_events FOR EACH ROW EXECUTE FUNCTION prevent_finance_evidence_mutation();

CREATE TABLE IF NOT EXISTS provider_reversal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id),
  reversal_type varchar(24) NOT NULL CHECK (reversal_type IN ('chargeback','provider_return','refund_reversal','other')),
  amount_kes numeric(14,2) NOT NULL CHECK (amount_kes > 0),
  provider_reference varchar(180) NOT NULL UNIQUE,
  evidence_reference varchar(500) NOT NULL,
  evidence_hash varchar(64) NOT NULL,
  reported_by uuid NOT NULL REFERENCES users(id),
  status varchar(24) NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','confirmed','disputed','not_a_reversal')),
  reviewed_by uuid REFERENCES users(id),
  review_note varchar(1500),
  reported_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (reviewed_by IS NULL OR reviewed_by <> reported_by)
);
CREATE INDEX IF NOT EXISTS provider_reversal_status_idx ON provider_reversal_cases(status, reported_at);

CREATE TABLE IF NOT EXISTS provider_statement_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(32) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  evidence_reference varchar(500) NOT NULL,
  content_sha256 varchar(64) NOT NULL,
  declared_row_count integer NOT NULL CHECK (declared_row_count >= 0),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  status varchar(24) NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','verified','rejected')),
  reviewed_by uuid REFERENCES users(id),
  review_note varchar(1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (period_end >= period_start),
  CHECK (reviewed_by IS NULL OR reviewed_by <> uploaded_by)
);
CREATE INDEX IF NOT EXISTS provider_statement_evidence_period_idx ON provider_statement_evidence(provider, period_start, period_end, status);
CREATE UNIQUE INDEX IF NOT EXISTS provider_statement_content_hash_unique ON provider_statement_evidence(provider, content_sha256);

-- Period-close snapshot contents and provenance cannot be rewritten after submission.
CREATE OR REPLACE FUNCTION protect_finance_period_snapshot() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Period-close evidence cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end OR
     NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash OR NEW.snapshot_payload IS DISTINCT FROM OLD.snapshot_payload OR
     NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR
     NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'Period-close snapshot provenance is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS finance_period_snapshot_immutable ON finance_period_close_requests;
CREATE TRIGGER finance_period_snapshot_immutable BEFORE UPDATE OR DELETE ON finance_period_close_requests FOR EACH ROW EXECUTE FUNCTION protect_finance_period_snapshot();
DROP TRIGGER IF EXISTS finance_period_snapshot_no_truncate ON finance_period_close_requests;
CREATE TRIGGER finance_period_snapshot_no_truncate BEFORE TRUNCATE ON finance_period_close_requests FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_evidence_mutation();

DROP TRIGGER IF EXISTS settlement_allocation_reviews_no_truncate ON settlement_allocation_reviews;
CREATE TRIGGER settlement_allocation_reviews_no_truncate BEFORE TRUNCATE ON settlement_allocation_reviews FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_evidence_mutation();
DROP TRIGGER IF EXISTS payout_destination_verification_events_no_truncate ON payout_destination_verification_events;
CREATE TRIGGER payout_destination_verification_events_no_truncate BEFORE TRUNCATE ON payout_destination_verification_events FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_evidence_mutation();
DROP TRIGGER IF EXISTS third_party_payer_authorizations_no_update ON third_party_payer_authorizations;
CREATE TRIGGER third_party_payer_authorizations_no_update BEFORE UPDATE OR DELETE ON third_party_payer_authorizations FOR EACH ROW EXECUTE FUNCTION prevent_finance_evidence_mutation();
DROP TRIGGER IF EXISTS third_party_payer_authorizations_no_truncate ON third_party_payer_authorizations;
CREATE TRIGGER third_party_payer_authorizations_no_truncate BEFORE TRUNCATE ON third_party_payer_authorizations FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_evidence_mutation();

CREATE OR REPLACE FUNCTION protect_provider_statement_provenance() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Provider statement evidence cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.period_start IS DISTINCT FROM OLD.period_start OR
     NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference OR
     NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR NEW.declared_row_count IS DISTINCT FROM OLD.declared_row_count OR
     NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Provider statement evidence provenance is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS provider_statement_provenance_immutable ON provider_statement_evidence;
CREATE TRIGGER provider_statement_provenance_immutable BEFORE UPDATE OR DELETE ON provider_statement_evidence FOR EACH ROW EXECUTE FUNCTION protect_provider_statement_provenance();
DROP TRIGGER IF EXISTS provider_statement_provenance_no_truncate ON provider_statement_evidence;
CREATE TRIGGER provider_statement_provenance_no_truncate BEFORE TRUNCATE ON provider_statement_evidence FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_evidence_mutation();

CREATE OR REPLACE FUNCTION protect_provider_reversal_provenance() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Provider reversal evidence cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.payment_transaction_id IS DISTINCT FROM OLD.payment_transaction_id OR NEW.reversal_type IS DISTINCT FROM OLD.reversal_type OR
     NEW.amount_kes IS DISTINCT FROM OLD.amount_kes OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference OR
     NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference OR NEW.evidence_hash IS DISTINCT FROM OLD.evidence_hash OR
     NEW.reported_by IS DISTINCT FROM OLD.reported_by OR NEW.reported_at IS DISTINCT FROM OLD.reported_at THEN
    RAISE EXCEPTION 'Provider reversal provenance is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS provider_reversal_provenance_immutable ON provider_reversal_cases;
CREATE TRIGGER provider_reversal_provenance_immutable BEFORE UPDATE OR DELETE ON provider_reversal_cases FOR EACH ROW EXECUTE FUNCTION protect_provider_reversal_provenance();
DROP TRIGGER IF EXISTS provider_reversal_provenance_no_truncate ON provider_reversal_cases;
CREATE TRIGGER provider_reversal_provenance_no_truncate BEFORE TRUNCATE ON provider_reversal_cases FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_evidence_mutation();
