"""
Migration 018 — Goal capture (training intent).

Thin, idempotent, ADDITIVE-ONLY migration (migration_007 shape). It adds one nullable column:

  athlete.goal : the athlete's training intent (build_muscle | get_stronger |
                 general_fitness | toning). Consumed at composition time to select the
                 working-rep target (constants.target_reps_for_goal); loads follow natively
                 through the RIR model. NULL == the historical default (8-rep target).

No behavior change for existing data: a fresh database built from the updated schema.py already
has the column; this migration brings v17 databases forward. Existing athletes backfill to NULL,
which target_reps_for_goal maps to the historical default — so a migrated database composes
bit-for-bit as before (parity firewall).

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_018_goal.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 18

# (table, column, definition) — added only if absent. Must match schema.py exactly (MR1).
_ADDITIONS = [
    ("athlete", "goal", "TEXT"),
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
    """Apply migration 018 if not already applied. Returns True if work was done."""
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
