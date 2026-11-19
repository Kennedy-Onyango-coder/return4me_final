-- Custody chain v2: unambiguous UTF-8 length-prefixed canonical fields,
-- database-owned sequence/hash generation, and append-only enforcement.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE custody_events
  ADD COLUMN IF NOT EXISTS hash_version varchar(8) NOT NULL DEFAULT 'v1';
ALTER TABLE custody_events ALTER COLUMN hash_version SET DEFAULT 'v2';
ALTER TABLE custody_events
  DROP CONSTRAINT IF EXISTS custody_events_hash_version_check;
ALTER TABLE custody_events
  ADD CONSTRAINT custody_events_hash_version_check CHECK (hash_version IN ('v1','v2'));

CREATE OR REPLACE FUNCTION return4me_custody_field(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value IS NULL THEN '-1:' ELSE octet_length(convert_to(value,'UTF8'))::text || ':' || value END;
$$;

CREATE OR REPLACE FUNCTION return4me_custody_timestamp(value timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

CREATE OR REPLACE FUNCTION return4me_custody_event_hash(
  p_id uuid, p_report_id uuid, p_agent_id uuid, p_event_type text,
  p_evidence_ref text, p_notes text, p_actor_id uuid,
  p_created_at timestamptz, p_sequence_no integer, p_previous_hash text
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(
    return4me_custody_field('return4me.custody.v2') ||
    return4me_custody_field(p_id::text) ||
    return4me_custody_field(p_report_id::text) ||
    return4me_custody_field(p_agent_id::text) ||
    return4me_custody_field(p_event_type) ||
    return4me_custody_field(p_evidence_ref) ||
    return4me_custody_field(p_notes) ||
    return4me_custody_field(p_actor_id::text) ||
    return4me_custody_field(return4me_custody_timestamp(p_created_at)) ||
    return4me_custody_field(p_sequence_no::text) ||
    return4me_custody_field(p_previous_hash), 'sha256'), 'hex');
$$;

-- The legacy migration installed a row-level update/delete trigger. Temporarily
-- disable it only while deterministically re-chaining existing rows to v2.
ALTER TABLE custody_events DISABLE TRIGGER custody_events_no_update;
DO $$
DECLARE report_row record; event_row record; v_previous_hash text; next_sequence integer;
BEGIN
  FOR report_row IN SELECT DISTINCT report_id FROM custody_events ORDER BY report_id LOOP
    v_previous_hash := NULL;
    next_sequence := 0;
    FOR event_row IN
      SELECT id,report_id,agent_id,event_type,evidence_ref,notes,actor_id,created_at
      FROM custody_events WHERE report_id=report_row.report_id
      ORDER BY created_at,id
    LOOP
      next_sequence := next_sequence + 1;
      UPDATE custody_events SET
        sequence_no=next_sequence,
        previous_hash=v_previous_hash,
        hash_version='v2',
        event_hash=return4me_custody_event_hash(
          event_row.id,event_row.report_id,event_row.agent_id,event_row.event_type,
          event_row.evidence_ref,event_row.notes,event_row.actor_id,event_row.created_at,
          next_sequence,v_previous_hash)
      WHERE id=event_row.id;
      SELECT event_hash INTO v_previous_hash FROM custody_events WHERE id=event_row.id;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE custody_events ENABLE TRIGGER custody_events_no_update;

CREATE OR REPLACE FUNCTION return4me_custody_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE prior custody_events%ROWTYPE;
BEGIN
  IF NEW.id IS NULL THEN NEW.id := gen_random_uuid(); END IF;
  IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  -- Serialize all append attempts for the same report, including concurrent inserts.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.report_id::text,0));
  SELECT * INTO prior FROM custody_events
    WHERE report_id=NEW.report_id ORDER BY sequence_no DESC NULLS LAST,created_at DESC,id DESC LIMIT 1;
  NEW.sequence_no := COALESCE(prior.sequence_no,0)+1;
  NEW.previous_hash := prior.event_hash;
  NEW.hash_version := 'v2';
  NEW.event_hash := return4me_custody_event_hash(
    NEW.id,NEW.report_id,NEW.agent_id,NEW.event_type,NEW.evidence_ref,NEW.notes,
    NEW.actor_id,NEW.created_at,NEW.sequence_no,NEW.previous_hash);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS custody_events_before_insert ON custody_events;
CREATE TRIGGER custody_events_before_insert BEFORE INSERT ON custody_events
FOR EACH ROW EXECUTE FUNCTION return4me_custody_before_insert();

CREATE OR REPLACE FUNCTION return4me_reject_custody_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Custody events are append-only and cannot be changed, deleted or truncated';
END $$;
DROP TRIGGER IF EXISTS custody_events_no_update ON custody_events;
CREATE TRIGGER custody_events_no_update BEFORE UPDATE OR DELETE ON custody_events
FOR EACH ROW EXECUTE FUNCTION return4me_reject_custody_mutation();
DROP TRIGGER IF EXISTS custody_events_no_truncate ON custody_events;
CREATE TRIGGER custody_events_no_truncate BEFORE TRUNCATE ON custody_events
FOR EACH STATEMENT EXECUTE FUNCTION return4me_reject_custody_mutation();

-- Confirmation rows are tied to the exact current parties by the transactional API;
-- historical rows are preserved and no destructive deduplication is attempted here.
