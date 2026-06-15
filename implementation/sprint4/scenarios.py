"""
Known-answer Phase 0 scenarios (Build Plan [2] test strategy). Sprint 4.

The harness is only believable if it reproduces scenarios with known answers (Build Plan:
"if the harness can't reproduce these, it's wrong before any real conclusion"):

  constant  -> a synthetic athlete with constant true capability shows a FLAT, STABLE score.
  improver  -> a genuinely improving athlete shows a RISING inferred score.
  fatigued  -> a fatigued athlete shows suppressed-then-recovered performance, and the model
               recovers the un-fatigued true score (the non-circularity test, R2).
  recovery  -> seed-away-from-truth: the model converges toward a truth it was NOT seeded with
               (the A1-offline recoverability scenario used for calibration).

These build `SyntheticAthlete` instances (sim/synthetic_athlete.py) over the five Class-A
capabilities. The athlete's reps come from its OWN constants, never the model's (R2).

CONCEPTUAL LOCATION: sim/scenarios.py (harness package).
"""
from __future__ import annotations
import random

from hush_model.constants import CLASS_A_CAPABILITIES
from sim.synthetic_athlete import SyntheticAthlete


def _uniform_truth(value: float) -> dict[str, float]:
    return {c: value for c in CLASS_A_CAPABILITIES}


def make_athlete(athlete_id: str, *, true: float, experience: str = "intermediate",
                 gain: float = 0.0, fatigue_per_set: float = 0.0,
                 recovery_tau_weeks: float = 0.7, rep_noise_sd: float = 0.4,
                 seed: int = 0, sex: str = "male", age: int = 30) -> SyntheticAthlete:
    return SyntheticAthlete(
        athlete_id=athlete_id, sex=sex, age=age, experience=experience,
        true_score=_uniform_truth(true),
        weekly_gain={c: gain for c in CLASS_A_CAPABILITIES},
        rep_noise_sd=rep_noise_sd, rng=random.Random(seed),
        fatigue_per_set=fatigue_per_set, recovery_tau_weeks=recovery_tau_weeks,
    )


# Known-answer scenarios. Seed score by experience: beginner 30 / intermediate 48 / advanced 64.

def constant_athlete(athlete_id: str = "const") -> SyntheticAthlete:
    """True == intermediate seed (48), no gain, no fatigue -> expect flat/stable inferred score."""
    return make_athlete(athlete_id, true=48.0, experience="intermediate", gain=0.0)


def improver_athlete(athlete_id: str = "improver") -> SyntheticAthlete:
    """Genuinely improving (+0.5 score/wk) -> expect a rising inferred score."""
    return make_athlete(athlete_id, true=48.0, experience="intermediate", gain=0.5)


def fatigued_athlete(athlete_id: str = "fatigued") -> SyntheticAthlete:
    """Constant true capability but real per-set fatigue -> suppressed-then-recovered; the
    model must recover the un-fatigued true score using its OWN kappa/tau (R2)."""
    return make_athlete(athlete_id, true=48.0, experience="intermediate", gain=0.0,
                        fatigue_per_set=0.25, recovery_tau_weeks=0.7)


def recovery_athlete(athlete_id: str = "recovery", true: float = 58.0) -> SyntheticAthlete:
    """Seed-away-from-truth: intermediate seed (48) but true 58 -> the model must converge
    UP toward a truth it was never given (A1-offline recoverability / calibration scenario)."""
    return make_athlete(athlete_id, true=true, experience="intermediate", gain=0.0)
