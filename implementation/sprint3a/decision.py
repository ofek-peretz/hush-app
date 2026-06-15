"""
Decision authority (ES-006). Sprint 3A.

THE SINGLE LIVE SOURCE OF TRUTH for the recommendation decision: which decision type
(KEEP / INCREASE / DECREASE / REPLACE / CHANGE_STRATEGY) and which reason code every
recommendation carries. `recommendation.recommend()` consults this module; nothing
else decides.

ES-006 is an ADVISORY governor (DX-03 / M3, completed by DX-20 / M1) over the ES-005.1
score-derived TARGET load: this module COMPUTES which way the load leans and why, but it
does NOT author the load. Post-DX-20 the caller (recommendation.py) emits the score-derived
`target_load` on the rested branch — future programs are built from learned capability — and
uses govern()'s output ONLY for the advisory lean/reason (a session-over-session signal). The
held value govern() returns in its Decision is no longer the emitted load. Progression is the
athlete's logged actual_weight (M1/DX-01) mediated through the score, not a governor step.

  - KEEP_LOAD      (default) hold the last recommended load; do not chase sub-step wiggle.
  - INCREASE_LOAD  ADVISORY "lean up": computed after STABILITY_N consistent positive
                   observations, gated by confidence, while target > held. The emitted load
                   is HELD (the step is not applied); the lean is recorded for advice/audit.
  - DECREASE_LOAD  ADVISORY "lean down" on a consistent-negative run (genuine regression).
                   Emitted load is HELD. Fatigue never reaches here: an elevated-fatigue day
                   is handled upstream as a fatigue_hold, on the fatigue-adjusted surprise.

Single source of truth for load is preserved (Invariant 3): this module NEVER computes
a load from scratch. Post-DX-03 it returns ONLY the held load (strictly more conservative
than the prior held-or-stepped) — no second load formula.

SUPERSEDES the Sprint 2 `fatigue.decision_reason()` pure helper as the live decision
path. That helper remains for its unit tests / as an audit reference, but it is no
longer consulted by the recommendation engine.

CONCEPTUAL LOCATION: hush_model/decision.py (model-package root, sibling of
recommendation.py).
"""
from __future__ import annotations
from dataclasses import dataclass

from .constants import STABILITY_N, DECISION_CONF_GATE, SURPRISE_DEADBAND


# ----------------------------- ES-006 decision types (the allowed V1 set) -----------------------------
KEEP_LOAD = "KEEP_LOAD"
INCREASE_LOAD = "INCREASE_LOAD"
DECREASE_LOAD = "DECREASE_LOAD"
REPLACE_EXERCISE = "REPLACE_EXERCISE"   # Sprint 3A: signal-only (needs ES-002 catalog, 3B)
CHANGE_STRATEGY = "CHANGE_STRATEGY"     # signal-only (licensed only by ES-013 investigation)


# ----------------------------- reason codes (one vocabulary) -----------------------------
# Legacy reasons are preserved VERBATIM so the Sprint 0-2 strings that downstream tests
# and the audit log assert remain bit-identical.
REASON_WORKING_SET_SEED = "working_set:target+RIR,discounted,floored"  # cold start (no memory)
REASON_FATIGUE_HOLD_REPS = "fatigue_hold:reps_reduced,load_held"       # ES-011 B.2
REASON_FATIGUE_HOLD_WEIGHT = "fatigue_hold:weight_reduced"             # ES-011 B.2

# New governed reasons (ES-006).
REASON_KEEP_DEFAULT = "keep_load:default"
REASON_LOW_CONFIDENCE_HOLD = "keep_load:low_confidence"
REASON_EVIDENCE_CONFLICT_HOLD = "keep_load:evidence_conflict"
REASON_CONSISTENT_POSITIVE = "increase_load:consistent_positive_evidence"
REASON_UNEXPLAINED_REGRESSION = "decrease_load:unexplained_regression"
# Sprint 3B-1: L2 REPLACE_EXERCISE (preference-driven, NEVER performance-driven).
REASON_REPLACE_PREFERENCE = "replace_exercise:preference_driven"
# Sprint 6 (M5 / DX-09): CHANGE_STRATEGY surfacing for stagnation/imbalance. ADVISORY only —
# the recommendation is surfaced at the weekly review and NEVER applied (Product Spec §13).
# CHANGE_STRATEGY remains signal-only; these are the reasons the stagnation engine attaches.
REASON_STAGNATION_STALLED = "change_strategy:stagnation_stalled"
REASON_STAGNATION_REGRESSING = "change_strategy:stagnation_regressing"
REASON_STAGNATION_IMBALANCE = "change_strategy:imbalance_relative_weakness"


@dataclass(frozen=True)
class Decision:
    """The chosen ES-006 decision: its type, its reason, and the load to emit. DX-03 (M3):
    the type is ADVISORY and `recommended_weight` is always the HELD load (the governor step
    is no longer applied); the advised direction lives in the Recommendation's `target_load`."""
    decision_type: str
    reason: str
    recommended_weight: float


# ----------------------------- stability guard (ES-006 "2-3 consistent observations") -----------------------------

def update_streaks(
    consecutive_positive: int,
    consecutive_negative: int,
    surprise_value: float,
    deadband: float = SURPRISE_DEADBAND,
) -> tuple[int, int]:
    """Advance the consistent-evidence run on the SIGN of the (fatigue-adjusted) surprise.

    surprise = S_obs_clean - score_before (the fatigue-removed signal; see
    recommendation/pipeline). |surprise| < deadband is neutral and BREAKS any run, so a
    change requires STABILITY_N genuinely consistent observations.

    Sprint 3A decision granularity is BLOCK-level: call this ONCE per block /
    recommendation cycle (not per set). 3A blocks are single-set, so one call per block;
    Sprint 3B (multi-set blocks) must relocate the call to block completion.
    """
    if surprise_value > deadband:
        return consecutive_positive + 1, 0
    if surprise_value < -deadband:
        return 0, consecutive_negative + 1
    return 0, 0  # neutral: prediction ~ reality, not evidence for a change


# ----------------------------- the governor (rested path; fatigue handled upstream) -----------------------------

def govern(
    held_load: float,
    target_load: float,
    confidence: float,
    consecutive_positive: int,
    consecutive_negative: int,
    equipment_step: float,
    stability_n: int = STABILITY_N,
    conf_gate: float = DECISION_CONF_GATE,
) -> Decision:
    """Choose the ES-006 ADVISORY decision when decision memory exists (rested path).

    Branch order (safety-first; first match wins — ES-006 Safety Rules):
      1. low confidence            -> KEEP (low_confidence_hold); no change at low confidence.
      2. consistent positive run   -> INCREASE (advisory lean up; only if target > held).
      3. consistent negative run   -> DECREASE (advisory lean down; only if target < held).
      4. otherwise / conflict      -> KEEP (default).

    DX-03 (M3) / DX-20 (M1): the governor is ADVISORY. It still COMPUTES the decision_type +
    reason (and decision memory still records them; see pipeline._record_block_decision), but
    it does NOT author the load. This function still returns the `held_load` in its Decision,
    but post-DX-20 the caller (recommendation.py) IGNORES it for the rested emitted load and
    emits the score-derived `target_load` instead — future programs are built from learned
    capability. govern()'s output drives only the advisory lean/reason. Was (Sprint 3A):
    INCREASE/DECREASE returned min/max(held +/- equipment_step, target_load). `equipment_step`
    is retained in the signature (caller binding in recommendation.py + the pure unit tests)
    though the body no longer steps with it.

    The confidence GATE still governs whether the advisory lean is computed at all; it is
    distinct from the ES-005.1 safety_discount (which scales the target magnitude).
    """
    if confidence < conf_gate:
        return Decision(KEEP_LOAD, REASON_LOW_CONFIDENCE_HOLD, held_load)

    if consecutive_positive >= stability_n and target_load > held_load:
        return Decision(INCREASE_LOAD, REASON_CONSISTENT_POSITIVE, held_load)

    if consecutive_negative >= stability_n and target_load < held_load:
        return Decision(DECREASE_LOAD, REASON_UNEXPLAINED_REGRESSION, held_load)

    return Decision(KEEP_LOAD, REASON_KEEP_DEFAULT, held_load)
