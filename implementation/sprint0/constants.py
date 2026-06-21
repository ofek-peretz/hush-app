"""
Frozen model constants. Single source of truth, imported everywhere.

Every value here traces to a frozen specification:
  - k, A_c, seeds, cohort multipliers: ES-008 v2
  - ReferenceStrength form, Epley, decay half-life: ES-005.1
  - confidence saturation, blend: ES-005.1 sections 5-6

DO NOT edit these to "tune" behavior in code. They are the model.
"""
from __future__ import annotations
import math

MODEL_VERSION = "v1.0.0"
CAPABILITY_MODEL_VERSION = "es008v2"

# --- ES-005.1: shared growth constant across all Class-A capabilities (ES-008 v2) ---
K_GROWTH: float = 0.016227

# --- ES-008 v2: per-capability anchor A_c, fitted so score 64 -> trained-intermediate landmark ---
# ReferenceStrength_c(S) = A_c * e^(K_GROWTH * S);  S=64 reproduces the landmark kg.
_LANDMARK_AT_64 = {
    "horizontal_push": 113.0,
    "horizontal_pull": 100.0,
    "vertical_push": 68.0,
    "knee_dominant": 150.0,
    "hip_dominant": 180.0,
}
A_C: dict[str, float] = {
    cap: landmark / math.exp(K_GROWTH * 64.0)
    for cap, landmark in _LANDMARK_AT_64.items()
}

CLASS_A_CAPABILITIES: tuple[str, ...] = tuple(A_C.keys())

# --- ES-008 v2: seed scores by experience (cohort-independent; kg derived per cohort) ---
SEED_SCORE = {
    "beginner": 30.0,
    "intermediate": 48.0,
    "advanced": 64.0,
}
SEED_CONFIDENCE: float = 10.0  # seed floor, regardless of score (ES-008 v2)

# --- ES-008 v2 / ES-005.1 sec 8: cohort multiplier applied to the PRIOR seed only ---
SEX_MULTIPLIER = {"male": 1.00, "female": 0.62}
AGE_TAPER_PER_YEAR: float = 0.005  # -0.5%/yr past 30
AGE_TAPER_START: int = 30

# --- DX-08 Option D seeding (bodyweight-keyed cold-start prior) ---
# !!! PROVISIONAL / UNVALIDATED PARAMETERS !!!
# These five scalars parameterize the bodyweight×sex strength-standard prior
# (CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md, Option D; DX-08 execution package §3.2).
# Like kappa/tau, none has an external anchor frozen yet: PRIOR_CONF/DOWN_BIAS are
# Phase-0 calibratable and the table ratios/clamps (strength_standards.py) must be fit and
# frozen to a chosen public dataset under the §2.1 beginner-continuity gate before Option D
# becomes the LIVE onboarding default (readiness review D1/D2). The 3-bucket seed remains the
# no-bodyweight fallback, so absent these firing the trajectories are bit-for-bit unchanged.
PRIOR_CONF: float = 25.0          # capped seed confidence for a bodyweight prior (vs SEED_CONFIDENCE 10)
OPTION_D_DOWN_BIAS: float = 0.06  # fractional downward shift on the 1RM estimate (~0.4 residual-SD)
BODYWEIGHT_MIN_KG: float = 35.0   # validation range; out-of-range -> 3-bucket fallback
BODYWEIGHT_MAX_KG: float = 250.0
SEED_AGE_MIN: int = 14            # age clamp for the taper
# PRIOR_CONF (25) sits BELOW DECISION_CONF_GATE (30): the seed informs the starting load but
# the governor stays inert until the athlete's own data lifts confidence past the gate
# (corroboration-gated progression — spec §3.3). The seed never authorizes progression by itself.

# --- ES-005.1: evidence decay. 0.1 = 0.5^(78/half_life) => half_life ~ 23.48 weeks ---
DECAY_HALF_LIFE_WEEKS: float = 78.0 * math.log(0.5) / math.log(0.1)

# --- ES-005.1 sec 6: capability confidence saturation; ~8 effective obs -> ~63% ---
CONFIDENCE_K: float = 8.0

# --- ES-005.1 sec 5: error-class weights for evidence quality ---
def error_class_weight(abs_error: float) -> float:
    """|err| <= 1 -> 1.0 (excellent), <= 3 -> 0.6 (acceptable), else 0.3 (poor)."""
    if abs_error <= 1.0:
        return 1.0
    if abs_error <= 3.0:
        return 0.6
    return 0.3

# --- ES-005.1 sec 7: conservative safety discount (confidence-scaled) ---
SAFETY_DISCOUNT_MAX: float = 0.12  # at confidence 0 -> x0.88

# --- ES-005.1 sec 2: Epley constant ---
EPLEY_DIVISOR: float = 30.0

# --- ES-006 / ES-009.1: recommendation defaults ---
DEFAULT_RIR: float = 3.0          # reps-in-reserve for working sets
PLATE_INCREMENT_KG: float = 2.5   # round-down granularity (ES-005.1 sec 13)


def cohort_multiplier(sex: str, age: int) -> float:
    """ES-008 v2 sec 5: m(sex, age) = m_sex * (1 - 0.005 * max(0, age-30))."""
    m_sex = SEX_MULTIPLIER[sex]
    taper = 1.0 - AGE_TAPER_PER_YEAR * max(0, age - AGE_TAPER_START)
    return m_sex * taper


# =====================================================================
# Sprint 2 additions — ES-011 (Fatigue & Recovery) + ES-010 Part C
# =====================================================================
#
# !!! PROVISIONAL / UNVALIDATED PARAMETERS !!!
# Unlike A_c / k (anchored by ES-008 v2 landmarks), the fatigue scaling kappa,
# the recovery time-constants tau, and the variance reference sigma^2_ref have
# NO external anchor (ES-011 closing note). Until calibrated against trial data
# the entire fatigue/variance correction is DIRECTIONAL, not calibrated.
#
# These defaults exist only so the engine runs and is testable. Calibrating them
# is a Phase 0 SIMULATION responsibility (Validation Architecture, Build Plan §10),
# NOT a Sprint 2 task. Do not "tune" them here to make a scenario look good.

# --- ES-011 A.4: set -> fatigue generation (score units) ---
KAPPA: float = 0.05                 # PROVISIONAL global set->fatigue scaling
RIR_REFERENCE: float = 5.0          # PROVISIONAL reps-in-reserve reference (proximity)
EXERCISE_COST_DEFAULT: float = 1.0  # PROVISIONAL catalog cost (ES-002 catalog: deferred)

# --- ES-011 Part D: recovery = fatigue decay. FIXED population tau ONLY ---
# Decision (accepted): ship fixed population tau; do NOT enable per-athlete tau
# learning (ES-011 D.3, Assumption A6). Time-constants are in WEEKS (loop time unit).
TAU_SYS: float = 1.0                # PROVISIONAL systemic time-constant (weeks)
TAU_CAP: dict[str, float] = {       # PROVISIONAL per-capability (large muscle = slower)
    "horizontal_push": 0.6,
    "horizontal_pull": 0.6,
    "vertical_push": 0.5,
    "knee_dominant": 0.9,
    "hip_dominant": 0.9,
}

# --- ES-011 §4 amendment / Decision 3: effort_offset = 0 for the MVP ---
# A5 (effort/fatigue separability) is untestable without RIR (Anti-Requirement),
# so fatigue is the SOLE observation correction; the stable effort floor is 0.
# Every fatigue/effort conclusion must be flagged un-separated (Invariant 7).
EFFORT_OFFSET: float = 0.0

# --- ES-011 B.2/B.3: fatigue-aware recommendation gating ---
FATIGUE_ELEVATED_SCORE: float = 2.0    # PROVISIONAL: above this, INCREASE is vetoed
SURPRISE_REGRESSION_SCORE: float = 2.0 # PROVISIONAL: surprise below -this => real regression
MIN_EFFECTIVE_REPS: int = 5            # PROVISIONAL: below this, reduce weight not reps

# --- ES-010 Part C: variance-suppressed confidence (INFRASTRUCTURE, not calibration) ---
# Per the accepted constraint, this sprint wires the accumulators, the agreement
# factor, and the confidence-suppression path. sigma^2_ref is PROVISIONAL and is
# NOT to be tuned in Sprint 2 — its calibration is a Phase 0 simulation task.
SIGMA2_REF: float = 9.0                # PROVISIONAL variance scale (score^2; ~3-unit SD ref)
VARIANCE_MIN_PRECISION: float = 1.0    # need this much accumulated weight before judging conflict


# =====================================================================
# Sprint 3A additions — ES-006 Decision Hierarchy (governor over ES-005.1)
# =====================================================================
#
# ES-006 acts as a GOVERNOR / rate-limiter over the ES-005.1 score-derived target
# load (ratified Sprint 3A design): the score-derived load is the TARGET; the
# decision layer (decision.py) decides whether, and how fast, the emitted load moves
# toward it. There is NO second load formula — single source of truth is preserved
# (Invariant 3).
#
# Like kappa/tau, these thresholds have NO external anchor; they are PROVISIONAL and
# a future-calibration target. STABILITY_N is ratified at 3 (ES-006 "2-3 consistent
# observations"). Do not tune them to fit a scenario.

STABILITY_N: int = 3              # consecutive consistent observations before a change (RATIFIED)
DECISION_CONF_GATE: float = 30.0  # PROVISIONAL: below this confidence, hold (no INCREASE/DECREASE)
SURPRISE_DEADBAND: float = 0.5    # PROVISIONAL (score units): |surprise| below this is neutral

# --- ES-006 Load Progression: per-equipment step granularity ("never exceed it") ---
# Barbell uses the existing plate increment; dumbbell/machine are placeholders until
# the ES-002 catalog supplies real per-exercise granularity (Sprint 3B).
EQUIPMENT_STEP_KG = {
    "barbell": PLATE_INCREMENT_KG,   # 2.5
    "dumbbell": 2.0,
    "machine": 2.5,
}
DEFAULT_EQUIPMENT_STEP_KG: float = PLATE_INCREMENT_KG


# =====================================================================
# Sprint 3B-1 additions — Foundation (ES-002 catalog / StrategyState /
# PreferenceState / calibration) + REPLACE_EXERCISE
# =====================================================================
#
# These are STRUCTURAL constants (enums, defaults, a derivation threshold), not
# fitted parameters — with one flagged exception (PREFERENCE_NUDGE). Nothing here
# is consumed by the existing numeric paths (recommendation/fatigue still receive
# difficulty_factor from the caller; canonical exercises are difficulty_factor=1.0 /
# exercise_cost=1.0), so the Sprint 0-3A trajectories are unchanged (parity firewall,
# ratified Sprint 3B-1 readiness review).

# --- ES-008 v2 / ES-009 §5: global confidence aggregate + calibration phase ---
# global_confidence = mean(Class-A capability confidences)  (ratified).
# calibration_phase is TRUE while global_confidence < this threshold (ES-009 §5,
# "global_confidence < 70 per ES-008 v2"). Derived on read; never stored.
CALIBRATION_CONFIDENCE_THRESHOLD: float = 70.0

# --- ES-009.1 §1: weekly_volume is an ENUM (the string form is deprecated) ---
WEEKLY_VOLUME_BANDS: tuple[str, ...] = ("low", "moderate", "high")

# --- StrategyState defaults — THE single source of truth (ratified condition) ---
# Both onboarding seeding AND default-on-absence (migrated, row-less athletes) build
# StrategyState from these via domain.default_strategy_state(). They must never drift
# apart, or a migrated athlete and a freshly-seeded athlete would diverge (MR3).
STRATEGY_DEFAULT_FREQUENCY: int = 3
STRATEGY_DEFAULT_VOLUME: str = "moderate"
STRATEGY_DEFAULT_PRIMARY_FOCUS: str | None = None
STRATEGY_DEFAULT_SECONDARY_FOCUS: str | None = None

# --- ES-009 §6: preference defaults + the minimal behaviour-driven nudge ---
# PreferenceState.preference_score defaults to 50 when unobserved (ES-009 §6).
PREFERENCE_DEFAULT_SCORE: float = 50.0
#
# !!! PROVISIONAL / UNVALIDATED PARAMETER !!!
# PREFERENCE_NUDGE is the single bounded step a REPLACE/skip event moves a family's
# preference_score by (chosen family up, rejected family down), clamped to [0,100].
# ES-009 §6 fixes THAT preference drives selection, not HOW FAST it moves — so, like
# kappa/tau and the decision thresholds, this has NO external anchor. Sprint 3B-1
# ships the minimal slice (one bounded nudge, no learning curve); do NOT tune it to
# fit a scenario. Calibration is a later (Phase 0 / preference-engine) responsibility.
PREFERENCE_NUDGE: float = 5.0   # INACTIVE in production since DX-10 (sticky-set replaced the
                                # bounded nudge — see preference.apply_sticky); retained as a pure
                                # tested helper + sprint4/parameters.py registry entry.
PREFERENCE_SCORE_MIN: float = 0.0
PREFERENCE_SCORE_MAX: float = 100.0

# --- DX-10 sticky preference (ES-009 §6 / Product Spec Principle 6) ---
# On an athlete-initiated REPLACE, the chosen family's preference_score is SET to this
# sticky-dominant value (and the displaced family demoted to PREFERENCE_DEFAULT_SCORE),
# so the chosen exercise is the deterministic, durable argmax going forward — "a
# replacement becomes the persistent preferred exercise" (Product Spec §6). This is the
# single knob; PROVISIONAL/structural (it sets WHICH exercise persists, not how fast a
# preference moves).
PREFERENCE_STICKY: float = PREFERENCE_SCORE_MAX   # = 100.0; the chosen family is pinned maximally preferred


# =====================================================================
# Sprint 3B-2 additions — ES-009 Session Composition + ES-009.1 Volume
#                         + ES-011 live session fatigue ceiling (Class-A only)
# =====================================================================
#
# These are STRUCTURAL constants (frozen templates, a frozen ordering, enum band
# maps, lever bounds) — the model, not fitted parameters — with two flagged
# exceptions: P_EXPLORE (the exploration probability) and SESSION_FATIGUE_CEILING
# (the live ceiling), both PROVISIONAL pending Phase 0. Composition is strictly
# load-free; nothing here changes an existing numeric path, so Sprint 0-3B-1 stays
# bit-for-bit (parity firewall holds).

# --- Stage 4 ordering + ceiling/recovery-gate trim priority (RATIFIED 2026-06-10) ---
# Lower-body compounds first, upper-body primaries second, vertical push last. This
# single frozen order governs Stage-4 block ordering, the ceiling/recovery-gate trim
# ("lowest priority" = LAST in this tuple = trimmed first), and all deterministic
# tie-breaks. No exercise-level ordering metadata exists (ratified Q1).
CAPABILITY_PRIORITY_ORDER: tuple[str, ...] = (
    "knee_dominant", "hip_dominant", "horizontal_push", "horizontal_pull", "vertical_push",
)

# --- ES-009 §4: frozen split templates ---
# The 7-capability templates are FROZEN but INACTIVE (Class-A only, ratified): they name
# vertical_pull (Class B, needs bodyweight) and core_stability (Class C, duration pipeline),
# neither of which has a live pipeline. Kept verbatim as reference so the active templates
# are provably the 7-cap ones with the two inactive capabilities removed.
TEMPLATES_7CAP: dict[int, tuple[tuple[str, ...], ...]] = {
    2: (
        ("horizontal_push", "horizontal_pull", "knee_dominant", "core_stability"),
        ("vertical_push", "vertical_pull", "hip_dominant", "core_stability"),
    ),
    3: (
        ("horizontal_push", "horizontal_pull", "knee_dominant"),
        ("vertical_push", "vertical_pull", "hip_dominant"),
        ("horizontal_push", "hip_dominant", "core_stability"),
    ),
    4: (
        ("horizontal_push", "horizontal_pull", "vertical_push"),
        ("knee_dominant", "hip_dominant", "core_stability"),
        ("vertical_pull", "horizontal_pull", "vertical_push"),
        ("knee_dominant", "hip_dominant", "core_stability"),
    ),
}

# Class-A ACTIVE templates = the 7-cap templates with vertical_pull/core_stability dropped.
# Class-A 5/5 coverage (re-proven, ratified): every frequency covers all five Class-A
# capabilities within <=2 sessions (test_class_a_coverage). Thin/duplicate sessions
# (e.g. freq-4 B == D == {knee,hip}) are an accepted consequence of the restriction.
_INACTIVE_CAPABILITIES: frozenset[str] = frozenset({"vertical_pull", "core_stability"})
TEMPLATES_CLASS_A: dict[int, tuple[tuple[str, ...], ...]] = {
    freq: tuple(
        tuple(c for c in session if c not in _INACTIVE_CAPABILITIES)
        for session in sessions
    )
    for freq, sessions in TEMPLATES_7CAP.items()
}
TEMPLATE_FREQUENCIES: tuple[int, ...] = (2, 3, 4)  # frequencies clamped to nearest of these

# --- ES-009.1 §1: weekly volume bands -> weekly working sets per capability ---
VOLUME_BAND_SETS: dict[str, int] = {"low": 8, "moderate": 12, "high": 18}

# --- ES-009.1 §3: focus weighting (applied to the weekly budget before distribution) ---
FOCUS_PRIMARY_MULTIPLIER: float = 1.25
FOCUS_SECONDARY_MULTIPLIER: float = 1.00
FOCUS_OTHER_MULTIPLIER: float = 0.75

# --- ES-009.1 §2: two-lever allocation bounds (slots x sets-per-slot) ---
SLOTS_MIN: int = 1
SLOTS_MAX: int = 2
SETS_PER_SLOT_MIN: int = 2
SETS_PER_SLOT_MAX: int = 4
SETS_PER_SLOT_BASELINE: int = 3   # the /3 divisor that opens a second slot

# --- ES-009.1 §5: calibration volume restraint (fixed, regardless of band) ---
CALIBRATION_SLOTS_PER_CAPABILITY: int = 1
CALIBRATION_SETS_PER_SLOT: int = 2

# --- ES-009 §6: exploration floor — DISABLED (M4 / DX-04) ---
# M4 (Approved Hush): the steady-state exploration auto-substitution is OFF, so composition
# is STABLE — a slot always takes its top-preference exercise (SELECT_PREFERENCE). The
# parameter is retained at 0.0 (NOT deleted): composition.py imports it, the Phase-0 harness
# binding map (sim/parameters.py) resolves it by name, and the seeded RNG + persisted
# `exploration_seed` audit column stay intact (R4 reconstructability is preserved).
# Was 0.10 (provisional/unvalidated). Re-enabling for a Phase-0 study is an override-harness
# decision (`override_parameters(P_EXPLORE=…)`), never a field tune.
P_EXPLORE: float = 0.0

# --- ES-011 / ES-009.1 §4: live session fatigue ceiling + static fallback bound ---
# !!! PROVISIONAL / UNVALIDATED / CALIBRATION REQUIRED (ratified R1) !!!
# ES-011 makes the session ceiling the LIVE mechanism; for V1 the live ceiling value is
# 24 (== the static ES-009.1 §4 fallback MAX_SESSION_SETS). It has NO external anchor
# (like kappa/tau/sigma^2_ref) and MUST be calibrated in Phase 0. If total working sets
# exceed it, the recovery gate TRIMS the lowest-priority slots until total <= ceiling
# (trim-only, never rebuilt — ratified Q2); the trim order is CAPABILITY_PRIORITY_ORDER
# (lowest priority first). MAX_SESSION_SETS is the frozen hard fallback bound.
SESSION_FATIGUE_CEILING: int = 24
MAX_SESSION_SETS: int = 24

# --- M5 stagnation detection (DX-09; Product Spec §12/§13). Read-only, advisory. ---
# The spec's stated thresholds are encoded directly (4-week window, ≥6 sessions, conf 30/70,
# 4-week cooldown). The two band knobs (Z, floor) and the agreement gate / median gap are
# PROVISIONAL — Phase-0 calibratable, NOT tuned to a scenario (same discipline as kappa/tau/
# sigma^2_ref). Detection runs weekly at program construction, never mid-session; it surfaces
# at most one insight / one advisory recommendation / one acceptance-gated volume option.
STAGNATION_WINDOW_WEEKS: float = 4.0        # §12 trailing window
STAGNATION_MIN_SESSIONS: int = 6            # §12 ≥6 sessions training the cap in-window, else insufficient
STAGNATION_CONF_FLOOR: float = 30.0         # §12 below 30 -> no call; also the imbalance-median inclusion gate
STAGNATION_CONF_ACTIONABLE: float = 70.0    # §12 ≥70 -> actionable; 30–<70 -> advisory "watch" only
STAGNATION_AGREEMENT_GATE: float = 0.5      # §12 low agreement (conflicting evidence) SUPPRESSES the call  [PROVISIONAL]
STAGNATION_BAND_Z: float = 1.0              # variance band = Z·sqrt(sigma^2_recent)                         [PROVISIONAL]
STAGNATION_BAND_FLOOR: float = 0.25         # score-unit floor so a zero-variance flat still has a band       [PROVISIONAL]
IMBALANCE_MEDIAN_GAP: float = 5.0           # §12 "meaningfully below median" (score units)                  [PROVISIONAL]
STAGNATION_COOLDOWN_WEEKS: float = 4.0      # §12 anti-repetition: no re-surface until state change or cooldown


# =====================================================================
# Goal (training intent) — additive lever over the working-rep target
# =====================================================================
#
# The athlete's GOAL shapes the working-rep target that composition threads into every
# block; loads then follow NATIVELY through the existing RIR model (recommendation.py —
# a lower rep target yields a heavier load for the same capability score). No second load
# formula, no template change, no seeding change.
#
# ADDITIVE / PARITY-PRESERVING (the same firewall discipline as Sprint 3B): an absent or
# unknown goal AND 'build_muscle' both resolve to GOAL_DEFAULT_TARGET_REPS, which equals the
# historical hard default (8). So every athlete enrolled before goals existed — and every
# build_muscle athlete — composes byte-for-byte as before. Goal does NOT touch sex/age
# seeding (cohort_multiplier already owns cold-start), the frozen templates, or the volume
# bands. It is purely a per-session rep-target selection consumed at composition time.
GOALS: tuple[str, ...] = ("build_muscle", "get_stronger", "general_fitness", "toning")
GOAL_DEFAULT: str = "build_muscle"
GOAL_DEFAULT_TARGET_REPS: int = 8           # == the historical DEFAULT_TARGET_REPS (parity)
_GOAL_TARGET_REPS: dict[str, int] = {
    "get_stronger": 5,
    "build_muscle": 8,
    "general_fitness": 10,
    "toning": 12,
}


def target_reps_for_goal(goal: str | None) -> int:
    """Working-rep target for a goal. Unknown/absent → the historical default (8), so the
    composition is parity-preserving for any athlete without a goal. Pure."""
    if goal is None:
        return GOAL_DEFAULT_TARGET_REPS
    return _GOAL_TARGET_REPS.get(goal, GOAL_DEFAULT_TARGET_REPS)
