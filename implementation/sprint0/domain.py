"""
Core domain objects for the Hush learning loop.

These mirror the frozen entity definitions:
  - CapabilityState, AthleteState: ES-Founder Ch2 / ES-007 (mutable projection)
  - Observation, Evidence, Recommendation: ES-001 / ES-004 / ES-006 / ES-010 (immutable history)

State objects are mutable (the projection decisions read from).
History objects are frozen (append-only, never edited).
"""
from __future__ import annotations
from dataclasses import dataclass, field

from .constants import (
    MODEL_VERSION, CAPABILITY_MODEL_VERSION,
    CLASS_A_CAPABILITIES, CALIBRATION_CONFIDENCE_THRESHOLD,
    STRATEGY_DEFAULT_FREQUENCY, STRATEGY_DEFAULT_VOLUME,
    STRATEGY_DEFAULT_PRIMARY_FOCUS, STRATEGY_DEFAULT_SECONDARY_FOCUS,
    PREFERENCE_DEFAULT_SCORE,
)


# ----------------------------- mutable state -----------------------------

@dataclass
class CapabilityState:
    """One of seven durable capability estimates. Mutable projection (ES-007)."""
    capability: str
    score: float           # 0-100 latent (ES-008 v2); never shown to athlete
    confidence: float      # 0-100, derived from sum_w (ES-005.1 sec 6)
    sum_w: float = 0.0      # precision accumulator (materialized, O(1) updates)
    last_trained_at_week: float | None = None
    # --- Sprint 2 (ES-011): per-capability fatigue (score units, transient) ---
    fatigue: float = 0.0
    # --- Sprint 2 (ES-010 Part C): decay-weighted recent-evidence variance moments ---
    # (var_w = Σw, var_ws = Σw·S, var_ws2 = Σw·S²) — O(1) recent variance for the
    # agreement factor. Default 0 => cold start => agreement 1.0 (no suppression).
    var_w: float = 0.0
    var_ws: float = 0.0
    var_ws2: float = 0.0
    # --- Sprint 3A (ES-006): decision memory + stability-guard streaks (projected) ---
    # Inert defaults (None / 0) make the governor fall through to the exact ES-005.1
    # working-set load (rested-path identity). Only the governed pipeline path writes
    # these, so every Sprint 0-2 caller leaves them at default and is unchanged.
    last_recommended_weight: float | None = None  # held load the governor steps from
    last_decision: str | None = None              # last KEEP/INCREASE/DECREASE
    consecutive_positive: int = 0                 # run of positive (surprise) observations
    consecutive_negative: int = 0                 # run of negative observations
    last_decision_week: float | None = None       # audit / cooldown


@dataclass
class StrategyState:
    """L3/L4 strategy projection (ES-008 v2 fields; ES-009/009.1 consumers).

    weekly_volume is an ENUM band (low|moderate|high) — ES-009.1 §1 deprecates the
    string form. Sprint 3B-1 STORES these (seeded at onboarding); the ES-009/009.1
    consumers that read weekly_volume/frequency/focus arrive in Sprint 3B-2. Mutable
    projection; written only by StateRepository.
    """
    athlete_id: str
    weekly_frequency: int = STRATEGY_DEFAULT_FREQUENCY
    weekly_volume: str = STRATEGY_DEFAULT_VOLUME
    primary_focus: str | None = STRATEGY_DEFAULT_PRIMARY_FOCUS
    secondary_focus: str | None = STRATEGY_DEFAULT_SECONDARY_FOCUS


def default_strategy_state(athlete_id: str) -> StrategyState:
    """THE single source of truth for StrategyState defaults (ratified condition).

    Used by BOTH onboarding seeding and default-on-absence (a migrated, row-less
    athlete). Routing both through this one factory is what guarantees a migrated
    athlete and a freshly-seeded athlete cannot diverge (readiness review MR3)."""
    return StrategyState(athlete_id=athlete_id)


@dataclass
class PreferenceState:
    """Per-(athlete, exercise_family) learned preference (ES-007/010, ES-009 §6).

    preference_score defaults to 50 when unobserved (ES-009 §6). Sprint 3B-1 moves it
    only by a single bounded behaviour-driven nudge on REPLACE/skip (no learning curve
    — ratified minimal slice). Mutable projection; written only by StateRepository."""
    athlete_id: str
    exercise_family: str
    preference_score: float = PREFERENCE_DEFAULT_SCORE


@dataclass
class AthleteState:
    """Athlete-level mutable state."""
    athlete_id: str
    sex: str
    age: int
    experience: str
    capabilities: dict[str, CapabilityState] = field(default_factory=dict)
    # --- DX-07: onboarding bodyweight (kg). Captured, INERT until Option D (DX-08). ---
    bodyweight_kg: float | None = None
    # --- Sprint 2 (ES-011 A.3): systemic fatigue (one scalar, score units) ---
    fatigue_systemic: float = 0.0
    last_workout_at_week: float | None = None
    # --- Sprint 3B-1: strategy + preference projections (default-on-absence) ---
    # strategy defaults via default_strategy_state at load if no row exists; preferences
    # is keyed by exercise_family and is empty until a behaviour nudge writes a row
    # (an absent family reads as PREFERENCE_DEFAULT_SCORE — ES-009 §6).
    strategy: StrategyState | None = None
    preferences: dict[str, PreferenceState] = field(default_factory=dict)
    # --- Program Ownership Contract: athlete-pinned exercises (capability -> exercise_id).
    # The current projection of the append-only preference_event log. An athlete's explicit
    # exercise choice is OWNED: when a capability is pinned, selection MUST use that exercise
    # (higher priority than the model, INCLUDING during calibration). Empty => no pins => the
    # model's selection path is byte-identical to before (default keeps every prior caller/test
    # unchanged). Written by no one here — it is loaded from the event-log projection.
    pinned_exercises: dict[str, str] = field(default_factory=dict)
    # --- Program Ownership Contract: athlete-owned exercise ORDER within a workout (a flat list
    # of exercise ids, the projection of the append-only log). Composition reorders the composed
    # blocks to honor this (athlete order > model Stage-4 order). Empty => model order (default
    # keeps every prior caller/test byte-identical).
    exercise_order: list[str] = field(default_factory=list)

    def pinned_exercise(self, capability: str) -> str | None:
        """The athlete's owned exercise for a capability's primary slot, or None (model picks)."""
        return self.pinned_exercises.get(capability)

    def global_confidence(self) -> float:
        """ES-009 §5: mean of the five Class-A capability confidences (ratified).

        Iterates the FIXED Class-A set, not 'capabilities present', so a partially
        populated athlete cannot inflate the mean (readiness review SM4)."""
        confs = [
            self.capabilities[c].confidence
            for c in CLASS_A_CAPABILITIES
            if c in self.capabilities
        ]
        return sum(confs) / len(confs) if confs else 0.0

    def calibration_phase(self) -> bool:
        """ES-009 §5: calibrating while global_confidence < 70. Derived, never stored."""
        return self.global_confidence() < CALIBRATION_CONFIDENCE_THRESHOLD

    def preference_score(self, exercise_family: str) -> float:
        """ES-009 §6: a family's preference, defaulting to 50 when unobserved."""
        ps = self.preferences.get(exercise_family)
        return ps.preference_score if ps is not None else PREFERENCE_DEFAULT_SCORE


# ----------------------------- immutable history -----------------------------

@dataclass(frozen=True)
class Recommendation:
    """An emitted recommendation. Immutable history (ES-006)."""
    athlete_id: str
    capability: str
    exercise: str
    difficulty_factor: float
    recommended_weight: float
    target_reps: int
    predicted_reps_to_failure: float
    prediction_confidence: float
    decision_reason: str
    model_version: str = MODEL_VERSION
    capability_model_version: str = CAPABILITY_MODEL_VERSION
    # --- Sprint 2 (ES-011 E.1): fatigue/recovery state assumed by this recommendation ---
    est_fatigue_systemic: float = 0.0
    est_fatigue_capability: float = 0.0
    # --- Sprint 3A (ES-006): the named decision + the ungoverned ES-005.1 target ---
    # decision_type is the ES-006 decision; target_load is the score-derived load the
    # governor was steering toward (emitted == target on the cold-start path). Together
    # they answer the audit question "why didn't the load move?" (Invariant 7).
    decision_type: str = "KEEP_LOAD"
    target_load: float = 0.0
    # --- Sprint 3B-1 (ES-006 L2 / ES-009 §6): REPLACE_EXERCISE audit ---
    # When this recommendation is for an exercise chosen by a live REPLACE, these record
    # what it replaced and why (preference/equipment/skip — never performance), so the
    # swap is reconstructable (Invariant 7). None/'' on the normal (non-replaced) path.
    replaced_from_exercise: str | None = None
    replace_reason: str = ""


@dataclass(frozen=True)
class Observation:
    """A completed set, interpreted. Immutable history (ES-001/004)."""
    athlete_id: str
    capability: str
    exercise: str
    difficulty_factor: float
    actual_weight: float
    actual_reps: int
    predicted_reps_to_failure: float
    prediction_error: float       # actual - predicted (metrics-only; ES-010 A.5)
    week: float
    # --- Sprint 2 (ES-011 C): estimated fatigue removed before conversion (audit) ---
    est_fatigue: float = 0.0      # total (systemic + capability) at observation time


@dataclass(frozen=True)
class Evidence:
    """Per-capability evidence derived from an observation. Immutable (ES-010)."""
    athlete_id: str
    capability: str
    s_obs: float                  # observed capability score (this capability's anchor)
    quality: float                # (pred_conf/100) * error_class_weight (ES-005.1 sec5)
    weight: float                 # decay * quality * contribution_weight (w_i)
    source_week: float
    model_version: str = MODEL_VERSION
    capability_model_version: str = CAPABILITY_MODEL_VERSION
    # --- Sprint 2 (ES-010 Part C): agreement factor applied to this evidence (audit) ---
    agreement: float = 1.0
