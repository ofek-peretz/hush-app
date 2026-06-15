"""
Confidence model (ES-005.1 sec 6).

Capability confidence is a saturating function of accumulated precision (sum_w):

    c_cap = 100 * (1 - e^(-sum_w / CONFIDENCE_K))

with a seed floor of SEED_CONFIDENCE applied at initialization (ES-008 v2:
confidence starts at 10 regardless of score).

Sprint 2 wires ES-010 Part C: the `agreement` factor multiplies the saturation
curve (C.2), so conflicting recent evidence suppresses confidence even while sum_w
rises. `agreement` defaults to 1.0 — the un-suppressed Sprint 0/1 behavior — so the
single-argument call site and the rested/coherent path are bit-identical.
"""
from __future__ import annotations
import math

from ..constants import CONFIDENCE_K, SEED_CONFIDENCE


def capability_confidence(sum_w: float, agreement: float = 1.0) -> float:
    """Confidence in [SEED_CONFIDENCE, 100] from precision, suppressed by disagreement.

    ES-005.1 §6:  100·(1 − e^{−sum_w/8}).
    ES-010 C.2:   × agreement, where agreement ∈ [0,1] falls as recent variance rises.
    The seed floor still applies (ES-008 v2): confidence never drops below 10.
    """
    derived = 100.0 * (1.0 - math.exp(-sum_w / CONFIDENCE_K)) * agreement
    return max(SEED_CONFIDENCE, derived)
