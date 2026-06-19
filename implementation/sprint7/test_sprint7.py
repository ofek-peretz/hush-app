"""
Sprint 7 tests — Phase-0 measurement instruments (Monte Carlo, forecast calibration tracking,
volatility tracking, counterfactual simulation). Plain-assert functions (no pytest), run by the
assemble harness, the same runner the model golden suite uses.

Every instrument is read-only over the FROZEN model: these tests also assert the non-leak
guarantee (sim.parameters.assert_unpatched) after the counterfactual arms run.
"""
from __future__ import annotations
import math
import random

from hush_model import constants as C
from hush_model.prediction import predict_reps_to_failure
from hush_model.capability.reference_strength import reference_strength
from hush_model.capability.epley import load_for_reps
from hush_model import variance as V

from sim import montecarlo as MC
from sim import forecast_calibration as FC
from sim import volatility as VOL
from sim import counterfactual as CF
from sim import scenarios as scn
from sim.parameters import assert_unpatched, current_value

CAP = "knee_dominant"


# ============================== 1. Monte Carlo ==============================

def test_posterior_sd_shrinks_with_precision():
    """sd_post = sqrt(sigma2/sum_w): more accumulated precision -> tighter posterior."""
    lo = MC.score_posterior_sd(4.0)
    hi = MC.score_posterior_sd(40.0)
    assert hi < lo
    assert abs(lo - math.sqrt(C.SIGMA2_REF / 4.0)) < 1e-12
    # uninformed precision -> maximally diffuse (reported as +inf, not a divide-by-zero)
    assert MC.score_posterior_sd(0.0) == math.inf


def test_mc_reps_mean_tracks_point_prediction():
    """With high precision the MC mean reps sits on the model's own point prediction."""
    score, sum_w = 58.0, 40.0
    rm1 = reference_strength(CAP, score)
    load = load_for_reps(8.0, rm1)          # point prediction == 8 reps here
    point = predict_reps_to_failure(CAP, score, 1.0, load)
    fc = MC.simulate_reps_to_failure(
        CAP, score, sum_w, 1.0, load, target_reps=8, rep_noise_sd=0.8, n=6000, seed=1,
    )
    assert abs(fc.mean - point) < 0.3
    assert fc.p10 < fc.p50 < fc.p90
    assert 0.0 <= fc.p_hit_target <= 1.0
    # point prediction is exactly the target -> hit odds straddle one-half
    assert 0.4 < fc.p_hit_target < 0.6


def test_mc_more_precision_tightens_distribution():
    score = 58.0
    rm1 = reference_strength(CAP, score)
    load = load_for_reps(8.0, rm1)
    wide = MC.simulate_reps_to_failure(CAP, score, 3.0, 1.0, load, target_reps=8, n=4000, seed=2)
    tight = MC.simulate_reps_to_failure(CAP, score, 60.0, 1.0, load, target_reps=8, n=4000, seed=2)
    assert tight.sd < wide.sd


def test_mc_hit_probability_monotone_in_load():
    """Lighter load -> higher hit probability; heavier -> lower."""
    score, sum_w = 58.0, 30.0
    rm1 = reference_strength(CAP, score)
    light = MC.simulate_reps_to_failure(CAP, score, sum_w, 1.0, load_for_reps(12.0, rm1),
                                        target_reps=8, n=4000, seed=3)
    heavy = MC.simulate_reps_to_failure(CAP, score, sum_w, 1.0, load_for_reps(4.0, rm1),
                                        target_reps=8, n=4000, seed=3)
    assert light.p_hit_target > heavy.p_hit_target


def test_mc_is_deterministic():
    a = MC.simulate_reps_to_failure(CAP, 58.0, 20.0, 1.0, 100.0, target_reps=8, n=1000, seed=7)
    b = MC.simulate_reps_to_failure(CAP, 58.0, 20.0, 1.0, 100.0, target_reps=8, n=1000, seed=7)
    assert a.as_dict() == b.as_dict()


def test_mc_uninformed_collapses_to_point_score():
    """Zero precision => score draws collapse to the point; spread is rep-noise only."""
    draws = MC.simulate_score(58.0, 0.0, n=500, seed=0)
    assert all(d == 58.0 for d in draws)
    fc = MC.simulate_reps_to_failure(CAP, 58.0, 0.0, 1.0, 100.0, target_reps=8,
                                     rep_noise_sd=0.0, n=200, seed=0)
    assert fc.sd == 0.0


def test_mc_one_rep_max_band():
    d = MC.simulate_one_rep_max(CAP, 58.0, 30.0, 1.0, n=4000, seed=4)
    assert d["p10"] < d["p50"] < d["p90"]
    assert abs(d["mean"] - reference_strength(CAP, 58.0)) < 1.0


# ============================== 2. Forecast calibration tracking ==============================

def test_brier_perfect_and_chance():
    perfect = [(1.0, 1), (0.0, 0), (1.0, 1), (0.0, 0)]
    assert FC.brier_score(perfect) == 0.0
    chance = [(0.5, 1), (0.5, 0), (0.5, 1), (0.5, 0)]
    assert abs(FC.brier_score(chance) - 0.25) < 1e-12


def test_reliability_table_bins_and_rates():
    # 10 forecasts at p=0.8 with exactly 8 hits -> perfectly calibrated bin.
    records = [(0.8, 1)] * 8 + [(0.8, 0)] * 2
    table = FC.reliability_table(records, n_bins=10)
    assert len(table) == 1
    b = table[0]
    assert b.count == 10
    assert abs(b.mean_predicted - 0.8) < 1e-12
    assert abs(b.hit_rate - 0.8) < 1e-12
    assert abs(b.gap) < 1e-12


def test_ece_zero_when_calibrated():
    records = ([(0.9, 1)] * 9 + [(0.9, 0)]) + ([(0.2, 1)] * 2 + [(0.2, 0)] * 8)
    assert FC.expected_calibration_error(records, n_bins=10) < 1e-9


def test_ece_positive_when_overconfident():
    # claims 0.9 but only half hit -> large gap.
    records = [(0.9, 1)] * 5 + [(0.9, 0)] * 5
    assert FC.expected_calibration_error(records, n_bins=10) > 0.3


def test_from_resolved_forecasts_maps_confidence_and_states():
    forecasts = [
        {"prediction_confidence": 80, "state": "HIT"},
        {"prediction_confidence": 80, "state": "MISS"},
        {"prediction_confidence": 50, "state": "PENDING"},   # dropped
        {"prediction_confidence": 50, "state": "VOID"},      # dropped
        {"prediction_confidence": 0.7, "state": "HIT"},      # already a probability
    ]
    recs = FC.from_resolved_forecasts(forecasts)
    assert len(recs) == 3
    assert (0.8, 1) in recs and (0.8, 0) in recs and (0.7, 1) in recs


def test_calibration_over_time_windows():
    rng = random.Random(0)
    timed = [(float(i), rng.random(), rng.randint(0, 1)) for i in range(100)]
    windows = FC.calibration_over_time(timed, window=25)
    assert len(windows) == 4
    assert all(w["n"] == 25 for w in windows)
    assert windows[0]["start_time"] <= windows[-1]["start_time"]


def test_calibration_validates_inputs():
    for bad in [(1.5, 1), (-0.1, 0), (0.5, 2)]:
        try:
            FC.brier_score([bad])
            assert False, f"expected ValueError for {bad}"
        except ValueError:
            pass


def test_mc_feeds_calibration():
    """The two instruments compose: Monte Carlo p_hit is a valid calibration probability."""
    fc = MC.simulate_reps_to_failure(CAP, 58.0, 20.0, 1.0, 100.0, target_reps=8, n=1000, seed=5)
    recs = [(fc.p_hit_target, 1)]
    assert 0.0 <= FC.brier_score(recs) <= 1.0


# ============================== 3. Volatility tracking ==============================

def test_volatility_constant_is_stable():
    obs = [(float(i), 48.0, 1.0) for i in range(8)]   # flat de-biased observations
    track = VOL.track_volatility(CAP, obs)
    cur = track.current()
    assert cur.volatility < 0.1
    assert cur.regime == "stable"


def test_volatility_conflict_is_high():
    # alternating +/- swings within a session (decay ~1) -> large recent variance.
    obs = []
    for i in range(8):
        obs.append((float(i) * 0.0, 48.0 + (5.0 if i % 2 == 0 else -5.0), 1.0))
    track = VOL.track_volatility(CAP, obs)
    cur = track.current()
    assert cur.volatility > 2.0
    assert cur.regime in ("elevated", "high")


def test_volatility_matches_frozen_model_primitive():
    """The tracked variance IS the model's variance.recent_variance (no re-definition)."""
    seq = [(0.0, 50.0, 1.0), (0.0, 46.0, 1.0), (0.0, 52.0, 1.0)]  # same-session, decay=1
    track = VOL.track_volatility(CAP, seq)
    vw = vws = vws2 = 0.0
    for _, s, w in seq:
        vw, vws, vws2 = V.update_moments(vw, vws, vws2, 1.0, s, w)
    expected = V.recent_variance(vw, vws, vws2)
    assert abs(track.current().recent_variance - expected) < 1e-12


def test_volatility_insufficient_precision():
    track = VOL.track_volatility(CAP, [(0.0, 48.0, 0.1)])   # weight below min precision
    assert track.current().regime == "insufficient"


def test_volatility_trend_and_peak():
    # escalating swings -> rising volatility; peak is the last (largest) sample.
    obs = [(0.0, 48.0, 1.0), (0.0, 49.0, 1.0), (0.0, 45.0, 1.0),
           (0.0, 55.0, 1.0), (0.0, 38.0, 1.0)]
    track = VOL.track_volatility(CAP, obs)
    assert track.trend() == "rising"
    assert track.peak().volatility == max(track.series())


# ============================== 4. Counterfactual simulation ==============================

def test_counterfactual_identical_arms_zero_delta():
    """Common random numbers: same params in both arms -> byte-identical trajectory, zero deltas."""
    kappa0 = current_value("KAPPA")
    cf = CF.compare(lambda: scn.constant_athlete(), counterfactual={"KAPPA": kappa0},
                    baseline={}, weeks=5)
    assert all(abs(d) < 1e-12 for d in cf.final_score_delta.values())
    assert all(abs(d) < 1e-12 for d in cf.convergence_improvement.values())
    assert_unpatched()


def test_counterfactual_real_override_changes_trajectory_and_restores():
    kappa0 = current_value("KAPPA")
    cf = CF.compare(lambda: scn.fatigued_athlete(), counterfactual={"KAPPA": kappa0 * 3.0},
                    baseline={}, weeks=5)
    # a different fatigue scaling must move at least one capability's settled estimate.
    assert any(abs(d) > 1e-9 for d in cf.final_score_delta.values())
    assert math.isfinite(cf.mean_convergence_improvement())
    assert_unpatched()   # non-leak guarantee: the override is fully restored


def test_counterfactual_arm_reports_metrics():
    arm = CF.run_arm(lambda: scn.constant_athlete(), label="live", weeks=5)
    assert set(arm.convergence_error) and set(arm.final_load)
    for c, err in arm.convergence_error.items():
        assert err >= 0.0
    assert_unpatched()


def test_parameter_sensitivity_sweep():
    s0 = current_value("SIGMA2_REF")
    rows = CF.parameter_sensitivity(
        lambda: scn.recovery_athlete(), "SIGMA2_REF", [s0, s0 * 2.0], weeks=4,
    )
    assert len(rows) == 2
    assert all(r["baseline_value"] == s0 for r in rows)
    assert all(math.isfinite(r["mean_convergence_improvement"]) for r in rows)
    assert_unpatched()
