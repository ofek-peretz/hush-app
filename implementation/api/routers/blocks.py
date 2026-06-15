"""
Block-level write endpoints (API contract §5.1/§8) — idempotent on client_event_id (BB-1).

  POST /blocks/{id}/skip      — decline an exercise (welcomed path, no observation) → 200
  POST /blocks/{id}/replace   — L2 REPLACE (preference-driven, capability-preserving, A9) → 200

CONCEPTUAL LOCATION: app/routers/blocks.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import require_athlete, get_request_db
from ..schemas import SkipRequest, ReplaceRequest, UnavailableRequest
from ..idempotency import handle_idempotent
from .. import lifecycle

router = APIRouter()


@router.post("/blocks/{block_id}/skip")
def skip_block(
    block_id: str,
    body: SkipRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_event_id,
        lambda _conn: lifecycle.skip_block(db, athlete_id, block_id, body),
    )
    return response


@router.post("/blocks/{block_id}/replace")
def replace_block(
    block_id: str,
    body: ReplaceRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_event_id,
        lambda _conn: lifecycle.replace_block(db, athlete_id, block_id, body),
    )
    return response


@router.post("/blocks/{block_id}/unavailable")
def resolve_unavailable(
    block_id: str,
    body: UnavailableRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_event_id,
        lambda _conn: lifecycle.resolve_unavailable(db, athlete_id, block_id, body),
    )
    return response
