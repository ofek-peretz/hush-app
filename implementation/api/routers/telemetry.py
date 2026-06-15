"""
Research event ingest (the durable dataset, NOT operational logs). Athlete-scoped; athlete_id is
derived from the token (never trusted from the body). Each event is persisted append-only into
`athlete_event` — idempotent on the client-generated `event_id` — so the behavioral dataset is
durable, queryable, and joinable to the model's recommendations/observations/capabilities for
training, evaluation, trust analysis, retention, personalization, and preference/causal study.

  POST /telemetry  — { "events": [ {event_id?, type, client_ts?, client_monotonic?, seq?,
                                    session_id?, app_version?, os?, device_id?, locale?,
                                    network?, data?} ] }  -> { "accepted": n }

Design (research dataset, not telemetry):
  - APPEND-ONLY (INSERT OR IGNORE on event_id) — never updated/deleted; exactly-once under retry.
  - `data` serialized as a bounded JSON string of non-sensitive structural fields.
  - One structured operational log line per batch (count only) for ops; the DATA lives in the table.

CONCEPTUAL LOCATION: app/routers/telemetry.py.
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends

from hush_model.persistence.db import now_iso

from ..deps import require_athlete, get_request_db
from ..schemas import TelemetryRequest
from ..observability import log_event

router = APIRouter()

_MAX_EVENTS = 500          # per request (the client batches ~100)
_MAX_DATA_CHARS = 4000     # bound the serialized context


@router.post("/telemetry")
def ingest_events(
    body: TelemetryRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
) -> dict:
    accepted = 0
    now = now_iso()
    with db.transaction() as conn:
        for e in body.events[:_MAX_EVENTS]:
            event_id = e.event_id or uuid.uuid4().hex
            data = json.dumps(e.data or {}, separators=(",", ":"), sort_keys=True)[:_MAX_DATA_CHARS]
            # Append-only, idempotent on event_id (a retried batch never doubles a row).
            conn.execute(
                "INSERT OR IGNORE INTO athlete_event"
                " (event_id, athlete_id, session_id, type, server_ts, client_ts, client_monotonic,"
                "  seq, app_version, os, device_id, locale, network, data)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (event_id, athlete_id, e.session_id, e.type, now, e.client_ts, e.client_monotonic,
                 e.seq, e.app_version, e.os, e.device_id, e.locale, e.network, data),
            )
            accepted += 1
    log_event("client_events_ingested", athlete_id=athlete_id, count=accepted)
    return {"accepted": accepted}
