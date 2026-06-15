"""
Observability tests (BB-28, backend half) — correlation id + structured access log, under pytest
against the assembled `app/` + `hush_model/` (build plan §12).

Covers the three BB-28 server obligations:
  - an end-to-end correlation id (minted when absent, honored when safely supplied, echoed in the
    response header, and surfaced as the error-envelope `request_id`);
  - one structured JSON access line per request with an allowlisted, low-cardinality field set;
  - the no-sensitive-values rule, asserted by driving a full lifecycle (token, bodyweight, reps,
    weights) through the request path and proving none of it reaches the logs.

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_observability.py.
"""
from __future__ import annotations

import io
import json
import logging
import uuid

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app
from app import observability

OPERATOR_KEY = "op-secret-key"

# Envelope keys the JSON formatter always emits, beyond the per-event allowlisted fields.
_ENVELOPE_KEYS = {"ts", "level", "logger", "event", "correlation_id"}
_ALLOWED_ACCESS_KEYS = _ENVELOPE_KEYS | set(observability.ACCESS_FIELDS)


@pytest.fixture()
def ctx(tmp_path):
    """Build the app, then redirect the `hush.api` logger to an in-memory buffer so the test can
    read exactly the lines the middleware emits (create_app configured it to stdout)."""
    db_path = str(tmp_path / "hush_test.db")
    app = create_app(db_path=db_path, operator_key=OPERATOR_KEY)
    buf = io.StringIO()
    observability.configure_logging(level=logging.INFO, stream=buf)
    return {"client": TestClient(app), "db_path": db_path, "log": buf}


def _uid() -> str:
    return uuid.uuid4().hex


def _enroll(client, athlete_id="ath_1", bw=93.7):
    return client.post("/internal/athletes", headers={"x-operator-key": OPERATOR_KEY},
                       json={"athlete_id": athlete_id, "sex": "male", "age": 30,
                             "experience": "intermediate", "bodyweight_kg": bw}).json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _events(buf: io.StringIO, event: str) -> list[dict]:
    """Parse the buffered log as JSON lines, keeping only the named event."""
    out = []
    for raw in buf.getvalue().splitlines():
        raw = raw.strip()
        if not raw:
            continue
        obj = json.loads(raw)  # asserts every emitted line is valid JSON
        if obj.get("event") == event:
            out.append(obj)
    return out


def _access_lines(buf: io.StringIO) -> list[dict]:
    """Parse the buffered access lines as JSON, keeping only the http_access events."""
    return _events(buf, observability.ACCESS_EVENT)


# ----------------------------- correlation id (header round-trip) -----------------------------

def test_correlation_id_minted_and_echoed(ctx):
    r = ctx["client"].get("/health")
    assert r.status_code == 200
    cid = r.headers.get("x-correlation-id")
    assert cid and cid.startswith("req_")


def test_inbound_correlation_id_is_honored(ctx):
    supplied = "trace-abc123DEF"
    r = ctx["client"].get("/health", headers={"X-Correlation-Id": supplied})
    assert r.headers.get("x-correlation-id") == supplied


@pytest.mark.parametrize("bad", [
    "with space",                 # whitespace
    "line\ninjection",            # newline → log forging
    "x" * 65,                     # over the 64-char bound
    "\x00ctrl",                   # control char
    "",                           # empty
])
def test_unsafe_inbound_correlation_id_is_rejected_and_minted(ctx, bad):
    r = ctx["client"].get("/health", headers={"X-Correlation-Id": bad})
    cid = r.headers.get("x-correlation-id")
    assert cid and cid.startswith("req_")   # server minted its own
    assert cid != bad


# ----------------------------- correlation id == envelope request_id -----------------------------

def test_error_envelope_request_id_is_the_correlation_id(ctx):
    """A client-visible error ties straight to the access log: error.request_id == the response
    X-Correlation-Id == the access line's correlation_id."""
    r = ctx["client"].get("/profile")   # no token → 401 envelope
    assert r.status_code == 401
    header_cid = r.headers.get("x-correlation-id")
    body_cid = r.json()["error"]["request_id"]
    assert header_cid == body_cid
    lines = _access_lines(ctx["log"])
    assert lines and lines[-1]["correlation_id"] == header_cid


def test_inbound_id_flows_into_error_envelope(ctx):
    supplied = "client-trace-42"
    r = ctx["client"].get("/profile", headers={"X-Correlation-Id": supplied})
    assert r.status_code == 401
    assert r.json()["error"]["request_id"] == supplied


# ----------------------------- structured access line -----------------------------

def test_access_line_is_json_with_allowlisted_fields_only(ctx):
    t = _enroll(ctx["client"])
    ctx["client"].get("/profile", headers=_h(t))
    lines = _access_lines(ctx["log"])
    assert lines
    line = lines[-1]
    # exactly the envelope keys + the allowlisted access fields — nothing else leaks in
    assert set(line.keys()) == _ALLOWED_ACCESS_KEYS
    assert line["method"] == "GET"
    assert line["route"] == "/profile"
    assert line["status"] == 200
    assert isinstance(line["latency_ms"], (int, float)) and line["latency_ms"] >= 0.0


def test_access_line_logs_route_template_not_concrete_id(ctx):
    """The opaque server-issued id must not reach the logs — the route TEMPLATE is logged instead."""
    t = _enroll(ctx["client"])
    s = ctx["client"].post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    ctx["client"].get(f"/sessions/{s['id']}", headers=_h(t))
    lines = _access_lines(ctx["log"])
    read = [ln for ln in lines if ln["route"].startswith("/sessions/{")]
    assert read, "expected a templated /sessions/{session_id} route line"
    for ln in lines:
        assert s["id"] not in ln["route"]          # concrete id never in the route field
        assert s["id"] not in json.dumps(ln)        # nor anywhere else on the line


# ----------------------------- the no-sensitive-values rule -----------------------------

def test_no_token_or_health_values_in_logs_across_a_full_lifecycle(ctx):
    """Drive token, bodyweight, reps and weights through the request path, then prove none of it is
    in the logs. The strongest BB-28 assertion: there is no code path that logs payload."""
    t = _enroll(ctx["client"], bw=93.7)
    s = ctx["client"].post("/sessions", headers=_h(t), json={"client_request_id": _uid()}).json()
    seq = 0
    for b in s["blocks"]:
        for set_no in range(1, b["target_sets"] + 1):
            seq += 1
            ctx["client"].post(f"/sessions/{s['id']}/sets", headers=_h(t), json={
                "client_event_id": _uid(), "seq": seq, "block_id": b["id"],
                "set_number": set_no, "actual_reps": 7, "actual_weight": b["recommended_weight"]})

    blob = ctx["log"].getvalue()
    assert blob.strip(), "expected access lines to have been emitted"
    # the bearer token must never appear
    assert t not in blob
    # health/payload values and their keys must never appear
    assert "93.7" not in blob                # bodyweight
    for key in ("bodyweight", "actual_reps", "actual_weight", "authorization", "bearer", "token"):
        assert key.lower() not in blob.lower()
    # and structurally: every line carries only the allowlisted keys
    for ln in _access_lines(ctx["log"]):
        assert set(ln.keys()) == _ALLOWED_ACCESS_KEYS


# ----------------------------- operator-access audit (BB-22) -----------------------------

def test_granted_operator_access_is_audited(ctx):
    """A valid operator-key call emits one `operator_access` audit line: outcome granted, the route
    template, INFO level — and never the key."""
    _enroll(ctx["client"])   # POST /internal/athletes behind the operator key
    ops = _events(ctx["log"], "operator_access")
    assert ops, "expected an operator_access audit line"
    last = ops[-1]
    assert last["outcome"] == "granted"
    assert last["route"] == "/internal/athletes"
    assert last["method"] == "POST"
    assert last["level"] == "INFO"
    assert OPERATOR_KEY not in json.dumps(last)


def test_denied_operator_access_is_audited_at_warning(ctx):
    """A wrong/absent operator key is audited as `denied` at WARNING (the intrusion/misconfig signal
    for alerting) and still 401s — distinct from an athlete-token 401."""
    r = ctx["client"].post("/internal/athletes", headers={"x-operator-key": "wrong-key"},
                           json={"athlete_id": "x", "sex": "male", "age": 30,
                                 "experience": "intermediate"})
    assert r.status_code == 401
    ops = _events(ctx["log"], "operator_access")
    assert ops and ops[-1]["outcome"] == "denied"
    assert ops[-1]["level"] == "WARNING"


def test_operator_key_never_appears_in_logs(ctx):
    """The shared operator secret must never reach the log stream on any operator path."""
    _enroll(ctx["client"])
    ctx["client"].get("/internal/metrics", headers={"x-operator-key": OPERATOR_KEY})
    ctx["client"].get("/internal/metrics", headers={"x-operator-key": "guess"})
    assert OPERATOR_KEY not in ctx["log"].getvalue()
