"""
Structured operational logging + end-to-end correlation id (BB-28, backend half).

A real beta cannot be operated blind: every request needs a stable id that an operator can follow
from the device's sync log, through the server access log, into the contract error envelope (§15).
This module provides that id and the one structured log line per request — and nothing else. It
computes no load, score, or decision; it is pure cross-cutting infrastructure beside the frozen
model, exactly like `auth`/`errors`.

Design (the three BB-28 obligations, server side):

  1. **End-to-end correlation id.** A pure-ASGI middleware reads an inbound `X-Correlation-Id`
     (validated — see below — so a client cannot inject log lines or smuggle data through it) or
     mints a fresh `req_<hex>` one, binds it to a `ContextVar` for the life of the request, echoes
     it back in the `X-Correlation-Id` response header, and exposes it to the error envelope via
     `current_correlation_id()`. The same id therefore appears in the client's failure, the server
     access log, and `error.request_id` — one string ties the three together (the BB-28 / BB-1 /
     BB-28-tracing payoff, cross-cutting thread §7).

  2. **Structured operational logging.** One JSON line per request on logger ``hush.api`` with a
     fixed, *allowlisted* field set: `method`, `route` (the **template**, e.g.
     `/sessions/{session_id}/sets`, never the concrete id), `status`, `latency_ms`, `correlation_id`.
     JSON-per-line is the format an aggregator ingests; the fixed schema makes the lines queryable.

  3. **No-sensitive-values rule, enforced structurally.** The access path logs only the allowlisted
     structural fields above. It never logs request/response **bodies**, **headers**, the bearer
     **token**, or any **health value** (weight / reps / bodyweight / age) — there is simply no code
     path here that reads them. Logging the route *template* (not the concrete path) also keeps the
     opaque server-issued ids (`session_id`, `block_id`, …) and the operator-supplied `athlete_id`
     out of the logs, and keeps cardinality low for aggregation.

What is intentionally NOT here (and why): client-side logging (Mobile — BB-28 names "server & client");
log shipping / retention / alerting (Operations — BB-27/BB-29/BB-30 infra). This is the backend half.

CONCEPTUAL LOCATION: app/observability.py.
"""
from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from starlette.datastructures import Headers

# Header carried in both directions. Lower-cased for ASGI raw-header comparison.
CORRELATION_HEADER = "x-correlation-id"
_CORRELATION_HEADER_B = CORRELATION_HEADER.encode("ascii")

LOGGER_NAME = "hush.api"
ACCESS_EVENT = "http_access"

# The ONLY fields an access line may carry (the no-sensitive-values rule as an allowlist, not a
# scrubber): structural request metadata, never payload. Asserted by the BB-28 tests.
ACCESS_FIELDS = ("method", "route", "status", "latency_ms")

# A correlation id is a bounded, printable-ASCII token. Accepting an unbounded/structured client
# value would let a caller inject newlines (log forging) or smuggle data into the log stream.
_MAX_CORRELATION_LEN = 64

_correlation_id: ContextVar[str | None] = ContextVar("hush_correlation_id", default=None)


# --- correlation id ----------------------------------------------------------------

def current_correlation_id() -> str | None:
    """The correlation id bound to the in-flight request, or None outside a request (e.g. a unit
    test constructing an `ApiError` directly). Callers fall back to a fresh id when None."""
    return _correlation_id.get()


def new_correlation_id() -> str:
    """Mint a fresh server-side id. Same `req_<hex>` shape the error envelope has always used."""
    return f"req_{uuid.uuid4().hex[:12]}"


def sanitize_inbound(value: str | None) -> str | None:
    """Return a client-supplied correlation id only if it is safe to echo into the logs: non-empty,
    ≤64 chars, printable ASCII with no whitespace/control/newline. Anything else → None (mint one).
    This is the log-injection guard — a correlation id is operator-trusted output."""
    if not value:
        return None
    v = value.strip()
    if not v or len(v) > _MAX_CORRELATION_LEN:
        return None
    if not all(33 <= ord(c) <= 126 for c in v):  # printable ASCII, no space/control/newline
        return None
    return v


# --- structured logging ------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    """One compact JSON object per line: ts (UTC ISO-8601), level, logger, event, correlation_id,
    and the event's allowlisted structural fields (carried on `record.fields`). Sorted keys so the
    lines are stable/diffable; no message templating, no exception dumps in the access path."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", None) or record.getMessage(),
            "correlation_id": getattr(record, "correlation_id", None),
        }
        fields = getattr(record, "fields", None)
        if fields:
            payload.update(fields)
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def configure_logging(level: int = logging.INFO, stream=None) -> logging.Logger:
    """Install the JSON formatter on the `hush.api` logger (idempotent — safe to call per
    `create_app`). Logs to stdout for the container runtime to collect (12-factor); `propagate` is
    off so app lines do not double-print through the root logger."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(level)
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    handler = logging.StreamHandler(stream if stream is not None else sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.propagate = False
    return logger


def log_event(event: str, level: int = logging.INFO, **fields) -> None:
    """Emit one structured operational line tagged with the current correlation id. For backend
    code that wants a traceable operational event (e.g. an idempotent replay no-op, a revocation).
    Callers pass only non-sensitive structural fields — same rule as the access log."""
    logging.getLogger(LOGGER_NAME).log(
        level, event,
        extra={"event": event, "correlation_id": _correlation_id.get(), "fields": fields},
    )


# --- middleware --------------------------------------------------------------------

class CorrelationMiddleware:
    """Pure-ASGI middleware (not `BaseHTTPMiddleware`): binds the correlation id in the SAME
    coroutine that calls the app, so the ContextVar reliably reaches the endpoint and the registered
    exception handlers (the BaseHTTPMiddleware task-hop would break that propagation). Wraps `send`
    to capture the status and inject the response header, and emits exactly one access line per HTTP
    request in `finally` (so failures are logged too)."""

    def __init__(self, app, logger: logging.Logger | None = None):
        self.app = app
        self.logger = logger or logging.getLogger(LOGGER_NAME)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inbound = Headers(scope=scope).get(CORRELATION_HEADER)
        cid = sanitize_inbound(inbound) or new_correlation_id()
        cid_b = cid.encode("ascii")
        token = _correlation_id.set(cid)
        # Also expose on request.state for handlers that prefer the Request object.
        scope.setdefault("state", {})["correlation_id"] = cid

        status_holder = {"status": 500}  # if the app dies before response.start

        async def send_wrapper(message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                raw = [(k, v) for (k, v) in (message.get("headers") or [])
                       if k.lower() != _CORRELATION_HEADER_B]
                raw.append((_CORRELATION_HEADER_B, cid_b))
                message["headers"] = raw
            await send(message)

        start = time.perf_counter()
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            latency_ms = round((time.perf_counter() - start) * 1000.0, 3)
            route = scope.get("route")
            route_template = getattr(route, "path", None) or scope.get("path", "")
            self.logger.info(
                ACCESS_EVENT,
                extra={
                    "event": ACCESS_EVENT,
                    "correlation_id": cid,
                    "fields": {
                        "method": scope.get("method"),
                        "route": route_template,
                        "status": status_holder["status"],
                        "latency_ms": latency_ms,
                    },
                },
            )
            _correlation_id.reset(token)
