"""
Migration 005 — Session Composition audit (Sprint 3B-2).

Thin, idempotent, ADDITIVE-ONLY migration (same shape as migration_004_foundation). It
adds the ES-009 composition-audit columns to the two immutable-history tables:

  workout_session : exploration_seed, session_index, weekly_frequency, weekly_volume,
                    calibration_phase   (the snapshot that makes a composed session
                                         self-describing — ES-009 §9 reconstructability)
  exercise_block  : selection_reason    ("why this exercise")

No new tables, no catalog table (the catalog stays code-resident), no row rewrites. Every
added column is NULL / '' on existing rows, so a Sprint 3B-1 database migrates with ZERO
semantic change: the single-block trajectories are untouched and a session composed before
3B-2 simply carries no seed (it had no exploration). A fresh database built from the updated
schema.py already has these columns; this migration is for databases created under v1–4.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_005_composition.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 5

# (table, column, column-definition) — added only if absent. Must match schema.py exactly
# (MR1: fresh-vs-migrated column parity), with inert defaults (MR2).
_ADDITIONS = [
    ("workout_session", "exploration_seed",  "INTEGER"),
    ("workout_session", "session_index",     "INTEGER"),
    ("workout_session", "weekly_frequency",  "INTEGER"),
    ("workout_session", "weekly_volume",     "TEXT"),
    ("workout_session", "calibration_phase", "INTEGER"),
    ("exercise_block",  "selection_reason",  "TEXT NOT NULL DEFAULT ''"),
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
    """Apply migration 005 if not already applied. Returns True if work was done."""
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
