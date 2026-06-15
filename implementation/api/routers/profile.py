"""
Profile write endpoint (API contract §9) — PATCH /profile, idempotent on client_request_id.

Corrects an onboarding value (sex/age/experience) or the bodyweight metadata. `bodyweight_kg`
lives on the `athlete` row (DX-07) and is inert to learning in v1 (consumed only when Option D /
DX-08 becomes live). Athlete creation is NOT here — that is the operator enrollment path (§2).

CONCEPTUAL LOCATION: app/routers/profile.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from hush_model.constants import MODEL_VERSION, CAPABILITY_MODEL_VERSION
from hush_model.persistence.db import now_iso

from .. import errors
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

    sets, params = [], []
    for field in ("sex", "age", "experience", "bodyweight_kg"):
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{field}=?")
            params.append(val)
    if sets:
        params.append(athlete_id)
        conn.execute(f"UPDATE athlete SET {', '.join(sets)} WHERE id=?", params)

    updated = conn.execute("SELECT * FROM athlete WHERE id=?", (athlete_id,)).fetchone()
    return {
        "id": updated["id"], "sex": updated["sex"], "age": updated["age"],
        "experience": updated["experience"], "bodyweight_kg": updated["bodyweight_kg"],
        "model_version": MODEL_VERSION, "capability_model_version": CAPABILITY_MODEL_VERSION,
    }


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
