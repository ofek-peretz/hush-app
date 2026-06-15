"""
Production-migration verification + backup-gated migration tests (BB-5 / BB-3 mechanism).

These exercise the operator tooling that makes the migration runbook's rules executable:
schema-version + referential-integrity verification, a WAL-safe backup with a tested restore,
the populated-copy forward run, idempotency, and the structural "no migration without a backup"
refusal. The prod DB engine is SQLite, so this is a faithful production-migration rehearsal.

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_migrate.py.
"""
from __future__ import annotations

import sqlite3
import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app
from app.connection import init_database
from app.migrate import (
    verify_database, backup_database, restore_database, migrate_production,
    BackupRequiredError, run_cli,
)
from hush_model.persistence.migrations.runner import SCHEMA_VERSION

OPERATOR_KEY = "op-secret-key"


def _uid() -> str:
    return uuid.uuid4().hex


def _enroll(client, athlete_id):
    r = client.post("/internal/athletes", headers={"x-operator-key": OPERATOR_KEY},
                    json={"athlete_id": athlete_id, "sex": "male", "age": 30,
                          "experience": "intermediate", "bodyweight_kg": 80.0})
    return r.json()["token"]


def _populate(path):
    """Enroll + run one session so the DB carries real athlete history (a populated copy)."""
    app = create_app(db_path=path, operator_key=OPERATOR_KEY)
    client = TestClient(app)
    t = _enroll(client, "ath_1")
    s = client.post("/sessions", headers={"Authorization": f"Bearer {t}"},
                    json={"client_request_id": _uid()}).json()
    block = s["blocks"][0]
    client.post(f"/sessions/{s['id']}/sets", headers={"Authorization": f"Bearer {t}"},
                json={"client_event_id": _uid(), "seq": 1, "block_id": block["id"],
                      "set_number": 1, "actual_reps": 8,
                      "actual_weight": block["recommended_weight"]})
    return s["id"]


def _athlete_count(path) -> int:
    conn = sqlite3.connect(path)
    try:
        return conn.execute("SELECT COUNT(*) FROM athlete").fetchone()[0]
    finally:
        conn.close()


def _simulate_pre_v10(path):
    """Knock a fully-shaped DB back to a pre-migration-010 state (drop the v10 infra tables and
    its version row) so the forward chain has real work to do — a faithful 'older prod DB'."""
    conn = sqlite3.connect(path)
    try:
        conn.execute("DROP TABLE IF EXISTS idempotency_key")
        conn.execute("DROP TABLE IF EXISTS auth_token")
        conn.execute("DELETE FROM schema_version WHERE version = 10")
        conn.commit()
    finally:
        conn.close()


# ----------------------------- verify_database: the gate passes on a good DB -----------------------------

def test_verify_passes_on_fresh_init(tmp_path):
    path = str(tmp_path / "x.db")
    assert init_database(path) == SCHEMA_VERSION
    report = verify_database(path)
    assert report.ok, report.failed()
    assert report.schema_version == SCHEMA_VERSION
    names = {c.name for c in report.checks}
    assert {"schema_version_head", "chain_complete", "no_pending_migrations",
            "integrity_check", "foreign_key_check", "schema_shape_parity"} <= names


def test_verify_passes_on_populated_db(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    _populate(path)
    report = verify_database(path)
    assert report.ok, report.failed()


# ----------------------------- verify_database has teeth -----------------------------

def test_verify_detects_incomplete_chain(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    _simulate_pre_v10(path)  # an interior chain gap: migration 010 dropped, later versions still present
    report = verify_database(path)
    assert not report.ok
    failed = {c.name for c in report.failed()}
    # an interior gap is caught by chain-completeness + the still-pending migration (the head may be
    # higher than v10, so this asserts on the checks that an interior gap actually trips)
    assert "chain_complete" in failed
    assert "no_pending_migrations" in failed


def test_verify_detects_referential_integrity_violation(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    # insert an orphan auth_token (athlete_id REFERENCES athlete(id)) with FK enforcement OFF
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("INSERT INTO auth_token(token_hash, athlete_id, created_at, revoked_at) "
                     "VALUES ('h', 'ghost-athlete', 't', NULL)")
        conn.commit()
    finally:
        conn.close()
    report = verify_database(path)
    assert not report.ok
    fk = next(c for c in report.checks if c.name == "foreign_key_check")
    assert not fk.ok and "orphan" in fk.detail


def test_verify_detects_missing_table(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    conn = sqlite3.connect(path)
    try:
        conn.execute("DROP TABLE shadow_recommendation")  # a base SCHEMA_SQL table
        conn.commit()
    finally:
        conn.close()
    report = verify_database(path)
    assert not report.ok
    parity = next(c for c in report.checks if c.name == "schema_shape_parity")
    assert not parity.ok and "shadow_recommendation" in parity.detail


# ----------------------------- backup + tested restore (BB-3 mechanism) -----------------------------

def test_backup_is_valid_and_restore_round_trips(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    _enroll(TestClient(create_app(db_path=path, operator_key=OPERATOR_KEY)), "ath_keep")
    baseline = _athlete_count(path)
    assert baseline == 1

    backup_path = backup_database(path, str(tmp_path / "backups"))
    assert backup_path.endswith(".db")
    # the backup itself is a complete, verifiable database
    assert verify_database(backup_path).ok

    # mutate the live DB, then restore the backup over it
    _enroll(TestClient(create_app(db_path=path, operator_key=OPERATOR_KEY)), "ath_added")
    assert _athlete_count(path) == 2
    report = restore_database(backup_path, path)
    assert report.ok, report.failed()
    assert _athlete_count(path) == baseline  # restored to the snapshot


# ----------------------------- migrate_production: the sanctioned command -----------------------------

def test_migrate_forward_on_older_db_then_verifies(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    sid_count_before = _populate(path)  # real history at full shape
    _simulate_pre_v10(path)             # then knock back to pre-v10

    result = migrate_production(path, backup_dir=str(tmp_path / "backups"))
    assert result.ok, result.verify.failed()
    assert result.applied_versions == [10]          # exactly the missing delta applied
    assert result.backup_path is not None
    assert result.verify.schema_version == SCHEMA_VERSION
    assert _athlete_count(path) == 1                # populated data preserved across migration
    assert sid_count_before                          # (session was created)


def test_migrate_on_current_db_is_idempotent_noop(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    _populate(path)
    result = migrate_production(path, backup_dir=str(tmp_path / "backups"))
    assert result.ok
    assert result.applied_versions == []            # already current — nothing to do
    assert _athlete_count(path) == 1                # data intact


def test_no_migration_without_a_backup(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    _simulate_pre_v10(path)  # there IS pending work, so a missed migration would be observable

    # require_backup default True + no backup_dir => refuse BEFORE migrating
    with pytest.raises(BackupRequiredError):
        migrate_production(path, backup_dir=None)
    # the DB was left untouched (still pre-v10) — the refusal is structural, not advisory
    assert not verify_database(path).ok

    # a backup_dir that cannot be created (parent is a file) also refuses, still no migration
    blocker = tmp_path / "afile"
    blocker.write_text("x")
    with pytest.raises(BackupRequiredError):
        migrate_production(path, backup_dir=str(blocker / "nested"))
    assert not verify_database(path).ok


def test_migrate_production_refuses_missing_db(tmp_path):
    with pytest.raises(FileNotFoundError):
        migrate_production(str(tmp_path / "nope.db"), backup_dir=str(tmp_path / "b"))


# ----------------------------- operator CLI -----------------------------

def test_cli_verify_only_reports_status(tmp_path, capsys):
    path = str(tmp_path / "x.db")
    init_database(path)
    assert run_cli(["--db", path, "--verify-only"]) == 0

    _simulate_pre_v10(path)
    assert run_cli(["--db", path, "--verify-only"]) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out


def test_cli_migrate_refusal_without_backup_dir(tmp_path, capsys):
    path = str(tmp_path / "x.db")
    init_database(path)
    _simulate_pre_v10(path)
    rc = run_cli(["--db", path])  # no --backup-dir, backup required by default
    assert rc == 1
    assert "REFUSED" in capsys.readouterr().out
    assert not verify_database(path).ok  # not migrated
