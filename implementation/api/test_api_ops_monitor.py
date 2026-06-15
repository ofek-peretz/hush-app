"""
Operational monitor tests (BB-27 watcher; operationalizes the BB-11 A7 gate). Two layers:

  * the PURE evaluators (`check_health` / `check_a7_gate` / `check_metrics`) — severity logic, no I/O;
  * the live monitor end-to-end over an in-process TestClient (`ClientGetter`), including the
    safety-critical path: a cohort with a day-1 first-rep failure flips the A7 gate to
    PAUSE_AND_REANCHOR, which the monitor must grade CRITICAL with exit code 2.

The monitor must never re-decide a model gate — it reads the gate verdict and grades operational
severity. These tests pin that: the A7 hard stop is CRITICAL, a healthy trial is OK, transport
failure degrades to CRITICAL (never raises), and a bad/absent operator key is CRITICAL (denied).

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_ops_monitor.py.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app
from app.ops_monitor import (
    Resp, Finding, MonitorConfig, ClientGetter,
    check_health, check_a7_gate, check_metrics, run_monitor, build_report, worst,
    OK, WARN, CRITICAL,
)

OPERATOR_KEY = "op-secret-key"


# ----------------------------- pure: severity plumbing -----------------------------

def test_worst_picks_highest_severity():
    assert worst([OK, OK]) == OK
    assert worst([OK, WARN]) == WARN
    assert worst([WARN, CRITICAL, OK]) == CRITICAL
    assert worst([]) == OK


def test_build_report_exit_codes():
    assert build_report([Finding("x", OK, "")])["exit_code"] == 0
    assert build_report([Finding("x", OK, ""), Finding("y", WARN, "")])["exit_code"] == 1
    assert build_report([Finding("x", CRITICAL, ""), Finding("y", OK, "")])["exit_code"] == 2


# ----------------------------- pure: health -----------------------------

def test_health_ok():
    f = check_health(Resp(200, {"status": "ok", "schema_version": 11}))
    assert f.severity == OK and f.detail["schema_version"] == 11


def test_health_unreachable_is_critical():
    f = check_health(Resp(0, {}, error="connection refused"))
    assert f.severity == CRITICAL and "unreachable" in f.summary


def test_health_bad_status_is_critical():
    assert check_health(Resp(503, {})).severity == CRITICAL
    assert check_health(Resp(200, {"status": "degraded"})).severity == CRITICAL


# ----------------------------- pure: A7 gate (the hard stop) -----------------------------

def test_a7_pause_and_reanchor_is_critical():
    f = check_a7_gate(Resp(200, {
        "overall": "PAUSE_AND_REANCHOR", "armed": True,
        "unsafe_cohorts": ["female/beginner"], "thresholds_status": "RATIFIED"}))
    assert f.severity == CRITICAL
    assert "HARD STOP" in f.summary
    assert f.detail["unsafe_cohorts"] == ["female/beginner"]


def test_a7_proceed_and_await_data_are_ok():
    assert check_a7_gate(Resp(200, {"overall": "PROCEED", "armed": True})).severity == OK
    assert check_a7_gate(Resp(200, {"overall": "AWAIT_DATA", "armed": True})).severity == OK


def test_a7_not_armed_is_warn():
    f = check_a7_gate(Resp(200, {"overall": "PROCEED", "armed": False}))
    assert f.severity == WARN and "not armed" in f.summary.lower()


def test_a7_denied_operator_access_is_critical():
    assert check_a7_gate(Resp(401, {})).severity == CRITICAL
    assert check_a7_gate(Resp(0, {}, error="timeout")).severity == CRITICAL


# ----------------------------- pure: metrics -----------------------------

def test_metrics_nominal_is_ok():
    f = check_metrics(Resp(200, {
        "trial_health": {"athletes": 5},
        "a9_overrides": {"override_rate": 0.10, "n_overrides": 2}}), MonitorConfig())
    assert f.severity == OK


def test_metrics_override_spike_is_warn():
    f = check_metrics(Resp(200, {
        "trial_health": {"athletes": 5},
        "a9_overrides": {"override_rate": 0.40}}), MonitorConfig(override_rate_warn=0.25))
    assert f.severity == WARN and "override rate" in f.summary


def test_metrics_expect_data_empty_is_warn():
    f = check_metrics(Resp(200, {"trial_health": {"athletes": 0}}),
                      MonitorConfig(expect_data=True))
    assert f.severity == WARN
    # without expect_data, an empty trial is fine (OK)
    assert check_metrics(Resp(200, {"trial_health": {"athletes": 0}}), MonitorConfig()).severity == OK


def test_metrics_denied_is_critical():
    assert check_metrics(Resp(403, {}), MonitorConfig()).severity == CRITICAL


# ----------------------------- live: end-to-end over the real app -----------------------------

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


def _run_first_session(client, t, fail_first_rep=False):
    s = client.post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    seq = 0
    for bi, b in enumerate(s["blocks"]):
        for set_no in range(1, b["target_sets"] + 1):
            seq += 1
            reps = 0 if (fail_first_rep and bi == 0 and set_no == 1) else 8
            client.post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
                "client_event_id": _uid(), "seq": seq, "block_id": b["id"],
                "set_number": set_no, "actual_reps": reps,
                "actual_weight": b["recommended_weight"]})
    client.post(f"/sessions/{s['id']}/complete", headers=_h(t), json={"client_event_id": _uid()})
    return s


def test_monitor_all_ok_on_healthy_trial(client):
    # one safe cohort big enough to PROCEED, no first-rep failures
    for i in range(5):
        _run_first_session(client, _enroll(client, f"a{i}"))
    report = run_monitor(ClientGetter(client, OPERATOR_KEY))
    assert report["overall"] == OK
    assert report["exit_code"] == 0
    by_check = {f["check"]: f for f in report["findings"]}
    assert by_check["health"]["severity"] == OK
    assert by_check["a7_gate"]["severity"] == OK
    assert by_check["a7_gate"]["detail"]["overall"] == "PROCEED"


def test_monitor_critical_on_a7_hard_stop(client):
    """The safety-critical end-to-end: an unsafe cohort (day-1 first-rep failure) drives the live
    /internal/gate/a7 to PAUSE_AND_REANCHOR, and the monitor escalates to CRITICAL / exit 2."""
    for i in range(5):
        _run_first_session(client, _enroll(client, f"safe{i}", sex="male", experience="intermediate"))
    for i in range(5):
        _run_first_session(client, _enroll(client, f"bad{i}", sex="female", experience="beginner"),
                           fail_first_rep=True)

    report = run_monitor(ClientGetter(client, OPERATOR_KEY))
    assert report["overall"] == CRITICAL
    assert report["exit_code"] == 2
    a7 = next(f for f in report["findings"] if f["check"] == "a7_gate")
    assert a7["severity"] == CRITICAL
    assert "female/beginner" in a7["detail"]["unsafe_cohorts"]
    assert "HARD STOP" in a7["summary"]


def test_monitor_critical_without_operator_key(client):
    # no operator key → /internal/* denied → CRITICAL (the monitor can't see the gate = page someone)
    report = run_monitor(ClientGetter(client, None))
    assert report["overall"] == CRITICAL
    assert report["exit_code"] == 2
    a7 = next(f for f in report["findings"] if f["check"] == "a7_gate")
    assert a7["severity"] == CRITICAL


def test_monitor_transport_failure_degrades_not_raises():
    class Boom:
        def get(self, path, headers=None):
            raise ConnectionError("no route to host")

    report = run_monitor(ClientGetter(Boom(), OPERATOR_KEY))
    assert report["overall"] == CRITICAL
    assert all(f["severity"] == CRITICAL for f in report["findings"])
