"""
Session lifecycle write endpoints (API contract §5/§7) — each state-changing POST routes through
`idempotency.handle_idempotent` (BB-1) so a retried event never learns twice.

  POST /sessions                  — compose/start (idempotent on client_request_id) → 201/200
  POST /sessions/{id}/sets        — report a set (idempotent on client_event_id) → 200
  POST /sessions/{id}/complete    — close + pre-compose next (idempotent on client_event_id) → 200

CONCEPTUAL LOCATION: app/routers/sessions.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ..deps import require_athlete, get_request_db
from ..schemas import SessionStartRequest, SetReportRequest, CompleteRequest
from ..idempotency import handle_idempotent
from .. import lifecycle

router = APIRouter()


@router.post("/sessions")
def start_session(
    body: SessionStartRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, replayed = handle_idempotent(
        db, athlete_id, body.client_request_id,
        lambda _conn: lifecycle.compose_session(db, athlete_id),
    )
    # 201 on first create; a replay (or returning an already-active session) is 200.
    status = 200 if replayed else 201
    return JSONResponse(status_code=status, content=response)


@router.post("/sessions/{session_id}/sets")
def report_set(
    session_id: str,
    body: SetReportRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_event_id,
        lambda _conn: lifecycle.report_set(db, athlete_id, session_id, body),
    )
    return response


@router.post("/sessions/{session_id}/complete")
def complete_session(
    session_id: str,
    body: CompleteRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_event_id,
        lambda _conn: lifecycle.complete_session(db, athlete_id, session_id, body),
    )
    return response
