-- Batch 26: single-use privileged step-up grants bound to a user and session.
CREATE TABLE IF NOT EXISTS admin_step_up_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  purpose varchar(100) NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_step_up_grant_lookup_idx
  ON admin_step_up_grants(user_id, session_id, purpose, expires_at);
