"""
Evidence decay (ES-005.1 sec 10).

    decay(dt_weeks) = 0.5 ^ (dt_weeks / HALF_LIFE)

Anchored to the spec: ~1.0 at 1 week, ~0.1 at 18 months (78 weeks).
"""
from __future__ import annotations

from ..constants import DECAY_HALF_LIFE_WEEKS


def decay(age_weeks: float) -> float:
    """Multiplicative weight for evidence `age_weeks` old."""
    if age_weeks < 0.0:
        raise ValueError("age_weeks must be non-negative")
    return 0.5 ** (age_weeks / DECAY_HALF_LIFE_WEEKS)
