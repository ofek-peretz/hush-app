#!/bin/sh
# Hush v1 — production entrypoint (BB-30 §6). Wraps the built backup-gated migration around service
# start so a prod container can never begin serving on a half-migrated or un-backed-up DB.
#
# Sequence:
#   1. If the DB already exists  -> the ONE sanctioned migration: fresh integrity-checked backup FIRST
#      (refuses if it can't), forward chain via the single ordered runner, then verify (schema head +
#      foreign_key_check + shape parity). A failed verify aborts start (forward-only, no auto-rollback).
#   2. If the DB does NOT exist  -> first deploy: nothing to back up; init_database (at app import) brings
#      a fresh DB straight to head. We still verify after start-readiness via /health + --verify-only.
#   3. exec uvicorn (single write worker — preserves the single-writer invariant trivially).
#
# Required env: HUSH_DB_PATH (e.g. /data/hush.db), HUSH_OPERATOR_KEY, TOKEN_PEPPER (from the secrets
# manager). Optional: HUSH_BACKUP_DIR (default /backups). See DEPLOYMENT_ARCHITECTURE_V1.md §3.
set -eu

: "${HUSH_DB_PATH:?HUSH_DB_PATH is required}"
BACKUP_DIR="${HUSH_BACKUP_DIR:-/backups}"

if [ -f "$HUSH_DB_PATH" ]; then
	echo "hush-entrypoint: existing DB at $HUSH_DB_PATH -> backup-gated migration"
	# migrate_production refuses to proceed without a fresh, integrity-verified backup (runbook rule
	# enforced in code, not by discipline). Non-zero exit here ABORTS start.
	python -m app.migrate --db "$HUSH_DB_PATH" --backup-dir "$BACKUP_DIR"
else
	echo "hush-entrypoint: no DB at $HUSH_DB_PATH -> first deploy (init_database brings a fresh DB to head)"
fi

echo "hush-entrypoint: starting service"
# HUSH_AUTOCREATE_APP must be 1 so uvicorn imports a built app (init_database create-or-bring-forward).
exec uvicorn app.app_main:app --host 0.0.0.0 --port 8000 --workers 1
