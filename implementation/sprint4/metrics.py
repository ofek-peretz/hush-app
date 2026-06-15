"""
Phase 0 validation metrics (Validation Architecture A2/A1/A8). Sprint 4.

RAW METRICS ARE THE PRIMARY OUTPUT (ratified Q5). The functions here compute the numbers
the Phase 0 gate consumes; the pass/fail thresholds are proposed (gate.py / the impl plan)
and ratifiable, but every verdict must be reconstructable from these raw values.

SUCCESS BASIS — REORIENTED (DX-12 / DX-14). The metrics split into two roles:

  RETAINED success instruments (what the gate gates on):
    A2 stability     : oscillation, drift-vs-flat, reversals, load-ratchet — the TREND
                       PRIMITIVES, on a constant-truth athlete.
    A2 convergence   : how close the inferred SCORE settles to true — the SCORE-ESTIMATE
                       CALIBRATION (an estimate-honesty metric, not a load forecast).
    A1 recoverability: inferred-SCORE error vs a NO-LEARNING ("last working set" / seed)
                       baseline — the "beats no-learning" model-quality check.

  DIRECTIONAL diagnostics (reframed OFF the old load-prediction success basis — reported,
  not gated, per A8):
    A8 shadow        : within-athlete paired reps-to-failure PREDICTION error, model vs the
                       fixed no-learning shadow policy.
    A1 fresh-state   : predicted rested REPS vs true, vs a naive predictor.
  These remain the directional model-quality instruments (per A8); they are no longer the
  headline "does the model predict the right LOAD" success test.

CONCEPTUAL LOCATION: sim/metrics.py (harness package). Pure functions over a Trajectory.
"""
from __future__ import annotations
import statistics

from hush_model.capability.reference_strength import reference_strength
from hush_model.capability.epley import reps_to_failure, load_for_reps
from hush_model.prediction import predict_reps_to_failure


# ----------------------------- A2: stability (constant-truth athlete) -----------------------------

def oscillation(series: list[float], window: int = 8) -> float:
    """Std-dev of the inferred score over the last `window` samples (post burn-in)."""
    tail = series[-window:] if len(series) >= window else series
    return statistics.pstdev(tail) if len(tail) > 1 else 0.0


def reversals(series: list[float], window: int = 8) -> int:
    """Sign reversals of the step-to-step change over the last `window` samples."""
    tail = series[-window:] if len(series) >= window else series
    diffs = [b - a for a, b in zip(tail, tail[1:]) if abs(b - a) > 1e-9]
    return sum(1 for a, b in zip(diffs, diffs[1:]) if a * b < 0)


def drift_vs_flat(series: list[float], window: int = 8) -> float:
    """|OLS slope| of the inferred score over the last `window` samples (true is flat)."""
    tail = series[-window:] if len(series) >= window else series
    n = len(tail)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(tail) / n
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return 0.0
    return abs(sum((x - mx) * (y - my) for x, y in zip(xs, tail)) / denom)


def load_ratchet(load_series: list[float]) -> int:
    """Longest run of strictly-increasing recommended load (a monotone climb signature)."""
    best = run = 0
    for a, b in zip(load_series, load_series[1:]):
        run = run + 1 if b > a + 1e-9 else 0
        best = max(best, run)
    return best


def convergence_error(series: list[float], true_score: float, window: int = 8) -> float:
    """|mean(last `window` inferred scores) − true|. Smooths rep noise. The RETAINED
    SCORE-ESTIMATE CALIBRATION instrument (DX-12): estimate honesty, not a load forecast."""
    tail = series[-window:] if len(series) >= window else series
    return abs(statistics.fmean(tail) - true_score)


# ----------------------------- A1: recoverability vs no-learning baseline -----------------------------
# RETAINED success instrument (DX-12): `recoverability` is the "beats no-learning" check on the
# inferred SCORE. `fresh_state_check` (a REPS re-test forecast) is a DIRECTIONAL diagnostic only.

def naive_score_estimate(athlete_state_score_seed: float, last_working_reps: float,
                         last_load: float, capability: str) -> float:
    """A naive 'last working set' score: invert the last set's reps@load to a score, no
    fatigue/effort de-biasing, no blend. The baseline A1 must beat."""
    # RM1 implied by the last set, then to score via the capability anchor.
    from hush_model.capability.epley import rm1_from
    from hush_model.capability.reference_strength import score_of
    rm1 = rm1_from(last_load, last_working_reps)
    return score_of(capability, rm1)


def recoverability(model_final_score: float, naive_final_score: float,
                   true_score: float) -> dict:
    """A1 offline: does the model's inferred score beat the naive estimate at recovering truth?"""
    model_err = abs(model_final_score - true_score)
    naive_err = abs(naive_final_score - true_score)
    return {
        "model_error": model_err, "naive_error": naive_err,
        "margin": naive_err - model_err, "model_beats_naive": model_err < naive_err,
    }


def fresh_state_check(capability: str, inferred_score: float, true_rested_score: float,
                      standard_load: float, target_reps: int = 5) -> dict:
    """A1 fresh-state: predicted reps-to-failure at a standardized rested re-test (from the
    model's inferred score) vs the athlete's TRUE rested reps, vs a naive predictor.
    DIRECTIONAL diagnostic only (DX-12): a REPS-prediction instrument, reframed off the old
    load-prediction success basis — reported, not a gate criterion."""
    model_pred = predict_reps_to_failure(capability, inferred_score, 1.0, standard_load)
    true_rested_rm1 = reference_strength(capability, true_rested_score)
    true_reps = reps_to_failure(standard_load, true_rested_rm1)
    naive_pred = float(target_reps)               # naive: expect the prescribed reps
    return {
        "model_pred": model_pred, "true_reps": true_reps, "naive_pred": naive_pred,
        "model_error": abs(model_pred - true_reps),
        "naive_error": abs(naive_pred - true_reps),
        "model_beats_naive": abs(model_pred - true_reps) < abs(naive_pred - true_reps),
    }


# ----------------------------- A8: shadow paired comparison (directional diagnostic) -----------------------------
# DIRECTIONAL model-quality diagnostic (DX-12): the model-vs-no-learning REPS-prediction pairing.
# Reframed off the old load-prediction success basis — reported (per A8), NOT a gate criterion.

def shadow_paired(db) -> dict:
    """Within-athlete paired reps-to-failure PREDICTION error: model vs the fixed no-learning
    shadow baseline, over the recorded shadow_recommendation rows. Report effect size + win rate
    (directional, per the Validation Architecture — not a single significance test). DIRECTIONAL
    diagnostic only (DX-12): not part of the Phase-0 success/gate basis."""
    rows = list(db.conn.execute(
        "SELECT model_predicted_rtf, shadow_predicted_rtf, actual_reps "
        "FROM shadow_recommendation"))
    if not rows:
        return {"n": 0}
    model_errs = [abs(r["model_predicted_rtf"] - r["actual_reps"]) for r in rows]
    shadow_errs = [abs(r["shadow_predicted_rtf"] - r["actual_reps"]) for r in rows]
    wins = sum(1 for m, s in zip(model_errs, shadow_errs) if m < s)
    return {
        "n": len(rows),
        "model_mae": statistics.fmean(model_errs),
        "shadow_mae": statistics.fmean(shadow_errs),
        "model_win_rate": wins / len(rows),
        "model_beats_shadow": statistics.fmean(model_errs) < statistics.fmean(shadow_errs),
    }


def standard_load_for(capability: str, score: float, reps: int = 5) -> float:
    """A convenient standardized fresh-state load: the load giving ~`reps` RTF at `score`."""
    return load_for_reps(reps, reference_strength(capability, score))
