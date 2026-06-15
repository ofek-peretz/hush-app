"""
Synthetic athlete simulator (Phase 0 harness, ES Validation Architecture).

A synthetic athlete has a KNOWN true capability score per capability. When asked to
perform a recommendation, it computes how many reps it would actually achieve at the
recommended load, with optional noise and a gradual true-capability trend.

Design note on non-circularity: the simulator generates reps via the SAME physical
relationship the model assumes (ReferenceStrength + Epley), because that IS the
model's definition of the world. To make recovery a real test we instead vary the
INPUT the model never sees directly - the athlete's TRUE score, which differs from
the model's seeded estimate - plus measurement noise. The test is whether the loop
drives the model's score toward the athlete's true score. We do not reuse the
model's *state* in generation; we use an independent ground-truth score.

Sprint 2 adds an INDEPENDENT fatigue/recovery generator (Build Plan §7: "do not
generate observations with the same equations you are testing"). The athlete's true
fatigue rises by `fatigue_per_set` (its own constant, NOT the model's kappa) on each
completed set and decays with its own `recovery_tau_weeks` (NOT the model's tau) when
advance_week is called. Reps are generated from (true_score - true_fatigue). The test
is then whether the model, using its OWN provisional kappa/tau, recovers the
un-fatigued true_score despite the contamination. Defaults (fatigue_per_set=0) leave
the rested behavior — and every Sprint 0/1 test — unchanged.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import math
import random

from hush_model.capability.reference_strength import reference_strength
from hush_model.capability.epley import reps_to_failure


@dataclass
class SyntheticAthlete:
    athlete_id: str
    sex: str
    age: int
    experience: str
    true_score: dict[str, float]                 # ground truth per capability
    weekly_gain: dict[str, float] = field(default_factory=dict)  # true score / week
    rep_noise_sd: float = 0.8                    # SD of integer rep noise
    rng: random.Random = field(default_factory=lambda: random.Random(0))
    # --- Sprint 2: independent true fatigue/recovery (NOT the model's kappa/tau) ---
    fatigue_per_set: float = 0.0                 # true fatigue added per completed set
    recovery_tau_weeks: float = 0.7              # true recovery time-constant (weeks)
    true_fatigue: float = 0.0                    # current true fatigue (score units)
    # --- M1 (DX-01/DX-19): the athlete may load OTHER than prescribed. `load_deviation_kg`
    # is added to the prescribed weight to produce the LOGGED actual_weight (default 0.0 =
    # load exactly the prescription, so every Sprint 0-4/Wave-1 trajectory is byte-unchanged).
    load_deviation_kg: float = 0.0

    def advance_week(self, weeks: float = 1.0) -> None:
        """Apply true-capability trend AND recover (decay true fatigue) over `weeks`."""
        for cap, gain in self.weekly_gain.items():
            self.true_score[cap] = self.true_score.get(cap, 0.0) + gain * weeks
        if self.true_fatigue > 0.0 and weeks > 0.0:
            self.true_fatigue *= math.exp(-weeks / self.recovery_tau_weeks)

    def load_for(self, recommendation) -> float:
        """The weight the athlete actually loads (M1/DX-01). Default: exactly the
        prescription; `load_deviation_kg` lets a test drive an honest deviation (e.g.
        a heavier load → fewer reps)."""
        return recommendation.recommended_weight + self.load_deviation_kg

    def perform(self, recommendation) -> tuple[float, int]:
        """(actual_weight, actual_reps) actually logged at the load the athlete chose,
        from TRUE capability (M1/DX-01 — the callback now reports BOTH the weight lifted
        and the reps, mirroring the real device set-report payload).

        Observed performance = true capability − true fatigue (Principle #59), then
        the set itself adds fatigue (independent generator). Within a session (no
        advance_week between sets) fatigue accumulates, so later sets yield fewer reps.
        Reps are generated at the LOGGED actual_weight, so a heavier-than-prescribed load
        honestly yields fewer reps.
        """
        cap = recommendation.capability
        effective_score = self.true_score[cap] - self.true_fatigue
        true_rm1 = reference_strength(cap, effective_score) * recommendation.difficulty_factor
        actual_weight = self.load_for(recommendation)
        true_reps = reps_to_failure(actual_weight, true_rm1)
        noisy = true_reps + self.rng.gauss(0.0, self.rep_noise_sd)
        self.true_fatigue += self.fatigue_per_set         # this set's true cost
        return float(actual_weight), max(0, round(noisy))
