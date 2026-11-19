-- Stage 11 consolidated maker/checker workflow for consequential Admin report decisions.
-- This migration is prepared only; it has not been applied to any database.
ALTER TABLE audit_events ADD COLUMN correlation_id varchar(80);

CREATE TABLE admin_action_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action varchar(100) NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id varchar(120) NOT NULL,
  proposed_by uuid NOT NULL REFERENCES users(id),
  proposal_reason text NOT NULL,
  payload jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id),
  review_reason text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT admin_action_approvals_status_check CHECK (status IN ('pending','approved','rejected','expired'))
);
CREATE INDEX admin_approval_pending_idx ON admin_action_approvals(status, expires_at, created_at);
CREATE INDEX admin_approval_resource_idx ON admin_action_approvals(resource_type, resource_id, created_at);
CREATE UNIQUE INDEX admin_approval_one_pending_resource_idx ON admin_action_approvals(resource_type, resource_id) WHERE status = 'pending';
