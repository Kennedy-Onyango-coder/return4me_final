#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required}"
command -v pg_dump >/dev/null
command -v gpg >/dev/null
command -v sha256sum >/dev/null
[[ -f "$BACKUP_PASSPHRASE_FILE" ]] || { echo "Backup passphrase file not found" >&2; exit 1; }
[[ "$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")" == "600" ]] || { echo "Backup passphrase file must have mode 600" >&2; exit 1; }
umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain="$(mktemp)"
trap 'rm -f "$plain"' EXIT
output="$BACKUP_DIR/return4me-${stamp}.dump.gpg"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$plain"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$BACKUP_PASSPHRASE_FILE" --output "$output" "$plain"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$output")" > "$(basename "$output").sha256" )
echo "Encrypted backup created: $output"
echo "Store an encrypted copy off-site under a separate access policy; this script does not upload it."
