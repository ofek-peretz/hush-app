"""
Session Engine driver (ES-009/009.1 → ES-006). Sprint 3B-2.

The orchestration the composition engine needs but the pipeline did not provide (readiness
review HD1): it composes a load-free session (ES-009/009.1), persists the ordered blocks,
drives each block's set loop through the Sprint 2 fatigue-aware learning chain, and advances
the ES-006 decision memory EXACTLY ONCE per capability (R2). It writes no model logic — it
composes `composition.compose_session` + the existing `LearningPipeline` + repositories.

RATIFIED RULES realized here:
  - R2 — one governor update per capability per session. All sets run with govern=False
    (learning only); the ES-006 streak/decision memory is advanced once per capability via
    `complete_block()`, driven by the capability's PRIMARY slot (is_primary_slot). Secondary
    slots of the same capability contribute learning (score blend) but never decision memory.
  - R3 — governor memory stays capability-scoped. An exercise swap is NOT special-cased here;
    `difficulty_factor` translates the load via the ES-006 target (recommendation.py).
  - R4 — fully deterministic exploration: the session is composed from a persisted seed; the
    seed is stored on the session row (ES-009 §9) so the session is reconstructable.

CONCEPTUAL LOCATION: hush_model/session.py (or persistence/session.py). It is a driver over
the persistence layer; placed beside the service for that reason.
"""
from __future__ import annotations
from dataclasses import dataclass

from ..composition import compose_session, SessionPlan
from ..recommendation import recommend
from ..domain import default_strategy_state
from ..constants import MODEL_VERSION, CAPABILITY_MODEL_VERSION
from .db import Database
from .repositories import StateRepository, SessionRepository
from .pipeline import LearningPipeline


@dataclass
class _CapMemory:
    """Per-capability accumulator so the ES-006 streak advances ONCE (R2), driven by the
    PRIMARY slot, robust to Stage-4 reordering (exploration can place the primary block
    after a canonical second slot)."""
    entry: float | None = None       # capability score before ANY of its sets this session
    s_obs: float = 0.0               # representative observed score (primary block preferred)
    decision_type: str = ""
    recommended_weight: float = 0.0
    have_primary: bool = False


class SessionEngine:
    """Compose → persist → run → learn for one full session."""

    def __init__(self, db: Database):
        self.db = db
        self.pipeline = LearningPipeline(db)

    def compose_and_open(
        self, athlete_id: str, week: float, session_index: int, seed: int,
        target_reps: int = 8, week_plan_id: str | None = None,
        position_in_week: int | None = None, status: str = "active",
    ) -> tuple[str, SessionPlan, list]:
        """Steps 1–2 of a session: snapshot state, compose (pure / load-free, ES-009), open the
        session with the §9 audit snapshot, and persist the ordered blocks with their composed
        (frozen) loads. Extracted so the DX-11 event-driven runtime reuses the SAME primitive
        (Build Plan §0 "one implementation") rather than a copy. Returns (session_id, plan,
        block_ids). No set loop, no decision-memory advance — those are the caller's."""
        # 1. snapshot state (one read txn) and compose — composition is pure / load-free.
        with self.db.transaction() as conn:
            ath = StateRepository(conn).load_athlete_state(athlete_id)
        strategy = ath.strategy or default_strategy_state(athlete_id)
        plan = compose_session(
            ath, strategy, session_index=session_index, seed=seed, week=week
        )

        # 2. open the session (persist the ES-009 §9 audit snapshot incl. the seed) and persist
        #    the ordered blocks; seed each block's recommended_weight from ES-006 (load-free
        #    composition is now loaded). One txn.
        with self.db.transaction() as conn:
            sess = SessionRepository(conn)
            state = StateRepository(conn)
            session_id = sess.create_session(
                athlete_id, week, exploration_seed=seed, session_index=session_index,
                weekly_frequency=plan.weekly_frequency, weekly_volume=plan.weekly_volume,
                calibration_phase=plan.calibration_phase,
                # Migration 014: complete the composition audit so the candidate-selection
                # decision replays from stored data alone (focus + candidate pool + code version).
                primary_focus=plan.primary_focus, secondary_focus=plan.secondary_focus,
                catalog_version=plan.catalog_version,
                model_version=MODEL_VERSION,
                capability_model_version=CAPABILITY_MODEL_VERSION,
                # Weekly Program Container: this workout's week + athlete-owned position.
                status=status, week_plan_id=week_plan_id, position_in_week=position_in_week,
            )
            block_ids: list[str] = []
            for bp in plan.blocks:
                cap = state.get_capability_state(athlete_id, bp.capability)
                # DX-20: recommend() rested now returns recommended_weight == target_load (the
                # score-derived learned-capability load), so the composed block load is built from
                # learned reality. The load is FIXED here at composition (frozen session); the
                # per-set fatigue-aware chain adapts from this composed load, never re-authoring it.
                rec = recommend(cap, bp.exercise_id, bp.difficulty_factor, target_reps)
                block_ids.append(sess.add_block(
                    session_id, bp.capability, bp.exercise_id, bp.difficulty_factor,
                    bp.position, rec.recommended_weight, target_reps, bp.target_sets,
                    selection_reason=bp.selection_reason,
                ))
        return session_id, plan, block_ids

    def run_session(
        self, athlete_id: str, week: float, session_index: int, seed: int,
        perform, target_reps: int = 8,
    ) -> tuple[str, SessionPlan, list]:
        """Run one composed session. `perform(recommendation) -> (actual_weight:float,
        actual_reps:int)` is the athlete callback (the sim, or a real app); DX-01 — it reports
        the LOGGED weight + reps. Returns (session_id, plan, set_results)."""
        # 1–2. compose (load-free) + open/persist the session and its blocks. Shared with the
        #      DX-11 event-driven SessionRuntime so both drive the SAME compose/persist primitive.
        session_id, plan, block_ids = self.compose_and_open(
            athlete_id, week, session_index, seed, target_reps
        )

        # 3. run each block's sets through the fatigue-aware learning chain (govern=False),
        #    accumulating per-capability the inputs for the single decision-memory update (R2).
        mem: dict[str, _CapMemory] = {}
        results: list = []
        for bp, block_id in zip(plan.blocks, block_ids):
            acc = mem.setdefault(bp.capability, _CapMemory())
            for set_number in range(1, bp.target_sets + 1):
                res = self.pipeline.report_set_fatigue_aware(
                    athlete_id, session_id, block_id, bp.capability, bp.exercise_id,
                    bp.difficulty_factor, target_reps, set_number, perform, week,
                    govern=False,
                )
                results.append(res)
                if acc.entry is None:
                    acc.entry = res.score_before  # session-entry score for this capability
                # default-fill from any block until the primary is seen; primary overrides.
                if bp.is_primary_slot or not acc.have_primary:
                    if set_number == 1:
                        acc.decision_type = res.decision_type
                        acc.recommended_weight = res.recommended_weight
                    acc.s_obs = res.s_obs
            if bp.is_primary_slot:
                acc.have_primary = True
            with self.db.transaction() as conn:
                SessionRepository(conn).set_block_status(block_id, "completed")

        # 4. advance ES-006 decision memory ONCE per capability (R2), deterministic order.
        #    DX-03 (M3): the governor is ADVISORY — decision_type is the advised lean and
        #    recommended_weight is the HELD load; decision memory is recorded as before.
        for capability in sorted(mem, key=lambda c: _cap_rank(c)):
            acc = mem[capability]
            self.pipeline.complete_block(
                athlete_id, capability, week,
                score_at_block_entry=acc.entry if acc.entry is not None else 0.0,
                block_s_obs=acc.s_obs, decision_type=acc.decision_type,
                recommended_weight=acc.recommended_weight,
            )

        # 5. close the session (ES-001 completion rule) and advance the workout count.
        with self.db.transaction() as conn:
            sess = SessionRepository(conn)
            for b in sess.blocks_for_session(session_id):
                if b["status"] not in ("completed", "skipped"):
                    sess.set_block_status(b["id"], "completed")
            sess.complete_session(session_id)
            StateRepository(conn).increment_workout_count(athlete_id)

        return session_id, plan, results


def _cap_rank(capability: str) -> int:
    from ..constants import CAPABILITY_PRIORITY_ORDER
    try:
        return CAPABILITY_PRIORITY_ORDER.index(capability)
    except ValueError:
        return len(CAPABILITY_PRIORITY_ORDER)
