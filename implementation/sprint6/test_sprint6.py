"""
Sprint 6 / DX-09 tests — M5 stagnation detection (Product Spec §12–§13).

Unit-level (deterministic) coverage of the five trend states, the imbalance read, the
≤1-insight / ≤1-recommendation / ≤1-volume-option surfacing with its priority + cooldown, and
an end-to-end `StagnationEngine.weekly_review` over a persisted history that is verified
READ-ONLY (M5 changes no model state). Plain-assert functions (no pytest).
"""
from __future__ import annotations

from hush_model.constants import (
    STAGNATION_MIN_SESSIONS, STAGNATION_BAND_FLOOR, IMBALANCE_MEDIAN_GAP,
    STAGNATION_COOLDOWN_WEEKS,
)
from hush_model.decision import CHANGE_STRATEGY
from hush_model.stagnation import (
    classify_trend, detect_imbalance, assess, TrendReport,
    PROGRESSING, HOLDING, STALLED, REGRESSING, CALIBRATING,
)
from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import StateRepository
from hush_model.persistence.stagnation_service import StagnationEngine, StagnationRepository
from sim.synthetic_athlete import SyntheticAthlete


# ----------------------------- classify_trend: the five states -----------------------------

_N = STAGNATION_MIN_SESSIONS

def test_classify_progressing():
    r = classify_trend("horizontal_push", [50, 51, 52, 53, 54, 55],
                       confidence=80.0, sigma2_recent=0.1, agreement=0.95, sessions_in_window=_N)
    assert r.state == PROGRESSING and not r.is_event


def test_classify_stalled_is_event():
    r = classify_trend("horizontal_push", [50.0] * 6,
                       confidence=80.0, sigma2_recent=0.05, agreement=0.95, sessions_in_window=_N)
    assert r.state == STALLED and r.is_event


def test_classify_regressing_is_event():
    r = classify_trend("horizontal_push", [55, 54, 53, 52, 51, 50],
                       confidence=80.0, sigma2_recent=0.1, agreement=0.95, sessions_in_window=_N)
    assert r.state == REGRESSING and r.is_event


def test_classify_low_agreement_suppresses_to_holding():
    # flat history that WOULD be Stalled, but conflicting recent evidence (low agreement) suppresses.
    r = classify_trend("horizontal_push", [50.0] * 6,
                       confidence=80.0, sigma2_recent=0.05, agreement=0.2, sessions_in_window=_N)
    assert r.state == HOLDING and not r.is_event


def test_classify_calibrating_below_confidence_or_insufficient_data():
    low_conf = classify_trend("horizontal_push", [50.0] * 6,
                              confidence=55.0, sigma2_recent=0.05, agreement=0.95, sessions_in_window=_N)
    assert low_conf.state == CALIBRATING and not low_conf.is_event
    few_sessions = classify_trend("horizontal_push", [50.0] * 6,
                                  confidence=80.0, sigma2_recent=0.05, agreement=0.95, sessions_in_window=_N - 1)
    assert few_sessions.state == CALIBRATING and not few_sessions.is_event


# ----------------------------- imbalance -----------------------------

def test_imbalance_flags_capabilities_below_the_confident_median():
    scores = {"a": 60.0, "b": 55.0, "c": 50.0, "d": 50.0 - IMBALANCE_MEDIAN_GAP, "e": 30.0}
    confs = {"a": 80, "b": 80, "c": 80, "d": 80, "e": 80}      # median of [60,55,50,45,30] = 50
    lag = detect_imbalance(scores, confs)
    assert lag["d"] is True and lag["e"] is True                # >= gap below the median
    assert lag["a"] is False and lag["c"] is False


def test_imbalance_median_excludes_low_confidence_capabilities():
    scores = {"a": 60.0, "b": 58.0, "c": 20.0}
    confs = {"a": 80, "b": 80, "c": 10}                         # c (conf<30) excluded from median + never flagged
    lag = detect_imbalance(scores, confs)
    assert lag["c"] is False


# ----------------------------- assess: ≤1 insight / ≤1 rec / ≤1 volume option + priority -----------------------------

def _report(cap, state, tier="actionable", is_event=None, lagging=False):
    ev = state in (STALLED, REGRESSING) if is_event is None else is_event
    return TrendReport(cap, state, ev, tier, 0.0, 0.0, STAGNATION_BAND_FLOOR, 0.95, _N, lagging=lagging)


def test_assess_surfaces_one_of_each_for_a_lagging_stalled_target():
    reports = {
        "knee_dominant": _report("knee_dominant", PROGRESSING),
        "horizontal_push": _report("horizontal_push", STALLED),
        "horizontal_pull": _report("horizontal_pull", PROGRESSING),
    }
    lagging = {"knee_dominant": False, "horizontal_push": True, "horizontal_pull": False}
    a = assess(reports, lagging, markers={}, week=10.0, weekly_volume="moderate")
    assert a.surfaced_capability == "horizontal_push"
    assert a.insight is not None and a.insight.capability == "horizontal_push"
    assert a.recommendation is not None and a.recommendation.decision_type == CHANGE_STRATEGY
    assert a.recommendation.advisory is True                    # NEVER applied
    assert a.volume_option is not None
    assert (a.volume_option.from_band, a.volume_option.to_band) == ("moderate", "high")
    assert a.volume_option.requires_acceptance is True


def test_assess_prefers_lagging_event_over_non_lagging_event():
    reports = {
        "knee_dominant": _report("knee_dominant", STALLED, lagging=False),
        "horizontal_push": _report("horizontal_push", REGRESSING, lagging=True),
    }
    lagging = {"knee_dominant": False, "horizontal_push": True}
    a = assess(reports, lagging, markers={}, week=10.0, weekly_volume="high")
    assert a.surfaced_capability == "horizontal_push"           # lagging-and-event wins
    assert a.volume_option is None                              # already at the top band


def test_assess_nothing_notable_leaves_everything_none():
    reports = {
        "knee_dominant": _report("knee_dominant", PROGRESSING),
        "horizontal_push": _report("horizontal_push", CALIBRATING, tier="watch", is_event=False),
    }
    lagging = {"knee_dominant": False, "horizontal_push": False}
    a = assess(reports, lagging, markers={}, week=10.0, weekly_volume="moderate")
    assert a.insight is None and a.recommendation is None and a.volume_option is None
    assert a.surfaced_capability is None


# ----------------------------- cooldown / anti-repetition -----------------------------

def test_cooldown_suppresses_unchanged_plateau_then_reopens_on_state_change():
    reports = {"horizontal_push": _report("horizontal_push", STALLED, lagging=True)}
    lagging = {"horizontal_push": True}
    # surfaced recently with the SAME state -> suppressed within the cooldown window
    recent_same = {"horizontal_push": (10.0 - (STAGNATION_COOLDOWN_WEEKS - 1.0), STALLED)}
    a = assess(reports, lagging, markers=recent_same, week=10.0, weekly_volume="moderate")
    assert a.recommendation is None and a.surfaced_capability != "horizontal_push"
    # a DIFFERENT prior state re-opens surfacing even within the window
    recent_diff = {"horizontal_push": (10.0 - 1.0, PROGRESSING)}
    b = assess(reports, lagging, markers=recent_diff, week=10.0, weekly_volume="moderate")
    assert b.surfaced_capability == "horizontal_push"
    # beyond the cooldown, the same state surfaces again
    old_same = {"horizontal_push": (10.0 - (STAGNATION_COOLDOWN_WEEKS + 1.0), STALLED)}
    c = assess(reports, lagging, markers=old_same, week=10.0, weekly_volume="moderate")
    assert c.surfaced_capability == "horizontal_push"


# ----------------------------- end-to-end weekly_review (read-only) -----------------------------

def test_weekly_review_detects_event_and_is_read_only():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a", "male", 30, "intermediate")
    # confident single capability; the athlete is genuinely weaker than seeded, so the trend is
    # flat-or-declining (a stagnation event), never an upward Progressing.
    db.conn.execute("UPDATE capability_state SET confidence=80, sum_w=40 WHERE athlete_id='a'")
    db.conn.commit()
    cap0 = StateRepository(db.conn).get_capability_state("a", "horizontal_push")
    truth = SyntheticAthlete("a", "male", 30, "intermediate",
                             true_score={"horizontal_push": cap0.score - 3.0}, rep_noise_sd=0.0)
    # 8 sessions inside a 4-week window (≥6 eligibility), training the one capability.
    for w in (4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5):
        sid = svc.start_session("a", w)
        bid = svc.add_block(sid, "a", "horizontal_push", "bench_press", 1.0, 0, 8, 1)
        svc.pipeline.report_set_fatigue_aware(
            "a", sid, bid, "horizontal_push", "bench_press", 1.0, 8, 1,
            truth.perform, week=w, govern=False)
        svc.complete_session(sid, "a")

    before = StateRepository(db.conn).get_capability_state("a", "horizontal_push")
    eng = StagnationEngine(db)
    a = eng.weekly_review("a", week=8.0)

    rep = a.reports["horizontal_push"]
    assert rep.sessions_in_window >= STAGNATION_MIN_SESSIONS    # the history read works
    assert rep.state != CALIBRATING                             # enough data + confidence to judge
    assert rep.is_event                                         # flat/declining -> Stalled or Regressing
    assert a.surfaced_capability == "horizontal_push"
    assert a.recommendation is not None and a.recommendation.decision_type == CHANGE_STRATEGY

    # READ-ONLY: the weekly review mutated no model state.
    after = StateRepository(db.conn).get_capability_state("a", "horizontal_push")
    assert after.score == before.score
    assert after.confidence == before.confidence
    assert after.sum_w == before.sum_w
    # the cooldown marker WAS written for the surfaced capability (the only write).
    marker = StagnationRepository(db.conn).get_marker("a", "horizontal_push")
    assert marker is not None and marker[0] == 8.0 and marker[1] == rep.state
    db.close()
