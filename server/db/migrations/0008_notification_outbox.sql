-- Batch 12: durable, retryable in-app notification outbox.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS outbox_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_outbox_unique ON notifications(outbox_id);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  type varchar(60) NOT NULL,
  title varchar(180) NOT NULL,
  body text NOT NULL,
  link text,
  status varchar(24) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status,next_attempt_at,created_at);
