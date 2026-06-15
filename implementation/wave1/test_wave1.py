"""
Wave 1 hygiene tests (ATD-13 / ATD-12 / ATD-8).

These guard the Pre-S5 migration/schema hygiene added in Wave 1: ORDERING + IDEMPOTENCY of
the single migration runner (ATD-13), fresh-DB version bookkeeping (ATD-12 / MG1), and
SCHEMA_SQL <-> migration-chain drift (ATD-8 / SR1). They assert STRUCTURE only — no number,
formula, trajectory, or column meaning is touched. The existing 125 tests remain the model-
behavior backstop.

CONCEPTUAL LOCATION: tests/test_wave1.py.
"""
from __future__ import annotations
import sqlite3

from hush_model.persistence.db import Database
from hush_model.persistence.migrations import runner
from hush_model.persistence.migrations.runner import (
    run_migrations, MIGRATIONS, SCHEMA_VERSION,
)


# ----------------------------- ATD-13: single ordered runner -----------------------------

def test_runner_chain_is_ordered_and_single_source():
    # the chain is the ascending VERSION sequence 2..14; SCHEMA_VERSION is its head.
    # (re-gold: +8 session_progress (DX-11), +9 stagnation_marker (DX-09), +10 web-shell infra,
    #  +11 erasure_record (OD-2 right-to-erasure), +12 athlete_event, +13 off-policy sample,
    #  +14 composition audit (replayable candidate-selection).)
    assert runner.migration_versions() == [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    assert [m.VERSION for m in MIGRATIONS] == sorted(m.VERSION for m in MIGRATIONS)
    assert SCHEMA_VERSION == 16


def test_runner_applies_in_order_and_is_idempotent():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    applied = run_migrations(conn)
    assert applied == [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]  # full chain, ascending
    versions = sorted(r[0] for r in conn.execute("SELECT version FROM schema_version"))
    assert versions == [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    assert run_migrations(conn) == []                       # idempotent: second run is a no-op
    conn.close()


# ----------------------------- ATD-12: fresh-DB version bookkeeping -----------------------------

def test_fresh_db_reports_full_schema_version():
    # Before ATD-12 a fresh DB had an EMPTY schema_version (MG1); now it records the full chain.
    db = Database(":memory:")
    versions = sorted(r[0] for r in db.conn.execute("SELECT version FROM schema_version"))
    assert versions == [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]   # re-gold: +16 week_plan
    db.close()


def test_runner_is_noop_on_fresh_db():
    # a fresh SCHEMA_SQL DB already embodies the chain and is stamped, so the runner does nothing.
    db = Database(":memory:")
    assert run_migrations(db.conn) == []
    db.close()


def test_fresh_db_stamp_does_not_overwrite_existing_versions():
    # the guard only stamps when schema_version is empty (a real migrated DB keeps its own rows).
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    run_migrations(conn)                                    # migrated path -> versions 2..7
    before = {(r["version"], r["applied_at"])
              for r in conn.execute("SELECT version, applied_at FROM schema_version")}
    from hush_model.persistence.db import _stamp_fresh_schema_version
    _stamp_fresh_schema_version(conn)                       # must be inert on a versioned DB
    after = {(r["version"], r["applied_at"])
             for r in conn.execute("SELECT version, applied_at FROM schema_version")}
    assert before == after
    conn.close()


# ----------------------------- ATD-8: schema-source drift guard -----------------------------

def test_schema_sql_embodies_every_migration_addition():
    """SR1 drift guard (assert/compare form): a fresh SCHEMA_SQL database must already contain
    every table and column the migration chain adds. A divergence (a migration column missing
    from schema.py, or vice versa) splits the fresh-vs-migrated shapes and fails here — the
    drift that was previously caught only by hand-sync + a single parity test."""
    db = Database(":memory:")

    def cols(table: str) -> set[str]:
        return {r[1] for r in db.conn.execute(f"PRAGMA table_info({table})")}

    tables = {r[0] for r in db.conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    for m in MIGRATIONS:
        for tname, _ddl in getattr(m, "_NEW_TABLES", []):
            assert tname in tables, f"{m.__name__}: SCHEMA_SQL missing table {tname!r}"
        for table, column, _coldef in getattr(m, "_ADDITIONS", []):
            assert column in cols(table), (
                f"{m.__name__}: SCHEMA_SQL missing {table}.{column} "
                f"(schema.py / migration-chain drift)")
    db.close()


# ----------------------------- DX-07: bodyweight capture (migration 007) -----------------------------

def _v6_like_athlete_conn() -> sqlite3.Connection:
    """A pre-DX-07 athlete table (no bodyweight_kg column)."""
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE athlete (id TEXT PRIMARY KEY, sex TEXT, age INTEGER, "
                 "experience TEXT, created_at TEXT)")
    return conn


def test_migration_007_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_007_bodyweight as m007
    conn = _v6_like_athlete_conn()
    assert m007.apply(conn) is True
    cols = {r[1] for r in conn.execute("PRAGMA table_info(athlete)")}
    assert "bodyweight_kg" in cols                              # column added
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 7
    assert m007.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


def test_dx07_bodyweight_round_trips_and_defaults_null():
    """onboard persists bodyweight; omission stores/reads NULL. Inert: no behavior asserted here."""
    from hush_model.persistence.service import HushService
    from hush_model.persistence.repositories import StateRepository
    db = Database(":memory:")
    svc = HushService(db)

    svc.onboard("a", "male", 30, "intermediate", bodyweight_kg=82.5)
    svc.onboard("b", "female", 28, "beginner")                  # bodyweight omitted -> NULL

    with db.transaction() as conn:
        sr = StateRepository(conn)
        assert sr.load_athlete_state("a").bodyweight_kg == 82.5
        assert sr.load_athlete_state("b").bodyweight_kg is None
    db.close()


# ----------------------------- DX-11: session_progress accumulator (migration 008) -----------------------------

def _v7_like_session_conn() -> sqlite3.Connection:
    """A pre-DX-11 DB (no session_progress table)."""
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE workout_session (id TEXT PRIMARY KEY, athlete_id TEXT, "
                 "status TEXT, week REAL, started_at TEXT, completed_at TEXT, created_at TEXT)")
    return conn


def test_migration_008_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_008_session_progress as m008
    conn = _v7_like_session_conn()
    assert m008.apply(conn) is True
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert "session_progress" in tables                        # infra table created
    cols = {r[1] for r in conn.execute("PRAGMA table_info(session_progress)")}
    assert {"workout_session_id", "capability", "entry_score", "s_obs", "decision_type",
            "recommended_weight", "have_primary", "updated_at"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 8
    assert m008.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


def test_migration_009_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_009_stagnation as m009
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    assert m009.apply(conn) is True
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert "stagnation_marker" in tables                        # infra table created
    cols = {r[1] for r in conn.execute("PRAGMA table_info(stagnation_marker)")}
    assert {"athlete_id", "capability", "last_surfaced_week", "last_surfaced_state",
            "updated_at"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 9
    assert m009.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


# ----------------------------- Wave 2 / B3: web-shell infra (migration 010) -----------------------------

def test_migration_010_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_010_infra as m010
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    assert m010.apply(conn) is True
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"idempotency_key", "auth_token"} <= tables          # both infra tables created
    idem_cols = {r[1] for r in conn.execute("PRAGMA table_info(idempotency_key)")}
    assert {"athlete_id", "client_event_id", "response_json", "created_at"} <= idem_cols
    tok_cols = {r[1] for r in conn.execute("PRAGMA table_info(auth_token)")}
    assert {"token_hash", "athlete_id", "created_at", "revoked_at"} <= tok_cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 10
    assert m010.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


# ----------------------------- Wave 2 / OD-2: erasure tombstone (migration 011) -----------------------------

def test_migration_011_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_011_erasure as m011
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    assert m011.apply(conn) is True
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert "erasure_record" in tables                           # tombstone table created
    cols = {r[1] for r in conn.execute("PRAGMA table_info(erasure_record)")}
    assert {"athlete_id", "erased_at", "method"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 11
    assert m011.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


def test_migration_012_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_012_events as m012
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    assert m012.apply(conn) is True
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "athlete_event" in tables                            # durable research store created
    cols = {r[1] for r in conn.execute("PRAGMA table_info(athlete_event)")}
    assert {"event_id", "athlete_id", "session_id", "type", "server_ts",
            "client_monotonic", "data"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 12
    assert m012.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


# ----------------------------- Calibration: off-policy sample (migration 013) -----------------------------

def _v12_like_observation_conn() -> sqlite3.Connection:
    """A pre-013 observation table (BB-7 shape: override cols, no off-policy sample cols)."""
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE observation (id TEXT PRIMARY KEY, capability TEXT, actual_reps INTEGER, "
        "actual_weight REAL, override_category TEXT NOT NULL DEFAULT '', override_target REAL, "
        "week REAL)")
    return conn


def test_migration_013_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_013_offpolicy as m013
    conn = _v12_like_observation_conn()
    assert m013.apply(conn) is True
    cols = {r[1] for r in conn.execute("PRAGMA table_info(observation)")}
    assert {"off_policy", "mu_decision", "sigma_decision", "predicted_reps_prescribed",
            "predicted_success", "capability_value"} <= cols
    # legacy columns are preserved (additive only)
    assert {"override_category", "override_target", "actual_weight"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 13
    assert m013.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


def test_fresh_vs_migrated_observation_columns_match_013():
    # the off-policy columns exist on a fresh SCHEMA_SQL DB AND a migrated one (no drift).
    new = {"off_policy", "mu_decision", "sigma_decision", "predicted_reps_prescribed",
           "predicted_success", "capability_value"}
    fresh = Database(":memory:")
    fresh_obs = {r[1] for r in fresh.conn.execute("PRAGMA table_info(observation)")}
    fresh.close()
    from hush_model.persistence.migrations import migration_013_offpolicy as m013
    migrated = _v12_like_observation_conn(); m013.apply(migrated)
    mig_obs = {r[1] for r in migrated.execute("PRAGMA table_info(observation)")}
    migrated.close()
    assert new <= fresh_obs and new <= mig_obs


# ----------------------------- Reconstruction: composition audit (migration 014) -----------------------------

def _v13_like_session_conn() -> sqlite3.Connection:
    """A pre-014 workout_session table (3B-2 audit shape: no focus/catalog/version cols)."""
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE workout_session (id TEXT PRIMARY KEY, athlete_id TEXT, status TEXT, "
        "week REAL, exploration_seed INTEGER, session_index INTEGER, weekly_frequency INTEGER, "
        "weekly_volume TEXT, calibration_phase INTEGER, created_at TEXT)")
    return conn


def test_migration_014_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_014_composition_audit as m014
    conn = _v13_like_session_conn()
    assert m014.apply(conn) is True
    cols = {r[1] for r in conn.execute("PRAGMA table_info(workout_session)")}
    assert {"primary_focus", "secondary_focus", "catalog_version", "model_version",
            "capability_model_version"} <= cols
    # legacy composition-audit columns preserved (additive only)
    assert {"exploration_seed", "session_index", "weekly_frequency", "calibration_phase"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 14
    assert m014.apply(conn) is False                           # idempotent: second apply is a no-op
    conn.close()


def test_fresh_vs_migrated_session_columns_match_014():
    new = {"primary_focus", "secondary_focus", "catalog_version", "model_version",
           "capability_model_version"}
    fresh = Database(":memory:")
    fresh_cols = {r[1] for r in fresh.conn.execute("PRAGMA table_info(workout_session)")}
    fresh.close()
    from hush_model.persistence.migrations import migration_014_composition_audit as m014
    migrated = _v13_like_session_conn(); m014.apply(migrated)
    mig_cols = {r[1] for r in migrated.execute("PRAGMA table_info(workout_session)")}
    migrated.close()
    assert new <= fresh_cols and new <= mig_cols


# ----------------------------- Ownership: preference_event log (migration 015) -----------------------------

def test_migration_015_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_015_preference_events as m015
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    assert m015.apply(conn) is True
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "preference_event" in tables                         # append-only ownership log created
    cols = {r[1] for r in conn.execute("PRAGMA table_info(preference_event)")}
    assert {"event_id", "athlete_id", "seq", "action", "capability",
            "from_exercise", "to_exercise", "payload"} <= cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 15
    assert m015.apply(conn) is False                            # idempotent: second apply is a no-op
    conn.close()


def test_fresh_has_preference_event_table_015():
    fresh = Database(":memory:")
    tables = {r[0] for r in fresh.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    fresh.close()
    assert "preference_event" in tables   # drift guard: fresh SCHEMA_SQL embodies the migration


# ----------------------------- Weekly Program Container (migration 016) -----------------------------

def test_migration_016_additive_and_idempotent():
    from hush_model.persistence.migrations import migration_016_week_plan as m016
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE workout_session (id TEXT PRIMARY KEY, status TEXT, week REAL)")  # pre-016
    assert m016.apply(conn) is True
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "week_plan" in tables
    ws_cols = {r[1] for r in conn.execute("PRAGMA table_info(workout_session)")}
    assert {"week_plan_id", "position_in_week"} <= ws_cols
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 16
    assert m016.apply(conn) is False                           # idempotent
    conn.close()


def test_fresh_has_week_plan_and_columns_016():
    fresh = Database(":memory:")
    tables = {r[0] for r in fresh.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    ws_cols = {r[1] for r in fresh.conn.execute("PRAGMA table_info(workout_session)")}
    fresh.close()
    assert "week_plan" in tables and {"week_plan_id", "position_in_week"} <= ws_cols
