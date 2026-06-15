"""
Migration 008 — `session_progress` accumulator (DX-11).

The runtime half of the M1 input flip (Delta Plan P1 / Sprint 5). Thin, idempotent,
ADDITIVE-ONLY migration (migration_007 shape). It adds ONE infra table:

  session_progress(workout_session_id, capability, entry_score, s_obs, decision_type,
                   recommended_weight, have_primary, updated_at)
  PRIMARY KEY (workout_session_id, capability)

This is the persisted equivalent of SessionEngine._CapMemory: the device-driven set-report
path receives one set per request (no shared process memory), so the per-capability ES-006
decision-memory accumulator must live in the database between requests, and be read once at
session close to advance the governor ONCE per capability (R2). It is INFRA, outside the model
zones — no model number, formula, or column meaning changes. A fresh database built from the
updated schema.py already has the table; this migration brings v7 databases forward. Empty on
the in-process (SessionEngine) path, so every prior trajectory reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_008_session_progress.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 8

# (table, create-ddl) — created only if absent. Must match schema.py exactly (drift guard ATD-8).
_NEW_TABLES = [
    (
        "session_progress",
        """
        CREATE TABLE IF NOT EXISTS session_progress (
            workout_session_id  TEXT NOT NULL REFERENCES workout_session(id),
            capability          TEXT NOT NULL,
            entry_score         REAL,
            s_obs               REAL NOT NULL DEFAULT 0,
            decision_type       TEXT NOT NULL DEFAULT '',
            recommended_weight  REAL NOT NULL DEFAULT 0,
            have_primary        INTEGER NOT NULL DEFAULT 0,
            updated_at          TEXT NOT NULL,
            PRIMARY KEY (workout_session_id, capability)
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
    """Apply migration 008 if not already applied. Returns True if work was done."""
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
