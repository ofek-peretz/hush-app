# M1_COMPLETION_REPORT.md — input-contract flip + learned-capability program construction

> Completion report for the **M1 bundle** — **DX-01, DX-02, DX-20, DX-05, DX-06, DX-19** — executed per
> `reviews/implementation/M1_EXECUTION_PACKAGE.md`, which implements the model review
> `reviews/implementation/M1_MIGRATION_READINESS_REVIEW.md` (the review that licensed the §6/DX-20
> composition load-source change). **M1 is complete.** Tests: **139/139 passing** (baseline **134/134** +
> **5 net-new** DX-19 tests; the **2** sprint3a governor assertions were re-golded **in place**, count
> unchanged). This is an **approved, bounded behavior change** with a deliberate multi-session re-gold:
> Layer 1 (DX-01/02) is **bit-for-bit on the no-deviation default**; Layer 2 (DX-20) intentionally moves
> the governed/composition load from the held anchor to the score-derived target. Governing rule honored:
> *no redesign without explicit model review* — the readiness review IS that model review; M1 stays within
> its owner-confirmed scope. **No ① core-math change. No schema, no migration — Schema v7 throughout.**
>
> Date: 2026-06-11 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + **M1 (DX-01/02/20/05/06/19) ✅**
> (Schema v7 unchanged) · Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **DX-01** | Learning input (`actual_weight`) | ✅ Done | 4 pipeline sites + 2 orchestrator sites route the logged weight; `set_fatigue` costed at the lifted load |
| **DX-02** | Quality at the actual load | ✅ Done | `predict_reps_to_failure(...,actual_weight[,fatigue])` recompute in both pipeline + both orchestrator paths |
| **DX-20** | Program from learned capability | ✅ Done | rested governed branch emits `target_load` (was `dec.recommended_weight`); govern() retained for the advisory lean |
| **DX-05** | API contract reversal | ✅ Done | `API_CONTRACT_V1.md` §0.5 / §7.1 / §16C: `actual_weight` is a **required learning input** |
| **DX-06** | F1 report reversal | ✅ Done | `F1_CLARIFICATION_REPORT.md` SUPERSEDED banner + `SESSION_RUNTIME_TRANSITION_REVIEW.md §6.1` reversal note |
| **DX-19** | Tests + re-gold | ✅ Done | `perform` widened to `(actual_weight, actual_reps)`; 5 new tests; 2 sprint3a governor assertions re-golded |

**Test result:** `==== 139/139 passed ====` — per-suite:
`sprint0 12 · sprint1 10 · sprint2 27 · sprint3a 18 · sprint3b1 18 · sprint3b2 26 · sprint4 20 · wave1 8`.
Baseline was **134/134** (`sprint1 7 · sprint3b2 24`). Net change: **sprint1 +3**, **sprint3b2 +2**
(the 5 new DX-19 tests); **sprint3a unchanged at 18** (two in-place governor re-golds). All Sprint 0–4 +
Wave 1 + DX-07/04/03 suites **green and unchanged in count**.

**Behavioral effect (verified, not assumed — direct probe on the assembled tree):**
- **DX-20** — `recommend()` with decision memory (`last_recommended_weight=40.0`, positive run, conf 80,
  score 50) now emits **62.5 == `target_load`** (was the held 40.0); `emitted > stale_anchor`. The pure
  `govern()` path is **unchanged**: it still returns the held 40.0 — DX-20 changed only the **caller**, not
  `decision.py` (so every pure-governor unit test passes verbatim).
- **DX-01/02** — heavier-load-fewer-reps with **score == truth (55)**: prescribed 67.5, athlete **logged
  77.5** (+10 kg), did **8** reps. DX-02 error at the **actual** load = **0.202 → class 1.0 (full
  quality)**; the pre-DX-02 error against the recommended-load prediction = **5.398 → class 0.3 (poor)**.
  The honest set is **rescued from 0.3 to 1.0**. DX-01 observed score `s_obs` at the actual load =
  **55.328** (recovers the true 55) vs the pre-DX-01 light-load bug **46.814** (understated).
- **Layer-1 invariance** — no-deviation set: `obs.predicted_reps_to_failure == rec.predicted_reps_to_failure`
  and `obs.actual_weight == rec.recommended_weight`, **bit-identical**.

---

## 1. Requirement compliance (the execution-package instructions)

| Requirement | Result |
|---|---|
| Move DX-01/02/20/05/06/19 as ONE unit | ✅ All six landed together; no partial application. |
| DX-01 — `actual_weight` becomes a learning input | ✅ `perform` widened; logged weight routed into `set_record` + `Observation` at all 4 pipeline + 2 orchestrator sites; `set_fatigue` costed at `actual_weight`. |
| DX-02 — quality at the actual load | ✅ `predict_reps_to_failure` recomputed at `actual_weight` on the `score_before` basis (fatigue threaded on the fatigue-aware path, review R5); `prediction_error`/`predicted_reps_to_failure` formed against it. |
| DX-20 — future programs from learned capability | ✅ Rested governed branch emits `target_load`; cold start unchanged; `govern()` retained only for the advisory lean; docstrings corrected. |
| DX-05 — API contract reversal | ✅ §0.5 / §7.1 / §16C: `(actual_weight, actual_reps)` is the learning input; effective load = logged `actual_weight`; `recommended_weight` advisory. |
| DX-06 — F1 report reversal | ✅ SUPERSEDED banner on `F1_CLARIFICATION_REPORT.md`; §6.1 reversal note on `SESSION_RUNTIME_TRANSITION_REVIEW.md`. |
| DX-19 — tests + bounded re-gold | ✅ `perform` widened across all suites; Layer-1 deviation + invariance + Layer-2 evolution + frozen-composition coverage added; only the 2 intended governor goldens re-golded. |
| ① core / schema / DX-03-04 behavior untouched | ✅ No edit to capability math, blend, decay, confidence/variance, `state_update`, evidence **consumer**, catalog, volume; Schema v7; exploration off; governor advisory. |
| Run the canonical assembler + full suite | ✅ `python build/_verify/assemble_and_test.py` → **139/139**. |
| Produce a DX-07/04/03-format completion report | ✅ This document. |

> **Transparent note — this IS a behavior change.** Like DX-03/DX-04, M1 deliberately changes behavior:
> Layer 2 (DX-20) moves the governed/composed load from the held anchor to the score-derived target. The
> "nothing else moved" claim therefore applies to **everything except** (a) the governed/composition load
> source and (b) learning on deviation sets. The 2 re-golded sprint3a assertions encode the demotion of
> the held anchor; the other 132 prior tests pass unchanged, confirming no other trajectory, formula,
> column, or cold-start/no-deviation path shifted.

---

## 2. What was delivered

### Edit A — `implementation/sprint1/pipeline.py` (DX-01/02) — the learning chain
Both `report_set` (rested) and `report_set_fatigue_aware` now unpack `actual_weight, actual_reps =
perform(rec)`, route the **logged** `actual_weight` into `sess_repo.add_set(actual_weight=…)` and the
`Observation`, and form `predicted_reps_to_failure`/`prediction_error` from a **DX-02 recompute at the
actual load** (`predict_reps_to_failure(capability, score_before, difficulty_factor, actual_weight[,
fatigue=total_fatigue])`). The fatigue-aware path also costs `set_fatigue(effective_load=actual_weight, …)`
(§3.3). `recommended_weight` is still stored as the prescription (both weights, ES-001). Import of
`predict_reps_to_failure` added.

### Edit B — `implementation/sprint0/orchestrator.py` (DX-01/02) — the pure loop
The same DX-01/02 change in both `run_one_set` branches (rested + fatigue-aware), keeping the pure Sprint 0
loop internally consistent with the persisted pipeline (the binding "move as one unit"). Import added.

### Edit C — `implementation/sprint0/recommendation.py` (DX-20) — **the Layer-2 functional change**
The rested **governed** branch now emits `load = target_load` (was `load = dec.recommended_weight`).
`govern()` is still called — with `held_load=state.last_recommended_weight` (now the *previous composed
load*) — but **only** to compute the advisory lean/reason; it no longer authors the load. Cold start
(`last_recommended_weight is None`) was already `load = target_load` and is unchanged. Module docstring
updated to the DX-20 semantics. The athlete's `actual_weight` reaches the program **only** via
`evidence → blend → score → target_load`, never directly.

### Edit D — `implementation/sprint3a/decision.py` (DX-20) — docstrings only
Module + `govern()` docstrings restated: the governor is advisory; post-DX-20 the caller emits the
score-derived `target_load` and uses `govern()` only for the lean/reason. **No logic change** — `govern()`
still returns the held load in its `Decision` (verified by the unchanged pure-governor unit tests).

### Edit E — `implementation/sprint3b2/session.py` (DX-20) — comment + `perform` docstring
Composition reads `rec.recommended_weight`, which post-DX-20 equals `target_load` on the rested path, so
the composed block load is built from learned capability and **frozen** at composition. Comment + the
widened `perform` signature note added. **No logic change.**

### Edit F — `implementation/sprint0/synthetic_athlete.py` (DX-19) — the `perform` producer
`perform` now returns `(actual_weight, actual_reps)`; a `load_deviation_kg` knob (default 0.0 = load the
prescription) and a `load_for()` helper drive M1 deviation tests. Reps are generated at the **logged**
load, so a heavier-than-prescribed load honestly yields fewer reps.

### Edit G — Documentation (DX-05/06)
- `docs/architecture/API_CONTRACT_V1.md` §0.5, §7 intro, §7.1, §16C — `actual_weight` reclassified from
  "audit/A9 metadata, not a learning input" to **required learning input**; effective load = logged
  `actual_weight`; `recommended_weight` advisory (derived from learned capability, DX-20); deviation now
  **logged AND learned**.
- `reviews/implementation/F1_CLARIFICATION_REPORT.md` — top **SUPERSEDED by M1/DX-06** banner; the
  reps-only conclusion and its §6 "deferred future change" are reversed/adopted.
- `reviews/implementation/SESSION_RUNTIME_TRANSITION_REVIEW.md §6.1` — **REVERSED by M1/DX-06** note: input
  set is `(actual_weight, actual_reps)`; the differential-replay gate runs with the real load.

### Tests delivered (DX-19)
- **`perform` widened** across all suites; `synthetic_athlete.perform`, `test_sprint3b2._perform`, and the
  unused `test_sprint1.constant_reps` helper now return `(actual_weight, actual_reps)`.
- **New (5):**
  - `test_sprint1.test_m1_rested_deviation_learns_at_actual_load` — DX-01 stores the heavy load; DX-02
    recompute at the actual load; honest set kept at quality ≥ 0.6 (not 0.3); `s_obs` reflects the real load.
  - `test_sprint1.test_m1_no_deviation_is_bit_identical` — Layer-1 invariance: recompute equals the
    recommendation's prediction bit-for-bit.
  - `test_sprint1.test_m1_fatigue_aware_deviation_routes_actual_load` — DX-01/02 on the fatigue-aware path
    (prediction recomputed at the actual load with fatigue threaded).
  - `test_sprint3b2.test_m1_composition_load_follows_the_learned_score` — DX-20: with decision memory
    present, raising the learned score raises the next composed load; a regression lowers it.
  - `test_sprint3b2.test_m1_composed_block_load_is_frozen_at_composition` — the composed block load equals
    the rested `recommend()` target at the pre-session state and does not drift across the block's sets.
- **Re-golded in place (2, sprint3a):**
  - `test_governor_increase_is_advisory_load_holds` → **`test_governor_increase_emits_learned_target_load`**
    (`recommended_weight == 40.0` held → `recommended_weight == target_load > 40.0`).
  - `test_multisession_stability_guard_then_advisory_increase_holds_load` →
    **`test_multisession_stability_guard_then_program_tracks_learned_load`** (flat-for-15-sessions →
    non-decreasing and rising; `target_load >= recommended_weight` → `target_load == recommended_weight`).

---

## 3. Files changed

**Edited source (snapshots under `implementation/`):**
- `sprint1/pipeline.py` — DX-01/02 in both report paths + `set_fatigue` at the lifted load + import (Edit A).
- `sprint0/orchestrator.py` — DX-01/02 in both `run_one_set` branches + import (Edit B).
- `sprint0/recommendation.py` — DX-20 rested governed branch emits `target_load`; docstring (Edit C — **the Layer-2 functional change**).
- `sprint3a/decision.py` — DX-20 docstrings (Edit D — comment only).
- `sprint3b2/session.py` — DX-20 comment + `perform` docstring (Edit E — comment only).
- `sprint0/synthetic_athlete.py` — `perform` returns the tuple + `load_deviation_kg`/`load_for` (Edit F).
- `sprint1/test_sprint1.py`, `sprint3b2/test_sprint3b2.py`, `sprint3a/test_sprint3a.py` — DX-19 (new tests, `perform` widening, 2 in-place re-golds).

**Documentation:** `docs/architecture/API_CONTRACT_V1.md`, `reviews/implementation/F1_CLARIFICATION_REPORT.md`,
`reviews/implementation/SESSION_RUNTIME_TRANSITION_REVIEW.md`; this report.

**Unchanged (deliberately):** ① core math (`reference_strength`, `epley`, blend, `decay`,
confidence/variance, `state_update.py`), the evidence **consumer** (`evidence.py` — it already read
`obs.actual_weight`), `catalog.py`, `volume.py`, `composition.py`, `domain.py` (no new field), `schema.py`
/ all migrations (**no migration — Schema v7**), the cold-start path, `decision.govern()` logic.

**Regenerated (generated artifact, never hand-edited):** `build/_assembled/` re-assembled by
`assemble_and_test.py` from the edited snapshots.

---

## 4. Acceptance checklist (from the Execution Package §9)

- [x] `perform` widened to `(actual_weight, actual_reps)`; default loads the prescription; all callers unpack.
- [x] DX-01: four pipeline sites + two orchestrator sites route the logged weight; `set_fatigue` costs at `actual_weight`.
- [x] DX-02: prediction recomputed at the actual load (fatigue threaded on the fatigue-aware path); `obs.prediction_error`/`predicted_reps_to_failure` consistent.
- [x] DX-20: rested governed branch emits `target_load`; cold start unchanged; docstrings corrected; `govern()` logic untouched.
- [x] Layer-1 invariance: no-deviation learning numbers bit-identical; single-session/cold-start goldens unmoved (verified — probe + `test_m1_no_deviation_is_bit_identical`; Sprint 0–4 counts unchanged).
- [x] Layer-1 deviation suite green (incl. heavier-load-fewer-reps at full quality — 0.3→1.0 rescue probed).
- [x] Layer-2 evolution suite green (program tracks score both directions; in-session frozen at composition).
- [x] DX-05/06 doc reversals applied; F1 report SUPERSEDED banner added.
- [x] Only the 2 sprint3a governor goldens re-golded, each with a documented new expectation.
- [x] `assemble_and_test.py` green; per-suite counts reported (§0).
- [x] ① core, schema (v7), DX-03/04 behavior untouched.

---

## 5. Verification method & evidence

- **Baseline (pre-change):** `python build/_verify/assemble_and_test.py` → `134/134 passed`.
- **After M1:** `139/139 passed` (per-suite breakdown in §0). Sprint 0–4 + Wave 1 + DX-07/04/03 suites
  green; the only count deltas are the 5 new DX-19 tests (sprint1 +3, sprint3b2 +2); sprint3a held at 18
  (2 in-place re-golds).
- **Layer 1 is genuine (direct probe):** heavier-load-fewer-reps (score == truth 55, +10 kg deviation) →
  DX-02 error **0.202 (class 1.0)** vs pre-DX-02 **5.398 (class 0.3)** — the exact 0.3→1.0 quality rescue
  the review predicted; DX-01 `s_obs` **55.328** (recovers true 55) vs light-load bug **46.814**.
- **Layer-1 invariance is genuine:** no-deviation → `obs.predicted == rec.predicted` and `obs.actual_weight
  == rec.recommended_weight` bit-for-bit.
- **Layer 2 is genuine:** `recommend()` with decision memory emits **62.5 == target_load** (> stale anchor
  40.0), while pure `govern()` **still returns held 40.0** — proving DX-20 changed only the caller, not the
  governor. The multi-session sprint3a test confirms the program **rises** across sessions (was asserted
  flat); the sprint3b2 test confirms composition **follows the score up and down**.
- **No collateral shift:** every prior suite count is identical and green; the only deltas are the 5
  intended new tests and the 2 intended governor re-golds.

---

## 6. Out of scope / explicitly not done (owned by other DX)

- **DX-11** (live set-report endpoint + `session_progress` accumulator) — **P1 / Sprint 5; not opened.** M1
  ends at the in-process pipeline + composition; DX-05 merely *declares* `actual_weight` required so DX-11
  has a spec.
- **DX-09 (M5 stagnation)** — depends on M1's truthful score + agreement signal; **not opened.**
- **DX-13 / DX-16 / DX-18** (ES-006 spec restatement, A9 re-annotation, deeper API wording) — downstream
  documentation; **not opened** (only the §6 DX-05/06 reversals were in this bundle).
- **Schema / data migration** — **none.** Schema **v7** unchanged; rollback is code-only (review §9).
- **① core math** — untouched.

---

## 7. M1 Definition-of-Done

- [x] The athlete's logged `actual_weight` is a **learning input** (DX-01) — the evidence engine learns from the real load; `set_fatigue` costed there.
- [x] Prediction **quality is evaluated at the actual load** (DX-02) — honest deviations keep full evidence weight (0.3→1.0 verified).
- [x] **Future programs are built from learned capability** (DX-20) — the rested/composed load is the score-derived `target_load`, mediated through the score, never anchored to a stale recommendation.
- [x] The **session stays frozen once composed** and **execution never ratchets** — DX-03's intent preserved; DX-20 changes *what* the composition load is, not *when* it is fixed.
- [x] Contract + F1 report reversed (DX-05/06): `actual_weight` is a required, consumed learning input.
- [x] Suite green at **139/139**; only the intended multi-session/governor goldens moved, each documented; ① core + Schema v7 + DX-03/04 untouched.

**M1 is closed.** The input-contract flip and learned-capability program construction are implemented,
validated, and documented. No further code is required for M1.

---

## 8. Recommended next step (not executed)

Per the Delta Plan, **validate M1** (this report + 139/139), **register DX-20** in
`HUSH_V1_DELTA_EXECUTION_PLAN.md` at sign-off, then open **DX-11** (the Sprint 5 live set-report endpoint +
`session_progress` accumulator — the runtime half of the input flip) and **DX-09 / M5** (stagnation, now
unblocked by M1's truthful score + agreement signal). No DX-11/DX-09 work has been started.

---

*Completion report only. Implementation strictly within the M1 bundle (DX-01/02/20/05/06/19) as approved;
no DX-11/DX-09 runtime/stagnation work, no schema/migration, no ① core-math change, no redesign beyond the
owner-confirmed, model-reviewed §6/DX-20 composition load-source change. Verified at 139/139. Traceability:
`M1_EXECUTION_PACKAGE.md` · `M1_MIGRATION_READINESS_REVIEW.md` · `HUSH_V1_DELTA_EXECUTION_PLAN.md`
(DX-01/02/05/06/19 + DX-20) · Gap Review M1/M2 · `F1_CLARIFICATION_REPORT.md` (reversed).*
