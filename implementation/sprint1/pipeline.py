"""
Learning pipeline (Sprint 1) — the persisted, transactional version of the
Sprint 0 master loop.

For one reported set, inside ONE transaction:
    recommend  (write recommendation)
      -> athlete performs
      -> observe        (write set_record + observation)
      -> attribute      (write evidence per capability)  [ES-010 load-space split]
      -> state update   (write capability_state via StateRepository ONLY,
                         + state_update_log)              [ES-007 sole writer]

Atomicity is the point: if any step fails the whole chain rolls back, so the audit
chain never has a missing link (System Architecture invariant). The pure model
functions from Sprint 0 are reused verbatim — persistence wraps them, it does not
reimplement them.

Sprint 1 scope: single-capability blocks (w_c = 1.0), one exercise per session-slot,
fatigue-free prediction. Multi-capability attribution already works in evidence.py;
fatigue (ES-011), session composition (ES-009), and the full decision hierarchy
remain later sprints (stubbed, not redesigned).
"""
from __future__ import annotations
import math
from dataclasses import dataclass

from .db import Database
from .repositories import StateRepository, SessionRepository, LearningRepository
from ..domain import Recommendation, Observation
from ..recommendation import recommend
from ..prediction import predict_reps_to_failure          # DX-02: re-predict at the actual load
from ..evidence import observation_to_evidence
from ..state_update import apply_evidence
from ..constants import MODEL_VERSION, TAU_SYS, TAU_CAP
from ..capability.decay import decay
from ..capability.reference_strength import reference_strength
from ..fatigue import set_fatigue, accumulate
from ..recovery import decay_fatigue
from ..variance import update_moments, recent_variance, agreement as compute_agreement
from ..decision import update_streaks, INCREASE_LOAD, DECREASE_LOAD


@dataclass(frozen=True)
class SetResult:
    recommendation_id: str
    observation_id: str
    evidence_ids: list[str]
    score_before: float
    score_after: float
    confidence_after: float
    # --- Sprint 3B-2: surfaced for the multi-set/multi-block session driver ---
    # s_obs is this set's representative de-fatigued observed score (the block-surprise
    # input the driver carries into complete_block, HD2/R4); decision_type/recommended_weight
    # are the recommendation this set emitted, so the driver advances the ES-006 streak once
    # per capability from the PRIMARY slot (R2) without re-reading history. Defaulted, so the
    # Sprint 0-3B-1 callers/assertions are byte-unchanged.
    s_obs: float = 0.0
    decision_type: str = ""
    recommended_weight: float = 0.0


def _record_block_decision(
    state_repo,
    athlete_id: str,
    capability: str,
    cap_state,
    week: float,
    score_at_block_entry: float,
    block_s_obs: float,
    decision_type: str,
    recommended_weight: float,
) -> None:
    """THE single source of truth for the ES-006 decision-memory / stability-guard update
    (readiness review HD1: no duplicated governor logic). Called ONCE per block, by both
    the per-set delegation in report_set / report_set_fatigue_aware (single-set: the block
    completes in-call) and the public complete_block() hook (multi-set callers, Sprint 3B-2).

    block_surprise = s_obs - score_at_block_entry (ratified): computed once per block from
    the block's representative observed score and the score captured at block OPEN, so it
    is independent of intra-block score drift. On the single-capability single-set path it
    is exactly S_obs_clean - score_before, identical to the Sprint 3A inline computation."""
    block_surprise = block_s_obs - score_at_block_entry
    cap_state.consecutive_positive, cap_state.consecutive_negative = update_streaks(
        cap_state.consecutive_positive, cap_state.consecutive_negative, block_surprise,
    )
    # reset-the-streak-on-fire (ES-006 Recommendation Memory): a fired INCREASE/DECREASE
    # consumes its run so the same evidence cannot immediately re-fire. DX-03 (M3): the
    # governor is now ADVISORY (the INCREASE/DECREASE load step is not applied; recommended_weight
    # is the HELD load), but decision memory is retained UNCHANGED for audit/history — the
    # advisory lean still advances/consumes the run and is still recorded.
    if decision_type in (INCREASE_LOAD, DECREASE_LOAD):
        cap_state.consecutive_positive = 0
        cap_state.consecutive_negative = 0
    cap_state.last_recommended_weight = recommended_weight
    cap_state.last_decision = decision_type
    cap_state.last_decision_week = week
    state_repo.write_capability_state(athlete_id, cap_state)


class LearningPipeline:
    """Owns the synchronous transactional learning chain over the database."""

    def __init__(self, db: Database):
        self.db = db

    def report_set(
        self,
        athlete_id: str,
        session_id: str,
        block_id: str,
        capability: str,
        exercise: str,
        difficulty_factor: float,
        target_reps: int,
        set_number: int,
        perform,                       # callable(recommendation) -> (actual_weight:float, actual_reps:int)
        week: float,
        contribution_weights: dict[str, float] | None = None,
        govern: bool = False,
    ) -> SetResult:
        """Sprint 1 rested learning chain.

        Sprint 3A adds the opt-in ES-006 governor (`govern=True`): after the blend it
        updates the capability's decision memory + stability-guard streak so the NEXT
        recommendation can KEEP / INCREASE / DECREASE. `govern` defaults False, leaving
        the Sprint 0/1/2 behavior byte-identical (the governor is also inert until
        decision memory exists, which only this path writes)."""
        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            sess_repo = SessionRepository(conn)
            learn_repo = LearningRepository(conn)

            # read current state (decisions read from state, never history — ES-Founder s34)
            cap_state = state_repo.get_capability_state(athlete_id, capability)
            score_before = cap_state.score

            # 1. recommend (governed iff decision memory exists on cap_state)
            rec = recommend(cap_state, exercise, difficulty_factor, target_reps)
            rec = Recommendation(
                athlete_id=athlete_id, capability=rec.capability, exercise=rec.exercise,
                difficulty_factor=rec.difficulty_factor,
                recommended_weight=rec.recommended_weight, target_reps=rec.target_reps,
                predicted_reps_to_failure=rec.predicted_reps_to_failure,
                prediction_confidence=rec.prediction_confidence,
                decision_reason=rec.decision_reason,
                decision_type=rec.decision_type, target_load=rec.target_load,
            )
            rec_id = learn_repo.insert_recommendation(rec, block_id)

            # 2. athlete performs — DX-01: the callback reports the LOGGED weight + reps
            actual_weight, actual_reps = perform(rec)
            actual_weight = float(actual_weight)
            actual_reps = int(actual_reps)

            # DX-02: re-predict reps-to-failure at the ACTUAL load (not the recommended one),
            # on the pre-update score basis (score_before) — exactly how rec.predicted was built —
            # so the quality/prediction_error are formed at the load the athlete really lifted.
            # When actual_weight == rec.recommended_weight this equals rec.predicted_reps_to_failure
            # bit-for-bit, so the no-deviation learning path is unchanged.
            predicted_at_actual = predict_reps_to_failure(
                capability, score_before, difficulty_factor, actual_weight,
            )

            # 3. observe (set_record is the fundamental learning unit; both weights stored:
            #    recommended_weight = the advisory prescription, actual_weight = DX-01 logged load)
            set_id = sess_repo.add_set(
                block_id, set_number, rec.recommended_weight, target_reps,
                actual_weight=actual_weight, actual_reps=actual_reps,
                status="completed",
            )
            obs = Observation(
                athlete_id=athlete_id, capability=capability, exercise=exercise,
                difficulty_factor=difficulty_factor,
                actual_weight=actual_weight, actual_reps=actual_reps,
                predicted_reps_to_failure=predicted_at_actual,
                prediction_error=actual_reps - predicted_at_actual,
                week=week,
            )
            obs_id = learn_repo.insert_observation(obs, session_id, block_id, set_id)

            # 4. attribute -> evidence (load-space split; one row per capability)
            weights = contribution_weights or {capability: 1.0}
            evidence = observation_to_evidence(
                obs, weights, prediction_confidence=rec.prediction_confidence,
                now_week=week,
            )
            evidence_ids: list[str] = []
            for ev in evidence:
                evidence_ids.append(learn_repo.insert_evidence(ev, obs_id))

            # 5. state update (StateRepository is the ONLY state writer)
            block_s_obs = score_before   # representative block observation (ES-006 surprise)
            for ev, ev_id in zip(evidence, evidence_ids):
                if ev.capability != capability:
                    # secondary-capability evidence would update its own state here;
                    # Sprint 1 single-capability blocks have only the matching one.
                    continue
                block_s_obs = ev.s_obs
                prev = CapabilityStateSnapshot(cap_state)
                apply_evidence(cap_state, ev, week)

                log_reason = "precision_weighted_blend"
                log_decision = ""
                if govern:
                    log_reason = rec.decision_reason
                    log_decision = rec.decision_type

                state_repo.write_capability_state(athlete_id, cap_state)
                learn_repo.insert_state_update_log(
                    athlete_id, capability, ev_id, prev.state, cap_state,
                    reason=log_reason, model_version=MODEL_VERSION,
                    decision_type=log_decision,
                )

            # ES-006 decision memory updates ONCE at block completion via the single shared
            # hook (HD1/HD2). 3A blocks are single-set, so report_set completes the block
            # in-call (preserving the Sprint 3A governed trajectory bit-for-bit); multi-set
            # callers report sets with govern=False and call complete_block() instead.
            if govern:
                _record_block_decision(
                    state_repo, athlete_id, capability, cap_state, week,
                    score_at_block_entry=score_before, block_s_obs=block_s_obs,
                    decision_type=rec.decision_type,
                    recommended_weight=rec.recommended_weight,
                )

            return SetResult(
                recommendation_id=rec_id, observation_id=obs_id,
                evidence_ids=evidence_ids, score_before=score_before,
                score_after=cap_state.score, confidence_after=cap_state.confidence,
                s_obs=block_s_obs, decision_type=rec.decision_type,
                recommended_weight=rec.recommended_weight,
            )

    def complete_block(
        self,
        athlete_id: str,
        capability: str,
        week: float,
        score_at_block_entry: float,
        block_s_obs: float,
        decision_type: str,
        recommended_weight: float,
    ) -> None:
        """The block-completion hook (Sprint 3B-1). For MULTI-SET blocks: report each set
        via report_set(_fatigue_aware) with govern=False (learning only), then call this
        ONCE — the sole place the ES-006 streak / decision memory advances for multi-set
        blocks (Sprint 3B-2 composition uses this). Single-set callers do not need it
        (report_set delegates to the same shared hook in-call)."""
        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            cap_state = state_repo.get_capability_state(athlete_id, capability)
            _record_block_decision(
                state_repo, athlete_id, capability, cap_state, week,
                score_at_block_entry=score_at_block_entry, block_s_obs=block_s_obs,
                decision_type=decision_type, recommended_weight=recommended_weight,
            )

    # ------------------------------------------------------------------
    # Sprint 2: fatigue-aware learning chain (ES-011 + ES-010 Part C)
    # ------------------------------------------------------------------
    def report_set_fatigue_aware(
        self,
        athlete_id: str,
        session_id: str,
        block_id: str,
        capability: str,
        exercise: str,
        difficulty_factor: float,
        target_reps: int,
        set_number: int,
        perform,                       # callable(recommendation) -> (actual_weight:float, actual_reps:int)
        week: float,
        contribution_weights: dict[str, float] | None = None,
        govern: bool = False,
        override_category: str = "",
        override_target: float | None = None,
    ) -> SetResult:
        """The ES-011 master loop, persisted and transactional.

        Identical skeleton to report_set, with the frozen amendments applied:
          - fatigue is estimated (decayed forward) before recommending (Part D),
          - the observation is de-fatigued in rep space before attribution (C.3),
          - confidence is variance-suppressed and learning is variance-damped (ES-010 C),
          - the set's fatigue is generated and accumulated (A.4/A.5),
          - systemic + capability fatigue and the assumed state are persisted for audit.
        Whole chain commits atomically (the audit chain stays intact).

        Sprint 3B-1 adds the opt-in ES-006 governor (`govern=True`) to the fatigue-aware
        path too, via the SAME shared block-completion hook as report_set (HD1 — no
        duplicated governor). Default False leaves the Sprint 2 path byte-identical.

        BB-7 (Wave-2 web shell): `override_category`/`override_target` are an OPT-IN A9
        passthrough recorded on the observation (e.g. category=LOAD, target=actual_weight when
        the athlete's logged load deviates from the prescription). Defaults ''/None, so every
        existing caller (sim, golden tests) is byte-identical — only the API ingestion path
        sets them (the lossless override-target capture instrument)."""
        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            sess_repo = SessionRepository(conn)
            learn_repo = LearningRepository(conn)

            cap_state = state_repo.get_capability_state(athlete_id, capability)
            score_before = cap_state.score
            fs_stored, last_workout = state_repo.get_systemic_fatigue(athlete_id)

            # estimate current fatigue on independent recovery clocks (Part D)
            elapsed_sys = 0.0 if last_workout is None else max(0.0, week - last_workout)
            elapsed_cap = (
                0.0 if cap_state.last_trained_at_week is None
                else max(0.0, week - cap_state.last_trained_at_week)
            )
            fs = decay_fatigue(fs_stored, elapsed_sys, TAU_SYS)
            fc = decay_fatigue(cap_state.fatigue, elapsed_cap,
                               TAU_CAP.get(capability, TAU_SYS))
            total_fatigue = max(0.0, fs + fc)

            # 1. recommend (fatigue-aware)
            rec = recommend(
                cap_state, exercise, difficulty_factor, target_reps,
                fatigue_systemic=fs, fatigue_capability=fc,
            )
            rec = Recommendation(
                athlete_id=athlete_id, capability=rec.capability, exercise=rec.exercise,
                difficulty_factor=rec.difficulty_factor,
                recommended_weight=rec.recommended_weight, target_reps=rec.target_reps,
                predicted_reps_to_failure=rec.predicted_reps_to_failure,
                prediction_confidence=rec.prediction_confidence,
                decision_reason=rec.decision_reason,
                decision_type=rec.decision_type, target_load=rec.target_load,
                est_fatigue_systemic=fs, est_fatigue_capability=fc,
            )
            rec_id = learn_repo.insert_recommendation(rec, block_id)

            # 2. perform — DX-01: the callback reports the LOGGED weight + reps
            actual_weight, actual_reps = perform(rec)
            actual_weight = float(actual_weight)
            actual_reps = int(actual_reps)

            # DX-02: re-predict at the ACTUAL load with fatigue threaded EXACTLY as rec was
            # built (review R5: fatigue=total_fatigue, score_before basis). Bit-identical to
            # rec.predicted_reps_to_failure when actual_weight == rec.recommended_weight.
            predicted_at_actual = predict_reps_to_failure(
                capability, score_before, difficulty_factor, actual_weight,
                fatigue=total_fatigue,
            )

            # 3. observe (both weights stored; est_fatigue recorded for audit)
            set_id = sess_repo.add_set(
                block_id, set_number, rec.recommended_weight, rec.target_reps,
                actual_weight=actual_weight, actual_reps=actual_reps,
                status="completed",
            )
            obs = Observation(
                athlete_id=athlete_id, capability=capability, exercise=exercise,
                difficulty_factor=difficulty_factor,
                actual_weight=actual_weight, actual_reps=actual_reps,
                predicted_reps_to_failure=predicted_at_actual,
                prediction_error=actual_reps - predicted_at_actual,
                week=week, est_fatigue=total_fatigue,
            )

            # 4. attribute -> evidence, de-fatiguing in rep space first (C.3). Computed
            # BEFORE the observation row is written so the capability-space value (s_obs)
            # can be co-located on the observation as part of the off-policy sample.
            weights = contribution_weights or {capability: 1.0}
            evidence = observation_to_evidence(
                obs, weights, prediction_confidence=rec.prediction_confidence,
                now_week=week, est_fatigue=total_fatigue,
            )

            # Off-policy calibration sample (migration 013): materialize the decision-time
            # model state beside the realized outcome so this set is a self-contained sample.
            # off_policy = the A9 deviation flag; μ = score_before; σ = sqrt(recent variance)
            # on the pre-update moments (0 at cold start); the prescribed-load prediction is
            # rec.predicted_reps_to_failure (the ON-policy prediction, distinct from the
            # at-actual one stored above); predicted_success is the model's pre-registered
            # expectation (the rep-based model emits reps, not a probability — this is the
            # label a calibrator scores). capability_value = this capability's s_obs.
            off_policy = 1 if override_category else 0
            sigma_decision = math.sqrt(
                recent_variance(cap_state.var_w, cap_state.var_ws, cap_state.var_ws2)
            )
            cap_s_obs = next(
                (ev.s_obs for ev in evidence if ev.capability == capability), score_before
            )
            predicted_success = 1.0 if rec.predicted_reps_to_failure >= rec.target_reps else 0.0
            obs_id = learn_repo.insert_observation(
                obs, session_id, block_id, set_id,
                override_category=override_category, override_target=override_target,
                off_policy=off_policy, mu_decision=score_before,
                sigma_decision=sigma_decision,
                predicted_reps_prescribed=rec.predicted_reps_to_failure,
                predicted_success=predicted_success, capability_value=cap_s_obs,
            )

            evidence_ids: list[str] = []
            for ev in evidence:
                evidence_ids.append(learn_repo.insert_evidence(ev, obs_id))

            # 5. variance-suppressed state update (ES-010 C); StateRepository sole writer
            forget = decay(elapsed_cap)
            block_s_obs = score_before   # representative block observation (ES-006 surprise)
            for ev, ev_id in zip(evidence, evidence_ids):
                if ev.capability != capability:
                    continue
                block_s_obs = ev.s_obs
                cap_state.var_w, cap_state.var_ws, cap_state.var_ws2 = update_moments(
                    cap_state.var_w, cap_state.var_ws, cap_state.var_ws2,
                    forget, ev.s_obs, ev.weight,
                )
                ag = compute_agreement(cap_state.var_w, cap_state.var_ws, cap_state.var_ws2)
                sig2 = recent_variance(cap_state.var_w, cap_state.var_ws, cap_state.var_ws2)
                prev = CapabilityStateSnapshot(cap_state)
                apply_evidence(cap_state, ev, week, agreement=ag)

                # 6. generate + accumulate this set's fatigue (A.4/A.5) before persisting
                rm1_ref = reference_strength(capability, score_before)
                sf = set_fatigue(
                    effective_load=actual_weight,                  # DX-01: cost fatigue at the LIFTED load
                    reference_strength_c=rm1_ref,
                    reps_performed=actual_reps,
                    predicted_reps_to_failure=rec.predicted_reps_to_failure,
                )
                w_c = weights.get(capability, 1.0)
                new_systemic, new_capability = accumulate(fs, fc, sf, w_c)
                cap_state.fatigue = new_capability

                state_repo.write_capability_state(athlete_id, cap_state)
                state_repo.write_systemic_fatigue(athlete_id, new_systemic, week)
                learn_repo.insert_state_update_log(
                    athlete_id, capability, ev_id, prev.state, cap_state,
                    reason=rec.decision_reason, model_version=MODEL_VERSION,
                    agreement=ag, sigma2_recent=sig2, est_fatigue_capability=fc,
                    decision_type=rec.decision_type,
                )

            # ES-006 decision memory at block completion (single-set fatigue-aware path),
            # via the same shared hook as the rested path (HD1).
            if govern:
                _record_block_decision(
                    state_repo, athlete_id, capability, cap_state, week,
                    score_at_block_entry=score_before, block_s_obs=block_s_obs,
                    decision_type=rec.decision_type,
                    recommended_weight=rec.recommended_weight,
                )

            return SetResult(
                recommendation_id=rec_id, observation_id=obs_id,
                evidence_ids=evidence_ids, score_before=score_before,
                score_after=cap_state.score, confidence_after=cap_state.confidence,
                s_obs=block_s_obs, decision_type=rec.decision_type,
                recommended_weight=rec.recommended_weight,
            )


class CapabilityStateSnapshot:
    """Immutable copy of a capability state for the before/after audit log."""
    def __init__(self, cap_state):
        from ..domain import CapabilityState
        self.state = CapabilityState(
            capability=cap_state.capability, score=cap_state.score,
            confidence=cap_state.confidence, sum_w=cap_state.sum_w,
            last_trained_at_week=cap_state.last_trained_at_week,
        )
