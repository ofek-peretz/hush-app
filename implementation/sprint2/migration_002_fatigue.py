"""
Migration 002 — Fatigue & Recovery + variance-suppressed confidence (Sprint 2).

Thin, idempotent migration runner (Build Plan §3: "straight SQL with a thin
migration runner", no heavy ORM tooling). ADDITIVE ONLY — it adds columns and a
bookkeeping table; it never rewrites or drops existing data. A fresh database built
from the updated schema.py already has these columns, so this migration is for
databases created under Sprint 1.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_002_fatigue.py.

All new columns carry DEFAULTs equal to the rested / no-conflict state (fatigue 0,
agreement 1), so migrating a Sprint 1 database leaves every existing recommendation,
observation, and capability_state semantically unchanged (Sprint 1 parity preserved).
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 2

# (table, column, column-definition) — added only if absent.
_ADDITIONS = [
    ("athlete_state",    "fatigue_systemic",       "REAL NOT NULL DEFAULT 0"),
    ("athlete_state",    "last_workout_at_week",    "REAL"),
    ("capability_state", "fatigue",                 "REAL NOT NULL DEFAULT 0"),
    ("capability_state", "var_w",                   "REAL NOT NULL DEFAULT 0"),
    ("capability_state", "var_ws",                  "REAL NOT NULL DEFAULT 0"),
    ("capability_state", "var_ws2",                 "REAL NOT NULL DEFAULT 0"),
    ("recommendation",   "est_fatigue_systemic",    "REAL NOT NULL DEFAULT 0"),
    ("recommendation",   "est_fatigue_capability",  "REAL NOT NULL DEFAULT 0"),
    ("state_update_log", "agreement",               "REAL NOT NULL DEFAULT 1"),
    ("state_update_log", "sigma2_recent",           "REAL NOT NULL DEFAULT 0"),
    ("state_update_log", "est_fatigue_capability",  "REAL NOT NULL DEFAULT 0"),
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
    """Apply migration 002 if not already applied. Returns True if work was done."""
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
