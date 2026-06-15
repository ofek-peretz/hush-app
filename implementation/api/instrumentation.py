"""
Request-path validation instruments (BB-10) — live from session one, or the trial is "dead on
arrival" (build plan §8). These capture the A7/A8/A9 evidence the trial is measured by, in the
ingestion path, within the same transaction as the learning chain.

  - **A8 shadow baseline:** alongside the model recommendation, record what the FIXED, non-learning
    linear-progression counterfactual (`sim/shadow.py`) would have prescribed/predicted, scored
    against the SAME actuals — the within-athlete paired comparison. The shadow's running state is
    reconstructed from the persisted `shadow_recommendation` history (the persisted equivalent of
    the in-process `ShadowPolicy`, exactly as `session_progress` is to `_CapMemory`), so it carries
    correctly across the per-request connection model. Reoriented (DX-12/DX-14): the shadow's reps
    forecast is a DIRECTIONAL diagnostic (reported, not gated).
  - **A9 override log:** handled in the learning chain via the BB-7 opt-in passthrough
    (`override_category`/`override_target` on the observation) — see `lifecycle.report_set`.

The shadow increment is sourced from `sim.shadow.SHADOW_INCREMENT_KG` (the counterfactual's own
parameter, deliberately outside the model) so there is one definition of the baseline's rule.

CONCEPTUAL LOCATION: app/instrumentation.py.
"""
from __future__ import annotations

from sim.shadow import SHADOW_INCREMENT_KG
from hush_model.persistence.repositories import LearningRepository


def record_shadow_baseline(
    conn,
    athlete_id: str,
    recommendation_id: str | None,
    capability: str,
    exercise: str,
    model_seed_weight: float,
    model_predicted_rtf: float,
    target_reps: int,
    actual_reps: int,
    week: float,
) -> str:
    """Append one A8 shadow row for this set, reconstructing the shadow's running state from its
    most recent persisted row for (athlete, exercise):

      - first sight: seed at the model's load (fair from t=0, HD2); naive forecast = target_reps.
      - thereafter: +increment iff the previous prescription was completed (actual ≥ target);
        persistence forecast = previous actual reps.

    This reproduces `ShadowPolicy.recommend/predict_rtf/record` exactly, without sharing process
    state across requests."""
    prev = conn.execute(
        "SELECT shadow_weight, actual_reps FROM shadow_recommendation "
        "WHERE athlete_id=? AND exercise=? ORDER BY created_at DESC LIMIT 1",
        (athlete_id, exercise),
    ).fetchone()
    if prev is None:
        shadow_weight = float(model_seed_weight)
        shadow_pred = float(target_reps)
    else:
        progressed = prev["actual_reps"] >= target_reps
        shadow_weight = float(prev["shadow_weight"]) + (SHADOW_INCREMENT_KG if progressed else 0.0)
        shadow_pred = float(prev["actual_reps"])

    return LearningRepository(conn).insert_shadow_recommendation(
        recommendation_id=recommendation_id, athlete_id=athlete_id, capability=capability,
        exercise=exercise, shadow_weight=shadow_weight, shadow_predicted_rtf=shadow_pred,
        model_predicted_rtf=float(model_predicted_rtf), actual_reps=int(actual_reps), week=week,
    )
