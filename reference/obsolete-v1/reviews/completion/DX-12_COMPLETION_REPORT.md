# DX-12_COMPLETION_REPORT.md — Phase-0 instrumentation/gate/calibration repoint (success-basis reorientation)

> Completion report for **DX-12** (Delta Plan P1, Medium — **Phase-0 instrumentation/gate repoint off
> load-prediction**), the code/instrument counterpart of the already-written **DX-14** success restatement
> (`Hush Validation Architecture v1` RESTATEMENT ADDENDUM — DX-14, 2026-06-12). **DX-12 is complete.**
> Tests: **172/172 passing** (was **169/169**; **+3 net-new** in `test_sprint4`; **zero re-gold**). This is a
> **validation-only reframe**: it **changes no model behavior, no schema, no constants, no golden trajectory**.
> The Phase-0 gate now gates on the **reoriented success basis** — **STABILITY** (trend primitives) **AND
> ESTIMATE-RECOVERY** (score-estimate calibration + beats-no-learning) — and the load/reps-prediction
> pairings (A8 shadow paired forecast, A1 fresh-state re-test) are **reframed into directional model-quality
> diagnostics** (reported, not gated), exactly as DX-14 restated the Validation Architecture. **No ① core-math
> change**; **Schema v9 unchanged**; nothing is adopted, nothing applied.
>
> Date: 2026-06-12 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + DX-11 ✅ + DX-09 ✅ +
> DX-13…18 ✅ + DX-08 ✅ + DX-10 ✅ + **DX-12 ✅** (Schema **v9**, unchanged) · Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`gate.py` verdict repoint** | Reframe (verdict basis) | ✅ Done | `passed_provisional` now a named `criteria` dict — `{stability, estimate_recovery}`; boolean value **identical** to the prior `stable_all and recovers_all` (no re-gold); notes state the reoriented basis + diagnostic demotion + M5 pointer |
| **Load/reps-prediction → directional diagnostics** | Reframe | ✅ Done | A8 `shadow_paired` + A1 `fresh_state_check` documented as DIRECTIONAL (reported, not gated); shadow rows / migration_006 / `LearningRepository` notes reframed |
| **Score-estimate calibration + trend primitives KEPT** | Invariant | ✅ Verified | `convergence_error` (estimate honesty) + `oscillation`/`drift`/`reversals`/`ratchet` (stability) + `recoverability` (beats-no-learning) unchanged in logic, retained as the success basis |
| **Criterion (b) — M5 detector** | Traceability | ✅ Done | gate notes point criterion (b) "fires correctly and rarely" at the M5 detection suite (DX-09 / `tests/test_sprint6.py`); not re-run in the gate |
| **No model/schema/constant change** | Invariant | ✅ Verified | no `hush_model/` math touched; no migration; Schema **v9**; no constant added/changed; no golden re-baselined |
| **DX-12 tests** | 3 additive | ✅ Done | gate-basis membership, notes content, directional-diagnostic-only — all green |

**Test result:** `==== 172/172 passed ====` — per-suite:
`sprint0 19 · sprint1 12 · sprint2 27 · sprint3a 18 · sprint3b1 22 · sprint3b2 26 · sprint4 23 · wave1 10 · sprint5 3 · sprint6 12`.
Baseline before DX-12 was **169/169** (`sprint4 20`). Net: **sprint4 +3**; **every other suite count is
identical and green**. The reframe touches only the instrumentation's framing + the gate's verdict
composition (boolean-equivalent), which feeds no other golden.

---

## 1. The change — what "repoint off load-prediction" means in code

The Delta Plan row: *"Repoint Phase-0 instrumentation/gate/calibration: **keep** the trend primitives and
score-estimate calibration; **reframe** the load-prediction (shadow/convergence/recoverability) metrics off
the old success basis."* The already-shipped DX-14 restatement fixed the **doc** definition; DX-12 brings the
**instrumentation modules** into line with it. The reorientation (DX-14, verbatim target) is:

> The headline Phase-0 success question is no longer "does the model predict the right LOAD." It is: does the
> model **(a)** recover and hold an honest capability estimate from real logged performance, is it stable (no
> oscillation/drift/ratchet) and does it beat a no-learning shadow baseline; and **(b)** does the stagnation
> detector (M5) fire correctly and rarely. De-biased error and the shadow counterfactual **remain the
> model-quality instruments (directional, per A8)**.

Mapped onto the metrics, this is a **role split** — not a deletion:

| Metric | Role after DX-12 | In the gate verdict? |
|---|---|---|
| `oscillation`, `drift_vs_flat`, `reversals`, `load_ratchet` | **KEPT** — trend primitives / **stability** | ✅ gates (`criteria["stability"]`) |
| `convergence_error` (inferred **score** vs true) | **KEPT** — **score-estimate calibration** (estimate honesty, not a load forecast) | ✅ gates (`criteria["estimate_recovery"]`) |
| `recoverability` (inferred **score** vs no-learning seed) | **KEPT** — **beats-no-learning** model-quality check | ✅ gates (`criteria["estimate_recovery"]`) |
| `shadow_paired` (model vs no-learning **reps** forecast) | **REFRAMED** — DIRECTIONAL diagnostic (per A8) | ❌ reported, not gated |
| `fresh_state_check` (predicted rested **reps** vs true) | **REFRAMED** — DIRECTIONAL diagnostic | ❌ reported, not gated |
| M5 stagnation detector correctness | criterion **(b)** | validated by DX-09 / `test_sprint6` (pointer in notes) |

The crucial reconciliation: the row names "convergence/recoverability" among the metrics to *reframe*, while
DX-14 keeps them as success criterion (a). Both are satisfied because the reframe is **off the
load-prediction interpretation** — `convergence`/`recoverability` operate on the inferred **SCORE**, so they
survive as *score-estimate calibration* and *beats-no-learning*; only the **reps/load-prediction pairings**
(shadow paired forecast, fresh-state re-test) drop out of the success basis into directional diagnostics.

---

## 2. Files changed (source-of-truth `implementation/`)

**`sprint4/gate.py`** — the one verdict change. `evaluate()` now computes a named `criteria` dict
(`{"stability", "estimate_recovery"}`); `passed_provisional` is **exactly** `stability_ok and
estimate_recovery_ok` — the same boolean as the prior `stable_all and recovers_all`, so no golden moves. The
recovery check is split into its two meanings in-line (`convergence_error` = score-estimate calibration;
`recoverability.margin` = beats-no-learning). Module docstring + `GateResult` reframed; notes now (1) state
the reoriented basis, (2) demote load/reps prediction to a directional diagnostic ("reported but NOT gated"),
(3) point criterion (b) at the M5 detection suite. Raw-metric keys (`constant`/`recovery`,
`oscillation`/`convergence_error`/…) are **unchanged** — `test_gate_reports_raw_metrics_first` stays green.

**`sprint4/metrics.py`** — docstring/section reframe only (no logic). Module header now splits *retained
success instruments* (stability primitives, `convergence_error` = score-estimate calibration, `recoverability`
= beats-no-learning) from *directional diagnostics* (`shadow_paired`, `fresh_state_check` — reps-prediction).
Per-function docstrings annotated accordingly.

**`sprint4/shadow.py`** — docstring reframe: the shadow is the **no-learning counterfactual**; its paired
**reps** forecast is a directional model-quality diagnostic, not the load-prediction success test. Policy code
unchanged (still FROZEN, state-free, A8-valid).

**`sprint4/calibration.py`** — docstring reframe: the sweep targets the reoriented basis (recover an honest
**score** estimate SUBJECT TO stability), which is already what it optimizes — framing restated, logic
unchanged.

**`sprint4/migration_006_instrumentation.py`** — one-line note: `shadow_recommendation` rows now feed a
directional diagnostic; **table/schema unchanged** (the reframe is in how rows are read, not their shape).

**`sprint1/repositories.py`** — `insert_shadow_recommendation` docstring reframed (directional diagnostic);
SQL/columns unchanged.

**`sprint4/test_sprint4.py`** — **+3 additive** tests (§3). **No assembler MAP change** (all targets already
mapped); **no schema/migration/version/constant change**; `hush_model/` untouched.

---

## 3. The new tests (3 additive, zero re-gold)

| Test | Asserts |
|---|---|
| `test_gate_success_basis_is_stability_and_estimate_recovery_not_load_prediction` | `res.criteria` keys are **exactly** `{stability, estimate_recovery}`; no `predict`/`load`/`shadow` member; `passed_provisional == stability and estimate_recovery` (no hidden criterion) |
| `test_gate_notes_record_reoriented_basis_and_diagnostic_demotion` | notes contain "reorient", "estimate-recovery", "directional"+"not gated" (load/reps demoted), and "m5"+"test_sprint6" (criterion-(b) pointer) |
| `test_load_prediction_metrics_are_directional_diagnostics_only` | `fresh_state_check` + `shadow_paired` still return their directional reads (`model_beats_naive` / `model_win_rate` / `model_beats_shadow`); `shadow` is **not** a gate `criteria` member |

Existing Sprint-4 goldens (`test_gate_reports_raw_metrics_first`, `test_metric_detectors_…`,
`test_calibration_sweep_…`, `test_shadow_*`, `test_under_exercised_…`) are **untouched and green** — the
verdict boolean and all raw keys are preserved.

---

## 4. Acceptance criteria (Delta Plan DX-12 + DX-14 alignment)

- [x] **KEEP trend primitives** — `oscillation`/`drift_vs_flat`/`reversals`/`load_ratchet` unchanged; gate's
      `stability` criterion built from them.
- [x] **KEEP score-estimate calibration** — `convergence_error` unchanged, retained as the estimate-honesty
      member of the gate's `estimate_recovery` criterion.
- [x] **REFRAME load-prediction off the success basis** — A8 `shadow_paired` + A1 `fresh_state_check`
      documented and verified as **directional diagnostics**, not gate members; shadow rows / migration_006 /
      repository notes reframed.
- [x] **Gate verdict repointed** — `passed_provisional` composed of `{stability, estimate_recovery}`; value
      boolean-identical to the prior verdict (no re-gold); raw metrics still primary + provisional (Q5).
- [x] **Criterion (b) represented** — M5 detector correctness cited to DX-09 / `test_sprint6` in the gate
      notes (not re-implemented in the gate).
- [x] **No model/schema/constant change** — `hush_model/` math, `state_update`, evidence, governor, `kappa`
      untouched; **Schema v9**; no migration; no constant; nothing adopted (Q1) or applied.
- [x] Canonical assembler + full suite green at **172/172**; **+3 additive**, **0 re-gold**; per-suite counts
      reported (§0).

---

## 5. Scope boundary (honest) — what DX-12 did *not* do

DX-12 is the **validation-only reframe** the Delta Plan licenses — repointing what the Phase-0 instruments
*mean*, not changing what the model *does*. Deliberately **not** done:

1. **No M5 simulation wired into the gate.** Criterion (b) (M5 fires correctly/rarely) is already exhaustively
   validated by the M5 detection suite (DX-09 / `test_sprint6`: five trend states, imbalance, cooldown,
   end-to-end read-only `weekly_review`). Re-running M5 inside `gate.evaluate()` would duplicate that coverage
   and add simulation-tuning flakiness for no new assurance; the gate instead **cites** it. (The DX-12 row
   does not ask for it; it lists shadow/gate/calibration/metrics, not the M5 module.)
2. **No schema/data change to `shadow_recommendation`.** It is immutable-history, additive-only; the rows are
   still recorded identically and remain a valid directional diagnostic. Reframing is in the read, not the
   shape — so fresh==migrated parity and the migration_006 golden are preserved.
3. **No threshold ratification.** `OSCILLATION_MAX`/`DRIFT_MAX`/`CONVERGENCE_MAX`/`RECOVERY_MARGIN_MIN` stay
   **PROPOSED** and the verdict stays **PROVISIONAL** (Q5) — DX-12 reorients *which* metrics gate, not the
   numeric bars, which remain a ratification decision.
4. **No constant adoption / no model behavior change** — calibration is still recommend-only (Q1); the gate
   still drives the production `SessionEngine` path (Q4).

---

## 6. Rollback

Code-only, no data migration. Revert `gate.py::evaluate` to `passed_provisional = stable_all and
recovers_all` (drop the `criteria` field and the reframed notes) and restore the prior docstrings in
`metrics.py` / `shadow.py` / `calibration.py` / `migration_006` / `repositories.py`; remove the 3 additive
tests. Because the verdict boolean and every raw key are unchanged, **no golden moves in either direction** —
the reframe is reversible by editing prose + one dataclass field, with no schema, constant, or trajectory
impact.

---

*Completion report only. Implements DX-12 strictly as a validation-only success-basis reorientation: no ①
core-math change, no schema/migration/version/constant change, no golden re-baselined, nothing adopted,
nothing applied. Verified at 172/172 (+3 additive, 0 re-gold). Brings the Phase-0 instrumentation/gate/
calibration into line with the DX-14 Validation-Architecture restatement (stability + score-estimate recovery
+ beats-no-learning as success; load/reps prediction as a directional diagnostic; M5 detector = criterion b).
Traceability: `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-12) · `Hush Validation Architecture v1` RESTATEMENT
ADDENDUM — DX-14 · `DX-09_COMPLETION_REPORT.md` (M5 / criterion b) · ES-012 F.1 · A1/A2/A8.*
