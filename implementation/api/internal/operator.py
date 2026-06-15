"""
Operator surface (API contract §16A; BB-22/23/25) — a SEPARATE scope behind the operator key,
never reachable from an athlete bearer token. Minimal v1 slice: enrollment provisioning + audit
reconstruction. Network restriction + access logging are deployment concerns (BB-22).

  POST /internal/athletes           — enroll: onboard (HushService) + mint a token (BB-25). The
                                      plaintext token is returned ONCE for out-of-band delivery.
  POST /internal/athletes/{id}/revoke — revoke a token (rotation/revocation, contract §2).
  GET  /internal/audit/sessions/{id}  — full audit reconstruction (BB-12 / contract §16E).

CONCEPTUAL LOCATION: app/internal/operator.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from hush_model.persistence.service import HushService

from .. import auth, errors
from ..a7_gate import evaluate_a7_gate
from ..connection import write_serialized
from ..deps import require_operator, get_request_db

router = APIRouter(prefix="/internal")


class EnrollRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    athlete_id: str = Field(min_length=1)
    sex: str
    age: int = Field(ge=0)
    experience: str
    bodyweight_kg: float | None = Field(default=None, gt=0)


class RevokeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=1)


@router.post("/athletes")
def enroll(
    body: EnrollRequest,
    _op: bool = Depends(require_operator),
    db=Depends(get_request_db),
):
    """Enroll an athlete and mint their bearer token. The athlete is created via the existing
    onboarding seed (ES-008 v2 / Option D); the token's hash is stored, the plaintext returned
    once for the secure provisioning channel (BB-25)."""
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


@router.post("/athletes/{athlete_id}/revoke")
def revoke(
    athlete_id: str,
    body: RevokeRequest,
    _op: bool = Depends(require_operator),
    db=Depends(get_request_db),
):
    with write_serialized():
        with db.transaction() as conn:
            ok = auth.revoke_token(conn, body.token)
    return {"athlete_id": athlete_id, "revoked": ok}


@router.post("/athletes/{athlete_id}/erase")
def erase(
    athlete_id: str,
    _op: bool = Depends(require_operator),
    db=Depends(get_request_db),
):
    """Right-to-erasure (OD-2) — **logical deletion / anonymization**. Removes the athlete's
    authentication data + precise personal identifiers and writes an erasure tombstone, while
    **retaining the append-only audit/history in anonymized form** (no destructive audit-chain
    deletion). The external enrollment/consent record is deleted by Operations as the BB-33
    complement. Idempotent; operator-key only."""
    with write_serialized():
        try:
            result = HushService(db).erase_athlete(athlete_id)
        except KeyError:
            raise errors.not_found("athlete not found")
    return result


@router.get("/metrics")
def metrics(
    _op: bool = Depends(require_operator),
    db=Depends(get_request_db),
):
    """Trial-health + A7/A8/A9 validation-evidence export (BB-32; metrics half of BB-23). Read-only,
    operator-key only. The A7 cohort view is the DATA behind the week-1 seed-safety gate; its pass/fail
    thresholds are OD-8 and are not applied here (export, not verdict)."""
    return HushService(db).validation_export()


@router.get("/gate/a7")
def a7_gate(
    _op: bool = Depends(require_operator),
    db=Depends(get_request_db),
):
    """A7 week-1 seed-safety gate (BB-11) — the single hard Phase-1 gate. Computes per-cohort
    first-session completion + first-rep-failure rates and returns the per-cohort verdict + the overall
    PROCEED / PAUSE_AND_REANCHOR recommendation. Thresholds are RATIFIED (OD-8, V1) and the gate is
    ARMED (status surfaced in the response); the only sanctioned response to an UNSAFE cohort is
    stop-and-re-anchor ES-008 v2, never a field parameter tweak (KL-9)."""
    metrics = HushService(db).a7_first_session_safety()
    return evaluate_a7_gate(metrics)


@router.get("/audit/sessions/{session_id}")
def audit_session(
    session_id: str,
    _op: bool = Depends(require_operator),
    db=Depends(get_request_db),
):
    """Full audit reconstruction (BB-12): composition + recommendation + shadow + observation for
    every block. A session that cannot be reconstructed is invalid (ES-009 §9)."""
    try:
        return HushService(db).reconstruct_session(session_id)
    except KeyError:
        raise errors.not_found("session not found")
