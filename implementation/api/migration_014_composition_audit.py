"""
Migration 014 — Complete the composition (candidate-selection) audit snapshot.

Thin, idempotent, ADDITIVE-ONLY (migration_006/007/013 column-add shape). The session already
persisted exploration_seed + session_index + weekly_frequency/volume + calibration_phase
(ES-009 §9). Those are NOT sufficient to REPLAY the candidate-selection decision years later:
the Stage-2 ordering and Stage-3 selection also depend on the athlete's strategy FOCUS at
composition time (a mutable projection with no history), and on which exercises EXISTED (the
catalog version — the candidate pool). This migration co-locates the rest of the snapshot on
the session so the composition is replayable from stored data ALONE:

  workout_session.primary_focus            : Stage-2/3 focus input (else lost — mutable strategy).
  workout_session.secondary_focus          : "
  workout_session.catalog_version          : the candidate POOL's version (which exercises existed).
  workout_session.model_version            : which composition code ran.
  workout_session.capability_model_version : which capability formulas ran.

No behavior change: nothing READS these (audit substrate, like athlete_event / the off-policy
sample). They are written by the composition path (SessionEngine.compose_and_open →
create_session), which the production event-driven runtime (SessionRuntime) reuses. A fresh
database built from schema.py already has them (drift guard ATD-8 parity); this brings a v13
database forward, backfilling existing rows to NULL — so every prior trajectory reproduces
bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_014_composition_audit.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 14

# (table, column, definition) — added only if absent. Must match schema.py exactly (MR1 / ATD-8).
_ADDITIONS = [
    ("workout_session", "primary_focus", "TEXT"),
    ("workout_session", "secondary_focus", "TEXT"),
    ("workout_session", "catalog_version", "TEXT"),
    ("workout_session", "model_version", "TEXT"),
    ("workout_session", "capability_model_version", "TEXT"),
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
    """Apply migration 014 if not already applied. Returns True if work was done."""
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
