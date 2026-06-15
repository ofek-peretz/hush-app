"""
Sprint 0 test suite.

Covers the spec-critical invariants:
  - golden values from ES-005.1 / ES-008 v2 worked examples
  - forward/inverse round-trip (Principle #43 consistency)
  - confidence and decay anchors
  - the closed loop recovers a synthetic athlete's true capability
"""
from __future__ import annotations
import math

from hush_model.constants import (
    A_C, K_GROWTH, DECAY_HALF_LIFE_WEEKS, cohort_multiplier, CLASS_A_CAPABILITIES,
)
from hush_model.capability.reference_strength import reference_strength, score_of
from hush_model.capability.epley import reps_to_failure, load_for_reps, rm1_from
from hush_model.capability.confidence import capability_confidence
from hush_model.capability.decay import decay
from hush_model.seeding import seed_athlete, seed_capability_score
from hush_model.loop.orchestrator import run_one_set
from sim.synthetic_athlete import SyntheticAthlete


def approx(a, b, tol=1e-2):
    return abs(a - b) <= tol


# ---------- ReferenceStrength golden values (ES-008 v2) ----------

def test_reference_strength_anchor():
    # S=64 reproduces each capability's landmark
    assert approx(reference_strength("horizontal_push", 64), 113.0)
    assert approx(reference_strength("hip_dominant", 64), 180.0)
    assert approx(reference_strength("vertical_push", 64), 68.0)

def test_reference_strength_inverse_roundtrip():
    for cap in A_C:
        for s in (10, 30, 48, 64, 90):
            rm1 = reference_strength(cap, s)
            assert approx(score_of(cap, rm1), s, tol=1e-6), (cap, s)


# ---------- Epley golden values (ES-005.1) ----------

def test_epley_bench_example():
    # bench S=64 -> RM1 113; @82.5kg -> ~11 reps-to-failure
    assert approx(reps_to_failure(82.5, 113.0), 11.09, tol=0.05)

def test_epley_roundtrip():
    rm1 = 113.0
    for reps in (3, 8, 11, 15):
        L = load_for_reps(reps, rm1)
        assert approx(reps_to_failure(L, rm1), reps, tol=1e-6)
        assert approx(rm1_from(L, reps), rm1, tol=1e-6)


# ---------- decay anchors (ES-005.1 sec 10) ----------

def test_decay_anchors():
    assert approx(decay(1.0), 0.971, tol=0.005)
    assert approx(decay(78.0), 0.1, tol=0.005)
    assert approx(DECAY_HALF_LIFE_WEEKS, 23.48, tol=0.05)


# ---------- confidence (ES-005.1 sec 6, ES-008 v2 seed floor) ----------

def test_confidence_seed_floor_and_growth():
    assert capability_confidence(0.0) == 10.0           # seed floor
    assert capability_confidence(8.0) > 60.0            # ~63% at sum_w=8
    assert capability_confidence(100.0) > 99.0          # saturates
    # monotonic non-decreasing
    prev = -1.0
    for sw in (0, 1, 2, 4, 8, 16, 32):
        c = capability_confidence(float(sw))
        assert c >= prev
        prev = c


# ---------- cohort multiplier (ES-008 v2 sec 5) ----------

def test_cohort_multiplier():
    assert approx(cohort_multiplier("male", 25), 1.00)
    assert approx(cohort_multiplier("female", 25), 0.62)
    assert approx(cohort_multiplier("male", 60), 0.85)   # -0.5%/yr * 30yr


# ---------- seeding (ES-008 v2 sec 4) ----------

def test_seed_confidence_is_floor_regardless_of_score():
    from hush_model.seeding import SEED_PRIOR_SUM_W
    st = seed_athlete("a", "female", 40, "advanced")
    for cap in st.capabilities.values():
        assert cap.confidence == 10.0
        assert approx(cap.sum_w, SEED_PRIOR_SUM_W, tol=1e-9)

def test_seed_female_lighter_than_male():
    male = seed_capability_score("horizontal_push", "beginner", "male", 30)
    female = seed_capability_score("horizontal_push", "beginner", "female", 30)
    assert female < male


# ---------- DX-08 Option D: bodyweight-keyed cold-start prior ----------
# Additive on a NEW input (bodyweight_kg). The new behaviour fires ONLY when a valid
# bodyweight is supplied; with none/invalid bodyweight the seed is bit-for-bit the
# pre-DX-08 3-bucket fallback (test_fallback_is_bit_for_bit_3bucket). Per the binding
# safety interpretation (readiness §0): bodyweight x sex is the baseline; experience is a
# capped (<= +20%) upward modifier; the seed never authorises progression by itself.

def test_option_d_seeds_from_bodyweight_sex():
    # heavier bodyweight -> higher seed score/1RM for every Class-A capability
    light = seed_athlete("l", "male", 30, "beginner", bodyweight_kg=70.0)
    heavy = seed_athlete("h", "male", 30, "beginner", bodyweight_kg=110.0)
    for cap in CLASS_A_CAPABILITIES:
        assert heavy.capabilities[cap].score > light.capabilities[cap].score
    # at equal bodyweight, female < male (via SEX_MULTIPLIER baked into the table)
    male = seed_athlete("m", "male", 30, "beginner", bodyweight_kg=90.0)
    female = seed_athlete("f", "female", 30, "beginner", bodyweight_kg=90.0)
    for cap in CLASS_A_CAPABILITIES:
        assert female.capabilities[cap].score < male.capabilities[cap].score


def test_option_d_confidence_and_sum_w_capped():
    from hush_model.seeding import OPTION_D_PRIOR_SUM_W
    from hush_model.constants import PRIOR_CONF, DECISION_CONF_GATE
    st = seed_athlete("a", "male", 30, "intermediate", bodyweight_kg=85.0)
    for cap in st.capabilities.values():
        assert cap.confidence == 25.0
        assert approx(cap.sum_w, OPTION_D_PRIOR_SUM_W, tol=1e-9)
        assert approx(cap.sum_w, 2.301, tol=1e-3)
    # the seed sits BELOW the decision gate -> the governor stays inert at onboarding
    assert PRIOR_CONF < DECISION_CONF_GATE


def test_option_d_experience_modifier_is_capped():
    from hush_model.strength_standards import estimate_1rm, experience_modifier
    assert experience_modifier("beginner") == 1.00
    assert experience_modifier("intermediate") == 1.10
    assert experience_modifier("advanced") == 1.20      # hard cap
    assert experience_modifier(None) == 1.00            # omitted -> baseline
    bw = 90.0
    beg = estimate_1rm("knee_dominant", "male", bw, 30, "beginner")
    adv = estimate_1rm("knee_dominant", "male", bw, 30, "advanced")
    # an "advanced" claim cannot lift the estimate more than +20% over the bodyweight
    # baseline -> a DETRAINED over-claimer lands near their bodyweight norm (over-claim bounded)
    assert adv <= beg * 1.20 + 1e-9


def test_option_d_downbias_and_clamp():
    from hush_model.strength_standards import (
        estimate_1rm, base_ratio, age_taper, experience_modifier, clamp_kg,
    )
    from hush_model.constants import OPTION_D_DOWN_BIAS
    cap, sex, bw, age, exp = "horizontal_push", "male", 90.0, 30, "intermediate"
    pre_bias = bw * base_ratio(cap, sex) * experience_modifier(exp) * age_taper(age)
    est = estimate_1rm(cap, sex, bw, age, exp)
    assert est <= pre_bias                                          # conservative downward bias
    assert approx(est, pre_bias * (1.0 - OPTION_D_DOWN_BIAS), tol=1e-9)
    # extreme bodyweights stay inside the per-capability plausibility band (no elite/absurd load)
    for bw_x in (35.0, 250.0):
        lo, hi = clamp_kg(cap, sex, bw_x)
        e = estimate_1rm(cap, sex, bw_x, 30, "advanced")
        assert lo <= e <= hi


def test_option_d_uses_model_inverse():
    # the prior writes a score via the model's OWN frozen inverse — no new math
    from hush_model.strength_standards import estimate_1rm
    for cap in CLASS_A_CAPABILITIES:
        rm1 = estimate_1rm(cap, "male", 90.0, 30, "beginner")
        s = score_of(cap, rm1)
        assert approx(reference_strength(cap, s), rm1, tol=1e-6)


def test_option_d_calibration_continuity():
    # §2.1 beginner-continuity gate (binding safety interpretation, readiness §0/§2):
    # at the calibration bodyweight an UNTRAINED male maps within ±3 score of SEED_SCORE['beginner'].
    from hush_model.strength_standards import CALIBRATION_BW_KG, estimate_1rm
    from hush_model.constants import SEED_SCORE
    bw = CALIBRATION_BW_KG["male"]
    for cap in CLASS_A_CAPABILITIES:
        s = score_of(cap, estimate_1rm(cap, "male", bw, 30, "beginner"))
        assert abs(s - SEED_SCORE["beginner"]) <= 3.0, (cap, s)


def test_fallback_is_bit_for_bit_3bucket():
    # absent OR invalid bodyweight -> exact pre-DX-08 3-bucket seed (conf 10), the kill-switch
    from hush_model.seeding import SEED_PRIOR_SUM_W
    for sex, age, exp in [("male", 30, "beginner"),
                          ("female", 40, "advanced"),
                          ("male", 55, "intermediate")]:
        variants = [
            seed_athlete("a", sex, age, exp),                       # no bodyweight kwarg
            seed_athlete("a", sex, age, exp, bodyweight_kg=None),   # explicit None
            seed_athlete("a", sex, age, exp, bodyweight_kg=10.0),   # out of [35,250] range
            seed_athlete("a", sex, age, exp, bodyweight_kg=300.0),  # out of range (high)
        ]
        for cap in CLASS_A_CAPABILITIES:
            expected = seed_capability_score(cap, exp, sex, age)
            for st in variants:
                c = st.capabilities[cap]
                assert c.score == expected
                assert c.confidence == 10.0
                assert c.sum_w == SEED_PRIOR_SUM_W


# ---------- gradual update (ES-005.1 sec 5) ----------

def test_single_set_moves_score_only_slightly():
    st = seed_athlete("a", "male", 30, "beginner")
    cap = st.capabilities["horizontal_push"]
    before = cap.score
    truth = SyntheticAthlete("a", "male", 30, "beginner",
                             true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0)
    run_one_set(cap, "a", "bench_press", 1.0, 8, truth.perform, week=1.0)
    # moved toward truth but not jumped there
    assert cap.score > before
    assert cap.score < 55.0
    assert (cap.score - before) < 5.0       # gradual


# ---------- the closed loop recovers truth (the Sprint 0 acceptance test) ----------

def test_loop_converges_toward_true_capability():
    # Seed is far below truth; the conservative discount makes early sets easy, so
    # early errors are large and correctly down-weighted (ES-005.1 sec5). Convergence
    # is therefore deliberately gradual and accelerates as predictions tighten.
    st = seed_athlete("a", "male", 30, "beginner")     # seeds low (~30)
    cap = st.capabilities["horizontal_push"]
    truth = SyntheticAthlete("a", "male", 30, "beginner",
                             true_score={"horizontal_push": 55.0},
                             weekly_gain={"horizontal_push": 0.0},  # static truth
                             rep_noise_sd=0.5)
    gap_start = abs(cap.score - 55.0)
    for week in range(1, 25):                           # 24 weeks ~ one decay half-life
        for _ in range(3):
            run_one_set(cap, "a", "bench_press", 1.0, 8, truth.perform, float(week))
    gap_end = abs(cap.score - 55.0)
    # the gap to truth has closed substantially and confidence has grown from seed 10
    assert gap_end < gap_start * 0.25, (gap_start, gap_end, cap.score)
    assert cap.confidence > 60.0


def test_loop_is_stable_when_truth_equals_estimate():
    # if seeded AT truth, score should not drift away
    st = seed_athlete("a", "male", 30, "beginner")
    cap = st.capabilities["horizontal_push"]
    seeded = cap.score
    truth = SyntheticAthlete("a", "male", 30, "beginner",
                             true_score={"horizontal_push": seeded},
                             rep_noise_sd=0.5)
    for week in range(1, 9):
        for _ in range(3):
            run_one_set(cap, "a", "bench_press", 1.0, 8, truth.perform, float(week))
    assert abs(cap.score - seeded) < 3.0    # no systematic drift
