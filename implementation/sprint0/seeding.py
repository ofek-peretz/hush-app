"""
Cold-start seeding (ES-008 v2 sec 4-5).

Seed score is cohort-INDEPENDENT (by experience). The cohort multiplier is applied
to the prior in REFERENCE-STRENGTH space, then mapped back to a seed score, so the
seed kg is cohort-appropriate while the stored score remains on the shared scale.
Observations override the prior within a handful of sets.

Confidence always starts at SEED_CONFIDENCE (10), regardless of score. That
confidence corresponds to a nonzero prior precision (sum_w), so the seed acts as a
genuine prior in the precision-weighted blend rather than being discarded by the
first observation. The prior precision is the inverse of the confidence formula at
the seed floor:  10 = 100*(1 - e^(-sum_w/K))  =>  sum_w = -K * ln(0.9).
"""
from __future__ import annotations
import math

from .constants import (
    SEED_SCORE, SEED_CONFIDENCE, CONFIDENCE_K,
    CLASS_A_CAPABILITIES, cohort_multiplier,
    PRIOR_CONF, BODYWEIGHT_MIN_KG, BODYWEIGHT_MAX_KG, SEED_AGE_MIN,
)
from .domain import AthleteState, CapabilityState
from .capability.reference_strength import reference_strength, score_of
from .strength_standards import estimate_1rm

# precision implied by the seed confidence floor (so the prior participates in blend)
SEED_PRIOR_SUM_W: float = -CONFIDENCE_K * math.log(1.0 - SEED_CONFIDENCE / 100.0)

# DX-08 Option D: precision implied by the capped bodyweight-prior confidence (= 2.301 at conf 25)
OPTION_D_PRIOR_SUM_W: float = -CONFIDENCE_K * math.log(1.0 - PRIOR_CONF / 100.0)


def seed_capability_score(capability: str, experience: str, sex: str, age: int) -> float:
    """Cohort-adjusted seed score: multiply the prior RM1, map back to score space."""
    base_score = SEED_SCORE[experience]
    base_rm1 = reference_strength(capability, base_score)
    adjusted_rm1 = base_rm1 * cohort_multiplier(sex, age)
    return score_of(capability, adjusted_rm1)


def _bodyweight_valid(bodyweight_kg: float | None) -> bool:
    """Option D fires only on a present, plausible bodyweight; else the 3-bucket fallback."""
    return bodyweight_kg is not None and BODYWEIGHT_MIN_KG <= bodyweight_kg <= BODYWEIGHT_MAX_KG


def seed_capability_prior_bw(capability: str, sex: str, bodyweight_kg: float,
                             age: int, experience: str) -> tuple[float, float, float]:
    """Option D bodyweight prior: bodyweight x sex baseline -> 1RM (strength_standards) ->
    the model's OWN score_of -> (score, conf 25, sum_w 2.30). Sex and age are encoded in the
    table/taper, so cohort_multiplier is intentionally NOT applied here (no double-count)."""
    rm1 = estimate_1rm(capability, sex, bodyweight_kg, max(age, SEED_AGE_MIN), experience)
    return score_of(capability, rm1), PRIOR_CONF, OPTION_D_PRIOR_SUM_W


def seed_athlete(athlete_id: str, sex: str, age: int, experience: str,
                 bodyweight_kg: float | None = None) -> AthleteState:
    use_option_d = _bodyweight_valid(bodyweight_kg)
    caps: dict[str, CapabilityState] = {}
    for capability in CLASS_A_CAPABILITIES:
        if use_option_d:
            score, conf, sum_w = seed_capability_prior_bw(
                capability, sex, bodyweight_kg, age, experience)
        else:  # FALLBACK -- bit-for-bit the pre-DX-08 3-bucket seed (conf 10)
            score, conf, sum_w = (
                seed_capability_score(capability, experience, sex, age),
                SEED_CONFIDENCE, SEED_PRIOR_SUM_W,
            )
        caps[capability] = CapabilityState(
            capability=capability, score=score, confidence=conf, sum_w=sum_w,
        )
    return AthleteState(
        athlete_id=athlete_id, sex=sex, age=age,
        experience=experience, capabilities=caps, bodyweight_kg=bodyweight_kg,
    )
