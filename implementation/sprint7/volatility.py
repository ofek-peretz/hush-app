"""
Volatility tracking (Phase-0 measurement instrument). Sprint 7.

The frozen model already MEASURES short-term volatility: variance.py keeps decay-weighted moments
of recent de-biased observations and turns them into `recent_variance`, which the agreement factor
consumes to suppress confidence under conflict (ES-010 Part C). But the model CONSUMES that number
instantaneously and discards it — it is never surfaced as a tracked, per-(athlete, capability)
signal over time. This module reconstructs it as a SERIES and classifies its regime.

The reconstruction reuses the model's OWN primitives verbatim — variance.update_moments,
variance.recent_variance, and capability.decay.decay — so the tracked volatility is, by
construction, the very quantity the model uses internally (no parallel re-definition). The only
additions are (a) treating it as a time series, (b) reporting it as an interpretable SD in score
units (sqrt of the variance), and (c) a regime label measured against SIGMA2_REF — the same scale
the agreement factor is judged on. It writes nothing: replay the observations, read the volatility.

REGIME (sim-only thresholds; PROVISIONAL / ratifiable — NOT model constants). With ratio =
recent_variance / SIGMA2_REF (agreement = 1 - min(ratio, 1), so ratio>=1 fully suppresses
confidence):
    ratio <  STABLE_FRAC   -> "stable"     (agreement ~ 1; the model trusts the evidence)
    STABLE_FRAC <= ratio<1 -> "elevated"   (agreement falling; the model is hedging)
    ratio >= 1             -> "high"        (agreement floored at 0; evidence is in open conflict)
Below VARIANCE_MIN_PRECISION accumulated weight there is too little evidence to judge — regime
"insufficient" (matches variance.agreement's own cold-start guard, which returns agreement 1.0).

CONCEPTUAL LOCATION: sim/volatility.py (harness package; imports the frozen model read-only).
"""
from __future__ import annotations
from dataclasses import dataclass, field
import math

from hush_model.constants import SIGMA2_REF, VARIANCE_MIN_PRECISION
from hush_model.variance import update_moments, recent_variance
from hush_model.capability.decay import decay

# Sim-only regime cut (PROVISIONAL, ratifiable). The fraction of SIGMA2_REF below which the
# agreement factor is still essentially 1 (the model is not yet hedging). NOT a model constant.
STABLE_FRAC: float = 1.0 / 3.0
# Minimum change in volatility (score-unit SD) to call a trend a rise/fall rather than flat.
_TREND_EPS: float = 0.05


def regime(rv: float, var_w: float, *, sigma2_ref: float = SIGMA2_REF,
           min_precision: float = VARIANCE_MIN_PRECISION) -> str:
    """Classify a recent-variance value into stable / elevated / high / insufficient (see module
    docstring). `var_w` is the accumulated precision — the cold-start guard mirrors agreement()."""
    if var_w < min_precision:
        return "insufficient"
    ratio = rv / sigma2_ref if sigma2_ref > 0.0 else math.inf
    if ratio < STABLE_FRAC:
        return "stable"
    if ratio < 1.0:
        return "elevated"
    return "high"


@dataclass
class VolatilitySample:
    week: float
    recent_variance: float
    volatility: float          # sqrt(recent_variance): interpretable SD in score units
    regime: str


@dataclass
class VolatilityTrack:
    capability: str
    samples: list[VolatilitySample] = field(default_factory=list)

    def series(self) -> list[float]:
        return [s.volatility for s in self.samples]

    def current(self) -> VolatilitySample | None:
        return self.samples[-1] if self.samples else None

    def peak(self) -> VolatilitySample | None:
        return max(self.samples, key=lambda s: s.volatility) if self.samples else None

    def trend(self, window: int = 4) -> str:
        """Direction of volatility over the last `window` samples: rising / falling / flat.
        Compares the latest volatility to the one `window-1` samples back (beyond _TREND_EPS)."""
        s = self.samples
        if len(s) < 2:
            return "flat"
        ref = s[-min(window, len(s))]
        delta = s[-1].volatility - ref.volatility
        if delta > _TREND_EPS:
            return "rising"
        if delta < -_TREND_EPS:
            return "falling"
        return "flat"


def track_volatility(
    capability: str,
    observations: list[tuple[float, float, float]],
    *, sigma2_ref: float = SIGMA2_REF, min_precision: float = VARIANCE_MIN_PRECISION,
) -> VolatilityTrack:
    """Replay an athlete's de-biased observation stream into a volatility time series.

    `observations` = [(week, s_obs, weight), ...] in chronological order — `s_obs` the de-biased
    observation the blend consumed, `weight` its evidence weight. Between consecutive observations
    the moments are forgotten by the model's evidence decay over the elapsed weeks (decay(dt)),
    exactly as variance.update_moments expects (1.0 within a session, <1.0 across rest). One
    volatility sample is emitted per observation. Pure; reuses the frozen primitives."""
    track = VolatilityTrack(capability=capability)
    var_w = var_ws = var_ws2 = 0.0
    prev_week: float | None = None
    for week, s_obs, weight in observations:
        dt = 0.0 if prev_week is None else max(0.0, week - prev_week)
        decay_factor = 1.0 if prev_week is None else decay(dt)
        var_w, var_ws, var_ws2 = update_moments(
            var_w, var_ws, var_ws2, decay_factor, s_obs, weight,
        )
        rv = recent_variance(var_w, var_ws, var_ws2)
        track.samples.append(VolatilitySample(
            week=week, recent_variance=rv, volatility=math.sqrt(rv),
            regime=regime(rv, var_w, sigma2_ref=sigma2_ref, min_precision=min_precision),
        ))
        prev_week = week
    return track
