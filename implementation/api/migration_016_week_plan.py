"""
Migration 016 — the Weekly Program Container.

Thin, idempotent, ADDITIVE-ONLY (table-create + column-add, the 012/013/014 shapes). It adds the
week entity the ratified weekly-program model needs, grouping N workouts into a week:

  week_plan(id PK, athlete_id, week_number, status[active|completed], weekly_frequency,
            weekly_volume, primary_focus, secondary_focus, catalog_version, model_version,
            capability_model_version, created_at, completed_at)
  workout_session += week_plan_id (FK), position_in_week

The model GENERATES a weekly plan of N workouts; the athlete completes them IN ANY ORDER; the week
completes only when ALL are done; then the system enters Rest and generates the NEXT week from the
completed week's data. The composition audit snapshot lives on the week (the planned + regenerated
unit). No model number/formula/decision changes — composition still produces the load-free blocks;
the week just groups + orders the sessions.

A fresh database built from schema.py already has the table + columns (drift guard ATD-8 parity);
this brings a v15 database forward. The legacy session-at-a-time path leaves week_plan_id /
position_in_week NULL, so every prior trajectory reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_016_week_plan.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 16

_NEW_TABLES = [
    (
        "week_plan",
        """
        CREATE TABLE IF NOT EXISTS week_plan (
            id                        TEXT PRIMARY KEY,
            athlete_id                TEXT NOT NULL REFERENCES athlete(id),
            week_number               INTEGER NOT NULL,
            status                    TEXT NOT NULL,
            weekly_frequency          INTEGER NOT NULL,
            weekly_volume             TEXT,
            primary_focus             TEXT,
            secondary_focus           TEXT,
            catalog_version           TEXT,
            model_version             TEXT,
            capability_model_version  TEXT,
            created_at                TEXT NOT NULL,
            completed_at              TEXT
        )
        """,
    ),
]

# Indexes on this migration's own table (always safe).
_NEW_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_week_plan_athlete ON week_plan(athlete_id, week_number)",
]
# Indexes on a pre-existing table — created only if that table exists (the migration runner
# applies on a bare connection where SCHEMA_SQL tables like workout_session are absent).
_TABLE_INDEXES = [
    ("workout_session", "CREATE INDEX IF NOT EXISTS ix_ws_week_plan ON workout_session(week_plan_id)"),
]

# (table, column, definition) — added only if absent. Must match schema.py exactly (ATD-8).
_ADDITIONS = [
    ("workout_session", "week_plan_id", "TEXT"),
    ("workout_session", "position_in_week", "INTEGER"),
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
    """Apply migration 016 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for _table, ddl in _NEW_TABLES:
        conn.execute(ddl)
    for table, column, coldef in _ADDITIONS:
        if _table_exists(conn, table) and column not in _columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")
    for idx in _NEW_INDEXES:
        conn.execute(idx)
    for table, idx in _TABLE_INDEXES:
        if _table_exists(conn, table):
            conn.execute(idx)

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
