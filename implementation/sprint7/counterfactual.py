"""
Counterfactual simulation (Phase-0 measurement instrument). Sprint 7.

sim/shadow.py is already ONE counterfactual: a fixed no-learning policy run beside the model to
answer "what if the model hadn't learned." This module generalizes that into a counterfactual
SIMULATOR over the model's own parameters: run the SAME synthetic athlete under the live
parameters and under a counterfactual override, and report what would have changed — "if KAPPA
had been 0.07, the estimate would have settled 1.2 score-units closer to truth, with no extra
oscillation." It drives the real SessionEngine through sim/harness.py (Q4), so it measures the
production path, not a re-implementation.

COMMON RANDOM NUMBERS (the reason this is causal, not just two noisy runs). Both arms build the
athlete from the SAME factory, hence the SAME seed, so the athlete's measurement-noise and
true-capability streams are identical across arms (synthetic_athlete.SyntheticAthlete is fully
seeded). The only thing that differs between arms is the parameter under test, so the per-arm
DIFFERENCE isolates that parameter's effect with the noise differenced out (CRN variance
reduction) — the paired, within-athlete comparison the Validation Architecture leans on (A8).

RECOMMEND-ONLY / NON-LEAKING. Every arm runs inside sim.parameters.override_parameters, which
restores every binding on exit and asserts the live bindings equal the model's source values
afterward — a counterfactual can never leak into the model or the golden suite (the Sprint-4
Q1 guarantee). This module adopts nothing and writes nothing.

CONCEPTUAL LOCATION: sim/counterfactual.py (harness package; imports the frozen model + harness).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable

from hush_model.constants import CLASS_A_CAPABILITIES
from sim.harness import Harness
from sim.parameters import override_parameters, current_value
from sim import metrics as M

MakeAthlete = Callable[[], object]   # a zero-arg factory returning a fresh, fixed-seed athlete


@dataclass
class ArmResult:
    """One arm of a counterfactual: the trajectory metrics under a given parameter override."""
    label: str
    overrides: dict
    final_score: dict[str, float] = field(default_factory=dict)
    convergence_error: dict[str, float] = field(default_factory=dict)   # |settled inferred - true|
    oscillation: dict[str, float] = field(default_factory=dict)
    final_load: dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "label": self.label, "overrides": self.overrides,
            "final_score": self.final_score, "convergence_error": self.convergence_error,
            "oscillation": self.oscillation, "final_load": self.final_load,
        }


def run_arm(
    make_athlete: MakeAthlete, *, label: str, overrides: dict | None = None,
    weeks: int = 20, window: int = 8, capabilities: list[str] | None = None,
) -> ArmResult:
    """Run one arm: build a fresh athlete, drive the production SessionEngine for `weeks` under
    the optional parameter `overrides`, and compute the trajectory metrics. The override context
    wraps BOTH onboarding and the run (mirrors sim/calibration._evaluate) and restores on exit."""
    overrides = overrides or {}
    caps = capabilities or list(CLASS_A_CAPABILITIES)
    res = ArmResult(label=label, overrides=dict(overrides))
    h = Harness()
    try:
        ath = make_athlete()
        with override_parameters(**overrides):
            h.setup(ath)
            tr = h.run(ath, weeks=weeks)
        for c in caps:
            series = tr.series(c)
            if not series:
                continue
            res.final_score[c] = series[-1]
            res.convergence_error[c] = M.convergence_error(series, tr.true_score[c], window)
            res.oscillation[c] = M.oscillation(series, window)
            loads = tr.series(c, "load")
            res.final_load[c] = loads[-1] if loads else float("nan")
    finally:
        h.close()
    return res


@dataclass
class Counterfactual:
    baseline: ArmResult
    counterfactual: ArmResult
    # Per-capability deltas (counterfactual - baseline) for the diagnostic metrics, plus the
    # convergence IMPROVEMENT (baseline_error - cf_error; +ve = the counterfactual is closer to truth).
    convergence_improvement: dict[str, float] = field(default_factory=dict)
    oscillation_delta: dict[str, float] = field(default_factory=dict)
    final_score_delta: dict[str, float] = field(default_factory=dict)
    final_load_delta: dict[str, float] = field(default_factory=dict)

    def mean_convergence_improvement(self) -> float:
        vals = list(self.convergence_improvement.values())
        return sum(vals) / len(vals) if vals else float("nan")

    def as_dict(self) -> dict:
        return {
            "baseline": self.baseline.as_dict(),
            "counterfactual": self.counterfactual.as_dict(),
            "convergence_improvement": self.convergence_improvement,
            "oscillation_delta": self.oscillation_delta,
            "final_score_delta": self.final_score_delta,
            "final_load_delta": self.final_load_delta,
            "mean_convergence_improvement": self.mean_convergence_improvement(),
        }


def _delta(a: dict, b: dict) -> dict:
    """b - a over shared keys (counterfactual - baseline)."""
    return {k: b[k] - a[k] for k in a if k in b}


def compare(
    make_athlete: MakeAthlete, *, counterfactual: dict, baseline: dict | None = None,
    weeks: int = 20, window: int = 8, capabilities: list[str] | None = None,
    baseline_label: str = "baseline", counterfactual_label: str = "counterfactual",
) -> Counterfactual:
    """Paired counterfactual: run the athlete under `baseline` params (default = live values) and
    under the `counterfactual` override, both with common random numbers, and report the deltas.
    Positive `convergence_improvement` means the counterfactual recovers truth more closely."""
    base_arm = run_arm(make_athlete, label=baseline_label, overrides=baseline or {},
                       weeks=weeks, window=window, capabilities=capabilities)
    cf_arm = run_arm(make_athlete, label=counterfactual_label, overrides=counterfactual,
                     weeks=weeks, window=window, capabilities=capabilities)
    return Counterfactual(
        baseline=base_arm, counterfactual=cf_arm,
        # improvement = how much the error SHRANK (baseline - cf), so +ve is better.
        convergence_improvement={
            c: base_arm.convergence_error[c] - cf_arm.convergence_error[c]
            for c in base_arm.convergence_error if c in cf_arm.convergence_error
        },
        oscillation_delta=_delta(base_arm.oscillation, cf_arm.oscillation),
        final_score_delta=_delta(base_arm.final_score, cf_arm.final_score),
        final_load_delta=_delta(base_arm.final_load, cf_arm.final_load),
    )


def parameter_sensitivity(
    make_athlete: MakeAthlete, parameter: str, values: list[float], *,
    weeks: int = 20, window: int = 8, capabilities: list[str] | None = None,
) -> list[dict]:
    """Counterfactual sweep of ONE parameter against the LIVE baseline: for each candidate value,
    the mean convergence improvement vs the live setting (CRN-paired). Distinct from
    sim/calibration.sweep, which optimizes raw metrics — this reports the CAUSAL delta each
    value would have made relative to what the model actually uses today."""
    baseline_value = current_value(parameter)
    out: list[dict] = []
    for v in values:
        cf = compare(
            make_athlete, counterfactual={parameter: v}, baseline={parameter: baseline_value},
            weeks=weeks, window=window, capabilities=capabilities,
            baseline_label=f"{parameter}={baseline_value}", counterfactual_label=f"{parameter}={v}",
        )
        out.append({
            "parameter": parameter, "value": v, "baseline_value": baseline_value,
            "mean_convergence_improvement": cf.mean_convergence_improvement(),
            "convergence_improvement": cf.convergence_improvement,
            "oscillation_delta": cf.oscillation_delta,
        })
    return out
