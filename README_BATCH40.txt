Batch 40 — PostgreSQL outbox and authorization hardening

Continues from Batch 39. The disposable PostgreSQL integration harness now applies the actual repository migrations 0015 and 0016 and covers nine scenarios for schema constraints, transaction rollback, idempotency, grant identity/session/purpose/expiry, concurrent grant consumption, provider unknown-state recovery, document deletion deduplication/dead-letter state and worker lease recovery. A focused authorization/outbox source guard is included in verify:all.

Acceptance limitation: PostgreSQL tests are skipped unless TEST_DATABASE_URL points to a disposable database. npm ci timed out; full semantic typecheck, Vitest and build remain unverified. No migration or production operation was performed.
