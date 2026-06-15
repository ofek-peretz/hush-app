"""
Sprint 5 / DX-11 tests — event-driven set-report runtime + session_progress accumulator.

The acceptance gate (SESSION_RUNTIME_TRANSITION_REVIEW §7) is the DIFFERENTIAL-REPLAY test:
driving a session one set at a time through `SessionRuntime` (the device-driven path) must
reproduce `SessionEngine.run_session` (the in-process path) BIT-FOR-BIT — same score /
confidence / sum_w / fatigue / variance moments / decision memory — because every update is a
pure function of (persisted state, reported pair, order). Plus: `actual_weight` is carried
through the event path (M1/DX-01), and the persisted accumulator advances the ES-006 governor
ONCE per capability across independent requests (R2).

Plain-assert functions (no pytest), run by the assemble harness.
"""
from __future__ import annotations

from hush_model.constants import CLASS_A_CAPABILITIES
from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.session import SessionEngine
from hush_model.persistence.runtime import SessionRuntime, SessionProgressRepository
from hush_model.persistence.repositories import StateRepository
from sim.synthetic_athlete import SyntheticAthlete


def _steady_athlete(db) -> None:
    """Onboard + force steady state (confidence 80, sum_w 40) so each capability gets two slots
    — exercising the multi-slot R2 accumulator (the §5.1 divergence risk)."""
    HushService(db).onboard("a", "male", 30, "intermediate")
    db.conn.execute("UPDATE capability_state SET confidence=80, sum_w=40 WHERE athlete_id='a'")
    db.conn.commit()


_DIFF_FIELDS = (
    "score", "confidence", "sum_w", "fatigue", "var_w", "var_ws", "var_ws2",
    "consecutive_positive", "consecutive_negative", "last_recommended_weight", "last_decision",
)


def test_event_driven_matches_session_engine_bit_for_bit():
    """The differential-replay acceptance gate (review §7)."""
    seed, week = 7, 1.0
    true_score = {c: 55.0 for c in CLASS_A_CAPABILITIES}

    # --- in-process SessionEngine (the reference trajectory) ---
    db1 = Database(":memory:")
    _steady_athlete(db1)
    a1 = SyntheticAthlete("a", "male", 30, "intermediate",
                          true_score=dict(true_score), rep_noise_sd=0.0)
    SessionEngine(db1).run_session("a", week=week, session_index=0, seed=seed, perform=a1.perform)
    with db1.transaction() as conn:
        eng_state = StateRepository(conn).load_athlete_state("a")
        eng_sys = StateRepository(conn).get_systemic_fatigue("a")

    # --- event-driven SessionRuntime, identical inputs applied one set at a time, in order ---
    db2 = Database(":memory:")
    _steady_athlete(db2)
    a2 = SyntheticAthlete("a", "male", 30, "intermediate",
                          true_score=dict(true_score), rep_noise_sd=0.0)
    rt = SessionRuntime(db2)
    sid, plan, block_ids = rt.start_session("a", week=week, session_index=0, seed=seed)
    for bp, bid in zip(plan.blocks, block_ids):
        for set_number in range(1, bp.target_sets + 1):
            rt.report_set(
                "a", sid, bid, bp.capability, bp.exercise_id, bp.difficulty_factor,
                8, set_number, a2.perform, week, bp.is_primary_slot,
            )
    rt.complete_session("a", sid, week)
    with db2.transaction() as conn:
        rt_state = StateRepository(conn).load_athlete_state("a")
        rt_sys = StateRepository(conn).get_systemic_fatigue("a")

    # bit-for-bit capability-state parity over every trained capability
    assert set(eng_state.capabilities) == set(rt_state.capabilities), (
        set(eng_state.capabilities), set(rt_state.capabilities))
    assert eng_state.capabilities, "no capabilities trained — vacuous parity"
    for cap, cs1 in eng_state.capabilities.items():
        cs2 = rt_state.capabilities[cap]
        for f in _DIFF_FIELDS:
            assert getattr(cs1, f) == getattr(cs2, f), (cap, f, getattr(cs1, f), getattr(cs2, f))
    # systemic fatigue identical too (order-sensitive, serial — the tightest constraint, §5.4)
    assert eng_sys[0] == rt_sys[0], (eng_sys[0], rt_sys[0])
    # the in-process path writes NO accumulator rows; the event path persists one per COMPOSED
    # capability (a subset of the 5 seeded states load_athlete_state returns).
    with db2.transaction() as conn:
        accs = SessionProgressRepository(conn).all_for_session(sid)
    assert set(accs) == {bp.capability for bp in plan.blocks}
    db1.close()
    db2.close()


def test_report_set_carries_actual_weight():
    """DX-11 core: the athlete's logged actual_weight (here +10 kg over the prescription) is
    carried through the event-driven learning chain (M1/DX-01), not overwritten."""
    db = Database(":memory:")
    _steady_athlete(db)
    rt = SessionRuntime(db)
    sid, plan, block_ids = rt.start_session("a", week=1.0, session_index=0, seed=3)
    bp, bid = plan.blocks[0], block_ids[0]
    res = rt.report_set(
        "a", sid, bid, bp.capability, bp.exercise_id, bp.difficulty_factor, 8, 1,
        perform=lambda rec: (rec.recommended_weight + 10.0,
                             max(1, int(round(rec.predicted_reps_to_failure)))),
        week=1.0, is_primary_slot=bp.is_primary_slot,
    )
    set_row = db.conn.execute(
        "SELECT actual_weight, recommended_weight FROM set_record ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    obs_row = db.conn.execute(
        "SELECT actual_weight FROM observation ORDER BY rowid DESC LIMIT 1").fetchone()
    # the LOGGED heavy load was stored on both the set record and the observation (DX-01 carry)
    assert set_row["actual_weight"] == set_row["recommended_weight"] + 10.0
    assert obs_row["actual_weight"] == set_row["recommended_weight"] + 10.0
    # and the chain actually learned from it
    assert res.score_after != res.score_before
    db.close()


def test_accumulator_persists_across_requests_R2():
    """The per-capability accumulator survives across independent report_set requests (each its
    own transaction), so the governor advances ONCE per capability at session close (R2)."""
    db = Database(":memory:")
    _steady_athlete(db)
    rt = SessionRuntime(db)
    truth = SyntheticAthlete("a", "male", 30, "intermediate",
                             true_score={c: 55.0 for c in CLASS_A_CAPABILITIES}, rep_noise_sd=0.0)
    sid, plan, block_ids = rt.start_session("a", week=1.0, session_index=0, seed=4)
    for bp, bid in zip(plan.blocks, block_ids):
        for set_number in range(1, bp.target_sets + 1):
            rt.report_set("a", sid, bid, bp.capability, bp.exercise_id, bp.difficulty_factor,
                          8, set_number, truth.perform, 1.0, bp.is_primary_slot)
    rt.complete_session("a", sid, 1.0)
    with db.transaction() as conn:
        ath = StateRepository(conn).load_athlete_state("a")
    trained = {bp.capability for bp in plan.blocks}
    assert trained
    for cap in trained:
        cs = ath.capabilities[cap]
        assert cs.last_decision not in (None, "")               # decision memory advanced once
        # a single session can advance a streak by at most 1 — a double-fire would exceed it
        assert cs.consecutive_positive <= 1 and cs.consecutive_negative <= 1, (
            cap, cs.consecutive_positive, cs.consecutive_negative)
    db.close()
