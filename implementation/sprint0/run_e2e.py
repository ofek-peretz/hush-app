"""
End-to-end Sprint 0 execution.

Seeds an athlete, then runs the closed learning loop for one capability
(horizontal_push / bench) over several weeks against a synthetic athlete whose
TRUE capability differs from the seed. Prints the model's score and confidence
converging toward truth - demonstrating the loop closes.

Run:  python -m sim.run_e2e   (from the hush/ project root)
"""
from __future__ import annotations

from hush_model.seeding import seed_athlete
from hush_model.loop.orchestrator import run_one_set
from sim.synthetic_athlete import SyntheticAthlete

CAP = "horizontal_push"
EXERCISE = "bench_press"
DIFFICULTY = 1.0
TARGET_REPS = 8
SETS_PER_WEEK = 3
WEEKS = 8


def main() -> None:
    # Model seeds a BEGINNER male; true capability is actually higher (intermediate-ish).
    athlete_state = seed_athlete("ath_001", sex="male", age=30, experience="beginner")
    cap_state = athlete_state.capabilities[CAP]

    truth = SyntheticAthlete(
        athlete_id="ath_001", sex="male", age=30, experience="beginner",
        true_score={CAP: 55.0},          # model seeded ~30; truth is 55
        weekly_gain={CAP: 0.4},          # genuinely progressing
        rep_noise_sd=0.8,
    )

    print(f"{'wk':>3} {'set':>3} {'rec_kg':>7} {'pred':>5} {'actual':>6} "
          f"{'score':>6} {'true':>6} {'conf':>5}")
    print("-" * 52)

    for week in range(1, WEEKS + 1):
        for s in range(1, SETS_PER_WEEK + 1):
            res = run_one_set(
                state=cap_state, athlete_id="ath_001", exercise=EXERCISE,
                difficulty_factor=DIFFICULTY, target_reps=TARGET_REPS,
                perform=truth.perform, week=float(week),
            )
            print(f"{week:>3} {s:>3} "
                  f"{res.recommendation.recommended_weight:>7.1f} "
                  f"{res.recommendation.predicted_reps_to_failure:>5.1f} "
                  f"{res.observation.actual_reps:>6d} "
                  f"{res.score_after:>6.1f} "
                  f"{truth.true_score[CAP]:>6.1f} "
                  f"{res.confidence_after:>5.1f}")
        truth.advance_week(1.0)

    print("-" * 52)
    print(f"final model score: {cap_state.score:.1f}  "
          f"true score: {truth.true_score[CAP]:.1f}  "
          f"confidence: {cap_state.confidence:.1f}  sum_w: {cap_state.sum_w:.2f}")


if __name__ == "__main__":
    main()
