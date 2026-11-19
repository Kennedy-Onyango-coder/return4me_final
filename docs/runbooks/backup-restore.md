# PostgreSQL backup and restore runbook

## Backup

1. Confirm the target database and maintenance window with the database owner.
2. Provision an off-host backup directory and a dedicated 32+ character backup passphrase. Store the passphrase outside the database host with restricted access; create the passphrase file with mode `600`.
3. Set `DATABASE_URL`, `BACKUP_DIR` and `BACKUP_PASSPHRASE_FILE` in the operator shell. Do not put secrets in command-line arguments, tickets or chat.
4. Run `scripts/backup-postgres.sh`.
5. Verify the encrypted artifact and `.sha256` checksum. Copy the encrypted artifact to the approved off-site backup location using a separately controlled credential.
6. Record backup timestamp, database identifier, artifact checksum, operator and result in the protected operations log. Never record the passphrase.

## Restore rehearsal

1. Obtain separate approval and create an isolated database whose name ends in `_restore` or `_dr_test`.
2. Set `RESTORE_DATABASE_URL`, matching `RESTORE_TARGET_NAME`, `BACKUP_FILE`, `BACKUP_PASSPHRASE_FILE` and `RESTORE_APPROVED=true`.
3. Run `scripts/restore-postgres.sh`. The script verifies checksum, decrypts to a temporary file, restores only to the explicitly named non-production database and deletes the temporary plaintext dump.
4. Run schema/readiness checks, record counts, custody hash-chain verification, ledger balancing and application smoke tests.
5. Record restore duration, gaps, checksum and evidence. Do not infer an RPO/RTO target; the accountable owner must approve those values.
6. Remove the rehearsal database and temporary artifacts under the approved data-handling policy.

These scripts have not been run in this preparation environment. They are not a substitute for managed backup retention, off-site replication or a tested disaster-recovery service.
