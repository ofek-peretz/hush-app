"""
Recommendation Engine (ES-006 / ES-005.1 sec 7, 13).

Produces a working-set recommendation for a single capability slot:

  1. target predicted-reps-to-failure = target_reps + RIR
  2. L_ideal = load_for_reps(target+RIR, RM1_exercise)
  3. apply confidence-scaled safety discount  (ES-005.1 sec 7)
  4. floor to plate increment, never round up  (ES-005.1 sec 13)

Sprint 0 emitted a KEEP-style working-set recommendation each call. Sprint 3A added the
ES-006 decision hierarchy over that working-set load: the score-derived load is the TARGET,
and decision.py computes whether the load leans KEEP / INCREASE / DECREASE once the
stability guard and confidence gate are satisfied. DX-03 (M3) demoted that governor to
ADVISORY: decision.py computes the type + reason, but its load step is not applied.
DX-20 (M1) completes the demotion: the rested governed branch now emits the score-derived
TARGET load — future programs are built from LEARNED CAPABILITY (the variance-damped,
confidence-gated score), never from a frozen historical anchor. govern() is retained ONLY to
compute the advisory lean (now a session-over-session signal: this target vs the last composed
load, held in last_recommended_weight) and never authors the load. With no decision memory
(the cold-start default), the path still emits target_load directly — cold start is unchanged.
The session stays frozen once composed and execution never ratchets (DX-03 intent preserved);
DX-20 changes WHAT the composition load is (learned capability), not WHEN it is fixed.
decision.py is the single source of truth for decision type and reason.

Sprint 2 (ES-011 B.1/B.2/B.3) makes the recommendation fatigue-aware:
  - Prediction is built on observed_capability = score − fatigue, so a fatigued day
    auto-softens the working load (B.1) — the conservative discount stacks on top.
  - Reduction order is reps → weight (B.2): under fatigue we HOLD the rested load and
    lower the target reps (least disruptive); we drop the weight only when holding the
    load would push below MIN_EFFECTIVE_REPS. (Set-count reduction is the ES-009.1
    fatigue ceiling — deferred with session composition.)
  - INCREASE is structurally vetoed while fatigued (B.3): the load is never raised
    above the rested baseline, so progression-into-fatigue cannot occur.
The `fatigue_*` arguments default to 0.0, making the rested recommendation
bit-identical to Sprint 0/1.
"""
from __future__ import annotations
import math

from .constants import (
    SAFETY_DISCOUNT_MAX, PLATE_INCREMENT_KG, DEFAULT_RIR, MIN_EFFECTIVE_REPS,
    DEFAULT_EQUIPMENT_STEP_KG,
)
from .domain import CapabilityState, Recommendation
from .prediction import exercise_rm1, predict_reps_to_failure
from .capability.epley import load_for_reps
from .decision import (
    govern, KEEP_LOAD,
    REASON_WORKING_SET_SEED, REASON_FATIGUE_HOLD_REPS, REASON_FATIGUE_HOLD_WEIGHT,
)


def safety_discount(prediction_confidence: float) -> float:
    """ES-005.1 sec 7: 1 - 0.12*(1 - c/100). Auto-removes as confidence rises."""
    return 1.0 - SAFETY_DISCOUNT_MAX * (1.0 - prediction_confidence / 100.0)


def _floor_to_plate(load: float) -> float:
    return math.floor(load / PLATE_INCREMENT_KG) * PLATE_INCREMENT_KG


def recommend(
    state: CapabilityState,
    exercise: str,
    difficulty_factor: float,
    target_reps: int,
    rir: float = DEFAULT_RIR,
    fatigue_systemic: float = 0.0,
    fatigue_capability: float = 0.0,
) -> Recommendation:
    pred_conf = state.confidence                       # capability confidence == pred conf
    total_fatigue = max(0.0, fatigue_systemic + fatigue_capability)

    # ES-005.1 score-derived TARGET load: the rested working load the governor steers
    # toward, and the load we try to HOLD under fatigue. This is the SINGLE load formula.
    rm1_rested = exercise_rm1(state.capability, state.score, difficulty_factor)
    l_ideal = load_for_reps(target_reps + rir, rm1_rested)
    target_load = _floor_to_plate(l_ideal * safety_discount(pred_conf))

    if total_fatigue <= 0.0:
        # ---- rested path: ES-006 governor over the target ----
        if state.last_recommended_weight is None:
            # cold start (no decision memory): emit the ES-005.1 working set as-is.
            # BIT-IDENTICAL to Sprint 0/1 and the Sprint 2 zero-fatigue path.
            load = target_load
            decision_type = KEEP_LOAD
            reason = REASON_WORKING_SET_SEED
        else:
            # ES-006 ADVISORY governor (DX-03/M3 + DX-20): govern() computes the lean
            # (KEEP/INCREASE/DECREASE) + reason for audit/insight + M5, but it does NOT
            # author the load. DX-20: the emitted rested load is the score-derived TARGET
            # (learned capability) — future programs are built from learned reality, never
            # from the held historical anchor. `held_load` is now the PREVIOUS composed load
            # (last_recommended_weight), passed only so the lean is a session-over-session
            # signal (this target vs the last program). The athlete's actual_weight reaches
            # the program EXCLUSIVELY via evidence → blend → score → target_load (never directly).
            dec = govern(
                held_load=state.last_recommended_weight,
                target_load=target_load,
                confidence=pred_conf,
                consecutive_positive=state.consecutive_positive,
                consecutive_negative=state.consecutive_negative,
                equipment_step=DEFAULT_EQUIPMENT_STEP_KG,
            )
            load = target_load          # DX-20: emit learned-capability load (was dec.recommended_weight)
            decision_type = dec.decision_type
            reason = dec.reason

        predicted = predict_reps_to_failure(
            state.capability, state.score, difficulty_factor, load
        )
        return Recommendation(
            athlete_id="",  # filled by caller/service; sim sets it
            capability=state.capability, exercise=exercise,
            difficulty_factor=difficulty_factor,
            recommended_weight=load, target_reps=target_reps,
            predicted_reps_to_failure=predicted, prediction_confidence=pred_conf,
            decision_reason=reason, decision_type=decision_type, target_load=target_load,
        )

    # ---- fatigue-aware path (ES-011 B.2) — behavior unchanged from Sprint 2 ----
    # An elevated-fatigue day is always a KEEP (fatigue_hold); INCREASE is structurally
    # impossible here. Reasons now come from decision.py's single vocabulary.
    load = target_load
    # reps first: hold the load, lower the target to the fatigue-adjusted prediction.
    pred_fatigued_at_held = predict_reps_to_failure(
        state.capability, state.score, difficulty_factor, load, fatigue=total_fatigue
    )
    fatigued_target = pred_fatigued_at_held - rir

    if fatigued_target >= MIN_EFFECTIVE_REPS:
        final_load = load
        final_target = max(MIN_EFFECTIVE_REPS, int(math.floor(fatigued_target)))
        reason = REASON_FATIGUE_HOLD_REPS
    else:
        # weight second: holding the load would drop below the effective-rep floor,
        # so reduce the load to restore MIN_EFFECTIVE_REPS at current fatigue.
        rm1_fatigued = exercise_rm1(
            state.capability, state.score, difficulty_factor, fatigue=total_fatigue
        )
        l_reduced = load_for_reps(MIN_EFFECTIVE_REPS + rir, rm1_fatigued)
        final_load = _floor_to_plate(l_reduced * safety_discount(pred_conf))
        final_target = MIN_EFFECTIVE_REPS
        reason = REASON_FATIGUE_HOLD_WEIGHT

    predicted = predict_reps_to_failure(
        state.capability, state.score, difficulty_factor, final_load,
        fatigue=total_fatigue,
    )
    return Recommendation(
        athlete_id="",
        capability=state.capability, exercise=exercise,
        difficulty_factor=difficulty_factor,
        recommended_weight=final_load, target_reps=final_target,
        predicted_reps_to_failure=predicted, prediction_confidence=pred_conf,
        decision_reason=reason, decision_type=KEEP_LOAD, target_load=target_load,
        est_fatigue_systemic=fatigue_systemic,
        est_fatigue_capability=fatigue_capability,
    )
