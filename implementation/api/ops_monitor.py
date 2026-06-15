"""
Operational health & safety monitor (BB-27 operational watcher; operationalizes the BB-11 A7 gate).

The A7 week-1 seed-safety gate is the single HARD Phase-1 gate and it is ARMED (OD-8 ratified
thresholds). An armed hard-stop with nothing watching it is operationally incomplete: when a cohort
shows unsafe seeds the gate flips to PAUSE_AND_REANCHOR, and *someone must be paged* to stop the ramp
and re-anchor ES-008 v2 (never field-tune — KL-9). This module is that watcher.

It polls the deployed service's operator surface and renders a severity-graded report suitable for a
cron job / alerting pipeline:

    /health                 — liveness (is the service up + DB brought forward)
    /internal/gate/a7       — the HARD safety gate (PAUSE_AND_REANCHOR = page someone)
    /internal/metrics       — trial-health + A8/A9 validation drift (operational signals only)

Severity → exit code:  OK → 0,  WARN → 1,  CRITICAL → 2  (worst finding wins). Cron/alerting wire the
exit code (and/or the emitted JSON line on logger `hush.ops`) to their pager.

DESIGN
  * The evaluators (`check_*`) are PURE: payload in, `Finding` out — unit-testable with no I/O.
  * The orchestrator takes an injected `getter` callable `(path, operator) -> Resp`, so the SAME code
    runs against a live URL (the stdlib `UrllibGetter`, zero extra runtime deps) and against an
    in-process `fastapi.testclient.TestClient` (the test getter). One implementation, two transports.
  * It computes NOTHING about the model. It reads the gate verdict and the export and grades
    operational severity. The A7 thresholds live in `a7_gate` (RATIFIED, OD-8); this watcher must
    never re-decide them. The metrics-derived WARNINGs here are *operational hygiene* heuristics
    (e.g. an override-rate spike worth a human look) — explicitly NOT model gates.

This module is import-safe (no side effects) and has no third-party dependencies, so Operations can
run it from a bare Python on the bastion/cron host pointed at the deployed URL.

CONCEPTUAL LOCATION: app/ops_monitor.py.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field, asdict

# ----------------------------- severities -----------------------------

OK = "OK"
WARN = "WARN"
CRITICAL = "CRITICAL"

_SEVERITY_RANK = {OK: 0, WARN: 1, CRITICAL: 2}
_SEVERITY_EXIT = {OK: 0, WARN: 1, CRITICAL: 2}


def worst(severities) -> str:
    """The highest severity in an iterable (OK if empty)."""
    return max(severities, key=lambda s: _SEVERITY_RANK[s], default=OK)


@dataclass(frozen=True)
class Finding:
    check: str
    severity: str
    summary: str
    detail: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Resp:
    """A transport-neutral response: HTTP status, parsed JSON body, and a transport error string.
    `error` is set (and status_code 0) when the request could not be completed at all."""
    status_code: int
    body: dict
    error: str = ""


@dataclass(frozen=True)
class MonitorConfig:
    """Operational WARN heuristics — NOT model gates. Defaults are deliberately loose; tune per-trial.
    `override_rate_warn`: an A9 server-detected-override rate above this is worth an operator's eyes
    (directional only — a high override rate can mean the day-1 seed is mis-prescribing; the *gate*
    verdict is A7, this is just a nudge to look). `expect_data`: when True, a reachable but empty
    trial (0 athletes) is a WARN (the monitor was pointed at a trial that should have enrollees)."""
    override_rate_warn: float = 0.25
    expect_data: bool = False


# ----------------------------- pure evaluators -----------------------------

def check_health(resp: Resp) -> Finding:
    if resp.error:
        return Finding("health", CRITICAL, f"service unreachable: {resp.error}", {"error": resp.error})
    if resp.status_code != 200:
        return Finding("health", CRITICAL, f"/health returned {resp.status_code}",
                       {"status_code": resp.status_code, "body": resp.body})
    status = resp.body.get("status")
    if status != "ok":
        return Finding("health", CRITICAL, f"service reports status={status!r}", {"body": resp.body})
    return Finding("health", OK, "service healthy",
                   {"schema_version": resp.body.get("schema_version")})


def check_a7_gate(resp: Resp) -> Finding:
    """The single hard safety gate. PAUSE_AND_REANCHOR is the page-someone state. A gate running on
    non-ratified (custom) thresholds is itself a WARN — the deployed watcher should see the armed
    OD-8 gate, not a caller-tuned one."""
    if resp.error:
        return Finding("a7_gate", CRITICAL, f"A7 gate unreachable: {resp.error}", {"error": resp.error})
    if resp.status_code in (401, 403):
        return Finding("a7_gate", CRITICAL,
                       f"A7 gate denied operator access ({resp.status_code}) — bad operator key?",
                       {"status_code": resp.status_code})
    if resp.status_code != 200:
        return Finding("a7_gate", CRITICAL, f"/internal/gate/a7 returned {resp.status_code}",
                       {"status_code": resp.status_code, "body": resp.body})

    overall = resp.body.get("overall")
    armed = resp.body.get("armed")
    unsafe = list(resp.body.get("unsafe_cohorts") or [])
    detail = {
        "overall": overall,
        "armed": armed,
        "unsafe_cohorts": unsafe,
        "thresholds_status": resp.body.get("thresholds_status"),
    }

    if overall == "PAUSE_AND_REANCHOR":
        return Finding(
            "a7_gate", CRITICAL,
            f"A7 HARD STOP: unsafe seeds in cohort(s) {unsafe} — pause the ramp and re-anchor "
            f"ES-008 v2 (never field-tune, KL-9)",
            detail,
        )
    if armed is False:
        return Finding("a7_gate", WARN,
                       "A7 gate is NOT armed (running on custom/non-ratified thresholds)", detail)
    if overall == "PROCEED":
        return Finding("a7_gate", OK, "A7 gate: PROCEED (no unsafe cohort)", detail)
    if overall == "AWAIT_DATA":
        return Finding("a7_gate", OK, "A7 gate: AWAIT_DATA (insufficient cohort coverage yet)", detail)
    return Finding("a7_gate", WARN, f"A7 gate: unexpected overall={overall!r}", detail)


def check_metrics(resp: Resp, config: MonitorConfig) -> Finding:
    """Operational read of the validation export (trial health + A9 override rate). Operational
    signals only — never re-decides a model gate."""
    if resp.error:
        return Finding("metrics", CRITICAL, f"metrics unreachable: {resp.error}", {"error": resp.error})
    if resp.status_code in (401, 403):
        return Finding("metrics", CRITICAL,
                       f"metrics denied operator access ({resp.status_code}) — bad operator key?",
                       {"status_code": resp.status_code})
    if resp.status_code != 200:
        return Finding("metrics", CRITICAL, f"/internal/metrics returned {resp.status_code}",
                       {"status_code": resp.status_code, "body": resp.body})

    health = resp.body.get("trial_health") or {}
    overrides = resp.body.get("a9_overrides") or {}
    shadow = resp.body.get("a8_shadow_paired") or {}
    override_rate = float(overrides.get("override_rate", 0.0) or 0.0)
    detail = {
        "trial_health": health,
        "override_rate": override_rate,
        "n_overrides": overrides.get("n_overrides"),
        "a8_model_no_worse_frac": shadow.get("model_no_worse_than_shadow_frac"),
    }

    if config.expect_data and int(health.get("athletes", 0) or 0) == 0:
        return Finding("metrics", WARN,
                       "trial export is empty (0 athletes) but data was expected", detail)
    if override_rate > config.override_rate_warn:
        return Finding(
            "metrics", WARN,
            f"A9 override rate {override_rate:.3f} > {config.override_rate_warn:.3f} "
            f"(directional - review day-1 seeding; not a gate)",
            detail,
        )
    return Finding("metrics", OK,
                   f"trial health nominal ({health.get('athletes', 0)} athletes, "
                   f"override rate {override_rate:.3f})", detail)


# ----------------------------- orchestration -----------------------------

def build_report(findings: list[Finding]) -> dict:
    """Aggregate findings into an overall verdict + exit code (worst finding wins)."""
    overall = worst([f.severity for f in findings])
    return {
        "monitor": "hush_ops_monitor",
        "overall": overall,
        "exit_code": _SEVERITY_EXIT[overall],
        "findings": [asdict(f) for f in findings],
    }


def run_monitor(getter, config: MonitorConfig | None = None) -> dict:
    """Run all checks via the injected `getter(path) -> Resp` and return the aggregated report.

    `getter` is any callable that takes an operator-authenticated path and returns a `Resp`; the
    transport (live HTTP vs in-process TestClient) is the caller's choice. Order matters only for the
    report: health first, then the hard gate, then the export."""
    config = config or MonitorConfig()
    findings = [
        check_health(getter("/health")),
        check_a7_gate(getter("/internal/gate/a7")),
        check_metrics(getter("/internal/metrics"), config),
    ]
    return build_report(findings)


# ----------------------------- transports -----------------------------

class UrllibGetter:
    """Stdlib HTTP getter (zero third-party deps) for the deployed service. Sends the operator key
    on every request; `/health` is public but the header is harmless there. Any transport failure
    (DNS/connection/timeout) is surfaced as a `Resp` with `error` set, never raised — the monitor
    must degrade to a CRITICAL finding, not crash."""

    def __init__(self, base_url: str, operator_key: str | None, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.operator_key = operator_key
        self.timeout = timeout

    def __call__(self, path: str) -> Resp:
        url = self.base_url + path
        req = urllib.request.Request(url, method="GET")
        if self.operator_key:
            req.add_header("x-operator-key", self.operator_key)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return Resp(r.status, _read_json(r.read()))
        except urllib.error.HTTPError as e:  # 4xx/5xx: a real HTTP status we can grade
            return Resp(e.code, _read_json(e.read() if hasattr(e, "read") else b""))
        except (urllib.error.URLError, OSError, ValueError) as e:  # could not complete at all
            return Resp(0, {}, error=str(e))


class ClientGetter:
    """In-process getter over a `fastapi.testclient.TestClient` (or any object with a `.get(path,
    headers=...)` returning `.status_code` + `.json()`). Used by the test suite and usable for a
    smoke check against a freshly-built app."""

    def __init__(self, client, operator_key: str | None):
        self.client = client
        self.headers = {"x-operator-key": operator_key} if operator_key else {}

    def __call__(self, path: str) -> Resp:
        try:
            r = self.client.get(path, headers=self.headers)
        except Exception as e:  # transport-level failure parity with UrllibGetter
            return Resp(0, {}, error=str(e))
        try:
            body = r.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {"value": body}
        return Resp(r.status_code, body)


def _read_json(raw: bytes) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


# ----------------------------- CLI -----------------------------

def configure_logging() -> logging.Logger:
    log = logging.getLogger("hush.ops")
    if not log.handlers:
        h = logging.StreamHandler(sys.stderr)
        h.setFormatter(logging.Formatter("%(message)s"))
        log.addHandler(h)
        log.setLevel(logging.INFO)
    return log


def _format_human(report: dict) -> str:
    lines = [f"hush ops monitor -- OVERALL: {report['overall']} (exit {report['exit_code']})"]
    for f in report["findings"]:
        lines.append(f"  [{f['severity']:<8}] {f['check']:<9} {f['summary']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.ops_monitor",
        description="Operational health & safety monitor for the Hush v1 service (watches the ARMED "
                    "A7 seed-safety gate). Exit 0=OK, 1=WARN, 2=CRITICAL — wire into cron/alerting.")
    parser.add_argument("--base-url", default=os.environ.get("HUSH_BASE_URL", "http://127.0.0.1:8000"),
                        help="deployed service base URL (default $HUSH_BASE_URL or http://127.0.0.1:8000)")
    parser.add_argument("--operator-key", default=os.environ.get("HUSH_OPERATOR_KEY"),
                        help="operator key for /internal/* (default $HUSH_OPERATOR_KEY)")
    parser.add_argument("--timeout", type=float, default=10.0, help="per-request timeout seconds")
    parser.add_argument("--override-rate-warn", type=float, default=MonitorConfig.override_rate_warn,
                        help="WARN if A9 override rate exceeds this (operational heuristic, not a gate)")
    parser.add_argument("--expect-data", action="store_true",
                        help="WARN if the trial export is empty (0 athletes)")
    parser.add_argument("--json", action="store_true", help="emit the report as a JSON line on stdout")
    args = parser.parse_args(argv)

    log = configure_logging()
    if not args.operator_key:
        log.warning("no operator key set — /internal/* checks will report CRITICAL (denied access)")

    getter = UrllibGetter(args.base_url, args.operator_key, timeout=args.timeout)
    config = MonitorConfig(override_rate_warn=args.override_rate_warn, expect_data=args.expect_data)
    report = run_monitor(getter, config)

    if args.json:
        print(json.dumps(report))
    else:
        print(_format_human(report))
    # one structured line on the ops logger regardless, for log shipping
    log.info(json.dumps({"event": "ops_monitor", **{k: report[k] for k in ("overall", "exit_code")}}))
    return report["exit_code"]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
