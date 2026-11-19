CREATE TABLE IF NOT EXISTS provider_operation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type varchar(16) NOT NULL CHECK (operation_type IN ('refund','payout')),
  resource_id uuid NOT NULL,
  idempotency_key varchar(120) NOT NULL UNIQUE,
  status varchar(24) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','dispatching','accepted','rejected','unknown','reconciled')),
  requested_by uuid NOT NULL REFERENCES users(id),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_reference varchar(180),
  http_status integer,
  dispatch_started_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_operation_outbox_attention_idx ON provider_operation_outbox(status, created_at);
