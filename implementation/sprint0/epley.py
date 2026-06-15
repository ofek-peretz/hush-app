"""
Epley rep model (ES-005.1 sec 2). Invertible in all three directions the loop needs.

    reps_to_failure(L, RM1) = (RM1 / L - 1) * 30        [predict]
    load_for_reps(r, RM1)   = RM1 / (1 + r/30)          [recommend]
    rm1_from(L, r)          = L * (1 + r/30)            [learn / inverse]
"""
from __future__ import annotations

from ..constants import EPLEY_DIVISOR


def reps_to_failure(load: float, rm1: float) -> float:
    """Predicted reps to failure at `load` given a 1RM-equivalent `rm1`."""
    if load <= 0.0:
        raise ValueError("load must be positive")
    return (rm1 / load - 1.0) * EPLEY_DIVISOR


def load_for_reps(reps: float, rm1: float) -> float:
    """Load that yields `reps` reps-to-failure given `rm1`."""
    return rm1 / (1.0 + reps / EPLEY_DIVISOR)


def rm1_from(load: float, reps: float) -> float:
    """Observed 1RM-equivalent from a completed set of `reps` at `load`."""
    return load * (1.0 + reps / EPLEY_DIVISOR)
