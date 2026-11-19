#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${RESTORE_TARGET_NAME:?RESTORE_TARGET_NAME is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"
[[ "${RESTORE_APPROVED:-false}" == "true" ]] || { echo "Set RESTORE_APPROVED=true after an approved restore rehearsal" >&2; exit 1; }
[[ -f "$BACKUP_FILE" && -f "$BACKUP_FILE.sha256" && -f "$BACKUP_PASSPHRASE_FILE" ]] || { echo "Backup, checksum or passphrase file is missing" >&2; exit 1; }
[[ "$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")" == "600" ]] || { echo "Backup passphrase file must have mode 600" >&2; exit 1; }
db_name="${RESTORE_DATABASE_URL##*/}"
db_name="${db_name%%\?*}"
[[ "$db_name" == "$RESTORE_TARGET_NAME" ]] || { echo "RESTORE_TARGET_NAME does not match the target database URL" >&2; exit 1; }
[[ "$db_name" =~ (_restore|_dr_test)$ ]] || { echo "Refusing restore: target database must end in _restore or _dr_test" >&2; exit 1; }
command -v pg_restore >/dev/null
command -v gpg >/dev/null
command -v sha256sum >/dev/null
( cd "$(dirname "$BACKUP_FILE")" && sha256sum --check "$(basename "$BACKUP_FILE").sha256" )
plain="$(mktemp)"
trap 'rm -f "$plain"' EXIT
gpg --batch --decrypt --passphrase-file "$BACKUP_PASSPHRASE_FILE" --output "$plain" "$BACKUP_FILE"
pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$plain"
echo "Restore completed to the explicitly named non-production target: $RESTORE_TARGET_NAME"
