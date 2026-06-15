"""
Sprint 1 test suite: persistence, hierarchy, learning pipeline.

Verifies the new layer preserves every frozen invariant and adds the persistence
guarantees: immutable history, sole state writer, transactional atomicity, audit
reconstruction, and parity with the pure Sprint 0 loop.
"""
from __future__ import annotations
import sqlite3

from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import StateRepository, SessionRepository
from hush_model.seeding import seed_athlete, SEED_PRIOR_SUM_W
from hush_model.loop.orchestrator import run_one_set
from hush_model.domain import CapabilityState
from hush_model.prediction import predict_reps_to_failure
from hush_model.constants import error_class_weight
from hush_model.capability.epley import rm1_from
from hush_model.capability.reference_strength import score_of
from sim.synthetic_athlete import SyntheticAthlete


def fresh_service():
    db = Database(":memory:")
    return db, HushService(db)


def constant_reps(n):
    # M1/DX-01: a perform callback returns (actual_weight, actual_reps); load the prescription.
    return lambda rec: (rec.recommended_weight, n)


# ---------- schema + seeding round-trip ----------

def test_onboard_persists_seeded_state():
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    state = StateRepository(db.conn).load_athlete_state("a1")
    assert len(state.capabilities) == 5            # five Class-A capabilities
    for cap in state.capabilities.values():
        assert cap.confidence == 10.0
        assert abs(cap.sum_w - SEED_PRIOR_SUM_W) < 1e-9


# ---------- DX-08 Option D onboarding (bodyweight-keyed prior) ----------

def test_onboard_with_bodyweight_writes_option_d_prior():
    from hush_model.seeding import seed_capability_prior_bw, OPTION_D_PRIOR_SUM_W
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "intermediate", bodyweight_kg=85.0)
    state = StateRepository(db.conn).load_athlete_state("a1")
    # persisted prior == the pure generator (conf 25, bodyweight-derived score)
    for capability, cap in state.capabilities.items():
        exp_score, exp_conf, exp_sumw = seed_capability_prior_bw(
            capability, "male", 85.0, 30, "intermediate")
        assert cap.confidence == 25.0
        assert abs(cap.sum_w - OPTION_D_PRIOR_SUM_W) < 1e-9
        assert abs(cap.score - exp_score) < 1e-9
    # first session: the advisory prescription is a liftable, positive day-1 load
    sid = svc.start_session("a1", week=1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    rw = db.conn.execute(
        "SELECT recommended_weight w FROM exercise_block WHERE id=?", (bid,)
    ).fetchone()["w"]
    assert 0.0 < rw < 250.0


def test_onboard_without_bodyweight_unchanged():
    # no-bodyweight onboarding is bit-for-bit the pre-DX-08 3-bucket seed (conf 10)
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    base = StateRepository(db.conn).load_athlete_state("a1")

    db2, svc2 = fresh_service()
    svc2.onboard("a1", "male", 30, "beginner", bodyweight_kg=None)
    same = StateRepository(db2.conn).load_athlete_state("a1")

    for capability, cap in base.capabilities.items():
        other = same.capabilities[capability]
        assert cap.confidence == 10.0
        assert other.score == cap.score
        assert abs(cap.sum_w - SEED_PRIOR_SUM_W) < 1e-9
        assert abs(other.sum_w - SEED_PRIOR_SUM_W) < 1e-9


# ---------- ES-001 hierarchy ----------

def test_hierarchy_no_set_without_block():
    """FK enforcement: a set referencing a missing block must fail."""
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    raised = False
    try:
        with db.transaction() as conn:
            SessionRepository(conn).add_set(
                "eb_does_not_exist", 1, 50.0, 8, 50.0, 8, "completed"
            )
    except sqlite3.IntegrityError:
        raised = True
    assert raised


def test_session_block_set_chain_persists():
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    sid = svc.start_session("a1", week=1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    truth = SyntheticAthlete("a1", "male", 30, "beginner",
                             true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0)
    for set_no in (1, 2, 3):
        svc.pipeline.report_set(
            "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, set_no,
            truth.perform, week=1.0,
        )
    svc.complete_session(sid, "a1")
    # session completed, three sets recorded under the block
    sess = db.conn.execute("SELECT status FROM workout_session WHERE id=?", (sid,)).fetchone()
    assert sess["status"] == "completed"
    n_sets = db.conn.execute(
        "SELECT COUNT(*) c FROM set_record WHERE exercise_block_id=?", (bid,)
    ).fetchone()["c"]
    assert n_sets == 3


# ---------- learning pipeline writes the full chain ----------

def test_report_set_writes_full_audit_chain():
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    sid = svc.start_session("a1", 1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    truth = SyntheticAthlete("a1", "male", 30, "beginner",
                             true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0)
    res = svc.pipeline.report_set(
        "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, 1,
        truth.perform, week=1.0,
    )
    chain = svc.reconstruct_observation(res.observation_id)
    assert chain["observation"]["id"] == res.observation_id
    assert len(chain["evidence"]) == 1
    assert len(chain["state_updates"]) == 1
    # every history row stamped with model versions
    assert chain["evidence"][0]["model_version"]
    assert chain["evidence"][0]["capability_model_version"]


# ---------- sole state writer / state moves correctly ----------

def test_state_is_updated_by_pipeline():
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    sid = svc.start_session("a1", 1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    before = StateRepository(db.conn).get_capability_state("a1", "horizontal_push").score
    truth = SyntheticAthlete("a1", "male", 30, "beginner",
                             true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0)
    svc.pipeline.report_set(
        "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, 1,
        truth.perform, week=1.0,
    )
    after = StateRepository(db.conn).get_capability_state("a1", "horizontal_push").score
    assert after > before          # moved toward truth (55 > seed ~30)


# ---------- transactional atomicity ----------

def test_failed_chain_rolls_back_completely():
    """If perform() raises mid-chain, no partial history or state must persist."""
    db, svc = fresh_service()
    svc.onboard("a1", "male", 30, "beginner")
    sid = svc.start_session("a1", 1.0)
    bid = svc.add_block(sid, "a1", "horizontal_push", "bench_press", 1.0, 0, 8, 3)
    before = StateRepository(db.conn).get_capability_state("a1", "horizontal_push").score

    def exploding_perform(rec):
        raise RuntimeError("athlete app crashed mid-set")

    raised = False
    try:
        svc.pipeline.report_set(
            "a1", sid, bid, "horizontal_push", "bench_press", 1.0, 8, 1,
            exploding_perform, week=1.0,
        )
    except RuntimeError:
        raised = True
    assert raised
    # state unchanged
    after = StateRepository(db.conn).get_capability_state("a1", "horizontal_push").score
    assert after == before
    # no observation / evidence / recommendation written
    for table in ("observation", "evidence", "recommendation", "set_record"):
        n = db.conn.execute(f"SELECT COUNT(*) c FROM {table}").fetchone()["c"]
        assert n == 0, f"{table} had {n} rows after rollback"


# ---------- parity: persisted pipeline == pure Sprint 0 loop ----------

def test_persisted_pipeline_matches_pure_loop():
    """Same seed, same deterministic athlete -> identical score trajectory."""
    # pure loop
    pure_state = seed_athlete("a", "male", 30, "beginner").capabilities["horizontal_push"]
    pure_truth = SyntheticAthlete("a", "male", 30, "beginner",
                                  true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0)
    # persisted loop
    db, svc = fresh_service()
    svc.onboard("a", "male", 30, "beginner")
    sid = svc.start_session("a", 1.0)
    bid = svc.add_block(sid, "a", "horizontal_push", "bench_press", 1.0, 0, 8, 5)
    pers_truth = SyntheticAthlete("a", "male", 30, "beginner",
                                  true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0)

    for i in range(5):
        run_one_set(pure_state, "a", "bench_press", 1.0, 8, pure_truth.perform, 1.0)
        svc.pipeline.report_set("a", sid, bid, "horizontal_push", "bench_press",
                                1.0, 8, i + 1, pers_truth.perform, 1.0)

    persisted_score = StateRepository(db.conn).get_capability_state(
        "a", "horizontal_push"
    ).score
    assert abs(pure_state.score - persisted_score) < 1e-9, (
        pure_state.score, persisted_score
    )


# ---------- M1 (DX-01/DX-02): learning from the athlete's logged actual_weight ----------

def test_m1_rested_deviation_learns_at_actual_load():
    """M1/DX-01+DX-02 (rested): the athlete loads HEAVIER than prescribed and honestly gets
    fewer reps. The chain must learn from the REAL load (DX-01) with the prediction error
    formed at the ACTUAL load (DX-02), so the honest observation keeps full evidence quality
    instead of being down-weighted to "poor". (Model score == truth here so the ONLY error
    source is the load deviation — exactly what DX-02 corrects.)"""
    cap = CapabilityState("horizontal_push", 55.0, 80.0, sum_w=40.0)
    truth = SyntheticAthlete("a", "male", 30, "intermediate",
                             true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0,
                             load_deviation_kg=10.0)            # loads 10 kg over the prescription
    r = run_one_set(cap, "a", "bench_press", 1.0, 8, truth.perform, 1.0)
    obs, rec = r.observation, r.recommendation

    # DX-01: the observation stored the ACTUAL (heavier) load, not the prescription.
    assert obs.actual_weight == rec.recommended_weight + 10.0

    # DX-02: the stored prediction was recomputed at the ACTUAL load (and so differs from the
    # recommendation's prediction, which was built at the lighter recommended load).
    expected_pred = predict_reps_to_failure("horizontal_push", 55.0, 1.0, obs.actual_weight)
    assert abs(obs.predicted_reps_to_failure - expected_pred) < 1e-9
    assert obs.predicted_reps_to_failure != rec.predicted_reps_to_failure

    # DX-02 rescue: the error at the actual load is smaller than the apples-to-oranges error
    # against the light-load prediction, so the honest set keeps acceptable+ quality (>= 0.6),
    # NOT the 0.3 "poor" weight the un-fixed path would assign.
    err_actual = abs(obs.prediction_error)
    err_recommended = abs(obs.actual_reps - rec.predicted_reps_to_failure)
    assert err_actual < err_recommended
    assert error_class_weight(err_actual) >= 0.6

    # DX-01: learning from the real heavy load yields a higher observed-capability score than
    # the pre-DX-01 bug (which paired the LIGHT recommended load with the few honest reps).
    ev = [e for e in r.evidence if e.capability == "horizontal_push"][0]
    s_obs_light_bug = score_of("horizontal_push",
                               rm1_from(rec.recommended_weight, obs.actual_reps))
    assert ev.s_obs > s_obs_light_bug


def test_m1_no_deviation_is_bit_identical():
    """M1 Layer-1 invariance: when the athlete loads exactly the prescription (the default),
    the recomputed prediction equals the recommendation's prediction bit-for-bit, so the whole
    learning path is byte-unchanged from pre-M1."""
    cap = CapabilityState("horizontal_push", 50.0, 80.0, sum_w=40.0)
    truth = SyntheticAthlete("a", "male", 30, "intermediate",
                             true_score={"horizontal_push": 60.0}, rep_noise_sd=0.0)  # no deviation
    r = run_one_set(cap, "a", "bench_press", 1.0, 8, truth.perform, 1.0)
    obs, rec = r.observation, r.recommendation
    assert obs.actual_weight == rec.recommended_weight
    assert obs.predicted_reps_to_failure == rec.predicted_reps_to_failure       # bit-identical
    assert obs.prediction_error == obs.actual_reps - rec.predicted_reps_to_failure


def test_m1_fatigue_aware_deviation_routes_actual_load():
    """M1/DX-01+DX-02 (fatigue-aware path): the logged heavy load is routed into the
    observation and the prediction is recomputed at the actual load with fatigue threaded."""
    cap = CapabilityState("horizontal_push", 55.0, 80.0, sum_w=40.0, last_trained_at_week=1.0)
    dev = SyntheticAthlete("a", "male", 30, "intermediate",
                           true_score={"horizontal_push": 55.0}, rep_noise_sd=0.0,
                           load_deviation_kg=10.0)
    r = run_one_set(cap, "a", "bench_press", 1.0, 8, dev.perform, 1.0, enable_fatigue=True)
    obs, rec = r.observation, r.recommendation
    est_fatigue = r.est_fatigue_systemic + r.est_fatigue_capability
    # DX-01: actual heavy load stored
    assert obs.actual_weight == rec.recommended_weight + 10.0
    # DX-02: prediction recomputed at the actual load with the SAME fatigue rec was built on
    expected_pred = predict_reps_to_failure(
        "horizontal_push", 55.0, 1.0, obs.actual_weight, fatigue=est_fatigue)
    assert abs(obs.predicted_reps_to_failure - expected_pred) < 1e-9
    assert obs.predicted_reps_to_failure != rec.predicted_reps_to_failure
