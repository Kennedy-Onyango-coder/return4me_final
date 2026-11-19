-- Batch 60: Stage 13 communication consent, preferences, approval governance and delivery observability.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category varchar(32) NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal';

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS category varchar(32) NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS dedupe_key varchar(180);
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_unique
  ON notification_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app_community_updates boolean NOT NULL DEFAULT true,
  email_community_updates boolean NOT NULL DEFAULT false,
  sms_community_updates boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel varchar(16) NOT NULL CHECK (channel IN ('email','sms')),
  purpose varchar(32) NOT NULL CHECK (purpose IN ('community_updates')),
  status varchar(12) NOT NULL CHECK (status IN ('granted','revoked')),
  policy_version varchar(40) NOT NULL,
  consent_text_hash varchar(64) NOT NULL,
  source varchar(24) NOT NULL DEFAULT 'account_settings',
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='granted' AND granted_at IS NOT NULL AND revoked_at IS NULL) OR (status='revoked' AND revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS communication_consents_user_idx
  ON communication_consents(user_id,channel,purpose,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS communication_consents_active_unique
  ON communication_consents(user_id,channel,purpose) WHERE status='granted';

CREATE TABLE IF NOT EXISTS communications_governance (
  singleton_id integer PRIMARY KEY DEFAULT 1 CHECK (singleton_id=1),
  approver_user_id uuid REFERENCES users(id),
  publisher_user_id uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE communications_governance ADD COLUMN IF NOT EXISTS publisher_user_id uuid REFERENCES users(id);
INSERT INTO communications_governance(singleton_id) VALUES (1) ON CONFLICT(singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS communications_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel varchar(16) NOT NULL CHECK (channel IN ('email','sms','facebook','telegram')),
  provider varchar(32) NOT NULL,
  provider_event_id varchar(180) NOT NULL,
  event_type varchar(32) NOT NULL CHECK (event_type IN ('accepted','delivered','bounced','complained','opened','clicked','delayed','failed','suppressed')),
  recipient_hash varchar(64),
  message_reference_hash varchar(64),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS communications_delivery_event_time_idx
  ON communications_delivery_events(channel,event_type,occurred_at);

ALTER TABLE communications_campaigns
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES reports(id),
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS withdrawal_reason varchar(1000);
CREATE INDEX IF NOT EXISTS communications_campaign_report_idx ON communications_campaigns(report_id);
ALTER TABLE communications_publications
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS withdrawal_reason varchar(1000);
