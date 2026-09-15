# M1_EXECUTION_PACKAGE.md — input-contract flip + learned-capability program construction

> **Scope:** the implementation delta for the **M1 bundle** — **DX-01, DX-02, DX-20, DX-05, DX-06, DX-19** —
> from `HUSH_V1_DELTA_EXECUTION_PLAN.md` and as scoped/licensed by `M1_MIGRATION_READINESS_REVIEW.md`
> (this package implements that review; read it first). Implementation only. No philosophy beyond the
> owner-confirmed assumption, no redesign outside §6 of the review (which this package executes).
>
> **Owner-confirmed behavior:** *recommendations are advisory; actual performance is truth; future programs
> are built from learned reality.* Session frozen once composed · no mid-session auto-ratchet · no
> execution-time load progression · **between sessions / at composition, learned capability drives the load.**
>
> **Move as ONE unit (binding).** DX-01/02/20/05/06/19 share the reps-only→actual_weight root; partial
> application leaves the system internally contradictory (Delta-Plan note; review §9).
>
> **Baseline:** Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ · Schema **v7** (unchanged by M1) · **134/134**.
> Date: 2026-06-11. Trace: Gap Review M1/M2; Delta Plan DX-01/02/05/06/19; review §2–§6.

---

## 1. The change in one paragraph

The athlete's logged `actual_weight` becomes a **learning input** (DX-01): it is fed into the observation, so
the evidence engine — which already consumes `obs.actual_weight` (`evidence.py:60`) — learns from the **real
load**. The evidence **quality** is corrected by re-evaluating the rep prediction at the **actual** load
(DX-02), so an honest heavier-load-fewer-reps set is trusted, not down-weighted. With the score now truthful,
**future program construction is built from it** (DX-20): the rested recommendation emits the score-derived
`target_load` instead of the frozen historical `held_load`, so the next session is composed at learned
capability while the **session stays frozen and execution never ratchets** (the advisory governor still
records the lean, now session-over-session). The §7 contract and the F1 report are reversed (DX-05/06) to make
`actual_weight` a required learning input, and the suite + Phase-0 goldens are updated (DX-19). **No schema,
no migration — v7 throughout. No ① core-math change.**

---

## 2. Source-of-truth note (read before editing)

`build/_assembled/` is **generated**. `build/_verify/assemble_and_test.py` does `rmtree(OUT)` then copies from
`implementation/…`. **Edit the `implementation/` source only.**

| Symbol / change | Source-of-truth file | Assembled mirror (do NOT edit) |
|---|---|---|
| Pipeline learning chain (DX-01/02) | `implementation/sprint1/pipeline.py` + `sprint2` fatigue-aware path | `build/_assembled/hush_model/persistence/pipeline.py` |
| Rested-path emission (DX-20) | `implementation/sprint3a/recommendation.py` | `build/_assembled/hush_model/recommendation.py` |
| Governor docstrings (DX-20 comment) | `implementation/sprint3a/decision.py` | `build/_assembled/hush_model/decision.py` |
| Composition load read (DX-20) | `implementation/sprint3b2/session.py` | `build/_assembled/hush_model/persistence/session.py` |
| `perform` contract | `implementation/sprint1/pipeline.py`, `sprint3b2/session.py`, `orchestrator`, `sim/synthetic_athlete.py` | mirrors |
| Tests + goldens (DX-19) | `implementation/*/test_*.py`, Phase-0 fixtures | `build/_assembled/tests/` |

> Confirm exact line numbers against the `implementation/` snapshots before editing — the numbers below cite
> the assembled mirror for orientation; the snapshots may differ by a few lines.

---

## 3. DX-01 — `actual_weight` becomes a learning input

### 3.1 `perform` contract (the one structural change; review §11 decision)

Widen the athlete callback from `perform(rec) -> actual_reps: int` to:

```python
perform(rec) -> tuple[float, int]      # (actual_weight, actual_reps)
```

This mirrors the real device set-report payload (`actual_weight`, `actual_reps`) and is forward-compatible
with DX-11. The **default athlete loads the prescribed weight**, so trajectories are preserved (§7).

### 3.2 Pipeline — `report_set` and `report_set_fatigue_aware`

Unpack the callback and route the **logged** weight into the observation and set_record. Both paths, at the
sites that currently hard-wire `rec.recommended_weight`:

```python
# 2. athlete performs  (was: actual_reps = int(perform(rec)))
actual_weight, actual_reps = perform(rec)
actual_weight = float(actual_weight)
actual_reps = int(actual_reps)

# 3. observe — set_record stores BOTH: recommended (prescription) + actual (logged)
set_id = sess_repo.add_set(
    block_id, set_number, rec.recommended_weight, target_reps,   # recommended_weight = prescription (unchanged)
    actual_weight=actual_weight, actual_reps=actual_reps,        # DX-01: logged weight, not the recommendation
    status="completed",
)
obs = Observation(
    athlete_id=athlete_id, capability=capability, exercise=exercise,
    difficulty_factor=difficulty_factor,
    actual_weight=actual_weight, actual_reps=actual_reps,        # DX-01
    predicted_reps_to_failure=predicted_at_actual,              # DX-02 (see §4)
    prediction_error=actual_reps - predicted_at_actual,         # DX-02
    week=week,                                                  # (+ est_fatigue on the fatigue-aware path)
)
```

- Mirror sites: rested `pipeline.py:154,160`; fatigue-aware `pipeline.py:319,325`; `orchestrator.py:77,127`.
- `evidence.py` is **untouched** — it already reads `obs.actual_weight` (`:60`). DX-01 stops feeding it a constant.

### 3.3 Fatigue cost at the lifted load (review §4 ripple — part of M1 consistency)

`set_fatigue` currently costs fatigue at the recommended load (`pipeline.py:362`). The athlete lifted
`actual_weight`; cost the set's fatigue there:

```python
sf = set_fatigue(
    effective_load=actual_weight,                  # DX-01: cost fatigue at the lifted load (was rec.recommended_weight)
    reference_strength_c=rm1_ref, reps_performed=actual_reps,
    predicted_reps_to_failure=rec.predicted_reps_to_failure,
)
```

Bit-identical when `actual_weight == recommended_weight`.

---

## 4. DX-02 — `prediction_error` / quality at the **actual** load

Recompute the rep prediction at the **actual** load (the function exists: `prediction.py:30`) and form the
error and the stored `predicted_reps_to_failure` against it. Insert before building `obs` in both paths:

```python
from ..prediction import predict_reps_to_failure        # add to pipeline imports

# rested path:
predicted_at_actual = predict_reps_to_failure(
    capability, cap_state.score, difficulty_factor, actual_weight,
)
# fatigue-aware path (thread fatigue exactly as rec was built — review R5):
predicted_at_actual = predict_reps_to_failure(
    capability, cap_state.score, difficulty_factor, actual_weight, fatigue=total_fatigue,
)
```

Then `obs.predicted_reps_to_failure = predicted_at_actual` and `obs.prediction_error = actual_reps −
predicted_at_actual` (§3.2). `cap_state.score` here is the pre-update (`score_before`) basis, matching how
`rec.predicted_reps_to_failure` was built — so when `actual == recommended`, `predicted_at_actual ==
rec.predicted_reps_to_failure` **exactly** (bit-identical). `evidence.py:50` then computes `quality` from the
corrected error with no edit.

---

## 5. DX-20 — future programs built from learned capability

**The whole freeze is one branch.** The fatigue-aware path already builds from `target_load`
(`recommendation.py:116`); only the **rested governed branch** emits `held_load` (`recommendation.py:97`), and
composition calls `recommend()` rested (`session.py:81`). Change that branch to emit the score-derived
`target_load`; the governor is retained **only** to compute the advisory lean.

### 5.1 `recommendation.py` — rested governed branch (≈ lines 84–99)

```python
        else:
            # ES-006 ADVISORY governor (DX-03/M3 + DX-20): govern() computes the lean
            # (KEEP/INCREASE/DECREASE) + reason for audit/insight + M5, but does NOT author the
            # load. DX-20: the emitted rested load is the score-derived TARGET (learned
            # capability) — future programs are built from learned reality, never from the held
            # historical anchor. `held_load` is now the PREVIOUS composed load (last_recommended_weight),
            # used only so the lean is a session-over-session signal (this target vs last program).
            dec = govern(
                held_load=state.last_recommended_weight,
                target_load=target_load,
                confidence=pred_conf,
                consecutive_positive=state.consecutive_positive,
                consecutive_negative=state.consecutive_negative,
                equipment_step=DEFAULT_EQUIPMENT_STEP_KG,
            )
            load = target_load          # DX-20: emit learned-capability load (was dec.recommended_weight)
            decision_type = dec.decision_type
            reason = dec.reason
```

- **Cold start unchanged** (`last_recommended_weight is None` → `load = target_load` already, `:81`).
- **`last_recommended_weight` self-heals**: `_record_block_decision` writes it to the emitted load
  (`pipeline.py:92`), now `= target_load`, so it becomes the rolling "previous composed load." Any pre-M1
  held value is consumed once (for the lean) then overwritten — no migration.
- **Frozen session preserved**: composition (rested) emits `target_load`; the athlete-facing block load is
  fixed at composition (`session.py:84`); the fatigue-aware per-set path adapts from `target_load` exactly as
  today (no new in-session behavior). No mid-session ratchet, no execution-time progression.
- **Stability without the anchor**: `target_load` is plate-floored and score-derived (variance-damped),
  `safety_discount(confidence)` gates magnitude and auto-removes as confidence rises — review §6/§7.

### 5.2 `session.py` — composition (confirm, ≈ line 81–84)

`recommend()` rested now returns `recommended_weight == target_load`, so `sess.add_block(... rec.recommended_weight ...)`
already stores the learned-capability load. **No edit required** beyond confirming the block load tracks the
score across sessions (Layer-2 test, §7.4). *(Optional clarity: store `rec.recommended_weight` as today; do
not switch to `rec.target_load` — post-DX-20 they are equal on the rested path and `recommended_weight` is the
canonical field.)*

### 5.3 Docstring corrections (code comments; same change)

`decision.py` (module docstring + `govern` docstring) and `recommendation.py` (module docstring) currently
state "EVERY branch emits the HELD load." Update to: "the governor is advisory; the **rested emitted load is
the score-derived target** (DX-20); `govern()` authors only the lean/reason." No logic change in `decision.py`
— `govern()` still returns `held_load` in its `Decision`, but the caller no longer uses it for `load`.

---

## 6. DX-05 / DX-06 — contract + F1 reversal (documentation)

| Doc | Change |
|---|---|
| `API_CONTRACT_V1.md §0.5` | `actual_weight` moves **into** the learning-input list; remove "audit/A9 metadata, not a learning input." |
| `API_CONTRACT_V1.md §7.1` | `actual_weight` is **required** and is a **learning input** — the model learns from `(actual_weight, actual_reps)`. Remove "recorded for audit … not consumed by learning." Keep both-weights storage (ES-001); a deviation is still logged (A9) **and now learned**. |
| `API_CONTRACT_V1.md §7.2 / §16C` | Replace "effective load = recommended_weight" with "effective load = the athlete's logged `actual_weight`; `recommended_weight` is the advisory prescription, derived from learned capability (DX-20)." |
| `F1_CLARIFICATION_REPORT.md` | Add a top banner: **SUPERSEDED by M1/DX-06.** The reps-only conclusion is reversed; `actual_weight` IS a v1 learning input. The §6 "future item" is now adopted as M1. |
| `SESSION_RUNTIME_TRANSITION_REVIEW.md §6.1` | Update the F1 resolution note: input set is now `(actual_weight, actual_reps)`; the differential-replay gate runs with the real load. |

No endpoint/field added or removed; `actual_weight` already exists in the request and schema. Wording +
classification only. (Deeper spec/assumption re-annotation is DX-13/16/18, downstream — not in this package.)

---

## 7. DX-19 — tests + Phase-0 goldens

### 7.1 `perform` widening (mechanical, all suites)

Every `perform`/`truth.perform` returns `(actual_weight, actual_reps)`. Update `sim/synthetic_athlete.perform`
to return the tuple, defaulting the weight to the prescription and adding a deviation knob for M1 tests:

```python
def perform(self, recommendation) -> tuple[float, int]:
    cap = recommendation.capability
    effective_score = self.true_score[cap] - self.true_fatigue
    true_rm1 = reference_strength(cap, effective_score) * recommendation.difficulty_factor
    # M1: the athlete may load other than prescribed; default loads exactly the prescription.
    actual_weight = self.load_for(recommendation)        # default: recommendation.recommended_weight
    true_reps = reps_to_failure(actual_weight, true_rm1)
    noisy = true_reps + self.rng.gauss(0.0, self.rep_noise_sd)
    self.true_fatigue += self.fatigue_per_set
    return float(actual_weight), max(0, round(noisy))
```

Update the test `run_one_set` helper and every `report_set*` call-site to unpack the tuple.

### 7.2 Layer-1 invariance (no-deviation)

With the default (athlete loads prescribed), the **learning numbers** (`s_obs`, `quality`,
`prediction_error`, blend, confidence) are unchanged for every single-session/cold-start trajectory. Any
movement → stop-the-line (the default learning path was not preserved).

### 7.3 Layer-1 deviation coverage (new)

- `effective_load`/`s_obs` reflect the **actual** weight (not the recommendation).
- `prediction_error` formed at the **actual** load (DX-02); on the fatigue-aware path with `fatigue` threaded.
- **Heavier-load-fewer-reps → upward `s_obs` at full quality** (the regression DX-02 prevents): assert
  `error_class_weight` stays ≥ 0.6, not 0.3.
- A9 LOAD override row written **and** the chain learns (contrast `test_sprint4.py:153-156`, which asserted
  only reconstructability).

### 7.4 Layer-2 program-evolution coverage (new)

- Across sessions where the score rose, the **composed** block load rises toward `target_load`
  (confidence-gated); a regression lowers the next program.
- **In-session frozen**: a block's set-1 prescribed load equals the composed block load; the advisory lean is
  recorded but never authors the load.
- Over-reaction guard: a single heavy session does not jump the next program past what `safety_discount(confidence)`
  permits.

### 7.5 Intended re-gold (stated, not silent)

| Test | Change |
|---|---|
| `test_sprint3a.py:149-153` | `recommend()` with decision memory now emits `target_load`; `rec.target_load > rec.recommended_weight` (held<target) **inverts to `==`**. Re-gold with the DX-20 expectation. |
| `test_sprint3a.py:285-288` | `target_load >= recommended_weight` becomes `target_load == recommended_weight` on the rested governed path. |
| `test_sprint3b2.py:319-320` | Two-session run: session-2+ composed load now tracks the score. Re-gold. |
| Phase-0 multi-session goldens | Any whose score moved across sessions re-gold to the learned-capability load. **Single-session/cold-start goldens must not move.** |

### 7.6 Run

`python build/_verify/assemble_and_test.py` → all suites green; Layer-1 invariance holds; Layer-1/Layer-2
deviation+evolution suites pass; only the §7.5 goldens moved, each with its new expectation documented.

---

## 8. Invariants preserved (the firewall holds)

- **① core untouched.** No edit to `reference_strength`, `epley`, blend, decay, confidence/variance,
  `state_update.py`, the evidence **consumer**, catalog, or volume. M1 is plumbing (DX-01), one prediction
  recompute (DX-02), one rested-emission line (DX-20), docs (DX-05/06), and tests (DX-19).
- **Schema v7 unchanged — no migration** (either direction).
- **DX-03 intent preserved**: no automatic load step during execution; the governor remains advisory and now
  records a session-over-session lean. DX-04 (exploration off) untouched.
- **Frozen-session invariant (API §0.3) preserved**: the prescription is fixed at composition; DX-20 changes
  *what* the composition load is (learned capability), not *when* it is fixed.
- **Determinism/audit**: both weights still stored (ES-001); A9 override still logged; event-stream replay
  still deterministic.

---

## 9. Acceptance checklist

- [ ] `perform` widened to `(actual_weight, actual_reps)`; default loads the prescription; all callers unpack.
- [ ] DX-01: four pipeline sites + orchestrator route the logged weight; `set_fatigue` costs at `actual_weight`.
- [ ] DX-02: prediction recomputed at the actual load (fatigue threaded on the fatigue-aware path); `obs.prediction_error`/`predicted_reps_to_failure` consistent.
- [ ] DX-20: rested governed branch emits `target_load`; cold start unchanged; docstrings corrected.
- [ ] Layer-1 invariance: no-deviation learning numbers unchanged; single-session/cold-start goldens unmoved.
- [ ] Layer-1 deviation suite green (incl. heavier-load-fewer-reps at full quality).
- [ ] Layer-2 evolution suite green (program tracks score; in-session frozen; confidence-gated).
- [ ] DX-05/06 doc reversals applied; F1 report banner added.
- [ ] Only §7.5 goldens re-golded, each with a documented new expectation.
- [ ] `assemble_and_test.py` green; report per-suite counts.
- [ ] ① core, schema, DX-03/04 behavior untouched.

---

## 10. Dependencies, ordering, rollback

- **Internal order:** DX-01 → DX-02 (DX-02 needs the actual weight in scope) → DX-20 (emits the learned load
  the truthful score produces) → DX-05/06 (docs) → DX-19 (tests/goldens, last). Land as one commit/unit.
- **Upstream:** DX-07/04/03 (done). No dependency on DX-08/09/10.
- **Downstream (NOT in this package):** **DX-11** (set endpoint + `session_progress` accumulator, P1/Sprint 5);
  **DX-09** (M5, depends on M1's truthful score + agreement signal); **DX-13/16/18** (spec/assumption/wording
  re-annotation). The proposed **DX-20** ID should be registered in the Delta Plan at sign-off.
- **Rollback (code-only, no migration):** revert the four DX-01 sites + `set_fatigue`; drop the DX-02
  recompute; restore `load = dec.recommended_weight` (DX-20); restore reps-only `perform`; revert docs.
  Persisted `actual_weight` rows and learned state remain valid; replay-rebuild is available for a pristine
  reps-only state. **All-or-nothing across the bundle** — do not partially revert (review §9).

---

*Execution package only — implements `M1_MIGRATION_READINESS_REVIEW.md` (§2–§6) within its owner-confirmed
scope. No ① core-math change, no schema/migration. Trace: Delta Plan DX-01/02/05/06/19 + proposed DX-20;
Gap Review M1/M2; `F1_CLARIFICATION_REPORT.md` (reversed).*
