"""
Equipment → catalog Class-A coverage verification (BB-17).

Question (Beta-Readiness §2.3): for every equipment set an athlete might declare, can the frozen
ES-002 catalog supply at least one class-matched exercise for each of the 5 Class-A capabilities —
i.e. can a complete 5/5 first session be composed — or does a constrained set (dumbbells-only,
machine-only, bodyweight-only) silently leave a capability uncoverable?

This is a **pure analysis over the frozen catalog**. It changes no model behavior and adds no input.
It is deliberately *not* a composition change:

    AS-BUILT TRUTH (verified): v1 composition (`compose_session`) is **equipment-agnostic** — it never
    filters `catalog.for_capability(...)` by a declared equipment set, and the athlete entity stores no
    equipment. So today every session is composed from the canonical (barbell) / preference exercises
    regardless of what the athlete actually owns.

Therefore this harness measures the catalog's **latent capacity** — the coverage that an
equipment-aware composition *would* have if the declared set were honored — and surfaces the
structural gaps. Wiring equipment into composition (a new onboarding input + a Stage-3 filter +
a degenerate-set policy) is a model/behaviour change and a product decision, NOT done here.

Headline structural facts about the frozen Class-A catalog (asserted in the tests):
  * a **barbell alone covers all 5** Class-A capabilities (every capability has a barbell option;
    the canonical exercise for each IS the barbell one) — no non-barbell set achieves 5/5;
  * `hip_dominant` is **barbell-only** (deadlift, romanian_deadlift) — uncoverable without a barbell;
  * `knee_dominant` needs **barbell or machine** (back_squat / leg_press) — no dumbbell option;
  * `horizontal_push` / `horizontal_pull` / `vertical_push` need **barbell or dumbbell**;
  * **bodyweight-only → 0/5** (the catalog has no bodyweight Class-A entries).

V1 product scope (RATIFIED 2026-06-12): Hush V1 is gym-based; the target environment is a STANDARD
COMMERCIAL GYM (a barbell is always present). Since a barbell alone covers all 5 Class-A capabilities,
**the V1 target environment provides complete Class-A coverage** — this finding is satisfied, not a
blocker. Home-gym / dumbbell-only / machine-only / bodyweight-only setups are explicitly OUT OF SCOPE;
their coverage gaps below are catalog validation only and open **no** catalog-expansion or
equipment-aware-composition work.

Pure / I-O-free / deterministic.
"""
from __future__ import annotations
from dataclasses import dataclass, field

from hush_model.constants import CLASS_A_CAPABILITIES
from hush_model.catalog import CATALOG, ExerciseCatalog

# The equipment vocabulary the frozen catalog actually uses.
EQUIPMENT_UNIVERSE: frozenset[str] = frozenset(e.equipment for e in CATALOG._all)

# --- V1 product scope (ratified) ------------------------------------------------------------------
# Hush V1 is a GYM-BASED strength product: the intended environment is a STANDARD COMMERCIAL GYM with
# normal strength-training equipment (a barbell is always present). V1 does NOT target home-gym,
# dumbbell-only, machine-only, or bodyweight-only setups. The relevant V1 question is therefore only:
# "does a standard commercial gym provide complete Class-A coverage?" — and the answer is YES (a barbell
# alone covers all 5 Class-A capabilities; see `test_commercial_gym_covers_all_class_a`). The constrained
# non-target sets below are retained as catalog validation, NOT as product requirements: their gaps are
# out of scope by design and open no catalog-expansion or equipment-aware-composition work.
COMMERCIAL_GYM: frozenset[str] = frozenset({"barbell", "dumbbell", "machine"})

# Representative declared equipment sets (Beta-Readiness §2.3 names the constrained ones explicitly).
# Only "full (commercial gym)" is in the V1 target scope; the rest are out-of-scope validation cells.
DECLARED_SETS: dict[str, frozenset[str]] = {
    "full (barbell+dumbbell+machine)": frozenset({"barbell", "dumbbell", "machine"}),
    "barbell+dumbbell":                frozenset({"barbell", "dumbbell"}),
    "barbell only":                    frozenset({"barbell"}),
    "dumbbell+machine (no barbell)":   frozenset({"dumbbell", "machine"}),
    "dumbbell only":                   frozenset({"dumbbell"}),
    "machine only":                    frozenset({"machine"}),
    "bodyweight only (no equipment)":  frozenset(),
}


@dataclass(frozen=True)
class CapabilityCoverage:
    capability: str
    available_exercise_ids: tuple[str, ...]      # class-matched exercises buildable from the set
    canonical_available: bool                    # is the canonical (df=1.0) exercise in the set?

    @property
    def coverable(self) -> bool:
        return len(self.available_exercise_ids) >= 1


@dataclass(frozen=True)
class SetCoverage:
    label: str
    equipment: frozenset
    per_capability: dict                          # capability -> CapabilityCoverage
    missing: tuple[str, ...]                       # capabilities with no available exercise

    @property
    def covered_count(self) -> int:
        return sum(1 for c in self.per_capability.values() if c.coverable)

    @property
    def full_session_composable(self) -> bool:
        return len(self.missing) == 0

    @property
    def canonical_session_intact(self) -> bool:
        """Could the *calibration* (canonical-only) session be built from this set?"""
        return all(c.canonical_available for c in self.per_capability.values())


def coverage_for_set(equipment: frozenset, label: str = "",
                     catalog: ExerciseCatalog = CATALOG) -> SetCoverage:
    """Per-capability catalog coverage for one declared equipment set (latent capacity)."""
    per_cap: dict[str, CapabilityCoverage] = {}
    missing: list[str] = []
    for cap in CLASS_A_CAPABILITIES:
        pool = [e for e in catalog.for_capability(cap) if e.equipment in equipment]
        canonical = catalog.canonical_for(cap)
        cc = CapabilityCoverage(
            capability=cap,
            available_exercise_ids=tuple(sorted(e.exercise_id for e in pool)),
            canonical_available=canonical.equipment in equipment,
        )
        per_cap[cap] = cc
        if not cc.coverable:
            missing.append(cap)
    return SetCoverage(label=label, equipment=equipment, per_capability=per_cap,
                       missing=tuple(missing))


def v1_target_environment_covered(catalog: ExerciseCatalog = CATALOG) -> bool:
    """V1 scope question: does a STANDARD COMMERCIAL GYM provide complete 5/5 Class-A coverage? (Yes.)"""
    return coverage_for_set(COMMERCIAL_GYM, "commercial gym", catalog).full_session_composable


def coverage_report(catalog: ExerciseCatalog = CATALOG) -> dict:
    """Coverage for every representative declared set + the minimal-equipment summary."""
    sets = {label: coverage_for_set(eq, label, catalog) for label, eq in DECLARED_SETS.items()}
    return {"sets": sets, "minimal_full_coverage": minimal_singletons_for_full_coverage(catalog)}


def minimal_singletons_for_full_coverage(catalog: ExerciseCatalog = CATALOG) -> tuple[str, ...]:
    """Which single equipment types, alone, already cover all 5 Class-A capabilities."""
    out = []
    for eq in sorted(EQUIPMENT_UNIVERSE):
        if coverage_for_set(frozenset({eq}), eq, catalog).full_session_composable:
            out.append(eq)
    return tuple(out)


def _fmt(report: dict) -> str:
    caps = list(CLASS_A_CAPABILITIES)
    lines = ["Equipment -> Class-A catalog coverage (BB-17) — frozen catalog, latent capacity\n"]
    header = f"{'declared equipment set':<34} " + " ".join(f"{c[:9]:>10}" for c in caps) + f" {'5/5':>5}"
    lines.append(header)
    lines.append("-" * len(header))
    for label, sc in report["sets"].items():
        cells = " ".join(f"{'yes' if sc.per_capability[c].coverable else 'NO':>10}" for c in caps)
        lines.append(f"{label:<34} {cells} {('YES' if sc.full_session_composable else 'no'):>5}")
    lines.append("-" * len(header))
    lines.append(f"single equipment types that ALONE cover 5/5: {report['minimal_full_coverage']}")
    gym = "YES" if v1_target_environment_covered() else "NO"
    lines.append(f"V1 TARGET ENVIRONMENT — standard commercial gym provides complete Class-A coverage: {gym}")
    lines.append("NOTE: V1 is gym-based (commercial gym; barbell always present). Out-of-scope sets "
                 "(home/dumbbell-/machine-/bodyweight-only)\n      are catalog validation only, not "
                 "product requirements. v1 composition is equipment-agnostic by design at this scope.")
    return "\n".join(lines)


def main() -> None:
    try:
        import sys
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(_fmt(coverage_report()))


if __name__ == "__main__":
    main()
