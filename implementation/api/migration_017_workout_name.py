"""
Migration 017 — stable, structure-derived workout NAMES.

Thin, idempotent, ADDITIVE-ONLY (column-add, the 012/013/014/016 shape). It adds the workout name
the founder decision requires ("workout names are required; 'Today' is not a workout name"):

  workout_session += name   -- e.g. "Upper A", "Lower B", "Full Body A"

The name is a PURE function of the workout's structural identity — its template index within the
frequency split (template_index = session_index % weekly_frequency) — so it is invariant across
weekly regeneration and athlete reordering (which moves position_in_week, never the template/
capability frame). Both inputs are already persisted on every post-3B-2 row (the §9 / migration-014
composition audit), so EXISTING rows are backfilled deterministically here; rows missing the audit
fields (pre-3B-2) keep NULL and are named at next composition.

A fresh database built from schema.py already has the column (drift guard ATD-8 parity); this
brings a v16 database forward. No model number/formula/decision changes — the name is derived from
the frozen Class-A templates, not computed by the model.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_017_workout_name.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 17

# (table, column, definition) — added only if absent. Must match schema.py exactly (ATD-8).
_ADDITIONS = [
    ("workout_session", "name", "TEXT"),
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


def _backfill_names(conn: sqlite3.Connection) -> None:
    """Name every existing workout_session that carries the audit fields needed to derive it
    deterministically (session_index + weekly_frequency). Idempotent: only fills NULL names."""
    # Lazy import: the naming function lives with the composition authority; importing here keeps
    # the migration's module-load cost zero on databases that have no rows to backfill.
    from hush_model.composition import workout_name

    rows = conn.execute(
        "SELECT id, session_index, weekly_frequency FROM workout_session "
        "WHERE name IS NULL AND session_index IS NOT NULL AND weekly_frequency IS NOT NULL "
        "AND weekly_frequency > 0"
    ).fetchall()
    for r in rows:
        idx = r["session_index"] if isinstance(r, sqlite3.Row) else r[1]
        freq = r["weekly_frequency"] if isinstance(r, sqlite3.Row) else r[2]
        rid = r["id"] if isinstance(r, sqlite3.Row) else r[0]
        name = workout_name(freq, idx % freq)
        conn.execute("UPDATE workout_session SET name=? WHERE id=?", (name, rid))


def apply(conn: sqlite3.Connection) -> bool:
    """Apply migration 017 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for table, column, coldef in _ADDITIONS:
        if _table_exists(conn, table) and column not in _columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")
    if _table_exists(conn, "workout_session"):
        _backfill_names(conn)

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
