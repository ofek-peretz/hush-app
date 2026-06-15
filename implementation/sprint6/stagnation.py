"""
M5 Stagnation Detection (DX-09 / Product Spec §12–§13). Sprint 6.

PURE, I/O-free model module (sibling of recommendation.py / decision.py). It reads the
per-capability LEARNED score history (fed by the athlete's real performance — M1/DX-01/02) and
reports, for each capability, a TREND STATE; computes an IMBALANCE (relative-weakness) read
across the five Class-A capabilities; and ASSEMBLES the weekly surfacing — at most ONE insight,
ONE advisory recommendation, and ONE acceptance-gated volume option — honoring a 4-week
anti-repetition cooldown.

This is DETECTION ONLY (binding Delta-Plan note: do NOT ship ES-013 active investigation with
M5). It is READ-ONLY and ADVISORY: it authors no load, changes no score, and applies nothing.
The single program change the spec permits — a volume adjustment within the established bands —
is surfaced here as an OPTION requiring the athlete's explicit acceptance (§13), never applied.

Trend states (§12): PROGRESSING / HOLDING / STALLED / REGRESSING / CALIBRATING. STALLED and
REGRESSING are the stagnation events. The classification gates on confidence (the 30/70 tiers),
on the capability's own recent-variance band (a flat must be genuine, not noise), and on
agreement (conflicting recent evidence suppresses the call).

CONCEPTUAL LOCATION: hush_model/stagnation.py.
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import statistics

from .constants import (
    STAGNATION_MIN_SESSIONS, STAGNATION_CONF_FLOOR, STAGNATION_CONF_ACTIONABLE,
    STAGNATION_AGREEMENT_GATE, STAGNATION_BAND_Z, STAGNATION_BAND_FLOOR,
    IMBALANCE_MEDIAN_GAP, STAGNATION_COOLDOWN_WEEKS, CAPABILITY_PRIORITY_ORDER,
)
from .decision import (
    CHANGE_STRATEGY, REASON_STAGNATION_STALLED, REASON_STAGNATION_REGRESSING,
    REASON_STAGNATION_IMBALANCE,
)
from .volume import next_volume_band


# ----------------------------- trend states -----------------------------
PROGRESSING = "Progressing"
HOLDING = "Holding"
STALLED = "Stalled"
REGRESSING = "Regressing"
CALIBRATING = "Calibrating"

STAGNATION_EVENTS = frozenset({STALLED, REGRESSING})

# confidence tiers (§12)
TIER_NONE = "none"          # conf < 30: no call at all
TIER_WATCH = "watch"        # 30 <= conf < 70: advisory "watch" / soft insight only
TIER_ACTIONABLE = "actionable"  # conf >= 70: eligible for an actionable recommendation


# ----------------------------- trend primitives (ported from sim/metrics.py) -----------------------------
# The harness (sim/metrics.py) keeps its own copies; "port into the model" (Delta Plan) means
# making them available to hush_model, which is the deployable. window_slope is SIGNED (the model
# needs direction; the harness's drift_vs_flat returns |slope|).

def window_slope(series: list[float]) -> float:
    """Signed OLS slope of `series` against its index (per-sample trend)."""
    n = len(series)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(series) / n
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, series)) / denom


def oscillation(series: list[float]) -> float:
    """Std-dev of the score over the window (instability magnitude)."""
    return statistics.pstdev(series) if len(series) > 1 else 0.0


def reversals(series: list[float]) -> int:
    """Sign reversals of the step-to-step change over the window."""
    diffs = [b - a for a, b in zip(series, series[1:]) if abs(b - a) > 1e-9]
    return sum(1 for a, b in zip(diffs, diffs[1:]) if a * b < 0)


# ----------------------------- entities -----------------------------

@dataclass(frozen=True)
class TrendReport:
    """One capability's read-only stagnation read over the trailing window."""
    capability: str
    state: str                  # one of the five trend states
    is_event: bool              # STALLED or REGRESSING
    tier: str                   # none / watch / actionable (confidence)
    slope: float                # signed per-sample OLS slope
    change: float               # modeled change across the window (slope * (n-1))
    band: float                 # recent-variance band the change is judged against
    agreement: float
    sessions_in_window: int
    lagging: bool = False       # set by the imbalance read
    watch_flat: bool = False    # 30–70 tier, flat/non-progressing -> soft-insight eligible


@dataclass(frozen=True)
class StagnationInsight:
    capability: str
    state: str
    text: str


@dataclass(frozen=True)
class StagnationRecommendation:
    capability: str
    decision_type: str          # CHANGE_STRATEGY
    reason: str                 # REASON_STAGNATION_*
    advisory: bool = True       # ALWAYS advisory — never applied


@dataclass(frozen=True)
class VolumeOption:
    capability: str
    from_band: str
    to_band: str
    requires_acceptance: bool = True   # §13: applied ONLY on explicit acceptance


@dataclass(frozen=True)
class StagnationAssessment:
    reports: dict                       # capability -> TrendReport
    insight: StagnationInsight | None
    recommendation: StagnationRecommendation | None
    volume_option: VolumeOption | None
    surfaced_capability: str | None


# ----------------------------- classification -----------------------------

def _tier(confidence: float) -> str:
    if confidence < STAGNATION_CONF_FLOOR:
        return TIER_NONE
    if confidence < STAGNATION_CONF_ACTIONABLE:
        return TIER_WATCH
    return TIER_ACTIONABLE


def classify_trend(
    capability: str,
    scores: list[float],
    confidence: float,
    sigma2_recent: float,
    agreement: float,
    sessions_in_window: int,
) -> TrendReport:
    """Classify one capability into a trend state (§12). Calibrating below 70 confidence or with
    insufficient data — never a stagnation event there ("still learning this capability"). For an
    eligible, confident capability: Progressing if the modeled window change clears its variance
    band upward; Holding if conflicting recent evidence (low agreement) suppresses the call;
    Regressing if it clears the band downward; otherwise Stalled (a genuine flat). The band makes
    the flat genuine-not-noise; the agreement gate honors "conflict suppresses the call."""
    tier = _tier(confidence)
    eligible = sessions_in_window >= STAGNATION_MIN_SESSIONS and len(scores) >= 2
    slope = window_slope(scores)
    change = slope * (len(scores) - 1) if len(scores) >= 2 else 0.0
    band = max(STAGNATION_BAND_FLOOR, STAGNATION_BAND_Z * math.sqrt(max(0.0, sigma2_recent)))

    if not eligible or confidence < STAGNATION_CONF_ACTIONABLE:
        # below 70 or insufficient data -> still learning; never a stagnation event.
        watch_flat = (tier == TIER_WATCH and eligible and change <= band)
        return TrendReport(
            capability, CALIBRATING, False, tier, slope, change, band, agreement,
            sessions_in_window, watch_flat=watch_flat,
        )

    if change > band:
        state = PROGRESSING
    elif agreement < STAGNATION_AGREEMENT_GATE:
        state = HOLDING                     # conflicting recent evidence suppresses the call
    elif change < -band:
        state = REGRESSING
    else:
        state = STALLED                     # genuine flat within the variance band
    return TrendReport(
        capability, state, state in STAGNATION_EVENTS, tier, slope, change, band,
        agreement, sessions_in_window,
    )


def detect_imbalance(
    scores_by_cap: dict[str, float], confidences: dict[str, float]
) -> dict[str, bool]:
    """§12 relative-weakness read: the median score across capabilities with confidence ≥ the
    floor; a capability `IMBALANCE_MEDIAN_GAP` or more below it is lagging. Capabilities below the
    confidence floor do not enter the median and are not flagged (the estimate is too uncertain)."""
    confident = {
        c: s for c, s in scores_by_cap.items()
        if confidences.get(c, 0.0) >= STAGNATION_CONF_FLOOR
    }
    if not confident:
        return {c: False for c in scores_by_cap}
    median = statistics.median(confident.values())
    lagging: dict[str, bool] = {}
    for c, s in scores_by_cap.items():
        lagging[c] = (
            confidences.get(c, 0.0) >= STAGNATION_CONF_FLOOR
            and (median - s) >= IMBALANCE_MEDIAN_GAP
        )
    return lagging


# ----------------------------- surfacing / assessment -----------------------------

def _cooldown_suppressed(marker, state: str, week: float) -> bool:
    """Anti-repetition (§12): a plateau already surfaced is not re-surfaced until its state
    changes or the 4-week cooldown elapses. `marker` is (last_week, last_state) or None."""
    if marker is None:
        return False
    last_week, last_state = marker
    if last_week is None:
        return False
    within_cooldown = (week - last_week) < STAGNATION_COOLDOWN_WEEKS
    return within_cooldown and last_state == state


def _priority_key(cap: str) -> int:
    try:
        return CAPABILITY_PRIORITY_ORDER.index(cap)
    except ValueError:
        return len(CAPABILITY_PRIORITY_ORDER)


_REASON_BY_STATE = {
    STALLED: REASON_STAGNATION_STALLED,
    REGRESSING: REASON_STAGNATION_REGRESSING,
}


def assess(
    reports: dict[str, TrendReport],
    lagging: dict[str, bool],
    markers: dict[str, tuple],
    week: float,
    weekly_volume: str,
) -> StagnationAssessment:
    """Assemble the weekly surfacing (§12 cadence): at most ONE insight, ONE advisory
    recommendation, ONE acceptance-gated volume option. The highest-priority target is a
    capability that is both lagging AND a stagnation event; cooldown suppresses re-surfacing an
    unchanged plateau. When nothing notable happened, all three are None (the program is left
    unchanged, §13)."""
    # attach lagging onto the reports for callers/insight text
    reports = {
        c: (r if r.lagging == lagging.get(c, False)
            else TrendReport(r.capability, r.state, r.is_event, r.tier, r.slope, r.change,
                             r.band, r.agreement, r.sessions_in_window,
                             lagging=lagging.get(c, False), watch_flat=r.watch_flat))
        for c, r in reports.items()
    }

    # actionable stagnation events not under cooldown
    candidates = [
        c for c, r in reports.items()
        if r.tier == TIER_ACTIONABLE and r.is_event
        and not _cooldown_suppressed(markers.get(c), r.state, week)
    ]
    # priority: lagging-and-event first, then any event; tie-break by capability priority order.
    candidates.sort(key=lambda c: (not reports[c].lagging, _priority_key(c)))
    target = candidates[0] if candidates else None

    if target is not None:
        r = reports[target]
        lag = " and lagging the group" if r.lagging else ""
        insight = StagnationInsight(
            target, r.state,
            f"{target} is {r.state.lower()} over the last weeks{lag}.",
        )
        recommendation = StagnationRecommendation(
            target, CHANGE_STRATEGY,
            REASON_STAGNATION_IMBALANCE if r.lagging else _REASON_BY_STATE[r.state],
        )
        to_band = next_volume_band(weekly_volume)
        volume_option = (
            VolumeOption(target, weekly_volume, to_band) if to_band is not None else None
        )
        return StagnationAssessment(reports, insight, recommendation, volume_option, target)

    # no actionable target — at most a soft insight (imbalance, or a watch-tier flat), no rec.
    soft = None
    lagging_flat = [
        c for c, r in reports.items()
        if r.lagging and r.state != PROGRESSING
        and not _cooldown_suppressed(markers.get(c), r.state, week)
    ]
    if lagging_flat:
        lagging_flat.sort(key=_priority_key)
        c = lagging_flat[0]
        soft = StagnationInsight(c, reports[c].state,
                                 f"{c} is lagging the group and not progressing — one to watch.")
    else:
        watch = [c for c, r in reports.items() if r.watch_flat]
        if watch:
            watch.sort(key=_priority_key)
            c = watch[0]
            soft = StagnationInsight(c, reports[c].state,
                                     f"{c} looks flat, but we're still learning it — watching.")
    return StagnationAssessment(reports, soft, None, None,
                                soft.capability if soft is not None else None)
