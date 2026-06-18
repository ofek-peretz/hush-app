"""
Read endpoints (API contract §6/§9/§10/§12) — safe, athlete-scoped, no idempotency.

  GET /sessions/today                 — the pre-composed cache fill (or awaiting_compose)
  GET /sessions                       — thin, read-only history list (no analytics, §10)
  GET /sessions/{id}                  — full session (athlete-scoped)
  GET /recommendations/{id}/why       — explainability + the honesty clause (§12)
  GET /profile                        — the minimal Athlete (§9)

Every read derives identity from the token (BB-19) and 404s a resource that is not the caller's,
so existence is not leaked across athletes (contract §16A).

CONCEPTUAL LOCATION: app/routers/reads.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from hush_model.constants import MODEL_VERSION, CAPABILITY_MODEL_VERSION, CLASS_A_CAPABILITIES
from hush_model.persistence.repositories import StateRepository

from .. import errors
from ..deps import require_athlete, get_request_db
from ..lifecycle import session_to_dict, _active_session_row

router = APIRouter()

_HISTORY_MAX_LIMIT = 100


@router.get("/sessions/today")
def sessions_today(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    row = _active_session_row(db.conn, athlete_id)
    if row is None:
        return {"today": None, "reason": "awaiting_compose"}
    return {"today": session_to_dict(db.conn, row)}


@router.get("/sessions")
def sessions_list(
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1),
    before: str | None = Query(default=None),
):
    limit = min(limit, _HISTORY_MAX_LIMIT)
    params: list = [athlete_id]
    sql = "SELECT * FROM workout_session WHERE athlete_id=?"
    if status:
        sql += " AND status=?"
        params.append(status)
    if before:
        sql += " AND created_at < ?"
        params.append(before)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit + 1)
    rows = db.conn.execute(sql, params).fetchall()
    has_more = len(rows) > limit
    rows = rows[:limit]
    sessions = []
    for r in rows:
        bc = db.conn.execute(
            "SELECT COUNT(*) AS n FROM exercise_block WHERE workout_session_id=?", (r["id"],)
        ).fetchone()["n"]
        sessions.append({
            "id": r["id"], "status": r["status"], "week": r["week"],
            "completed_at": r["completed_at"], "block_count": bc,
        })
    next_cursor = rows[-1]["created_at"] if (has_more and rows) else None
    return {"sessions": sessions, "next_cursor": next_cursor}


@router.get("/sessions/{session_id}")
def session_detail(
    session_id: str, athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)
):
    row = db.conn.execute(
        "SELECT * FROM workout_session WHERE id=? AND athlete_id=?", (session_id, athlete_id)
    ).fetchone()
    if row is None:
        raise errors.not_found("session not found")
    return session_to_dict(db.conn, row)


def _conf_label(confidence: float) -> str:
    """ES-005.1 three-level prediction confidence (contract §12)."""
    if confidence < 30.0:
        return "low"
    if confidence < 70.0:
        return "medium"
    return "high"


def _could_not_exclude(decision_reason: str, confidence: float) -> str:
    """The honesty clause (Execution Context §1): what this conclusion could not rule out. Calm,
    never a warning. Rendered from the recommendation's own audited reason — no new decision."""
    if confidence < 30.0:
        return ("Confidence is still low: this cannot yet exclude that more sessions will move "
                "the load up or down once the estimate settles.")
    if "low_confidence" in decision_reason or "evidence_conflict" in decision_reason:
        return ("The evidence is not yet consistent enough to move the load; this cannot exclude "
                "that your true capacity is higher or lower than held.")
    return ("Held within the stability guard; this cannot fully exclude day-to-day variation in "
            "what you can lift.")


@router.get("/recommendations/{recommendation_id}/why")
def recommendation_why(
    recommendation_id: str,
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
):
    row = db.conn.execute(
        "SELECT * FROM recommendation WHERE id=? AND athlete_id=?",
        (recommendation_id, athlete_id),
    ).fetchone()
    if row is None:
        raise errors.not_found("recommendation not found")
    # C3: the authoritative load this recommendation is measured against — the recommended weight of
    # the PRIOR recommendation for the same athlete+exercise. Lets the client render "Up [Δ] from last
    # week" from the model's own progression (Δ = recommended_weight − previous_weight) instead of
    # deriving Δ from local history. None when there is no prior (first time this exercise appears).
    prior = db.conn.execute(
        "SELECT recommended_weight FROM recommendation "
        "WHERE athlete_id=? AND exercise=? AND created_at < ? AND id != ? "
        "ORDER BY created_at DESC LIMIT 1",
        (athlete_id, row["exercise"], row["created_at"], row["id"]),
    ).fetchone()
    return {
        "recommendation_id": row["id"],
        "capability": row["capability"],
        "exercise": row["exercise"],
        "recommended_weight": row["recommended_weight"],
        "previous_weight": prior["recommended_weight"] if prior is not None else None,
        "target_reps": row["target_reps"],
        "predicted_reps_to_failure": row["predicted_reps_to_failure"],
        "prediction_confidence": _conf_label(row["prediction_confidence"]),
        "decision_type": row["decision_type"],
        "decision_reason": row["decision_reason"],
        "what_it_could_not_exclude": _could_not_exclude(
            row["decision_reason"], row["prediction_confidence"]
        ),
    }


_ACTIONABLE_CONFIDENCE = 70.0  # ES-005.1 "high" — the actionable forecast gate (R9)


def _forecast_type(decision_type: str, decision_reason: str, confidence) -> str | None:
    """Which forecast (if any) a recommendation issued — the SAME ratified rules the client's
    decisionMap applies (R9/R11): an increase carries a forecast only at actionable confidence;
    a fatigue_hold carries the horizonless hold forecast at actionable confidence; everything
    else is silence. No new product semantics — this mirrors the existing client mapping."""
    if confidence is None or confidence < _ACTIONABLE_CONFIDENCE:
        return None
    if decision_type == "INCREASE_LOAD":
        return "increase"
    if decision_type == "KEEP_LOAD" and (decision_reason or "").startswith("fatigue_hold"):
        return "hold"
    return None


def _resolve_forecast(conn, athlete_id: str, r, ftype: str) -> str:
    """Resolve a derived forecast against persisted OUTCOMES, honoring the ratified asymmetry.
    Increase resolves same-session (the block's first logged set): HIT iff reps met, else MISS.
    Hold is HORIZONLESS: HIT iff a LATER set exceeded the held weight for the reps, else PENDING
    (never an auto-MISS — a breakthrough that hasn't come is not a failure). A skipped/replaced
    block voids the forecast (basis lost). This is a RECONSTRUCTION/AUDIT view derived purely
    from stored rows; the client remains authoritative for receipts the athlete actually sees."""
    if r["block_status"] in ("skipped", "replaced"):
        return "VOID"
    if ftype == "increase":
        obs = conn.execute(
            "SELECT actual_reps FROM observation WHERE exercise_block_id=? "
            "ORDER BY created_at ASC LIMIT 1",
            (r["exercise_block_id"],),
        ).fetchone()
        if obs is None:
            return "PENDING"
        return "HIT" if obs["actual_reps"] >= r["target_reps"] else "MISS"
    # hold (horizonless): a later set, same capability, that EXCEEDED the held weight for the reps
    issued_week = r["issued_week"] if r["issued_week"] is not None else 0.0
    passed = conn.execute(
        "SELECT 1 FROM observation o "
        "LEFT JOIN exercise_block eb ON eb.id = o.exercise_block_id "
        "LEFT JOIN workout_session ws ON ws.id = eb.workout_session_id "
        "WHERE o.athlete_id=? AND o.capability=? AND o.actual_weight > ? AND o.actual_reps >= ? "
        "  AND COALESCE(ws.week, 0) >= ? LIMIT 1",
        (athlete_id, r["capability"], r["recommended_weight"], r["target_reps"], issued_week),
    ).fetchone()
    return "HIT" if passed else "PENDING"


def _derive_forecasts(conn, athlete_id: str, state_filter: str | None = None) -> list[dict]:
    """Derive every forecast an athlete's recommendations issued, with its resolution, PURELY
    from stored rows (recommendation decision + observation outcome). Proves the reconstruction
    guarantee: a forecast is never lost — it is reconstructable from the audit chain alone."""
    rows = conn.execute(
        "SELECT r.id AS rid, r.capability, r.exercise, r.recommended_weight, r.target_reps, "
        "       r.predicted_reps_to_failure, r.prediction_confidence, r.decision_type, "
        "       r.decision_reason, r.exercise_block_id, "
        "       eb.status AS block_status, ws.week AS issued_week "
        "FROM recommendation r "
        "LEFT JOIN exercise_block eb ON eb.id = r.exercise_block_id "
        "LEFT JOIN workout_session ws ON ws.id = eb.workout_session_id "
        "WHERE r.athlete_id = ? ORDER BY r.created_at ASC",
        (athlete_id,),
    ).fetchall()
    out: list[dict] = []
    for r in rows:
        ftype = _forecast_type(r["decision_type"], r["decision_reason"], r["prediction_confidence"])
        if ftype is None:
            continue
        state = _resolve_forecast(conn, athlete_id, r, ftype)
        if state_filter is not None and state != state_filter:
            continue
        out.append({
            "id": r["rid"],
            "type": ftype,
            "capability": r["capability"],
            "exercise": r["exercise"],
            "predicted_value": r["recommended_weight"],
            "predicted_reps": r["target_reps"],
            "predicted_reps_to_failure": r["predicted_reps_to_failure"],
            "issued_week": r["issued_week"],
            "state": state,
        })
    return out


@router.get("/forecasts")
def forecasts_get(
    athlete_id: str = Depends(require_athlete),
    db=Depends(get_request_db),
    state: str | None = Query(default=None),
):
    """C4: the server-authoritative, reconstructable forecast view (contract §C4). Each forecast
    is DERIVED from the persisted recommendation (the decision + prediction) and resolved against
    the persisted observation (the outcome) — nothing new is stored; this surfaces what the audit
    chain already contains. `?state=pending|hit|miss|void` filters. Mirrors the ratified
    asymmetry; the client stays authoritative for receipts the athlete sees in-session."""
    sf = state.upper() if state else None
    return {"forecasts": _derive_forecasts(db.conn, athlete_id, sf)}


@router.get("/capabilities")
def capabilities_get(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    """Per-capability latent score + confidence for the Capability Portrait (contract §8.7).

    Read-only projection of `capability_state` — the app computes nothing (it renders bars/words).
    `score` is the raw ES-008 latent capability score (cohort-independent, comparable ACROSS
    capabilities via the shared growth constant). `confidence` is the model's internal confidence
    and is NEVER displayed to the athlete.

    NOTE (deliberately not provided here): the Portrait's 0..1 "relative-to-standard,
    percentile-comparable" bar length is a separate mapping that no model primitive produces yet
    (no population distribution exists). The client must not invent it; defining it is a pending
    product/model decision. This endpoint exposes the real state only.
    """
    rows = {
        r["capability"]: r
        for r in db.conn.execute(
            "SELECT capability, score, confidence FROM capability_state WHERE athlete_id=?",
            (athlete_id,),
        ).fetchall()
    }
    capabilities = [
        {"capability": cap, "score": rows[cap]["score"], "confidence": rows[cap]["confidence"]}
        for cap in CLASS_A_CAPABILITIES
        if cap in rows
    ]
    return {"capabilities": capabilities}


@router.get("/strategy")
def strategy_get(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    """The athlete's training strategy projection (contract §8.7): weekly frequency, volume band,
    and primary/secondary focus. Read-only over `strategy_state` (default-on-absence). The app
    renders frequency/focus; it computes nothing.

    NOTE: the backend composes ONE session at a time (no multi-day plan); a 7-day 'day list' is
    not a model concept. Whether v1's Program/Home present a multi-day plan or the session-at-a-
    time model is a pending product decision — this endpoint provides the strategy, not a calendar.
    """
    strat = StateRepository(db.conn).get_strategy_state(athlete_id)
    # Completed-session count is the SERVER-SIDE source of truth for calibration
    # (spec §2.3: calibration is "7 completed sessions, by count not calendar").
    # The client derives its CALIBRATING/ADVISORY mode from this so a reinstall or
    # device change can never reset calibration state.
    completed = db.conn.execute(
        "SELECT COUNT(*) AS n FROM workout_session WHERE athlete_id=? AND status='completed'",
        (athlete_id,),
    ).fetchone()["n"]
    return {
        "weekly_frequency": strat.weekly_frequency,
        "weekly_volume": strat.weekly_volume,
        "primary_focus": strat.primary_focus,
        "secondary_focus": strat.secondary_focus,
        "sessions_completed": completed,
    }


@router.get("/profile")
def profile_get(athlete_id: str = Depends(require_athlete), db=Depends(get_request_db)):
    row = db.conn.execute("SELECT * FROM athlete WHERE id=?", (athlete_id,)).fetchone()
    if row is None:
        raise errors.not_found("athlete not found")
    return {
        "id": row["id"], "sex": row["sex"], "age": row["age"],
        "experience": row["experience"], "bodyweight_kg": row["bodyweight_kg"],
        "model_version": MODEL_VERSION, "capability_model_version": CAPABILITY_MODEL_VERSION,
    }
