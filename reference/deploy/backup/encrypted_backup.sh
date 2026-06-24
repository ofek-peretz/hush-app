#!/bin/sh
# Hush v1 — encrypted off-box backup wrapper (BB-21). Ties the BUILT, tested snapshot mechanism
# (app/migrate.backup_database — a WAL-safe, self-integrity-checked online snapshot) to an encryption
# envelope so backups leave the host already encrypted with a RECIPIENT public key. The backup host
# therefore needs only the public key; the private key that can decrypt lives in KMS and is used only at
# restore time on a separate audited host (DATA_PROTECTION_AT_REST_V1.md §3).
#
# Usage:
#   HUSH_DB_PATH=/data/hush.db \
#   HUSH_BACKUP_RECIPIENT=age1xxxx... \           # age recipient (public key); or use --gpg below
#   deploy/backup/encrypted_backup.sh [--gpg <key-id>]
#
# Produces in $HUSH_BACKUP_DIR (default /backups):
#   hush-<ts>.db.age           (or .gpg)   — the encrypted snapshot
#   hush-<ts>.db.age.sha256                — manifest (sha256 of the ENCRYPTED artifact)
# then SHREDS the plaintext snapshot and calls the upload hook (off-box, versioned bucket).
#
# The encryption tool (age preferred, gpg supported) is an OPERATIONS dependency — deliberately NOT a
# Python package, to keep the deployable's pinned dependency set minimal (BB-31). This script changes no
# model behavior; it only wraps storage handling around the built mechanism.
set -eu

: "${HUSH_DB_PATH:?HUSH_DB_PATH is required (the live SQLite DB)}"
BACKUP_DIR="${HUSH_BACKUP_DIR:-/backups}"
GPG_KEY=""
[ "${1:-}" = "--gpg" ] && { GPG_KEY="${2:?--gpg needs a key id}"; }

mkdir -p "$BACKUP_DIR"

# 1. WAL-safe snapshot via the BUILT mechanism (self-verified with integrity_check inside backup_database).
#    backup_database returns the snapshot path on stdout; capture it.
SNAP="$(python -c "from app.migrate import backup_database; print(backup_database('${HUSH_DB_PATH}', '${BACKUP_DIR}'))")"
echo "encrypted_backup: snapshot -> $SNAP"

# 2. Encrypt to the RECIPIENT public key. age is preferred; gpg is the fallback.
if [ -n "$GPG_KEY" ]; then
	ENC="${SNAP}.gpg"
	gpg --batch --yes --encrypt --recipient "$GPG_KEY" --output "$ENC" "$SNAP"
else
	: "${HUSH_BACKUP_RECIPIENT:?HUSH_BACKUP_RECIPIENT (age public key) is required unless --gpg is used}"
	ENC="${SNAP}.age"
	age --recipient "$HUSH_BACKUP_RECIPIENT" --output "$ENC" "$SNAP"
fi
echo "encrypted_backup: encrypted -> $ENC"

# 3. Manifest over the ENCRYPTED artifact (what restore checks against — DATA_PROTECTION §5 step 3).
sha256sum "$ENC" > "${ENC}.sha256"

# 4. Shred the plaintext snapshot (it lived only transiently on the encrypted volume).
( command -v shred >/dev/null 2>&1 && shred -u "$SNAP" ) || rm -f "$SNAP"
echo "encrypted_backup: plaintext snapshot removed"

# 5. Off-box upload hook (INFRASTRUCTURE — wire to the versioned, least-privilege bucket; escalate).
#    The backup identity should be put-only (no delete/get); restore uses a separate audited identity.
if [ -n "${HUSH_BACKUP_UPLOAD_CMD:-}" ]; then
	# e.g. HUSH_BACKUP_UPLOAD_CMD='aws s3 cp {} s3://hush-backups/'  ({} is replaced by each artifact)
	for f in "$ENC" "${ENC}.sha256"; do
		# shellcheck disable=SC2086
		eval "$(printf '%s' "$HUSH_BACKUP_UPLOAD_CMD" | sed "s#{}#$f#g")"
	done
	echo "encrypted_backup: uploaded off-box"
else
	echo "encrypted_backup: NO upload command set (HUSH_BACKUP_UPLOAD_CMD) — artifact left local only."
	echo "                  Wire the off-box, versioned bucket before relying on this in prod (BB-21)."
fi
