"""
Self-enrollment (closed-alpha, zero-friction onboarding). A tester downloads the app,
completes onboarding, and the app calls `POST /enroll` with the collected stats — the
server creates the athlete (the existing ES-008 v2 / Option D onboarding seed) and mints
its bearer token, returned ONCE. This is the public sibling of the operator enroll
(internal/operator.py): the app's own onboarding screen IS the enrollment, since native
Sign In is deferred. No per-tester operator step, no token provisioning.

Optional gate: if `HUSH_ENROLL_KEY` is set, the request must carry a matching
`x-enroll-key` header (the app bakes it in). That keeps casual/external abuse out of a
closed alpha without any per-tester friction. Unset ⇒ open (dev/local).

The app layer computes NO model state — it reuses `HushService.onboard` + `auth.mint_token`
exactly as the operator path does (the frozen model is untouched).

CONCEPTUAL LOCATION: app/routers/enroll.py.
"""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from hush_model.persistence.service import HushService

from .. import auth, errors
from ..connection import write_serialized
from ..deps import get_request_db

router = APIRouter()


class SelfEnrollRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    athlete_id: str = Field(min_length=1)
    sex: str
    age: int = Field(ge=0)
    experience: str
    bodyweight_kg: float | None = Field(default=None, gt=0)


@router.post("/enroll")
def self_enroll(body: SelfEnrollRequest, request: Request, db=Depends(get_request_db)):
    """Create an athlete from onboarding stats + mint its token. Closed-alpha self-serve."""
    enroll_key = os.environ.get("HUSH_ENROLL_KEY", "")
    if enroll_key:
        provided = request.headers.get("x-enroll-key", "")
        if not hmac.compare_digest(provided, enroll_key):
            raise errors.unauthenticated("enrollment key required")
    if body.sex not in {"male", "female"}:
        raise errors.unprocessable("sex must be male|female", "sex")
    if body.experience not in {"beginner", "intermediate", "advanced"}:
        raise errors.unprocessable("experience must be beginner|intermediate|advanced", "experience")
    with write_serialized():
        with db.transaction() as conn:
            existing = conn.execute(
                "SELECT 1 FROM athlete WHERE id=?", (body.athlete_id,)
            ).fetchone()
            if existing is not None:
                raise errors.conflict("athlete already enrolled")
        HushService(db).onboard(
            body.athlete_id, body.sex, body.age, body.experience, body.bodyweight_kg
        )
        with db.transaction() as conn:
            token = auth.mint_token(conn, body.athlete_id)
    return {"athlete_id": body.athlete_id, "token": token}
