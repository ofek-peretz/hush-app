"""
Migration runner — the single ordered invocation path (Wave 1, ATD-13 / Audit MG2).

Before this module, each migration (002..006) was a standalone `apply()` / `already_applied()`
file with NO composing runner (Audit MG2: "I did not find one runner that composes 002->006 as
the single invocation path"); ad-hoc per-file invocation invited ordering mistakes. This module
is the one sanctioned way to bring an existing database forward, and the single source of truth
for *which migrations exist and in what order*.

It changes NO migration's logic. Each step is the unchanged module's own `apply()`, still
self-guarded by its own `already_applied()`. The runner only fixes the ORDER and provides one
entry point. It is orchestration only: additive, idempotent, no schema shape change, no model
behavior change.

CONCEPTUAL LOCATION: hush_model/persistence/migrations/runner.py.
"""
from __future__ import annotations
import sqlite3

from . import (
    migration_002_fatigue,
    migration_003_decision,
    migration_004_foundation,
    migration_005_composition,
    migration_006_instrumentation,
    migration_007_bodyweight,
    migration_008_session_progress,
    migration_009_stagnation,
    migration_010_infra,
    migration_011_erasure,
    migration_012_events,
    migration_013_offpolicy,
    migration_014_composition_audit,
    migration_015_preference_events,
    migration_016_week_plan,
)

# The ordered migration chain. SINGLE SOURCE OF TRUTH for the chain: the fresh-DB version
# stamp (db.py, ATD-12) and the schema-drift guard (ATD-8 test) both read it, so the three
# Wave-1 items can never disagree about which migrations exist.
MIGRATIONS = [
    migration_002_fatigue,
    migration_003_decision,
    migration_004_foundation,
    migration_005_composition,
    migration_006_instrumentation,
    migration_007_bodyweight,
    migration_008_session_progress,    # DX-11: event-driven session_progress accumulator (v8)
    migration_009_stagnation,          # DX-09: M5 stagnation_marker (anti-repetition cooldown) (v9)
    migration_010_infra,               # Wave 2 / B3: web-shell infra (idempotency_key, auth_token) (v10)
    migration_011_erasure,             # Wave 2 / OD-2: erasure_record tombstone (anonymized deletion) (v11)
    migration_012_events,              # Dataset: athlete_event durable research store (v12)
    migration_013_offpolicy,           # Calibration: off-policy sample on observation (v13)
    migration_014_composition_audit,   # Reconstruction: full composition audit on session (v14)
    migration_015_preference_events,   # Ownership: append-only athlete-preference event log (v15)
    migration_016_week_plan,           # Weekly Program Container: week entity + workout grouping (v16)
]

# The schema version a fresh SCHEMA_SQL database already embodies (the head of the chain).
# Single source for db.py's fresh-DB stamp and any "current version" question.
SCHEMA_VERSION = MIGRATIONS[-1].VERSION  # == 16


def migration_versions() -> list[int]:
    """The ordered VERSION numbers of the chain, e.g. [2, 3, 4, 5, 6]."""
    return [m.VERSION for m in MIGRATIONS]


def run_migrations(conn: sqlite3.Connection) -> list[int]:
    """Apply every migration in order on an existing database, each self-guarded by its own
    `already_applied()`. Returns the list of versions that actually did work (empty list on an
    already-current database). Idempotent: a second run is a no-op. Additive only — no migration
    logic is changed here, only sequenced behind one entry point."""
    applied: list[int] = []
    for m in MIGRATIONS:
        if m.apply(conn):
            applied.append(m.VERSION)
    return applied
