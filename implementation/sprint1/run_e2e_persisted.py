"""
Sprint 1 end-to-end: persisted multi-session run with audit reconstruction.

Onboards an athlete, runs several weekly sessions through the persisted learning
pipeline, then reconstructs the audit chain for the final observation to show the
full Observation -> Evidence -> State Update trace is recoverable from the database.

Run:  PYTHONPATH=. python -m sim.run_e2e_persisted
"""
from __future__ import annotations

from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.repositories import StateRepository
from sim.synthetic_athlete import SyntheticAthlete

CAP, EXERCISE, DF = "horizontal_push", "bench_press", 1.0
TARGET, SETS, WEEKS = 8, 3, 8


def main() -> None:
    db = Database(":memory:")
    svc = HushService(db)
    svc.onboard("ath_001", sex="male", age=30, experience="beginner")

    truth = SyntheticAthlete(
        "ath_001", "male", 30, "beginner",
        true_score={CAP: 55.0}, weekly_gain={CAP: 0.4}, rep_noise_sd=0.8,
    )

    print(f"{'wk':>3} {'rec_kg':>7} {'pred':>5} {'actual':>6} {'score':>6} "
          f"{'true':>6} {'conf':>5}")
    print("-" * 46)

    last_obs_id = None
    for week in range(1, WEEKS + 1):
        sid = svc.start_session("ath_001", float(week))
        bid = svc.add_block(sid, "ath_001", CAP, EXERCISE, DF, 0, TARGET, SETS)
        for set_no in range(1, SETS + 1):
            res = svc.pipeline.report_set(
                "ath_001", sid, bid, CAP, EXERCISE, DF, TARGET, set_no,
                truth.perform, float(week),
            )
            last_obs_id = res.observation_id
        svc.complete_session(sid, "ath_001")
        cap = StateRepository(db.conn).get_capability_state("ath_001", CAP)
        obs = db.conn.execute(
            "SELECT * FROM observation WHERE id=?", (last_obs_id,)
        ).fetchone()
        print(f"{week:>3} {obs['actual_weight']:>7.1f} "
              f"{obs['predicted_reps_to_failure']:>5.1f} "
              f"{obs['actual_reps']:>6d} {cap.score:>6.1f} "
              f"{truth.true_score[CAP]:>6.1f} {cap.confidence:>5.1f}")
        truth.advance_week(1.0)

    print("-" * 46)
    cap = StateRepository(db.conn).get_capability_state("ath_001", CAP)
    print(f"final score {cap.score:.1f}  true {truth.true_score[CAP]:.1f}  "
          f"conf {cap.confidence:.1f}  sum_w {cap.sum_w:.2f}")

    print("\n--- audit reconstruction of final observation ---")
    chain = svc.reconstruct_observation(last_obs_id)
    o = chain["observation"]
    print(f"observation: {o['exercise']} {o['actual_weight']}kg x{o['actual_reps']} "
          f"(pred_to_failure {o['predicted_reps_to_failure']:.1f}, "
          f"error {o['prediction_error']:+.1f})")
    for ev in chain["evidence"]:
        print(f"  evidence: cap={ev['capability']} s_obs={ev['s_obs']:.1f} "
              f"weight={ev['weight']:.3f} [{ev['model_version']}/"
              f"{ev['capability_model_version']}]")
    for u in chain["state_updates"]:
        print(f"  state_update: score {u['prev_score']:.1f} -> {u['new_score']:.1f}, "
              f"conf {u['prev_confidence']:.1f} -> {u['new_confidence']:.1f} "
              f"({u['reason']})")
    db.close()


if __name__ == "__main__":
    main()
