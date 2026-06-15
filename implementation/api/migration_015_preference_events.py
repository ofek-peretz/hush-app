"""
Migration 015 — the append-only athlete-preference event log (Program Ownership Contract).

Thin, idempotent, ADDITIVE-ONLY (migration_012 table-create shape). It adds ONE append-only table
that makes athlete-owned program structure durable, immutable, and reconstructable:

  preference_event(event_id PK, athlete_id, seq, server_ts, action, capability, slot_key,
                   from_exercise, to_exercise, payload, reason, source, created_at)

Why it exists: before this, an athlete's exercise preference lived ONLY in the mutable
`preference_state` projection (overwritten on every change — the preference TIMELINE was lost) and
the main client customization path persisted nothing server-side. This log is the SOURCE OF TRUTH
for every preference action (exercise pin/restore, substitute add/remove, backup define/remove,
exercise/workout reorder). `preference_state` becomes a derived cache; the current preferences are
a projection over this log (latest-wins per key), so the full evolution is reconstructable forever.

Design (mirrors athlete_event — research-grade, NOT model state):
  - APPEND-ONLY. Rows are never updated or deleted. Idempotent on `event_id` (exactly-once retry).
  - `seq` is a per-athlete monotonic order so replay is deterministic regardless of clock skew.
  - Joinable: athlete_id → recommendation/observation/athlete_event; from/to_exercise → catalog ids.
  - Nothing in the model READS this table directly; the projection feeds composition (a pin wins
    over model selection) and the learning dataset. No model number/formula/decision is changed.

A fresh database built from schema.py already has the table (drift guard ATD-8 parity); this brings
a v14 database forward. Empty until the first preference action, so every prior trajectory
reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_015_preference_events.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 15

# (table, create-ddl) — created only if absent. Must match schema.py exactly (drift guard ATD-8).
_NEW_TABLES = [
    (
        "preference_event",
        """
        CREATE TABLE IF NOT EXISTS preference_event (
            event_id        TEXT PRIMARY KEY,
            athlete_id      TEXT NOT NULL REFERENCES athlete(id),
            seq             INTEGER NOT NULL,
            server_ts       TEXT NOT NULL,
            action          TEXT NOT NULL,
            capability      TEXT,
            slot_key        TEXT,
            from_exercise   TEXT,
            to_exercise     TEXT,
            payload         TEXT NOT NULL DEFAULT '{}',
            reason          TEXT NOT NULL DEFAULT '',
            source          TEXT NOT NULL DEFAULT '',
            created_at      TEXT NOT NULL
        )
        """,
    ),
]

_NEW_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_pref_event_athlete ON preference_event(athlete_id, seq)",
    "CREATE INDEX IF NOT EXISTS ix_pref_event_action  ON preference_event(action)",
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
    """Apply migration 015 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for _table, ddl in _NEW_TABLES:
        conn.execute(ddl)
    for idx in _NEW_INDEXES:
        conn.execute(idx)

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
