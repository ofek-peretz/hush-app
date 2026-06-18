"""
Consent capture (OD-3 / BB-33) — athlete-scoped, append-only, server-timestamped.

Enrollment is operator-mediated (the operator mints the invite token; an operator cannot consent ON
THE ATHLETE'S BEHALF). So the athlete records consent IN-APP after entering the invite — pressing
Continue on the Enrollment screen is the affirmative act, and the client posts it here. This record
is what proves WHO consented to WHAT VERSION WHEN.

  POST /consent   { version, accepted_at?, client_event_id? }  -> { recorded, version, server_ts }
  GET  /consent   -> { version, accepted_at, server_ts } | { version: null }   (latest accepted)

Stored as an append-only `consent_accepted` row in the existing `athlete_event` ledger (NO new table
/ migration): immutable, idempotent on a deterministic event_id (`consent:{athlete}:{version}`),
joinable to the athlete, with the authoritative `server_ts` as the legal timestamp and `data` =
{version, accepted_at(client wall)}. A version bump writes a NEW row (per-version ledger); re-posting
the same version is exactly-once (INSERT OR IGNORE). This keeps consent durable and queryable while
avoiding a schema change — a dedicated `consent_record` table is a later hardening if needed.

CONCEPTUAL LOCATION: app/routers/consent.py.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from hush_model.persistence.db import now_iso

from ..deps import require_athlete, get_request_db
from ..schemas import ConsentRequest

router = APIRouter()

_CONSENT_TYPE = "consent_accepted"
_MAX_VERSION_CHARS = 64


@router.post("/consent")
def record_consent(
    body: ConsentRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
) -> dict:
    version = body.version.strip()[:_MAX_VERSION_CHARS]
    now = now_iso()
    # Deterministic id ⇒ re-accepting the SAME version is exactly-once (append-only ledger).
    event_id = body.client_event_id or f"consent:{athlete_id}:{version}"
    data = json.dumps(
        {"version": version, "accepted_at": body.accepted_at or now},
        separators=(",", ":"), sort_keys=True,
    )
    with db.transaction() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO athlete_event"
            " (event_id, athlete_id, session_id, type, server_ts, client_ts, data)"
            " VALUES (?,?,?,?,?,?,?)",
            (event_id, athlete_id, None, _CONSENT_TYPE, now, body.accepted_at, data),
        )
    return {"recorded": True, "version": version, "server_ts": now}


@router.get("/consent")
def latest_consent(
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
) -> dict:
    with db.transaction() as conn:
        row = conn.execute(
            "SELECT data, server_ts FROM athlete_event"
            " WHERE athlete_id=? AND type=? ORDER BY server_ts DESC LIMIT 1",
            (athlete_id, _CONSENT_TYPE),
        ).fetchone()
    if row is None:
        return {"version": None}
    data = json.loads(row["data"])
    return {
        "version": data.get("version"),
        "accepted_at": data.get("accepted_at"),
        "server_ts": row["server_ts"],
    }
