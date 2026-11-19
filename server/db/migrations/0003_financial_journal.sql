-- Immutable, double-entry KES journal foundation. No provider integration or
-- payment/payout endpoint is enabled by this migration.
CREATE TABLE IF NOT EXISTS financial_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type varchar(32) NOT NULL CHECK (source_type IN ('collection','provider_fee','refund','reversal','settlement','period_close','correction')),
  source_id varchar(160) NOT NULL,
  idempotency_key varchar(160) NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
  memo text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_txid bigint NOT NULL DEFAULT txid_current(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_journals_source_unique ON financial_journals(source_type,source_id) WHERE source_type <> 'correction';
CREATE INDEX IF NOT EXISTS financial_journals_created_idx ON financial_journals(created_at DESC);

CREATE TABLE IF NOT EXISTS financial_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES financial_journals(id),
  account_code varchar(60) NOT NULL,
  debit_kes numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit_kes >= 0),
  credit_kes numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_kes >= 0),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_kes > 0 AND credit_kes = 0) OR (credit_kes > 0 AND debit_kes = 0))
);
CREATE INDEX IF NOT EXISTS financial_postings_journal_idx ON financial_postings(journal_id);
CREATE INDEX IF NOT EXISTS financial_postings_account_idx ON financial_postings(account_code,created_at DESC);

CREATE OR REPLACE FUNCTION return4me_financial_posting_same_transaction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE journal_txid bigint;
BEGIN
  SELECT created_txid INTO journal_txid FROM financial_journals WHERE id=NEW.journal_id FOR KEY SHARE;
  IF journal_txid IS NULL OR journal_txid <> txid_current() THEN
    RAISE EXCEPTION 'Postings must be inserted in the same transaction that creates the journal';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS financial_postings_same_transaction ON financial_postings;
CREATE TRIGGER financial_postings_same_transaction BEFORE INSERT ON financial_postings
FOR EACH ROW EXECUTE FUNCTION return4me_financial_posting_same_transaction();

CREATE OR REPLACE FUNCTION return4me_assert_financial_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_id uuid; debit_total numeric(18,2); credit_total numeric(18,2); line_count integer;
BEGIN
  target_id := CASE WHEN TG_TABLE_NAME='financial_journals' THEN NEW.id ELSE NEW.journal_id END;
  SELECT COALESCE(sum(debit_kes),0),COALESCE(sum(credit_kes),0),count(*)
    INTO debit_total,credit_total,line_count FROM financial_postings WHERE journal_id=target_id;
  IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Financial journal % is not balanced',target_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS financial_journals_balanced_deferred ON financial_journals;
CREATE CONSTRAINT TRIGGER financial_journals_balanced_deferred
AFTER INSERT ON financial_journals DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION return4me_assert_financial_journal_balanced();
DROP TRIGGER IF EXISTS financial_postings_balanced_deferred ON financial_postings;
CREATE CONSTRAINT TRIGGER financial_postings_balanced_deferred
AFTER INSERT ON financial_postings DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION return4me_assert_financial_journal_balanced();

CREATE OR REPLACE FUNCTION return4me_reject_financial_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial journals and postings are immutable; use a correcting journal'; END $$;
DROP TRIGGER IF EXISTS financial_journals_no_mutation ON financial_journals;
CREATE TRIGGER financial_journals_no_mutation BEFORE UPDATE OR DELETE ON financial_journals
FOR EACH ROW EXECUTE FUNCTION return4me_reject_financial_mutation();
DROP TRIGGER IF EXISTS financial_journals_no_truncate ON financial_journals;
CREATE TRIGGER financial_journals_no_truncate BEFORE TRUNCATE ON financial_journals
FOR EACH STATEMENT EXECUTE FUNCTION return4me_reject_financial_mutation();
DROP TRIGGER IF EXISTS financial_postings_no_mutation ON financial_postings;
CREATE TRIGGER financial_postings_no_mutation BEFORE UPDATE OR DELETE ON financial_postings
FOR EACH ROW EXECUTE FUNCTION return4me_reject_financial_mutation();
DROP TRIGGER IF EXISTS financial_postings_no_truncate ON financial_postings;
CREATE TRIGGER financial_postings_no_truncate BEFORE TRUNCATE ON financial_postings
FOR EACH STATEMENT EXECUTE FUNCTION return4me_reject_financial_mutation();
