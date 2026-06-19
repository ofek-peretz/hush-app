"""
Monte Carlo predictive distribution (Phase-0 measurement instrument). Sprint 7.

The frozen model emits POINT predictions: prediction.predict_reps_to_failure decodes a
single latent `score` through ReferenceStrength + Epley to one reps-to-failure number. That
number carries no uncertainty, even though the model already KNOWS its own uncertainty —
the capability state holds `sum_w` (accumulated precision) and the variance accumulators hold
the recent per-observation variance. This module reads that uncertainty and propagates it,
by simulation, into a predictive DISTRIBUTION of outcomes.

It is a pure, read-only INSTRUMENT over the frozen model (like sim/metrics.py): it imports the
model's own decoders and NEVER writes capability_state, constants.py, or any production path. It
changes nothing the athlete sees; it measures the spread the point prediction hides.

POSTERIOR OVER THE LATENT SCORE (the only modelling choice, stated explicitly).
The model's score is a precision-weighted mean of de-biased observations with total precision
`sum_w` (state_update.apply_evidence). Reading each observation as carrying variance
`sigma2_obs` (score^2), the precision-weighted mean has the standard normal-normal posterior
variance

    Var(score) = sigma2_obs / sum_w        ->   sd_post = sqrt(sigma2_obs / sum_w).

`sigma2_obs` defaults to SIGMA2_REF — the SAME reference variance the model's agreement factor
is scaled against (variance.agreement) — so the instrument speaks the model's own units. A
caller MAY pass an athlete's TRACKED recent variance (sim/volatility.py) instead, tying the two
instruments together: a volatile athlete gets a wider predictive band at the same `sum_w`.

PROPAGATION. For each of `n` draws: sample S ~ Normal(score, sd_post); decode the same way the
model does (ReferenceStrength_c(S - fatigue) * difficulty_factor -> rm1; Epley reps@load), then
add independent per-set rep noise. Reps are clamped at 0 (you cannot do negative reps). The
result is summarized into mean / sd / quantiles and the probability of hitting a target.

DETERMINISM. Every draw stream comes from an explicit `random.Random(seed)` (default seed 0), so
two identical calls return identical numbers — the determinism discipline the harness uses (R4).

CONCEPTUAL LOCATION: sim/montecarlo.py (harness package; imports the frozen model read-only).
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import random
import statistics

from hush_model.constants import SIGMA2_REF
from hush_model.capability.reference_strength import reference_strength
from hush_model.capability.epley import reps_to_failure

# Below this accumulated precision there is essentially no information; the posterior is treated
# as maximally diffuse rather than dividing by ~0. (A seeded, untrained capability sits here.)
_MIN_PRECISION: float = 1e-6


def score_posterior_sd(sum_w: float, sigma2_obs: float = SIGMA2_REF) -> float:
    """Posterior SD of the latent score (score units) from accumulated precision `sum_w`.

    sd_post = sqrt(sigma2_obs / sum_w). With `sum_w` at/below the precision floor the estimate is
    uninformed, so the SD is reported as +inf (the caller's draws become maximally diffuse)."""
    if sigma2_obs < 0.0:
        raise ValueError("sigma2_obs must be non-negative")
    if sum_w <= _MIN_PRECISION:
        return math.inf
    return math.sqrt(sigma2_obs / sum_w)


@dataclass
class RepsForecast:
    """Predictive distribution of reps-to-failure for one (exercise, load) prescription."""
    n: int
    load: float
    target_reps: int
    mean: float
    sd: float
    p10: float
    p50: float
    p90: float
    p_hit_target: float          # P(reps_to_failure >= target_reps): the model's own hit odds
    score_sd: float              # the posterior SD that drove the spread (diagnostic)

    def as_dict(self) -> dict:
        return {
            "n": self.n, "load": self.load, "target_reps": self.target_reps,
            "mean": self.mean, "sd": self.sd, "p10": self.p10, "p50": self.p50,
            "p90": self.p90, "p_hit_target": self.p_hit_target, "score_sd": self.score_sd,
        }


def _quantile(sorted_xs: list[float], q: float) -> float:
    """Linear-interpolated quantile of an already-sorted list (q in [0,1])."""
    if not sorted_xs:
        return float("nan")
    if len(sorted_xs) == 1:
        return sorted_xs[0]
    pos = q * (len(sorted_xs) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return sorted_xs[lo]
    frac = pos - lo
    return sorted_xs[lo] * (1.0 - frac) + sorted_xs[hi] * frac


def simulate_score(
    score: float, sum_w: float, *, sigma2_obs: float = SIGMA2_REF,
    n: int = 2000, rng: random.Random | None = None, seed: int = 0,
) -> list[float]:
    """Draw `n` samples of the latent score from its posterior Normal(score, sd_post^2).

    When the capability is uninformed (sd_post = inf) every draw collapses to the point `score`
    (no information to spread on) — the honest degenerate case, not a crash."""
    rng = rng or random.Random(seed)
    sd = score_posterior_sd(sum_w, sigma2_obs)
    if not math.isfinite(sd) or sd == 0.0:
        return [float(score)] * n
    return [rng.gauss(score, sd) for _ in range(n)]


def simulate_reps_to_failure(
    capability: str, score: float, sum_w: float, difficulty_factor: float, load: float,
    *, target_reps: int, fatigue: float = 0.0, sigma2_obs: float = SIGMA2_REF,
    rep_noise_sd: float = 0.8, n: int = 2000, rng: random.Random | None = None, seed: int = 0,
) -> RepsForecast:
    """Monte Carlo predictive distribution of reps-to-failure at `load` for this exercise.

    Mirrors prediction.predict_reps_to_failure's decode path (score - fatigue -> RM1 -> Epley)
    once per score draw, then adds independent per-set rep noise (default SD 0.8 reps, the
    synthetic-athlete default). `target_reps` defines the hit event reps >= target. Pure / seeded.
    """
    if n <= 0:
        raise ValueError("n must be positive")
    rng = rng or random.Random(seed)
    score_draws = simulate_score(
        score, sum_w, sigma2_obs=sigma2_obs, n=n, rng=rng,
    )
    reps: list[float] = []
    for s in score_draws:
        rm1 = reference_strength(capability, s - fatigue) * difficulty_factor
        r = reps_to_failure(load, rm1)
        if rep_noise_sd > 0.0:
            r += rng.gauss(0.0, rep_noise_sd)
        reps.append(max(0.0, r))
    reps.sort()
    hits = sum(1 for r in reps if r >= target_reps)
    return RepsForecast(
        n=n, load=load, target_reps=target_reps,
        mean=statistics.fmean(reps),
        sd=statistics.pstdev(reps) if len(reps) > 1 else 0.0,
        p10=_quantile(reps, 0.10), p50=_quantile(reps, 0.50), p90=_quantile(reps, 0.90),
        p_hit_target=hits / n,
        score_sd=score_posterior_sd(sum_w, sigma2_obs),
    )


def simulate_one_rep_max(
    capability: str, score: float, sum_w: float, difficulty_factor: float = 1.0,
    *, fatigue: float = 0.0, sigma2_obs: float = SIGMA2_REF,
    n: int = 2000, rng: random.Random | None = None, seed: int = 0,
) -> dict:
    """Predictive distribution of the exercise 1RM-equivalent (kg). Same posterior, decoded to
    load rather than reps — useful for an uncertainty band on the prescribed weight itself."""
    rng = rng or random.Random(seed)
    draws = [
        reference_strength(capability, s - fatigue) * difficulty_factor
        for s in simulate_score(score, sum_w, sigma2_obs=sigma2_obs, n=n, rng=rng)
    ]
    draws.sort()
    return {
        "n": n,
        "mean": statistics.fmean(draws),
        "sd": statistics.pstdev(draws) if len(draws) > 1 else 0.0,
        "p10": _quantile(draws, 0.10), "p50": _quantile(draws, 0.50), "p90": _quantile(draws, 0.90),
    }


def prob_at_least(forecast_reps: list[float], target_reps: int) -> float:
    """P(reps >= target) from a raw reps sample — the hit-probability primitive the forecast
    calibration tracker (sim/forecast_calibration.py) consumes as its predicted probability."""
    if not forecast_reps:
        return float("nan")
    return sum(1 for r in forecast_reps if r >= target_reps) / len(forecast_reps)
