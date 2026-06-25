"""
Two coaches, one athlete. Faithful, side-by-side drivers for the two progression "brains".

This module is the FAIRNESS CONTRACT of the comparison. Both engines:
  * coach the SAME synthetic athlete (same true strength, same trend, same fatigue, same
    noise realization — see harness.py),
  * train ONE canonical lift (horizontal_push / barbell bench, difficulty_factor = 1.0),
  * prescribe ONE working weight per session, over which the athlete performs N working sets,
  * START at the IDENTICAL session-1 weight (the Bayesian cold-start load is fed to the
    Double-Progression seed), so they diverge ONLY by their own decision logic from session 2.

Engine A — Bayesian (the original "learning" brain). Drives the REAL frozen `hush_model`:
  recommend() -> athlete performs -> observation -> evidence -> precision-weighted state
  blend, plus the ES-006 decision-memory / stability-guard update, exactly as the live
  multi-set pipeline does (faithful re-wiring of persistence/pipeline.py, no DB).

Engine B — Double Progression (the new live brain). A faithful Python port of
  code/mobile/src/data/progression.ts `prescribe()` for a weighted compound (barbell step
  2.5 kg, own-the-top-of-the-range, two-miss deload).
"""
from __future__ import annotations
from dataclasses import dataclass, field

# --- real frozen Bayesian model ---
from hush_model.domain import CapabilityState, Observation
from hush_model.recommendation import recommend
from hush_model.evidence import observation_to_evidence
from hush_model.state_update import apply_evidence
from hush_model.decision import update_streaks, INCREASE_LOAD, DECREASE_LOAD
from hush_model.prediction import predict_reps_to_failure
from hush_model.constants import SEED_SCORE, SEED_CONFIDENCE, DEFAULT_RIR

CAPABILITY = "horizontal_push"
DIFFICULTY = 1.0


@dataclass
class SessionRecord:
    """One coached session, as observed from the outside — the common currency for metrics."""
    week: float
    index: int
    weight: float                 # the prescribed working weight
    target_reps: int              # the bottom of the range the engine asked for
    reps: list[int]               # achieved reps, one per working set
    decision: str                 # 'increase' | 'decrease' | 'hold' (observed weight move)
    engine_reason: str = ""       # the engine's own label, for audit
    true_score: float = 0.0       # athlete TRUE capability score at session time (ground truth)


# ────────────────────────────────────────────────────────────────────────────
# Engine B — Double Progression (faithful port of progression.ts, compound/barbell)
# ────────────────────────────────────────────────────────────────────────────
RANGE_SPREAD_COMPOUND = 2
BARBELL_STEP = 2.5


class DoubleProgressionEngine:
    name = "Double Progression"

    def __init__(self, seed_weight: float, bottom_reps: int):
        self.seed = seed_weight
        self.bottom = bottom_reps
        self.top = bottom_reps + RANGE_SPREAD_COMPOUND
        self.step = BARBELL_STEP
        self._history: list[list[int]] = []     # achieved reps per past session (newest LAST)
        self._weights: list[float] = []          # working weight per past session

    def prescribe(self) -> tuple[float, int]:
        """Return (weight, target_reps) for the next session — a pure function of history."""
        if not self._history:
            return self.seed, self.bottom
        last_reps = self._history[-1]
        last_w = self._weights[-1]
        # own the top across every working set -> +1 step, reset to the bottom
        if last_reps and all(r >= self.top for r in last_reps):
            return last_w + self.step, self.bottom
        # two consecutive sessions missing the bottom -> deload one step
        def missed(reps):
            return bool(reps) and any(r < self.bottom for r in reps)
        if len(self._history) >= 2 and missed(last_reps) and missed(self._history[-2]):
            return max(self.step, last_w - self.step), self.bottom
        # otherwise hold and chase the top next time
        return last_w, self.bottom

    def record(self, weight: float, reps: list[int]) -> None:
        self._weights.append(weight)
        self._history.append(list(reps))


# ────────────────────────────────────────────────────────────────────────────
# Engine A — Bayesian (drives the real frozen hush_model)
# ────────────────────────────────────────────────────────────────────────────
class BayesianEngine:
    name = "Bayesian"

    def __init__(self, experience: str, bottom_reps: int, rir: float = DEFAULT_RIR):
        self.target_reps = bottom_reps
        self.rir = rir
        self.state = CapabilityState(
            capability=CAPABILITY,
            score=SEED_SCORE[experience],
            confidence=SEED_CONFIDENCE,
            sum_w=0.0,
        )

    def prescribe(self) -> tuple[float, int]:
        rec = recommend(self.state, "bench", DIFFICULTY, self.target_reps, rir=self.rir)
        self._last_rec = rec
        return rec.recommended_weight, self.target_reps

    def record(self, weight: float, reps: list[int], week: float) -> None:
        """Re-wire the live multi-set learning path: per-set evidence -> blend, then the
        single ES-006 decision-memory update at block completion (pipeline._record_block_decision)."""
        rec = self._last_rec
        state = self.state
        score_at_block_entry = state.score
        block_s_obs = score_at_block_entry
        for r in reps:
            predicted_at_actual = predict_reps_to_failure(
                CAPABILITY, score_at_block_entry, DIFFICULTY, weight,
            )
            obs = Observation(
                athlete_id="a", capability=CAPABILITY, exercise="bench",
                difficulty_factor=DIFFICULTY, actual_weight=weight, actual_reps=int(r),
                predicted_reps_to_failure=predicted_at_actual,
                prediction_error=int(r) - predicted_at_actual, week=week,
            )
            evidence = observation_to_evidence(
                obs, {CAPABILITY: 1.0}, prediction_confidence=rec.prediction_confidence,
                now_week=week,
            )
            for ev in evidence:
                if ev.capability != CAPABILITY:
                    continue
                block_s_obs = ev.s_obs
                apply_evidence(state, ev, week)
        # ES-006 decision memory (block-level): advance/consume the stability run, store the held load
        block_surprise = block_s_obs - score_at_block_entry
        state.consecutive_positive, state.consecutive_negative = update_streaks(
            state.consecutive_positive, state.consecutive_negative, block_surprise,
        )
        if rec.decision_type in (INCREASE_LOAD, DECREASE_LOAD):
            state.consecutive_positive = 0
            state.consecutive_negative = 0
        state.last_recommended_weight = rec.recommended_weight
        state.last_decision = rec.decision_type
