"""
Volume Composition Engine (ES-009.1). Sprint 3B-2.

Decides HOW MUCH work each capability receives: slots-per-capability-per-session
(Lever 1) and sets-per-slot (Lever 2). ES-009 decides WHAT; ES-009.1 decides HOW MUCH.
Load and reps remain ES-006's. This module is the SOLE owner of `target_sets` and the
sole consumer of `StrategyState.weekly_volume`.

Runs INSIDE the ES-009 pipeline (between Stage 2 priority and Stage 3 selection): it
declares how many slots each capability needs; ES-009 then fills those slots. ES-009.1
never picks exercises.

KNOWN V1 LIMITATION (ratified Q3 — accept & document): under Class-A-only coverage,
`times_trained` collapses to 1 for once-per-week capabilities (all caps at frequency 2;
several at frequency 3), so `per_session = weekly_sets` saturates the 2x4 lever ceiling
and low/moderate/high become indistinguishable for those capabilities. This is a
consequence of the Class-A restriction collapsing times_trained, NOT an ES-009.1 defect;
the 8/12/18 bands and the 1-2 / 2-4 clamps ship UNCHANGED. Distinctness survives for
twice-trained capabilities and via the focus multiplier. Revisit when Class-B/C activate
or in Phase-0 band calibration.

CONCEPTUAL LOCATION: hush_model/volume.py (model-package root, sibling of composition.py).
"""
from __future__ import annotations
import math

from .constants import (
    VOLUME_BAND_SETS, FOCUS_PRIMARY_MULTIPLIER, FOCUS_SECONDARY_MULTIPLIER,
    FOCUS_OTHER_MULTIPLIER, SLOTS_MIN, SLOTS_MAX, SETS_PER_SLOT_MIN, SETS_PER_SLOT_MAX,
    SETS_PER_SLOT_BASELINE, CALIBRATION_SLOTS_PER_CAPABILITY, CALIBRATION_SETS_PER_SLOT,
    TEMPLATES_CLASS_A, TEMPLATE_FREQUENCIES, WEEKLY_VOLUME_BANDS,
)


def next_volume_band(weekly_volume: str) -> str | None:
    """M5 / DX-09 (Product Spec §13): the next volume band UP within the established bands
    (low -> moderate -> high). Returns None at the top band (no option) or for an unknown band.
    This is the ONLY program change the spec permits, and only on the athlete's explicit
    acceptance — this helper merely names the option; it applies nothing."""
    if weekly_volume not in WEEKLY_VOLUME_BANDS:
        return None
    i = WEEKLY_VOLUME_BANDS.index(weekly_volume)
    return WEEKLY_VOLUME_BANDS[i + 1] if i + 1 < len(WEEKLY_VOLUME_BANDS) else None


def clamp_frequency(weekly_frequency: int) -> int:
    """ES-009 §4: frequencies outside {2,3,4} clamp to the nearest defined template."""
    lo, hi = min(TEMPLATE_FREQUENCIES), max(TEMPLATE_FREQUENCIES)
    return min(max(int(weekly_frequency), lo), hi)


def times_trained(weekly_frequency: int) -> dict[str, int]:
    """How many sessions/week include each capability, from the Class-A-RESTRICTED template
    (ES-009.1 §2). This is what the two-lever math divides the weekly budget by — it MUST be
    the restricted count, not the 7-cap one (R-VD)."""
    counts: dict[str, int] = {}
    for session in TEMPLATES_CLASS_A[clamp_frequency(weekly_frequency)]:
        for cap in session:
            counts[cap] = counts.get(cap, 0) + 1
    return counts


def focus_multiplier(capability: str, primary_focus, secondary_focus) -> float:
    """ES-009.1 §3: ×1.25 primary, ×1.00 secondary, ×0.75 otherwise."""
    if primary_focus is not None and capability == primary_focus:
        return FOCUS_PRIMARY_MULTIPLIER
    if secondary_focus is not None and capability == secondary_focus:
        return FOCUS_SECONDARY_MULTIPLIER
    return FOCUS_OTHER_MULTIPLIER


def _round_half_up(x: float) -> int:
    # Conventional round-half-up (deterministic; avoids Python's banker's rounding so the
    # hand-verified allocation tables reproduce exactly).
    return math.floor(x + 0.5)


def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def allocate(
    capability: str,
    weekly_volume: str,
    times: int,
    calibrating: bool,
    primary_focus=None,
    secondary_focus=None,
) -> tuple[int, int]:
    """ES-009.1 §2/§3/§5: return (slots_per_session, sets_per_slot) for one capability.

    Calibration restraint (§5): a fixed 1 slot × 2 sets, regardless of band — calibration
    seeks information gain, not stimulus. Full bands activate only post-calibration.
    """
    if calibrating:
        return CALIBRATION_SLOTS_PER_CAPABILITY, CALIBRATION_SETS_PER_SLOT

    if weekly_volume not in VOLUME_BAND_SETS:
        # HD5: weekly_volume carries an enum contract on a TEXT column; a value outside the
        # band set is corrupt data, not a normal path — fail loudly rather than silently
        # mis-allocate. (3B-1 validates the enum at write; default-on-absence is 'moderate'.)
        raise ValueError(
            f"weekly_volume {weekly_volume!r} is not one of {tuple(VOLUME_BAND_SETS)}"
        )

    weekly = VOLUME_BAND_SETS[weekly_volume] * focus_multiplier(
        capability, primary_focus, secondary_focus
    )
    per_session = weekly / max(1, times)
    slots = _clamp_int(
        _round_half_up(per_session / SETS_PER_SLOT_BASELINE), SLOTS_MIN, SLOTS_MAX
    )
    sets = _clamp_int(
        _round_half_up(per_session / slots), SETS_PER_SLOT_MIN, SETS_PER_SLOT_MAX
    )
    return slots, sets
