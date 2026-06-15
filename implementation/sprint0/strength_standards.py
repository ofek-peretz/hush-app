"""
Strength-standard table for the Option D bodyweight-keyed cold-start prior (DX-08).

This is the *primary* seed estimator: an untrained-baseline 1RM-to-bodyweight ratio per
(Class-A capability x sex), turned into a per-capability 1RM estimate at onboarding and then
inverted by the model's OWN ``score_of`` (no new math) into a seed score. Experience is a
bounded, capped UPWARD modifier only (<= +20%) -- never the primary axis; bodyweight x sex is
the baseline (founder constraint, DX-08 readiness §0). See
``reviews/CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`` (Option D) and the DX-08 execution
package §3.1.

Pure / I-O-free. The numbers below are PROVISIONAL (illustrative, from spec §2.1) and must be
fit and frozen to a chosen public strength-standard dataset (StrengthLevel/ExRx-class) under
the §2.1 beginner-continuity gate before Option D becomes the live onboarding default
(readiness review D1). Bump STRENGTH_STANDARD_VERSION whenever the ratios/clamps are re-fit.
"""
from __future__ import annotations

from .constants import (
    SEX_MULTIPLIER, AGE_TAPER_PER_YEAR, AGE_TAPER_START, OPTION_D_DOWN_BIAS,
)

STRENGTH_STANDARD_VERSION = "v1-PROVISIONAL"   # versioned; bump when ratios/clamps are re-fit

# Untrained ("beginner") 1RM-to-bodyweight ratios, MALE. Female via SEX_MULTIPLIER (single source).
# PROVISIONAL -- anchored so the median-bodyweight UNTRAINED male maps near SEED_SCORE['beginner']
# (= 30) through score_of (§2.1, beginner-only continuity; see CALIBRATION_BW_KG). Illustrative
# starting point from the Option D spec §2.1; must be fit/frozen to the dataset before sign-off.
BASE_RATIO_MALE = {
    "horizontal_push": 0.75, "horizontal_pull": 0.66, "vertical_push": 0.45,
    "knee_dominant": 1.00,   "hip_dominant": 1.20,
}
# Per-capability plausibility clamp as ratio x bodyweight (floor benign, ceil = hard day-1
# safety ceiling ~ dataset 95th-pct ratio). PROVISIONAL.
CLAMP_RATIO_MALE = {
    "horizontal_push": (0.30, 1.33), "horizontal_pull": (0.26, 1.18), "vertical_push": (0.18, 0.80),
    "knee_dominant": (0.40, 1.76),   "hip_dominant": (0.48, 2.12),
}

# PROVISIONAL calibration anchor: the bodyweight (kg) at which an UNTRAINED (beginner) MALE
# maps, through score_of, to ~SEED_SCORE['beginner'] (30) -- the §2.1 beginner-continuity anchor
# (binding safety interpretation, DX-08 readiness §0/§2). Derived from the PROVISIONAL ratios
# above; refit alongside the table against the chosen dataset's median bodyweight.
CALIBRATION_BW_KG = {"male": 92.0}


def base_ratio(capability: str, sex: str) -> float:
    """Untrained 1RM-to-bodyweight ratio; female = male x SEX_MULTIPLIER (frozen cohort assumption)."""
    r = BASE_RATIO_MALE[capability]
    return r if sex == "male" else r * SEX_MULTIPLIER["female"]


def clamp_kg(capability: str, sex: str, bodyweight_kg: float) -> tuple[float, float]:
    """Per-capability plausibility band in kg (floor, ceil), scaled by bodyweight and sex."""
    lo, hi = CLAMP_RATIO_MALE[capability]
    m = 1.0 if sex == "male" else SEX_MULTIPLIER["female"]
    return lo * m * bodyweight_kg, hi * m * bodyweight_kg


def experience_modifier(experience: str) -> float:
    """Capped, >= 1.0 (never lowers the bodyweight baseline). Advanced is hard-capped at +20%."""
    return {"beginner": 1.00, "intermediate": 1.10, "advanced": 1.20}.get(experience, 1.00)


def age_taper(age: int) -> float:
    """Reuse the model's taper shape; applied HERE, not re-applied by the model."""
    return 1.0 - AGE_TAPER_PER_YEAR * max(0, age - AGE_TAPER_START)


def estimate_1rm(capability: str, sex: str, bodyweight_kg: float, age: int, experience: str) -> float:
    """Bodyweight-anchored 1RM estimate (kg): baseline x exp(<=+20%) x age_taper, shifted down
    by the conservative DOWN_BIAS, then clamped to the per-capability plausibility band."""
    est = bodyweight_kg * base_ratio(capability, sex) * experience_modifier(experience) * age_taper(age)
    est *= (1.0 - OPTION_D_DOWN_BIAS)        # conservative downward bias (dangerous-direction guard)
    lo, hi = clamp_kg(capability, sex, bodyweight_kg)
    return min(max(est, lo), hi)             # per-capability plausibility clamp
