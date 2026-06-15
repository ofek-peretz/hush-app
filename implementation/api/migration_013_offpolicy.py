"""
Migration 013 — Off-policy calibration sample on the observation.

Thin, idempotent, ADDITIVE-ONLY migration (migration_006/007 column-add shape). It materializes
the decision-time model state alongside the realized outcome so an OVERRIDE (and, more generally,
any logged set) becomes a self-contained off-policy calibration sample — usable later for
probability calibration and model improvement, not merely recorded as "an override happened".

Before this, an override captured `override_category` / `override_target` (BB-7) and the decision
state was reconstructable only by joining recommendation + observation + evidence + state_update_log.
This co-locates the calibration tuple on the observation row:

  observation.off_policy                : 1 iff the logged load deviated from the prescription.
  observation.mu_decision               : latent capability score μ at decision time (score_before).
  observation.sigma_decision            : decision-time uncertainty σ (sqrt recent variance; 0 cold).
  observation.predicted_reps_prescribed : model's predicted reps-to-failure at the PRESCRIBED load.
  observation.predicted_success         : the model's success expectation for the prescription.
  observation.capability_value          : observed capability-space value s_obs for this capability.

No behavior change: nothing in the model READS these columns (they are a research/calibration
substrate, like athlete_event). The columns are written only by the production learning path
(report_set_fatigue_aware); every Sprint 0-2 caller leaves them NULL/0. A fresh database built from
the updated schema.py already has them (drift guard ATD-8 parity); this brings a v12 database
forward, backfilling existing rows to NULL/0 — so every prior trajectory reproduces bit-for-bit.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/migration_013_offpolicy.py.
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone

VERSION = 13

# (table, column, definition) — added only if absent. Must match schema.py exactly (MR1 / ATD-8).
_ADDITIONS = [
    ("observation", "off_policy", "INTEGER NOT NULL DEFAULT 0"),
    ("observation", "mu_decision", "REAL"),
    ("observation", "sigma_decision", "REAL"),
    ("observation", "predicted_reps_prescribed", "REAL"),
    ("observation", "predicted_success", "REAL"),
    ("observation", "capability_value", "REAL"),
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
    """Apply migration 013 if not already applied. Returns True if work was done."""
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
