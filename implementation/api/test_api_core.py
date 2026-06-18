"""
API core tests (BB-14 + BB-1/2/4/6/7/8/19/24) — the web shell and its contract, under pytest
against the assembled `app/` + `hush_model/` (build plan §12). The model itself is NOT re-tested
(the golden runner is its backstop); these cover the boundary the model never had: HTTP, auth,
idempotency, input bounds, version stamping, override capture, and the lifecycle e2e.

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_core.py.
"""
from __future__ import annotations

import json
import sqlite3
import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app
from app.routers.reads import _derive_forecasts
from hush_model.persistence.db import Database
from hush_model.persistence.repositories import SessionRepository, LearningRepository
from hush_model.persistence.service import HushService
from hush_model.domain import Recommendation, Observation

OPERATOR_KEY = "op-secret-key"


@pytest.fixture()
def ctx(tmp_path):
    db_path = str(tmp_path / "hush_test.db")
    app = create_app(db_path=db_path, operator_key=OPERATOR_KEY)
    client = TestClient(app)
    return {"client": client, "db_path": db_path}


def _uid() -> str:
    return uuid.uuid4().hex


def enroll(client, athlete_id="ath_1", sex="male", age=30, experience="intermediate", bw=82.5):
    r = client.post(
        "/internal/athletes",
        headers={"x-operator-key": OPERATOR_KEY},
        json={"athlete_id": athlete_id, "sex": sex, "age": age,
              "experience": experience, "bodyweight_kg": bw},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def count_observations(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute("SELECT COUNT(*) FROM observation").fetchone()[0]
    finally:
        conn.close()


# ----------------------------- enrollment / auth (BB-19/20/24) -----------------------------

def test_enroll_requires_operator_key(ctx):
    r = ctx["client"].post("/internal/athletes", json={
        "athlete_id": "x", "sex": "male", "age": 30, "experience": "intermediate"})
    assert r.status_code == 401


def test_missing_token_is_401(ctx):
    r = ctx["client"].get("/profile")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"


def test_invalid_token_is_401(ctx):
    enroll(ctx["client"])
    r = ctx["client"].get("/profile", headers=auth_headers("not-a-real-token"))
    assert r.status_code == 401


def test_token_derives_athlete_no_idor(ctx):
    """BB-19: identity comes from the token; one athlete cannot read another's session (404, so
    existence is not leaked — contract §16A)."""
    t1 = enroll(ctx["client"], athlete_id="ath_1")
    t2 = enroll(ctx["client"], athlete_id="ath_2")
    s = ctx["client"].post("/sessions", headers=auth_headers(t1),
                           json={"client_request_id": _uid()}).json()
    r = ctx["client"].get(f"/sessions/{s['id']}", headers=auth_headers(t2))
    assert r.status_code == 404


def test_revoked_token_is_401(ctx):
    t = enroll(ctx["client"], athlete_id="ath_1")
    assert ctx["client"].get("/profile", headers=auth_headers(t)).status_code == 200
    rv = ctx["client"].post("/internal/athletes/ath_1/revoke",
                            headers={"x-operator-key": OPERATOR_KEY}, json={"token": t})
    assert rv.status_code == 200 and rv.json()["revoked"] is True
    assert ctx["client"].get("/profile", headers=auth_headers(t)).status_code == 401


# ----------------------------- profile (§9) + version stamping (BB-4) -----------------------------

def test_profile_get_and_patch(ctx):
    t = enroll(ctx["client"], athlete_id="ath_1", bw=80.0)
    p = ctx["client"].get("/profile", headers=auth_headers(t)).json()
    assert p["id"] == "ath_1" and p["bodyweight_kg"] == 80.0
    assert p["model_version"] and p["capability_model_version"]
    r = ctx["client"].patch("/profile", headers=auth_headers(t),
                            json={"client_request_id": _uid(), "bodyweight_kg": 85.0, "age": 31})
    assert r.status_code == 200
    assert r.json()["bodyweight_kg"] == 85.0 and r.json()["age"] == 31


# ----------------------------- athlete self-erase (OD-2, in-app Delete Account) -----------------------------

def test_me_erase_anonymizes_caller_and_invalidates_token(ctx):
    c = ctx["client"]
    t = enroll(c, athlete_id="ath_erase", bw=80.0)
    assert c.get("/profile", headers=auth_headers(t)).status_code == 200
    r = c.post("/me/erase", headers=auth_headers(t))
    assert r.status_code == 200
    body = r.json()
    assert body["athlete_id"] == "ath_erase"
    assert body["method"] == "logical_anonymization"
    assert body["tokens_removed"] >= 1
    # The auth token was deleted by erasure → it no longer authenticates.
    assert c.get("/profile", headers=auth_headers(t)).status_code == 401


def test_me_erase_requires_auth(ctx):
    assert ctx["client"].post("/me/erase").status_code == 401


def test_me_erase_only_affects_the_caller_no_idor(ctx):
    c = ctx["client"]
    t1 = enroll(c, athlete_id="ath_e1")
    t2 = enroll(c, athlete_id="ath_e2")
    assert c.post("/me/erase", headers=auth_headers(t1)).status_code == 200
    # A token can only erase ITS OWN athlete — the other athlete is untouched.
    assert c.get("/profile", headers=auth_headers(t2)).status_code == 200


# ----------------------------- consent (OD-3 / BB-33) -----------------------------

def test_consent_requires_token(ctx):
    r = ctx["client"].post("/consent", json={"version": "v1"})
    assert r.status_code == 401


def test_consent_record_and_read(ctx):
    t = enroll(ctx["client"], athlete_id="ath_1")
    # none yet
    g0 = ctx["client"].get("/consent", headers=auth_headers(t))
    assert g0.status_code == 200 and g0.json()["version"] is None
    # record (the affirmative act); server_ts is the authoritative legal timestamp
    r = ctx["client"].post("/consent", headers=auth_headers(t),
                           json={"version": "v1", "accepted_at": "2026-06-17T10:00:00Z"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["recorded"] is True and body["version"] == "v1" and body["server_ts"]
    # read back
    g = ctx["client"].get("/consent", headers=auth_headers(t)).json()
    assert g["version"] == "v1" and g["accepted_at"] == "2026-06-17T10:00:00Z"


def test_consent_append_only_idempotent_per_version(ctx):
    """Re-accepting the SAME version is exactly-once (one row); a new version adds a row."""
    t = enroll(ctx["client"], athlete_id="ath_1")
    for _ in range(3):
        assert ctx["client"].post("/consent", headers=auth_headers(t),
                                  json={"version": "v1"}).status_code == 200
    ctx["client"].post("/consent", headers=auth_headers(t), json={"version": "v2"})
    conn = sqlite3.connect(ctx["db_path"])
    try:
        n = conn.execute(
            "SELECT COUNT(*) FROM athlete_event WHERE type='consent_accepted'"
        ).fetchone()[0]
    finally:
        conn.close()
    assert n == 2  # v1 collapsed to one row (idempotent) + v2


def test_consent_is_athlete_scoped(ctx):
    """Token-derived identity: one athlete's consent is never visible to another."""
    t1 = enroll(ctx["client"], athlete_id="ath_1")
    t2 = enroll(ctx["client"], athlete_id="ath_2")
    ctx["client"].post("/consent", headers=auth_headers(t1), json={"version": "v1"})
    assert ctx["client"].get("/consent", headers=auth_headers(t2)).json()["version"] is None


def test_capabilities_get(ctx):
    t = enroll(ctx["client"], athlete_id="ath_caps")
    r = ctx["client"].get("/capabilities", headers=auth_headers(t))
    assert r.status_code == 200, r.text
    caps = r.json()["capabilities"]
    names = {c["capability"] for c in caps}
    # The five Class-A capabilities are seeded at enrollment; each carries score + confidence.
    assert {"horizontal_push", "horizontal_pull", "vertical_push", "knee_dominant", "hip_dominant"} <= names
    for c in caps:
        assert isinstance(c["score"], (int, float)) and isinstance(c["confidence"], (int, float))


def test_capabilities_requires_auth(ctx):
    assert ctx["client"].get("/capabilities").status_code == 401


def test_strategy_get(ctx):
    t = enroll(ctx["client"], athlete_id="ath_strat")
    r = ctx["client"].get("/strategy", headers=auth_headers(t))
    assert r.status_code == 200, r.text
    s = r.json()
    assert isinstance(s["weekly_frequency"], int)
    assert "weekly_volume" in s and "primary_focus" in s and "secondary_focus" in s


def test_strategy_requires_auth(ctx):
    assert ctx["client"].get("/strategy").status_code == 401


def test_strategy_reports_sessions_completed(ctx):
    t = enroll(ctx["client"], athlete_id="ath_calib")
    s = ctx["client"].get("/strategy", headers=auth_headers(t)).json()
    assert s["sessions_completed"] == 0  # fresh athlete is mid-calibration


def _events(db_path, athlete_id):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT event_id, type, session_id, client_monotonic, data FROM athlete_event WHERE athlete_id=?",
            (athlete_id,),
        ).fetchall()
    finally:
        conn.close()


def test_telemetry_persists_to_durable_event_store(ctx):
    t = enroll(ctx["client"], athlete_id="ath_tel")
    r = ctx["client"].post(
        "/telemetry",
        headers=auth_headers(t),
        json={"events": [{
            "event_id": "evt_1", "type": "set_completed", "client_ts": "2026-06-14T00:00:00Z",
            "client_monotonic": 1234.5, "seq": 3, "session_id": "ws_x",
            "app_version": "1.0.0", "os": "ios", "device_id": "dev_1", "locale": "en", "network": "wifi",
            "data": {"capability": "hip_dominant", "override": True},
        }]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["accepted"] == 1
    rows = _events(ctx["db_path"], "ath_tel")
    assert len(rows) == 1
    assert rows[0]["type"] == "set_completed"
    assert rows[0]["session_id"] == "ws_x"
    assert rows[0]["client_monotonic"] == 1234.5
    assert "hip_dominant" in rows[0]["data"]


def test_telemetry_ingest_is_idempotent_on_event_id(ctx):
    t = enroll(ctx["client"], athlete_id="ath_idem")
    ev = {"events": [{"event_id": "evt_dup", "type": "first_override"}]}
    ctx["client"].post("/telemetry", headers=auth_headers(t), json=ev)
    ctx["client"].post("/telemetry", headers=auth_headers(t), json=ev)  # retry
    assert len(_events(ctx["db_path"], "ath_idem")) == 1  # never doubled


def test_telemetry_requires_auth(ctx):
    assert ctx["client"].post("/telemetry", json={"events": []}).status_code == 401


def _model_snapshot(db_path, athlete_id):
    """Everything that could constitute model state / a future-recommendation basis."""
    conn = sqlite3.connect(db_path); conn.row_factory = sqlite3.Row
    try:
        recs = conn.execute("SELECT COUNT(*) AS n FROM recommendation WHERE athlete_id=?",
                            (athlete_id,)).fetchone()["n"]
        obs = conn.execute("SELECT COUNT(*) AS n FROM observation WHERE athlete_id=?",
                          (athlete_id,)).fetchone()["n"]
        caps = conn.execute(
            "SELECT capability, score, confidence, sum_w, last_recommended_weight, last_decision "
            "FROM capability_state WHERE athlete_id=? ORDER BY capability", (athlete_id,)).fetchall()
        strat = conn.execute("SELECT * FROM strategy_state WHERE athlete_id=?",
                            (athlete_id,)).fetchone()
        return recs, obs, [tuple(r) for r in caps], (tuple(strat) if strat else None)
    finally:
        conn.close()


def test_program_change_responses_are_data_only_never_model_state(ctx):
    """C5 (ratified 2026-06-15): a program change may be ACKNOWLEDGED, VETOED, or IGNORED;
    every response is stored as research DATA for learning + trust measurement and must NEVER
    directly alter model state or future recommendations (not user-controlled progression).
    Responses ride the telemetry → athlete_event pipeline, so model tables are untouched by
    construction; this test locks that invariant and that all three actions persist as data."""
    t = enroll(ctx["client"], athlete_id="ath_pc")
    s = _start(ctx, t)
    b = s["blocks"][0]
    # build some real model state first (recommendation + observation + capability update)
    ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": b["target_reps"], "actual_weight": b["recommended_weight"]})

    before = _model_snapshot(ctx["db_path"], "ath_pc")
    # all three response kinds, recorded as research events (the founder's vocabulary)
    r = ctx["client"].post("/telemetry", headers=auth_headers(t), json={"events": [
        {"event_id": _uid(), "type": "program_change_response",
         "data": {"changeId": "pc_load", "kind": "load", "action": "vetoed"}},
        {"event_id": _uid(), "type": "program_change_response",
         "data": {"changeId": "pc_frame", "kind": "frame", "action": "acknowledged"}},
        {"event_id": _uid(), "type": "program_change_response",
         "data": {"changeId": "pc_z", "kind": "frame", "action": "ignored"}},
    ]})
    assert r.status_code == 200 and r.json()["accepted"] == 3

    # model state + the future-recommendation basis is byte-identical (data-only, no progression)
    assert _model_snapshot(ctx["db_path"], "ath_pc") == before

    # all three actions are durably stored as joinable data
    rows = [e for e in _events(ctx["db_path"], "ath_pc") if e["type"] == "program_change_response"]
    assert sorted(json.loads(e["data"])["action"] for e in rows) == \
        ["acknowledged", "ignored", "vetoed"]


# ----------------------------- compose / contract shape (§3/§5/§6) -----------------------------

def test_compose_session_shape_and_versions(ctx):
    t = enroll(ctx["client"])
    r = ctx["client"].post("/sessions", headers=auth_headers(t),
                           json={"client_request_id": _uid()})
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["id"].startswith("ws_")
    assert s["status"] in ("active", "planned")
    # Founder decision: a composed session carries a real, structure-derived workout name
    # (never a generic placeholder like "Today"/"Session").
    assert s["name"] and s["name"] not in ("Today", "Session", "Workout")
    assert s["model_version"] and s["capability_model_version"] and s["catalog_version"]
    assert len(s["blocks"]) >= 1
    b = s["blocks"][0]
    for field in ("id", "position", "capability", "exercise", "difficulty_factor",
                  "recommended_weight", "target_reps", "target_sets", "rest_seconds",
                  "selection_reason", "recommendation_id", "status"):
        assert field in b
    # active capabilities are the five Class-A only (contract §0)
    for b in s["blocks"]:
        assert b["capability"] in {
            "horizontal_push", "horizontal_pull", "vertical_push",
            "knee_dominant", "hip_dominant"}


def test_today_awaiting_then_session(ctx):
    t = enroll(ctx["client"])
    assert ctx["client"].get("/sessions/today", headers=auth_headers(t)).json() == {
        "today": None, "reason": "awaiting_compose"}
    ctx["client"].post("/sessions", headers=auth_headers(t), json={"client_request_id": _uid()})
    today = ctx["client"].get("/sessions/today", headers=auth_headers(t)).json()
    assert today["today"]["id"].startswith("ws_")


# ----------------------------- input bounds (BB-8) -----------------------------

def _start(ctx, t):
    return ctx["client"].post("/sessions", headers=auth_headers(t),
                              json={"client_request_id": _uid()}).json()


def test_effort_field_is_rejected_422(ctx):
    """ES-011 / A5 Anti-Requirement: an effort/RIR field is refused at the boundary, not dropped."""
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    r = ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": 8, "actual_weight": 80.0, "effort": 5})
    assert r.status_code == 422


def test_negative_reps_rejected(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    r = ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": -2, "actual_weight": 80.0})
    assert r.status_code == 422


def test_set_number_over_target_rejected(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    r = ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"],
        "set_number": b["target_sets"] + 5, "actual_reps": 8, "actual_weight": 80.0})
    assert r.status_code == 422


# ----------------------------- idempotency (BB-1) -----------------------------

def test_set_report_idempotent_no_double_learn(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    key = _uid()
    body = {"client_event_id": key, "seq": 1, "block_id": b["id"], "set_number": 1,
            "actual_reps": 8, "actual_weight": 80.0}
    r1 = ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json=body)
    r2 = ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json=body)
    assert r1.status_code == 200 and r2.status_code == 200
    # same response (parity) AND exactly one observation written (no double-learn)
    assert r1.json()["observation_id"] == r2.json()["observation_id"]
    assert count_observations(ctx["db_path"]) == 1


# ----------------------------- lifecycle e2e + next action (§7.2) -----------------------------

def test_full_lifecycle_e2e(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    sid = s["id"]
    seq = 0
    for b in s["blocks"]:
        for set_no in range(1, b["target_sets"] + 1):
            seq += 1
            r = ctx["client"].post(f"/sessions/{sid}/sets", headers=auth_headers(t), json={
                "client_event_id": _uid(), "seq": seq, "block_id": b["id"],
                "set_number": set_no, "actual_reps": 8, "actual_weight": b["recommended_weight"]})
            assert r.status_code == 200, r.text
            assert r.json()["next"]["kind"] in ("next_set", "next_block", "session_complete")
    c = ctx["client"].post(f"/sessions/{sid}/complete", headers=auth_headers(t),
                           json={"client_event_id": _uid()})
    assert c.status_code == 200, c.text
    assert c.json()["session"]["status"] == "completed"
    # pre-compose filled the cache: today returns a fresh planned/active session
    today = ctx["client"].get("/sessions/today", headers=auth_headers(t)).json()
    assert today["today"] is not None and today["today"]["id"] != sid


def test_set_on_completed_session_conflict(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    ctx["client"].post(f"/sessions/{s['id']}/complete", headers=auth_headers(t),
                       json={"client_event_id": _uid()})
    r = ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": 8, "actual_weight": 80.0})
    assert r.status_code == 409


# ----------------------------- skip / replace (§5.1/§8) + A9 override (BB-7) -----------------------------

def test_skip_block(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    r = ctx["client"].post(f"/blocks/{b['id']}/skip", headers=auth_headers(t),
                           json={"client_event_id": _uid(), "seq": 1, "reason": "equipment_busy"})
    assert r.status_code == 200
    assert r.json()["block"]["status"] == "skipped"


def test_replace_in_catalog_preserves_capability(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    r = ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": b["exercise"],
        "reason": "preference"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision_type"] == "REPLACE_EXERCISE"
    assert body["block"]["capability"] == b["capability"]  # capability-preserving


def test_a9_load_override_captured(ctx):
    """BB-7: a logged load that deviates from the prescription is recorded as an A9 LOAD override
    on the observation (lossless), via the opt-in pipeline passthrough."""
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    deviated = b["recommended_weight"] + 5.0
    ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": 7, "actual_weight": deviated})
    conn = sqlite3.connect(ctx["db_path"])
    try:
        row = conn.execute(
            "SELECT override_category, override_target FROM observation").fetchone()
    finally:
        conn.close()
    assert row[0] == "LOAD" and abs(row[1] - deviated) < 1e-9


def test_override_is_full_off_policy_calibration_sample(ctx):
    """Migration 013: an override is not merely flagged — it is a self-contained off-policy
    calibration sample. The observation co-locates the decision-time model state (off_policy
    flag, μ, σ, the prescribed-load prediction + its success expectation, capability-space
    value) beside the realized outcome (load lifted, actual reps, prediction error)."""
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    deviated = b["recommended_weight"] + 5.0
    ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": 7, "actual_weight": deviated})
    conn = sqlite3.connect(ctx["db_path"])
    conn.row_factory = sqlite3.Row
    try:
        o = conn.execute(
            "SELECT off_policy, mu_decision, sigma_decision, predicted_reps_prescribed, "
            "predicted_success, capability_value, actual_weight, actual_reps, prediction_error, "
            "override_target FROM observation").fetchone()
    finally:
        conn.close()
    # off-policy marker is explicit (not just implied by override_category)
    assert o["off_policy"] == 1
    # decision-time model state captured
    assert o["mu_decision"] is not None
    assert o["sigma_decision"] is not None and o["sigma_decision"] >= 0.0
    assert o["capability_value"] is not None
    # the on-policy prediction (at the PRESCRIBED load) + its success expectation
    assert o["predicted_reps_prescribed"] is not None
    assert o["predicted_success"] in (0.0, 1.0)
    # realized outcome at the off-policy load
    assert abs(o["actual_weight"] - deviated) < 1e-9
    assert o["actual_reps"] == 7
    assert o["prediction_error"] is not None


def test_on_policy_set_flags_off_policy_zero(ctx):
    """A logged set AT the prescription is on-policy: off_policy=0, but the decision-time
    sample is still captured (so the calibration substrate covers both regimes)."""
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": b["target_reps"], "actual_weight": b["recommended_weight"]})
    conn = sqlite3.connect(ctx["db_path"])
    conn.row_factory = sqlite3.Row
    try:
        o = conn.execute(
            "SELECT off_policy, mu_decision, predicted_reps_prescribed FROM observation").fetchone()
    finally:
        conn.close()
    assert o["off_policy"] == 0
    assert o["mu_decision"] is not None and o["predicted_reps_prescribed"] is not None


def test_composed_session_persists_full_audit_for_replay(ctx):
    """Migration 014: a composed session is self-describing — the candidate-selection decision
    can be replayed from stored data ALONE years later. The session row carries the seed +
    template inputs + the strategy focus + the candidate-pool (catalog) version + the code
    versions that ran."""
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    conn = sqlite3.connect(ctx["db_path"])
    conn.row_factory = sqlite3.Row
    try:
        ws = conn.execute(
            "SELECT exploration_seed, session_index, weekly_frequency, weekly_volume, "
            "calibration_phase, catalog_version, model_version, capability_model_version "
            "FROM workout_session WHERE id=?", (s["id"],)).fetchone()
    finally:
        conn.close()
    # the one nondeterministic step is reproducible, the template inputs are pinned
    assert ws["exploration_seed"] is not None
    assert ws["session_index"] is not None
    assert ws["weekly_frequency"] is not None and ws["weekly_volume"] is not None
    assert ws["calibration_phase"] is not None
    # the candidate POOL + the code that selected from it are stamped (replayability)
    assert ws["catalog_version"]            # which exercises existed
    assert ws["model_version"]              # which composition code ran
    assert ws["capability_model_version"]   # which capability formulas ran


# ----------------------------- forecasts (C4 — derived, reconstructable) -----------------------------

def test_forecasts_endpoint_is_silent_during_calibration(ctx):
    """GET /forecasts is the server-authoritative forecast view. During calibration the model
    issues no actionable decisions, so it derives NO forecasts — the route returns 200 + []."""
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": b["target_reps"], "actual_weight": b["recommended_weight"]})
    r = ctx["client"].get("/forecasts", headers=auth_headers(t))
    assert r.status_code == 200
    assert r.json() == {"forecasts": []}


def _seed_block_with_recommendation(db, athlete_id, *, capability, exercise, decision_type,
                                    decision_reason, recommended_weight, target_reps, confidence,
                                    week, actual_reps=None, actual_weight=None, skipped=False):
    """Insert one session→block→recommendation(+optional logged observation), mirroring the
    real chain, so the derived forecast view can be exercised without grinding to ADVISORY."""
    with db.transaction() as conn:
        sess = SessionRepository(conn); lr = LearningRepository(conn)
        sid = sess.create_session(athlete_id, week)
        bid = sess.add_block(sid, capability, exercise, 1.0, 0, recommended_weight, target_reps, 3)
        rec = Recommendation(
            athlete_id=athlete_id, capability=capability, exercise=exercise,
            difficulty_factor=1.0, recommended_weight=recommended_weight, target_reps=target_reps,
            predicted_reps_to_failure=float(target_reps), prediction_confidence=confidence,
            decision_reason=decision_reason, decision_type=decision_type)
        lr.insert_recommendation(rec, bid)
        if actual_reps is not None:
            set_id = sess.add_set(bid, 1, recommended_weight, target_reps,
                                  actual_weight=actual_weight, actual_reps=actual_reps,
                                  status="completed")
            obs = Observation(athlete_id=athlete_id, capability=capability, exercise=exercise,
                              difficulty_factor=1.0, actual_weight=actual_weight,
                              actual_reps=actual_reps, predicted_reps_to_failure=float(target_reps),
                              prediction_error=0.0, week=week)
            lr.insert_observation(obs, sid, bid, set_id)
        if skipped:
            sess.set_block_status(bid, "skipped")
    return sid


def test_derive_forecasts_increase_resolves_hit_miss_void_and_pending():
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    CAP, EX = "knee_dominant", "back_squat"
    # HIT: reps met at actionable confidence
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="INCREASE_LOAD", decision_reason="increase_load:earned",
        recommended_weight=100.0, target_reps=5, confidence=85.0, week=1.0, actual_reps=6,
        actual_weight=100.0)
    # MISS: reps short (silent — present in the audit view, not surfaced to the athlete)
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="INCREASE_LOAD", decision_reason="increase_load:earned",
        recommended_weight=105.0, target_reps=5, confidence=85.0, week=2.0, actual_reps=3,
        actual_weight=105.0)
    # PENDING: issued, not yet logged
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="INCREASE_LOAD", decision_reason="increase_load:earned",
        recommended_weight=110.0, target_reps=5, confidence=85.0, week=3.0)
    # VOID: block skipped (basis lost)
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="INCREASE_LOAD", decision_reason="increase_load:earned",
        recommended_weight=115.0, target_reps=5, confidence=85.0, week=4.0, skipped=True)
    # NOT a forecast: increase at medium confidence (not actionable, R9)
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="INCREASE_LOAD", decision_reason="increase_load:earned",
        recommended_weight=120.0, target_reps=5, confidence=50.0, week=5.0, actual_reps=6,
        actual_weight=120.0)

    states = sorted(f["state"] for f in _derive_forecasts(db.conn, "a"))
    assert states == ["HIT", "MISS", "PENDING", "VOID"]  # the medium-confidence one issued none
    assert all(f["type"] == "increase" for f in _derive_forecasts(db.conn, "a"))
    assert [f["state"] for f in _derive_forecasts(db.conn, "a", "PENDING")] == ["PENDING"]
    db.close()


def test_derive_forecasts_hold_is_horizonless_hit_or_pending():
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    CAP, EX = "vertical_push", "overhead_press"
    # a hold forecast staked at week 1 (held weight 40, reps 5), actionable confidence
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="KEEP_LOAD", decision_reason="fatigue_hold:load_held",
        recommended_weight=40.0, target_reps=5, confidence=85.0, week=1.0, actual_reps=5,
        actual_weight=40.0)
    # before any breakthrough: horizonless → PENDING (NOT a miss)
    holds = _derive_forecasts(db.conn, "a")
    assert len(holds) == 1 and holds[0]["type"] == "hold" and holds[0]["state"] == "PENDING"
    # a later session EXCEEDS the held weight for the reps → HIT
    _seed_block_with_recommendation(db, "a", capability=CAP, exercise=EX,
        decision_type="KEEP_LOAD", decision_reason="keep_load:default",
        recommended_weight=42.5, target_reps=5, confidence=60.0, week=3.0, actual_reps=5,
        actual_weight=42.5)
    holds = _derive_forecasts(db.conn, "a")
    hold = [f for f in holds if f["type"] == "hold"]
    assert len(hold) == 1 and hold[0]["state"] == "HIT"
    db.close()


# ----------------------------- Program Ownership Contract (preferences) -----------------------------

def _find_block(session, capability=None):
    for b in session["blocks"]:
        if capability is None or b["capability"] == capability:
            return b
    return session["blocks"][0]


def _alternate_exercise(capability, current):
    from hush_model.catalog import CATALOG
    for e in CATALOG.for_capability(capability):
        if e.exercise_id != current:
            return e.exercise_id
    return current


def test_explicit_replace_is_honored_verbatim_and_pinned(ctx):
    """Athlete-owned: an explicit target is used EXACTLY (not re-derived by preference), pinned,
    and visible in the owned projection."""
    t = enroll(ctx["client"], athlete_id="own1")
    s = _start(ctx, t)
    b = _find_block(s)
    cap, current = b["capability"], b["exercise"]
    target = _alternate_exercise(cap, current)
    r = ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": current, "to_exercise": target,
        "reason": "preference"})
    assert r.status_code == 200, r.text
    assert r.json()["block"]["exercise"] == target          # honored verbatim
    proj = ctx["client"].get("/preferences", headers=auth_headers(t)).json()["preferences"]
    assert proj["pins"][cap] == target                       # pinned (athlete-owned)


def test_calibration_does_not_override_a_pin(ctx):
    """A pin wins over the model's calibration canonical AND survives regeneration — proven through
    the real composition path on a fresh state snapshot."""
    from hush_model.persistence.db import Database as _DB
    from hush_model.persistence.service import HushService as _Svc
    from hush_model.persistence.repositories import StateRepository as _SR
    from hush_model.composition import compose_session, SELECT_PINNED
    from hush_model.domain import default_strategy_state

    db = _DB(":memory:")
    _Svc(db).onboard("c1", "male", 30, "intermediate")       # calibrating (confidence < 70)
    cap, target = "horizontal_push", "db_bench_press"
    _Svc(db).pin_exercise("c1", cap, target, from_exercise="bench_press", source="program_detail")
    with db.transaction() as conn:
        ath = _SR(conn).load_athlete_state("c1")
    assert ath.calibration_phase() is True                   # genuinely in calibration
    assert ath.pinned_exercises.get(cap) == target
    plan = compose_session(ath, default_strategy_state("c1"), session_index=0, seed=0, week=1.0)
    hp = next(bp for bp in plan.blocks if bp.capability == cap)
    assert hp.exercise_id == target                          # pin beat the calibration canonical
    assert hp.selection_reason == SELECT_PINNED
    db.close()


def test_preference_log_is_append_only_and_reconstructable(ctx):
    """Two replaces of the same capability preserve BOTH events (no overwrite); the projection is
    the latest, and the full timeline is reconstructable."""
    t = enroll(ctx["client"], athlete_id="own2")
    s = _start(ctx, t)
    b = _find_block(s, "horizontal_push")
    ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": b["exercise"],
        "to_exercise": "db_bench_press", "reason": "preference"})
    # change the mind back to the barbell — a SECOND owned action
    ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 2, "from_exercise": "db_bench_press",
        "to_exercise": "bench_press", "reason": "preference"})
    evts = ctx["client"].get("/preferences/events", headers=auth_headers(t)).json()["events"]
    pins = [e for e in evts if e["action"] == "exercise_replaced" and e["capability"] == "horizontal_push"]
    assert len(pins) == 2                                    # both preserved (append-only)
    assert [e["to_exercise"] for e in pins] == ["db_bench_press", "bench_press"]  # timeline intact
    proj = ctx["client"].get("/preferences", headers=auth_headers(t)).json()["preferences"]
    assert proj["pins"]["horizontal_push"] == "bench_press"  # latest-wins projection


def test_restore_clears_the_pin(ctx):
    t = enroll(ctx["client"], athlete_id="own3")
    s = _start(ctx, t)
    b = _find_block(s, "horizontal_push")
    ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": b["exercise"],
        "to_exercise": "db_bench_press", "reason": "preference"})
    ctx["client"].post("/preferences/exercise", headers=auth_headers(t), json={
        "client_event_id": _uid(), "capability": "horizontal_push", "action": "restore"})
    proj = ctx["client"].get("/preferences", headers=auth_headers(t)).json()["preferences"]
    assert "horizontal_push" not in proj["pins"]             # pin cleared → model selects again


def test_substitute_backup_and_order_are_owned_and_durable(ctx):
    t = enroll(ctx["client"], athlete_id="own4")
    _start(ctx, t)
    h = auth_headers(t)
    ctx["client"].post("/preferences/substitute", headers=h, json={
        "client_event_id": _uid(), "primary_exercise": "barbell_row", "substitute_exercise": "db_row"})
    ctx["client"].post("/preferences/backup", headers=h, json={
        "client_event_id": _uid(), "primary_exercise": "back_squat", "backup_exercise": "leg_press"})
    ctx["client"].post("/preferences/order", headers=h, json={
        "client_event_id": _uid(), "scope": "workout", "order": ["w_b", "w_a"]})
    proj = ctx["client"].get("/preferences", headers=h).json()["preferences"]
    assert proj["substitutes"]["barbell_row"] == "db_row"
    assert proj["backups"]["back_squat"] == "leg_press"
    assert proj["workout_order"] == ["w_b", "w_a"]


def test_preference_dataset_distinguishes_accepted_and_replaced(ctx):
    """The learning dataset answers accepted-vs-replaced per generated exercise — derived from
    recommendation ⋈ preference_event, no signal lost."""
    t = enroll(ctx["client"], athlete_id="own5")
    s = _start(ctx, t)
    b = _find_block(s, "horizontal_push")
    # accept one block by logging a set; replace another capability's exercise
    ctx["client"].post(f"/sessions/{s['id']}/sets", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
        "actual_reps": b["target_reps"], "actual_weight": b["recommended_weight"]})
    kb = _find_block(s, "knee_dominant")
    ctx["client"].post(f"/blocks/{kb['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": kb["exercise"],
        "to_exercise": _alternate_exercise("knee_dominant", kb["exercise"]), "reason": "preference"})
    ds = ctx["client"].get("/preferences/dataset", headers=auth_headers(t)).json()["dataset"]
    by_cap = {r["capability"]: r for r in ds}
    assert by_cap["horizontal_push"]["athlete_response"] == "accepted"
    assert by_cap["knee_dominant"]["athlete_response"] == "replaced"
    assert by_cap["knee_dominant"]["replacement_exercise"] is not None


# ----------------------------- Ownership consumption (substitute / backup / order) -----------------------------

def test_preferred_substitute_is_selected_before_model_alternative(ctx):
    """Audit #1: when an alternative is needed (replace with no explicit target), the athlete's
    preferred substitute is chosen BEFORE any model-generated alternative, and usage is captured."""
    t = enroll(ctx["client"], athlete_id="sub1")
    s = _start(ctx, t)
    b = _find_block(s, "horizontal_push")            # bench_press (canonical) during calibration
    ctx["client"].post("/preferences/substitute", headers=auth_headers(t), json={
        "client_event_id": _uid(), "primary_exercise": b["exercise"], "substitute_exercise": "db_bench_press"})
    r = ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": b["exercise"], "reason": "preference"})
    assert r.status_code == 200, r.text
    assert r.json()["block"]["exercise"] == "db_bench_press"      # substitute chosen, not model argmax
    actions = {e["action"] for e in ctx["client"].get("/preferences/events", headers=auth_headers(t)).json()["events"]}
    assert {"substitute_offered", "substitute_selected"} <= actions


def test_equipment_occupied_moves_exercise_down_one_position(ctx):
    """Equipment-occupied (V1): the occupied exercise moves ONE position later — no replacement, no
    structure change, same exercises, same recommendations. The busy event is captured for research."""
    t = enroll(ctx["client"], athlete_id="eq1")
    s = _start(ctx, t)
    if len(s["blocks"]) < 2:
        return  # nothing to move past (single-block session)
    ordered = sorted(s["blocks"], key=lambda b: b["position"])
    first, second = ordered[0], ordered[1]
    before_set = {b["exercise"] for b in s["blocks"]}
    r = ctx["client"].post(f"/blocks/{first['id']}/unavailable", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["moved_exercise"] == first["exercise"]
    assert body["new_position"] == second["position"]            # moved one slot later
    new_order = sorted(body["session"]["blocks"], key=lambda b: b["position"])
    assert new_order[0]["exercise"] == second["exercise"]        # the next exercise is now first
    assert new_order[1]["exercise"] == first["exercise"]
    # structure preserved: same set of exercises, no replacement
    assert {b["exercise"] for b in body["session"]["blocks"]} == before_set
    # research capture: an exercise_busy event with positions, joinable to the workout
    evts = ctx["client"].get("/preferences/events", headers=auth_headers(t)).json()["events"]
    busy = [e for e in evts if e["action"] == "exercise_busy"]
    assert len(busy) == 1 and busy[0]["from_exercise"] == first["exercise"]
    assert busy[0]["slot_key"] == s["id"]                        # workout_id
    payload = json.loads(busy[0]["payload"])
    assert payload["original_position"] == first["position"] and payload["new_position"] == second["position"]
    # ownership untouched: a busy move is NOT a pin / replacement
    proj = ctx["client"].get("/preferences", headers=auth_headers(t)).json()["preferences"]
    assert proj["pins"] == {}


def test_equipment_occupied_on_last_block_is_a_noop_move(ctx):
    t = enroll(ctx["client"], athlete_id="eq2")
    s = _start(ctx, t)
    last = sorted(s["blocks"], key=lambda b: b["position"])[-1]
    r = ctx["client"].post(f"/blocks/{last['id']}/unavailable", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1})
    assert r.status_code == 200
    assert r.json()["new_position"] == last["position"]          # already last → stays put


def test_exercise_order_is_consumed_by_composition(ctx):
    """Audit #3: the athlete's exercise order is honored by composition (athlete order > model
    Stage-4 order), and survives regeneration."""
    from hush_model.persistence.db import Database as _DB
    from hush_model.persistence.service import HushService as _Svc
    from hush_model.persistence.repositories import StateRepository as _SR, PREF_EXERCISE_REORDERED
    from hush_model.composition import compose_session
    from hush_model.domain import default_strategy_state

    db = _DB(":memory:")
    svc = _Svc(db); svc.onboard("eo1", "male", 30, "intermediate")
    with db.transaction() as conn:
        ath = _SR(conn).load_athlete_state("eo1")
    plan1 = compose_session(ath, default_strategy_state("eo1"), session_index=0, seed=0, week=1.0)
    model_order = [bp.exercise_id for bp in plan1.blocks]
    assert len(model_order) >= 2
    desired = list(reversed(model_order))
    svc.record_preference_action("eo1", PREF_EXERCISE_REORDERED, payload={"order": desired})
    with db.transaction() as conn:
        ath2 = _SR(conn).load_athlete_state("eo1")
    plan2 = compose_session(ath2, default_strategy_state("eo1"), session_index=0, seed=0, week=1.0)
    assert [bp.exercise_id for bp in plan2.blocks] == desired      # athlete order won
    db.close()


def test_dataset_captures_usage_and_retention(ctx):
    """Audit (dataset): usage actions are counted and a replacement's retention is derivable."""
    t = enroll(ctx["client"], athlete_id="ds2")
    s = _start(ctx, t)
    b = _find_block(s, "horizontal_push")
    ctx["client"].post(f"/blocks/{b['id']}/replace", headers=auth_headers(t), json={
        "client_event_id": _uid(), "seq": 1, "from_exercise": b["exercise"],
        "to_exercise": "db_bench_press", "reason": "preference"})
    body = ctx["client"].get("/preferences/dataset", headers=auth_headers(t)).json()
    assert body["usage"]["action_counts"].get("exercise_replaced", 0) >= 1
    assert body["usage"]["active_pins"]["horizontal_push"] == "db_bench_press"
    row = next(r for r in body["dataset"] if r["capability"] == "horizontal_push")
    assert row["athlete_response"] == "replaced"
    assert row["replacement_exercise"] == "db_bench_press"
    assert row["replacement_still_active"] is True and row["reverted"] is False


# ----------------------------- Weekly Program Container -----------------------------

def _compose_week(ctx, t):
    return ctx["client"].post("/weeks", headers=auth_headers(t),
                              json={"client_request_id": _uid()}).json()


def _complete_workout(ctx, t, wk):
    for b in wk["blocks"]:
        ctx["client"].post(f"/sessions/{wk['id']}/sets", headers=auth_headers(t), json={
            "client_event_id": _uid(), "seq": 1, "block_id": b["id"], "set_number": 1,
            "actual_reps": b["target_reps"], "actual_weight": b["recommended_weight"]})
    return ctx["client"].post(f"/sessions/{wk['id']}/complete", headers=auth_headers(t),
                              json={"client_event_id": _uid(), "seq": 0}).json()


def test_week_generates_N_workouts_and_is_idempotent(ctx):
    t = enroll(ctx["client"], athlete_id="wk_a")
    w = _compose_week(ctx, t)
    n = w["week"]["weekly_frequency"]
    assert w["week"]["status"] == "active"
    assert len(w["workouts"]) == n                                   # the model generates N workouts
    assert sorted(x["position_in_week"] for x in w["workouts"]) == list(range(n))
    assert all(x["status"] == "planned" for x in w["workouts"])      # athlete completes in any order
    # idempotent: composing again returns the SAME active week
    assert _compose_week(ctx, t)["week"]["id"] == w["week"]["id"]


def test_workout_order_is_consumed_by_the_weekly_container(ctx):
    """Audit #4: athlete-owned workout order is consumed by the weekly container (athlete > model)."""
    t = enroll(ctx["client"], athlete_id="wk_b")
    probe = _compose_week(ctx, t)                # discover N (then a fresh athlete to apply order)
    n = probe["week"]["weekly_frequency"]
    t2 = enroll(ctx["client"], athlete_id="wk_b2")
    desired = [str(i) for i in reversed(range(n))]   # reverse the workout order
    ctx["client"].post("/preferences/order", headers=auth_headers(t2), json={
        "client_event_id": _uid(), "scope": "workout", "order": desired})
    w = _compose_week(ctx, t2)
    # each position's workout template (session_index % n) follows the athlete's order
    seq_templates = [x["session_index"] % n for x in sorted(w["workouts"], key=lambda z: z["position_in_week"])]
    assert seq_templates == [int(k) for k in desired]


def test_week_completes_only_when_all_done_then_rest_and_next_week_preserve_ownership(ctx):
    """Audits #4/#5/#6: the week completes only when ALL workouts are done; then Rest begins and the
    next week is generated from the completed week's data — preserving the athlete's pin AND workout
    order, even though the athlete is still in calibration."""
    t = enroll(ctx["client"], athlete_id="wk_c")
    # own structure BEFORE the first week: pin an exercise + set a workout order
    ctx["client"].post("/preferences/exercise", headers=auth_headers(t), json={
        "client_event_id": _uid(), "capability": "horizontal_push", "action": "replace",
        "from_exercise": "bench_press", "to_exercise": "db_bench_press"})
    w0 = _compose_week(ctx, t)
    n = w0["week"]["weekly_frequency"]
    order = [str(i) for i in reversed(range(n))]
    ctx["client"].post("/preferences/order", headers=auth_headers(t), json={
        "client_event_id": _uid(), "scope": "workout", "order": order})
    w0 = _compose_week(ctx, t)   # idempotent (already active) — order applies to the NEXT week

    workouts = sorted(w0["workouts"], key=lambda z: z["position_in_week"])
    last = None
    for i, wk in enumerate(workouts):
        last = _complete_workout(ctx, t, wk)
        if i < len(workouts) - 1:
            assert last["next_week"] is None                 # not complete until ALL are done
            assert ctx["client"].get("/weeks/current", headers=auth_headers(t)).json()["week"]["status"] == "active"
    # the final completion closes the week, begins Rest, and generates the next week
    assert last["next_week"] is not None
    w1 = last["next_week"]
    assert w1["week"]["week_number"] == w0["week"]["week_number"] + 1
    assert w1["rest"] is True                                # Rest begins after week completion
    # ownership preserved into the regenerated week (during calibration): pin + workout order
    hp = [b["exercise"] for wk in w1["workouts"] for b in wk["blocks"] if b["capability"] == "horizontal_push"]
    assert hp and all(e == "db_bench_press" for e in hp)     # pin survived regeneration + calibration
    seq_templates = [x["session_index"] % n for x in sorted(w1["workouts"], key=lambda z: z["position_in_week"])]
    assert seq_templates == [int(k) for k in order]          # workout order survived regeneration


# ----------------------------- why view (§12) -----------------------------

def test_why_view(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    b = s["blocks"][0]
    rec_id = b["recommendation_id"]
    assert rec_id is not None
    r = ctx["client"].get(f"/recommendations/{rec_id}/why", headers=auth_headers(t))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prediction_confidence"] in ("low", "medium", "high")
    assert body["what_it_could_not_exclude"]  # the honesty clause is required
    assert body["decision_type"] in ("KEEP_LOAD", "INCREASE_LOAD", "DECREASE_LOAD", "REPLACE_EXERCISE")
    assert "previous_weight" in body and body["previous_weight"] is None  # first rec for this exercise


def test_why_previous_weight_from_prior_recommendation(ctx):
    """C3: /why reports the authoritative previous load = the prior recommendation's recommended
    weight for the same exercise (so the client renders Δ from the model, not local history)."""
    t = enroll(ctx["client"], athlete_id="ath_1")
    s = _start(ctx, t)
    b = s["blocks"][0]
    why0 = ctx["client"].get(f"/recommendations/{b['recommendation_id']}/why",
                             headers=auth_headers(t)).json()
    assert why0["previous_weight"] is None
    # Insert a synthetic EARLIER recommendation for the SAME exercise → becomes the measured-against prior.
    conn = sqlite3.connect(ctx["db_path"])
    try:
        conn.execute(
            "INSERT INTO recommendation (id, athlete_id, exercise_block_id, capability, exercise,"
            " difficulty_factor, recommended_weight, target_reps, predicted_reps_to_failure,"
            " prediction_confidence, decision_reason, decision_type, target_load, model_version,"
            " capability_model_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("rec_prior", "ath_1", None, why0["capability"], why0["exercise"],
             1.0, why0["recommended_weight"] - 2.5, why0["target_reps"], 5.0,
             50.0, "increase_load:test", "INCREASE_LOAD", 0.0, "vtest", "vtest",
             "2000-01-01T00:00:00+00:00"),
        )
        conn.commit()
    finally:
        conn.close()
    why1 = ctx["client"].get(f"/recommendations/{b['recommendation_id']}/why",
                             headers=auth_headers(t)).json()
    assert why1["previous_weight"] == why0["recommended_weight"] - 2.5


# ----------------------------- history (§10) -----------------------------

def test_history_list(ctx):
    t = enroll(ctx["client"])
    s = _start(ctx, t)
    ctx["client"].post(f"/sessions/{s['id']}/complete", headers=auth_headers(t),
                       json={"client_event_id": _uid()})
    r = ctx["client"].get("/sessions?status=completed&limit=10", headers=auth_headers(t))
    assert r.status_code == 200
    body = r.json()
    assert any(item["status"] == "completed" for item in body["sessions"])
    assert "block_count" in body["sessions"][0]
