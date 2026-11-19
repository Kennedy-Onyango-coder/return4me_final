CREATE TABLE distributed_rate_limits (
  key_hash char(64) PRIMARY KEY,
  total_hits integer NOT NULL CHECK (total_hits >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX distributed_rate_limits_expires_at_idx ON distributed_rate_limits(expires_at);
