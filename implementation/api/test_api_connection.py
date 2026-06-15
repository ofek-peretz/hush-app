"""
Connection-model tests (BB-9 / BB-2 / ATD-20) — the production-shell gap the sim never exercised:
connection-per-request, the re-entrant transaction that makes idempotency atomic with the learning
chain, write serialization under concurrency, and migration on a populated DB.

CONCEPTUAL LOCATION: build/_assembled/tests/test_api_connection.py.
"""
from __future__ import annotations

import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.app_main import create_app
from app.connection import (
    init_database, open_connection, request_database, RequestDatabase,
)
from app.idempotency import handle_idempotent
from hush_model.persistence.db import Database
from hush_model.persistence.migrations.runner import run_migrations, SCHEMA_VERSION

OPERATOR_KEY = "op-secret-key"


def _uid() -> str:
    return uuid.uuid4().hex


# ----------------------------- re-entrant transaction (BB-2) -----------------------------

def test_reentrant_transaction_rolls_back_whole_unit(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    with request_database(path) as db:
        with pytest.raises(RuntimeError):
            with db.transaction() as c:
                c.execute("INSERT INTO idempotency_key VALUES (?,?,?,?)", ("a", "k1", "{}", "t"))
                with db.transaction() as c2:   # nested: joins the outer unit
                    c2.execute("INSERT INTO idempotency_key VALUES (?,?,?,?)", ("a", "k2", "{}", "t"))
                    raise RuntimeError("mid-chain fault")
        # any exception anywhere rolls the WHOLE nested unit back — nothing committed
        assert db.conn.execute("SELECT COUNT(*) FROM idempotency_key").fetchone()[0] == 0


def test_reentrant_transaction_commits_once(tmp_path):
    path = str(tmp_path / "x.db")
    init_database(path)
    with request_database(path) as db:
        with db.transaction() as c:
            c.execute("INSERT INTO idempotency_key VALUES (?,?,?,?)", ("a", "k1", "{}", "t"))
            with db.transaction() as c2:
                c2.execute("INSERT INTO idempotency_key VALUES (?,?,?,?)", ("a", "k2", "{}", "t"))
    # committed to disk: a fresh connection sees both rows
    conn2 = open_connection(path)
    try:
        assert conn2.execute("SELECT COUNT(*) FROM idempotency_key").fetchone()[0] == 2
    finally:
        conn2.close()


def test_idempotency_apply_and_record_atomic_under_fault(tmp_path):
    """BB-1/BB-2: a mid-apply fault rolls back BOTH the model write and the idempotency record —
    so a retry does not see a recorded key for a half-applied event."""
    path = str(tmp_path / "x.db")
    init_database(path)

    def apply_then_fail(conn):
        conn.execute(
            "INSERT INTO stagnation_marker(athlete_id, capability, last_surfaced_week, "
            "last_surfaced_state, updated_at) VALUES ('a','c',1.0,'X','t')")
        raise RuntimeError("mid-chain fault")

    with request_database(path) as db:
        with pytest.raises(RuntimeError):
            handle_idempotent(db, "a", "evt-1", apply_then_fail)
    conn = open_connection(path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM stagnation_marker").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM idempotency_key").fetchone()[0] == 0
    finally:
        conn.close()


# ----------------------------- concurrency / write serialization (ATD-20) -----------------------------

def _enroll(client, athlete_id):
    r = client.post("/internal/athletes", headers={"x-operator-key": OPERATOR_KEY},
                    json={"athlete_id": athlete_id, "sex": "male", "age": 30,
                          "experience": "intermediate", "bodyweight_kg": 80.0})
    return r.json()["token"]


def test_concurrent_distinct_sets_all_persist(tmp_path):
    """Connection-per-request + serialized writer: concurrent set reports on one session all
    persist (no lost write), exactly one observation each."""
    path = str(tmp_path / "x.db")
    app = create_app(db_path=path, operator_key=OPERATOR_KEY)
    client = TestClient(app)
    t = _enroll(client, "ath_1")
    s = client.post("/sessions", headers={"Authorization": f"Bearer {t}"},
                    json={"client_request_id": _uid()}).json()
    block = s["blocks"][0]
    n_sets = block["target_sets"]

    def report(set_no):
        return client.post(
            f"/sessions/{s['id']}/sets", headers={"Authorization": f"Bearer {t}"},
            json={"client_event_id": _uid(), "seq": set_no, "block_id": block["id"],
                  "set_number": set_no, "actual_reps": 8, "actual_weight": block["recommended_weight"]})

    with ThreadPoolExecutor(max_workers=n_sets) as ex:
        results = list(ex.map(report, range(1, n_sets + 1)))
    assert all(r.status_code == 200 for r in results), [r.status_code for r in results]

    conn = sqlite3.connect(path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM observation").fetchone()[0] == n_sets
    finally:
        conn.close()


def test_concurrent_same_key_applies_once(tmp_path):
    """BB-1 under concurrency: many simultaneous retries of the SAME client_event_id apply exactly
    once (one observation), and every caller gets the same observation_id."""
    path = str(tmp_path / "x.db")
    app = create_app(db_path=path, operator_key=OPERATOR_KEY)
    client = TestClient(app)
    t = _enroll(client, "ath_1")
    s = client.post("/sessions", headers={"Authorization": f"Bearer {t}"},
                    json={"client_request_id": _uid()}).json()
    block = s["blocks"][0]
    key = _uid()
    body = {"client_event_id": key, "seq": 1, "block_id": block["id"], "set_number": 1,
            "actual_reps": 8, "actual_weight": block["recommended_weight"]}

    def fire(_i):
        return client.post(f"/sessions/{s['id']}/sets",
                           headers={"Authorization": f"Bearer {t}"}, json=body)

    with ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(fire, range(10)))
    assert all(r.status_code == 200 for r in results)
    obs_ids = {r.json()["observation_id"] for r in results}
    assert len(obs_ids) == 1  # response parity across all replays

    conn = sqlite3.connect(path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM observation").fetchone()[0] == 1
    finally:
        conn.close()


# ----------------------------- migration on a populated DB (BB-5 shape) -----------------------------

def test_init_database_idempotent_on_populated_db(tmp_path):
    path = str(tmp_path / "x.db")
    assert init_database(path) == SCHEMA_VERSION
    app = create_app(db_path=path, operator_key=OPERATOR_KEY)
    client = TestClient(app)
    t = _enroll(client, "ath_1")
    s = client.post("/sessions", headers={"Authorization": f"Bearer {t}"},
                    json={"client_request_id": _uid()}).json()
    # bring-forward again on the now-populated DB: no-op, data intact, schema current
    assert init_database(path) == SCHEMA_VERSION
    detail = client.get(f"/sessions/{s['id']}", headers={"Authorization": f"Bearer {t}"})
    assert detail.status_code == 200 and len(detail.json()["blocks"]) >= 1


def test_fresh_and_migrated_have_same_infra_tables(tmp_path):
    """Fresh SCHEMA_SQL DB and a migrated-from-bare DB carry the same web-shell infra tables
    (drift parity for migration 010)."""
    fresh = Database(":memory:")
    fresh_tables = {r[0] for r in fresh.conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    fresh.close()

    bare = sqlite3.connect(":memory:"); bare.row_factory = sqlite3.Row
    bare.execute("""CREATE TABLE athlete (id TEXT PRIMARY KEY, sex TEXT, age INTEGER,
                    experience TEXT, created_at TEXT)""")
    run_migrations(bare)
    migrated_tables = {r[0] for r in bare.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    bare.close()

    for infra in ("idempotency_key", "auth_token"):
        assert infra in fresh_tables and infra in migrated_tables
