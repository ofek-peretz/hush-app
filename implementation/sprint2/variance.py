"""
Variance-suppressed confidence (ES-010 Part C). Sprint 2.

Per the accepted constraint, this is treated as INFRASTRUCTURE, not calibration:
this module implements the variance accumulators and the agreement factor; it does
NOT tune σ²_ref. σ²_ref is a frozen-scale PROVISIONAL constant (constants.py) whose
calibration is a Phase 0 simulation responsibility.

The problem (ES-010 C.1): the ES-005.1 §5 precision-weighted blend, fed alternating
signals (+3 +2 +3 −3 −2 −4), lands near the mean while sum_w keeps rising — so
confidence would CLIMB while the athlete is visibly unstable. ES-007's principle
("conflict → reduce confidence before changing score") is not implied by the blend
math alone. ES-010 fixes it with ONE multiplicative term (no new component):

    σ²_recent = weighted variance of recent S_obs,c   (same decay weights as the blend)
    agreement = 1 − min(σ²_recent / σ²_ref, 1)
    c_cap     = 100·(1 − e^{−sum_w/8}) · agreement        (C.2, wired in confidence.py)
    effective_learning_weight = w_i · agreement           (C.4, wired in state_update.py)

The recent variance is tracked O(1) via decay-weighted moments (var_w, var_ws, var_ws2),
i.e. Σw, Σw·S, Σw·S² with a forgetting factor applied between updates so the variance
reflects RECENT disagreement (the "last-N" window), using the SAME decay constant the
evidence blend uses.

CONCEPTUAL LOCATION: hush_model/variance.py (model-package root). Pure; no I/O.
"""
from __future__ import annotations

from .constants import SIGMA2_REF, VARIANCE_MIN_PRECISION


def update_moments(
    var_w: float, var_ws: float, var_ws2: float,
    decay_factor: float, s_obs: float, w_i: float,
) -> tuple[float, float, float]:
    """Forget by `decay_factor` (recency), then add the new weighted observation.

    decay_factor = evidence decay over the elapsed interval since the last update
    (1.0 within a session -> pure accumulation; <1.0 across rest -> old swings fade).
    """
    var_w = var_w * decay_factor + w_i
    var_ws = var_ws * decay_factor + w_i * s_obs
    var_ws2 = var_ws2 * decay_factor + w_i * s_obs * s_obs
    return var_w, var_ws, var_ws2


def recent_variance(var_w: float, var_ws: float, var_ws2: float) -> float:
    """Weighted variance E[wS²]/E[w] − (E[wS]/E[w])², clamped to ≥ 0."""
    if var_w <= 0.0:
        return 0.0
    mean = var_ws / var_w
    v = var_ws2 / var_w - mean * mean
    return max(0.0, v)


def agreement(
    var_w: float, var_ws: float, var_ws2: float,
    sigma2_ref: float = SIGMA2_REF,
    min_precision: float = VARIANCE_MIN_PRECISION,
) -> float:
    """ES-010 C.2: agreement = 1 − min(σ²_recent/σ²_ref, 1), in [0, 1].

    Cold start guard: with less than `min_precision` accumulated weight there is not
    enough recent evidence to judge conflict, so agreement = 1.0 (no suppression).
    This keeps the seeded first observations behaving like the un-suppressed blend.
    """
    if var_w < min_precision:
        return 1.0
    v = recent_variance(var_w, var_ws, var_ws2)
    return 1.0 - min(v / sigma2_ref, 1.0)
