"""
Migration 009 — `stagnation_marker` (M5 / DX-09).

The anti-repetition memory for M5 stagnation surfacing (Product Spec §12: a plateau is not
re-surfaced until its trend state changes or a 4-week cooldown elapses). Thin, idempotent,
ADDITIVE-ONLY migration (migration_007/008 shape). It adds ONE infra table:

  stagnation_marker(athlete_id, capability, last_surfaced_week, last_surfaced_state, updated_at)
  PRIMARY KEY (athlete_id, capability)

It is INFRA, outside the model zones — no model number, formula, or column meaning changes. M5
is read-only w.r.t. learned state; this table is the ONLY thing the weekly review writes, and it
only records what was surfaced and when. A fresh database built from the updated schema.py
already has the table; this migration brings v8 databases forward. Empty until the first weekly
review writes a marker, so every prior trajectory reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_009_stagnation.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 9

# (table, create-ddl) — created only if absent. Must match schema.py exactly (drift guard ATD-8).
_NEW_TABLES = [
    (
        "stagnation_marker",
        """
        CREATE TABLE IF NOT EXISTS stagnation_marker (
            athlete_id          TEXT NOT NULL,
            capability          TEXT NOT NULL,
            last_surfaced_week  REAL,
            last_surfaced_state TEXT NOT NULL DEFAULT '',
            updated_at          TEXT NOT NULL,
            PRIMARY KEY (athlete_id, capability)
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
    """Apply migration 009 if not already applied. Returns True if work was done."""
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
