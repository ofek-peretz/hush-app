"""
Migration 007 — Bodyweight capture (DX-07).

DX-07 delta item (pre-Sprint-5, P0). Thin, idempotent, ADDITIVE-ONLY migration
(migration_006 shape). It adds one nullable column:

  athlete.bodyweight_kg : onboarding bodyweight (kg), captured but INERT.

No behavior change: nothing in the model reads bodyweight_kg in this change (Option D
consumption is DX-08). A fresh database built from the updated schema.py already has the
column; this migration brings v6 databases forward. Existing athletes backfill to NULL, so a
migrated database is semantically unchanged and every prior trajectory reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_007_bodyweight.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 7

# (table, column, definition) — added only if absent. Must match schema.py exactly (MR1).
_ADDITIONS = [
    ("athlete", "bodyweight_kg", "REAL"),
]


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


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
    """Apply migration 007 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for table, column, coldef in _ADDITIONS:
        if not _table_exists(conn, table):
            continue
        if column not in _columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
