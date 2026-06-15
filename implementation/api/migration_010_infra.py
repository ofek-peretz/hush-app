"""
Migration 010 — web-shell ADDITIVE INFRA tables (Wave 2 / B3).

Thin, idempotent, additive-only migration (migration_008 shape). It adds the two infra tables
the production web shell needs — neither is model state, both live OUTSIDE the two schema zones:

  idempotency_key(athlete_id, client_event_id, response_json, created_at,
                  PRIMARY KEY(athlete_id, client_event_id))   — BB-1 exactly-once / anti-replay
  auth_token(token_hash PK, athlete_id, created_at, revoked_at) — BB-19/20 per-athlete bearer auth

No model number, formula, column meaning, or decision changes. A fresh database built from the
updated `schema.py` already has both tables (drift guard ATD-8 compares against `_NEW_TABLES`);
this migration brings a v9 database forward. Empty until the API serves its first request, so
every prior trajectory reproduces bit-for-bit.

NOTE (as-built): the build plan's third infra table (`athlete_profile_metadata` for bodyweight)
is NOT created — `bodyweight_kg` already lives on the `athlete` row as of DX-07/migration_007,
which the contract §9 reads/writes directly. Adding a side table would duplicate it.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_010_infra.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 10

# (table, create-ddl) — created only if absent. Must match schema.py exactly (drift guard ATD-8).
_NEW_TABLES = [
    (
        "idempotency_key",
        """
        CREATE TABLE IF NOT EXISTS idempotency_key (
            athlete_id       TEXT NOT NULL,
            client_event_id  TEXT NOT NULL,
            response_json    TEXT NOT NULL,
            created_at       TEXT NOT NULL,
            PRIMARY KEY (athlete_id, client_event_id)
        )
        """,
    ),
    (
        "auth_token",
        """
        CREATE TABLE IF NOT EXISTS auth_token (
            token_hash   TEXT PRIMARY KEY,
            athlete_id   TEXT NOT NULL REFERENCES athlete(id),
            created_at   TEXT NOT NULL,
            revoked_at   TEXT
        )
        """,
    ),
]


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def already_applied(conn: sqlite3.Connection) -> bool:
    if not _table_exists(conn, "schema_version"):
        return False
    return conn.execute(
        "SELECT 1 FROM schema_version WHERE version=?", (VERSION,)
    ).fetchone() is not None


def apply(conn: sqlite3.Connection) -> bool:
    """Apply migration 010 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for _table, ddl in _NEW_TABLES:
        conn.execute(ddl)

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
