# DX-03 — Execution Package (M3: governor advisory)

> **Scope:** the implementation delta for **DX-03** from `HUSH_V1_DELTA_EXECUTION_PLAN.md`.
> **M3 — demote the ES-006 governor to advisory: the governor still computes its decision
> (KEEP / INCREASE / DECREASE + reason), but its one-step load move is NOT applied to the
> emitted load.** Implementation only. No philosophy, no redesign, no new ideas.
> Complexity: **Medium** (small LOC; touches a core decision path that four modules read,
> with a concentrated governor test surface and explicit audit-semantics reasoning).
> Depends on: **—** (none). Feeds: **DX-19** (tests/golden regold), **DX-13** (ES-006 restatement).
> Date: 2026-06-11. Trace: Gap Review M3; Delta Plan DX-03.

---

## 1. The change in one sentence

The ES-006 governor — which, on a confidence-gated consistent run, **stepped the held load by one
equipment increment toward the ES-005.1 target** (INCREASE/DECREASE) — is **demoted to advisory**:
it still computes the decision *type* and *reason* and still records decision memory, but the
emitted/held `recommended_weight` **never moves by the governor step**. Every governed cycle emits
the **held** load; the score-derived `target_load` (already on every `Recommendation`) remains the
advisory direction signal, and `decision_type` (KEEP/INCREASE/DECREASE) becomes the advisory
*opinion* rather than an applied action. Decision memory (streak / `last_decision` /
`last_recommended_weight`) is **retained unchanged** for audit/history.

**Why M3 (per Gap Review):** Approved Hush is a *default-recommendation* product whose authority is
detection and a stable starting suggestion, not an auto-driven load ladder. The auto-applied
progression is a visible, unrequested change the athlete did not choose, and — pre-M1 — it was
applied on a load the system never actually observed. M3 removes the auto-application; progression
becomes the athlete's logged `actual_weight` (M1/DX-01) and plateau handling moves to detection
(M5/DX-09). The governor's *computation* is kept so the advisory direction and the audit trail
("the model would lean up here") survive.

---

## 2. Source-of-truth note (read before editing)

`build/_assembled/` is **generated**. `build/_verify/assemble_and_test.py` does
`shutil.rmtree(OUT)` then copies each file from `implementation/…`. **Any edit made directly in
`build/_assembled/` is destroyed on the next assemble.** Edit the source files only:

| Symbol | Source-of-truth file | Assembled mirror (do NOT edit) |
|---|---|---|
| `govern()` + Decision | `implementation/sprint3a/decision.py` | `build/_assembled/hush_model/decision.py` |
| governed emission | `implementation/sprint0/recommendation.py` | `build/_assembled/hush_model/recommendation.py` |
| decision-memory hook | `implementation/sprint1/pipeline.py` | `build/_assembled/hush_model/persistence/pipeline.py` |
| session driver | `implementation/sprint3b2/session.py` | `build/_assembled/hush_model/persistence/session.py` |
| affected tests | `implementation/sprint3a/test_sprint3a.py` | `build/_assembled/tests/test_sprint3a.py` |

---

## 3. Exact edits

### Edit A — `implementation/sprint3a/decision.py` (`govern()`, ≈ lines 120–131) — **the only functional change**

The INCREASE/DECREASE branches keep their **match condition, type, and reason** (the governor still
computes), but return the **held** load instead of the stepped load — the step is not applied. KEEP
branches already return `held_load` and are unchanged. The `equipment_step` parameter is **retained
in the signature** (it is passed by name from `recommendation.py` and exercised by the pure unit
tests; mirrors the DX-04 symbol-retention discipline) even though the body no longer steps with it.

```python
    # DX-03 (M3): the ES-006 governor is ADVISORY. It still COMPUTES the decision — a
    # confidence-gated consistent-positive run => INCREASE_LOAD, a consistent-negative run =>
    # DECREASE_LOAD, otherwise KEEP — and that decision_type + reason are surfaced for advice
    # and recorded in decision memory. But the one-step load move is NOT applied: every branch
    # emits the HELD load. The score-derived target (target_load on the Recommendation) remains
    # the advisory direction; progression is the athlete's logged actual_weight (M1/DX-01), not
    # an auto-applied step. Was (Sprint 3A): stepped = min/max(held ± equipment_step, target);
    # return Decision(INCREASE/DECREASE, ..., stepped).  equipment_step is retained in the
    # signature (caller binding + unit tests) though the body no longer steps with it.
    if confidence < conf_gate:
        return Decision(KEEP_LOAD, REASON_LOW_CONFIDENCE_HOLD, held_load)

    if consecutive_positive >= stability_n and target_load > held_load:
        return Decision(INCREASE_LOAD, REASON_CONSISTENT_POSITIVE, held_load)

    if consecutive_negative >= stability_n and target_load < held_load:
        return Decision(DECREASE_LOAD, REASON_UNEXPLAINED_REGRESSION, held_load)

    return Decision(KEEP_LOAD, REASON_KEEP_DEFAULT, held_load)
```

Also restate the **module docstring** (≈ lines 5–27): the governor "decides whether, and how fast,
the emitted load moves" becomes "computes an **advisory** decision; the load step is no longer
applied — the emitted load holds, and `target_load` carries the advised direction." Keep the
Invariant-3 line (this module still never computes a load from scratch — it now returns *only* the
held load, which is strictly *more* conservative than before).

> **Net behavioral surface:** the governed branch's emitted load goes from `held ± one step` to
> `held`. `decision_type`/`reason` are unchanged in value. This is the entire functional delta.

### Edit B — `implementation/sprint0/recommendation.py` (`recommend()`, govern call site ≈ lines 82–96) — **comment/docstring only, no logic change**

`load = dec.recommended_weight` already emits whatever `govern()` returns (now the held load), and
`decision_type`/`reason` still flow from the decision. No code change is required; update the inline
comment and the module docstring to say the governor is **advisory** (emits the held load; the step
is not applied; `target_load` is the advised direction). The cold-start branch (no decision memory →
`load = target_load`) is **unchanged**: the first recommendation is still the ES-005.1 working set;
subsequent governed cycles hold it.

### Edit C — `implementation/sprint1/pipeline.py` (`_record_block_decision`, ≈ lines 60–92) — **comment only, no logic change**

Decision memory is **retained verbatim**: the streak still advances on surprise sign, the
reset-on-fire still consumes the run on an INCREASE/DECREASE *decision*, and
`last_recommended_weight`/`last_decision` are still written. With Edit A the `recommended_weight`
passed in is now the held load, so `last_recommended_weight` simply tracks the held anchor. Add one
comment line noting the recorded INCREASE/DECREASE is now **advisory** (the load it accompanies is
held). No logic change — the user's instruction is "decision memory may remain for audit/history,"
and "no changes to stagnation logic."

### Edit D — `implementation/sprint3b2/session.py` (`run_session`, ≈ lines 100–122) — **comment only, no logic change**

The driver threads the primary slot's `decision_type` + `recommended_weight` into `complete_block()`
exactly as before; both values are still well-formed (advisory type, held weight). Add one comment
noting the governor is advisory. No logic change.

> **That is the entire delta for DX-03: one functional edit (Edit A, three return statements +
> docstring) plus three comment-only restatements.** No new field, no new function, no signature
> change, no schema/migration.

---

## 4. DX-19 surface — affected tests (flagged here, executed here to keep the suite green)

Per the DX-04 precedent, the behavior flip's test changes are formally **DX-19's** surface; they are
enumerated and applied here so DX-03 lands green. All churn is in
`implementation/sprint3a/test_sprint3a.py`. **Target: still 134/134** (in-place rewrites, no net new
test).

| Test | After DX-03 | Action |
|---|---|---|
| `test_increase_fires_at_stability_n_one_step_toward_target` (L74) | **BREAKS** — asserts `d.recommended_weight == 42.5`. | Rewrite: keep `decision_type == INCREASE_LOAD and reason == REASON_CONSISTENT_POSITIVE` (advisory computed); change the weight assertion to `d.recommended_weight == 40.0` (held — step not applied). |
| `test_increase_capped_at_target` (L81) | **BREAKS** — asserts `d.recommended_weight == 41.0`. | The "cap at target" property is moot once the step is never applied. Repurpose as `test_increase_advisory_holds_load`: `decision_type == INCREASE_LOAD`, `d.recommended_weight == 40.0` (held). |
| `test_decrease_fires_on_negative_run_with_low_fatigue` (L94) | **BREAKS** — asserts `d.recommended_weight == 57.5`. | Rewrite: keep `decision_type == DECREASE_LOAD and reason == REASON_UNEXPLAINED_REGRESSION`; change weight to `d.recommended_weight == 60.0` (held). |
| `test_governor_increase_does_not_double_discount` (L139) | **BREAKS** — asserts `rec.recommended_weight == 40.0 + DEFAULT_EQUIPMENT_STEP_KG`. | Rewrite as `test_governor_increase_is_advisory_load_holds`: `rec.decision_type == INCREASE_LOAD`; `rec.recommended_weight == 40.0` (held); `rec.target_load > rec.recommended_weight` (target still surfaced as the advised direction — this assertion already passes). |
| `test_multisession_stability_guard_then_increase` (L241) | **BREAKS** — asserts the emitted load stepped (`0 < increase_step <= step`). | Rewrite: keep `decisions[0] == KEEP_LOAD`, the pre-`STABILITY_N` KEEP guard, and `INCREASE_LOAD in decisions` (advisory still fires). Replace the step assertion with **stability**: across all sessions the emitted `recommended_weight` never increases over the cold-start seed (`increase_step == 0.0` / `weights` non-rising), and keep the audit check `last["target_load"] >= last["recommended_weight"]`. |
| `test_keep_is_default_below_stability_n` (L67), `test_no_increase_when_target_not_above_held` (L88), `test_low_confidence_holds_despite_strong_streak` (L101) | **Pass** — all assert KEEP/held; held semantics unchanged. | Keep. |
| `test_cold_start_is_unchanged_and_additive` (L130) | **Pass** — cold start untouched; `target_load == recommended_weight`. | Keep. |
| `test_decision_memory_round_trips` (L156), `test_migration_003_additive_and_idempotent` (L183) | **Pass** — schema + memory columns unchanged. | Keep. |
| `test_increase_resets_the_streak_on_fire` (L285), `test_multisession_streak_persists_in_state` (L304) | **Pass** — decision memory retained; INCREASE still *fires as a decision*, so the run still resets/accumulates identically. | Keep (verify directly). |
| `test_sprint3b1.py` decision-hook tests (L289–351), `test_sprint3b2.py` governor-count/streak tests (L301–325) | **Pass** — these pass explicit `decision_type`/`recommended_weight` into `complete_block` or assert streak counts; neither depends on the emitted step. | Keep. |
| `test_sprint2.py` fatigue-hold tests, `test_sprint1.py` | **Pass** — the fatigue path does not call `govern()`; rested non-governed paths unchanged. | Keep. |

**Net:** exactly **five** sprint3a assertions encode "the load stepped" and must flip to "the load
holds; the decision is advisory." Everything else is pass-through.

> **Golden trajectories:** any Phase-0 golden fixture that contained a governed INCREASE/DECREASE
> step shifts to a flat (held) load. No golden-fixture *file* is loaded by `assemble_and_test.py`
> (it runs `test_*` functions only), so nothing extra blocks this package; the combined M1–M4 golden
> regold remains **DX-19's** job.

---

## 5. Invariants preserved (the firewall holds)

- **① core untouched.** No capability math (`reference_strength`, `epley`, blend, decay,
  confidence/variance), no `state_update`, no evidence consumer, no catalog, no volume engine,
  no composition. DX-03 is three return statements in `govern()` + comments.
- **Single source of truth for load (Invariant 3) strengthened.** `decision.py` still never computes
  a load from scratch; it now returns *only* the held load — strictly more conservative than the
  prior held-or-stepped.
- **Schema unchanged — no migration. Schema stays v7.** `recommendation.decision_type` /
  `target_load` and the `capability_state` decision-memory columns
  (`last_recommended_weight`/`last_decision`/`consecutive_*`/`last_decision_week`) are all kept and
  still written; a session composed after DX-03 simply carries a `decision_type` whose load was not
  moved. Audit reconstructability (R4) is preserved.
- **Decision memory retained.** Streak advance, reset-on-fire, and `last_decision` are byte-unchanged
  (per instruction: "decision memory may remain for audit/history").
- **Symbols retained:** `INCREASE_LOAD` / `DECREASE_LOAD` / `REASON_CONSISTENT_POSITIVE` /
  `REASON_UNEXPLAINED_REGRESSION` (advisory vocabulary), `Decision.recommended_weight`,
  `DEFAULT_EQUIPMENT_STEP_KG` / `equipment_step` param (signature + unit-test binding), `target_load`.
- **Determinism preserved/strengthened.** One fewer state-dependent load movement; emitted governed
  load is now a pure function of the held anchor.

---

## 6. Verification procedure

1. Apply Edit A (the three `govern()` returns + docstring) and the comment-only Edits B/C/D to the
   four `implementation/` source files.
2. Apply the §4 sprint3a test rewrites (five assertions).
3. `python build/_verify/assemble_and_test.py` → expect **134/134** green.
4. Spot-checks on the assembled tree:
   - **Demotion is genuine:** seed a governed athlete with a strong positive run above the gate; over
     ≥ `STABILITY_N + 5` sessions confirm `INCREASE_LOAD` appears in `decision_type` (advisory still
     computed) **and** every emitted `recommended_weight` equals the cold-start seed (no step), while
     `target_load >= recommended_weight` throughout.
   - **Decision memory intact:** `consecutive_positive` reaches `STABILITY_N`, resets to 0 on the
     INCREASE fire, and `last_recommended_weight` / `last_decision` round-trip through persistence.
   - **Cold start unchanged:** first recommendation `recommended_weight == target_load` with
     `decision_type == KEEP_LOAD`, reason `working_set:target+RIR,discounted,floored`.

---

## 7. Acceptance checklist

- [ ] Edit A applied to `implementation/sprint3a/decision.py` — INCREASE/DECREASE branches return
      `held_load`; match condition, `decision_type`, and `reason` unchanged; docstring restated.
- [ ] `equipment_step` retained in the `govern()` signature; `recommendation.py` still passes it.
- [ ] Edits B/C/D are comment/docstring only — **no logic change** in `recommendation.py`,
      `pipeline.py`, or `session.py` (diff shows only comments/docstrings).
- [ ] Governed emission holds: 0 governed cycles move the load by a step (direct probe).
- [ ] Advisory retained: `INCREASE_LOAD`/`DECREASE_LOAD` still produced as `decision_type`;
      `target_load` still surfaced as the advised direction.
- [ ] Decision memory unchanged: streak advance + reset-on-fire + `last_*` columns identical.
- [ ] ① core untouched; cold-start path unchanged.
- [ ] Schema unchanged, **no migration** — Schema v7; R4 audit reconstructability preserved.
- [ ] Five sprint3a assertions rewritten (§4); all other suites pass unchanged.
- [ ] Full suite green: **134/134**.
- [ ] Scope confined to DX-03 (see §10).

---

## 8. Rollback checklist

Fully reversible; no schema or data migration in either direction.

- [ ] Restore the INCREASE/DECREASE branches in `govern()` to the stepped form
      (`stepped = min(held + equipment_step, target_load)` → `Decision(INCREASE_LOAD, …, stepped)`;
      symmetric `max(...)` for DECREASE) and restore the prior docstring.
- [ ] Revert the comment-only restatements in `recommendation.py` / `pipeline.py` / `session.py`.
- [ ] Revert the five sprint3a test rewrites (restore the `42.5 / 41.0 / 57.5 / held+step / stepped`
      assertions).
- [ ] Re-run `python build/_verify/assemble_and_test.py` → 134/134 on the restored stepping behavior.
- [ ] No data backfill required: persisted `recommendation`/`capability_state` rows are valid under
      both behaviors (the columns are identical; only future emitted values differ).

---

## 9. Completion criteria (Definition of Done)

- [ ] The ES-006 governor is **advisory by default** — a governed cycle emits the **held** load; the
      one-step move is never applied.
- [ ] The governor still **computes** KEEP/INCREASE/DECREASE + reason and surfaces them, and
      `target_load` remains the advised direction.
- [ ] Decision memory (streak / reset-on-fire / `last_decision` / `last_recommended_weight`) is
      retained unchanged for audit/history.
- [ ] Exactly one behavioral surface changed (governed emitted load: stepped → held); all
      non-governor suites pass unchanged; suite at **134/134**.
- [ ] No schema/migration change (Schema v7); ① core, cold start, fatigue path, and composition
      untouched.
- [ ] This execution package produced; a DX-07/DX-04-format completion report to follow on execution.

---

## 10. Scope confirmation — **DX-03 only**

This package is **strictly limited to DX-03 (M3, governor advisory)**. Explicitly **not** in scope
and **not** touched:

- **M1 / DX-01** (consume athlete-logged `actual_weight`) — **not opened.** `pipeline.py` still writes
  `actual_weight = rec.recommended_weight`; DX-03 changes only *what the governor emits*, not the
  observation-input plumbing.
- **M2 / DX-02** (prediction error at actual load) — **not opened.**
- **§7 contract reversal / runtime-fidelity** (DX-05 / DX-06 / DX-11) — **not opened.**
- **Learning-input migration** — **none.** No schema or data migration in this package (Schema v7
  unchanged).
- **M5 stagnation / DX-09** and all **stagnation logic** — **not opened, not modified.**
- **Exploration (DX-04)** — already closed; not re-touched.
- **Sprint 5 work** — **not started.**
- **Spec/doc restatements** (DX-13 ES-006 advisory wording, DX-18 API `recommended_weight` advisory
  wording) — **owned by their P2 packages**, not edited here.
- The **M1 migration project / M1 chain remains unopened.**

*Delta only. Sprint 4 + Wave 1 + DX-04 → Approved Hush. Trace: Gap Review M3; Delta Plan DX-03.*
