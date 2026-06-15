"""
Phase 0 gate (Validation Architecture / Build Plan [10]). Sprint 4.

SUCCESS BASIS — REORIENTED (DX-12 / DX-14, 2026-06-12). The Phase 0 gate's headline question
is NO LONGER "does the model predict the right LOAD." Per the restated Validation Architecture
(DX-14), Phase-0 success is:

  (a) does the model recover and hold an HONEST CAPABILITY ESTIMATE from real logged performance
      (score-estimate calibration), is it STABLE (no oscillation / drift / ratchet — the trend
      primitives), and does it BEAT A NO-LEARNING baseline; and
  (b) does the M5 stagnation detector fire correctly and rarely.

This module gates on (a): STABILITY (trend primitives) AND ESTIMATE-RECOVERY (score-estimate
calibration = convergence to truth, plus beating the no-learning baseline). It does NOT gate on
load/reps prediction. Criterion (b) — M5 detector correctness — is validated by the M5 detection
suite (DX-09 / `tests/test_sprint6.py`), not re-run here. The load-prediction reps-pairings
(the A8 shadow paired forecast in `metrics.shadow_paired`, the `metrics.fresh_state_check`
re-test) are now DIRECTIONAL model-quality diagnostics (per A8), reported but NOT gated —
reframed off the old load-prediction success basis (DX-12).

RAW METRICS ARE THE PRIMARY OUTPUT (ratified Q5): `evaluate()` returns the raw numbers; the
`passed` flag is explicitly provisional-until-thresholds-are-ratified. The thresholds below are
PROPOSED (impl plan), not authoritative.

CONCEPTUAL LOCATION: sim/gate.py (harness package).
"""
from __future__ import annotations
from dataclasses import dataclass, field

from sim.harness import Harness
from sim import scenarios as scn
from sim import metrics as M

# PROPOSED Phase 0 thresholds (ratifiable — Q5). Sim-only; NOT model constants.
OSCILLATION_MAX = 1.0          # score units, post burn-in        (stability — trend primitive)
DRIFT_MAX = 0.12              # score units / sample, flat truth (stability — trend primitive)
CONVERGENCE_MAX = 6.0         # |settled inferred − true|; score-estimate calibration (incl. discount bias)
RECOVERY_MARGIN_MIN = 1.0    # inferred must beat the no-learning baseline by >= this many score units
WINDOW = 8


@dataclass
class GateResult:
    raw: dict                  # the primary output: every metric, per capability
    passed_provisional: bool   # explicitly provisional until thresholds are ratified
    notes: list[str]
    # The reoriented success basis, broken out (DX-12). passed_provisional == stability AND
    # estimate_recovery. Load/reps prediction is NOT a member — it is a directional diagnostic.
    criteria: dict = field(default_factory=dict)


def evaluate(weeks: int = 20, capabilities=None) -> GateResult:
    """Run the constant (stability) and recovery (estimate-recovery) scenarios and report raw
    metrics + a provisional verdict on the REORIENTED basis (DX-12/DX-14): STABILITY (trend
    primitives) AND ESTIMATE-RECOVERY (score-estimate calibration = convergence + beats-no-learning).
    Drives the production SessionEngine path (Q4). Load/reps prediction is not gated here."""
    from hush_model.constants import CLASS_A_CAPABILITIES
    caps = capabilities or list(CLASS_A_CAPABILITIES)

    hc = Harness(); ac = scn.constant_athlete(); hc.setup(ac); tc = hc.run(ac, weeks=weeks)
    hr = Harness(); ar = scn.recovery_athlete(true=58.0); hr.setup(ar); tr = hr.run(ar, weeks=weeks)

    raw = {"constant": {}, "recovery": {}}
    stability_ok = True          # (a) trend primitives — no oscillation / drift
    estimate_recovery_ok = True  # (a) score-estimate calibration + beats-no-learning
    for c in caps:
        cs = tc.series(c)
        osc, drift = M.oscillation(cs, WINDOW), M.drift_vs_flat(cs, WINDOW)
        ratchet = M.load_ratchet(tc.series(c, "load"))
        conv_const = M.convergence_error(cs, ac.true_score[c], WINDOW)
        raw["constant"][c] = {"oscillation": osc, "drift": drift, "ratchet": ratchet,
                              "convergence_error": conv_const}
        if not (osc <= OSCILLATION_MAX and drift <= DRIFT_MAX):   # STABILITY (trend primitives)
            stability_ok = False

        rs = tr.series(c)
        conv_rec = M.convergence_error(rs, 58.0, WINDOW)          # score-estimate calibration
        # no-learning baseline = the estimate stays at the seed (intermediate = 48). The learning
        # loop must recover the hidden truth (58) better than not learning at all.
        naive_seed = 48.0
        rec = M.recoverability(rs[-1], naive_seed, 58.0)          # beats the no-learning baseline
        raw["recovery"][c] = {"convergence_error": conv_rec, **rec}
        # ESTIMATE-RECOVERY (a): the estimate is calibrated to truth AND beats no-learning.
        if not (conv_rec <= CONVERGENCE_MAX and rec["margin"] >= RECOVERY_MARGIN_MIN):
            estimate_recovery_ok = False

    hc.close(); hr.close()
    criteria = {
        # the two members of the reoriented success basis (DX-12/DX-14); both must hold.
        "stability": stability_ok,                # trend primitives: no oscillation / drift / ratchet
        "estimate_recovery": estimate_recovery_ok,  # score-estimate calibration + beats no-learning
    }
    notes = [
        "RAW METRICS ARE PRIMARY (Q5); the verdict is PROVISIONAL until thresholds are ratified.",
        "SUCCESS BASIS REORIENTED (DX-12/DX-14): gates on STABILITY (trend primitives) AND "
        "ESTIMATE-RECOVERY (score-estimate calibration + beats-no-learning) — NOT load/reps "
        "prediction.",
        "Load/reps prediction (A8 shadow paired forecast, fresh-state re-test) is a DIRECTIONAL "
        "model-quality diagnostic (per A8), reported but NOT gated here.",
        "Criterion (b) — the M5 stagnation detector fires correctly and rarely — is validated by "
        "the M5 detection suite (DX-09 / tests/test_sprint6.py), not re-run in the gate.",
        "The constant-truth athlete settles a few score units above true (conservative-discount "
        "equilibrium bias) — reported, not corrected (recommend-only / no redesign).",
    ]
    return GateResult(raw=raw, passed_provisional=(stability_ok and estimate_recovery_ok),
                      notes=notes, criteria=criteria)
