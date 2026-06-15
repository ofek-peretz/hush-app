"""
Tests for the Option D seed-coverage validation harness (DX-08 §4 D2 / BB-16 / BB-17).

These bind the *robust* properties of the seed-safety gate — the ones the conservative design
guarantees regardless of the (still-PROVISIONAL) strength-standard table fit:

  * the harness runs end-to-end through the REAL model (seed_athlete -> recommend) and reports
    every §5 cohort cell + the continuity check (the mechanism exists and is reproducible);
  * gate (a): every NORMAL cohort cell is seed-safe — 0 % unliftable and <= 5 % too-heavy;
  * gate (c): §2.1 beginner continuity holds at the calibration bodyweight;
  * the gate has TEETH — it detects the detrained over-claim direction (detrained too-heavy
    strictly exceeds the normal cells), so a future table that re-introduced the hazard would
    not slip through;
  * determinism — same seed, identical fractions.

Deliberately NOT asserted here: that the detrained cells PASS the §5 <= 5 % gate. On the
PROVISIONAL table they do not (the report shows it), and forcing that green would either lock in
the provisional gap or require tuning the live clamp to fit — which is the D1 table fit/freeze
work, not this build. The §5 detrained sign-off is the documented pre-beta acceptance step the
operator runs through `python -m sim.seed_validation` once the table is fit (DX-08 carry-forward).
"""
from __future__ import annotations

from sim.seed_validation import (
    run_coverage, evaluate_cohort, continuity_gate,
    NORMAL_COHORTS, DETRAINED_COHORTS, CLASS_A_CAPABILITIES,
    TOO_HEAVY_GATE, CONTINUITY_TOL,
)

# Modest N for a fast, deterministic gate run; large enough for stable cohort fractions.
_N = 120
_SEED = 4242


def test_harness_runs_and_reports_every_cell() -> None:
    report = run_coverage(n=_N, seed=_SEED)
    assert len(report.normal) == len(NORMAL_COHORTS) == 6
    assert len(report.detrained) == len(DETRAINED_COHORTS) == 2
    for r in report.normal + report.detrained:
        assert r.n_samples == _N * len(CLASS_A_CAPABILITIES)
        assert 0.0 <= r.too_heavy_frac <= 1.0
        assert 0.0 <= r.unliftable_frac <= 1.0
        assert r.median_abs_err_pct >= 0.0
        assert set(r.per_capability.keys()) == set(CLASS_A_CAPABILITIES)


def test_gate_a_normal_cells_are_seed_safe() -> None:
    """Every normally-classified cell: 0 % unliftable, <= 5 % too-heavy (the §5 (a) gate)."""
    report = run_coverage(n=_N, seed=_SEED)
    for r in report.normal:
        assert r.unliftable_frac == 0.0, f"{r.label}: {r.unliftable_frac:.4f} unliftable (must be 0)"
        assert r.too_heavy_frac <= TOO_HEAVY_GATE, f"{r.label}: {r.too_heavy_frac:.4f} too-heavy > {TOO_HEAVY_GATE}"
    assert report.gate_a_passes()


def test_gate_c_beginner_continuity_holds() -> None:
    """§2.1: an untrained athlete at the calibration bodyweight maps within +-3 score of 30."""
    c = continuity_gate("male")
    assert c["passes"]
    assert c["max_abs_dev"] <= CONTINUITY_TOL
    report = run_coverage(n=_N, seed=_SEED)
    assert report.gate_c_passes()


def test_gate_has_teeth_detects_detrained_overclaim() -> None:
    """The detrained over-claim cells must read strictly heavier than every normal cell — proof the
    gate would catch a hazardous seed rather than rubber-stamp it. (Robust regardless of table fit:
    declaring a higher-than-true experience can only push the seed up.)"""
    report = run_coverage(n=_N, seed=_SEED)
    worst_normal = max(r.too_heavy_frac for r in report.normal)
    for r in report.detrained:
        assert r.too_heavy_frac > worst_normal, (
            f"detrained {r.label} ({r.too_heavy_frac:.4f}) not above worst normal ({worst_normal:.4f})")


def test_coverage_run_is_deterministic() -> None:
    a = run_coverage(n=60, seed=99)
    b = run_coverage(n=60, seed=99)
    for ra, rb in zip(a.normal + a.detrained, b.normal + b.detrained):
        assert ra.too_heavy_frac == rb.too_heavy_frac
        assert ra.unliftable_frac == rb.unliftable_frac
        assert ra.median_abs_err_pct == rb.median_abs_err_pct


def test_evaluate_single_cohort_normal_cell_safe() -> None:
    """Spot-check the per-cohort entry point directly on one normal cell."""
    import random
    r = evaluate_cohort(NORMAL_COHORTS[0], n=150, rng=random.Random(7))
    assert r.unliftable_frac == 0.0
    assert r.too_heavy_frac <= TOO_HEAVY_GATE
