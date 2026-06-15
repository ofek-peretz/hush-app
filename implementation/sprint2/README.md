# Sprint 2 — Fatigue & Recovery (ES-011) + Variance-Suppressed Confidence (ES-010 Part C)

Adds the explicit latent fatigue state between true capability and observed
performance (Principle #59: `observed = capability − fatigue`), so the learning loop
stops crediting recovery state to capability change. Also wires ES-010 Part C
(variance-suppressed confidence) as infrastructure. **No model redesign** — the two
ES-011 amendments are applied exactly as the frozen spec declares them, and every
change is backward-compatible by default (the Sprint 0/1 rested path is unchanged).

## Accepted decisions implemented

1. **ES-010 Part C is in scope** — variance accumulators + agreement factor + confidence
   suppression + learning-rate damping.
2. **Fixed population κ/τ only** — no per-athlete τ learning (ES-011 D.3 / A6 deferred).
3. **`effort_offset = 0`** for the MVP (A5 untestable without RIR; fatigue is the sole
   observation correction, flagged un-separated).
4. **Roadmap docs corrected** to the as-built sprint sequence.
5. **Variance suppression is infrastructure, not calibration** — `σ²_ref` (and κ, τ) are
   provisional/UNVALIDATED constants; their calibration is a Phase 0 simulation task, not
   Sprint 2's.

## The two frozen amendments (ES-011)

- **ES-005.1 §4**: `effort_offset` is the *stable* component of `correction = effort_offset
  + Fatigue_c`; the time-varying part is fatigue. (MVP: `effort_offset = 0`.)
- **ES-010 Part A ordering**: fatigue is removed **in rep space, before** the ES-005.1
  conversion and therefore **before attribution** (`evidence.py` reorder).

## Run

```
PYTHONPATH=. python -m pytest tests/ -q     # 46 passing (12 sprint0 + 7 sprint1 + 27 sprint2)
```

(Verified via a minimal runner where pytest is unavailable; the 19 prior tests pass
bit-for-bit — the rested path is provably unchanged.)

## Files in this sprint

New (assemble at the documented `hush_model/` locations):

```
fatigue.py                 -> hush_model/fatigue.py
    set_fatigue (A.4), accumulate (A.5), defatigue_reps (C.3, rep space),
    observation_fatigue, surprise (C.1), decision_reason (B.3/E.1)
recovery.py                -> hush_model/recovery.py
    decay_fatigue, estimate_current_fatigue (Part D, FIXED tau)
variance.py                -> hush_model/variance.py
    update_moments, recent_variance, agreement (ES-010 C.2/C.4)
migration_002_fatigue.py   -> hush_model/persistence/migrations/migration_002_fatigue.py
    additive, idempotent ALTER TABLE + schema_version stamp
test_sprint2.py            -> tests/test_sprint2.py
```

Modified in place (Sprint 0/1 snapshots), all backward-compatible by default:

```
constants.py        kappa, tau_sys/tau_cap, RIR_REFERENCE, exercise_cost, EFFORT_OFFSET=0,
                    SIGMA2_REF, fatigue thresholds, MIN_EFFECTIVE_REPS  (ALL PROVISIONAL)
domain.py           CapabilityState.fatigue + variance moments; AthleteState.fatigue_systemic;
                    audit fields on Recommendation/Observation/Evidence
prediction.py       optional fatigue: predict from score − Fatigue_c (B.1); default 0.0
evidence.py         optional est_fatigue: de-fatigue reps before conversion (C.3); default 0.0
state_update.py     optional agreement: variance-damped weight + suppressed confidence; default 1.0
confidence.py       optional agreement multiplies the saturation curve (C.2); default 1.0
recommendation.py   fatigue-aware: hold load + cut reps, drop weight below the rep floor,
                    fatigue_hold reason, INCREASE structurally vetoed (B.2/B.3); default rested
loop/orchestrator.py  enable_fatigue path: estimate→de-fatigue→variance→update→generate
persistence/schema.py        new columns (fatigue, variance moments, audit) + schema_version
persistence/repositories.py  read/write fatigue + variance; systemic fatigue; audit inserts
persistence/pipeline.py      report_set_fatigue_aware (ES-011 master loop, transactional)
sim/synthetic_athlete.py     INDEPENDENT fatigue/recovery generator (non-circular; default off)
```

## Verified invariants (test_sprint2.py)

- **Zero-fatigue / agreement=1 is the identity** — de-fatigue, prediction, recommendation,
  evidence, and confidence all reduce exactly to Sprint 0/1.
- Set-fatigue golden value; set-to-failure costs more than with reserve; `w_c` split.
- Decay anchors; systemic recovers slower than small-muscle capability fatigue.
- **C.3 ordering**: rep-space de-fatigue ≡ score-space add-back (Principle #43 preserved).
- **C.1 surprise**: deficit explained by fatigue → surprise≈0; de-fatiguing preserves the
  score better than fatigue-blind learning.
- **ES-010 C**: agreement high when coherent / low under conflict; confidence suppressed and
  learning damped under conflict; **Contradiction 4** — removing fatigue first keeps recent
  variance low for a hard-training athlete.
- Fatigue-aware recommendation: reps-before-weight reduction order; `fatigue_hold`; INCREASE
  vetoed; decision-reason codes.
- Persisted fatigue-aware pipeline writes + reconstructs the fatigue/agreement audit;
  migration is additive and idempotent.
- Harness sanity: constant truth + fatigue → inferred score stays stable (no ratchet).

## Deferred (stubbed at clean boundaries, not redesigned)

- ES-009 recovery gate + ES-009.1 fatigue ceiling (session composition not built) — fatigue
  generation/decay/de-fatigue/prediction do not depend on them.
- ES-013 `CHANGE_STRATEGY` on chronic systemic fatigue — signal only; licensing needs an
  investigation.
- Per-athlete τ learning (A6); `effort_offset` identification (A5).
- **κ / τ / σ²_ref calibration → Phase 0 simulation.** Until then the fatigue/variance
  correction is *directional, not calibrated* (ES-011 closing note).

## ⚠ Provisional parameters

`KAPPA`, `TAU_SYS`, `TAU_CAP`, `RIR_REFERENCE`, `EXERCISE_COST_DEFAULT`, `SIGMA2_REF`,
`FATIGUE_ELEVATED_SCORE`, `SURPRISE_REGRESSION_SCORE`, `MIN_EFFECTIVE_REPS` are UNVALIDATED.
They exist so the engine runs and is testable. **Do not tune them to make a scenario look
good** — calibration is a Phase 0 responsibility (Validation Architecture; Build Plan §10).
