"""
Recovery model (ES-011 Part D). Sprint 2.

Recovery is fatigue DECAY — the same exponential family as ES-005.1 evidence decay,
for consistency:

    Fatigue_systemic(t)     = Fatigue_systemic(t0)     · e^{−(t−t0)/τ_sys}
    Fatigue_capability,c(t) = Fatigue_capability,c(t0) · e^{−(t−t0)/τ_cap,c}

Recovery is inferred from TIME and accumulated fatigue only — no subjective inputs
(no readiness/sleep logs; Anti-Requirements, ES-Founder Ch8).

DECISION (accepted): ship FIXED population τ. Per-athlete τ learning (ES-011 D.3,
Assumption A6) is the riskiest learning in the system and is unidentifiable at MVP N;
it is NOT implemented here. τ values are PROVISIONAL/UNVALIDATED (constants.py) and
are a Phase 0 simulation-calibration responsibility.

CONCEPTUAL LOCATION: hush_model/recovery.py (model-package root). Pure; no I/O.
"""
from __future__ import annotations
import math

from .constants import TAU_SYS, TAU_CAP


def decay_fatigue(value: float, elapsed_weeks: float, tau: float) -> float:
    """Fatigue remaining after `elapsed_weeks` of rest, given time-constant τ (weeks)."""
    if elapsed_weeks < 0.0:
        raise ValueError("elapsed_weeks must be non-negative")
    if value <= 0.0:
        return 0.0
    if elapsed_weeks == 0.0:
        return value
    return value * math.exp(-elapsed_weeks / tau)


def estimate_current_fatigue(
    capability: str,
    fatigue_systemic_stored: float,
    fatigue_capability_stored: float,
    last_update_week: float | None,
    now_week: float,
    tau_sys: float = TAU_SYS,
    tau_cap: dict[str, float] | None = None,
) -> tuple[float, float]:
    """Decay stored fatigue forward to `now_week`. Returns (systemic, capability).

    If the capability has never been trained (last_update_week is None) there is no
    fatigue to decay — both components are zero.
    """
    if last_update_week is None:
        return 0.0, 0.0
    elapsed = max(0.0, now_week - last_update_week)
    taus = TAU_CAP if tau_cap is None else tau_cap
    tau_c = taus.get(capability, tau_sys)
    fs = decay_fatigue(fatigue_systemic_stored, elapsed, tau_sys)
    fc = decay_fatigue(fatigue_capability_stored, elapsed, tau_c)
    return fs, fc
