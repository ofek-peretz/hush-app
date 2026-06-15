"""
Database connection and transactions (Sprint 1).

Single SQLite database. Foreign keys ON. WAL for concurrent reads. Provides a
transaction context manager used to make the learning chain atomic: observation,
evidence, and state update commit together or roll back together, which is what
keeps the audit chain's "every link present" guarantee true (System Architecture
invariant: the learning chain is synchronous and transactional).
"""
from __future__ import annotations
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .schema import SCHEMA_SQL


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stamp_fresh_schema_version(conn: sqlite3.Connection) -> None:
    """ATD-12 (Audit MG1): close the fresh-DB version-bookkeeping gap.

    `SCHEMA_SQL` CREATES `schema_version` but seeds no row, so a fresh, fully-v6-shaped DB
    reported *no* version — and the migration runner would then read every step as "not
    applied". A fresh DB built from `SCHEMA_SQL` already embodies the entire additive chain,
    so we stamp every chain version as applied: recorded state now matches actual shape, and
    the runner is a clean no-op on a fresh DB (fresh == fully-migrated, including version rows).

    Bookkeeping only — it inserts rows into the existing `schema_version` table; no schema
    shape, column meaning, or model behavior changes. Guarded so it never overwrites an
    existing record (a real migrated DB already carries its own version rows). The chain is
    read from the runner (ATD-13), the single source of truth for the migration set."""
    if conn.execute("SELECT 1 FROM schema_version LIMIT 1").fetchone() is not None:
        return  # already versioned (e.g. a migrated DB) — never overwrite
    from .migrations.runner import MIGRATIONS
    for m in MIGRATIONS:
        conn.execute(
            "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?,?)",
            (m.VERSION, now_iso()),
        )


class Database:
    def __init__(self, path: str = ":memory:"):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.executescript(SCHEMA_SQL)
        self._txn_depth = 0
        self._rollback_pending = False
        _stamp_fresh_schema_version(self.conn)  # ATD-12: record the fresh DB's version
        self.conn.commit()

    @contextmanager
    def transaction(self):
        """Atomic unit. Commits on success, rolls back on any exception.

        BB-9/BB-2 (re-entrant): nested `transaction()` calls join the OUTERMOST unit —
        only the outermost commits, and any exception anywhere in the nest rolls the
        WHOLE unit back. For every existing single-level caller (sim, golden tests) the
        depth goes 1→0, so behavior is byte-identical to the prior commit/rollback. The
        web shell's idempotency wrapper (BB-1) opens the outer transaction so the dedup
        record and the learning chain commit or roll back together (the cardinal
        exactly-once requirement) even though the pipeline primitives open their own
        (now-nested) transactions."""
        self._txn_depth += 1
        try:
            yield self.conn
        except Exception:
            self._rollback_pending = True
            raise
        finally:
            self._txn_depth -= 1
            if self._txn_depth == 0:
                if self._rollback_pending:
                    self.conn.rollback()
                    self._rollback_pending = False
                else:
                    self.conn.commit()

    def close(self) -> None:
        self.conn.close()
