"""
Goal (training intent) — end-to-end over the assembled app + frozen model.

The athlete's goal selects the composition's working-rep target; the loads then follow
NATIVELY through the RIR model. These tests exercise the public boundary only:
  - /enroll accepts a goal and it flows into the composed session's blocks;
  - PATCH /profile sets/changes the goal and the next composed session reflects it;
  - an absent goal is PARITY (the historical 8-rep default);
  - invalid goals are rejected (422).

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_goal.py.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app

OPERATOR_KEY = "op-secret"


@pytest.fixture()
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "hush_goal.db"), operator_key=OPERATOR_KEY)
    return TestClient(app)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _enroll(client, **kw):
    body = {
        "athlete_id": uuid.uuid4().hex,
        "sex": "male", "age": 30, "experience": "intermediate", "bodyweight_kg": 80.0,
    }
    body.update(kw)
    r = client.post("/enroll", json=body)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _compose_session_blocks(client, token):
    r = client.post("/sessions", headers=_auth(token), json={"client_request_id": uuid.uuid4().hex})
    assert r.status_code == 201, r.text
    return r.json()["blocks"]


def _target_reps(blocks):
    reps = {b["target_reps"] for b in blocks}
    assert len(reps) == 1, f"expected one rep target across the session, got {reps}"
    return reps.pop()


def test_enroll_goal_flows_into_session_rep_target(client):
    cases = {"get_stronger": 5, "build_muscle": 8, "general_fitness": 10, "toning": 12}
    for goal, expected in cases.items():
        token = _enroll(client, goal=goal)
        assert _target_reps(_compose_session_blocks(client, token)) == expected


def test_absent_goal_is_parity_default(client):
    # No goal supplied → the historical 8-rep default (byte-for-byte the pre-goal behavior).
    token = _enroll(client)
    assert _target_reps(_compose_session_blocks(client, token)) == 8
    p = client.get("/profile", headers=_auth(token)).json()
    assert p.get("goal") is None


def test_patch_profile_changes_goal_and_next_session(client):
    token = _enroll(client)  # starts goal-less (8)
    assert _target_reps(_compose_session_blocks(client, token)) == 8
    r = client.patch("/profile", headers=_auth(token),
                     json={"client_request_id": uuid.uuid4().hex, "goal": "get_stronger"})
    assert r.status_code == 200, r.text
    assert r.json()["goal"] == "get_stronger"
    # the profile read reflects it
    assert client.get("/profile", headers=_auth(token)).json()["goal"] == "get_stronger"


def test_invalid_goal_rejected_on_enroll_and_patch(client):
    r = client.post("/enroll", json={
        "athlete_id": uuid.uuid4().hex, "sex": "male", "age": 30,
        "experience": "intermediate", "goal": "bulking"})
    assert r.status_code == 422, r.text
    token = _enroll(client)
    r2 = client.patch("/profile", headers=_auth(token),
                      json={"client_request_id": uuid.uuid4().hex, "goal": "bulking"})
    assert r2.status_code == 422, r2.text
