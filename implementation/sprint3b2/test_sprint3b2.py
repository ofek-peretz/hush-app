"""
Sprint 3B-2 tests — Session Composition (ES-009) + Volume (ES-009.1) + live fatigue
ceiling (Class-A only). Plain-assert functions (no pytest), run by the assemble harness.

Covers the readiness review's TC1–TC10 and the ratified rules R1–R4 / Q1–Q3:
  coverage proof, frequency clamp, calibration restraint + determinism, Stage-2 priority,
  two-lever volume + the documented band collapse (Q3), Stage-4 ordering, exploration
  determinism-given-seed / never-in-calibration / class-safe (R4), single-capability guard,
  trim-only ceiling (Q2), driver multi-block completion with one governor update per
  capability (R2), seed persistence/reconstructability (R4), migration 005 additive/idempotent
  + fresh-vs-migrated parity (MR1), and the 70-boundary flip (SM5).
"""
from __future__ import annotations
import sqlite3

from hush_model.constants import (
    CLASS_A_CAPABILITIES, CAPABILITY_PRIORITY_ORDER, TEMPLATES_CLASS_A, TEMPLATES_7CAP,
    SESSION_FATIGUE_CEILING,
)
from hush_model.domain import AthleteState, CapabilityState, StrategyState
from hush_model.volume import allocate, times_trained, clamp_frequency, focus_multiplier
from hush_model.composition import (
    compose_session, resolve_priority, SELECT_CANONICAL, SELECT_PREFERENCE,
    SELECT_EXPLORATION, SELECT_SECOND_SLOT, _trim_to_ceiling,
)
from hush_model.catalog import CATALOG, Exercise, ExerciseCatalog
from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.session import SessionEngine
from hush_model.persistence.repositories import StateRepository
from sim.parameters import override_parameters
from hush_model.persistence.migrations import migration_005_composition as m005


# ----------------------------- builders -----------------------------

def _athlete(confidence=10.0, freq=3, volume="moderate", primary=None, secondary=None,
             last_trained=None):
    caps = {
        c: CapabilityState(capability=c, score=50.0, confidence=confidence, sum_w=5.0,
                           last_trained_at_week=last_trained)
        for c in CLASS_A_CAPABILITIES
    }
    strat = StrategyState(athlete_id="a", weekly_frequency=freq, weekly_volume=volume,
                          primary_focus=primary, secondary_focus=secondary)
    ath = AthleteState(athlete_id="a", sex="male", age=30, experience="intermediate",
                       capabilities=caps, strategy=strat)
    return ath, strat


def _perform(rec):
    # M1/DX-01: report (actual_weight, actual_reps). Loads exactly the prescription, and
    # reps slightly under prediction -> consistent (mild) negative surprise; deterministic.
    return rec.recommended_weight, max(1, int(round(rec.predicted_reps_to_failure)) - 1)


# ----------------------------- Stage 1: templates + coverage -----------------------------

def test_class_a_templates_are_7cap_minus_inactive():
    for freq, sessions in TEMPLATES_CLASS_A.items():
        for i, session in enumerate(sessions):
            expected = tuple(c for c in TEMPLATES_7CAP[freq][i]
                             if c not in ("vertical_pull", "core_stability"))
            assert session == expected
            assert "vertical_pull" not in session and "core_stability" not in session


def test_class_a_coverage_5_of_5_within_two_sessions():
    target = set(CLASS_A_CAPABILITIES)
    for freq in (2, 3, 4):
        sessions = TEMPLATES_CLASS_A[freq]
        covered, n = set(), 0
        for session in sessions:
            covered |= set(session)
            n += 1
            if covered >= target:
                break
        assert covered >= target, f"freq {freq} never covers 5/5"
        assert n <= 2, f"freq {freq} needs {n} sessions (> 2)"


def test_frequency_clamp_to_nearest_template():
    assert clamp_frequency(1) == 2
    assert clamp_frequency(2) == 2
    assert clamp_frequency(3) == 3
    assert clamp_frequency(4) == 4
    assert clamp_frequency(7) == 4


# ----------------------------- Stage 2: priority -----------------------------

def test_calibration_priority_is_info_gain():
    # make hip_dominant the stalest + least confident -> it must sort first under calibration.
    ath, strat = _athlete(confidence=60.0, freq=3)
    ath.capabilities["hip_dominant"].confidence = 10.0
    ath.capabilities["hip_dominant"].last_trained_at_week = 0.0   # very stale
    for c in ("horizontal_push", "horizontal_pull", "knee_dominant"):
        ath.capabilities[c].last_trained_at_week = 4.9            # fresh
    order = resolve_priority(("horizontal_push", "horizontal_pull", "knee_dominant",
                              "hip_dominant"), ath, week=5.0, calibrating=True,
                             primary_focus=None, secondary_focus=None)
    assert order[0] == "hip_dominant"


def test_steady_priority_is_focus_first():
    ath, strat = _athlete(confidence=80.0, freq=3, primary="vertical_push",
                          secondary="hip_dominant")
    order = resolve_priority(("horizontal_push", "vertical_push", "hip_dominant"),
                             ath, week=5.0, calibrating=False,
                             primary_focus="vertical_push", secondary_focus="hip_dominant")
    assert order[0] == "vertical_push" and order[1] == "hip_dominant"


# ----------------------------- ES-009.1 volume -----------------------------

def test_times_trained_is_restricted_count():
    assert times_trained(2) == {c: 1 for c in CLASS_A_CAPABILITIES}
    tt3 = times_trained(3)
    assert tt3["horizontal_push"] == 2 and tt3["hip_dominant"] == 2
    assert tt3["horizontal_pull"] == 1 and tt3["knee_dominant"] == 1 and tt3["vertical_push"] == 1


def test_two_lever_allocation_tables():
    # freq-2 (all caps trained once), null focus (x0.75): low(2,3) mod(2,4) high(2,4)
    for c in CLASS_A_CAPABILITIES:
        assert allocate(c, "low", 1, False) == (2, 3)
        assert allocate(c, "moderate", 1, False) == (2, 4)
        assert allocate(c, "high", 1, False) == (2, 4)
    # freq-3 twice-trained capability: low(1,3) mod(2,2) high(2,3) -> totals 3/4/6 (distinct)
    assert allocate("horizontal_push", "low", 2, False) == (1, 3)
    assert allocate("horizontal_push", "moderate", 2, False) == (2, 2)
    assert allocate("horizontal_push", "high", 2, False) == (2, 3)


def test_band_collapse_known_limitation_Q3():
    # ACCEPTED & DOCUMENTED (Q3): once-trained capabilities saturate the 2x4 lever, so
    # MODERATE == HIGH; twice-trained capabilities stay distinct; LOW stays distinct from HIGH.
    def total(cap, band, times):
        s, n = allocate(cap, band, times, False)
        return s * n
    # once-trained (freq-2): moderate == high (the collapse), low strictly less.
    assert total("knee_dominant", "moderate", 1) == total("knee_dominant", "high", 1) == 8
    assert total("knee_dominant", "low", 1) == 6
    # twice-trained (freq-3): all three bands distinct.
    assert (total("hip_dominant", "low", 2), total("hip_dominant", "moderate", 2),
            total("hip_dominant", "high", 2)) == (3, 4, 6)


def test_focus_multiplier_differentiates_volume_at_low_band():
    # at the low band the focus multiplier still separates a focus cap from an incidental one.
    assert focus_multiplier("knee_dominant", "knee_dominant", None) == 1.25
    assert focus_multiplier("hip_dominant", "knee_dominant", "hip_dominant") == 1.00
    assert focus_multiplier("vertical_push", "knee_dominant", "hip_dominant") == 0.75
    primary = allocate("knee_dominant", "low", 1, False, primary_focus="knee_dominant")
    other = allocate("vertical_push", "low", 1, False, primary_focus="knee_dominant")
    assert primary[0] * primary[1] > other[0] * other[1]   # 8 > 6


def test_calibration_restraint_one_slot_two_sets():
    ath, strat = _athlete(confidence=10.0, freq=2)   # calibrating
    plan = compose_session(ath, strat, session_index=0, seed=7, week=5.0)
    caps = [b.capability for b in plan.blocks]
    assert len(caps) == len(set(caps))               # one block per capability (1 slot)
    for b in plan.blocks:
        assert b.target_sets == 2
        assert b.selection_reason == SELECT_CANONICAL
        assert b.difficulty_factor == 1.0
        assert b.is_primary_slot is True


# ----------------------------- Stage 3 selection + exploration (R4) -----------------------------

def test_calibration_is_seed_independent_and_no_exploration():
    ath, strat = _athlete(confidence=10.0, freq=2)
    a = compose_session(ath, strat, session_index=0, seed=1, week=5.0)
    b = compose_session(ath, strat, session_index=0, seed=99999, week=5.0)
    assert [x.exercise_id for x in a.blocks] == [x.exercise_id for x in b.blocks]
    for seed in range(40):
        p = compose_session(ath, strat, session_index=0, seed=seed, week=5.0)
        assert all(x.selection_reason != SELECT_EXPLORATION for x in p.blocks)


def test_exploration_disabled_by_default_is_stable():
    # M4 / DX-04: with the default P_EXPLORE = 0.0 the exploration auto-substitution is OFF,
    # so NO seed ever produces a SELECT_EXPLORATION block — steady-state composition is stable.
    ath, strat = _athlete(confidence=80.0, freq=2, volume="low")  # steady, 2 slots
    for s in range(200):
        p = compose_session(ath, strat, session_index=0, seed=s, week=1.0)
        assert all(b.selection_reason != SELECT_EXPLORATION for b in p.blocks)


def test_exploration_under_override_is_deterministic_and_class_safe():
    # The mechanism is RETAINED for Phase-0 study (M4 / DX-04): under override_parameters the
    # floor fires, is bit-reproducible given the seed, and never crosses the class constraint (R4).
    ath, strat = _athlete(confidence=80.0, freq=2, volume="low")  # steady, 2 slots
    with override_parameters(P_EXPLORE=0.99):
        # find a seed that explores; identical seed -> identical session (bit-reproducible).
        seed = next(s for s in range(200)
                    if any(b.selection_reason == SELECT_EXPLORATION
                           for b in compose_session(ath, strat, session_index=0, seed=s, week=1.0).blocks))
        p1 = compose_session(ath, strat, session_index=0, seed=seed, week=1.0)
        p2 = compose_session(ath, strat, session_index=0, seed=seed, week=1.0)
        assert [b.exercise_id for b in p1.blocks] == [b.exercise_id for b in p2.blocks]
        # exploration never crosses the class constraint: every chosen exercise still trains its slot.
        for b in p1.blocks:
            ex = CATALOG.get(b.exercise_id)
            assert b.capability in ex.capabilities and ex.exercise_class == "A"


def test_steady_state_selects_preference_and_second_slot_distinct():
    ath, strat = _athlete(confidence=80.0, freq=2, volume="moderate")
    plan = compose_session(ath, strat, session_index=0, seed=5, week=1.0)
    by_cap: dict[str, list] = {}
    for b in plan.blocks:
        by_cap.setdefault(b.capability, []).append(b)
    for cap, blocks in by_cap.items():
        assert len(blocks) == 2                       # two-lever => 2 slots at freq-2 moderate
        ids = {b.exercise_id for b in blocks}
        assert len(ids) == 2                          # distinct exercises (CE1)
        primaries = [b for b in blocks if b.is_primary_slot]
        assert len(primaries) == 1                    # exactly one primary (R2)
        assert primaries[0].difficulty_factor == 1.0  # canonical is primary


# ----------------------------- Stage 4 ordering + single-capability guard -----------------------------

def test_stage4_orders_by_capability_priority_then_df():
    ath, strat = _athlete(confidence=80.0, freq=2, volume="moderate")
    plan = compose_session(ath, strat, session_index=0, seed=5, week=1.0)
    ranks = [CAPABILITY_PRIORITY_ORDER.index(b.capability) for b in plan.blocks]
    assert ranks == sorted(ranks)                     # non-decreasing capability priority
    # within a capability, canonical (df=1.0) precedes the alternate (df desc).
    for i in range(len(plan.blocks) - 1):
        a, b = plan.blocks[i], plan.blocks[i + 1]
        if a.capability == b.capability:
            assert a.difficulty_factor >= b.difficulty_factor


def test_single_capability_guard_trips_on_multicap_entry():
    # a synthetic multi-capability catalog entry must be rejected (CE2 — keeps C.3 exact).
    multi = Exercise("frankenlift", {"knee_dominant": 0.6, "hip_dominant": 0.4}, 1.0,
                     "barbell", "A", replacement_group="knee_dominant",
                     exercise_family="frankenlift")
    cat = ExerciseCatalog((multi,))
    ath, strat = _athlete(confidence=80.0, freq=2)
    try:
        compose_session(ath, strat, session_index=0, seed=1, week=1.0, catalog=cat)
        assert False, "expected single-capability guard to trip"
    except ValueError as e:
        assert "multi-capability" in str(e)


# ----------------------------- ES-011 live ceiling (Q2 trim-only) -----------------------------

def test_ceiling_never_exceeded_under_class_a():
    for freq in (2, 3, 4):
        for vol in ("low", "moderate", "high"):
            ath, strat = _athlete(confidence=80.0, freq=freq, volume=vol)
            for si in range(len(TEMPLATES_CLASS_A[freq])):
                plan = compose_session(ath, strat, session_index=si, seed=3, week=1.0)
                assert sum(b.target_sets for b in plan.blocks) <= SESSION_FATIGUE_CEILING


def test_trim_only_drops_lowest_priority_slots_deterministically():
    # synthetic over-ceiling items: 3 caps x 2 slots x 4 sets = 24; trim to 12.
    # item = (capability, slot_idx, exercise, reason, sets)
    items = []
    for cap in ("knee_dominant", "horizontal_push", "vertical_push"):
        for slot in (0, 1):
            items.append((cap, slot, CATALOG.canonical_for(cap), "x", 4))
    kept = _trim_to_ceiling(list(items), ceiling=12)
    assert sum(it[4] for it in kept) <= 12
    # second slots are removed before sole slots; lowest priority (vertical_push) trimmed first.
    kept_pairs = {(it[0], it[1]) for it in kept}
    # every surviving capability keeps its primary slot (coverage preserved).
    assert ("knee_dominant", 0) in kept_pairs
    assert ("horizontal_push", 0) in kept_pairs
    # the lowest-priority second slot must be gone before any primary slot is touched.
    assert ("vertical_push", 1) not in kept_pairs
    # trim-only: surviving blocks keep their original sets (not re-optimized).
    assert all(it[4] == 4 for it in kept)


# ----------------------------- driver (R2, R4) -----------------------------

def test_driver_calibration_session_persists_audit_and_updates_memory_once():
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    eng = SessionEngine(db)
    sid, plan, results = eng.run_session("a", week=1.0, session_index=0, seed=11,
                                         perform=_perform)
    row = db.conn.execute(
        "SELECT exploration_seed, session_index, weekly_frequency, calibration_phase "
        "FROM workout_session WHERE id=?", (sid,)).fetchone()
    assert row["exploration_seed"] == 11
    assert row["calibration_phase"] == 1
    blocks = db.conn.execute(
        "SELECT selection_reason, target_sets FROM exercise_block "
        "WHERE workout_session_id=?", (sid,)).fetchall()
    assert all(b["selection_reason"] == SELECT_CANONICAL and b["target_sets"] == 2
               for b in blocks)
    # one governor update per capability: each trained cap has a single-session streak (<=1).
    with db.transaction() as conn:
        ath = StateRepository(conn).load_athlete_state("a")
    for b in plan.blocks:
        cs = ath.capabilities[b.capability]
        assert cs.last_decision is not None
        assert cs.consecutive_positive <= 1 and cs.consecutive_negative <= 1
    db.close()


def test_driver_decision_memory_advances_once_per_capability_R2():
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    # force steady state (>=70) so each capability gets two slots (two same-cap blocks).
    db.conn.execute("UPDATE capability_state SET confidence=80, sum_w=40 WHERE athlete_id='a'")
    db.conn.commit()
    eng = SessionEngine(db)
    # run two sessions; with two slots/cap, a double-fire bug would advance the streak by 2/session.
    eng.run_session("a", week=1.0, session_index=0, seed=5, perform=_perform)
    eng.run_session("a", week=2.0, session_index=0, seed=5, perform=_perform)
    with db.transaction() as conn:
        ath = StateRepository(conn).load_athlete_state("a")
    for cap in ("knee_dominant", "horizontal_push", "horizontal_pull"):
        cs = ath.capabilities[cap]
        streak = max(cs.consecutive_positive, cs.consecutive_negative)
        assert streak <= 2, f"{cap} streak {streak} > 2 (decision memory double-fired)"
    db.close()


def test_driver_seed_persisted_and_session_reconstructable_R4():
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    db.conn.execute("UPDATE capability_state SET confidence=80, sum_w=40 WHERE athlete_id='a'")
    db.conn.commit()
    eng = SessionEngine(db)
    sid, plan, _ = eng.run_session("a", week=1.0, session_index=0, seed=2, perform=_perform)
    # reconstruct from the PERSISTED seed: recompose pre-session state must reproduce exercises.
    seed = db.conn.execute(
        "SELECT exploration_seed FROM workout_session WHERE id=?", (sid,)).fetchone()[0]
    assert seed == 2
    persisted = [r["exercise"] for r in db.conn.execute(
        "SELECT exercise FROM exercise_block WHERE workout_session_id=? ORDER BY position",
        (sid,))]
    assert persisted == [b.exercise_id for b in plan.blocks]
    db.close()


# ----------------------------- migration 005 (MR1) -----------------------------

def _v4_like_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE workout_session (id TEXT PRIMARY KEY, athlete_id TEXT, "
                 "status TEXT, week REAL, started_at TEXT, completed_at TEXT, created_at TEXT)")
    conn.execute("CREATE TABLE exercise_block (id TEXT PRIMARY KEY, workout_session_id TEXT, "
                 "capability TEXT, exercise TEXT, difficulty_factor REAL, position INTEGER, "
                 "recommended_weight REAL, target_reps INTEGER, target_sets INTEGER, status TEXT)")
    return conn


def test_migration_005_additive_and_idempotent():
    conn = _v4_like_conn()
    assert m005.apply(conn) is True
    cols_ws = {r[1] for r in conn.execute("PRAGMA table_info(workout_session)")}
    cols_eb = {r[1] for r in conn.execute("PRAGMA table_info(exercise_block)")}
    for c in ("exploration_seed", "session_index", "weekly_frequency", "weekly_volume",
              "calibration_phase"):
        assert c in cols_ws
    assert "selection_reason" in cols_eb
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 5
    assert m005.apply(conn) is False    # idempotent: second apply is a no-op


def test_fresh_vs_migrated_columns_match_MR1():
    fresh = Database(":memory:")
    fresh_ws = {r[1] for r in fresh.conn.execute("PRAGMA table_info(workout_session)")}
    fresh_eb = {r[1] for r in fresh.conn.execute("PRAGMA table_info(exercise_block)")}
    migrated = _v4_like_conn()
    m005.apply(migrated)
    mig_ws = {r[1] for r in migrated.execute("PRAGMA table_info(workout_session)")}
    mig_eb = {r[1] for r in migrated.execute("PRAGMA table_info(exercise_block)")}
    # the 3B-2 columns are present in BOTH (a divergence would split fresh vs migrated).
    new_ws = {"exploration_seed", "session_index", "weekly_frequency", "weekly_volume",
              "calibration_phase"}
    assert new_ws <= fresh_ws and new_ws <= mig_ws
    assert "selection_reason" in fresh_eb and "selection_reason" in mig_eb
    fresh.close()


# ----------------------------- 70-boundary flip (SM5) -----------------------------

def test_calibration_boundary_at_70_flips_behavior():
    # just below 70 -> calibration: 1 slot, 2 sets, canonical.
    ath_lo, strat = _athlete(confidence=69.0, freq=2, volume="moderate")
    plan_lo = compose_session(ath_lo, strat, session_index=0, seed=5, week=1.0)
    assert plan_lo.calibration_phase is True
    assert all(b.target_sets == 2 and b.selection_reason == SELECT_CANONICAL
               for b in plan_lo.blocks)
    # at/above 70 -> steady: full bands (2 slots / 4 sets at freq-2 moderate), preference.
    ath_hi, strat = _athlete(confidence=70.0, freq=2, volume="moderate")
    plan_hi = compose_session(ath_hi, strat, session_index=0, seed=5, week=1.0)
    assert plan_hi.calibration_phase is False
    assert any(b.selection_reason == SELECT_SECOND_SLOT for b in plan_hi.blocks)
    assert all(b.target_sets == 4 for b in plan_hi.blocks)


# ----------------------------- M1 / DX-20: program built from learned capability -----------------------------

def _perform_over(rec):
    # M1/DX-01: load the prescription, over-perform -> positive surprise -> score rises ->
    # the next program is composed at a higher LEARNED load (DX-20).
    return rec.recommended_weight, int(round(rec.predicted_reps_to_failure)) + 3


def _perform_flat(rec):
    # perform exactly at prediction (≈ zero surprise) so within-session learning barely drifts
    # the score — isolating the effect of the LEARNED score on the next composed load.
    return rec.recommended_weight, max(1, int(round(rec.predicted_reps_to_failure)))


def _primary_loads_by_capability(conn, session_id):
    """Composed primary-slot (first-position) recommended_weight per capability in a session."""
    loads, seen = {}, set()
    for row in conn.execute(
        "SELECT capability, recommended_weight FROM exercise_block "
        "WHERE workout_session_id=? ORDER BY position", (session_id,)):
        c = row["capability"]
        if c in seen:
            continue
        seen.add(c)
        loads[c] = row["recommended_weight"]
    return loads


def test_m1_composition_load_follows_the_learned_score():
    """DX-20 (M1): with decision memory present, the composed program load is derived from the
    LEARNED score, not the held historical anchor. Raising the learned score (the athlete
    demonstrated more) raises the next composed load; a regression lowers it. Pre-DX-20 the
    governed composition emitted the held anchor and would NOT follow these score moves.

    Same session_index/seed each time so the composition STRUCTURE is identical and the only
    moving part is the score; the first run writes decision memory, so runs 2 and 3 exercise
    the governed (decision-memory) branch DX-20 changes."""
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    db.conn.execute("UPDATE capability_state SET confidence=80, sum_w=40 WHERE athlete_id='a'")
    db.conn.commit()
    eng = SessionEngine(db)

    def compose_and_read(week):
        sid, _, _ = eng.run_session("a", week=week, session_index=0, seed=5,
                                    perform=_perform_flat)
        return _primary_loads_by_capability(db.conn, sid)

    base = compose_and_read(1.0)          # run 1: also writes decision memory (last_recommended_weight)
    # the athlete demonstrated more capability than seeded -> raise the learned score directly
    db.conn.execute("UPDATE capability_state SET score = score + 15 WHERE athlete_id='a'")
    db.conn.commit()
    higher = compose_and_read(2.0)        # governed branch present; DX-20 emits the score-derived target
    # a genuine regression -> drop the learned score well below
    db.conn.execute("UPDATE capability_state SET score = score - 40 WHERE athlete_id='a'")
    db.conn.commit()
    lower = compose_and_read(3.0)

    common = set(base) & set(higher) & set(lower)
    assert common, (base, higher, lower)
    # learned-up -> program up; regression -> program down (built from learned reality)
    assert all(higher[c] >= base[c] for c in common) and any(higher[c] > base[c] for c in common), \
        (base, higher)
    assert all(lower[c] <= higher[c] for c in common) and any(lower[c] < higher[c] for c in common), \
        (higher, lower)
    db.close()


def test_m1_composed_block_load_is_frozen_at_composition():
    """DX-20 + frozen-session invariant (API §0.3): the composed block load equals the rested
    recommend() at the PRE-session state (the score-derived learned-capability target) and is
    FIXED there — running the block's multiple sets never re-authors it mid-session."""
    from hush_model.recommendation import recommend
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    db.conn.execute("UPDATE capability_state SET confidence=80, sum_w=40 WHERE athlete_id='a'")
    db.conn.commit()
    eng = SessionEngine(db)
    with db.transaction() as conn:
        ath_pre = StateRepository(conn).load_athlete_state("a")
    sid, _, _ = eng.run_session("a", week=1.0, session_index=0, seed=5, perform=_perform_over)
    blocks = list(db.conn.execute(
        "SELECT capability, exercise, difficulty_factor, recommended_weight, target_sets "
        "FROM exercise_block WHERE workout_session_id=? ORDER BY position", (sid,)))
    assert blocks
    for b in blocks:
        cap = ath_pre.capabilities[b["capability"]]
        expected = recommend(cap, b["exercise"], b["difficulty_factor"], 8).recommended_weight
        # frozen at composition: stored block load == the learned-capability target at session entry
        assert abs(b["recommended_weight"] - expected) < 1e-9, (
            b["capability"], b["recommended_weight"], expected)
        assert b["target_sets"] >= 1   # multiple sets ran, yet the block load above did not drift
    db.close()
