CREATE TABLE runtime_worker_heartbeats (
  worker_name varchar(100) PRIMARY KEY,
  status varchar(24) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','healthy','degraded')),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_failure_at timestamptz,
  last_error_code varchar(80),
  successful_runs bigint NOT NULL DEFAULT 0 CHECK (successful_runs >= 0),
  failed_runs bigint NOT NULL DEFAULT 0 CHECK (failed_runs >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX runtime_worker_heartbeat_status_idx ON runtime_worker_heartbeats(status, updated_at);
