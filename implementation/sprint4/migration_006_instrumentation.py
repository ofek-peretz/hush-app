"""
Migration 006 — Validation instrumentation (Sprint 4).

Thin, idempotent, ADDITIVE-ONLY migration (migration_005 shape). It adds the Phase 0 /
validation instruments to the immutable-history zone:

  shadow_recommendation : the A8 shadow-baseline paired comparison (ES-012 F.1). Per the
                          reoriented success basis (DX-12/DX-14) these rows now feed a
                          DIRECTIONAL model-quality diagnostic (the no-learning reps-prediction
                          counterfactual), not the load-prediction success test. Table/schema
                          unchanged — the reframe is in how the rows are read, not their shape.
  observation.override_category / override_target : A9 override-target logging (ES-010 B.1)

No new tables touch mutable state; no catalog table; no row rewrites. A fresh database built
from the updated schema.py already has these; this migration is for databases created under
v1-5. The instruments stay EMPTY / inert unless the harness (or, later, the live app) records
into them, so a migrated Sprint 3B-2 database is semantically unchanged and the 105 prior
trajectories reproduce bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_006_instrumentation.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 6

_NEW_TABLES = [
    (
        "shadow_recommendation",
        "CREATE TABLE IF NOT EXISTS shadow_recommendation ("
        " id TEXT PRIMARY KEY,"
        " recommendation_id TEXT REFERENCES recommendation(id),"
        " athlete_id TEXT NOT NULL REFERENCES athlete(id),"
        " capability TEXT NOT NULL,"
        " exercise TEXT NOT NULL,"
        " shadow_weight REAL NOT NULL,"
        " shadow_predicted_rtf REAL NOT NULL,"
        " model_predicted_rtf REAL NOT NULL,"
        " actual_reps INTEGER NOT NULL,"
        " week REAL NOT NULL,"
        " created_at TEXT NOT NULL)",
    ),
]

# (table, column, definition) — added only if absent. Must match schema.py exactly (MR1).
_ADDITIONS = [
    ("observation", "override_category", "TEXT NOT NULL DEFAULT ''"),
    ("observation", "override_target",   "REAL"),
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
    """Apply migration 006 if not already applied. Returns True if work was done."""
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
            continue
        if column not in _columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
