"""
Option D cold-start seed-coverage validation harness (DX-08 §4 D2 / BB-16 / BB-17).

Purpose
-------
Wire the §5 *coverage gates* of ``CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`` as a
pre-beta acceptance check, using the **real** model end to end: ``seed_athlete`` (Option D
bodyweight prior) → ``recommend`` (the live recommendation engine) → the athlete's TRUE 1RM
(independent ground truth). This is the *mechanism* behind the one hard Phase-1 gate (A7 seed
safety across the diverse cohort): no real athlete should be issued a day-1 working load they
cannot lift, and the over-estimation tail (the dangerous direction) must stay bounded across
every cohort cell — including the two detrained over-claim stress cells.

What the gate measures (day-1, per athlete × capability)
--------------------------------------------------------
- ``true_1rm = reference_strength(cap, true_score)``         — the athlete's real 1RM (kg)
- ``W       = recommend(seed_state, …).recommended_weight``  — the live day-1 working load
- ``achievable = reps_to_failure(W, true_1rm)``              — reps the athlete can really do at W
- **unliftable**  ⇔ ``W ≥ true_1rm``        (cannot complete even one rep — the catastrophic failure)
- **too_heavy**   ⇔ ``achievable < TARGET_REPS``  (cannot complete the prescription — over-loaded)
- ``err_pct = (W − ideal_W) / ideal_W``  where ``ideal_W = load_for_reps(TARGET_REPS + RIR, true_1rm)``
  (the load a perfectly-calibrated conservative rec would emit — target reps with RIR in reserve);
  negative ``err`` is the benign down-bias + safety-discount under-load (the §5 "median |err%| ~12–14%").

Ground-truth model (non-circular; the spec's calibrated-table assumption made explicit)
---------------------------------------------------------------------------------------
The seed sees only (sex, age, experience, bodyweight). The athlete's TRUE 1RM is generated
**independently** from the same physical anchors *without* the conservative down-bias and *without*
the plausibility clamp, plus multiplicative within-bucket noise (≈ residual SD 6.2 score, spec §5):

    true_1rm = bodyweight × base_ratio(cap, sex) × experience_modifier(TRUE_exp) × age_taper(age)
               × lognormal(σ = 6.2 · K_GROWTH)

For a **normally-classified** cell ``TRUE_exp == declared`` (the seed is calibrated-but-conservative
→ benign under-load). For a **detrained** cell the athlete *declares* a higher experience than is
true (``TRUE_exp = beginner``); the seed therefore applies the wrong, higher experience modifier and
the bodyweight-keying + ≤ +20 % cap + down-bias + clamp are what must contain the over-estimate.

Scope / honesty
---------------
The table this runs against (``strength_standards.py``) is **PROVISIONAL** (illustrative ratios; the
D1 fit-and-freeze to a public dataset is not done). The *binding* §5 sign-off gate is on the fitted,
frozen table; this harness is the **mechanism** that gate will run through, exercised here on the
provisional values so seed safety is continuously checkable from now on. The population parameters
(cohort mean bodyweights / SDs) are likewise PROVISIONAL and refit with the table at D1. Gate **(d)**
(DECISION Part-B gate-open median ≤ 3 weeks) is a multi-week *convergence* check, not a day-1 seed-
safety check, and is intentionally out of this slice (it needs the full learning loop, not seeding).

Pure except for its own deterministic RNG. Reuses ``SyntheticAthlete`` only conceptually (the TRUE
capability is independent ground truth, exactly as that simulator documents); the coverage metric is
computed directly from the model's own ``reference_strength`` / Epley primitives.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import math
import random
import statistics
import sys

from hush_model.constants import (
    CLASS_A_CAPABILITIES, SEED_SCORE, K_GROWTH, DEFAULT_RIR, SEED_AGE_MIN,
    BODYWEIGHT_MIN_KG, BODYWEIGHT_MAX_KG,
)
from hush_model.seeding import seed_athlete
from hush_model.recommendation import recommend
from hush_model.capability.reference_strength import reference_strength, score_of
from hush_model.capability.epley import reps_to_failure, load_for_reps
from hush_model.strength_standards import (
    base_ratio, experience_modifier, age_taper, CALIBRATION_BW_KG,
)

# ---- harness parameters (PROVISIONAL — refit with the table at D1) -----------------------------
N_PER_CELL = 300                      # spec §5: N = 300 / group
TARGET_REPS = 8                       # canonical working-set target
DIFFICULTY = 1.0                      # canonical exercise (difficulty_factor 1.0 == reference 1RM)
RESIDUAL_SD_SCORE = 6.2               # within-bucket true-capability spread, in score units (spec §5)
TOO_HEAVY_GATE = 0.05                 # §5 gate: ≤ 5 % too-heavy
UNLIFTABLE_GATE = 0.0                 # §5 gate: 0 % unliftable (the hard safety invariant)
CONTINUITY_TOL = 3.0                  # §2.1: beginner median within ±3 score of SEED_SCORE['beginner']
SEED_RNG = 20260612                   # deterministic — the gate must be reproducible

# lognormal sigma on true 1RM (kg) equivalent to RESIDUAL_SD_SCORE in score space:
#   Δscore = ln(noise_factor) / K_GROWTH   ⇒   σ_ln = RESIDUAL_SD_SCORE · K_GROWTH
_LN_SIGMA = RESIDUAL_SD_SCORE * K_GROWTH

# Cohort population assumptions (PROVISIONAL). Mean bodyweight / SD per sex; age per band.
_MEAN_BW = {"male": 85.0, "female": 68.0}
_BW_SD = {"male": 12.0, "female": 10.0}
_AGE_BAND = {"young": 25, "middle": 42, "older": 58}
_AGE_SD = 4.0


@dataclass(frozen=True)
class Cohort:
    """One §5 cohort cell. `declared` is what onboarding records (drives the seed); `true_exp` is the
    athlete's real level (drives ground truth). They differ only for the detrained stress cells."""
    label: str
    sex: str
    age_band: str
    declared: str
    true_exp: str
    detrained: bool = False


# §5 normal cells (6) + the two detrained over-claim stress cells.
NORMAL_COHORTS = [
    Cohort("M young beginner",       "male",   "young",  "beginner",     "beginner"),
    Cohort("M middle intermediate",  "male",   "middle", "intermediate", "intermediate"),
    Cohort("M older advanced",       "male",   "older",  "advanced",     "advanced"),
    Cohort("F young intermediate",   "female", "young",  "intermediate", "intermediate"),
    Cohort("F middle beginner",      "female", "middle", "beginner",     "beginner"),
    Cohort("F older intermediate",   "female", "older",  "intermediate", "intermediate"),
]
DETRAINED_COHORTS = [
    Cohort("adv→beg (Δ−34) detrained", "male", "middle", "advanced",     "beginner", detrained=True),
    Cohort("int→beg (Δ−18) detrained", "male", "middle", "intermediate", "beginner", detrained=True),
]


@dataclass
class CellResult:
    label: str
    n_samples: int                    # athletes × capabilities scored
    too_heavy_frac: float
    unliftable_frac: float
    median_abs_err_pct: float
    detrained: bool = False
    per_capability: dict = field(default_factory=dict)

    def passes(self) -> bool:
        return self.too_heavy_frac <= TOO_HEAVY_GATE and self.unliftable_frac <= UNLIFTABLE_GATE


def _true_1rm(cap: str, sex: str, bodyweight_kg: float, age: int, true_exp: str,
              rng: random.Random) -> float:
    """Independent ground-truth 1RM (kg): the same physical anchors as the seed table but WITHOUT the
    conservative down-bias and WITHOUT the plausibility clamp, plus lognormal within-bucket noise."""
    base = (bodyweight_kg * base_ratio(cap, sex)
            * experience_modifier(true_exp) * age_taper(max(age, SEED_AGE_MIN)))
    return base * math.exp(rng.gauss(0.0, _LN_SIGMA))


def evaluate_cohort(cohort: Cohort, n: int = N_PER_CELL, rng: random.Random | None = None) -> CellResult:
    """Run the live seed→recommend path for `n` synthetic athletes in this cell and score day-1
    coverage against independent true capability. Deterministic given the RNG seed."""
    rng = rng or random.Random(SEED_RNG)
    too_heavy = unliftable = total = 0
    abs_errs: list[float] = []
    per_cap_counts: dict[str, list[int]] = {c: [0, 0, 0] for c in CLASS_A_CAPABILITIES}  # [too_heavy, unlift, total]

    for i in range(n):
        bw = min(max(rng.gauss(_MEAN_BW[cohort.sex], _BW_SD[cohort.sex]),
                     BODYWEIGHT_MIN_KG), BODYWEIGHT_MAX_KG)
        age = max(SEED_AGE_MIN, int(round(rng.gauss(_AGE_BAND[cohort.age_band], _AGE_SD))))
        state = seed_athlete(f"{cohort.label}-{i}", sex=cohort.sex, age=age,
                             experience=cohort.declared, bodyweight_kg=bw)
        for cap in CLASS_A_CAPABILITIES:
            true_1rm = _true_1rm(cap, cohort.sex, bw, age, cohort.true_exp, rng)
            rec = recommend(state.capabilities[cap], exercise=cap,
                            difficulty_factor=DIFFICULTY, target_reps=TARGET_REPS,
                            rir=DEFAULT_RIR)
            w = rec.recommended_weight
            total += 1
            per_cap_counts[cap][2] += 1
            if w >= true_1rm:                                   # cannot complete one rep
                unliftable += 1
                too_heavy += 1
                per_cap_counts[cap][0] += 1
                per_cap_counts[cap][1] += 1
            else:
                achievable = reps_to_failure(w, true_1rm)
                if achievable < TARGET_REPS:                    # cannot complete the prescription
                    too_heavy += 1
                    per_cap_counts[cap][0] += 1
            ideal_w = load_for_reps(TARGET_REPS + DEFAULT_RIR, true_1rm)
            abs_errs.append(abs((w - ideal_w) / ideal_w) * 100.0)

    per_cap = {c: {"too_heavy_frac": v[0] / v[2] if v[2] else 0.0,
                   "unliftable_frac": v[1] / v[2] if v[2] else 0.0}
               for c, v in per_cap_counts.items()}
    return CellResult(
        label=cohort.label, n_samples=total,
        too_heavy_frac=too_heavy / total if total else 0.0,
        unliftable_frac=unliftable / total if total else 0.0,
        median_abs_err_pct=statistics.median(abs_errs) if abs_errs else 0.0,
        detrained=cohort.detrained, per_capability=per_cap,
    )


def continuity_gate(sex: str = "male") -> dict:
    """§2.1 beginner-continuity (gate (c)): at the calibration bodyweight an UNTRAINED athlete maps,
    through the live seed, within ±CONTINUITY_TOL score of SEED_SCORE['beginner'] for every Class-A
    capability. Deterministic (no population). As-built binding is beginner-median only (DX-08)."""
    bw = CALIBRATION_BW_KG[sex]
    state = seed_athlete("calib", sex=sex, age=30, experience="beginner", bodyweight_kg=bw)
    target = SEED_SCORE["beginner"]
    scores = {cap: state.capabilities[cap].score for cap in CLASS_A_CAPABILITIES}
    max_dev = max(abs(s - target) for s in scores.values())
    return {"sex": sex, "bodyweight_kg": bw, "target": target,
            "scores": scores, "max_abs_dev": max_dev, "passes": max_dev <= CONTINUITY_TOL}


@dataclass
class CoverageReport:
    normal: list  # list[CellResult]
    detrained: list  # list[CellResult]
    continuity: dict

    def gate_a_passes(self) -> bool:    # all normal cells ≤5% too-heavy, 0% unliftable
        return all(r.passes() for r in self.normal)

    def gate_b_passes(self) -> bool:    # both detrained cells (bodyweight-keyed) ≤5% too-heavy, 0% unliftable
        return all(r.passes() for r in self.detrained)

    def gate_c_passes(self) -> bool:    # §2.1 beginner continuity
        return self.continuity["passes"]

    def hard_safety_holds(self) -> bool:  # 0% unliftable on EVERY cell — the catastrophic-safety invariant
        return all(r.unliftable_frac <= UNLIFTABLE_GATE for r in self.normal + self.detrained)

    def all_pass(self) -> bool:
        return self.gate_a_passes() and self.gate_b_passes() and self.gate_c_passes()


def run_coverage(n: int = N_PER_CELL, seed: int = SEED_RNG) -> CoverageReport:
    """Full §5 coverage run. Deterministic given `seed` — each cell uses its own fresh RNG so cells
    are independent and the report is order-stable."""
    normal = [evaluate_cohort(c, n=n, rng=random.Random(seed + i))
              for i, c in enumerate(NORMAL_COHORTS)]
    detrained = [evaluate_cohort(c, n=n, rng=random.Random(seed + 100 + i))
                 for i, c in enumerate(DETRAINED_COHORTS)]
    return CoverageReport(normal=normal, detrained=detrained, continuity=continuity_gate())


def _fmt(report: CoverageReport) -> str:
    lines = []
    lines.append(f"{'cohort cell':<30} {'too-heavy':>10} {'unliftable':>11} {'median|err%|':>13} {'gate':>6}")
    lines.append("-" * 74)
    for r in report.normal:
        lines.append(f"{r.label:<30} {r.too_heavy_frac*100:>9.1f}% {r.unliftable_frac*100:>10.1f}% "
                     f"{r.median_abs_err_pct:>12.1f}% {'PASS' if r.passes() else 'FAIL':>6}")
    lines.append("-- detrained over-claim stress cells (bodyweight-keyed) " + "-" * 18)
    for r in report.detrained:
        lines.append(f"{r.label:<30} {r.too_heavy_frac*100:>9.1f}% {r.unliftable_frac*100:>10.1f}% "
                     f"{r.median_abs_err_pct:>12.1f}% {'PASS' if r.passes() else 'FAIL':>6}")
    c = report.continuity
    lines.append("-" * 74)
    lines.append(f"(c) §2.1 beginner continuity @ {c['bodyweight_kg']}kg {c['sex']}: "
                 f"max|dev|={c['max_abs_dev']:.2f} (tol {CONTINUITY_TOL}) -> "
                 f"{'PASS' if c['passes'] else 'FAIL'}")
    lines.append(f"(a) normal cells gate:    {'PASS' if report.gate_a_passes() else 'FAIL'}")
    lines.append(f"(b) detrained cells gate: {'PASS' if report.gate_b_passes() else 'FAIL'}")
    lines.append(f"hard safety (0% unliftable, every cell): "
                 f"{'HOLDS' if report.hard_safety_holds() else 'VIOLATED'}")
    lines.append(f"\nOVERALL §5 seed-coverage gate (a∧b∧c): "
                 f"{'PASS' if report.all_pass() else 'FAIL'}")
    return "\n".join(lines)


def main() -> None:
    try:                                  # render the §/→ glyphs even on a cp1252 console
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    report = run_coverage()
    print("Option D seed-coverage validation (DX-08 §4 D2 / BB-16/BB-17) — PROVISIONAL table\n")
    print(_fmt(report))


if __name__ == "__main__":
    main()
