"""
Lifecycle apply-functions (API contract §5/§6/§7/§8/§5.1) — the thin orchestration each handler
routes through `idempotency.handle_idempotent`. Every function here composes EXISTING primitives
(`SessionEngine`/`SessionRuntime`/`HushService`/repositories); it computes no load, score, or
decision (build plan §2 boundary rule). The web layer's only "logic" is flow control + wire
mapping + the server-authoritative clock + the A9 override detection.

  - server clock (BB-6): `week` is derived from the athlete's enrollment time on the server, never
    from a device clock (decay/recovery time is server-authoritative).
  - version stamping (BB-4): every session response carries model/capability/catalog versions.
  - override capture (BB-7): a logged load that deviates from the prescription is recorded as an
    A9 LOAD override on the observation (lossless), via the opt-in pipeline passthrough.

CONCEPTUAL LOCATION: app/lifecycle.py.
"""
from __future__ import annotations

from datetime import datetime, timezone

from hush_model.constants import (
    MODEL_VERSION, CAPABILITY_MODEL_VERSION, CAPABILITY_PRIORITY_ORDER,
    target_reps_for_goal,
)
from hush_model.catalog import CATALOG
from hush_model.recommendation import recommend
from hush_model.domain import Recommendation
from hush_model.persistence.repositories import (
    StateRepository, SessionRepository, LearningRepository,
    PreferenceEventRepository, PREF_EXERCISE_REPLACED, PREF_EXERCISE_BUSY, WeekPlanRepository,
)
from hush_model.volume import clamp_frequency
from hush_model.constants import TEMPLATES_CLASS_A
from hush_model.domain import default_strategy_state
from hush_model.persistence.session import SessionEngine
from hush_model.persistence.runtime import SessionRuntime, SessionProgressRepository
from hush_model.persistence.service import HushService

from . import errors
from .connection import RequestDatabase
from .deps import DEFAULT_REST_SECONDS
from .instrumentation import record_shadow_baseline

CATALOG_VERSION = CATALOG.version
DEFAULT_TARGET_REPS = 8


# ----------------------------- server-authoritative helpers -----------------------------

def server_week(conn, athlete_id: str) -> float:
    """BB-6: training-week index from the server clock (enrollment → now). Device times are
    advisory only. Float weeks (the model's decay/recovery axis)."""
    row = conn.execute("SELECT created_at FROM athlete WHERE id=?", (athlete_id,)).fetchone()
    if row is None:
        raise errors.not_found("athlete not found")
    try:
        created = datetime.fromisoformat(row["created_at"])
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return 0.0
    return max(0.0, (datetime.now(timezone.utc) - created).total_seconds() / (7 * 86400))


def _next_session_index(conn, athlete_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM workout_session WHERE athlete_id=?", (athlete_id,)
    ).fetchone()
    return int(row["n"])


def _cap_rank(capability: str) -> int:
    try:
        return CAPABILITY_PRIORITY_ORDER.index(capability)
    except ValueError:
        return len(CAPABILITY_PRIORITY_ORDER)


# ----------------------------- serialization (contract §3) -----------------------------

def block_to_dict(conn, block_row) -> dict:
    rec = conn.execute(
        "SELECT id FROM recommendation WHERE exercise_block_id=? "
        "ORDER BY created_at DESC LIMIT 1",
        (block_row["id"],),
    ).fetchone()
    return {
        "id": block_row["id"],
        "position": block_row["position"],
        "capability": block_row["capability"],
        "exercise": block_row["exercise"],
        "difficulty_factor": block_row["difficulty_factor"],
        "recommended_weight": block_row["recommended_weight"],
        "target_reps": block_row["target_reps"],
        "target_sets": block_row["target_sets"],
        "rest_seconds": DEFAULT_REST_SECONDS,
        "selection_reason": block_row["selection_reason"],
        "recommendation_id": rec["id"] if rec else None,
        "status": block_row["status"],
    }


def session_to_dict(conn, session_row) -> dict:
    blocks = [
        block_to_dict(conn, b)
        for b in conn.execute(
            "SELECT * FROM exercise_block WHERE workout_session_id=? ORDER BY position",
            (session_row["id"],),
        )
    ]
    return {
        "id": session_row["id"],
        "name": session_row["name"],
        "status": session_row["status"],
        "week": session_row["week"],
        "session_index": session_row["session_index"],
        "week_plan_id": session_row["week_plan_id"],
        "position_in_week": session_row["position_in_week"],
        "started_at": session_row["started_at"],
        "completed_at": session_row["completed_at"],
        "model_version": MODEL_VERSION,
        "capability_model_version": CAPABILITY_MODEL_VERSION,
        "catalog_version": CATALOG_VERSION,
        "blocks": blocks,
    }


def _active_session_row(conn, athlete_id: str):
    return conn.execute(
        "SELECT * FROM workout_session WHERE athlete_id=? AND status IN ('planned','active') "
        "ORDER BY created_at DESC LIMIT 1",
        (athlete_id,),
    ).fetchone()


def _persist_block_recommendations(db: RequestDatabase, athlete_id: str, session_id: str) -> None:
    """Persist ONE recommendation per composed block so the plan carries a recommendation_id for
    the "why" view (contract §3.2/§6). Re-runs the pure `recommend` on the current capability
    state (deterministic — same recommended_weight the block already froze); append-only history."""
    with db.transaction() as conn:
        state = StateRepository(conn)
        learn = LearningRepository(conn)
        for b in conn.execute(
            "SELECT * FROM exercise_block WHERE workout_session_id=? ORDER BY position",
            (session_id,),
        ).fetchall():
            existing = conn.execute(
                "SELECT 1 FROM recommendation WHERE exercise_block_id=? LIMIT 1", (b["id"],)
            ).fetchone()
            if existing is not None:
                continue
            cap = state.get_capability_state(athlete_id, b["capability"])
            base = recommend(cap, b["exercise"], b["difficulty_factor"], b["target_reps"])
            rec = Recommendation(
                athlete_id=athlete_id, capability=base.capability, exercise=base.exercise,
                difficulty_factor=base.difficulty_factor,
                recommended_weight=base.recommended_weight, target_reps=base.target_reps,
                predicted_reps_to_failure=base.predicted_reps_to_failure,
                prediction_confidence=base.prediction_confidence,
                decision_reason=base.decision_reason, decision_type=base.decision_type,
                target_load=base.target_load,
            )
            learn.insert_recommendation(rec, b["id"])


# ----------------------------- compose / start (contract §5) -----------------------------

def compose_session(db: RequestDatabase, athlete_id: str) -> dict:
    """POST /sessions apply-fn. If an active session already exists, return it (the cold/first-
    case endpoint must not stack a second active session — §5). Otherwise compose+open via the
    shared SessionEngine primitive, persist per-block recommendations, return the full Session."""
    with db.transaction() as conn:
        existing = _active_session_row(conn, athlete_id)
        if existing is not None:
            return session_to_dict(conn, existing)
        week = server_week(conn, athlete_id)
        session_index = _next_session_index(conn, athlete_id)
        goal_row = conn.execute("SELECT goal FROM athlete WHERE id=?", (athlete_id,)).fetchone()
        goal = (goal_row["goal"] if goal_row is not None and "goal" in goal_row.keys() else None)

    engine = SessionEngine(db)
    seed = session_index  # exploration is OFF (P_EXPLORE=0); seed is persisted for R4 reconstructability
    session_id, _plan, _block_ids = engine.compose_and_open(
        athlete_id, week, session_index, seed, target_reps_for_goal(goal)
    )
    _persist_block_recommendations(db, athlete_id, session_id)

    with db.transaction() as conn:
        row = conn.execute("SELECT * FROM workout_session WHERE id=?", (session_id,)).fetchone()
        return session_to_dict(conn, row)


# ----------------------------- Weekly Program Container -----------------------------

def _ordered_template_indices(n: int, workout_order: list) -> list[int]:
    """The week's template indices [0..n-1], reordered by the athlete's owned workout order
    (athlete order > model order; unlisted keep model order, stable). Workout key = str(index)."""
    keys = [str(i) for i in range(n)]
    if not workout_order:
        return list(range(n))
    rank = {k: i for i, k in enumerate(workout_order)}
    tail = len(rank)
    return [int(k) for k in sorted(keys, key=lambda k: rank.get(k, tail))]


def _week_to_dict(conn, week_row, athlete_id: str) -> dict:
    sessions = WeekPlanRepository(conn).sessions_for_week(week_row["id"])
    workouts = [session_to_dict(conn, s) for s in sessions]
    all_done = bool(workouts) and all(w["status"] in ("completed", "skipped") for w in workouts)
    # "Started" = at least one set logged in any of the week's workouts.
    started = conn.execute(
        "SELECT 1 FROM set_record sr JOIN exercise_block eb ON eb.id=sr.exercise_block_id "
        "JOIN workout_session ws ON ws.id=eb.workout_session_id WHERE ws.week_plan_id=? LIMIT 1",
        (week_row["id"],),
    ).fetchone() is not None
    prior_completed = conn.execute(
        "SELECT 1 FROM week_plan WHERE athlete_id=? AND status='completed' AND week_number<? LIMIT 1",
        (athlete_id, week_row["week_number"]),
    ).fetchone() is not None
    # Rest begins only AFTER a week completes: either this week is done, or the next week is
    # generated-but-not-yet-started (athlete-paced rest between weeks).
    rest = (week_row["status"] == "completed" and all_done) or \
           (week_row["status"] == "active" and not started and prior_completed)
    return {
        "week": {
            "id": week_row["id"], "week_number": week_row["week_number"],
            "status": week_row["status"], "weekly_frequency": week_row["weekly_frequency"],
            "weekly_volume": week_row["weekly_volume"],
            "primary_focus": week_row["primary_focus"], "secondary_focus": week_row["secondary_focus"],
            "catalog_version": week_row["catalog_version"], "model_version": week_row["model_version"],
            "capability_model_version": week_row["capability_model_version"],
            "completed_at": week_row["completed_at"],
        },
        # Rest begins only after a week completes (athlete-paced rest between weeks).
        "rest": rest,
        "workouts": workouts,
    }


def compose_week(db: RequestDatabase, athlete_id: str) -> dict:
    """Generate ONE weekly plan of N workouts (the ratified weekly-program model). Idempotent: if
    an active week exists, return it. The week is composed as a UNIT from the start-of-week state
    (frozen within the week); athlete-owned structure is preserved because each workout composes
    through the SAME primitive that honors pins / substitutes / exercise order, and the workouts
    are ordered by the athlete's owned workout order. The next week is generated from the completed
    week's data (see complete_session)."""
    with db.transaction() as conn:
        existing = WeekPlanRepository(conn).active_week(athlete_id)
        if existing is not None:
            return _week_to_dict(conn, existing, athlete_id)
        week = server_week(conn, athlete_id)
        state = StateRepository(conn).load_athlete_state(athlete_id)
        strategy = state.strategy or default_strategy_state(athlete_id)
        proj_workout_order = StateRepository(conn)._preference_projection(athlete_id)["workout_order"]
        week_number = WeekPlanRepository(conn).next_week_number(athlete_id)
        freq = clamp_frequency(strategy.weekly_frequency)
        n = len(TEMPLATES_CLASS_A[freq])
        week_id = WeekPlanRepository(conn).create_week(
            athlete_id, week_number, weekly_frequency=freq,
            weekly_volume=strategy.weekly_volume, primary_focus=strategy.primary_focus,
            secondary_focus=strategy.secondary_focus, catalog_version=CATALOG_VERSION,
            model_version=MODEL_VERSION, capability_model_version=CAPABILITY_MODEL_VERSION,
        )

    # athlete-owned workout order (athlete > model) → the position each template takes this week
    template_order = _ordered_template_indices(n, proj_workout_order)

    # Goal → working-rep target for every workout this week (loads follow natively via RIR).
    # Absent goal → the historical default (parity). Frozen within the week with the rest of
    # the start-of-week strategy.
    target_reps = target_reps_for_goal(state.goal)

    engine = SessionEngine(db)
    session_ids: list[str] = []
    for position, template_index in enumerate(template_order):
        session_index = week_number * n + template_index   # % n == template_index (right template)
        sid, _plan, _blocks = engine.compose_and_open(
            athlete_id, week, session_index, seed=session_index, target_reps=target_reps,
            week_plan_id=week_id, position_in_week=position, status="planned",
        )
        _persist_block_recommendations(db, athlete_id, sid)
        session_ids.append(sid)

    with db.transaction() as conn:
        row = conn.execute("SELECT * FROM week_plan WHERE id=?", (week_id,)).fetchone()
        return _week_to_dict(conn, row, athlete_id)


def current_week(db: RequestDatabase, athlete_id: str) -> dict | None:
    with db.transaction() as conn:
        row = WeekPlanRepository(conn).latest_week(athlete_id)
        if row is None:
            return None
        return _week_to_dict(conn, row, athlete_id)


# ----------------------------- set reporting (contract §7) -----------------------------

def _next_action(conn, session_id: str, block_row, set_number: int) -> dict:
    """Flow control over the FROZEN plan (the prescription does not change mid-session, §0.3)."""
    if set_number < block_row["target_sets"]:
        return {
            "kind": "next_set",
            "block_id": block_row["id"],
            "set_number": set_number + 1,
            "recommended_weight": block_row["recommended_weight"],
            "target_reps": block_row["target_reps"],
            "rest_seconds": DEFAULT_REST_SECONDS,
        }
    nxt = conn.execute(
        "SELECT * FROM exercise_block WHERE workout_session_id=? AND position>? "
        "AND status NOT IN ('skipped') ORDER BY position LIMIT 1",
        (session_id, block_row["position"]),
    ).fetchone()
    if nxt is not None:
        return {
            "kind": "next_block",
            "block_id": nxt["id"],
            "set_number": 1,
            "recommended_weight": nxt["recommended_weight"],
            "target_reps": nxt["target_reps"],
            "rest_seconds": DEFAULT_REST_SECONDS,
        }
    return {"kind": "session_complete"}


def report_set(db: RequestDatabase, athlete_id: str, session_id: str, req) -> dict:
    """POST /sessions/{id}/sets apply-fn. Validates lifecycle/ownership, pins `week` from the
    session row, detects the A9 LOAD override (BB-7), runs the DX-11 event-driven set primitive,
    returns the ack + next action (contract §7.2)."""
    with db.transaction() as conn:
        sess = conn.execute(
            "SELECT * FROM workout_session WHERE id=? AND athlete_id=?",
            (session_id, athlete_id),
        ).fetchone()
        if sess is None:
            raise errors.not_found("session not found")
        if sess["status"] not in ("planned", "active"):
            raise errors.conflict("session is not active")
        block = conn.execute(
            "SELECT * FROM exercise_block WHERE id=? AND workout_session_id=?",
            (req.block_id, session_id),
        ).fetchone()
        if block is None:
            raise errors.not_found("block not found in session")
        if req.set_number > block["target_sets"]:
            raise errors.unprocessable("set_number exceeds target_sets", "set_number")
        week = sess["week"]
        recommended_weight = block["recommended_weight"]
        capability = block["capability"]
        exercise = block["exercise"]
        difficulty_factor = block["difficulty_factor"]
        target_reps = block["target_reps"]
        is_primary = block["selection_reason"] != "second_slot"

    # A9 LOAD override (BB-7): a logged load that deviates from the prescription, captured losslessly.
    actual_weight = req.actual_weight if req.actual_weight is not None else recommended_weight
    override_category, override_target = "", None
    if abs(actual_weight - recommended_weight) > 1e-9:
        override_category, override_target = "LOAD", actual_weight

    runtime = SessionRuntime(db)
    res = runtime.report_set(
        athlete_id, session_id, req.block_id, capability, exercise, difficulty_factor,
        target_reps, req.set_number,
        perform=lambda _rec: (actual_weight, req.actual_reps),
        week=week, is_primary_slot=is_primary,
        override_category=override_category, override_target=override_target,
    )

    with db.transaction() as conn:
        # A8 shadow baseline (BB-10): capture the no-learning counterfactual beside the model's
        # recommendation, scored against the same actuals, in the same transaction (live from
        # session one). The model's rec for this set is the one the learning chain just appended.
        rec_row = conn.execute(
            "SELECT id, recommended_weight, predicted_reps_to_failure FROM recommendation "
            "WHERE exercise_block_id=? ORDER BY created_at DESC LIMIT 1",
            (req.block_id,),
        ).fetchone()
        if rec_row is not None:
            record_shadow_baseline(
                conn, athlete_id, rec_row["id"], capability, exercise,
                model_seed_weight=rec_row["recommended_weight"],
                model_predicted_rtf=rec_row["predicted_reps_to_failure"],
                target_reps=target_reps, actual_reps=req.actual_reps, week=week,
            )
        block_row = conn.execute(
            "SELECT * FROM exercise_block WHERE id=?", (req.block_id,)
        ).fetchone()
        nxt = _next_action(conn, session_id, block_row, req.set_number)
    return {
        "observation_id": res.observation_id,
        "accepted_seq": req.seq,
        "next": nxt,
        "model_version": MODEL_VERSION,
        "capability_model_version": CAPABILITY_MODEL_VERSION,
    }


# ----------------------------- skip (contract §5.1) -----------------------------

def skip_block(db: RequestDatabase, athlete_id: str, block_id: str, req) -> dict:
    with db.transaction() as conn:
        block = conn.execute(
            "SELECT eb.*, ws.status AS session_status, ws.id AS session_id "
            "FROM exercise_block eb JOIN workout_session ws ON eb.workout_session_id=ws.id "
            "WHERE eb.id=? AND ws.athlete_id=?",
            (block_id, athlete_id),
        ).fetchone()
        if block is None:
            raise errors.not_found("block not found")
        if block["session_status"] not in ("planned", "active"):
            raise errors.conflict("session is not active")
        SessionRepository(conn).set_block_status(block_id, "skipped")
        nxt = _next_action(conn, block["session_id"], block, block["target_sets"])
    return {"block": {"id": block_id, "status": "skipped"}, "next": nxt}


# ----------------------------- replace (contract §8) -----------------------------

def replace_block(db: RequestDatabase, athlete_id: str, block_id: str, req) -> dict:
    with db.transaction() as conn:
        block = conn.execute(
            "SELECT eb.*, ws.status AS session_status FROM exercise_block eb "
            "JOIN workout_session ws ON eb.workout_session_id=ws.id "
            "WHERE eb.id=? AND ws.athlete_id=?",
            (block_id, athlete_id),
        ).fetchone()
        if block is None:
            raise errors.not_found("block not found")
        if block["session_status"] not in ("planned", "active"):
            raise errors.conflict("session is not active")
        capability = block["capability"]
        target_reps = block["target_reps"]

    # Off-catalog substitute: capture verbatim + losslessly (A9), record the override, swap the
    # block's exercise label. No in-catalog recommendation (it is outside the model's catalog).
    if req.off_catalog_text:
        off_label = f"off_catalog:{req.off_catalog_text}"
        with db.transaction() as conn:
            SessionRepository(conn).set_block_status(block_id, "active")
            conn.execute(
                "UPDATE exercise_block SET exercise=?, selection_reason='replacement' WHERE id=?",
                (off_label, block_id),
            )
            # Program Ownership Contract: an off-catalog substitution is an athlete preference
            # action too — record it on the append-only log so no preference signal is lost and
            # the choice is reconstructable (idempotent on the client_event_id).
            PreferenceEventRepository(conn).append(
                athlete_id, PREF_EXERCISE_REPLACED, capability=capability,
                from_exercise=req.from_exercise, to_exercise=off_label,
                reason=req.reason or "off_catalog", source="in_session",
                event_id=f"{req.client_event_id}:pref" if getattr(req, "client_event_id", None) else None,
            )
            row = conn.execute("SELECT * FROM exercise_block WHERE id=?", (block_id,)).fetchone()
            block_out = block_to_dict(conn, row)
        return {
            "block": block_out,
            "from_exercise": req.from_exercise,
            "off_catalog_text": req.off_catalog_text,
            "decision_type": "REPLACE_EXERCISE",
        }

    # In-catalog replace: the capability-preserving L2 primitive. The athlete's EXACT target
    # (req.to_exercise) is honored verbatim and pinned (Program Ownership Contract); with no
    # target the model falls back to preference. The replace records an append-only pin event
    # (idempotent on the client_event_id), so the choice is durable + reconstructable.
    svc = HushService(db)
    result = svc.replace_exercise(
        athlete_id, capability, req.from_exercise, req.reason,
        target_reps=target_reps, block_id=block_id,
        to_exercise=req.to_exercise, source="in_session",
        event_id=f"{req.client_event_id}:pref" if getattr(req, "client_event_id", None) else None,
    )
    chosen = result["to_exercise"]
    with db.transaction() as conn:
        ex = CATALOG.get(chosen)
        rec = conn.execute(
            "SELECT recommended_weight FROM recommendation WHERE id=?",
            (result["recommendation_id"],),
        ).fetchone()
        conn.execute(
            "UPDATE exercise_block SET exercise=?, difficulty_factor=?, recommended_weight=?, "
            "selection_reason='replacement', status='active' WHERE id=?",
            (chosen, ex.difficulty_factor, rec["recommended_weight"], block_id),
        )
        row = conn.execute("SELECT * FROM exercise_block WHERE id=?", (block_id,)).fetchone()
        block_out = block_to_dict(conn, row)
    return {
        "block": block_out,
        "from_exercise": req.from_exercise,
        "decision_type": result["decision_type"],
    }


# ----------------------------- equipment occupied (V1: move down one position) -----------------------------

def resolve_unavailable(db: RequestDatabase, athlete_id: str, block_id: str, req) -> dict:
    """POST /blocks/{id}/unavailable — EQUIPMENT OCCUPIED (V1 ratified 2026-06-15). The occupied
    exercise simply MOVES ONE POSITION LATER in the current workout (swaps with the next pending
    exercise). NO exercise is replaced, NO alternative is selected, NO structure / progression /
    recommendation changes — a temporary runtime reordering only; the athlete performs the same
    workout. If it is already last, it stays put (the athlete may repeat as needed). The busy event
    is captured for gym-congestion / workout-friction research (workout_id, exercise_id, original →
    new position, timestamp)."""
    with db.transaction() as conn:
        block = conn.execute(
            "SELECT eb.*, ws.status AS session_status, ws.id AS session_id FROM exercise_block eb "
            "JOIN workout_session ws ON eb.workout_session_id=ws.id "
            "WHERE eb.id=? AND ws.athlete_id=?",
            (block_id, athlete_id),
        ).fetchone()
        if block is None:
            raise errors.not_found("block not found")
        if block["session_status"] not in ("planned", "active"):
            raise errors.conflict("session is not active")
        session_id = block["session_id"]
        cur_pos = block["position"]
        exercise_id = block["exercise"]

        # the next still-pending exercise in the workout (the one we move past)
        nxt = conn.execute(
            "SELECT id, position FROM exercise_block WHERE workout_session_id=? AND position>? "
            "AND status NOT IN ('skipped','completed') ORDER BY position LIMIT 1",
            (session_id, cur_pos),
        ).fetchone()
        new_pos = cur_pos
        if nxt is not None:
            # swap the two positions: the occupied exercise moves one slot later; structure intact.
            new_pos = nxt["position"]
            conn.execute("UPDATE exercise_block SET position=? WHERE id=?", (new_pos, block_id))
            conn.execute("UPDATE exercise_block SET position=? WHERE id=?", (cur_pos, nxt["id"]))

        # research capture (append-only, joinable): exercise_busy on the workout.
        PreferenceEventRepository(conn).append(
            athlete_id, PREF_EXERCISE_BUSY, capability=block["capability"], slot_key=session_id,
            from_exercise=exercise_id, payload={"original_position": cur_pos, "new_position": new_pos},
            source="in_session",
            event_id=f"{req.client_event_id}:busy" if getattr(req, "client_event_id", None) else None,
        )

        row = conn.execute("SELECT * FROM workout_session WHERE id=?", (session_id,)).fetchone()
        session_out = session_to_dict(conn, row)
    return {
        "session": session_out,
        "moved_exercise": exercise_id,
        "original_position": cur_pos,
        "new_position": new_pos,
    }


# ----------------------------- complete (contract §5) -----------------------------

def complete_session(db: RequestDatabase, athlete_id: str, session_id: str, req) -> dict:
    """POST /sessions/{id}/complete apply-fn. Advance ES-006 decision memory once per capability
    (R2) from the persisted accumulator, close the session, increment the workout count, then
    pre-compose the next session (the cache fill, §5) so GET /sessions/today returns a fresh plan."""
    with db.transaction() as conn:
        sess = conn.execute(
            "SELECT * FROM workout_session WHERE id=? AND athlete_id=?",
            (session_id, athlete_id),
        ).fetchone()
        if sess is None:
            raise errors.not_found("session not found")
        if sess["status"] == "completed":
            row = sess
            already = True
        else:
            already = False
        week = sess["week"]
        week_plan_id = sess["week_plan_id"]

    next_session = None
    next_week = None
    if not already:
        runtime = SessionRuntime(db)
        runtime.complete_session(athlete_id, session_id, week)
        if week_plan_id:
            # Weekly model: the week completes only when ALL its workouts are done; then Rest
            # begins and the NEXT week is generated from the completed week's data (ownership
            # preserved — compose_week honors pins/substitutes/order from the durable log).
            with db.transaction() as conn:
                repo = WeekPlanRepository(conn)
                week_done = repo.is_week_complete(week_plan_id)
                if week_done:
                    repo.complete_week(week_plan_id)
            if week_done:
                next_week = compose_week(db, athlete_id)
        else:
            # legacy session-at-a-time path: pre-compose the next single session (cache fill).
            next_session = compose_session(db, athlete_id)

    with db.transaction() as conn:
        row = conn.execute("SELECT * FROM workout_session WHERE id=?", (session_id,)).fetchone()
        completed = session_to_dict(conn, row)
    return {"session": completed, "next_session": next_session, "next_week": next_week}
