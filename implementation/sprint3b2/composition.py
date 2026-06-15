"""
Session Composition Engine (ES-009). Sprint 3B-2.

The ONLY component that answers "which exercises, in what order, in this session?"
(Principle #53: a session is composed from CAPABILITIES, then one exercise per slot).
It selects and orders; it does NOT set loads (ES-006), predict reps (ES-004), or update
state (ES-007). It emits a strictly LOAD-FREE, ordered `ExerciseBlock[]` skeleton; ES-006
fills the loads per block immediately afterward.

Four stages (none skippable), with ES-009.1 volume running INSIDE, between Stage 2 and 3:
  Stage 1  template      — Class-A-restricted frozen split by frequency / session_index
  Stage 2  priority      — calibration info-gain vs steady-state focus order
  (ES-009.1 allocates slots × sets here)
  Stage 3  selection     — one class-matched exercise per slot (+ exploration floor)
  Stage 4  ordering       — CAPABILITY_PRIORITY_ORDER, then canonical-first → position
  (ES-011 ceiling trims lowest-priority slots if over the live ceiling)

RATIFIED RULES honored here:
  - Class-A only; vertical_pull/core_stability templates are frozen INACTIVE (constants).
  - CAPABILITY_PRIORITY_ORDER (Q1) drives Stage-4 ordering, ceiling trim, and tie-breaks.
  - Exploration is fully deterministic from a PERSISTED seed via random.Random(seed) (R4);
    it never fires during calibration and never crosses the class constraint.
  - Single-capability slots only (the catalog is single-capability); a guard trips if a
    future multi-capability entry would activate the dormant C.3 approximation (R4/CE2).
  - is_primary_slot marks the ONE block per capability that drives decision memory (R2);
    the driver advances the ES-006 streak once per capability per session.

CONCEPTUAL LOCATION: hush_model/composition.py (model-package root, sibling of catalog.py).
"""
from __future__ import annotations
import random
from dataclasses import dataclass

from .constants import (
    CAPABILITY_PRIORITY_ORDER, TEMPLATES_CLASS_A, P_EXPLORE, SESSION_FATIGUE_CEILING,
)
from .catalog import CATALOG, ExerciseCatalog, Exercise
from .volume import clamp_frequency, times_trained, allocate

# selection_reason vocabulary (audit chain — "why this exercise")
SELECT_CANONICAL = "canonical"     # calibration: the cleanest reference observation
SELECT_PREFERENCE = "preference"   # steady-state argmax preference
SELECT_EXPLORATION = "exploration" # steady-state exploration draw (seeded)
SELECT_SECOND_SLOT = "second_slot" # the distinct fill of a capability's second slot
SELECT_PINNED = "athlete_pinned"   # Program Ownership: the athlete's owned exercise (wins over model)


@dataclass(frozen=True)
class BlockPlan:
    """One load-free composed block (ES-009 output). ES-006 fills load/reps afterward."""
    capability: str
    exercise_id: str
    difficulty_factor: float
    target_sets: int
    position: int
    selection_reason: str
    is_primary_slot: bool   # R2: only the primary slot advances ES-006 decision memory


@dataclass(frozen=True)
class SessionPlan:
    """The composed, ordered, load-free session + the audit fields a session must persist.

    The audit fields make the composition (the candidate-selection decision) fully replayable
    from stored data alone: `seed` reproduces the one nondeterministic step; `session_index`
    selects the template; `weekly_frequency`/`weekly_volume`/`calibration_phase` and
    `primary_focus`/`secondary_focus` are the mutable strategy inputs that drove the template,
    volume allocation, Stage-2 ordering and Stage-3 selection; `catalog_version` pins the
    candidate POOL (which exercises existed). With these + the persisted athlete-state trajectory
    + `MODEL_VERSION`, `compose_session` re-runs to the identical blocks years later."""
    blocks: tuple[BlockPlan, ...]
    seed: int
    session_index: int
    weekly_frequency: int   # clamped
    weekly_volume: str
    calibration_phase: bool
    primary_focus: str | None = None      # Stage-2/3 steady-state focus (mutable strategy input)
    secondary_focus: str | None = None
    catalog_version: str = ""             # the candidate pool's version (which exercises existed)


# ----------------------------- Stage 2 priority helpers -----------------------------

def _priority_rank(capability: str) -> int:
    """Index in CAPABILITY_PRIORITY_ORDER; lower = higher priority. Unknown caps sort last."""
    try:
        return CAPABILITY_PRIORITY_ORDER.index(capability)
    except ValueError:
        return len(CAPABILITY_PRIORITY_ORDER)


def _staleness(week: float, last_trained: float | None) -> float:
    """ES-009 §5: min(weeks_since_last_trained, 2.0); never trained → max staleness 2.0.
    (Loop time unit is weeks, so days_since/7 == weeks_since.)"""
    if last_trained is None:
        return 2.0
    return min(max(0.0, week - last_trained), 2.0)


def _info_gain(cap_state, week: float) -> float:
    """ES-009 §5: staleness + uncertainty. Higher → train earlier (maximize info gain)."""
    if cap_state is None:
        return 2.0  # unknown capability is maximally informative
    return _staleness(week, cap_state.last_trained_at_week) + (
        100.0 - cap_state.confidence
    ) / 100.0


def resolve_priority(
    slots: tuple[str, ...], athlete_state, week: float, calibrating: bool,
    primary_focus, secondary_focus,
) -> list[str]:
    """ES-009 §5: order the template's capability slots. During calibration, by descending
    info-gain (CAPABILITY_PRIORITY_ORDER as the deterministic tie-break). At steady state,
    focus-aligned first (primary, then secondary, then the rest), info-gain as tie-break."""
    caps = list(slots)

    def calib_key(c: str):
        cs = athlete_state.capabilities.get(c)
        return (-_info_gain(cs, week), _priority_rank(c))

    def steady_key(c: str):
        rank = 0 if c == primary_focus else (1 if c == secondary_focus else 2)
        cs = athlete_state.capabilities.get(c)
        return (rank, -_info_gain(cs, week), _priority_rank(c))

    return sorted(caps, key=calib_key if calibrating else steady_key)


# ----------------------------- Stage 3 selection (+ exploration) -----------------------------

def _select_for_slot(
    catalog: ExerciseCatalog, capability: str, preference_of, calibrating: bool,
    rng: random.Random, exclude: set[str], pinned_exercise_id: str | None = None,
) -> tuple[Exercise, str]:
    """One class-matched exercise for a slot (ES-009 §6). Calibration → canonical. Steady
    state → argmax preference (tie-break difficulty_factor), with the exploration floor.
    A second slot (exclude non-empty) takes the next-best DISTINCT exercise, no exploration.

    Program Ownership Contract: if the athlete has PINNED an exercise for this capability, that
    choice OWNS the slot — it wins over the calibration canonical AND the steady-state preference
    (athlete-owned > model-owned, including during calibration). The pin is honored only when it
    is a valid, class-matched, available exercise for the capability; otherwise the model selects
    (so a stale pin after a catalog change degrades safely). `pinned_exercise_id` defaults None,
    so every caller without a pin is byte-identical to the prior selection path."""
    pool = [e for e in catalog.for_capability(capability) if e.exercise_id not in exclude]
    if not pool:
        raise KeyError(f"no exercise available for capability {capability!r}")

    if pinned_exercise_id is not None:
        pinned = next((e for e in pool if e.exercise_id == pinned_exercise_id), None)
        if pinned is not None:
            return pinned, SELECT_PINNED

    if calibrating:
        return catalog.canonical_for(capability), SELECT_CANONICAL

    top = max(pool, key=lambda e: (preference_of(e.exercise_family), e.difficulty_factor))

    if exclude:
        # second-slot fill: forced distinct next-best; exploration does not apply here.
        return top, SELECT_SECOND_SLOT

    others = sorted(
        (e for e in pool if e.exercise_id != top.exercise_id),
        key=lambda e: e.exercise_id,   # deterministic order before the seeded draw
    )
    # ES-009 §6 exploration floor — DISABLED by default in V1 (M4 / DX-04): with the default
    # P_EXPLORE = 0.0 the `P_EXPLORE > 0.0` guard short-circuits before rng.random(), so the
    # seeded RNG is not consumed and a slot is the deterministic top-preference exercise. The
    # seed/plumbing stay so a Phase-0 override (override_parameters(P_EXPLORE=…)) can re-enable
    # and study it; given the seed the draw is still a deterministic function of inputs (R4).
    if others and P_EXPLORE > 0.0 and rng.random() < P_EXPLORE:
        return rng.choice(others), SELECT_EXPLORATION
    return top, SELECT_PREFERENCE


# ----------------------------- Stage 4 ordering + ceiling trim -----------------------------

def _order_key(item) -> tuple:
    # item = (capability, slot_idx, exercise, reason, sets)
    cap, slot_idx, exercise, _reason, _sets = item
    return (_priority_rank(cap), -exercise.difficulty_factor, slot_idx)


def _apply_athlete_order(items: list, exercise_order: list) -> list:
    """Program Ownership Contract: the athlete OWNS exercise order. Reorder the composed blocks so
    the athlete's listed exercises lead, in the athlete's exact order; unlisted blocks keep the
    model's relative order after them. A stable sort, so the model never silently re-sorts what the
    athlete arranged. Empty order => model order (byte-identical to before)."""
    if not exercise_order:
        return items
    rank = {ex_id: i for i, ex_id in enumerate(exercise_order)}
    tail = len(rank)
    return sorted(items, key=lambda it: rank.get(it[2].exercise_id, tail))  # stable


def _trim_to_ceiling(items: list, ceiling: int) -> list:
    """ES-011 live ceiling + recovery gate (ratified Q2: trim-only, never rebuilt). If total
    working sets exceed the ceiling, remove the lowest-priority slot(s) until total ≤ ceiling.
    Drop order (deterministic, coverage-preserving): SECOND slots before sole/primary slots;
    within each, lowest CAPABILITY_PRIORITY_ORDER priority first."""
    total = sum(it[4] for it in items)
    if total <= ceiling:
        return items
    drop_candidates = sorted(
        range(len(items)),
        key=lambda i: (
            0 if items[i][1] > 0 else 1,   # second slots first
            -_priority_rank(items[i][0]),  # lowest priority (highest rank) first
            -items[i][1],
        ),
    )
    removed: set[int] = set()
    for i in drop_candidates:
        if total <= ceiling:
            break
        removed.add(i)
        total -= items[i][4]
    return [it for j, it in enumerate(items) if j not in removed]


# ----------------------------- the engine -----------------------------

def compose_session(
    athlete_state,
    strategy,
    *,
    session_index: int,
    seed: int,
    week: float,
    catalog: ExerciseCatalog = CATALOG,
    ceiling: int = SESSION_FATIGUE_CEILING,
) -> SessionPlan:
    """Compose one load-free session. Pure (no DB, no state mutation); deterministic given
    (athlete_state, strategy, session_index, seed, week)."""
    freq = clamp_frequency(strategy.weekly_frequency)
    sessions = TEMPLATES_CLASS_A[freq]
    template = sessions[session_index % len(sessions)]          # Stage 1
    calibrating = athlete_state.calibration_phase()
    primary, secondary = strategy.primary_focus, strategy.secondary_focus

    order = resolve_priority(                                   # Stage 2
        template, athlete_state, week, calibrating, primary, secondary
    )
    tt = times_trained(freq)
    rng = random.Random(seed)
    preference_of = athlete_state.preference_score

    # ES-009.1 volume (slots × sets) → Stage 3 selection per slot
    raw: list = []   # (capability, slot_idx, exercise, reason, sets)
    for cap in order:
        slots, sets = allocate(
            cap, strategy.weekly_volume, tt.get(cap, 1), calibrating, primary, secondary
        )
        # CE1: a slot needs a distinct exercise; never request more slots than the pool has.
        slots = min(slots, len(catalog.for_capability(cap)))
        chosen: list[str] = []
        # The athlete-owned pin (if any) applies to the capability's PRIMARY slot (slot_idx 0);
        # a second slot is the model's distinct next-best fill.
        pin = athlete_state.pinned_exercise(cap)
        for slot_idx in range(slots):
            ex, reason = _select_for_slot(
                catalog, cap, preference_of, calibrating, rng, exclude=set(chosen),
                pinned_exercise_id=(pin if slot_idx == 0 else None),
            )
            # CE2: single-capability slots only in V1 (keeps the C.3 de-fatigue path exact).
            if len(ex.capabilities) != 1:
                raise ValueError(
                    f"multi-capability block not allowed in V1: {ex.exercise_id!r}"
                )
            chosen.append(ex.exercise_id)
            raw.append((cap, slot_idx, ex, reason, sets))

    raw.sort(key=_order_key)                                    # Stage 4 ordering (model default)
    raw = _trim_to_ceiling(raw, ceiling)                       # ES-011 live ceiling (Q2)
    raw = _apply_athlete_order(raw, athlete_state.exercise_order)  # athlete-owned order wins (Ownership)

    blocks = tuple(
        BlockPlan(
            capability=cap, exercise_id=ex.exercise_id,
            difficulty_factor=ex.difficulty_factor, target_sets=sets,
            position=position, selection_reason=reason,
            is_primary_slot=(slot_idx == 0),
        )
        for position, (cap, slot_idx, ex, reason, sets) in enumerate(raw)
    )
    return SessionPlan(
        blocks=blocks, seed=seed, session_index=session_index,
        weekly_frequency=freq, weekly_volume=strategy.weekly_volume,
        calibration_phase=calibrating,
        primary_focus=primary, secondary_focus=secondary,
        catalog_version=getattr(catalog, "version", ""),
    )
