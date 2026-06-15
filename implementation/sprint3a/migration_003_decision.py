"""
Migration 003 — ES-006 Decision Hierarchy (Sprint 3A).

Thin, idempotent migration runner (Build Plan §3), identical in style to
migration_002_fatigue. ADDITIVE ONLY — it adds columns and bumps the schema version;
it never rewrites or drops existing data. A fresh database built from the updated
schema.py already has these columns, so this migration is for databases created under
Sprint 1/2.

All new columns carry DEFAULTs equal to the INERT decision state (no memory: NULL
held load, zero streaks; decision_type 'KEEP_LOAD' on recommendation, '' on the log).
Because the governor is also inert until `last_recommended_weight` is non-NULL — which
only the governed pipeline path ever sets — migrating a Sprint 1/2 database leaves
every existing recommendation, observation, and capability_state semantically
unchanged (Sprint 0-2 parity preserved).

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_003_decision.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 3

# (table, column, column-definition) — added only if absent.
_ADDITIONS = [
    ("capability_state", "last_recommended_weight", "REAL"),
    ("capability_state", "last_decision",           "TEXT"),
    ("capability_state", "consecutive_positive",    "INTEGER NOT NULL DEFAULT 0"),
    ("capability_state", "consecutive_negative",    "INTEGER NOT NULL DEFAULT 0"),
    ("capability_state", "last_decision_week",       "REAL"),
    ("recommendation",   "decision_type",            "TEXT NOT NULL DEFAULT 'KEEP_LOAD'"),
    ("recommendation",   "target_load",              "REAL NOT NULL DEFAULT 0"),
    ("state_update_log", "decision_type",            "TEXT NOT NULL DEFAULT ''"),
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
    row = conn.execute(
        "SELECT 1 FROM schema_version WHERE version=?", (VERSION,)
    ).fetchone()
    return row is not None


def apply(conn: sqlite3.Connection) -> bool:
    """Apply migration 003 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for table, column, coldef in _ADDITIONS:
        if not _table_exists(conn, table):
            continue  # nothing to migrate for an absent table
        if column not in _columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
