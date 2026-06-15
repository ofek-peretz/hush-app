"""
Prediction Engine (ES-004 / ES-005.1).

Forward path:  score --ReferenceStrength--> RM1_capability
                     --(x difficulty_factor)--> RM1_exercise
                     --Epley(load)--> predicted_reps_to_failure

Sprint 2 (ES-011 B.1) plugs fatigue in here exactly as anticipated: prediction runs
on observed_capability = score − Fatigue_c(t), not on score alone. The `fatigue`
argument defaults to 0.0, so the rested path is bit-identical to Sprint 0/1; a
fatigued day yields lower predicted reps at the same load (the fix for the purest
infinite-recovery assumption), and recommendations auto-soften with no new rule.
"""
from __future__ import annotations

from .capability.reference_strength import reference_strength
from .capability.epley import reps_to_failure


def exercise_rm1(
    capability: str, score: float, difficulty_factor: float, fatigue: float = 0.0
) -> float:
    """1RM-equivalent for a specific exercise at the athlete's OBSERVED capability.

    ES-011 B.1: decode score − fatigue (observed capability), never bare score.
    """
    return reference_strength(capability, score - fatigue) * difficulty_factor


def predict_reps_to_failure(
    capability: str, score: float, difficulty_factor: float, load: float,
    fatigue: float = 0.0,
) -> float:
    """Predicted reps to failure for `load` on this exercise (fatigue-adjusted)."""
    rm1 = exercise_rm1(capability, score, difficulty_factor, fatigue)
    return reps_to_failure(load, rm1)
