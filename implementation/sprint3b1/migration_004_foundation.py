"""
Migration 004 — Foundation (Sprint 3B-1): StrategyState, PreferenceState, REPLACE audit.

Thin, idempotent migration runner (Build Plan §3), identical in style to
migration_003_decision. ADDITIVE ONLY — it creates two new mutable-projection tables
and adds two REPLACE-audit columns to `recommendation`; it never rewrites or drops
existing data. A fresh database built from the updated schema.py already has all of
this, so this migration is for databases created under Sprint 1/2/3A.

DEFAULT-ON-ABSENCE (ratified): the migration creates the tables but inserts NO rows —
no backfill. A migrated athlete has no strategy_state / preference_state row, and the
repositories resolve that to the SINGLE-SOURCE defaults (domain.default_strategy_state;
preference_score 50). So a migrated Sprint 3A database is semantically unchanged: every
existing recommendation/observation/capability_state behaves exactly as before, and a
row-less athlete is provably identical to a freshly-seeded one (readiness review MR3).

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_004_foundation.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 4

_NEW_TABLES = [
    (
        "strategy_state",
        "CREATE TABLE IF NOT EXISTS strategy_state ("
        " athlete_id TEXT PRIMARY KEY REFERENCES athlete(id),"
        " weekly_frequency INTEGER NOT NULL DEFAULT 3,"
        " weekly_volume TEXT NOT NULL DEFAULT 'moderate',"
        " primary_focus TEXT,"
        " secondary_focus TEXT,"
        " updated_at TEXT NOT NULL)",
    ),
    (
        "preference_state",
        "CREATE TABLE IF NOT EXISTS preference_state ("
        " athlete_id TEXT NOT NULL REFERENCES athlete(id),"
        " exercise_family TEXT NOT NULL,"
        " preference_score REAL NOT NULL DEFAULT 50,"
        " updated_at TEXT NOT NULL,"
        " PRIMARY KEY (athlete_id, exercise_family))",
    ),
]

# (table, column, column-definition) — added only if absent.
_ADDITIONS = [
    ("recommendation", "replaced_from_exercise", "TEXT"),
    ("recommendation", "replace_reason",         "TEXT NOT NULL DEFAULT ''"),
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
    """Apply migration 004 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for _table, ddl in _NEW_TABLES:
        conn.execute(ddl)

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
