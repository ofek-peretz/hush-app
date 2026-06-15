"""
Fatigue model (ES-011 Parts A & C). Sprint 2.

Fatigue is a NON-NEGATIVE, score-space quantity (same units as capability score, so
it subtracts cleanly) representing the transient suppression of performance below
true capability (Principle #59):

    observed_capability(t) = true_capability − Fatigue(t)          [score space]

This module is pure (no I/O, no state). It provides:

  - set_fatigue(...)        ES-011 A.4 — how a completed set generates fatigue
  - accumulate(...)         ES-011 A.5 — additive accumulation (systemic + capability)
  - defatigue_reps(...)     ES-011 C.3 — remove fatigue in REP space, before conversion
  - observation_fatigue(...) the total fatigue acting on one observation
  - surprise(...)           ES-011 C.1 — was the deficit already expected?
  - decision_reason(...)    ES-011 B.3 / E.1 — fatigue-aware decision codes

CONCEPTUAL LOCATION: hush_model/fatigue.py (model-package root, sibling of evidence.py).
Imports follow the documented package layout, exactly like seeding.py.

NOTE: kappa / RIR_REFERENCE / exercise_cost are PROVISIONAL, UNVALIDATED constants
(see constants.py). The fatigue correction is directional until Phase 0 calibrates them.
"""
from __future__ import annotations
import math

from .constants import (
    KAPPA, RIR_REFERENCE, EXERCISE_COST_DEFAULT, K_GROWTH, EPLEY_DIVISOR,
    FATIGUE_ELEVATED_SCORE, SURPRISE_REGRESSION_SCORE,
)


# ----------------------------- A.4: generation -----------------------------

def set_fatigue(
    effective_load: float,
    reference_strength_c: float,
    reps_performed: float,
    predicted_reps_to_failure: float,
    exercise_cost: float = EXERCISE_COST_DEFAULT,
    kappa: float = KAPPA,
    rir_reference: float = RIR_REFERENCE,
) -> float:
    """ES-011 A.4: set_fatigue = κ · rel_load · reps · proximity · exercise_cost.

    rel_load           = effective_load / ReferenceStrength_c(score)   (% of capacity)
    proximity_to_failure = 1 − RIR_observed / RIR_reference            (dominant term)
    RIR_observed is estimated from ES-005.1's existing machinery: the model's
    predicted failure point minus what the athlete actually did (no RIR is collected —
    Anti-Requirement; A.4 reuses the prediction rather than asking the athlete).
    """
    if reference_strength_c <= 0.0:
        raise ValueError("reference_strength_c must be positive")
    rel_load = effective_load / reference_strength_c
    rir_observed = max(0.0, predicted_reps_to_failure - reps_performed)
    proximity = 1.0 - rir_observed / rir_reference
    proximity = max(0.0, min(1.0, proximity))      # closer to failure -> higher cost
    f = kappa * rel_load * reps_performed * proximity * exercise_cost
    return max(0.0, f)


# ----------------------------- A.5: accumulation -----------------------------

def accumulate(
    fatigue_systemic_before: float,
    fatigue_capability_before: float,
    set_fatigue_value: float,
    w_c: float,
) -> tuple[float, float]:
    """ES-011 A.5: systemic gets the full set cost; capability gets its w_c share.

    One split rule, two uses: the SAME ES-010 w_c that splits load credit also splits
    fatigue cost (prevents the two from diverging — A.4).
    """
    fatigue_systemic_after = fatigue_systemic_before + set_fatigue_value
    fatigue_capability_after = fatigue_capability_before + w_c * set_fatigue_value
    return fatigue_systemic_after, fatigue_capability_after


# ----------------------------- C.3: de-fatigue (rep space) -----------------------------

def defatigue_reps(
    raw_reps: float,
    total_fatigue: float,
    k: float = K_GROWTH,
    divisor: float = EPLEY_DIVISOR,
) -> float:
    """ES-011 C.3: lift observed reps to their fatigue-free equivalent, IN REP SPACE,
    before the ES-005.1 ln conversion and therefore before ES-010 attribution.

    Derivation (exact, keeps recommendation/learning inverse — Principle #43):
      Adding fatigue back in score space is  S_clean = S_raw + F.
      Since S = ln(RM1/A_c)/k and RM1 = L·(1 + reps/divisor) with L fixed,
        (1 + reps_clean/divisor) = (1 + reps_raw/divisor) · e^{k·F}
      =>  reps_clean = divisor · [ (1 + reps_raw/divisor) · e^{k·F} − 1 ].

    Doing this in rep space (where fatigue physically acts) keeps the correction
    linear/stable rather than position-dependent through the log (C.3 rationale).
    """
    if total_fatigue <= 0.0:
        return float(raw_reps)                      # rested path: identity
    return divisor * ((1.0 + raw_reps / divisor) * math.exp(k * total_fatigue) - 1.0)


def observation_fatigue(
    fatigue_systemic: float,
    capability_fatigues: dict[str, float],
    contribution_weights: dict[str, float],
) -> float:
    """Total fatigue acting on a single (multi-capability) observation's rep count.

    The de-fatigue uses ONE rep count for all mapped capabilities (C.3 forbids
    de-fatiguing per-capability after the split), so we combine systemic with the
    w_c-weighted capability fatigues. For the single-capability blocks Sprint 1/2
    actually run (w_c = 1.0) this is exactly Fatigue_systemic + Fatigue_capability,c.
    """
    cap_part = sum(
        contribution_weights.get(c, 0.0) * capability_fatigues.get(c, 0.0)
        for c in contribution_weights
    )
    return max(0.0, fatigue_systemic + cap_part)


# ----------------------------- C.1: surprise discrimination -----------------------------

def surprise(s_obs_raw: float, current_score: float, estimated_fatigue: float) -> float:
    """ES-011 C.1: surprise = S_obs_raw − (current_score − estimated_Fatigue_c).

    underperformance + HIGH estimated fatigue  -> surprise ≈ 0  (expected; learn nothing)
    underperformance + LOW  estimated fatigue  -> surprise < 0  (genuine regression)
    """
    expected_observed = current_score - estimated_fatigue
    return s_obs_raw - expected_observed


# ----------------------------- B.3 / E.1: decision codes -----------------------------

def decision_reason(
    estimated_fatigue: float,
    surprise_value: float,
    has_positive_evidence: bool,
    elevated: float = FATIGUE_ELEVATED_SCORE,
    regression: float = SURPRISE_REGRESSION_SCORE,
) -> str:
    """ES-011 B.3 / E.1 fatigue-aware decision codes.

    - fatigue_hold:           fatigue elevated -> never progress into fatigue (KEEP_LOAD).
    - unexplained_regression: fatigue low AND deficit unexplained -> real regression.
    - recovered_progression:  fatigue low AND positive evidence -> INCREASE permitted.
    - working_set:            ordinary load hold.

    SUPERSEDED (Sprint 3A): this helper is NO LONGER the live decision path. The single
    live source of truth for decision type and reason is `decision.py` (consulted by
    recommendation.recommend()). This function is retained only for its Sprint 2 unit
    tests and as an audit-reference mapping; do not call it from the engine.
    """
    if estimated_fatigue >= elevated:
        return "fatigue_hold"
    if surprise_value <= -regression:
        return "unexplained_regression"
    if has_positive_evidence and surprise_value > 0.0:
        return "recovered_progression"
    return "working_set"
