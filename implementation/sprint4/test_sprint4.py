"""
Sprint 4 tests — Phase 0 instrumentation & simulation/calibration harness. Plain-assert
functions (no pytest), run by the assemble harness.

Covers the readiness review's TC1-TC11 and the ratified priorities:
  override_parameters round-trip + restoration (HD1, precondition 1); harness known-answer
  sanity (constant/improver/recovery/fatigued); non-circularity (R2); shadow is a FIXED policy
  that ignores model state (R5) + rows recorded + the A8 paired metric; override-target logging
  (A9); complete reconstruction; migration 006 additive/idempotent + fresh-vs-migrated parity;
  metric detectors; determinism; the recommend-only guard (Q1); and that instruments are inert
  on a non-instrumented session (parity).
"""
from __future__ import annotations
import sqlite3

from hush_model import fatigue, constants as C
from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import StateRepository, SessionRepository, LearningRepository
from hush_model.persistence.migrations import migration_006_instrumentation as m006
from hush_model.domain import Observation

from sim.parameters import override_parameters, current_value, assert_unpatched, PARAMETERS
from sim.harness import Harness, session_seed
from sim import scenarios as scn
from sim import metrics as M
from sim import calibration as cal
from sim import gate as G
from sim.shadow import ShadowPolicy

CAP = "knee_dominant"


# ----------------------------- HD1: override_parameters (precondition 1) -----------------------------

def test_override_parameters_takes_effect_and_restores():
    base = fatigue.set_fatigue(effective_load=50, reference_strength_c=100,
                               reps_performed=8, predicted_reps_to_failure=10)
    with override_parameters(KAPPA=current_value("KAPPA") * 2):
        assert current_value("KAPPA") == C.KAPPA * 2
        inside = fatigue.set_fatigue(effective_load=50, reference_strength_c=100,
                                     reps_performed=8, predicted_reps_to_failure=10)
        assert abs(inside - 2 * base) < 1e-9          # production fn used the override
    assert abs(fatigue.set_fatigue(effective_load=50, reference_strength_c=100,
               reps_performed=8, predicted_reps_to_failure=10) - base) < 1e-12  # restored
    assert_unpatched()


def test_override_parameters_handles_globals_and_kwdefaults():
    from hush_model import composition
    from hush_model.persistence import pipeline
    with override_parameters(P_EXPLORE=0.99, TAU_SYS=9.9, SESSION_FATIGUE_CEILING=12):
        assert composition.P_EXPLORE == 0.99
        assert pipeline.TAU_SYS == 9.9
        assert composition.compose_session.__kwdefaults__["ceiling"] == 12
    assert_unpatched()


def test_override_rejects_non_targets():
    try:
        with override_parameters(STABILITY_N=5):   # ratified, not a target
            pass
        assert False, "expected KeyError for a non-calibration-target parameter"
    except KeyError:
        pass


# ----------------------------- harness sanity (known answers) -----------------------------

def _halves(series):
    h = len(series) // 2
    return series[h] - series[0], series[-1] - series[h]

def test_constant_athlete_is_stable_and_bounded():
    h = Harness(); a = scn.constant_athlete(); h.setup(a)
    t = h.run(a, weeks=12); s = t.series(CAP); h.close()
    assert 44.0 <= s[-1] <= 56.0                    # bounded near true 48
    assert M.oscillation(s) < 2.0                   # not oscillating
    first_half, second_half = _halves(s)
    assert second_half <= first_half + 0.5          # decelerating / settling, not diverging
    assert second_half > -3.0                       # not collapsing downward


def test_improver_athlete_rises():
    h = Harness(); a = scn.improver_athlete(); h.setup(a)
    t = h.run(a, weeks=12); s = t.series(CAP); h.close()
    assert s[-1] > s[0] + 2.0                        # genuinely rising


def test_recovery_converges_toward_hidden_truth_R2():
    # seed intermediate (48) but TRUE 58 -> model must recover a truth it was never given.
    h = Harness(); a = scn.recovery_athlete(true=58.0); h.setup(a)
    t = h.run(a, weeks=16); s = t.series(CAP); h.close()
    assert s[-1] > 54.0                              # recovered most of the 10-point gap
    assert abs(s[-1] - 58.0) < abs(48.0 - 58.0)      # beats the no-learning (seed) baseline


def test_fatigued_athlete_recovers_true_score():
    h = Harness(); a = scn.fatigued_athlete(); h.setup(a)
    t = h.run(a, weeks=12); s = t.series(CAP); h.close()
    assert 44.0 <= s[-1] <= 56.0                     # recovers near true 48 despite fatigue
    assert M.oscillation(s) < 2.5


def test_harness_is_deterministic():
    h1 = Harness(); a1 = scn.recovery_athlete(true=58.0); h1.setup(a1); t1 = h1.run(a1, weeks=8)
    h2 = Harness(); a2 = scn.recovery_athlete(true=58.0); h2.setup(a2); t2 = h2.run(a2, weeks=8)
    assert t1.series(CAP) == t2.series(CAP)          # identical runs -> identical trajectory
    h1.close(); h2.close()


# ----------------------------- shadow baseline (A8 / R5) -----------------------------

def test_shadow_policy_is_fixed_and_state_free():
    p = ShadowPolicy()
    key = ("a", "back_squat")
    assert p.recommend(key, 100.0) == 100.0          # seeds from the model's first load
    assert p.predict_rtf(key, 8) == 8.0              # no history -> expect prescription
    p.record(key, target_reps=8, actual_reps=9)      # completed -> progress
    assert p.recommend(key, 999.0) == 102.5          # +increment; ignores the new seed arg
    assert p.predict_rtf(key, 8) == 9.0              # persistence forecast = last actual
    p.record(key, target_reps=8, actual_reps=5)      # missed -> hold
    assert p.recommend(key, 0.0) == 102.5


def test_shadow_rows_recorded_and_paired_metric():
    h = Harness(); a = scn.constant_athlete("sh"); h.setup(a, confidence=80.0)
    h.run(a, weeks=4, record_shadow=True)
    n = h.db.conn.execute("SELECT COUNT(*) FROM shadow_recommendation").fetchone()[0]
    assert n > 0
    paired = M.shadow_paired(h.db)
    assert paired["n"] == n and "model_mae" in paired and "shadow_mae" in paired
    h.close()


def test_non_instrumented_session_leaves_shadow_empty():
    h = Harness(); a = scn.constant_athlete("ni"); h.setup(a)
    h.run(a, weeks=2, record_shadow=False)           # no shadow recording
    n = h.db.conn.execute("SELECT COUNT(*) FROM shadow_recommendation").fetchone()[0]
    assert n == 0                                     # instrument inert unless invoked (parity)
    h.close()


# ----------------------------- override logging (A9) + reconstruction -----------------------------

def test_override_target_logging_and_reconstruction():
    db = Database(":memory:")
    HushService(db).onboard("a", "male", 30, "intermediate")
    with db.transaction() as conn:
        sess = SessionRepository(conn); lr = LearningRepository(conn)
        sid = sess.create_session("a", 1.0)
        bid = sess.add_block(sid, CAP, "back_squat", 1.0, 0, 100.0, 8, 3)
        set_id = sess.add_set(bid, 1, 100.0, 8, actual_weight=90.0, actual_reps=8,
                              status="completed")
        obs = Observation(athlete_id="a", capability=CAP, exercise="back_squat",
                          difficulty_factor=1.0, actual_weight=90.0, actual_reps=8,
                          predicted_reps_to_failure=8.0, prediction_error=0.0, week=1.0)
        lr.insert_observation(obs, sid, bid, set_id,
                              override_category="LOAD", override_target=90.0)
    recon = HushService(db).reconstruct_session(sid)
    obs_rows = recon["blocks"][0]["observations"]
    assert obs_rows[0]["override_category"] == "LOAD"
    assert obs_rows[0]["override_target"] == 90.0
    db.close()


def test_reconstruct_session_is_complete():
    h = Harness(); a = scn.constant_athlete("rc"); h.setup(a, confidence=80.0)
    sid_traj = h.run(a, weeks=1, record_shadow=True)
    sid = h.db.conn.execute("SELECT id FROM workout_session LIMIT 1").fetchone()[0]
    recon = HushService(h.db).reconstruct_session(sid)
    assert recon["session"]["exploration_seed"] is not None     # composition audit present
    assert recon["blocks"], "expected blocks"
    b0 = recon["blocks"][0]
    assert b0["recommendations"] and b0["observations"]          # full chain present
    h.close()


# ----------------------------- migration 006 (MR1) -----------------------------

def _v5_like_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE observation (id TEXT PRIMARY KEY, capability TEXT, "
                 "actual_reps INTEGER, week REAL)")   # pre-Sprint-4 observation (no override cols)
    return conn

def test_migration_006_additive_and_idempotent():
    conn = _v5_like_conn()
    assert m006.apply(conn) is True
    obs_cols = {r[1] for r in conn.execute("PRAGMA table_info(observation)")}
    assert "override_category" in obs_cols and "override_target" in obs_cols
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "shadow_recommendation" in tables
    ver = conn.execute("SELECT version FROM schema_version ORDER BY version DESC").fetchone()[0]
    assert ver == 6
    assert m006.apply(conn) is False                  # idempotent

def test_fresh_vs_migrated_columns_match_006():
    fresh = Database(":memory:")
    fresh_obs = {r[1] for r in fresh.conn.execute("PRAGMA table_info(observation)")}
    fresh_tables = {r[0] for r in fresh.conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    migrated = _v5_like_conn(); m006.apply(migrated)
    mig_obs = {r[1] for r in migrated.execute("PRAGMA table_info(observation)")}
    new = {"override_category", "override_target"}
    assert new <= fresh_obs and new <= mig_obs
    assert "shadow_recommendation" in fresh_tables
    fresh.close()


# ----------------------------- metric detectors (TC7) -----------------------------

def test_metric_detectors_flag_known_bad_pass_known_good():
    osc_bad = [50, 53, 47, 54, 46, 53, 47, 52]
    osc_good = [48, 48.1, 48.0, 47.9, 48.05, 48, 47.95, 48.02]
    assert M.oscillation(osc_bad) > M.oscillation(osc_good)
    assert M.reversals(osc_bad) >= 4 and M.reversals(osc_good) <= 4
    drift = [48, 49, 50, 51, 52, 53, 54, 55]
    assert M.drift_vs_flat(drift) > 0.9 and M.drift_vs_flat(osc_good) < 0.1
    assert M.load_ratchet([40, 42.5, 45, 47.5]) == 3
    assert M.load_ratchet([40, 40, 42.5, 40]) == 1


# ----------------------------- calibration + gate (recommend-only, raw-first) -----------------------------

def test_calibration_sweep_recommends_without_adopting_Q1():
    before = (C.KAPPA, C.TAU_SYS, C.SIGMA2_REF)
    res = cal.sweep("KAPPA", [C.KAPPA, C.KAPPA * 1.5], weeks=6)
    assert res.recommended in (C.KAPPA, C.KAPPA * 1.5)
    assert len(res.points) == 2 and res.as_rows()
    # recommend-only: nothing adopted; bindings restored; constants untouched (Q1).
    assert_unpatched()
    assert (C.KAPPA, C.TAU_SYS, C.SIGMA2_REF) == before


def test_under_exercised_report_names_ceiling_and_bands():
    rep = cal.under_exercised_report()
    assert "SESSION_FATIGUE_CEILING" in rep and "volume_bands" in rep
    assert "null_focus_multiplier" in rep


def test_gate_reports_raw_metrics_first():
    res = G.evaluate(weeks=10)
    assert "constant" in res.raw and "recovery" in res.raw
    assert CAP in res.raw["constant"] and "oscillation" in res.raw["constant"][CAP]
    assert isinstance(res.passed_provisional, bool)
    assert any("PROVISIONAL" in n for n in res.notes)     # verdict labelled provisional (Q5)


def test_recommend_only_guard_constants_unchanged():
    # the full Sprint 4 surface must never adopt a calibrated value (Q1).
    snapshot = {p: current_value(p) for p in PARAMETERS}
    cal.sweep("TAU_SYS", [C.TAU_SYS, C.TAU_SYS * 1.5], weeks=5)
    assert_unpatched()
    assert {p: current_value(p) for p in PARAMETERS} == snapshot


# ----------------------------- DX-12: reoriented success basis (gate repoint) -----------------------------

def test_gate_success_basis_is_stability_and_estimate_recovery_not_load_prediction():
    """DX-12/DX-14: the Phase-0 gate gates on STABILITY (trend primitives) AND ESTIMATE-RECOVERY
    (score-estimate calibration + beats-no-learning) — NOT load/reps prediction."""
    res = G.evaluate(weeks=10)
    # the verdict is composed of exactly the two reoriented members.
    assert set(res.criteria) == {"stability", "estimate_recovery"}
    assert all(isinstance(v, bool) for v in res.criteria.values())
    # no load/reps-prediction member gates the verdict.
    assert not any("predict" in k or "load" in k or "shadow" in k for k in res.criteria)
    # passed_provisional is EXACTLY stability AND estimate_recovery (no hidden criterion).
    assert res.passed_provisional == (res.criteria["stability"]
                                      and res.criteria["estimate_recovery"])


def test_gate_notes_record_reoriented_basis_and_diagnostic_demotion():
    """The gate notes must state the reoriented basis, demote load/reps prediction to a
    DIRECTIONAL diagnostic, and point criterion (b) at the M5 detection suite."""
    notes = " ".join(G.evaluate(weeks=10).notes).lower()
    assert "reorient" in notes                       # the basis was reoriented (DX-12/DX-14)
    assert "estimate-recovery" in notes or "estimate_recovery" in notes
    assert "directional" in notes and "not gated" in notes   # load/reps prediction demoted
    assert "m5" in notes and "test_sprint6" in notes          # criterion (b) pointer


def test_load_prediction_metrics_are_directional_diagnostics_only():
    """The shadow paired forecast + fresh-state re-test remain computable as DIRECTIONAL
    model-quality diagnostics (per A8) — reframed off the success basis, still reported."""
    # fresh-state re-test still returns a directional reps-prediction read.
    fs = M.fresh_state_check(CAP, inferred_score=50.0, true_rested_score=50.0,
                             standard_load=M.standard_load_for(CAP, 50.0))
    assert {"model_error", "naive_error", "model_beats_naive"} <= set(fs)
    # the shadow paired metric is directional (effect size + win rate), and is NOT a gate member.
    h = Harness(); a = scn.constant_athlete("dx12"); h.setup(a, confidence=80.0)
    h.run(a, weeks=3, record_shadow=True)
    paired = M.shadow_paired(h.db)
    assert "model_win_rate" in paired and "model_beats_shadow" in paired
    h.close()
    assert "shadow" not in G.evaluate(weeks=6).criteria   # shadow does not gate the verdict
