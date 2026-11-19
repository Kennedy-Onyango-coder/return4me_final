-- Batch 5: agent onboarding, verification, scheduling and custody completion.
CREATE TABLE IF NOT EXISTS agent_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(40) NOT NULL UNIQUE,
  body text NOT NULL,
  body_sha256 char(64) NOT NULL,
  legal_approved_by uuid REFERENCES users(id),
  legal_approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((legal_approved_by IS NULL) = (legal_approved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS agent_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES agent_agreement_versions(id),
  typed_full_name varchar(180) NOT NULL,
  agreement_sha256 char(64) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid NOT NULL REFERENCES users(id),
  UNIQUE(agent_id, version_id)
);
CREATE TABLE IF NOT EXISTS agent_site_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  outcome varchar(20) NOT NULL CHECK (outcome IN ('approved','rejected','revisit')),
  evidence_reference text,
  findings text NOT NULL,
  inspected_by uuid NOT NULL REFERENCES users(id),
  inspected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_site_inspections_latest_idx ON agent_site_inspections(agent_id, inspected_at DESC);
CREATE TABLE IF NOT EXISTS agent_training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  module_code varchar(64) NOT NULL CHECK (module_code IN ('custody_basics','privacy_safety','handover_incidents')),
  score_percent integer NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES claims(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  claimant_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Africa/Nairobi',
  status varchar(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','declined','cancelled','completed','no_show')),
  requested_by uuid NOT NULL REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS agent_appointments_agent_time_idx ON agent_appointments(agent_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS agent_appointments_claimant_time_idx ON agent_appointments(claimant_id, starts_at);
CREATE TABLE IF NOT EXISTS agent_collection_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id),
  claim_id uuid NOT NULL REFERENCES claims(id),
  claimant_id uuid NOT NULL REFERENCES users(id),
  authority_status varchar(20) NOT NULL CHECK (authority_status IN ('verified','not_required')),
  identity_checked_by uuid NOT NULL REFERENCES users(id),
  identity_checked_at timestamptz NOT NULL DEFAULT now(),
  authority_evidence_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, claim_id)
);
ALTER TABLE custody_events ADD COLUMN IF NOT EXISTS previous_hash varchar(64);
ALTER TABLE custody_events ADD COLUMN IF NOT EXISTS event_hash varchar(64);
ALTER TABLE custody_events ADD COLUMN IF NOT EXISTS sequence_no integer;
CREATE UNIQUE INDEX IF NOT EXISTS custody_events_report_sequence_unique ON custody_events(report_id, sequence_no) WHERE sequence_no IS NOT NULL;
-- Prevent a new appointment request from silently overlapping an existing active slot.
CREATE OR REPLACE FUNCTION return4me_check_agent_appointment_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('requested','confirmed') AND EXISTS (
    SELECT 1 FROM agent_appointments a WHERE a.agent_id = NEW.agent_id AND a.id <> NEW.id
      AND a.status IN ('requested','confirmed') AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(NEW.starts_at,NEW.ends_at,'[)')
  ) THEN RAISE EXCEPTION 'Agent appointment time overlaps an existing appointment'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS agent_appointments_no_overlap ON agent_appointments;
CREATE TRIGGER agent_appointments_no_overlap BEFORE INSERT OR UPDATE OF starts_at,ends_at,status ON agent_appointments FOR EACH ROW EXECUTE FUNCTION return4me_check_agent_appointment_overlap();
CREATE TABLE IF NOT EXISTS custody_handover_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id),
  claim_id uuid NOT NULL REFERENCES claims(id),
  assignment_id uuid NOT NULL REFERENCES assignments(id),
  claimant_id uuid NOT NULL REFERENCES users(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claim_id,assignment_id)
);
CREATE TABLE IF NOT EXISTS custody_transfer_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_role varchar(16) NOT NULL CHECK (actor_role IN ('agent','claimant')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id,actor_id,actor_role)
);
-- Backfill a deterministic, verifiable chain for pre-existing custody history before locking the table.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
DECLARE report_row record; event_row record; prev varchar(64); seq integer;
BEGIN
  FOR report_row IN SELECT DISTINCT report_id FROM custody_events LOOP
    prev := NULL; seq := 0;
    FOR event_row IN SELECT id,report_id,agent_id,event_type,evidence_ref,notes,actor_id,created_at FROM custody_events WHERE report_id=report_row.report_id ORDER BY created_at,id LOOP
      seq := seq + 1;
      UPDATE custody_events SET sequence_no=seq, previous_hash=prev,
        event_hash=encode(digest(concat_ws('|',event_row.id::text,event_row.report_id::text,event_row.agent_id::text,event_row.event_type,coalesce(event_row.evidence_ref,''),coalesce(event_row.notes,''),event_row.actor_id::text,event_row.created_at::text,seq::text,coalesce(prev,'')),'sha256'),'hex')
      WHERE id=event_row.id;
      SELECT event_hash INTO prev FROM custody_events WHERE id=event_row.id;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION return4me_reject_custody_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Custody events are append-only and cannot be changed or deleted';
END; $$;
DROP TRIGGER IF EXISTS custody_events_no_update ON custody_events;
CREATE TRIGGER custody_events_no_update BEFORE UPDATE OR DELETE ON custody_events FOR EACH ROW EXECUTE FUNCTION return4me_reject_custody_mutation();
CREATE TABLE IF NOT EXISTS agent_availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'Africa/Nairobi',
  published_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS agent_availability_windows_agent_time_idx ON agent_availability_windows(agent_id,starts_at,ends_at);
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$ BEGIN
  ALTER TABLE agent_appointments ADD CONSTRAINT agent_appointments_no_overlapping_active EXCLUDE USING gist
    (agent_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE (status IN ('requested','confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
