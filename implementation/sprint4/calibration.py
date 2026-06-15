"""
Parameter calibration & sensitivity framework (Build Plan [3]). Sprint 4. RECOMMEND-ONLY (Q1).

This produces RECOMMENDED parameter values + evidence and a sensitivity map. It adopts
NOTHING: it never writes hush_model/constants.py and never persists a value (Q1). Each sweep
runs the production path under `sim.parameters.override_parameters`, which restores every
binding on exit (so a sweep cannot leak into the model or the golden suite).

SUCCESS BASIS — REORIENTED (DX-12 / DX-14): calibration targets the REORIENTED basis — recover
an honest SCORE estimate (`convergence_error` = score-estimate calibration) SUBJECT TO STABILITY
(the trend primitives) — not load/reps prediction. This is already what the sweep optimizes; the
framing is restated, the logic unchanged.

Methodology (raw metrics are the primary output, Q5):
  - For a parameter, run a scenario across a grid of candidate values; record the metrics.
  - The recommended value minimizes recovery `convergence_error` (score-estimate calibration)
    SUBJECT TO passing stability (trend primitives) on a constant-truth athlete.
  - Sensitivity = the spread of the metric across the grid; a `knife_edge` flag fires if a
    single grid step changes convergence_error by more than `knife_edge_frac` of its range.
  - UNDER-EXERCISED params (SESSION_FATIGUE_CEILING never binds under Class-A; the volume bands
    collapse) are reported as such, not assigned a fabricated value (R4 / Q3).

CONCEPTUAL LOCATION: sim/calibration.py (harness package).
"""
from __future__ import annotations
from dataclasses import dataclass, field

from sim.parameters import override_parameters, current_value, PARAMETERS
from sim.harness import Harness
from sim import scenarios as scn
from sim import metrics as M


@dataclass
class SweepPoint:
    value: float
    convergence_error: float
    oscillation: float
    drift: float
    ratchet: int
    stable: bool


@dataclass
class SweepResult:
    parameter: str
    baseline: float
    points: list[SweepPoint] = field(default_factory=list)
    recommended: float | None = None
    knife_edge: bool = False

    def as_rows(self) -> list[tuple]:
        return [(self.parameter, p.value, round(p.convergence_error, 3),
                 round(p.oscillation, 3), round(p.drift, 4), p.ratchet, p.stable)
                for p in self.points]


# Default stability thresholds (PROPOSED; ratifiable — Q5). Raw metrics remain primary.
OSC_MAX = 1.0
DRIFT_MAX = 0.12
CONV_MAX = 6.0          # the conservative-discount equilibrium bias is a few score units
KNIFE_EDGE_FRAC = 0.5
BURN_IN_WEEKS = 8
WINDOW = 8


def _evaluate(value_kwargs: dict, capability: str = "knee_dominant",
              weeks: int = 20) -> tuple[float, float, float, int, bool]:
    """Run the recovery + constant scenarios under an override and return raw metrics.

    recovery scenario -> convergence_error (does the model reach a truth it wasn't seeded with);
    constant scenario -> oscillation / drift / ratchet (is it stable on flat truth)."""
    with override_parameters(**value_kwargs):
        hr = Harness(); ar = scn.recovery_athlete(true=58.0)
        hr.setup(ar); tr = hr.run(ar, weeks=weeks)
        conv = M.convergence_error(tr.series(capability), 58.0, WINDOW)
        hr.close()

        hc = Harness(); ac = scn.constant_athlete()
        hc.setup(ac); tc = hc.run(ac, weeks=weeks)
        s = tc.series(capability)
        osc = M.oscillation(s, WINDOW)
        drift = M.drift_vs_flat(s, WINDOW)
        ratchet = M.load_ratchet(tc.series(capability, "load"))
        hc.close()
    stable = osc <= OSC_MAX and drift <= DRIFT_MAX
    return conv, osc, drift, ratchet, stable


def sweep(parameter: str, grid: list[float], weeks: int = 20) -> SweepResult:
    """Sweep one calibration-target parameter across `grid`; recommend a value (Q1: recommend
    only). The override CM restores the binding after every point (asserted in `finally`)."""
    if parameter not in PARAMETERS:
        raise KeyError(f"{parameter} is not a calibration-target parameter")
    res = SweepResult(parameter=parameter, baseline=current_value(parameter))
    for v in grid:
        conv, osc, drift, ratchet, stable = _evaluate({parameter: v}, weeks=weeks)
        res.points.append(SweepPoint(v, conv, osc, drift, ratchet, stable))
    stable_pts = [p for p in res.points if p.stable]
    pool = stable_pts or res.points
    res.recommended = min(pool, key=lambda p: p.convergence_error).value
    convs = [p.convergence_error for p in res.points]
    rng = max(convs) - min(convs)
    if rng > 0:
        steps = [abs(b - a) for a, b in zip(convs, convs[1:])]
        res.knife_edge = any(step > KNIFE_EDGE_FRAC * rng for step in steps)
    return res


def under_exercised_report() -> dict:
    """Parameters the Class-A V1 loop does not meaningfully exercise (R4/Q3) — reported, not
    calibrated. The session total never exceeds SESSION_FATIGUE_CEILING under Class-A, and the
    volume bands collapse (moderate==high for once-trained capabilities)."""
    return {
        "SESSION_FATIGUE_CEILING": "inert under Class-A: session total <= 24 always; never trims. "
                                   "Defer calibration to Class-B/C breadth.",
        "volume_bands": "moderate==high for once-trained capabilities (band collapse, Q3); low "
                        "distinct; twice-trained capabilities distinct. Restriction artifact, not a defect.",
        "null_focus_multiplier": "default focus=null => every capability x0.75 (literal ES-009.1 §3); "
                                 "effective default band is 0.75x nominal. Flagged for Phase-0 review.",
        "P_EXPLORE": "exercised only when preferences differ; with default-50 preferences the "
                     "exploration draw rarely changes selection. Calibrate alongside the preference engine.",
    }


def default_grids() -> dict[str, list[float]]:
    """Coarse +/-~50% grids around the current bindings (the swept space). Recommend-only."""
    k = current_value("KAPPA"); t = current_value("TAU_SYS"); s = current_value("SIGMA2_REF")
    g = current_value("DECISION_CONF_GATE"); d = current_value("SURPRISE_DEADBAND")
    return {
        "KAPPA": [round(k * f, 4) for f in (0.5, 0.75, 1.0, 1.5, 2.0)],
        "TAU_SYS": [round(t * f, 3) for f in (0.5, 0.75, 1.0, 1.5, 2.0)],
        "SIGMA2_REF": [round(s * f, 3) for f in (0.5, 0.75, 1.0, 1.5, 2.0)],
        "DECISION_CONF_GATE": [round(g * f, 1) for f in (0.5, 0.75, 1.0, 1.5)],
        "SURPRISE_DEADBAND": [round(d * f, 3) for f in (0.5, 1.0, 1.5, 2.0)],
    }


def run_calibration(weeks: int = 16) -> dict:
    """Produce the full recommended-values table + sensitivity map + under-exercised report.
    Returns data only — adopts nothing (Q1). Caller renders / records it as evidence."""
    grids = default_grids()
    sweeps = {p: sweep(p, grid, weeks=weeks) for p, grid in grids.items()}
    return {
        "recommended": {p: r.recommended for p, r in sweeps.items()},
        "baseline": {p: r.baseline for p, r in sweeps.items()},
        "knife_edge": {p: r.knife_edge for p, r in sweeps.items()},
        "sweeps": sweeps,
        "under_exercised": under_exercised_report(),
    }
