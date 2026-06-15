"""
Connection model (BB-9 / OC1 / ATD-20) — the one real production-shell gap.

As-built, one `Database` holds one shared `sqlite3.Connection` (correct for the sim and the
golden tests, unusable by a concurrent API as-is). This module is the **additive shell** the
audit (§11) sanctions — it changes no repository, pipeline, or model code; they already accept
the active connection. It provides:

  - **connection-per-request** (`open_connection`): a fresh SQLite connection with
    `foreign_keys=ON` and WAL set **per connection** (OC2), so concurrent requests get
    concurrent WAL readers. Wrapped in `RequestDatabase`, a `Database` look-alike (same `.conn`
    / re-entrant `.transaction()` / `.close()`) the pipeline/engines/`HushService` accept
    unchanged — it never re-runs `SCHEMA_SQL` (the file DB is already shaped/migrated).

  - **write serialization** (`write_serialized` / `WRITE_LOCK`): SQLite permits one writer.
    The single-writer invariant (ES-007) is preserved by serializing the learning-chain
    transaction behind a process-level lock. At ~100 users with sub-ms chains a single writer
    is ample (frozen architecture; no queue, no second datastore).

  - **schema/migration bootstrap** (`init_database`): create-or-bring-forward the file DB via
    the existing `SCHEMA_SQL` + Wave-1 single migration runner. A deploy step, not a worker.

Recommended topology (build plan §5.1 / §12 default): one process / one write worker with WAL
readers. No model/repository/schema-meaning change — purely how a connection is obtained and how
writes are ordered.

CONCEPTUAL LOCATION: app/connection.py (web shell, beside deps.py).
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager

from hush_model.persistence.db import Database, _stamp_fresh_schema_version
from hush_model.persistence.schema import SCHEMA_SQL
from hush_model.persistence.migrations.runner import run_migrations, SCHEMA_VERSION


# Process-level single-writer lock (ES-007 single-writer, preserved across connections).
WRITE_LOCK = threading.RLock()


def open_connection(path: str) -> sqlite3.Connection:
    """Open ONE per-request connection. PRAGMAs are set per connection (OC2): WAL for
    concurrent readers, foreign_keys ON for the ES-001 hierarchy guards. `check_same_thread`
    is left default — each request opens and uses its connection within one worker thread."""
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")  # bounded wait on SQLITE_BUSY (write contention)
    return conn


class RequestDatabase(Database):
    """A `Database` bound to an already-open per-request connection.

    Duck-types `Database` exactly (`.conn`, re-entrant `.transaction()`, `.close()`) so every
    existing consumer — `LearningPipeline`, `SessionEngine`, `SessionRuntime`, `HushService`,
    the repositories — works against it unchanged. It deliberately does NOT re-run `SCHEMA_SQL`
    (the durable DB is already shaped + migrated by `init_database`)."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self._txn_depth = 0
        self._rollback_pending = False


@contextmanager
def request_database(path: str):
    """Per-request `RequestDatabase`: open a connection, yield the wrapper, always close."""
    conn = open_connection(path)
    db = RequestDatabase(conn)
    try:
        yield db
    finally:
        db.close()


@contextmanager
def write_serialized():
    """Serialize the learning-chain write (single-writer invariant). Re-entrant so a handler
    that is already inside the lock (nested helpers) does not deadlock."""
    WRITE_LOCK.acquire()
    try:
        yield
    finally:
        WRITE_LOCK.release()


def init_database(path: str) -> int:
    """Create-or-bring-forward the durable file DB and return its schema version.

    A fresh file is built from `SCHEMA_SQL` (already embodies the full additive chain, stamped
    by ATD-12); an existing file is advanced by the Wave-1 single migration runner (idempotent,
    no-op when current). This is the deploy/startup step (`MIGRATION_RUNBOOK_V1.md`), never a
    background worker. Run after a tested backup (BB-3) in production."""
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.executescript(SCHEMA_SQL)        # CREATE IF NOT EXISTS — safe on an existing DB
        _stamp_fresh_schema_version(conn)     # stamp the chain on a brand-new file (inert otherwise)
        run_migrations(conn)                  # bring an older file forward (no-op when current)
        conn.commit()
    finally:
        conn.close()
    return SCHEMA_VERSION
