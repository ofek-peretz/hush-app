"""
A7 week-1 seed-safety gate evaluator (BB-11).

The single HARD Phase-1 gate (Validation Architecture §"Gate to Phase 2"): *"no cohort shows unsafe
seeds (A7 passes) … If seeds are unsafe for any cohort, **stop and re-anchor ES-008 v2** before
proceeding."* A7 is tested by **first-session completion and first-rep-failure rates, segmented by
cohort** — cohort coverage matters more than total N (the tails — older, female, detrained — are where
A7 lives), so the gate rules **per cohort**, and one unsafe cohort halts the ramp.

This module is the PURE evaluator: given per-cohort first-session metrics + a threshold config, it
returns a per-cohort verdict and the overall PROCEED / PAUSE-AND-RE-ANCHOR recommendation. It applies
nothing and decides nothing about the model — the only sanctioned response to an unsafe cohort is the
stop-and-re-anchor path (a model review), NEVER a field parameter tweak (KL-9).

✅ THRESHOLDS RATIFIED — OD-8 (V1, 2026-06-12). The product decision ratified the thresholds below as
the authoritative V1 A7 safety gate; the gate is now **ARMED** for a real cohort. They may only change
through a future explicit product decision (never field-tuned, OD-8/KL-9). The values + their ratified
status are surfaced verbatim in the gate output.

Pure / I-O-free / deterministic.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict

# ✅ RATIFIED — OD-8 (V1, 2026-06-12). First-rep failure is the catastrophic seed-safety signal (an
# athlete who cannot complete a single rep at the prescribed day-1 load); completion is the softer
# trust/dropout signal. `min_cohort_n` guards against ruling a cohort on too little data. Change only
# by a future explicit product decision (OD-8).
A7_THRESHOLDS_V1 = {
    "max_first_rep_failure_rate": 0.0,   # any day-1 first-rep failure in a cohort = unsafe seed
    "min_completion_rate": 0.80,         # < 80 % first-session completion in a cohort = unsafe
    "min_cohort_n": 5,                   # below this, the cohort is INSUFFICIENT_DATA, not a verdict
}
A7_THRESHOLDS_STATUS = "RATIFIED — OD-8 (V1, 2026-06-12); armed (change only by future product decision)"

# Back-compat alias (the thresholds are unchanged in value; only their status flipped to ratified).
PROVISIONAL_THRESHOLDS = A7_THRESHOLDS_V1

# verdicts
SAFE = "SAFE"
UNSAFE = "UNSAFE"
INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
# overall recommendations
PROCEED = "PROCEED"
PAUSE_AND_REANCHOR = "PAUSE_AND_REANCHOR"
AWAIT_DATA = "AWAIT_DATA"


@dataclass(frozen=True)
class CohortVerdict:
    cohort: str
    n: int
    completion_rate: float
    first_rep_failure_rate: float
    verdict: str
    reasons: tuple[str, ...]


def evaluate_cohort(cohort: str, metrics: dict, thresholds: dict) -> CohortVerdict:
    """Verdict for one cohort cell. `metrics` = {n, completion_rate, first_rep_failure_rate}."""
    n = int(metrics.get("n", 0))
    comp = float(metrics.get("completion_rate", 0.0))
    frf = float(metrics.get("first_rep_failure_rate", 0.0))
    if n < thresholds["min_cohort_n"]:
        return CohortVerdict(cohort, n, comp, frf, INSUFFICIENT_DATA,
                             (f"n={n} < min_cohort_n={thresholds['min_cohort_n']}",))
    reasons: list[str] = []
    if frf > thresholds["max_first_rep_failure_rate"]:
        reasons.append(f"first_rep_failure_rate {frf:.3f} > {thresholds['max_first_rep_failure_rate']}")
    if comp < thresholds["min_completion_rate"]:
        reasons.append(f"completion_rate {comp:.3f} < {thresholds['min_completion_rate']}")
    return CohortVerdict(cohort, n, comp, frf,
                         UNSAFE if reasons else SAFE, tuple(reasons))


def evaluate_a7_gate(per_cohort: dict, thresholds: dict | None = None) -> dict:
    """Evaluate the A7 week-1 gate over per-cohort first-session metrics.

    Returns the per-cohort verdicts + the overall recommendation:
      * any UNSAFE cohort  → PAUSE_AND_REANCHOR (the hard stop; re-anchor ES-008 v2, never field-tune);
      * else if any cohort SAFE (and none unsafe) → PROCEED;
      * else (only INSUFFICIENT_DATA) → AWAIT_DATA (cannot yet rule — recruit the tails).
    """
    using_default = thresholds is None
    thresholds = thresholds or A7_THRESHOLDS_V1
    verdicts = [evaluate_cohort(c, m, thresholds) for c, m in sorted(per_cohort.items())]
    any_unsafe = any(v.verdict == UNSAFE for v in verdicts)
    any_safe = any(v.verdict == SAFE for v in verdicts)
    if any_unsafe:
        overall = PAUSE_AND_REANCHOR
    elif any_safe:
        overall = PROCEED
    else:
        overall = AWAIT_DATA
    return {
        "gate": "A7_week1_seed_safety",
        "overall": overall,
        "thresholds": dict(thresholds),
        "thresholds_status": A7_THRESHOLDS_STATUS if using_default else "CUSTOM (caller-supplied)",
        "armed": using_default,
        "unsafe_cohorts": tuple(v.cohort for v in verdicts if v.verdict == UNSAFE),
        "cohorts": [asdict(v) for v in verdicts],
    }
