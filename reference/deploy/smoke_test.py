#!/usr/bin/env python3
"""
End-to-end HTTP smoke test (BB-14 staging dress-rehearsal / BB-30 deploy gate).

The API pytest suite exercises the contract *in-process* (FastAPI `TestClient`). This script
exercises the **same lifecycle over real HTTP against a running server** — the thing a staging /
production deploy must pass before traffic is allowed (and the thing `TestClient` cannot prove:
that the ASGI server, ingress, auth header plumbing, and `/internal/*` restriction actually work
end-to-end on the wire).

It is dependency-free (stdlib `urllib` only, like `ops_monitor.py`) so Operations can run it from a
bare Python on the bastion host pointed at the deployed URL. It computes nothing about the model —
it drives the public athlete lifecycle + the operator surface and asserts the contract shapes.

Flow (one synthetic athlete, throwaway):
  health → operator-enrolls an athlete → negative auth checks → profile → compose session →
  report every set → complete → idempotent replay (no double-learn) → operator audit reconstruct →
  A7 gate + metrics readable behind the operator key.

Usage:
    # against a deployed/staging server (Operations):
    HUSH_OPERATOR_KEY=<key> python deploy/smoke_test.py --base-url https://hush.staging

    # self-contained: boot the assembled app on a temp DB + port, smoke it, tear down (CI / local):
    python deploy/smoke_test.py --self

Exit code 0 = all checks passed; 1 = a check failed (deploy is NOT healthy); 2 = harness/setup error.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSEMBLED = os.path.join(ROOT, "build", "_assembled")

CLASS_A = {"horizontal_push", "horizontal_pull", "vertical_push", "knee_dominant", "hip_dominant"}


class SmokeError(AssertionError):
    """A contract assertion failed against the running server."""


class Client:
    """Tiny stdlib HTTP client returning (status, json-or-None)."""

    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")

    def request(self, method: str, path: str, *, headers=None, body=None):
        url = self.base + path
        data = None
        hdrs = dict(headers or {})
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            hdrs["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, (json.loads(raw) if raw else None)
            except json.JSONDecodeError:
                return e.code, None

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, **kw):
        return self.request("POST", path, **kw)

    def patch(self, path, **kw):
        return self.request("PATCH", path, **kw)


def _uid() -> str:
    return uuid.uuid4().hex


def check(cond, msg):
    if not cond:
        raise SmokeError(msg)


def run_smoke(base_url: str, operator_key: str) -> None:
    c = Client(base_url)
    op_headers = {"x-operator-key": operator_key}

    # 1. liveness
    st, body = c.get("/health")
    check(st == 200, f"/health -> {st}")
    check(body and body.get("status") == "ok", f"/health body {body}")
    check(body.get("schema_version") is not None, "/health missing schema_version")
    print(f"  [ok] /health  schema_version={body['schema_version']}")

    # 2. negative auth: operator surface closed, athlete surface closed
    st, _ = c.post("/internal/athletes", body={"athlete_id": "x", "sex": "male",
                                               "age": 30, "experience": "intermediate"})
    check(st == 401, f"/internal/athletes without operator key -> {st} (expected 401)")
    st, _ = c.get("/profile")
    check(st == 401, f"/profile without token -> {st} (expected 401)")
    print("  [ok] unauthenticated operator + athlete calls rejected (401)")

    # 3. operator enrolls a throwaway athlete
    ath = f"smoke_{_uid()[:8]}"
    st, body = c.post("/internal/athletes", headers=op_headers, body={
        "athlete_id": ath, "sex": "male", "age": 30,
        "experience": "intermediate", "bodyweight_kg": 82.5})
    check(st == 200, f"enroll -> {st} {body}")
    token = body["token"]
    auth = {"Authorization": f"Bearer {token}"}
    print(f"  [ok] operator enrolled athlete {ath}")

    # 4. profile is readable + version-stamped (BB-4)
    st, prof = c.get("/profile", headers=auth)
    check(st == 200, f"/profile -> {st}")
    check(prof["id"] == ath, "profile id mismatch")
    check(prof.get("model_version") and prof.get("capability_model_version"),
          "profile missing model version stamps")
    print(f"  [ok] /profile  model_version={prof['model_version']}")

    # 5. compose a session
    st, sess = c.post("/sessions", headers=auth, body={"client_request_id": _uid()})
    check(st == 201, f"compose /sessions -> {st} {sess}")
    check(sess["id"].startswith("ws_"), "session id shape")
    check(sess.get("model_version") and sess.get("capability_model_version")
          and sess.get("catalog_version"), "session missing version stamps")
    check(len(sess["blocks"]) >= 1, "session has no blocks")
    for b in sess["blocks"]:
        check(b["capability"] in CLASS_A, f"non-Class-A capability {b['capability']}")
    sid = sess["id"]
    print(f"  [ok] composed session {sid} with {len(sess['blocks'])} block(s)")

    # 6. report every set across every block
    seq = 0
    first_event = None
    first_block = sess["blocks"][0]
    for b in sess["blocks"]:
        for set_no in range(1, b["target_sets"] + 1):
            seq += 1
            ev = _uid()
            if first_event is None:
                first_event = ev
            st, rep = c.post(f"/sessions/{sid}/sets", headers=auth, body={
                "client_event_id": ev, "seq": seq, "block_id": b["id"],
                "set_number": set_no, "actual_reps": 8,
                "actual_weight": b["recommended_weight"]})
            check(st == 200, f"report set -> {st} {rep}")
            check(rep["next"]["kind"] in ("next_set", "next_block", "session_complete"),
                  f"unexpected next kind {rep['next']}")
    print(f"  [ok] reported {seq} set(s) across the session")

    # 7. idempotent replay of the FIRST set event -> same observation, no double-learn (BB-1)
    st, replay = c.post(f"/sessions/{sid}/sets", headers=auth, body={
        "client_event_id": first_event, "seq": 1, "block_id": first_block["id"],
        "set_number": 1, "actual_reps": 8,
        "actual_weight": first_block["recommended_weight"]})
    check(st == 200, f"idempotent replay -> {st}")
    print("  [ok] idempotent set replay accepted (anti-double-apply)")

    # 8. complete the session
    st, comp = c.post(f"/sessions/{sid}/complete", headers=auth, body={"client_event_id": _uid()})
    check(st == 200, f"complete -> {st} {comp}")
    check(comp["session"]["status"] == "completed", "session not completed")
    print("  [ok] session completed")

    # 9. operator audit reconstruct is reachable + non-empty
    st, audit = c.get(f"/internal/audit/sessions/{sid}", headers=op_headers)
    check(st == 200, f"operator audit -> {st}")
    check(audit is not None, "audit reconstruct empty")
    # an athlete token must NOT reach the operator surface
    st, _ = c.get(f"/internal/audit/sessions/{sid}", headers=auth)
    check(st in (401, 403, 404), f"athlete token reached /internal -> {st}")
    print("  [ok] operator audit reconstruct readable; athlete token cannot reach /internal")

    # 10. the ARMED A7 gate + metrics export are readable behind the operator key (BB-11/BB-32)
    st, gate = c.get("/internal/gate/a7", headers=op_headers)
    check(st == 200, f"/internal/gate/a7 -> {st}")
    check("armed" in gate, "a7 gate payload missing 'armed'")
    st, metrics = c.get("/internal/metrics", headers=op_headers)
    check(st == 200, f"/internal/metrics -> {st}")
    print(f"  [ok] A7 gate readable (armed={gate.get('armed')}); /internal/metrics export readable")


def _wait_healthy(base_url: str, timeout_s: float = 30.0) -> bool:
    deadline = time.time() + timeout_s
    c = Client(base_url)
    while time.time() < deadline:
        try:
            st, _ = c.get("/health")
            if st == 200:
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def _run_self() -> int:
    """Boot the assembled app under uvicorn on a temp DB + ephemeral port, smoke it, tear down."""
    if not os.path.isdir(os.path.join(ASSEMBLED, "app")):
        print("assembled tree not found — run build/_verify/assemble_and_test.py first", file=sys.stderr)
        return 2
    port = int(os.environ.get("HUSH_SMOKE_PORT", "8123"))
    operator_key = "smoke-operator-key"
    tmp_db = os.path.join(tempfile.mkdtemp(prefix="hush_smoke_"), "hush_smoke.db")
    env = dict(os.environ)
    env["PYTHONPATH"] = ASSEMBLED + os.pathsep + env.get("PYTHONPATH", "")
    env["HUSH_DB_PATH"] = tmp_db
    env["HUSH_OPERATOR_KEY"] = operator_key
    env["HUSH_AUTOCREATE_APP"] = "1"
    base_url = f"http://127.0.0.1:{port}"
    # Send server output to a logfile, NOT a PIPE: the app emits one structured access line per
    # request and an undrained pipe would deadlock the server once its OS buffer fills.
    log_path = os.path.join(os.path.dirname(tmp_db), "server.log")
    log_fh = open(log_path, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.app_main:app",
         "--host", "127.0.0.1", "--port", str(port), "--workers", "1", "--log-level", "warning"],
        env=env, stdout=log_fh, stderr=subprocess.STDOUT,
    )
    try:
        if not _wait_healthy(base_url):
            log_fh.flush()
            with open(log_path, "r", encoding="utf-8", errors="replace") as fh:
                print(f"server did not become healthy:\n{fh.read()}", file=sys.stderr)
            return 2
        return _smoke_and_report(base_url, operator_key)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log_fh.close()


def _smoke_and_report(base_url: str, operator_key: str) -> int:
    print(f"smoke: {base_url}")
    try:
        run_smoke(base_url, operator_key)
    except SmokeError as e:
        print(f"\nSMOKE FAILED: {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 — surface any transport/harness error distinctly
        print(f"\nSMOKE ERROR (harness/transport): {e}", file=sys.stderr)
        return 2
    print("\nSMOKE PASSED -- the running service satisfies the lifecycle contract.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hush v1 end-to-end HTTP smoke test.")
    parser.add_argument("--base-url", help="running server base URL (e.g. https://hush.staging)")
    parser.add_argument("--self", dest="self_mode", action="store_true",
                        help="boot the assembled app locally, smoke it, tear down")
    args = parser.parse_args(argv)

    if args.self_mode:
        return _run_self()

    if not args.base_url:
        parser.error("provide --base-url <url> (or --self to boot a local instance)")
    operator_key = os.environ.get("HUSH_OPERATOR_KEY")
    if not operator_key:
        parser.error("set HUSH_OPERATOR_KEY for the operator-surface checks")
    return _smoke_and_report(args.base_url, operator_key)


if __name__ == "__main__":
    raise SystemExit(main())
