"""
Right-to-erasure tests (OD-2, ratified 2026-06-12) — logical deletion / anonymization.

Bind the V1 erasure contract: authentication data + precise personal identifiers are removed and a
tombstone is written, while the append-only audit/history is RETAINED in anonymized form (no
destructive audit-chain deletion). The coarse cohort labels the A7 validation needs (sex/experience)
are kept; the precise identifiers (exact age, bodyweight) are nulled.

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_erasure.py.
"""
from __future__ import annotations

import sqlite3
import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app

OPERATOR_KEY = "op-secret-key"


def _uid() -> str:
    return uuid.uuid4().hex


@pytest.fixture()
def ctx(tmp_path):
    path = str(tmp_path / "hush_test.db")
    app = create_app(db_path=path, operator_key=OPERATOR_KEY)
    return TestClient(app), path


def _op():
    return {"x-operator-key": OPERATOR_KEY}


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _enroll(client, athlete_id="ath_1", sex="male", age=30, experience="intermediate", bw=80.0):
    return client.post("/internal/athletes", headers=_op(), json={
        "athlete_id": athlete_id, "sex": sex, "age": age,
        "experience": experience, "bodyweight_kg": bw}).json()["token"]


def _run_session(client, t):
    s = client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    for b in s["blocks"]:
        client.post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
            "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
            "actual_reps": 8, "actual_weight": b["recommended_weight"]})
    client.post(f"/sessions/{s['id']}/complete", headers=_h(t), json={"client_event_id": _uid()})
    return s["id"]


def _count(path, sql, args=()):
    conn = sqlite3.connect(path)
    try:
        return conn.execute(sql, args).fetchone()[0]
    finally:
        conn.close()


# ----------------------------- access control -----------------------------

def test_erase_requires_operator_key(ctx):
    client, _ = ctx
    t = _enroll(client)
    assert client.post("/internal/athletes/ath_1/erase", headers=_h(t)).status_code == 401
    assert client.post("/internal/athletes/ath_1/erase", headers=_op()).status_code == 200


def test_erase_unknown_athlete_404(ctx):
    client, _ = ctx
    r = client.post("/internal/athletes/nobody/erase", headers=_op())
    assert r.status_code == 404


# ----------------------------- authentication removed -----------------------------

def test_erase_removes_auth_and_blocks_further_use(ctx):
    client, _ = ctx
    t = _enroll(client)
    # token works before erasure (session create → 201)
    assert client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).status_code == 201
    r = client.post("/internal/athletes/ath_1/erase", headers=_op())
    assert r.status_code == 200 and r.json()["tokens_removed"] >= 1
    # token authenticates to nothing afterwards
    assert client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).status_code == 401


def test_erase_removes_idempotency_keys(ctx):
    client, path = ctx
    t = _enroll(client)
    _run_session(client, t)  # set reports + complete record idempotency keys for the athlete
    assert _count(path, "SELECT COUNT(*) FROM idempotency_key WHERE athlete_id=?", ("ath_1",)) > 0
    client.post("/internal/athletes/ath_1/erase", headers=_op())
    assert _count(path, "SELECT COUNT(*) FROM idempotency_key WHERE athlete_id=?", ("ath_1",)) == 0


# ----------------------------- anonymization of identifiers -----------------------------

def test_erase_redacts_precise_identifiers_keeps_cohort_labels(ctx):
    client, path = ctx
    _enroll(client, age=42, bw=93.5, sex="female", experience="beginner")
    client.post("/internal/athletes/ath_1/erase", headers=_op())
    conn = sqlite3.connect(path); conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT * FROM athlete WHERE id=?", ("ath_1",)).fetchone()
    finally:
        conn.close()
    assert row is not None                     # row retained (FK spine + retention basis)
    assert row["age"] == 0                      # precise identifier nulled
    assert row["bodyweight_kg"] is None         # precise identifier nulled
    assert row["sex"] == "female"               # coarse cohort label kept (A7 needs it)
    assert row["experience"] == "beginner"      # coarse cohort label kept
    assert row["created_at"]                     # retention basis kept


# ----------------------------- audit/history retained (no destructive deletion) -----------------------------

def test_erase_retains_audit_history(ctx):
    client, path = ctx
    t = _enroll(client)
    sid = _run_session(client, t)
    obs_before = _count(path, "SELECT COUNT(*) FROM observation WHERE athlete_id=?", ("ath_1",))
    cap_before = _count(path, "SELECT COUNT(*) FROM capability_state WHERE athlete_id=?", ("ath_1",))
    sul_before = _count(path, "SELECT COUNT(*) FROM state_update_log WHERE athlete_id=?", ("ath_1",))
    assert obs_before > 0 and cap_before > 0

    client.post("/internal/athletes/ath_1/erase", headers=_op())

    # immutable history is untouched — anonymized, not destroyed
    assert _count(path, "SELECT COUNT(*) FROM observation WHERE athlete_id=?", ("ath_1",)) == obs_before
    assert _count(path, "SELECT COUNT(*) FROM capability_state WHERE athlete_id=?", ("ath_1",)) == cap_before
    assert _count(path, "SELECT COUNT(*) FROM state_update_log WHERE athlete_id=?", ("ath_1",)) == sul_before
    # and the audit chain still reconstructs for the retained (now-anonymized) session
    assert client.get(f"/internal/audit/sessions/{sid}", headers=_op()).status_code == 200


# ----------------------------- tombstone + idempotency -----------------------------

def test_erase_writes_tombstone(ctx):
    client, path = ctx
    _enroll(client)
    out = client.post("/internal/athletes/ath_1/erase", headers=_op()).json()
    assert out["method"] == "logical_anonymization"
    assert out["audit_history_retained"] is True
    assert out["precise_identifiers_redacted"] is True
    conn = sqlite3.connect(path); conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT * FROM erasure_record WHERE athlete_id=?", ("ath_1",)).fetchone()
    finally:
        conn.close()
    assert row is not None and row["method"] == "logical_anonymization" and row["erased_at"]


def test_erase_is_idempotent(ctx):
    client, _ = ctx
    _enroll(client)
    first = client.post("/internal/athletes/ath_1/erase", headers=_op())
    assert first.status_code == 200 and first.json()["tokens_removed"] >= 1
    second = client.post("/internal/athletes/ath_1/erase", headers=_op())
    assert second.status_code == 200                      # still found (row retained) — re-stamps
    assert second.json()["tokens_removed"] == 0           # nothing left to remove
