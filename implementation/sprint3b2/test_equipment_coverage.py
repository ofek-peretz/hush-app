"""
Tests for the equipment → catalog Class-A coverage verification (BB-17).

These bind the *structural facts* of the frozen ES-002 catalog. They are deterministic (no RNG):
they change only if the catalog changes — which is a `catalog_version` / model-version event that
SHOULD re-trip these assertions (that is the point — a catalog edit must re-prove coverage).

Also pins the as-built truth that v1 composition is equipment-agnostic, so these results describe
the catalog's LATENT capacity (what an equipment-aware composition would have), not a current filter.
"""
from __future__ import annotations

from sim.equipment_coverage import (
    coverage_for_set, coverage_report, minimal_singletons_for_full_coverage,
    v1_target_environment_covered, COMMERCIAL_GYM,
    DECLARED_SETS, EQUIPMENT_UNIVERSE,
)
from hush_model.constants import CLASS_A_CAPABILITIES


def _cov(label):
    return coverage_report()["sets"][label]


def test_equipment_universe_is_the_catalog_vocabulary() -> None:
    assert EQUIPMENT_UNIVERSE == frozenset({"barbell", "dumbbell", "machine"})


def test_v1_target_environment_commercial_gym_covers_all_class_a() -> None:
    """RATIFIED V1 scope: Hush V1 is gym-based; the target environment is a STANDARD COMMERCIAL GYM
    (barbell always present). The relevant V1 question — does that environment provide complete Class-A
    coverage? — is YES. This regression-locks the documented product assumption; out-of-scope sets
    (home/dumbbell-/machine-/bodyweight-only) are validation only and open no remedy work."""
    assert v1_target_environment_covered() is True
    sc = coverage_for_set(COMMERCIAL_GYM, "commercial gym")
    assert sc.full_session_composable
    assert sc.covered_count == len(CLASS_A_CAPABILITIES) == 5
    assert sc.canonical_session_intact


def test_barbell_alone_covers_all_five() -> None:
    """A barbell alone composes a complete 5/5 Class-A session (every capability has a barbell option,
    and the canonical exercise for each IS the barbell one)."""
    sc = coverage_for_set(frozenset({"barbell"}), "barbell only")
    assert sc.full_session_composable
    assert sc.covered_count == len(CLASS_A_CAPABILITIES) == 5
    assert sc.canonical_session_intact          # calibration (canonical-only) session also intact
    assert minimal_singletons_for_full_coverage() == ("barbell",)


def test_hip_dominant_is_barbell_only() -> None:
    """hip_dominant (deadlift, romanian_deadlift) is uncoverable without a barbell."""
    assert coverage_for_set(frozenset({"dumbbell", "machine"})).per_capability["hip_dominant"].coverable is False
    assert coverage_for_set(frozenset({"barbell"})).per_capability["hip_dominant"].coverable is True


def test_knee_dominant_needs_barbell_or_machine() -> None:
    """knee_dominant (back_squat / leg_press) has no dumbbell option."""
    assert coverage_for_set(frozenset({"dumbbell"})).per_capability["knee_dominant"].coverable is False
    assert coverage_for_set(frozenset({"machine"})).per_capability["knee_dominant"].coverable is True
    assert coverage_for_set(frozenset({"barbell"})).per_capability["knee_dominant"].coverable is True


def test_push_pull_need_barbell_or_dumbbell() -> None:
    for cap in ("horizontal_push", "horizontal_pull", "vertical_push"):
        assert coverage_for_set(frozenset({"machine"})).per_capability[cap].coverable is False
        assert coverage_for_set(frozenset({"dumbbell"})).per_capability[cap].coverable is True
        assert coverage_for_set(frozenset({"barbell"})).per_capability[cap].coverable is True


def test_constrained_sets_have_the_expected_gaps() -> None:
    """The exact coverage counts of the constrained sets the Beta-Readiness §2.3 risk names."""
    assert _cov("dumbbell only").covered_count == 3          # push/pull/vpush; knee+hip missing
    assert set(_cov("dumbbell only").missing) == {"knee_dominant", "hip_dominant"}
    assert _cov("machine only").covered_count == 1           # leg_press only
    assert set(_cov("machine only").missing) == {
        "horizontal_push", "horizontal_pull", "vertical_push", "hip_dominant"}
    assert _cov("dumbbell+machine (no barbell)").covered_count == 4   # only hip_dominant missing
    assert set(_cov("dumbbell+machine (no barbell)").missing) == {"hip_dominant"}
    assert _cov("bodyweight only (no equipment)").covered_count == 0  # no bodyweight Class-A entries


def test_any_barbell_containing_set_is_fully_composable() -> None:
    for label, sc in coverage_report()["sets"].items():
        if "barbell" in sc.equipment:
            assert sc.full_session_composable, f"{label} should be 5/5 (contains barbell)"


def test_no_barbell_set_is_never_fully_composable() -> None:
    """Catalog fact (out-of-scope sets only): without a barbell the frozen catalog cannot compose a
    complete session. Not a V1 blocker — V1 targets commercial gyms where a barbell is always present."""
    for label, sc in coverage_report()["sets"].items():
        if "barbell" not in sc.equipment:
            assert not sc.full_session_composable, f"{label} should NOT be 5/5 (no barbell)"
