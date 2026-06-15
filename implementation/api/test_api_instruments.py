"""
Request-path instrument tests (BB-10 / BB-12) — the trial's evidence must capture from session
one: A8 shadow baseline beside every recommendation, A9 override on deviation (covered in
test_api_core), and a COMPLETE `reconstruct_session` for every block (a session that cannot be
reconstructed is invalid, ES-009 §9).

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_instruments.py.
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
    db_path = str(tmp_path / "hush_test.db")
    app = create_app(db_path=db_path, operator_key=OPERATOR_KEY)
    return {"client": TestClient(app), "db_path": db_path}


def _enroll(client, athlete_id="ath_1"):
    return client.post("/internal/athletes", headers={"x-operator-key": OPERATOR_KEY},
                       json={"athlete_id": athlete_id, "sex": "male", "age": 30,
                             "experience": "intermediate", "bodyweight_kg": 80.0}).json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _run_full_session(client, t):
    s = client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    seq = 0
    for b in s["blocks"]:
        for set_no in range(1, b["target_sets"] + 1):
            seq += 1
            client.post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
                "client_event_id": _uid(), "seq": seq, "block_id": b["id"],
                "set_number": set_no, "actual_reps": 8, "actual_weight": b["recommended_weight"]})
    return s


# ----------------------------- A8 shadow baseline (BB-10) -----------------------------

def test_shadow_baseline_captured_per_set(ctx):
    t = _enroll(ctx["client"])
    s = _run_full_session(ctx["client"], t)
    conn = sqlite3.connect(ctx["db_path"])
    try:
        n_shadow = conn.execute("SELECT COUNT(*) FROM shadow_recommendation").fetchone()[0]
        n_obs = conn.execute("SELECT COUNT(*) FROM observation").fetchone()[0]
        # one shadow row per reported set (paired with each model recommendation/observation)
        assert n_shadow == n_obs and n_shadow > 0
        # every shadow row is linked to a real recommendation and an active capability
        rows = conn.execute(
            "SELECT recommendation_id, capability, shadow_weight FROM shadow_recommendation"
        ).fetchall()
        for rec_id, cap, sw in rows:
            assert rec_id is not None
            assert cap in {"horizontal_push", "horizontal_pull", "vertical_push",
                           "knee_dominant", "hip_dominant"}
            assert sw > 0
    finally:
        conn.close()


def test_shadow_progresses_on_completed_prescription(ctx):
    """The fixed counterfactual seeds from the model load, then +increment when the prescription
    is met — verified across sets of one exercise."""
    t = _enroll(ctx["client"])
    s = ctx["client"].post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    b = s["blocks"][0]
    if b["target_sets"] < 2:
        pytest.skip("needs a multi-set block")
    for set_no in range(1, b["target_sets"] + 1):
        ctx["client"].post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
            "client_event_id": _uid(), "seq": set_no, "block_id": b["id"],
            "set_number": set_no, "actual_reps": b["target_reps"] + 2,  # beats prescription
            "actual_weight": b["recommended_weight"]})
    conn = sqlite3.connect(ctx["db_path"])
    try:
        weights = [r[0] for r in conn.execute(
            "SELECT shadow_weight FROM shadow_recommendation WHERE exercise=? ORDER BY created_at",
            (b["exercise"],))]
    finally:
        conn.close()
    assert weights[-1] > weights[0]  # progressed under the fixed linear rule


# ----------------------------- reconstruct_session completeness (BB-12) -----------------------------

def test_reconstruct_session_complete_for_every_block(ctx):
    t = _enroll(ctx["client"])
    s = _run_full_session(ctx["client"], t)
    audit = ctx["client"].get(f"/internal/audit/sessions/{s['id']}",
                              headers={"x-operator-key": OPERATOR_KEY})
    assert audit.status_code == 200, audit.text
    body = audit.json()
    assert body["session"]["id"] == s["id"]
    assert len(body["blocks"]) == len(s["blocks"])
    for blk in body["blocks"]:
        # every block traces to composition + recommendation + shadow + observation (ES-009 §9)
        assert blk["recommendations"], "missing recommendation"
        assert blk["observations"], "missing observation"
        assert blk["shadow"], "missing shadow baseline"


def test_audit_surface_requires_operator_key(ctx):
    t = _enroll(ctx["client"])
    s = ctx["client"].post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    # athlete bearer token has no path into the operator surface (contract §16A)
    assert ctx["client"].get(f"/internal/audit/sessions/{s['id']}", headers=_h(t)).status_code == 401
