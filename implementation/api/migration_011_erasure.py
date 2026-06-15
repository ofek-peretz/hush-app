"""
Migration 011 — erasure tombstone (OD-2 right-to-erasure, ratified 2026-06-12).

Thin, idempotent, additive-only migration (migration_010 shape). It adds ONE infra table — the
auditable record that an athlete was logically erased (anonymized) and when. It is NOT model state
and lives OUTSIDE the two schema zones; it carries no model number/formula/decision.

  erasure_record(athlete_id PK, erased_at, method)

OD-2 (ratified): user deletion is **logical deletion / anonymization** — authentication data and the
precise personal identifiers are removed, while the append-only audit/history is **retained in
anonymized form** for operational/reconstruction/validation purposes. There is **no destructive
audit-chain deletion** in V1. This tombstone is the durable proof-of-erasure; the anonymization
itself is `HushService.erase_athlete` (it deletes auth, nulls precise metrics, keeps coarse cohort
labels the A7 validation needs, and writes a row here).

A fresh database built from the updated `schema.py` already has the table (drift guard ATD-8 compares
against `_NEW_TABLES`); this migration brings a v10 database forward. Empty until the first erasure,
so every prior trajectory reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_011_erasure.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 11

# (table, create-ddl) — created only if absent. Must match schema.py exactly (drift guard ATD-8).
_NEW_TABLES = [
    (
        "erasure_record",
        """
        CREATE TABLE IF NOT EXISTS erasure_record (
            athlete_id  TEXT PRIMARY KEY,
            erased_at   TEXT NOT NULL,
            method      TEXT NOT NULL
        )
        """,
    ),
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
    """Apply migration 011 if not already applied. Returns True if work was done."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version "
        "(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    if already_applied(conn):
        return False

    for _table, ddl in _NEW_TABLES:
        conn.execute(ddl)

    conn.execute(
        "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (?,?)",
        (VERSION, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return True
