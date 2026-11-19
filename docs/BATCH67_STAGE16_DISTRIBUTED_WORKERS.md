# Batch 67A — Stage 16 distributed worker coordination

- Added a dedicated PostgreSQL worker-lock pool and per-worker session advisory lock in `runObservedWorker`; same-named workers are skipped when another API instance holds the lock.
- Added explicit lock release and lock-session destruction if unlock fails.
- Graceful shutdown pool closure was completed in Batch 67B; see `docs/BATCH67B_STAGE16_MIGRATION_READINESS.md`.
- Runtime multi-instance, lock-loss, worker crash/restart and graceful-shutdown evidence remains pending.
- Stage 16 remains PARTIAL; independent acceptance PENDING; production release NOT_AUTHORISED.
