"""
Self-enrollment endpoint tests (zero-friction onboarding). `POST /enroll` creates the
athlete via the existing onboarding seed + mints a WORKING bearer token, with an optional
closed-alpha `x-enroll-key` gate. The model itself is not re-tested here — only the new
public boundary (the operator enroll already covers the seed path).

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_enroll.py.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app


@pytest.fixture()
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "hush_enroll.db"), operator_key="op-secret")
    return TestClient(app)


def _body(**kw):
    base = {
        "athlete_id": uuid.uuid4().hex,
        "sex": "male",
        "age": 29,
        "experience": "advanced",
        "bodyweight_kg": 73.0,
    }
    base.update(kw)
    return base


def test_self_enroll_creates_athlete_and_token_authenticates(client):
    r = client.post("/enroll", json=_body())
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    assert isinstance(token, str) and token
    # The minted token authenticates an athlete-scoped read (no operator key needed).
    p = client.get("/profile", headers={"Authorization": f"Bearer {token}"})
    assert p.status_code == 200, p.text


def test_self_enroll_rejects_bad_sex(client):
    assert client.post("/enroll", json=_body(sex="other")).status_code == 422


def test_self_enroll_rejects_bad_experience(client):
    assert client.post("/enroll", json=_body(experience="pro")).status_code == 422


def test_self_enroll_duplicate_athlete_conflicts(client):
    body = _body(athlete_id="dup_athlete")
    assert client.post("/enroll", json=body).status_code == 200
    assert client.post("/enroll", json=body).status_code == 409


def test_self_enroll_key_gate(client, monkeypatch):
    monkeypatch.setenv("HUSH_ENROLL_KEY", "alpha-secret")
    # Missing or wrong key → 401 (the handler reads the env at request time).
    assert client.post("/enroll", json=_body()).status_code == 401
    assert client.post("/enroll", json=_body(), headers={"x-enroll-key": "wrong"}).status_code == 401
    # Correct key → 200.
    ok = client.post("/enroll", json=_body(), headers={"x-enroll-key": "alpha-secret"})
    assert ok.status_code == 200, ok.text


def test_self_enroll_no_gate_when_unset(client):
    # With HUSH_ENROLL_KEY unset (default in tests), enrollment is open (dev/local).
    assert client.post("/enroll", json=_body()).status_code == 200
