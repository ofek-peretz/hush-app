"""
Sprint 2 test suite — ES-011 (Fatigue & Recovery) + ES-010 Part C (variance).

Covers:
  - the zero-fatigue / agreement=1 identity (the rested path is unchanged),
  - fatigue generation, accumulation, decay anchors,
  - the C.3 de-fatigue ordering (rep-space add-back == score-space add-back),
  - surprise discrimination (C.1) and the value of de-fatiguing before learning,
  - variance-suppressed confidence and learning-rate damping (ES-010 C.2/C.4),
  - fatigue-aware recommendation gating + reduction order (B.2/B.3),
  - persisted fatigue-aware pipeline + audit, and the additive migration,
  - a harness sanity check (constant truth + fatigue -> stable inferred score).

Imports use the assembled package layout (hush_model/ + sim/), the same as the
Sprint 0/1 suites. fatigue.py/recovery.py/variance.py assemble at the hush_model
root; migration_002_fatigue.py under hush_model/persistence/migrations/.
"""
from __future__ import annotations
import math

from hush_model.constants import (
    K_GROWTH, KAPPA, RIR_REFERENCE, TAU_SYS, TAU_CAP, MIN_EFFECTIVE_REPS,
)
from hush_model.capability.reference_strength import reference_strength, score_of
from hush_model.capability.epley import rm1_from
from hush_model.capability.confidence import capability_confidence
from hush_model.domain import CapabilityState, Observation, Evidence
from hush_model.prediction import predict_reps_to_failure
from hush_model.recommendation import recommend
from hush_model.evidence import observation_to_evidence
from hush_model.state_update import apply_evidence
from hush_model.seeding import seed_athlete
from hush_model.loop.orchestrator import run_one_set
from hush_model.fatigue import (
    set_fatigue, accumulate, defatigue_reps, surprise, decision_reason,
)
from hush_model.recovery import decay_fatigue, estimate_current_fatigue
from hush_model.variance import update_moments, recent_variance, agreement
from sim.synthetic_athlete import SyntheticAthlete


def approx(a, b, tol=1e-2):
    return abs(a - b) <= tol


# ============================================================
# 1. Zero-fatigue / agreement=1 is the identity (rested path unchanged)
# ============================================================

def test_defatigue_reps_identity_at_zero():
    for r in (1, 5, 8, 12):
        assert defatigue_reps(r, 0.0) == float(r)

def test_prediction_identity_at_zero_fatigue():
    a = predict_reps_to_failure("horizontal_push", 50.0, 1.0, 60.0)
    b = predict_reps_to_failure("horizontal_push", 50.0, 1.0, 60.0, fatigue=0.0)
    assert approx(a, b, 1e-12)

def test_recommend_identity_at_zero_fatigue():
    st = CapabilityState("horizontal_push", 48.0, 10.0, sum_w=0.843)
    base = recommend(st, "bench_press", 1.0, 8)
    zero = recommend(st, "bench_press", 1.0, 8, fatigue_systemic=0.0, fatigue_capability=0.0)
    assert base.recommended_weight == zero.recommended_weight
    assert base.target_reps == zero.target_reps
    assert base.decision_reason == zero.decision_reason == "working_set:target+RIR,discounted,floored"

def test_evidence_identity_at_zero_fatigue():
    obs = Observation("a", "horizontal_push", "bench_press", 1.0, 60.0, 8, 8.0, 0.0, 1.0)
    no_arg = observation_to_evidence(obs, {"horizontal_push": 1.0}, 50.0, 1.0)
    zero = observation_to_evidence(obs, {"horizontal_push": 1.0}, 50.0, 1.0, est_fatigue=0.0)
    assert approx(no_arg[0].s_obs, zero[0].s_obs, 1e-12)

def test_confidence_identity_at_agreement_one():
    for sw in (0.0, 1.0, 8.0, 32.0):
        assert capability_confidence(sw) == capability_confidence(sw, 1.0)


# ============================================================
# 2. Fatigue generation (A.4) and accumulation (A.5)
# ============================================================

def test_set_fatigue_golden():
    # rel_load=0.8, rir_obs=3, proximity=1-3/5=0.4, sf=0.05*0.8*8*0.4*1 = 0.128
    sf = set_fatigue(effective_load=80.0, reference_strength_c=100.0,
                     reps_performed=8, predicted_reps_to_failure=11.0,
                     exercise_cost=1.0, kappa=0.05, rir_reference=5.0)
    assert approx(sf, 0.128, 1e-6)

def test_set_to_failure_costs_more_than_with_reserve():
    to_failure = set_fatigue(80.0, 100.0, 8, 8.0)     # rir_obs 0 -> proximity 1
    with_reserve = set_fatigue(80.0, 100.0, 8, 13.0)  # rir_obs 5 -> proximity 0
    assert to_failure > with_reserve
    assert approx(with_reserve, 0.0)

def test_accumulation_splits_by_wc():
    fs, fc = accumulate(0.0, 0.0, 1.0, w_c=0.7)
    assert approx(fs, 1.0)        # systemic gets full cost
    assert approx(fc, 0.7)        # capability gets its w_c share


# ============================================================
# 3. Recovery / decay (Part D), fixed tau
# ============================================================

def test_decay_one_time_constant():
    assert approx(decay_fatigue(10.0, 1.0, 1.0), 10.0 * math.exp(-1.0), 1e-6)
    assert decay_fatigue(10.0, 0.0, 1.0) == 10.0          # no time -> no recovery
    assert decay_fatigue(0.0, 5.0, 1.0) == 0.0

def test_systemic_recovers_slower_than_small_muscle():
    elapsed = 0.4
    sys_remaining = decay_fatigue(10.0, elapsed, TAU_SYS)
    cap_remaining = decay_fatigue(10.0, elapsed, TAU_CAP["vertical_push"])
    assert sys_remaining > cap_remaining                  # longer tau -> more remaining

def test_estimate_current_fatigue_untrained_is_zero():
    fs, fc = estimate_current_fatigue("horizontal_push", 5.0, 5.0, None, 3.0)
    assert fs == 0.0 and fc == 0.0


# ============================================================
# 4. De-fatigue ordering (C.3): rep-space add-back == score-space add-back
# ============================================================

def test_defatigue_rep_space_equals_score_space():
    load, raw_reps, F = 60.0, 7, 1.5
    reps_clean = defatigue_reps(raw_reps, F)
    assert reps_clean > raw_reps                          # fatigue removed -> more reps
    s_raw = score_of("horizontal_push", rm1_from(load, raw_reps))
    s_clean = score_of("horizontal_push", rm1_from(load, reps_clean))
    assert approx(s_clean, s_raw + F, 1e-6)               # exact equivalence (Principle #43)


# ============================================================
# 5. Surprise discrimination (C.1)
# ============================================================

def test_surprise_zero_when_deficit_explained_by_fatigue():
    # observed exactly score - fatigue -> surprise 0 (expected; learn nothing)
    assert approx(surprise(s_obs_raw=46.0, current_score=50.0, estimated_fatigue=4.0), 0.0)

def test_surprise_negative_when_fatigue_low():
    # same raw deficit but little fatigue -> genuine negative evidence
    assert surprise(s_obs_raw=46.0, current_score=50.0, estimated_fatigue=0.5) < -1.0

def test_defatigue_preserves_score_better_than_fatigue_blind():
    # Athlete seeded AT truth, fatigues within a session. Fatigue-aware learning
    # de-fatigues and should keep the score near truth; fatigue-blind learning reads
    # the suppressed reps as capability loss and drifts down further.
    truth = 50.0
    def make_state():
        st = seed_athlete("a", "male", 30, "intermediate").capabilities["horizontal_push"]
        st.score = truth
        return st
    def make_truth():
        return SyntheticAthlete("a", "male", 30, "intermediate",
                                true_score={"horizontal_push": truth},
                                rep_noise_sd=0.0, fatigue_per_set=1.2)
    aware = make_state(); aware_truth = make_truth()
    blind = make_state(); blind_truth = make_truth()
    fs = 0.0
    for _ in range(6):
        r = run_one_set(aware, "a", "bench_press", 1.0, 8, aware_truth.perform, 1.0,
                        enable_fatigue=True, fatigue_systemic=fs)
        fs = r.new_fatigue_systemic
        run_one_set(blind, "a", "bench_press", 1.0, 8, blind_truth.perform, 1.0,
                    enable_fatigue=False)
    assert aware.score > blind.score                      # fatigue-aware drifts less
    assert abs(aware.score - truth) < abs(blind.score - truth)


# ============================================================
# 6. Variance-suppressed confidence + learning-rate damping (ES-010 C)
# ============================================================

def _moments_from(values, w=1.0, forget=1.0):
    vw = vws = vws2 = 0.0
    for s in values:
        vw, vws, vws2 = update_moments(vw, vws, vws2, forget, s, w)
    return vw, vws, vws2

def test_agreement_high_for_coherent_low_for_conflict():
    coh = agreement(*_moments_from([50.0, 50.0, 50.0, 50.0]))
    con = agreement(*_moments_from([45.0, 55.0, 45.0, 55.0]))
    assert approx(coh, 1.0)
    assert con < coh
    assert con < 0.5

def test_confidence_suppressed_under_conflict():
    sum_w = 16.0
    coh = capability_confidence(sum_w, agreement(*_moments_from([50, 50, 50, 50])))
    con = capability_confidence(sum_w, agreement(*_moments_from([40, 60, 40, 60])))
    assert con < coh

def test_learning_rate_damped_at_low_agreement():
    st = CapabilityState("horizontal_push", 50.0, 60.0, sum_w=8.0)
    ev = Evidence("a", "horizontal_push", s_obs=70.0, quality=1.0, weight=1.0, source_week=1.0)
    before = st.score
    apply_evidence(st, ev, 1.0, agreement=0.0)            # full conflict -> no movement
    assert st.score == before
    apply_evidence(st, ev, 1.0, agreement=1.0)            # no conflict -> normal blend
    assert st.score > before

def test_contradiction4_fatigue_removed_keeps_variance_low():
    # A within-session fatiguing run: RAW S_obs swing wildly (-> high variance),
    # but de-fatigued S_obs stay coherent (-> low variance), so confidence is not
    # spuriously suppressed for a hard-training athlete (ES-011 B.4 / Contradiction 4).
    load = 55.0
    raw_reps = [10, 8, 6, 5]
    fatigues = [0.0, 1.5, 3.0, 4.0]
    raw_s = [score_of("horizontal_push", rm1_from(load, r)) for r in raw_reps]
    clean_s = [score_of("horizontal_push", rm1_from(load, defatigue_reps(r, f)))
               for r, f in zip(raw_reps, fatigues)]
    assert recent_variance(*_moments_from(clean_s)) < recent_variance(*_moments_from(raw_s))


# ============================================================
# 7. Fatigue-aware recommendation (B.2 / B.3)
# ============================================================

def test_recommend_rested_reason_unchanged():
    st = CapabilityState("horizontal_push", 48.0, 10.0, sum_w=0.843)
    rec = recommend(st, "bench_press", 1.0, 8)
    assert rec.decision_reason == "working_set:target+RIR,discounted,floored"

def test_recommend_moderate_fatigue_holds_load_cuts_reps():
    st = CapabilityState("horizontal_push", 48.0, 10.0, sum_w=0.843)
    rested = recommend(st, "bench_press", 1.0, 8)
    fat = recommend(st, "bench_press", 1.0, 8, fatigue_capability=10.0)
    assert fat.decision_reason == "fatigue_hold:reps_reduced,load_held"
    assert fat.recommended_weight == rested.recommended_weight   # load held
    assert fat.target_reps < rested.target_reps                  # reps reduced first

def test_recommend_extreme_fatigue_reduces_weight():
    st = CapabilityState("horizontal_push", 48.0, 10.0, sum_w=0.843)
    rested = recommend(st, "bench_press", 1.0, 8)
    fat = recommend(st, "bench_press", 1.0, 8, fatigue_capability=18.0)
    assert fat.decision_reason == "fatigue_hold:weight_reduced"
    assert fat.recommended_weight < rested.recommended_weight    # weight reduced second
    assert fat.target_reps == MIN_EFFECTIVE_REPS

def test_increase_structurally_vetoed_under_fatigue():
    st = CapabilityState("horizontal_push", 48.0, 10.0, sum_w=0.843)
    rested = recommend(st, "bench_press", 1.0, 8)
    fat = recommend(st, "bench_press", 1.0, 8, fatigue_capability=12.0)
    assert fat.recommended_weight <= rested.recommended_weight   # never progress into fatigue

def test_decision_reason_codes():
    assert decision_reason(5.0, -3.0, False) == "fatigue_hold"          # elevated fatigue
    assert decision_reason(0.2, -3.0, False) == "unexplained_regression"
    assert decision_reason(0.2, 2.0, True) == "recovered_progression"
    assert decision_reason(0.2, 0.0, False) == "working_set"


# ============================================================
# 8. Persisted fatigue-aware pipeline + audit + migration
# ============================================================

def _service():
    from hush_model.persistence.db import Database
    from hush_model.persistence.service import HushService
    db = Database(":memory:")
    return db, HushService(db)

def test_persisted_fatigue_aware_writes_state_and_audit():
    from hush_model.persistence.repositories import StateRepository
    db, svc = _service()
    svc.onboard("a1", "male", 30, "intermediate")
    sid = svc.start_session("a1", 1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    truth = SyntheticAthlete("a1", "male", 30, "intermediate",
                             true_score={"horizontal_push": 55.0},
                             rep_noise_sd=0.0, fatigue_per_set=1.0)
    last = None
    for n in (1, 2, 3):
        res = svc.pipeline.report_set_fatigue_aware(
            "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, n,
            truth.perform, week=1.0,
        )
        last = res
    # capability + systemic fatigue accumulated and persisted
    cap = StateRepository(db.conn).get_capability_state("a1", "horizontal_push")
    assert cap.fatigue > 0.0
    fs, _ = StateRepository(db.conn).get_systemic_fatigue("a1")
    assert fs > 0.0
    # audit chain carries the new fatigue/agreement fields
    chain = svc.reconstruct_observation(last.observation_id)
    assert len(chain["state_updates"]) == 1
    su = chain["state_updates"][0]
    assert "agreement" in su and "est_fatigue_capability" in su
    rec = db.conn.execute(
        "SELECT est_fatigue_systemic, est_fatigue_capability FROM recommendation"
    ).fetchone()
    assert rec["est_fatigue_capability"] >= 0.0

def test_migration_additive_and_idempotent():
    import sqlite3
    from hush_model.persistence.migrations import migration_002_fatigue as m
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    # a pre-Sprint-2 capability_state (no fatigue/variance columns)
    conn.execute(
        "CREATE TABLE capability_state (athlete_id TEXT, capability TEXT, score REAL, "
        "confidence REAL, sum_w REAL, last_trained_at_week REAL, updated_at TEXT)"
    )
    conn.execute(
        "CREATE TABLE athlete_state (athlete_id TEXT, workout_count INTEGER, updated_at TEXT)"
    )
    assert m.apply(conn) is True                          # did work
    cols = {r[1] for r in conn.execute("PRAGMA table_info(capability_state)")}
    assert {"fatigue", "var_w", "var_ws", "var_ws2"} <= cols
    assert m.apply(conn) is False                         # idempotent: no re-apply


# ============================================================
# 9. Harness sanity (A2 directional): constant truth + fatigue -> stable score
# ============================================================

def test_constant_truth_with_fatigue_stays_stable():
    st = seed_athlete("a", "male", 30, "intermediate").capabilities["horizontal_push"]
    truth_score = st.score
    truth = SyntheticAthlete("a", "male", 30, "intermediate",
                             true_score={"horizontal_push": truth_score},
                             rep_noise_sd=0.3, fatigue_per_set=1.0)
    fs = 0.0
    for week in range(1, 9):
        for _ in range(3):
            r = run_one_set(st, "a", "bench_press", 1.0, 8, truth.perform, float(week),
                            enable_fatigue=True, fatigue_systemic=fs)
            fs = r.new_fatigue_systemic
        truth.advance_week(1.0)                           # recover between sessions
        fs = decay_fatigue(fs, 1.0, TAU_SYS)              # systemic recovers too
    assert abs(st.score - truth_score) < 5.0              # no ratchet/drift away from truth
