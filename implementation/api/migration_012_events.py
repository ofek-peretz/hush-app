"""
Migration 012 — athlete_event (the durable research event store).

Thin, idempotent, additive-only (migration_010/011 shape). It adds ONE append-only table: an
immutable, queryable, joinable log of EVERY athlete/app interaction — the foundation of Hush's
long-term dataset advantage. It is NOT model state and carries no model number/formula/decision;
it is the research substrate the model is evaluated/retrained against later.

  athlete_event(event_id PK, athlete_id, session_id, type, server_ts, client_ts,
                client_monotonic, seq, app_version, os, device_id, locale, network, data)

Design intent (research dataset, NOT operational telemetry):
  - APPEND-ONLY. Rows are never updated or deleted (derived state is recomputed, never overwritten).
  - Idempotent on a client-generated `event_id` (exactly-once under retry).
  - Joinable: athlete_id → athlete/observation/recommendation; session_id → workout_session;
    data.block_id / data.recommendation_id → exercise_block / recommendation.
  - Dual clocks: server_ts (authoritative) + client_ts (wall) + client_monotonic (ordering immune
    to wall-clock skew) — so intra-session chronology is reconstructable forever.
  - `data` is a JSON payload of non-sensitive STRUCTURAL fields (ids/types/numbers/booleans).
  - Retained for the athlete lifetime; erasure (OD-2) anonymizes via the athlete pseudonym, so the
    behavioral trajectory is retained without PII — consistent with the audit-retention stance.

A fresh database built from `schema.py` already has the table (drift guard ATD-8 parity); this
migration brings a v11 database forward. Empty until the first event, so every prior trajectory
reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_012_events.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 12

# (table, create-ddl) — created only if absent. Must match schema.py exactly (drift guard ATD-8).
_NEW_TABLES = [
    (
        "athlete_event",
        """
        CREATE TABLE IF NOT EXISTS athlete_event (
            event_id          TEXT PRIMARY KEY,
            athlete_id        TEXT NOT NULL REFERENCES athlete(id),
            session_id        TEXT,
            type              TEXT NOT NULL,
            server_ts         TEXT NOT NULL,
            client_ts         TEXT,
            client_monotonic  REAL,
            seq               INTEGER,
            app_version       TEXT,
            os                TEXT,
            device_id         TEXT,
            locale            TEXT,
            network           TEXT,
            data              TEXT NOT NULL DEFAULT '{}'
        )
        """,
    ),
]

_NEW_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_event_athlete ON athlete_event(athlete_id, server_ts)",
    "CREATE INDEX IF NOT EXISTS ix_event_session ON athlete_event(session_id)",
    "CREATE INDEX IF NOT EXISTS ix_event_type    ON athlete_event(type)",
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
    """Apply migration 012 if not already applied. Returns True if work was done."""
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
