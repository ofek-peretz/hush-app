"""
Preference update (ES-007 / ES-010 / ES-009 §6).

DX-10 (sticky preference): an athlete-initiated REPLACE makes the chosen exercise the
slot's PERSISTENT preference (Product Spec Principle 6 / §6 / §13). The chosen family is
SET to PREFERENCE_STICKY and the displaced family demoted to PREFERENCE_DEFAULT_SCORE, so
the chosen exercise is the deterministic, durable argmax of its replacement group going
forward (most-recent-replacement-wins). This is a SET, not a delta — it replaces the
Sprint 3B-1 bounded `nudge` (which could not satisfy the contract: a single ±5 step cannot
overcome historical accumulation, so an explicit choice did not reliably persist).

This is NOT a learning engine — ES-009 §6 fixes THAT preference drives selection; DX-10
fixes only that the selection PERSISTS. No performance signal ever enters here: replacement
is preference-driven, never performance-driven (ES-006).

`nudge` is RETAINED below but INACTIVE in production since DX-10 — kept as a pure tested
helper still registered in sprint4/parameters.py (PREFERENCE_NUDGE).

CONCEPTUAL LOCATION: hush_model/preference.py (model-package root).
"""
from __future__ import annotations

from .constants import (
    PREFERENCE_NUDGE, PREFERENCE_STICKY, PREFERENCE_DEFAULT_SCORE,
    PREFERENCE_SCORE_MIN, PREFERENCE_SCORE_MAX,
)


def apply_sticky(chosen_score: float | None = None) -> float:
    """DX-10: the chosen family on an accepted REPLACE becomes the slot's PERSISTENT
    preference (Product Spec §6). Return the sticky-dominant score the chosen family is
    SET to (not nudged toward) — making it the deterministic, durable argmax of its
    replacement group going forward. Idempotent: re-choosing the same family re-sets the
    same value, so identical evidence cannot ratchet (readiness review SM3). `chosen_score`
    is accepted for symmetry with `nudge` and ignored — stickiness is a SET, not a delta."""
    return PREFERENCE_STICKY


def demote(score: float | None = None) -> float:
    """DX-10: the DISPLACED (replaced-from) family is demoted below the sticky band so the
    most-recently-chosen exercise is the unique argmax (most-recent-replacement-wins).
    Returns the default-unobserved score; idempotent. In the 3B-1 catalog every replacement
    group has exactly two families, so demoting the single displaced family is sufficient;
    a 3+-family slot (Phase 2/3) would generalize this to every non-chosen family."""
    return PREFERENCE_DEFAULT_SCORE


def nudge(score: float, up: bool, step: float = PREFERENCE_NUDGE) -> float:
    """RETAINED but INACTIVE in production since DX-10 (sticky-set replaced the bounded
    nudge). Move a preference_score by one bounded step, clamped to [0, 100].

    up=True  -> the family the athlete moved TOWARD (chosen on REPLACE) rises.
    up=False -> the family the athlete moved AWAY from (rejected / skipped) falls.
    A single event = a single nudge (the caller fires this once per REPLACE, never per
    set), so identical evidence cannot ratchet the score (readiness review SM3)."""
    delta = step if up else -step
    return _clamp(score + delta)


def _clamp(score: float) -> float:
    return max(PREFERENCE_SCORE_MIN, min(PREFERENCE_SCORE_MAX, score))
