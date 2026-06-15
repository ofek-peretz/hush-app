"""
ReferenceStrength: the score <-> reference-1RM decoder (ES-005.1 sec 1, ES-008 v2 sec 2).

    ReferenceStrength_c(S) = A_c * e^(k * S)
    S_of(RM1)             = ln(RM1 / A_c) / k          (closed-form inverse)

Strictly increasing exponential => the inverse exists and is exact, which is what
keeps recommendation and learning mathematically consistent (Principle #43).
"""
from __future__ import annotations
import math

from ..constants import A_C, K_GROWTH


def reference_strength(capability: str, score: float) -> float:
    """Reference 1RM-equivalent (kg) on the canonical exercise for `capability`."""
    return A_C[capability] * math.exp(K_GROWTH * score)


def score_of(capability: str, rm1: float) -> float:
    """Inverse: capability score implied by a reference 1RM-equivalent."""
    if rm1 <= 0.0:
        raise ValueError("rm1 must be positive")
    return math.log(rm1 / A_C[capability]) / K_GROWTH
