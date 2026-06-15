"""
State Update Engine (ES-007 / ES-005.1 sec 5-6, ES-010 Part C).

The ONLY writer of capability state. Applies the precision-weighted blend:

    eff_w     = w_i · agreement                      (ES-010 C.4 learning-rate damping)
    sum_w_new = sum_w_old + eff_w
    score_new = (sum_w_old · score_old + eff_w · s_obs) / sum_w_new
    confidence_new = capability_confidence(sum_w_new, agreement)   (ES-010 C.2)

Gradual by construction: a single low-weight observation barely moves the score
(ES-005.1: "single workouts should not redefine the athlete").

`agreement` defaults to 1.0 (no conflict), making the blend bit-identical to Sprint
0/1: eff_w = w_i and confidence = capability_confidence(sum_w_new). Under conflict
the agreement factor both suppresses confidence (C.2/C.3) and damps how hard the
score chases the swings (C.4) — ES-007's conflict principle made mechanically true.
"""
from __future__ import annotations

from .domain import CapabilityState, Evidence
from .capability.confidence import capability_confidence


def apply_evidence(
    state: CapabilityState, ev: Evidence, week: float, agreement: float = 1.0
) -> CapabilityState:
    """Update a capability state in place with one evidence item. Returns it."""
    if ev.capability != state.capability:
        raise ValueError(
            f"evidence capability {ev.capability} != state {state.capability}"
        )
    if ev.weight <= 0.0:
        return state  # no information

    eff_w = ev.weight * agreement                      # ES-010 C.4: variance-damped
    if eff_w <= 0.0:
        return state
    sum_w_new = state.sum_w + eff_w
    state.score = (state.sum_w * state.score + eff_w * ev.s_obs) / sum_w_new
    state.sum_w = sum_w_new
    state.confidence = capability_confidence(sum_w_new, agreement)
    state.last_trained_at_week = week
    return state
