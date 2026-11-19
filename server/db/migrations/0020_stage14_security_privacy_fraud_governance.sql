-- Stage 14 governance foundations. Prepared only; never auto-applied by application startup.
CREATE TABLE privacy_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(32) NOT NULL UNIQUE,
  subject_type varchar(60) NOT NULL, subject_id varchar(120) NOT NULL,
  reason_code varchar(60) NOT NULL CHECK (reason_code IN ('litigation','law_enforcement','regulatory','safeguarding','dispute','other')),
  authority_reference varchar(180), status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  created_by uuid NOT NULL REFERENCES users(id), released_by uuid REFERENCES users(id),
  release_reason varchar(1000), created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz,
  CHECK ((status='active' AND released_at IS NULL AND released_by IS NULL) OR (status='released' AND released_at IS NOT NULL AND released_by IS NOT NULL AND release_reason IS NOT NULL))
);
CREATE INDEX privacy_legal_hold_subject_idx ON privacy_legal_holds(subject_type,subject_id,status);
CREATE TABLE privacy_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_class varchar(80) NOT NULL,
  purpose varchar(500) NOT NULL, retention_days integer NOT NULL CHECK (retention_days > 0),
  legal_basis_review varchar(24) NOT NULL DEFAULT 'pending' CHECK (legal_basis_review IN ('pending','reviewed','rejected')),
  policy_version varchar(40) NOT NULL, active boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(record_class,policy_version), CHECK (NOT active OR (legal_basis_review='reviewed' AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE risk_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference varchar(32) NOT NULL UNIQUE,
  subject_user_id uuid REFERENCES users(id), subject_type varchar(60) NOT NULL, subject_id varchar(120) NOT NULL,
  signal_code varchar(80) NOT NULL, signal_source varchar(80) NOT NULL, signal_evidence_hash varchar(64),
  severity varchar(16) NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  status varchar(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','monitoring','resolved')),
  assigned_to uuid REFERENCES users(id), outcome varchar(32) CHECK (outcome IN ('no_issue','policy_breach','refer_legal','insufficient_evidence')),
  rationale varchar(1500), created_by uuid NOT NULL REFERENCES users(id), reviewed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
  CHECK ((status='resolved' AND resolved_at IS NOT NULL AND reviewed_by IS NOT NULL AND outcome IS NOT NULL) OR status <> 'resolved')
);
CREATE INDEX risk_review_status_idx ON risk_review_cases(status,severity,created_at);
CREATE INDEX risk_review_subject_idx ON risk_review_cases(subject_type,subject_id);
CREATE TABLE risk_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES risk_review_cases(id),
  actor_id uuid NOT NULL REFERENCES users(id), event_type varchar(40) NOT NULL,
  rationale varchar(1500) NOT NULL, evidence_hash varchar(64), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_review_event_case_idx ON risk_review_events(case_id,created_at);
CREATE TABLE document_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents(id),
  actor_id uuid NOT NULL REFERENCES users(id), access_purpose varchar(80) NOT NULL,
  outcome varchar(24) NOT NULL CHECK (outcome IN ('allowed','denied')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_access_document_idx ON document_access_events(document_id,created_at);
CREATE INDEX document_access_actor_idx ON document_access_events(actor_id,created_at);
CREATE TABLE security_incident_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES security_incidents(id),
  assessed_by uuid NOT NULL REFERENCES users(id), affected_data_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_people_estimate integer CHECK (affected_people_estimate IS NULL OR affected_people_estimate >= 0),
  access_confirmed boolean NOT NULL DEFAULT false, containment_at timestamptz,
  counsel_review_status varchar(24) NOT NULL DEFAULT 'pending' CHECK (counsel_review_status IN ('pending','requested','reviewed')),
  regulator_assessment_status varchar(40) NOT NULL DEFAULT 'pending', subject_notification_status varchar(40) NOT NULL DEFAULT 'pending',
  assessment_notes varchar(3000) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_incident_assessment_idx ON security_incident_assessments(incident_id,created_at);

-- Append-only review evidence. Corrections are new events, never in-place edits.
CREATE OR REPLACE FUNCTION reject_stage14_evidence_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Stage 14 evidence is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER risk_review_events_immutable BEFORE UPDATE OR DELETE ON risk_review_events FOR EACH ROW EXECUTE FUNCTION reject_stage14_evidence_mutation();
CREATE TRIGGER security_incident_assessments_immutable BEFORE UPDATE OR DELETE ON security_incident_assessments FOR EACH ROW EXECUTE FUNCTION reject_stage14_evidence_mutation();
