"""
Weekly Program Container endpoints (ratified weekly-program model). Athlete-scoped.

  POST /weeks            — generate the current week (idempotent: returns the active week if one
                           exists). The model composes N workouts as a unit; athlete-owned
                           structure (pins / substitutes / exercise order / workout order) is
                           preserved by composing through the same primitive that consumes it.
  GET  /weeks/current    — the latest week: its workouts (in athlete-owned order), statuses, and
                           the Rest flag (Rest begins only after a week completes).

The athlete completes workouts in ANY order via the existing /sessions/{id}/sets + /complete. The
week completes only when all its workouts are completed; then Rest begins and the next week is
generated from the completed week's data (see lifecycle.complete_session).

CONCEPTUAL LOCATION: app/routers/weeks.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import require_athlete, get_request_db
from ..schemas import WeekComposeRequest
from ..idempotency import handle_idempotent
from .. import lifecycle, errors

router = APIRouter()


@router.post("/weeks")
def compose_week(
    body: WeekComposeRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_request_id,
        lambda _conn: lifecycle.compose_week(db, athlete_id),
    )
    return response


@router.get("/weeks/current")
def current_week(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    week = lifecycle.current_week(db, athlete_id)
    if week is None:
        return {"week": None, "reason": "no_week_yet"}
    return week
