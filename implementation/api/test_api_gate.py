"""
A7 week-1 seed-safety gate tests (BB-11). Two layers:

  * the PURE evaluator (`app.a7_gate.evaluate_a7_gate`) — verdict logic, no DB;
  * the live operator endpoint `GET /internal/gate/a7` — computed on real driven sessions.

The gate's THRESHOLDS are RATIFIED (OD-8, V1) and the gate is ARMED; these tests bind both the
*mechanism* (per-cohort verdict + PROCEED/PAUSE-AND-RE-ANCHOR + the hard-stop on any unsafe cohort)
and the ratified/armed status surfaced in the response.

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_gate.py.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app
from app.a7_gate import (
    evaluate_a7_gate, A7_THRESHOLDS_V1, A7_THRESHOLDS_STATUS,
    SAFE, UNSAFE, INSUFFICIENT_DATA, PROCEED, PAUSE_AND_REANCHOR, AWAIT_DATA,
)

OPERATOR_KEY = "op-secret-key"


# ----------------------------- pure evaluator -----------------------------

def test_evaluator_proceeds_when_all_safe():
    metrics = {"male/intermediate": {"n": 10, "completion_rate": 1.0, "first_rep_failure_rate": 0.0}}
    out = evaluate_a7_gate(metrics)
    assert out["overall"] == PROCEED
    assert out["cohorts"][0]["verdict"] == SAFE
    assert out["unsafe_cohorts"] == ()


def test_evaluator_pauses_on_any_unsafe_cohort():
    metrics = {
        "male/intermediate": {"n": 10, "completion_rate": 1.0, "first_rep_failure_rate": 0.0},   # SAFE
        "female/beginner":   {"n": 10, "completion_rate": 1.0, "first_rep_failure_rate": 0.05},  # UNSAFE (frf>0)
    }
    out = evaluate_a7_gate(metrics)
    assert out["overall"] == PAUSE_AND_REANCHOR
    assert "female/beginner" in out["unsafe_cohorts"]


def test_evaluator_unsafe_on_low_completion():
    metrics = {"male/older": {"n": 10, "completion_rate": 0.5, "first_rep_failure_rate": 0.0}}
    out = evaluate_a7_gate(metrics)
    assert out["overall"] == PAUSE_AND_REANCHOR
    assert out["cohorts"][0]["verdict"] == UNSAFE


def test_evaluator_insufficient_data_awaits():
    metrics = {"male/intermediate": {"n": 2, "completion_rate": 1.0, "first_rep_failure_rate": 0.0}}
    out = evaluate_a7_gate(metrics)
    assert out["cohorts"][0]["verdict"] == INSUFFICIENT_DATA
    assert out["overall"] == AWAIT_DATA


def test_evaluator_surfaces_ratified_armed_threshold_status():
    out = evaluate_a7_gate({})
    assert out["overall"] == AWAIT_DATA
    assert "RATIFIED" in out["thresholds_status"]
    assert out["thresholds_status"] == A7_THRESHOLDS_STATUS
    assert out["armed"] is True
    assert out["thresholds"] == A7_THRESHOLDS_V1
    # the ratified V1 values (OD-8)
    assert A7_THRESHOLDS_V1 == {"max_first_rep_failure_rate": 0.0,
                                "min_completion_rate": 0.80, "min_cohort_n": 5}


# ----------------------------- live endpoint -----------------------------

def _uid() -> str:
    return uuid.uuid4().hex


@pytest.fixture()
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "hush_test.db"), operator_key=OPERATOR_KEY)
    return TestClient(app)


def _op():
    return {"x-operator-key": OPERATOR_KEY}


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _enroll(client, athlete_id, sex="male", experience="intermediate"):
    return client.post("/internal/athletes", headers=_op(), json={
        "athlete_id": athlete_id, "sex": sex, "age": 30,
        "experience": experience, "bodyweight_kg": 80.0}).json()["token"]


def _run_first_session(client, t, reps=8):
    s = client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    seq = 0
    for b in s["blocks"]:
        for set_no in range(1, b["target_sets"] + 1):
            seq += 1
            client.post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
                "client_event_id": _uid(), "seq": seq, "block_id": b["id"],
                "set_number": set_no, "actual_reps": reps,
                "actual_weight": b["recommended_weight"]})
    client.post(f"/sessions/{s['id']}/complete", headers=_h(t), json={"client_event_id": _uid()})
    return s


def test_gate_requires_operator_key(client):
    t = _enroll(client, "a1")
    assert client.get("/internal/gate/a7", headers=_h(t)).status_code == 401
    assert client.get("/internal/gate/a7", headers=_op()).status_code == 200


def test_gate_awaits_data_then_proceeds(client):
    # one athlete: below min_cohort_n → AWAIT_DATA
    _run_first_session(client, _enroll(client, "a1"))
    out = client.get("/internal/gate/a7", headers=_op()).json()
    assert out["gate"] == "A7_week1_seed_safety"
    assert out["overall"] == AWAIT_DATA
    # enough completing athletes in one cohort, no first-rep failures → PROCEEDS
    for i in range(2, 2 + A7_THRESHOLDS_V1["min_cohort_n"]):
        _run_first_session(client, _enroll(client, f"a{i}"))
    out = client.get("/internal/gate/a7", headers=_op()).json()
    assert out["overall"] == PROCEED
    cell = next(c for c in out["cohorts"] if c["cohort"] == "male/intermediate")
    assert cell["verdict"] == SAFE
    assert cell["first_rep_failure_rate"] == 0.0


def test_gate_pauses_when_a_cohort_fails_first_rep(client):
    """A cohort with a day-1 first-rep failure (actual_reps == 0 at the prescribed load) flips the gate
    to PAUSE_AND_REANCHOR — the hard stop. Thresholds are RATIFIED (OD-8, V1); gate armed."""
    n = A7_THRESHOLDS_V1["min_cohort_n"]
    # a safe cohort
    for i in range(n):
        _run_first_session(client, _enroll(client, f"safe{i}", sex="male", experience="intermediate"))
    # an unsafe cohort: every athlete fails the first rep of their first set
    for i in range(n):
        t = _enroll(client, f"bad{i}", sex="female", experience="beginner")
        s = client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
        seq = 0
        for bi, b in enumerate(s["blocks"]):
            for set_no in range(1, b["target_sets"] + 1):
                seq += 1
                reps = 0 if (bi == 0 and set_no == 1) else 8   # first-rep failure on the opening set
                client.post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
                    "client_event_id": _uid(), "seq": seq, "block_id": b["id"],
                    "set_number": set_no, "actual_reps": reps,
                    "actual_weight": b["recommended_weight"]})
        client.post(f"/sessions/{s['id']}/complete", headers=_h(t), json={"client_event_id": _uid()})

    out = client.get("/internal/gate/a7", headers=_op()).json()
    assert out["overall"] == PAUSE_AND_REANCHOR
    assert "female/beginner" in out["unsafe_cohorts"]
    safe_cell = next(c for c in out["cohorts"] if c["cohort"] == "male/intermediate")
    assert safe_cell["verdict"] == SAFE
