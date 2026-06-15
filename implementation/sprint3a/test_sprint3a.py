"""
Sprint 3A test suite — ES-006 Decision Hierarchy (governor over ES-005.1).

Covers:
  - the governor pure logic: stability guard (STABILITY_N), confidence gate,
    INCREASE/DECREASE step toward target, KEEP default/conflict (decision.py),
  - streak update on the SIGN of (fatigue-adjusted) surprise, and the proof that a
    fatigue-explained deficit cannot manufacture a DECREASE,
  - recommend() cold-start parity (decision_type/target_load additive; reason unchanged),
  - the no-double-discount property (gate ∘ discount, not discount²),
  - MR2: decision memory + streaks round-trip through persistence (anti-silent-failure),
  - migration 003 additive + idempotent,
  - the MULTI-SESSION sequencing harness: persisted, governed, cross-session — KEEP
    while the run is short, streak persists across sessions, an INCREASE eventually
    fires stepping the load by exactly one increment, and the audit carries target_load.

Imports use the assembled package layout (hush_model/ + sim/), as in Sprint 0/1/2.
decision.py assembles at the hush_model root; migration_003_decision.py under
hush_model/persistence/migrations/.
"""
from __future__ import annotations

from hush_model.constants import (
    STABILITY_N, DECISION_CONF_GATE, SURPRISE_DEADBAND, DEFAULT_EQUIPMENT_STEP_KG,
)
from hush_model.domain import CapabilityState
from hush_model.recommendation import recommend
from hush_model.decision import (
    govern, update_streaks, Decision,
    KEEP_LOAD, INCREASE_LOAD, DECREASE_LOAD,
    REASON_WORKING_SET_SEED, REASON_KEEP_DEFAULT, REASON_LOW_CONFIDENCE_HOLD,
    REASON_CONSISTENT_POSITIVE, REASON_UNEXPLAINED_REGRESSION,
)
from hush_model.fatigue import surprise
from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import StateRepository
from sim.synthetic_athlete import SyntheticAthlete


def approx(a, b, tol=1e-2):
    return abs(a - b) <= tol


# ============================================================
# 1. Stability guard / streak update (ES-006 "2-3 consistent observations")
# ============================================================

def test_streak_positive_increments_and_resets_negative():
    cp, cn = update_streaks(2, 1, surprise_value=3.0)
    assert (cp, cn) == (3, 0)

def test_streak_negative_increments_and_resets_positive():
    cp, cn = update_streaks(2, 0, surprise_value=-3.0)
    assert (cp, cn) == (0, 1)

def test_streak_neutral_within_deadband_breaks_run():
    # |surprise| < deadband: prediction ~ reality -> not evidence -> both reset
    cp, cn = update_streaks(2, 0, surprise_value=SURPRISE_DEADBAND * 0.5)
    assert (cp, cn) == (0, 0)


# ============================================================
# 2. The governor (decision.py) — pure branch logic
# ============================================================

def test_keep_is_default_below_stability_n():
    d = govern(held_load=40.0, target_load=62.5, confidence=80.0,
               consecutive_positive=STABILITY_N - 1, consecutive_negative=0,
               equipment_step=2.5)
    assert d.decision_type == KEEP_LOAD and d.reason == REASON_KEEP_DEFAULT
    assert d.recommended_weight == 40.0          # held

def test_increase_is_advisory_and_holds_load():
    # DX-03 (M3): the governor still COMPUTES the INCREASE lean (type + reason), but the load
    # step is NOT applied — the emitted load HOLDS at the held value.
    d = govern(held_load=40.0, target_load=62.5, confidence=80.0,
               consecutive_positive=STABILITY_N, consecutive_negative=0,
               equipment_step=2.5)
    assert d.decision_type == INCREASE_LOAD and d.reason == REASON_CONSISTENT_POSITIVE
    assert d.recommended_weight == 40.0          # advisory: held, NOT stepped to 42.5

def test_increase_advisory_holds_even_with_target_just_above():
    # DX-03: regardless of how far target sits above held, the advisory governor never moves
    # the emitted load (formerly this capped a one-step move at the target).
    d = govern(held_load=40.0, target_load=41.0, confidence=80.0,
               consecutive_positive=STABILITY_N, consecutive_negative=0,
               equipment_step=2.5)
    assert d.decision_type == INCREASE_LOAD
    assert d.recommended_weight == 40.0          # held, not stepped

def test_no_increase_when_target_not_above_held():
    d = govern(held_load=70.0, target_load=62.5, confidence=80.0,
               consecutive_positive=STABILITY_N + 2, consecutive_negative=0,
               equipment_step=2.5)
    assert d.decision_type == KEEP_LOAD          # nothing to release toward

def test_decrease_fires_on_negative_run_with_low_fatigue():
    d = govern(held_load=60.0, target_load=50.0, confidence=80.0,
               consecutive_positive=0, consecutive_negative=STABILITY_N,
               equipment_step=2.5)
    assert d.decision_type == DECREASE_LOAD and d.reason == REASON_UNEXPLAINED_REGRESSION
    assert d.recommended_weight == 60.0          # DX-03 advisory: held, NOT stepped down to 57.5

def test_low_confidence_holds_despite_strong_streak():
    d = govern(held_load=40.0, target_load=62.5, confidence=DECISION_CONF_GATE - 1,
               consecutive_positive=STABILITY_N + 5, consecutive_negative=0,
               equipment_step=2.5)
    assert d.decision_type == KEEP_LOAD and d.reason == REASON_LOW_CONFIDENCE_HOLD


# ============================================================
# 3. Fatigue cannot manufacture a DECREASE (surprise-based streak)
# ============================================================

def test_fatigue_explained_deficit_does_not_accrue_negative_streak():
    # underperformance fully explained by fatigue -> surprise ~ 0 -> neutral -> no DECREASE
    s = surprise(s_obs_raw=46.0, current_score=50.0, estimated_fatigue=4.0)
    assert abs(s) < SURPRISE_DEADBAND
    cp, cn = update_streaks(0, 2, surprise_value=s)
    assert cn == 0                                # the negative run is NOT advanced

def test_genuine_low_fatigue_deficit_accrues_negative_streak():
    s = surprise(s_obs_raw=46.0, current_score=50.0, estimated_fatigue=0.3)
    assert s < -SURPRISE_DEADBAND
    cp, cn = update_streaks(0, 2, surprise_value=s)
    assert cn == 3


# ============================================================
# 4. recommend() cold-start parity + no-double-discount
# ============================================================

def test_cold_start_is_unchanged_and_additive():
    st = CapabilityState("horizontal_push", 48.0, 10.0, sum_w=0.843)  # no decision memory
    rec = recommend(st, "bench_press", 1.0, 8)
    # legacy string preserved verbatim; new fields are additive
    assert rec.decision_reason == REASON_WORKING_SET_SEED
    assert rec.decision_reason == "working_set:target+RIR,discounted,floored"
    assert rec.decision_type == KEEP_LOAD
    assert rec.target_load == rec.recommended_weight   # emitted == target at cold start

def test_governor_increase_emits_learned_target_load():
    # DX-20 (M1) re-gold (was test_governor_increase_is_advisory_load_holds, which asserted
    # the emitted load HELD at 40.0). Memory present, strong positive run, high confidence,
    # target above the stale held anchor. The advisory INCREASE lean is still COMPUTED, but
    # the emitted load is now the score-derived target_load (learned capability) — future
    # programs are built from learned reality, never held at the historical anchor.
    st = CapabilityState("horizontal_push", 50.0, 80.0, sum_w=40.0,
                         last_recommended_weight=40.0, consecutive_positive=STABILITY_N)
    rec = recommend(st, "bench_press", 1.0, 8)
    assert rec.decision_type == INCREASE_LOAD           # advisory lean still computed
    assert rec.recommended_weight == rec.target_load    # DX-20: emit the learned target (was == 40.0 held)
    assert rec.recommended_weight > 40.0                # learned load rises above the stale anchor


# ============================================================
# 5. MR2: decision memory round-trips through persistence (anti-silent-failure)
# ============================================================

def test_decision_memory_round_trips():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)
    cap = repo.get_capability_state("a1", "horizontal_push")
    # mutate every new field to a non-default value and write through the sole writer
    cap.last_recommended_weight = 57.5
    cap.last_decision = INCREASE_LOAD
    cap.consecutive_positive = 2
    cap.consecutive_negative = 0
    cap.last_decision_week = 3.0
    with db.transaction() as conn:
        StateRepository(conn).write_capability_state("a1", cap)
    # read back on a fresh repo: a dropped column here would silently reset to default
    back = StateRepository(db.conn).get_capability_state("a1", "horizontal_push")
    assert back.last_recommended_weight == 57.5
    assert back.last_decision == INCREASE_LOAD
    assert back.consecutive_positive == 2
    assert back.consecutive_negative == 0
    assert back.last_decision_week == 3.0


# ============================================================
# 6. Migration 003 additive + idempotent
# ============================================================

def test_migration_003_additive_and_idempotent():
    import sqlite3
    from hush_model.persistence.migrations import migration_003_decision as m
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    # a Sprint-2-shaped capability_state (fatigue/variance cols, NO decision cols)
    conn.execute(
        "CREATE TABLE capability_state (athlete_id TEXT, capability TEXT, score REAL, "
        "confidence REAL, sum_w REAL, last_trained_at_week REAL, fatigue REAL, "
        "var_w REAL, var_ws REAL, var_ws2 REAL, updated_at TEXT)"
    )
    conn.execute(
        "CREATE TABLE recommendation (id TEXT, decision_reason TEXT)"
    )
    conn.execute(
        "CREATE TABLE state_update_log (id TEXT, reason TEXT)"
    )
    assert m.apply(conn) is True                      # did work
    cap_cols = {r[1] for r in conn.execute("PRAGMA table_info(capability_state)")}
    assert {"last_recommended_weight", "last_decision", "consecutive_positive",
            "consecutive_negative", "last_decision_week"} <= cap_cols
    rec_cols = {r[1] for r in conn.execute("PRAGMA table_info(recommendation)")}
    assert {"decision_type", "target_load"} <= rec_cols
    assert m.apply(conn) is False                     # idempotent


# ============================================================
# 7. Multi-session sequencing harness (the Sprint 3A condition-3 deliverable)
# ============================================================

def _seed_governed_athlete(svc, db, score, confidence, sum_w):
    """Onboard and pin horizontal_push to a known (score, confidence) for governance."""
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)
    cap = repo.get_capability_state("a1", "horizontal_push")
    cap.score = score
    cap.confidence = confidence
    cap.sum_w = sum_w
    with db.transaction() as conn:
        StateRepository(conn).write_capability_state("a1", cap)


def _run_governed_session(svc, db, week):
    """One governed single-set session; returns the emitted recommendation row."""
    sid = svc.start_session("a1", float(week))
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 1)
    truth = SyntheticAthlete("a1", "male", 30, "intermediate",
                             true_score={"horizontal_push": 60.0}, rep_noise_sd=0.0)
    svc.pipeline.report_set(
        "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, 1,
        truth.perform, week=float(week), govern=True,
    )
    return db.conn.execute(
        "SELECT recommended_weight, decision_type, target_load FROM recommendation "
        "ORDER BY created_at DESC, rowid DESC LIMIT 1"
    ).fetchone()


def test_multisession_stability_guard_then_program_tracks_learned_load():
    # DX-20 (M1) re-gold (was test_multisession_stability_guard_then_advisory_increase_holds_load,
    # which asserted the emitted load stayed FLAT at the seed working set for the whole run).
    # Post-DX-20 the emitted rested load is the score-derived target: as the athlete (true 60,
    # seeded 40) demonstrates capability, the score rises and the program tracks the learned
    # load upward. The advisory INCREASE lean still fires; the stability guard still governs it.
    db = Database(":memory:")
    svc = HushService(db)
    # seeded BELOW truth (60), confidence above the gate so the gate is not the binder
    _seed_governed_athlete(svc, db, score=40.0, confidence=55.0, sum_w=6.4)

    decisions = []
    weights = []
    for week in range(1, 16):
        row = _run_governed_session(svc, db, week)
        decisions.append(row["decision_type"])
        weights.append(row["recommended_weight"])

    # session 1 is the cold-start working-set seed (a KEEP)
    assert decisions[0] == KEEP_LOAD
    # the stability guard holds the LEAN before STABILITY_N consistent observations:
    # sessions 2..STABILITY_N (indices 1..STABILITY_N-1) must still be KEEP
    for i in range(1, STABILITY_N):
        assert decisions[i] == KEEP_LOAD, (i, decisions)
    assert decisions[:STABILITY_N] == [KEEP_LOAD] * STABILITY_N

    # the advisory INCREASE lean still fires across sessions (cross-session memory works)
    assert INCREASE_LOAD in decisions, decisions

    # DX-20: the program is built from learned reality — the emitted load is non-decreasing and
    # rises across the run toward the learned-capability load (was: flat at the seed for 15 weeks).
    assert all(w > 0 for w in weights)
    assert all(weights[i + 1] >= weights[i] for i in range(len(weights) - 1)), weights
    assert weights[-1] > weights[0], weights      # learned capability lifted the program

    # DX-20: on the rested governed path the emitted load IS the score-derived target.
    last = db.conn.execute(
        "SELECT target_load, recommended_weight FROM recommendation "
        "ORDER BY created_at DESC, rowid DESC LIMIT 1"
    ).fetchone()
    assert last["target_load"] == last["recommended_weight"]


def test_increase_resets_the_streak_on_fire():
    # ES-006: a fired INCREASE consumes its run — the streak resets so the same
    # evidence cannot immediately re-fire. The session AFTER an INCREASE must show a
    # streak strictly below STABILITY_N.
    db = Database(":memory:")
    svc = HushService(db)
    _seed_governed_athlete(svc, db, score=40.0, confidence=55.0, sum_w=6.4)
    repo = StateRepository(db.conn)
    fired_week = None
    for week in range(1, 16):
        row = _run_governed_session(svc, db, week)
        cp = repo.get_capability_state("a1", "horizontal_push").consecutive_positive
        if row["decision_type"] == INCREASE_LOAD:
            assert cp == 0, (week, cp)          # the run was consumed on fire
            fired_week = week
            break
    assert fired_week is not None               # an INCREASE did fire


def test_multisession_streak_persists_in_state():
    db = Database(":memory:")
    svc = HushService(db)
    _seed_governed_athlete(svc, db, score=40.0, confidence=55.0, sum_w=6.4)
    repo = StateRepository(db.conn)
    # run exactly STABILITY_N sessions; with INCREASE first possible only on the
    # (STABILITY_N + 1)-th, the positive run is intact and persisted in capability_state
    for week in range(1, STABILITY_N + 1):
        _run_governed_session(svc, db, week)
    cap = repo.get_capability_state("a1", "horizontal_push")
    assert cap.consecutive_positive == STABILITY_N
    assert cap.consecutive_negative == 0
    assert cap.last_recommended_weight is not None
