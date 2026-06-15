"""
Request dependencies (BB-9 connection, BB-19 auth, BB-24 throttle).

Holds the small app config (DB path, operator key) and the FastAPI dependencies the routers use:
  - `get_request_db`     — a per-request `RequestDatabase` (connection-per-request, BB-9), closed
    on teardown.
  - `require_athlete`     — extract `Authorization: Bearer …`, throttle auth failures (BB-24),
    derive `athlete_id` from the token (BB-19/20); missing/invalid/revoked → 401. The returned
    `athlete_id` is the ONLY athlete identity a handler may use — never a client-supplied id.
  - `require_operator`    — operator key for the `/internal/*` surface (BB-22/23), never reachable
    from an athlete bearer token. Every operator-scope access — **granted or denied** — emits one
    structured `operator_access` audit line (BB-22 "operator access logged"); the key itself is
    never logged and the comparison is constant-time.

CONCEPTUAL LOCATION: app/deps.py.
"""
from __future__ import annotations

import hmac
import logging
import os
from dataclasses import dataclass

from fastapi import Request

from .connection import request_database
from . import auth, errors, observability

DEFAULT_REST_SECONDS = 120  # contract §3.2: render-only, no domain effect


@dataclass
class Settings:
    db_path: str
    operator_key: str | None = None


_settings: Settings | None = None
_throttle = auth.AuthThrottle()


def configure(db_path: str, operator_key: str | None = None) -> Settings:
    """Set the process config (called by `create_app`)."""
    global _settings
    _settings = Settings(db_path=db_path, operator_key=operator_key)
    return _settings


def get_settings() -> Settings:
    if _settings is None:
        # Lazy default for dev: a file DB beside the process.
        configure(os.environ.get("HUSH_DB_PATH", "hush.db"),
                  os.environ.get("HUSH_OPERATOR_KEY"))
    assert _settings is not None
    return _settings


def get_request_db():
    """FastAPI dependency: a per-request RequestDatabase, always closed (BB-9)."""
    with request_database(get_settings().db_path) as db:
        yield db


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def require_athlete(request: Request) -> str:
    """Derive athlete_id from the bearer token (BB-19). Opens its own short-lived connection for
    the token lookup so it is independent of the handler's write connection. 401 on
    missing/invalid/revoked; 429 when a source has exceeded the auth-failure window (BB-24)."""
    source = request.client.host if request.client else "unknown"
    if _throttle.is_blocked(source):
        raise errors.rate_limited("too many failed auth attempts")

    token = _bearer(request)
    with request_database(get_settings().db_path) as db:
        athlete_id = auth.resolve_athlete(db.conn, token)
    if athlete_id is None:
        _throttle.record_failure(source)
        raise errors.unauthenticated()
    _throttle.reset(source)
    return athlete_id


def require_operator(request: Request) -> bool:
    """Operator-key gate for /internal/* (BB-22/23). The athlete bearer token has no path here.

    Comparison is constant-time. Every call emits one `operator_access` audit line (BB-22 —
    "operator access logged"): the route TEMPLATE (never a concrete id), the method, and the
    outcome `granted|denied`. A denied attempt logs at WARNING so log-shipping/alerting (BB-27/29)
    can surface operator-key brute-force or misconfiguration. The key is never placed in the log."""
    settings = get_settings()
    key = request.headers.get("x-operator-key", "")
    granted = bool(settings.operator_key) and hmac.compare_digest(key, settings.operator_key)

    route = getattr(request.scope.get("route"), "path", None) or request.scope.get("path", "")
    observability.log_event(
        "operator_access",
        level=logging.INFO if granted else logging.WARNING,
        route=route, method=request.method, outcome="granted" if granted else "denied",
    )

    if not granted:
        raise errors.unauthenticated("operator key required")
    return True
