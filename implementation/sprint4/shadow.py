"""
Shadow baseline policy (A8 counterfactual). Sprint 4. FROZEN for the sprint (precondition 3).

ES-012 F.1 / Validation Architecture A8: the shadow baseline is a FIXED, NON-LEARNING
linear-progression policy — the NO-LEARNING counterfactual. On every recommendation we also
compute what this policy would have recommended and predicted, and score both against the SAME
observed actuals — the within-athlete paired comparison that powers A8.

SUCCESS BASIS — REORIENTED (DX-12 / DX-14): the shadow's paired reps-to-failure prediction
error is now a DIRECTIONAL model-quality diagnostic, NOT the headline load-prediction success
test. The retained success role of the no-learning baseline is the SCORE-estimate "beats
no-learning" check (gate.py / metrics.recoverability); the shadow's reps forecast is reported
(per A8), not gated. The policy itself is unchanged.

THE INVARIANT THAT MAKES A8 VALID (readiness review R5/SM1): the shadow reads ACTUALS and
its own running state ONLY. It NEVER reads capability_state or any model estimate; if it
did, it would be a second learner, not a counterfactual. It is seeded from the model's
first recommended load for an exercise (HD2) so the comparison is fair from t=0, then it
moves by its own fixed rule.

These constants are the COUNTERFACTUAL's parameters, not the model's — they are deliberately
NOT in hush_model/constants.py and are NOT calibration targets.

CONCEPTUAL LOCATION: sim/shadow.py (harness package).
"""
from __future__ import annotations
from dataclasses import dataclass

SHADOW_INCREMENT_KG: float = 2.5   # fixed linear-progression step (the baseline's own rule)


@dataclass
class _ShadowState:
    weight: float           # the shadow's running prescribed load
    last_actual_reps: int | None = None


class ShadowPolicy:
    """A fixed linear-progression counterfactual, stateful per (athlete, exercise).

    recommend: prescribe a load (seed from the model's first load, then +increment on a
               completed prescription, else hold).
    predict:   a NAIVE persistence forecast (last actual reps; the prescribed reps if no
               history) — the "last working set" baseline A1/A8 lean on.
    record:    advance the policy from the observed actuals (the only thing it reads).
    """

    def __init__(self, increment: float = SHADOW_INCREMENT_KG):
        self.increment = increment
        self._state: dict[tuple, _ShadowState] = {}

    def recommend(self, key: tuple, model_seed_weight: float) -> float:
        st = self._state.get(key)
        if st is None:
            st = _ShadowState(weight=float(model_seed_weight))
            self._state[key] = st
        return st.weight

    def predict_rtf(self, key: tuple, target_reps: int) -> float:
        st = self._state.get(key)
        if st is None or st.last_actual_reps is None:
            return float(target_reps)            # no history: expect the prescription
        return float(st.last_actual_reps)        # persistence forecast (naive)

    def record(self, key: tuple, target_reps: int, actual_reps: int) -> None:
        st = self._state[key]
        if actual_reps >= target_reps:           # completed the prescription -> progress
            st.weight = st.weight + self.increment
        st.last_actual_reps = int(actual_reps)
