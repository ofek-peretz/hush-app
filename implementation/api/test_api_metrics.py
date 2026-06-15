"""
Operator validation-export tests (BB-32 / BB-23 metrics) — GET /internal/metrics must surface the
trial's A7/A8/A9 evidence in an analyzable aggregate, behind the operator key, read-only, from
session one. The thresholds that turn this data into a pass/fail gate are OD-8 (not tested here —
this is the export path, not the verdict).

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_metrics.py.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app

OPERATOR_KEY = "op-secret-key"


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


def _enroll(client, athlete_id="ath_1", sex="male", experience="intermediate", bodyweight_kg=80.0):
    return client.post("/internal/athletes", headers=_op(), json={
        "athlete_id": athlete_id, "sex": sex, "age": 30,
        "experience": experience, "bodyweight_kg": bodyweight_kg}).json()["token"]


def _run_full_session(client, t, reps=8):
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


# ----------------------------- access control -----------------------------

def test_metrics_requires_operator_key(client):
    t = _enroll(client)
    assert client.get("/internal/metrics", headers=_h(t)).status_code == 401   # athlete token barred
    assert client.get("/internal/metrics").status_code == 401                   # no key
    assert client.get("/internal/metrics", headers=_op()).status_code == 200


# ----------------------------- empty DB is well-formed -----------------------------

def test_metrics_empty_db_is_zeroed_not_error(client):
    body = client.get("/internal/metrics", headers=_op()).json()
    assert body["trial_health"] == {
        "athletes": 0, "sessions": 0, "sessions_completed": 0, "observations": 0}
    assert body["a8_shadow_paired"]["n_pairs"] == 0
    assert body["a9_overrides"]["n_overrides"] == 0
    assert body["a7_first_session_by_cohort"] == {}
    assert "generated_at" in body


# ----------------------------- trial health + A8 + A7 from a real session -----------------------------

def test_metrics_capture_health_shadow_and_first_session(client):
    t = _enroll(client, "ath_1", sex="male", experience="intermediate")
    s = _run_full_session(client, t)
    body = client.get("/internal/metrics", headers=_op()).json()

    h = body["trial_health"]
    assert h["athletes"] == 1
    assert h["sessions"] >= 1 and h["sessions_completed"] >= 1
    assert h["observations"] > 0

    # A8: one shadow pair per observation, all scored
    a8 = body["a8_shadow_paired"]
    assert a8["n_pairs"] == h["observations"] > 0
    assert a8["model_mean_abs_err"] >= 0.0 and a8["shadow_mean_abs_err"] >= 0.0
    assert 0.0 <= a8["model_no_worse_than_shadow_frac"] <= 1.0

    # A7: the athlete's first session is bucketed under its cohort with per-capability loads
    a7 = body["a7_first_session_by_cohort"]
    assert "male/intermediate" in a7
    cell = a7["male/intermediate"]
    assert cell["n_athletes"] == 1
    assert cell["n_blocks"] == len(s["blocks"])
    assert 0.0 <= cell["first_rep_shortfall_frac"] <= 1.0
    for cap, pc in cell["per_capability"].items():
        assert pc["n"] >= 1
        assert pc["mean_weight"] > 0 and pc["max_weight"] >= pc["mean_weight"]


def test_metrics_segment_first_session_by_cohort(client):
    _run_full_session(client, _enroll(client, "m_int", sex="male", experience="intermediate"))
    _run_full_session(client, _enroll(client, "f_beg", sex="female", experience="beginner"))
    a7 = client.get("/internal/metrics", headers=_op()).json()["a7_first_session_by_cohort"]
    assert set(a7.keys()) == {"male/intermediate", "female/beginner"}
    assert a7["male/intermediate"]["n_athletes"] == 1
    assert a7["female/beginner"]["n_athletes"] == 1


# ----------------------------- A9 override capture -----------------------------

def test_metrics_capture_override_log(client):
    """An honest off-prescription load is auto-detected server-side as an A9 LOAD override (BB-7) and
    surfaces in the export — verbatim, with its target captured losslessly."""
    t = _enroll(client, "ath_ovr")
    s = client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    b = s["blocks"][0]
    heavier = b["recommended_weight"] + 5.0
    # a logged load that deviates from the prescription IS the A9 override (no extra fields — forbidden)
    r = client.post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": 5, "actual_weight": heavier})
    assert r.status_code in (200, 201), r.text
    a9 = client.get("/internal/metrics", headers=_op()).json()["a9_overrides"]
    assert a9["n_overrides"] >= 1
    assert a9["by_category"].get("LOAD", 0) >= 1
    assert 0.0 < a9["override_rate"] <= 1.0
    assert any(row["override_category"] == "LOAD" and row["override_target"] == heavier
               for row in a9["rows"])
