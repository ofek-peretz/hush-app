"""
Exercise Catalog (ES-002). Sprint 3B-1.

FROZEN REFERENCE DATA, code-resident (ratified: the catalog does NOT enter the
database). It is the single source of truth for "which exercises exist, what they
train, and how they may be substituted". History rows already snapshot the consumed
`exercise` / `difficulty_factor` per block, so audit reconstruction never needs a DB
copy of the catalog. The catalog is version-tied to CAPABILITY_MODEL_VERSION: any edit
(new alternate, changed family/factor) is a model-version event, not a silent change.

THREE DISTINCT RELATIONS (readiness review CR1 — do not conflate):
  - capability       : what a slot trains (the durable thing; ES-008 v2).
  - replacement_group: the interchangeable pool a REPLACE may draw from for a slot.
  - exercise_family  : the unit PreferenceState scores (ES-009 §6).
Selection picks among a CAPABILITY's exercises, scored by their FAMILY's
preference_score, tie-broken by difficulty_factor (prefer the canonical df=1.0);
REPLACE searches the REPLACEMENT_GROUP. A capability may host several families within
one replacement_group.

PARITY FIREWALL (ratified CR2): canonical exercises are difficulty_factor == 1.0 and
exercise_cost == 1.0, and NOTHING here is wired into the existing numeric paths —
recommendation/fatigue still receive difficulty_factor from the caller. The catalog is
consulted ONLY by the new selection / REPLACE primitive, so Sprint 0-3A is unchanged.

CLASS CONSTRAINT (ES-008 v2, hard): an exercise may fill a slot only if its class
matches the capability's class. Sprint 3B-1 is Class-A only; the catalog deliberately
contains NO Class-B (vertical_pull) or Class-C (core_stability) entries, so a Class-A
lookup can never surface an inactive cross-class exercise (readiness review CR4).

CONCEPTUAL LOCATION: hush_model/catalog.py (model-package root, sibling of constants.py).
"""
from __future__ import annotations
from dataclasses import dataclass, field

from .constants import CLASS_A_CAPABILITIES, CAPABILITY_MODEL_VERSION

CLASS_A = "A"

# Class of each capability the catalog knows about. Class-A only in Sprint 3B-1.
CAPABILITY_CLASS: dict[str, str] = {cap: CLASS_A for cap in CLASS_A_CAPABILITIES}


@dataclass(frozen=True)
class Exercise:
    """One catalog entry (ES-002). Immutable reference data."""
    exercise_id: str
    capabilities: dict[str, float]   # capability_code -> contribution_weight
    difficulty_factor: float
    equipment: str                   # barbell | dumbbell | machine
    exercise_class: str              # "A" (Class-A only in 3B-1)
    replacement_group: str
    exercise_family: str
    exercise_cost: float = 1.0       # REFERENCE-ONLY in 3B-1 (parity firewall)
    active: bool = True

    @property
    def primary_capability(self) -> str:
        """The capability with the largest contribution weight (the slot it canonically fills)."""
        return max(self.capabilities.items(), key=lambda kv: kv[1])[0]

    @property
    def is_canonical(self) -> bool:
        return self.difficulty_factor == 1.0

    def trains(self, capability: str) -> bool:
        return capability in self.capabilities


# ----------------------------- the frozen Class-A catalog -----------------------------
# Canonical (difficulty_factor 1.0, cost 1.0) + one alternate per Class-A capability.
# Canonical ids match the names the Sprint 0-3A sim/tests already use (e.g. bench_press),
# so the catalog's canonical selection is consistent with the existing numeric path.

_CATALOG: tuple[Exercise, ...] = (
    # horizontal_push
    Exercise("bench_press", {"horizontal_push": 1.0}, 1.0, "barbell", CLASS_A,
             replacement_group="horizontal_push", exercise_family="bench_barbell"),
    Exercise("db_bench_press", {"horizontal_push": 1.0}, 0.95, "dumbbell", CLASS_A,
             replacement_group="horizontal_push", exercise_family="bench_dumbbell",
             exercise_cost=0.9),
    # horizontal_pull
    Exercise("barbell_row", {"horizontal_pull": 1.0}, 1.0, "barbell", CLASS_A,
             replacement_group="horizontal_pull", exercise_family="row_barbell"),
    Exercise("db_row", {"horizontal_pull": 1.0}, 0.95, "dumbbell", CLASS_A,
             replacement_group="horizontal_pull", exercise_family="row_dumbbell",
             exercise_cost=0.9),
    # vertical_push
    Exercise("overhead_press", {"vertical_push": 1.0}, 1.0, "barbell", CLASS_A,
             replacement_group="vertical_push", exercise_family="ohp_barbell"),
    Exercise("db_shoulder_press", {"vertical_push": 1.0}, 0.9, "dumbbell", CLASS_A,
             replacement_group="vertical_push", exercise_family="ohp_dumbbell",
             exercise_cost=0.9),
    # knee_dominant
    Exercise("back_squat", {"knee_dominant": 1.0}, 1.0, "barbell", CLASS_A,
             replacement_group="knee_dominant", exercise_family="squat_barbell"),
    Exercise("leg_press", {"knee_dominant": 1.0}, 0.85, "machine", CLASS_A,
             replacement_group="knee_dominant", exercise_family="leg_press_machine",
             exercise_cost=0.8),
    # hip_dominant
    Exercise("deadlift", {"hip_dominant": 1.0}, 1.0, "barbell", CLASS_A,
             replacement_group="hip_dominant", exercise_family="deadlift_barbell"),
    Exercise("romanian_deadlift", {"hip_dominant": 1.0}, 0.9, "barbell", CLASS_A,
             replacement_group="hip_dominant", exercise_family="rdl_barbell",
             exercise_cost=0.9),
)


class ExerciseCatalog:
    """Read-only accessor over the frozen Class-A catalog (ES-002)."""

    version: str = CAPABILITY_MODEL_VERSION

    def __init__(self, exercises: tuple[Exercise, ...] = _CATALOG):
        self._by_id = {e.exercise_id: e for e in exercises}
        self._all = exercises

    def get(self, exercise_id: str) -> Exercise:
        return self._by_id[exercise_id]

    def for_capability(self, capability: str) -> list[Exercise]:
        """Active exercises whose class matches the capability's class and that train it
        (the class constraint, ES-008 v2). Class-A only in 3B-1."""
        cap_class = CAPABILITY_CLASS.get(capability)
        return [
            e for e in self._all
            if e.active and e.exercise_class == cap_class and e.trains(capability)
        ]

    def canonical_for(self, capability: str) -> Exercise:
        """The canonical (difficulty_factor 1.0) exercise for a capability (ES-009 §6,
        the cleanest reference observation during calibration)."""
        for e in self.for_capability(capability):
            if e.is_canonical:
                return e
        raise KeyError(f"no canonical exercise for capability {capability!r}")

    def replacement_group(self, exercise_id: str) -> list[Exercise]:
        """The interchangeable pool for an exercise: same replacement_group, active,
        class-matched. The pool a REPLACE / equipment-busy re-selection draws from."""
        ex = self._by_id[exercise_id]
        return [
            e for e in self._all
            if e.active
            and e.replacement_group == ex.replacement_group
            and e.exercise_class == ex.exercise_class
        ]

    def select(
        self,
        capability: str,
        preference_score,                # callable: exercise_family -> float
        calibrating: bool,
    ) -> Exercise:
        """ES-009 §6 Stage-3 selection primitive (reused by REPLACE and, in 3B-2, by
        composition). During calibration: the canonical exercise (cleanest anchor).
        Steady-state: argmax preference_score over the capability's exercises, tie-broken
        by difficulty_factor (prefer canonical). Never crosses the class constraint."""
        if calibrating:
            return self.canonical_for(capability)
        return self._argmax_by_preference(self.for_capability(capability), preference_score)

    def replace(
        self,
        current_exercise_id: str,
        preference_score,                # callable: exercise_family -> float
    ) -> Exercise:
        """L2 REPLACE_EXERCISE (ES-006, preference-driven — NEVER performance-driven):
        pick the most-preferred exercise in the current exercise's replacement_group,
        preserving the capability and the class constraint (Principle #53)."""
        pool = self.replacement_group(current_exercise_id)
        return self._argmax_by_preference(pool, preference_score)

    @staticmethod
    def _argmax_by_preference(pool: list[Exercise], preference_score) -> Exercise:
        if not pool:
            raise KeyError("empty selection pool")
        # max preference_score; tie-break prefers the canonical (higher difficulty_factor
        # toward 1.0). Stable, deterministic — no exploration term in 3B-1 (that is 3B-2).
        return max(
            pool,
            key=lambda e: (preference_score(e.exercise_family), e.difficulty_factor),
        )


# A module-level singleton — the catalog is frozen reference data (like constants).
CATALOG = ExerciseCatalog()
