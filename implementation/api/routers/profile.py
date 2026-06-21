"""
Profile write endpoint (API contract §9) — PATCH /profile, idempotent on client_request_id.

Corrects an onboarding value (sex/age/experience) or the bodyweight metadata. `bodyweight_kg`
lives on the `athlete` row (DX-07) and is inert to learning in v1 (consumed only when Option D /
DX-08 becomes live). Athlete creation is NOT here — that is the operator enrollment path (§2).

CONCEPTUAL LOCATION: app/routers/profile.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from hush_model.constants import MODEL_VERSION, CAPABILITY_MODEL_VERSION, GOALS
from hush_model.persistence.db import now_iso
from hush_model.persistence.repositories import StateRepository
from hush_model.persistence.service import HushService
from hush_model.volume import clamp_frequency

from .. import errors
from ..connection import write_serialized
from ..deps import require_athlete, get_request_db
from ..schemas import ProfilePatchRequest
from ..idempotency import handle_idempotent

router = APIRouter()

_ALLOWED_SEX = {"male", "female"}
_ALLOWED_EXPERIENCE = {"beginner", "intermediate", "advanced"}


def _apply_patch(conn, athlete_id: str, body: ProfilePatchRequest) -> dict:
    row = conn.execute("SELECT * FROM athlete WHERE id=?", (athlete_id,)).fetchone()
    if row is None:
        raise errors.not_found("athlete not found")
    if body.sex is not None and body.sex not in _ALLOWED_SEX:
        raise errors.unprocessable("sex must be male|female", "sex")
    if body.experience is not None and body.experience not in _ALLOWED_EXPERIENCE:
        raise errors.unprocessable("experience must be beginner|intermediate|advanced", "experience")
    if body.goal is not None and body.goal not in GOALS:
        raise errors.unprocessable("goal must be one of " + "|".join(GOALS), "goal")

    sets, params = [], []
    for field in ("sex", "age", "experience", "bodyweight_kg", "goal"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field}=?")
            params.append(val)
    if sets:
        params.append(athlete_id)
        conn.execute(f"UPDATE athlete SET {', '.join(sets)} WHERE id=?", params)

    # Chosen weekly frequency → strategy projection (the sole strategy writer). Carries
    # the onboarding days-per-week so compose_week builds that many workouts. Clamped to
    # a supported template (2–4); preserves the rest of the strategy projection.
    freq_out = None
    if body.weekly_frequency is not None:
        repo = StateRepository(conn)
        strat = repo.get_strategy_state(athlete_id)
        strat.weekly_frequency = clamp_frequency(body.weekly_frequency)
        repo.write_strategy_state(athlete_id, strat)
        freq_out = strat.weekly_frequency

    updated = conn.execute("SELECT * FROM athlete WHERE id=?", (athlete_id,)).fetchone()
    result = {
        "id": updated["id"], "sex": updated["sex"], "age": updated["age"],
        "experience": updated["experience"], "bodyweight_kg": updated["bodyweight_kg"],
        "goal": (updated["goal"] if "goal" in updated.keys() else None),
        "model_version": MODEL_VERSION, "capability_model_version": CAPABILITY_MODEL_VERSION,
    }
    if freq_out is not None:
        result["weekly_frequency"] = freq_out
    return result


@router.patch("/profile")
def patch_profile(
    body: ProfilePatchRequest,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    response, _replayed = handle_idempotent(
        db, athlete_id, body.client_request_id,
        lambda conn: _apply_patch(conn, athlete_id, body),
    )
    return response


@router.post("/me/erase")
def erase_me(
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    """Athlete-initiated right-to-erasure (OD-2) — the in-app "Delete Account" action. Logical
    deletion / anonymization of the CALLER (athlete_id derived from the bearer token, so a token can
    only ever erase its OWN data — never another athlete's). Reuses the exact operator erase
    mechanism (`erase_athlete`): removes auth tokens + precise identifiers, writes the erasure
    tombstone, retains the anonymized append-only audit. Because the auth token is deleted, the token
    is invalid immediately after; the client then clears local state. Idempotent."""
    with write_serialized():
        result = HushService(db).erase_athlete(athlete_id)
    return result
