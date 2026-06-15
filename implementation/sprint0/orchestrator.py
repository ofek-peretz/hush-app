"""
The closed learning loop (ES System Architecture, master loop).

One iteration, for a single capability slot:

    recommend  -> (athlete performs) -> observe
               -> attribute to evidence -> update state

The orchestrator is pure except that it mutates the passed-in CapabilityState
through the single StateWriter path (apply_evidence). It does not own persistence;
the simulation harness and (later) the service supply state and record history.
"""
from __future__ import annotations
from dataclasses import dataclass

from ..domain import CapabilityState, Recommendation, Observation, Evidence
from ..recommendation import recommend
from ..prediction import predict_reps_to_failure          # DX-02: re-predict at the actual load
from ..evidence import observation_to_evidence
from ..state_update import apply_evidence
from ..capability.decay import decay
from ..capability.reference_strength import reference_strength
from ..fatigue import set_fatigue, accumulate
from ..recovery import estimate_current_fatigue
from ..variance import update_moments, agreement as compute_agreement


@dataclass(frozen=True)
class LoopResult:
    recommendation: Recommendation
    observation: Observation
    evidence: list[Evidence]
    score_before: float
    score_after: float
    confidence_after: float
    # --- Sprint 2 (ES-011 / ES-010 C) audit + fatigue threading ---
    est_fatigue_systemic: float = 0.0
    est_fatigue_capability: float = 0.0
    agreement: float = 1.0
    new_fatigue_systemic: float = 0.0


def run_one_set(
    state: CapabilityState,
    athlete_id: str,
    exercise: str,
    difficulty_factor: float,
    target_reps: int,
    perform,                       # callable(recommendation) -> (actual_weight:float, actual_reps:int)
    week: float,
    contribution_weights: dict[str, float] | None = None,
    enable_fatigue: bool = False,
    fatigue_systemic: float = 0.0,
) -> LoopResult:
    """Run recommend -> perform -> observe -> evidence -> update for one set.

    Default (enable_fatigue=False): the fatigue-free Sprint 0 loop, unchanged.
    Enabled: the full ES-011 master loop — estimate+decay fatigue, de-fatigue the
    observation (rep space, before attribution), variance-suppress confidence
    (ES-010 C), then generate+accumulate the set's fatigue. `fatigue_systemic` is the
    athlete's current systemic fatigue; the new value is returned for the caller to
    thread into the next set (the pure loop holds no athlete-level store).
    """
    if not enable_fatigue:
        score_before = state.score
        rec = recommend(state, exercise, difficulty_factor, target_reps)
        rec = Recommendation(  # stamp athlete_id (Recommendation is frozen)
            athlete_id=athlete_id, capability=rec.capability, exercise=rec.exercise,
            difficulty_factor=rec.difficulty_factor,
            recommended_weight=rec.recommended_weight, target_reps=rec.target_reps,
            predicted_reps_to_failure=rec.predicted_reps_to_failure,
            prediction_confidence=rec.prediction_confidence,
            decision_reason=rec.decision_reason,
        )
        actual_weight, actual_reps = perform(rec)              # DX-01: logged weight + reps
        actual_weight = float(actual_weight)
        actual_reps = int(actual_reps)
        predicted_at_actual = predict_reps_to_failure(         # DX-02: re-predict at the actual load
            state.capability, score_before, difficulty_factor, actual_weight,
        )
        obs = Observation(
            athlete_id=athlete_id, capability=state.capability, exercise=exercise,
            difficulty_factor=difficulty_factor, actual_weight=actual_weight,
            actual_reps=actual_reps,
            predicted_reps_to_failure=predicted_at_actual,
            prediction_error=actual_reps - predicted_at_actual,
            week=week,
        )
        weights = contribution_weights or {state.capability: 1.0}
        evidence = observation_to_evidence(
            obs, weights, prediction_confidence=rec.prediction_confidence, now_week=week
        )
        for ev in evidence:
            if ev.capability == state.capability:
                apply_evidence(state, ev, week)
        return LoopResult(
            recommendation=rec, observation=obs, evidence=evidence,
            score_before=score_before, score_after=state.score,
            confidence_after=state.confidence,
        )

    # ---------- ES-011 fatigue-aware master loop ----------
    score_before = state.score

    # estimate current fatigue: decay stored fatigue forward to `week` (Part D)
    fs, fc = estimate_current_fatigue(
        state.capability, fatigue_systemic, state.fatigue,
        state.last_trained_at_week, week,
    )
    total_fatigue = max(0.0, fs + fc)

    # 1. recommend (fatigue-aware: B.1 prediction + B.2 reduction order)
    rec = recommend(
        state, exercise, difficulty_factor, target_reps,
        fatigue_systemic=fs, fatigue_capability=fc,
    )
    rec = Recommendation(
        athlete_id=athlete_id, capability=rec.capability, exercise=rec.exercise,
        difficulty_factor=rec.difficulty_factor,
        recommended_weight=rec.recommended_weight, target_reps=rec.target_reps,
        predicted_reps_to_failure=rec.predicted_reps_to_failure,
        prediction_confidence=rec.prediction_confidence,
        decision_reason=rec.decision_reason,
        est_fatigue_systemic=fs, est_fatigue_capability=fc,
    )

    # 2. perform — DX-01: logged weight + reps
    actual_weight, actual_reps = perform(rec)
    actual_weight = float(actual_weight)
    actual_reps = int(actual_reps)
    predicted_at_actual = predict_reps_to_failure(         # DX-02: re-predict at the actual load (fatigue threaded)
        state.capability, score_before, difficulty_factor, actual_weight,
        fatigue=total_fatigue,
    )

    # 3. observe (store the fatigue removed, for audit — E.1)
    obs = Observation(
        athlete_id=athlete_id, capability=state.capability, exercise=exercise,
        difficulty_factor=difficulty_factor, actual_weight=actual_weight,
        actual_reps=actual_reps,
        predicted_reps_to_failure=predicted_at_actual,
        prediction_error=actual_reps - predicted_at_actual,
        week=week, est_fatigue=total_fatigue,
    )

    # 4. attribute -> evidence, de-fatiguing in rep space first (C.3)
    weights = contribution_weights or {state.capability: 1.0}
    evidence = observation_to_evidence(
        obs, weights, prediction_confidence=rec.prediction_confidence,
        now_week=week, est_fatigue=total_fatigue,
    )

    # 5. variance-suppressed update (ES-010 C): forgetting factor = evidence decay
    elapsed = max(0.0, week - (state.last_trained_at_week or week))
    forget = decay(elapsed)
    ag = 1.0
    for ev in evidence:
        if ev.capability != state.capability:
            continue
        state.var_w, state.var_ws, state.var_ws2 = update_moments(
            state.var_w, state.var_ws, state.var_ws2, forget, ev.s_obs, ev.weight
        )
        ag = compute_agreement(state.var_w, state.var_ws, state.var_ws2)
        apply_evidence(state, ev, week, agreement=ag)

    # 6. generate + accumulate this set's fatigue (A.4/A.5), using capacity at set time
    rm1_ref = reference_strength(state.capability, score_before)
    sf = set_fatigue(
        effective_load=actual_weight,                  # DX-01: cost fatigue at the LIFTED load
        reference_strength_c=rm1_ref,
        reps_performed=actual_reps,
        predicted_reps_to_failure=rec.predicted_reps_to_failure,
    )
    new_systemic, new_capability = accumulate(fs, fc, sf, w_c=1.0)
    state.fatigue = new_capability

    return LoopResult(
        recommendation=rec, observation=obs, evidence=evidence,
        score_before=score_before, score_after=state.score,
        confidence_after=state.confidence,
        est_fatigue_systemic=fs, est_fatigue_capability=fc,
        agreement=ag, new_fatigue_systemic=new_systemic,
    )
