"""
Forecast calibration tracking (Phase-0 measurement instrument). Sprint 7.

A forecast is calibrated when its stated confidence MATCHES its empirical hit rate: of all the
times the model said "70% chance you hit this", ~70% should actually hit. The model issues
forecasts that carry a confidence (recommendation.prediction_confidence) and — via the Monte
Carlo instrument (sim/montecarlo.py) — a genuine hit probability. This module RESOLVES those
forecasts against outcomes and scores how well the stated probability tracked reality, over a
window or over time.

This is distinct from sim/calibration.py, which calibrates MODEL PARAMETERS (sweeps kappa/tau/
sigma2_ref). Here we calibrate FORECASTS — the predictive distribution's reliability — and adopt
nothing. It is a pure instrument: records in, reliability numbers out; it never writes the model.

THREE STANDARD INSTRUMENTS, all over records of (predicted_prob p in [0,1], outcome in {0,1}):

  reliability table : bin predictions by p; per bin report mean predicted p vs empirical hit rate
                      and count. The reliability diagram in tabular form (perfect = the diagonal).
  Brier score       : mean( (p - outcome)^2 ). Lower is better; 0 is perfect, 0.25 is the
                      always-0.5 forecaster. The headline scalar.
  expected calib err: count-weighted mean |mean_p - hit_rate| across bins (ECE). The single
                      "how far off the diagonal" number.

CONFIDENCE AS A PROBABILITY. The model's `prediction_confidence` is 0..100 ESTIMATE confidence,
not by construction a hit probability — so `from_resolved_forecasts` records it as p=conf/100 and
the reliability table then MEASURES whether that reading holds (it is the hypothesis under test,
not an assumption). For a true probability, feed Monte Carlo `p_hit_target` instead.

CONCEPTUAL LOCATION: sim/forecast_calibration.py (harness package; pure, no model writes).
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class CalibrationBin:
    lo: float                 # bin lower edge (inclusive)
    hi: float                 # bin upper edge (inclusive on the last bin)
    count: int
    mean_predicted: float     # mean forecast probability of the predictions that fell in the bin
    hit_rate: float           # empirical fraction that actually hit
    gap: float                # mean_predicted - hit_rate (signed; +ve = over-confident)


@dataclass
class CalibrationReport:
    n: int
    base_rate: float          # overall empirical hit rate (the "climate")
    brier: float
    ece: float
    bins: list[CalibrationBin] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "n": self.n, "base_rate": self.base_rate, "brier": self.brier, "ece": self.ece,
            "bins": [b.__dict__ for b in self.bins],
        }


def _validate(records: list[tuple[float, int]]) -> None:
    for p, o in records:
        if not (0.0 <= p <= 1.0):
            raise ValueError(f"predicted probability {p} out of [0,1]")
        if o not in (0, 1):
            raise ValueError(f"outcome {o} must be 0 or 1")


def brier_score(records: list[tuple[float, int]]) -> float:
    """Mean squared error of the forecast probabilities vs the binary outcomes."""
    if not records:
        return float("nan")
    _validate(records)
    return sum((p - o) ** 2 for p, o in records) / len(records)


def base_rate(records: list[tuple[float, int]]) -> float:
    """Overall empirical hit rate."""
    if not records:
        return float("nan")
    return sum(o for _, o in records) / len(records)


def reliability_table(records: list[tuple[float, int]], n_bins: int = 10) -> list[CalibrationBin]:
    """Group predictions into `n_bins` equal-width probability bins over [0,1]; per occupied bin
    report mean predicted prob, empirical hit rate, gap and count. Empty bins are omitted."""
    if n_bins <= 0:
        raise ValueError("n_bins must be positive")
    _validate(records)
    buckets: list[list[tuple[float, int]]] = [[] for _ in range(n_bins)]
    for p, o in records:
        # p == 1.0 belongs to the last bin (edges are half-open except the top).
        idx = min(int(p * n_bins), n_bins - 1)
        buckets[idx].append((p, o))
    out: list[CalibrationBin] = []
    for i, b in enumerate(buckets):
        if not b:
            continue
        mp = sum(p for p, _ in b) / len(b)
        hr = sum(o for _, o in b) / len(b)
        out.append(CalibrationBin(
            lo=i / n_bins, hi=(i + 1) / n_bins, count=len(b),
            mean_predicted=mp, hit_rate=hr, gap=mp - hr,
        ))
    return out


def expected_calibration_error(records: list[tuple[float, int]], n_bins: int = 10) -> float:
    """ECE: count-weighted mean |mean_predicted - hit_rate| across occupied bins."""
    if not records:
        return float("nan")
    table = reliability_table(records, n_bins)
    n = len(records)
    return sum(b.count * abs(b.gap) for b in table) / n


def report(records: list[tuple[float, int]], n_bins: int = 10) -> CalibrationReport:
    """The full calibration report (Brier + ECE + reliability table + base rate)."""
    return CalibrationReport(
        n=len(records), base_rate=base_rate(records), brier=brier_score(records),
        ece=expected_calibration_error(records, n_bins),
        bins=reliability_table(records, n_bins),
    )


# ----------------------------- adapters from the model's own forecasts -----------------------------

# Resolution states produced by app/routers/reads.py::_resolve_forecast. Only decided forecasts
# enter calibration; PENDING (not yet resolved) and VOID (basis lost — skipped/replaced block)
# carry no outcome and are excluded.
_HIT_STATES = {"HIT"}
_MISS_STATES = {"MISS"}
_UNRESOLVED = {"PENDING", "VOID"}


def from_resolved_forecasts(
    forecasts: list[dict], *, prob_key: str = "prediction_confidence",
    state_key: str = "state",
) -> list[tuple[float, int]]:
    """Build calibration records from resolved forecast dicts (the shape app `/forecasts` derives,
    or any equivalent). HIT->1, MISS->0; PENDING/VOID dropped. `prob_key` reads the predicted
    probability: a 0..100 confidence is normalized by 100 (the confidence-as-probability reading
    the table then tests); a value already in [0,1] is taken as-is."""
    records: list[tuple[float, int]] = []
    for f in forecasts:
        state = str(f.get(state_key, "")).upper()
        if state in _UNRESOLVED:
            continue
        if state in _HIT_STATES:
            outcome = 1
        elif state in _MISS_STATES:
            outcome = 0
        else:
            continue
        raw = f.get(prob_key)
        if raw is None:
            continue
        p = float(raw)
        if p > 1.0:                 # a 0..100 confidence -> probability
            p = p / 100.0
        p = min(1.0, max(0.0, p))
        records.append((p, outcome))
    return records


def calibration_over_time(
    timed_records: list[tuple[float, float, int]], *, window: int = 50, step: int | None = None,
    n_bins: int = 10,
) -> list[dict]:
    """Track calibration DRIFT: sort (time, p, outcome) by time, then report a rolling-window
    Brier + ECE so you can see reliability improve or decay as the model accumulates evidence.
    `window` = forecasts per window; `step` = stride (defaults to `window`, i.e. non-overlapping)."""
    if window <= 0:
        raise ValueError("window must be positive")
    step = step or window
    ordered = sorted(timed_records, key=lambda r: r[0])
    out: list[dict] = []
    for start in range(0, max(1, len(ordered) - window + 1), step):
        chunk = ordered[start:start + window]
        if len(chunk) < window:
            break
        recs = [(p, o) for _, p, o in chunk]
        out.append({
            "start_time": chunk[0][0], "end_time": chunk[-1][0], "n": len(recs),
            "brier": brier_score(recs), "ece": expected_calibration_error(recs, n_bins),
            "base_rate": base_rate(recs),
        })
    return out
