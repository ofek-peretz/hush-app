"""
Evidence Engine (ES-004 / ES-010 Part A).

Observation -> Evidence, with multi-capability attribution done in LOAD space
(ES-010 resolution of Contradiction 1 & 2):

  for each mapped capability c with contribution weight w_c:
      effective_load_c = actual_weight * w_c
      RM1_obs_c        = effective_load_c * (1 + actual_reps/30)     [Epley inverse]
      S_obs_c          = ln(RM1_obs_c / A_c) / k                     [c's own anchor]
      quality          = (prediction_confidence/100) * error_class_weight(|err|)
      w_i              = decay(age) * quality * w_c

The rep error is never split. Each capability converts against its OWN anchor.
One Evidence row per (observation, capability) pair (ES-010 A.5, no double count).

Sprint 0 exercises single-capability attribution (w_c = 1.0). The function accepts
a mapping so multi-capability exercises work unchanged.

Sprint 2 (ES-011 C.3) inserts fatigue removal IN REP SPACE, before the ES-005.1
conversion and therefore before this attribution. The `est_fatigue` argument is the
total fatigue (systemic + capability) acting on the observation; it defaults to 0.0,
which makes the rested path bit-identical to Sprint 0/1 (defatigue_reps is the
identity at zero fatigue). This is the deliberate ES-010 Part-A ordering amendment.
"""
from __future__ import annotations

from .domain import Observation, Evidence
from .capability.epley import rm1_from
from .capability.reference_strength import score_of
from .capability.decay import decay
from .constants import error_class_weight
from .fatigue import defatigue_reps


def observation_to_evidence(
    obs: Observation,
    contribution_weights: dict[str, float],
    prediction_confidence: float,
    now_week: float,
    est_fatigue: float = 0.0,
) -> list[Evidence]:
    """Attribute one observation to one or more capabilities. Load-space split.

    ES-011 C.3 ordering: de-fatigue the reps FIRST (rep space), then convert and split.
    The de-fatigued reps feed all mapped capabilities (de-fatiguing per-capability
    after the split would require re-deriving fatigue in each capability's score space
    after mixing — forbidden by C.3).
    """
    quality = (prediction_confidence / 100.0) * error_class_weight(
        abs(obs.prediction_error)
    )
    age = max(0.0, now_week - obs.week)
    d = decay(age)

    reps_clean = defatigue_reps(obs.actual_reps, est_fatigue)   # rep space, pre-conversion

    evidence: list[Evidence] = []
    for capability, w_c in contribution_weights.items():
        effective_load = obs.actual_weight * w_c
        rm1_obs = rm1_from(effective_load, reps_clean)
        s_obs = score_of(capability, rm1_obs)
        evidence.append(
            Evidence(
                athlete_id=obs.athlete_id,
                capability=capability,
                s_obs=s_obs,
                quality=quality,
                weight=d * quality * w_c,
                source_week=obs.week,
            )
        )
    return evidence
