"""
Sprint 3B-1 test suite — Foundation (ES-002 catalog / StrategyState / PreferenceState /
calibration) + L2 REPLACE_EXERCISE, on the existing single-block path.

Covers (readiness-review test matrix):
  - catalog integrity + parity firewall (canonical df=1.0 / cost=1.0; Class-A only),
  - StrategyState / PreferenceState round-trip (three-site discipline, MR2),
  - global_confidence = mean(Class-A confidences) + calibration boundary at 70,
  - migration 004 additive + idempotent (TG4),
  - default-on-absence == freshly-seeded (single-source defaults, MR3),
  - L2 REPLACE: preference-driven, NEVER performance-driven, capability-preserving,
    audit-reconstructable (TG3), + the bounded nudge (clamp + no-double-nudge, SM3),
  - the relocated decision hook: fires ONCE at block completion for a multi-set block,
    not per set (TG1), and the fatigue-aware path now governs through the same hook (TG2).

Imports use the assembled package layout (hush_model/ + sim/), as in Sprint 0-3A.
"""
from __future__ import annotations

from hush_model.constants import (
    CLASS_A_CAPABILITIES, CALIBRATION_CONFIDENCE_THRESHOLD,
    PREFERENCE_DEFAULT_SCORE, PREFERENCE_NUDGE, PREFERENCE_STICKY,
    STRATEGY_DEFAULT_FREQUENCY, STRATEGY_DEFAULT_VOLUME,
)
from hush_model.domain import (
    CapabilityState, StrategyState, PreferenceState, default_strategy_state,
)
from hush_model.catalog import CATALOG, ExerciseCatalog, CLASS_A
from hush_model.preference import nudge, apply_sticky, demote
from hush_model.decision import REPLACE_EXERCISE, REASON_REPLACE_PREFERENCE
from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import StateRepository
from sim.synthetic_athlete import SyntheticAthlete


def approx(a, b, tol=1e-9):
    return abs(a - b) <= tol


# ============================================================
# 1. Catalog integrity + parity firewall
# ============================================================

def test_every_class_a_has_canonical_and_alternate():
    for cap in CLASS_A_CAPABILITIES:
        pool = CATALOG.for_capability(cap)
        assert len(pool) >= 2, (cap, pool)               # canonical + >=1 alternate
        canon = CATALOG.canonical_for(cap)
        assert canon.is_canonical and canon.primary_capability == cap

def test_canonical_parity_firewall_df_and_cost_are_one():
    # the blocking parity rule: canonical exercises must not perturb the numeric paths
    for cap in CLASS_A_CAPABILITIES:
        canon = CATALOG.canonical_for(cap)
        assert canon.difficulty_factor == 1.0
        assert canon.exercise_cost == 1.0

def test_catalog_is_class_a_only_no_cross_class_leak():
    # no Class-B/C entries exist, and every for_capability result is Class-A
    for cap in CLASS_A_CAPABILITIES:
        for e in CATALOG.for_capability(cap):
            assert e.exercise_class == CLASS_A
    # an unknown (Class-B) capability yields nothing — never a Class-A exercise
    assert CATALOG.for_capability("vertical_pull") == []

def test_replacement_group_is_class_matched_and_shares_group():
    grp = CATALOG.replacement_group("bench_press")
    ids = {e.exercise_id for e in grp}
    assert {"bench_press", "db_bench_press"} <= ids
    assert all(e.exercise_class == CLASS_A for e in grp)


# ============================================================
# 2. StrategyState / PreferenceState round-trip (MR2 three-site)
# ============================================================

def test_strategy_state_round_trips_and_defaults_seeded():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)
    strat = repo.get_strategy_state("a1")
    assert (strat.weekly_frequency, strat.weekly_volume) == (
        STRATEGY_DEFAULT_FREQUENCY, STRATEGY_DEFAULT_VOLUME)
    assert strat.primary_focus is None and strat.secondary_focus is None
    # mutate and write through the sole writer; read back on a fresh repo
    with db.transaction() as conn:
        StateRepository(conn).write_strategy_state("a1", StrategyState(
            "a1", weekly_frequency=4, weekly_volume="high",
            primary_focus="knee_dominant", secondary_focus="hip_dominant"))
    back = StateRepository(db.conn).get_strategy_state("a1")
    assert (back.weekly_frequency, back.weekly_volume) == (4, "high")
    assert back.primary_focus == "knee_dominant"
    assert back.secondary_focus == "hip_dominant"

def test_preference_state_round_trips_and_defaults_to_50():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    # no rows seeded -> default 50 at read
    ath = StateRepository(db.conn).load_athlete_state("a1")
    assert ath.preferences == {}
    assert ath.preference_score("bench_dumbbell") == PREFERENCE_DEFAULT_SCORE
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    ath2 = StateRepository(db.conn).load_athlete_state("a1")
    assert ath2.preference_score("bench_dumbbell") == 88.0


# ============================================================
# 3. global_confidence + calibration boundary at 70
# ============================================================

def _set_all_class_a_confidence(db, athlete_id, value):
    repo = StateRepository(db.conn)
    for cap in CLASS_A_CAPABILITIES:
        cs = repo.get_capability_state(athlete_id, cap)
        cs.confidence = value
        with db.transaction() as conn:
            StateRepository(conn).write_capability_state(athlete_id, cs)

def test_global_confidence_is_mean_and_calibration_crosses_at_70():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)

    ath = repo.load_athlete_state("a1")
    assert ath.calibration_phase() is True                # seeds sit at floor 10

    _set_all_class_a_confidence(db, "a1", 70.0)           # exactly at threshold
    ath = repo.load_athlete_state("a1")
    assert approx(ath.global_confidence(), 70.0)
    assert ath.calibration_phase() is False               # < 70 is the calibrating test

    _set_all_class_a_confidence(db, "a1", 69.9)
    assert repo.load_athlete_state("a1").calibration_phase() is True

def test_global_confidence_uses_fixed_class_a_set_not_present_only():
    # the mean iterates the FIVE Class-A caps (SM4): one high cap cannot inflate the mean
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)
    cs = repo.get_capability_state("a1", "horizontal_push")
    cs.confidence = 100.0
    with db.transaction() as conn:
        StateRepository(conn).write_capability_state("a1", cs)
    ath = repo.load_athlete_state("a1")
    # (100 + 10*4) / 5 = 28  -> still calibrating
    assert approx(ath.global_confidence(), 28.0)
    assert ath.calibration_phase() is True


# ============================================================
# 4. Migration 004 additive + idempotent (TG4)
# ============================================================

def test_migration_004_additive_and_idempotent():
    import sqlite3
    from hush_model.persistence.migrations import migration_004_foundation as m
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    # a Sprint-3A-shaped DB: recommendation WITHOUT the replace cols, NO new tables
    conn.execute("CREATE TABLE athlete (id TEXT PRIMARY KEY)")
    conn.execute("CREATE TABLE recommendation (id TEXT, decision_type TEXT)")
    assert m.apply(conn) is True                          # did work
    assert {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")} >= {
        "strategy_state", "preference_state"}
    rec_cols = {r[1] for r in conn.execute("PRAGMA table_info(recommendation)")}
    assert {"replaced_from_exercise", "replace_reason"} <= rec_cols
    assert m.apply(conn) is False                         # idempotent


# ============================================================
# 5. Default-on-absence == freshly-seeded (single-source defaults, MR3)
# ============================================================

def test_default_on_absence_equals_freshly_seeded():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("seeded", "male", 30, "intermediate")    # has a strategy_state row
    svc.onboard("migrated", "male", 30, "intermediate")
    # simulate a migrated (pre-3B-1) athlete: remove its strategy row
    with db.transaction() as conn:
        conn.execute("DELETE FROM strategy_state WHERE athlete_id='migrated'")
    repo = StateRepository(db.conn)
    seeded = repo.get_strategy_state("seeded")
    migrated = repo.get_strategy_state("migrated")        # falls back to default factory
    assert (seeded.weekly_frequency, seeded.weekly_volume,
            seeded.primary_focus, seeded.secondary_focus) == (
           (migrated.weekly_frequency, migrated.weekly_volume,
            migrated.primary_focus, migrated.secondary_focus))
    # and both equal the single-source factory
    fac = default_strategy_state("x")
    assert seeded.weekly_frequency == fac.weekly_frequency
    assert seeded.weekly_volume == fac.weekly_volume


# ============================================================
# 6. L2 REPLACE_EXERCISE — preference-driven, never performance-driven, audited
# ============================================================

def test_replace_is_preference_driven_and_capability_preserving():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    # prefer the dumbbell family strongly; performance/score is irrelevant to selection
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    out = svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="athlete_preference")
    assert out["to_exercise"] == "db_bench_press"
    assert out["decision_type"] == REPLACE_EXERCISE
    # capability preserved (Principle #53)
    assert CATALOG.get(out["to_exercise"]).primary_capability == "horizontal_push"

def test_replace_ignores_performance_only_preference():
    # drive capability score to the floor: REPLACE must STILL pick on preference alone
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)
    cs = repo.get_capability_state("a1", "horizontal_push")
    cs.score = 1.0                                        # terrible "performance"
    with db.transaction() as conn:
        StateRepository(conn).write_capability_state("a1", cs)
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    out = svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="pref")
    assert out["to_exercise"] == "db_bench_press"         # preference wins regardless of score

def test_replace_audit_is_reconstructable():
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="equipment_busy")
    row = db.conn.execute(
        "SELECT exercise, replaced_from_exercise, replace_reason, decision_type, "
        "decision_reason FROM recommendation ORDER BY created_at DESC, rowid DESC LIMIT 1"
    ).fetchone()
    assert row["exercise"] == "db_bench_press"
    assert row["replaced_from_exercise"] == "bench_press"
    assert row["replace_reason"] == "equipment_busy"
    assert row["decision_type"] == REPLACE_EXERCISE
    assert row["decision_reason"] == REASON_REPLACE_PREFERENCE


# ============================================================
# 7. Sticky persistent preference (DX-10) + retained nudge primitive + no-ratchet
# ============================================================

def test_nudge_clamps_to_bounds():
    # The bounded nudge is RETAINED but INACTIVE in production since DX-10 (sticky-set
    # replaced it); kept as a pure tested helper + sprint4/parameters.py registry entry.
    assert nudge(98.0, up=True) == 100.0                  # clamp high
    assert nudge(2.0, up=False) == 0.0                    # clamp low
    assert nudge(50.0, up=True) == 50.0 + PREFERENCE_NUDGE
    assert nudge(50.0, up=False) == 50.0 - PREFERENCE_NUDGE

def test_apply_sticky_and_demote_are_idempotent_sets():
    # DX-10 primitives: a SET, not a delta. apply_sticky ignores its argument and returns
    # the sticky band (idempotent -> no ratchet, SM3); demote returns the default band.
    assert apply_sticky() == PREFERENCE_STICKY
    assert apply_sticky(50.0) == PREFERENCE_STICKY
    assert apply_sticky(PREFERENCE_STICKY) == PREFERENCE_STICKY      # idempotent
    assert demote() == PREFERENCE_DEFAULT_SCORE
    assert PREFERENCE_STICKY > PREFERENCE_DEFAULT_SCORE              # chosen dominates displaced

def test_replace_sets_chosen_sticky_and_demotes_rejected():
    # DX-10 RE-GOLD of test_replace_nudges_chosen_up_and_rejected_down: the chosen family is
    # SET to the sticky band and the displaced family demoted to default (was: ±5 nudge).
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="pref")
    ath = StateRepository(db.conn).load_athlete_state("a1")
    assert ath.preference_score("bench_dumbbell") == PREFERENCE_STICKY        # chosen pinned (100)
    assert ath.preference_score("bench_barbell") == PREFERENCE_DEFAULT_SCORE  # displaced demoted (50)

def test_sticky_choice_is_dominant_and_persists():
    # Product Spec §6: the replacement is the slot's DETERMINISTIC, DURABLE selection going
    # forward. After the replace, the chosen exercise is the unique argmax of its capability
    # by the FULL sticky band (100 vs 50) -- not a fragile +5 lean that later events erode.
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="pref")
    ath = StateRepository(db.conn).load_athlete_state("a1")
    # steady-state composition selection (ES-009 §6) now returns the chosen exercise...
    chosen = CATALOG.select("horizontal_push", ath.preference_score, calibrating=False)
    assert chosen.exercise_id == "db_bench_press"                        # dumbbell persists
    # ...and the L2 REPLACE primitive agrees, by a dominant margin (100 vs 50).
    assert CATALOG.replace("bench_press", ath.preference_score).exercise_id == "db_bench_press"
    margin = ath.preference_score("bench_dumbbell") - ath.preference_score("bench_barbell")
    assert margin == PREFERENCE_STICKY - PREFERENCE_DEFAULT_SCORE        # full-band, durable (50), not +5

def test_sticky_most_recent_replacement_wins():
    # Most-recent-replacement-wins: a later explicit replacement displaces the prior sticky
    # family (the prior winner is demoted), so the slot follows the athlete's LATEST choice.
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="pref")   # -> dumbbell sticky
    # the athlete now re-expresses a barbell preference (UI choice; scaffolded here as a write
    # that ties the sticky band so the canonical tie-break selects barbell on the next replace)
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_barbell", PREFERENCE_STICKY))
    svc.replace_exercise("a1", "horizontal_push", "db_bench_press", reason="pref")  # current=dumbbell
    ath = StateRepository(db.conn).load_athlete_state("a1")
    assert ath.preference_score("bench_barbell") == PREFERENCE_STICKY         # latest choice sticky
    assert ath.preference_score("bench_dumbbell") == PREFERENCE_DEFAULT_SCORE  # prior winner demoted
    assert CATALOG.select("horizontal_push", ath.preference_score, calibrating=False).exercise_id == "bench_press"

def test_sticky_reselect_does_not_ratchet():
    # SM3: re-selecting the already-sticky family is a no-op (chosen == current -> no write);
    # the sticky-set is itself idempotent, so the score never grows past the band.
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    with db.transaction() as conn:
        StateRepository(conn).write_preference_state(
            "a1", PreferenceState("a1", "bench_dumbbell", 88.0))
    svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="pref")     # -> dumbbell sticky
    svc.replace_exercise("a1", "horizontal_push", "db_bench_press", reason="pref")  # current already dumbbell
    ath = StateRepository(db.conn).load_athlete_state("a1")
    assert ath.preference_score("bench_dumbbell") == PREFERENCE_STICKY            # unchanged, no ratchet
    assert ath.preference_score("bench_barbell") == PREFERENCE_DEFAULT_SCORE

def test_replace_same_family_does_not_double_nudge():
    # all prefs default 50 -> tie -> canonical (bench_press) wins -> chosen == current
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("a1", "male", 30, "intermediate")
    out = svc.replace_exercise("a1", "horizontal_push", "bench_press", reason="pref")
    assert out["to_exercise"] == "bench_press"            # canonical tie-break, unchanged
    ath = StateRepository(db.conn).load_athlete_state("a1")
    assert ath.preferences == {}                          # no write (no ratchet)


# ============================================================
# 8. Relocated decision hook: ONCE per block (TG1) + fatigue-aware governs (TG2)
# ============================================================

def _governed_seed(svc, db, score=40.0, confidence=55.0, sum_w=6.4):
    svc.onboard("a1", "male", 30, "intermediate")
    repo = StateRepository(db.conn)
    cap = repo.get_capability_state("a1", "horizontal_push")
    cap.score, cap.confidence, cap.sum_w = score, confidence, sum_w
    with db.transaction() as conn:
        StateRepository(conn).write_capability_state("a1", cap)

def test_streak_updates_once_at_block_completion_not_per_set():
    db = Database(":memory:")
    svc = HushService(db)
    _governed_seed(svc, db)
    repo = StateRepository(db.conn)
    entry = repo.get_capability_state("a1", "horizontal_push").score

    sid = svc.start_session("a1", 1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    truth = SyntheticAthlete("a1", "male", 30, "intermediate",
                             true_score={"horizontal_push": 60.0}, rep_noise_sd=0.0)
    # report THREE sets with govern=False (learning only) — the streak must NOT advance
    for set_no in (1, 2, 3):
        svc.pipeline.report_set_fatigue_aware(
            "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, set_no,
            truth.perform, week=1.0, govern=False)
    mid = repo.get_capability_state("a1", "horizontal_push")
    assert mid.consecutive_positive == 0                  # no per-set advance
    assert mid.last_recommended_weight is None

    # complete the block ONCE -> the streak advances by exactly one (positive surprise)
    svc.pipeline.complete_block(
        "a1", "horizontal_push", week=1.0, score_at_block_entry=entry,
        block_s_obs=entry + 5.0, decision_type="KEEP_LOAD", recommended_weight=50.0)
    after = repo.get_capability_state("a1", "horizontal_push")
    assert after.consecutive_positive == 1                # ONCE, not three times
    assert after.last_recommended_weight == 50.0

def test_fatigue_aware_path_governs_through_shared_hook():
    # Sprint 2 default (govern=False): the fatigue-aware path writes NO decision memory.
    db = Database(":memory:")
    svc = HushService(db)
    _governed_seed(svc, db)
    repo = StateRepository(db.conn)
    sid = svc.start_session("a1", 1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 1)
    truth = SyntheticAthlete("a1", "male", 30, "intermediate",
                             true_score={"horizontal_push": 60.0}, rep_noise_sd=0.0)
    svc.pipeline.report_set_fatigue_aware(
        "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, 1,
        truth.perform, week=1.0, govern=False)
    assert repo.get_capability_state("a1", "horizontal_push").last_recommended_weight is None

    # govern=True: the SAME shared hook now advances decision memory on the fatigue path
    sid2 = svc.start_session("a1", 2.0)
    bid2 = svc.add_block(sid2, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 1)
    svc.pipeline.report_set_fatigue_aware(
        "a1", sid2, bid2, "horizontal_push", "bench_press", 1.0, 8, 1,
        truth.perform, week=2.0, govern=True)
    gov = repo.get_capability_state("a1", "horizontal_push")
    assert gov.last_recommended_weight is not None        # decision memory now written
    assert gov.consecutive_positive >= 1
