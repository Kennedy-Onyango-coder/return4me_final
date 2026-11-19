-- Batch 13: auditable data-subject rights request workflow; no automatic erasure.
CREATE TABLE IF NOT EXISTS data_rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  request_type varchar(24) NOT NULL CHECK (request_type IN ('access','rectification','erasure','restriction')),
  details varchar(1500) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','fulfilled','declined')),
  reviewed_by uuid REFERENCES users(id),
  review_note varchar(1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS data_rights_user_created_idx ON data_rights_requests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS data_rights_status_created_idx ON data_rights_requests(status,created_at DESC);
