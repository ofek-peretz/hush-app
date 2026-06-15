"""
Preference endpoints (Program Ownership Contract) — athlete-scoped; athlete_id from the token.

Athlete-OWNED program structure is set and read here. Every write is an APPEND-ONLY action on
`preference_event` (idempotent on client_event_id) and NEVER alters model state — it sets what the
athlete owns (exercise pins, substitutes, equipment backups, exercise/workout order). The model's
selection consults the projection of this log with PRIORITY (a pin wins, including during
calibration), so athlete-owned choices are durable across refetches, reinstalls, device changes,
and future week regenerations, and the full timeline is reconstructable.

  POST /preferences/exercise    — pin (honor exact choice) / restore (clear pin)
  POST /preferences/substitute  — define / remove a persistent preferred substitute
  POST /preferences/backup      — define / remove an equipment-busy backup
  POST /preferences/order       — athlete-owned exercise / workout order
  GET  /preferences             — current owned projection (pins/substitutes/backups/orders)
  GET  /preferences/events      — the full immutable preference timeline
  GET  /preferences/dataset     — the preference-learning dataset (derived, queryable)

CONCEPTUAL LOCATION: app/routers/preferences.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import (
    PREF_SUBSTITUTE_ADDED, PREF_SUBSTITUTE_REMOVED,
    PREF_BACKUP_DEFINED, PREF_BACKUP_REMOVED,
    PREF_EXERCISE_REORDERED, PREF_WORKOUT_REORDERED,
)

from .. import errors
from ..deps import require_athlete, get_request_db
from ..schemas import (
    PreferenceExerciseRequest, PreferenceSubstituteRequest,
    PreferenceBackupRequest, PreferenceOrderRequest,
)

router = APIRouter()


@router.post("/preferences/exercise")
def set_exercise_preference(
    body: PreferenceExerciseRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    svc = HushService(db)
    try:
        if body.action == "restore":
            svc.restore_exercise(athlete_id, body.capability, reason=body.reason,
                                 source=body.source, event_id=body.client_event_id)
        elif body.action == "replace":
            if not body.to_exercise:
                raise errors.unprocessable("to_exercise required for replace", "to_exercise")
            svc.pin_exercise(athlete_id, body.capability, body.to_exercise,
                             from_exercise=body.from_exercise, reason=body.reason,
                             source=body.source, event_id=body.client_event_id)
        else:
            raise errors.unprocessable("action must be replace|restore", "action")
    except ValueError as e:
        raise errors.unprocessable(str(e), "to_exercise")
    return {"preferences": svc.preferences_projection(athlete_id)}


@router.post("/preferences/substitute")
def set_substitute(
    body: PreferenceSubstituteRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    svc = HushService(db)
    action = PREF_SUBSTITUTE_REMOVED if body.remove else PREF_SUBSTITUTE_ADDED
    if not body.remove and not body.substitute_exercise:
        raise errors.unprocessable("substitute_exercise required", "substitute_exercise")
    svc.record_preference_action(
        athlete_id, action, event_id=body.client_event_id,
        from_exercise=body.primary_exercise, to_exercise=body.substitute_exercise,
        source=body.source)
    return {"preferences": svc.preferences_projection(athlete_id)}


@router.post("/preferences/backup")
def set_backup(
    body: PreferenceBackupRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    svc = HushService(db)
    action = PREF_BACKUP_REMOVED if body.remove else PREF_BACKUP_DEFINED
    if not body.remove and not body.backup_exercise:
        raise errors.unprocessable("backup_exercise required", "backup_exercise")
    svc.record_preference_action(
        athlete_id, action, event_id=body.client_event_id,
        from_exercise=body.primary_exercise, to_exercise=body.backup_exercise,
        source=body.source)
    return {"preferences": svc.preferences_projection(athlete_id)}


@router.post("/preferences/order")
def set_order(
    body: PreferenceOrderRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    if body.scope == "exercise":
        if not body.capability:
            raise errors.unprocessable("capability required for exercise order", "capability")
        action, capability = PREF_EXERCISE_REORDERED, body.capability
    elif body.scope == "workout":
        action, capability = PREF_WORKOUT_REORDERED, None
    else:
        raise errors.unprocessable("scope must be exercise|workout", "scope")
    svc = HushService(db)
    svc.record_preference_action(
        athlete_id, action, event_id=body.client_event_id, capability=capability,
        payload={"order": body.order}, source=body.source)
    return {"preferences": svc.preferences_projection(athlete_id)}


@router.get("/preferences")
def get_preferences(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    return {"preferences": HushService(db).preferences_projection(athlete_id)}


@router.get("/preferences/events")
def get_preference_events(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    return {"events": HushService(db).preference_events(athlete_id)}


@router.get("/preferences/dataset")
def get_preference_dataset(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    svc = HushService(db)
    return {"dataset": svc.preference_dataset(athlete_id), "usage": svc.preference_usage(athlete_id)}
