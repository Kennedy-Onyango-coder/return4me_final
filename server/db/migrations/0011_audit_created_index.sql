-- Batch 20: support bounded audit chronology and date-range filtering.
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at);
