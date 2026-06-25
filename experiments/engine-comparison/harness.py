"""
The comparison harness: same athlete, same luck, two coaches.

A "profile" describes a synthetic athlete's BODY (true strength, weekly trend, fatigue,
noise) plus an optional disturbance schedule (a bad week, a missed week, a temporary dip).
For each profile we build TWO byte-identical synthetic athletes with the SAME RNG seed, so
the noise realization at set k is identical across engines — the only thing that differs is
which coach picks the weight. That is the fair experiment: same body, same luck, different brain.

Both engines start at the IDENTICAL session-1 weight: the Bayesian cold-start load is computed
first and fed to the Double-Progression seed.
"""
from __future__ import annotations
from dataclasses import dataclass, field, replace
import random
import math

from hush_model.capability.reference_strength import reference_strength
from hush_model.capability.epley import reps_to_failure, load_for_reps
from hush_model.constants import target_reps_for_goal

from engines import (
    BayesianEngine, DoubleProgressionEngine, SessionRecord, CAPABILITY, DIFFICULTY,
)

SETS_PER_SESSION = 3
SESSIONS_PER_WEEK = 3


def dose_response(rel_intensity: float, coupling: float) -> float:
    """ASSUMED, SYMMETRIC, CONSERVATIVE stimulus→adaptation multiplier on the week's gain.

    `rel_intensity` = prescribed working weight / the athlete's TRUE capacity for the goal
    reps (1.0 = training right at the target intensity). Effectiveness e(rel):
        • below target (under-loading)  → proportionally less than full stimulus,
        • at/near target                → full stimulus (1.0 — the CAP; you cannot exceed base gain),
        • past target (grinding/overreach) → a gentle penalty.
    `coupling` ∈ [0,1] blends this against the exogenous baseline: 0 = adaptation is independent
    of the engine (pure tracking study); 1 = gain is fully gated by load quality. The cap at 1.0
    makes it CONSERVATIVE toward the Bayesian engine — heavier loading can never be rewarded
    ABOVE the shared baseline gain, it can only reveal the cost of chronic under-loading.
    """
    if rel_intensity <= 1.0:
        e = min(1.0, rel_intensity / 0.95)        # full stimulus once within ~5% of target
    else:
        e = max(0.7, 1.0 - 0.5 * (rel_intensity - 1.05))  # grinding past capacity costs a little
    return 1.0 + coupling * (e - 1.0)


@dataclass
class Disturbance:
    """A transient perturbation to the athlete's TRUE capability or schedule."""
    kind: str          # 'bad_week' | 'missed_week' | 'dip'
    start_week: float
    weeks: float = 1.0
    magnitude: float = 0.0   # score units subtracted from true capability during the window


@dataclass
class Profile:
    id: str
    label: str
    experience: str            # beginner | intermediate | advanced (seeds the engine)
    true_score: float          # ground-truth capability score at week 0
    weekly_gain: float         # true score gained per week (responder type)
    sex: str = "male"
    age: int = 30
    rep_noise_sd: float = 0.7
    fatigue_per_set: float = 0.20
    recovery_tau_weeks: float = 0.7
    goal: str = "build_muscle"
    coupling: float = 0.0      # stimulus→adaptation strength (0 = exogenous gain; pure tracking study)
    disturbances: list[Disturbance] = field(default_factory=list)


class _Body:
    """The athlete's TRUE physiology — independent of either model (non-circularity, R2).

    Reps come from (true_score - true_fatigue - disturbance) via the same ReferenceStrength+
    Epley physics the world is defined by; the model never sees true_score. The RNG is the
    athlete's luck; seeded identically across engines so both coaches face the same draws.
    """

    def __init__(self, profile: Profile, seed: int):
        self.p = profile
        self.true_score = profile.true_score
        self.true_fatigue = 0.0
        self.rng = random.Random(seed)

    def disturbance_at(self, week: float) -> float:
        drop = 0.0
        for d in self.p.disturbances:
            if d.kind in ("bad_week", "dip") and d.start_week <= week < d.start_week + d.weeks:
                drop += d.magnitude
        return drop

    def is_missed(self, week: float) -> bool:
        for d in self.p.disturbances:
            if d.kind == "missed_week" and d.start_week <= week < d.start_week + d.weeks:
                return True
        return False

    def perform_set(self, weight: float, week: float) -> int:
        effective = self.true_score - self.true_fatigue - self.disturbance_at(week)
        true_rm1 = reference_strength(CAPABILITY, effective) * DIFFICULTY
        true_reps = reps_to_failure(weight, true_rm1)
        noisy = true_reps + self.rng.gauss(0.0, self.p.rep_noise_sd)
        self.true_fatigue += self.p.fatigue_per_set
        return max(0, round(noisy))

    def advance(self, weeks: float, gain_scale: float = 1.0) -> None:
        self.true_score += self.p.weekly_gain * weeks * gain_scale
        if self.true_fatigue > 0.0:
            self.true_fatigue *= math.exp(-weeks / self.p.recovery_tau_weeks)

    def target_weight(self, bottom_reps: int) -> float:
        """Heaviest the athlete can do for `bottom_reps` reps when fresh (ground-truth yardstick)."""
        rm1 = reference_strength(CAPABILITY, self.true_score) * DIFFICULTY
        return load_for_reps(bottom_reps, rm1)


def run_engine(profile: Profile, engine, body: _Body, weeks: int) -> list[SessionRecord]:
    """Coach `body` with `engine` for `weeks` weeks; return the per-session record stream."""
    records: list[SessionRecord] = []
    dt = 1.0 / SESSIONS_PER_WEEK
    week = 1.0
    idx = 0
    prev_weight = None
    for _w in range(weeks):
        for _s in range(SESSIONS_PER_WEEK):
            if body.is_missed(week):
                # absence: no training this slot, but life (recovery + trend) goes on
                body.advance(dt)
                week += dt
                idx += 1
                continue
            weight, target = engine.prescribe()
            # relative intensity is measured against true capacity BEFORE this session's gain
            rel = weight / body.target_weight(target)
            reps = [body.perform_set(weight, week) for _ in range(SETS_PER_SESSION)]
            if isinstance(engine, BayesianEngine):
                engine.record(weight, reps, week)
                reason = engine._last_rec.decision_type
            else:
                engine.record(weight, reps)
                reason = "double_progression"
            decision = ("increase" if prev_weight is not None and weight > prev_weight + 1e-9
                        else "decrease" if prev_weight is not None and weight < prev_weight - 1e-9
                        else "hold")
            records.append(SessionRecord(
                week=week, index=idx, weight=weight, target_reps=target, reps=reps,
                decision=decision, engine_reason=reason, true_score=body.true_score,
            ))
            prev_weight = weight
            body.advance(dt, dose_response(rel, profile.coupling))
            week += dt
            idx += 1
    return records


def run_profile(profile: Profile, weeks: int, base_seed: int = 12345,
                coupling: float | None = None):
    """Run BOTH engines on identical bodies (same seed). Returns {engine_name: [records]}.

    `coupling` overrides the profile's stimulus→adaptation strength for a sensitivity sweep."""
    if coupling is not None:
        profile = replace(profile, coupling=coupling)
    bottom = target_reps_for_goal(profile.goal)
    # session-1 weight: let the Bayesian cold start author it, then seed DP with the same value
    bay = BayesianEngine(profile.experience, bottom)
    seed_weight, _ = bay.prescribe()  # peek; BayesianEngine.prescribe is idempotent before record
    dp = DoubleProgressionEngine(seed_weight, bottom)
    # fresh engines + identically-seeded bodies for the actual runs
    bay = BayesianEngine(profile.experience, bottom)
    dp = DoubleProgressionEngine(seed_weight, bottom)
    seed = base_seed + (hash(profile.id) & 0xFFFF)
    body_bay = _Body(profile, seed)
    body_dp = _Body(profile, seed)
    return {
        "Bayesian": run_engine(profile, bay, body_bay, weeks),
        "Double Progression": run_engine(profile, dp, body_dp, weeks),
    }


# ────────────────────────────────────────────────────────────────────────────
# The population: responder types × experience × disturbance studies
# ────────────────────────────────────────────────────────────────────────────
def population() -> list[Profile]:
    profs: list[Profile] = []
    # core responder grid (no disturbances) — the long-run trajectory study
    grid = [
        ("beg_fast",  "Beginner · fast gainer",      "beginner",     30.0, 0.60),
        ("beg_steady","Beginner · steady gainer",    "beginner",     30.0, 0.35),
        ("int_fast",  "Intermediate · fast gainer",  "intermediate", 48.0, 0.45),
        ("int_steady","Intermediate · steady gainer","intermediate", 48.0, 0.25),
        ("int_slow",  "Intermediate · slow gainer",  "intermediate", 48.0, 0.12),
        ("adv_steady","Advanced · steady gainer",    "advanced",     64.0, 0.18),
        ("adv_slow",  "Advanced · slow gainer",      "advanced",     64.0, 0.07),
        ("plateauer", "Intermediate · plateaued",    "intermediate", 50.0, 0.02),
    ]
    for pid, label, exp, score, gain in grid:
        profs.append(Profile(id=pid, label=label, experience=exp,
                             true_score=score, weekly_gain=gain))
    # robustness studies (built on the steady intermediate so the disturbance is isolated)
    base = dict(experience="intermediate", true_score=48.0, weekly_gain=0.30)
    profs.append(Profile(id="rob_badweek", label="Robustness · one bad week (wk12)", **base,
                         disturbances=[Disturbance("bad_week", 12.0, 1.0, magnitude=8.0)]))
    profs.append(Profile(id="rob_missed", label="Robustness · missed week (wk12)", **base,
                         disturbances=[Disturbance("missed_week", 12.0, 1.0)]))
    profs.append(Profile(id="rob_dip", label="Robustness · 3-week dip (wk12-15)", **base,
                         disturbances=[Disturbance("dip", 12.0, 3.0, magnitude=5.0)]))
    return profs
