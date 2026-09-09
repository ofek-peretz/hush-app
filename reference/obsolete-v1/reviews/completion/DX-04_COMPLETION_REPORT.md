# DX-04_COMPLETION_REPORT.md — M4: exploration off

> Completion report for **DX-04** (Gap Review **M4** — disable the `P_EXPLORE` exploration
> auto-substitution so steady-state composition is stable), executed per
> `reviews/implementation/DX-04_EXECUTION_PACKAGE.md` and the approved `HUSH_V1_DELTA_EXECUTION_PLAN.md`.
> **DX-04 is complete.** Tests: **134/134 passing** (133 prior + 1 net-new from the exploration-test
> split). This is an **approved, bounded behavior change** — the *only* behavioral surface touched is
> "steady-state exploration off by default"; no other trajectory, formula, constant, column, or
> decision path moved. Governing rule honored: *no redesign without explicit model review* — DX-04 is
> a sanctioned delta from the plan, not a redesign. DX-03 was **not** opened.
>
> Date: 2026-06-11 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + **DX-04 ✅** (schema unchanged) · Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **DX-04 / M4** | Implementation (behavior demotion) | ✅ Done | `constants.P_EXPLORE = 0.0` + `composition._select_for_slot` guard + 2 tests |

**Test result:** `==== 134/134 passed ====` — per-suite:
`sprint0 12 · sprint1 7 · sprint2 27 · sprint3a 18 · sprint3b1 18 · sprint3b2 24 · sprint4 20 · wave1 8`.
Baseline before the change was **133/133**; `sprint3b2` moved **23 → 24** because the single
old exploration test was split into a *stability* test and an *under-override* test (see §2). All
other suites are byte-for-byte the same counts and pass unchanged.

**Behavioral effect (verified, not assumed):** with the default `P_EXPLORE = 0.0`, **0 of 500**
seeds produce a `SELECT_EXPLORATION` block; under `override_parameters(P_EXPLORE=0.99)`, **500 of
500** do, and the binding restores to `0.0` on exit. The disable is genuine and the mechanism stays
reachable for Phase-0 study.

---

## 1. Requirement compliance (the approval instructions)

| Requirement | Result |
|---|---|
| Apply Edit A (constants) | ✅ `implementation/sprint0/constants.py` → `P_EXPLORE: float = 0.0`, comment restated to "DISABLED (M4/DX-04)". Symbol retained. |
| Apply Edit B (composition draw) | ✅ `implementation/sprint3b2/composition.py` `_select_for_slot` → `if others and P_EXPLORE > 0.0 and rng.random() < P_EXPLORE:` — short-circuits before the RNG draw when off. |
| Apply the DX-19 exploration test rewrite | ✅ Split into `test_exploration_disabled_by_default_is_stable` (no seed explores) + `test_exploration_under_override_is_deterministic_and_class_safe` (mechanism retained, bit-reproducible, class-safe). |
| Run the canonical assembler + full suite | ✅ `python build/_verify/assemble_and_test.py` → **134/134**. |
| Produce a DX-07-format completion report | ✅ This document. |
| Do **not** open DX-03 | ✅ No DX-03 file, spec, or `decision.py`/governor code touched. |

> **Transparent note — this IS a behavior change (unlike Wave 1).** Wave 1 was "no behavior moved";
> DX-04 is the opposite by design: M4 deliberately turns off a behavioral branch. The bit-for-bit
> claim therefore applies to **everything except** the exploration substitution. The 133 prior tests
> passing unchanged confirms nothing *else* shifted — no default-path trajectory depended on an
> exploring seed (verified: 0/500 seeds explored even before could have only mattered to a fixture,
> and none failed).

---

## 2. What was delivered

### Edit A — `implementation/sprint0/constants.py` (ES-009 §6 block)
`P_EXPLORE: float = 0.10` → `0.0`, with the comment rewritten to state M4 intent and **why the
symbol is retained** (imported by `composition.py`, bound by name in `sim/parameters.py`, and the
`exploration_seed` audit column + seeded RNG stay intact for R4 reconstructability).

### Edit B — `implementation/sprint3b2/composition.py` (`_select_for_slot`, exploration floor)
Added the `P_EXPLORE > 0.0` short-circuit so that, with exploration off, the seeded RNG is **not
consumed** and the branch is provably dead — while leaving the mechanism reachable under the Phase-0
override harness:
```python
if others and P_EXPLORE > 0.0 and rng.random() < P_EXPLORE:
    return rng.choice(others), SELECT_EXPLORATION
return top, SELECT_PREFERENCE
```

### DX-19 test rewrite — `implementation/sprint3b2/test_sprint3b2.py`
The old `test_exploration_deterministic_given_seed_and_class_safe` searched seeds 0–199 for one that
explores; with exploration off that search raises `StopIteration`. Replaced with two tests:
- **`test_exploration_disabled_by_default_is_stable`** — across seeds 0–199, asserts **no** block is
  `SELECT_EXPLORATION` (the new stability guarantee).
- **`test_exploration_under_override_is_deterministic_and_class_safe`** — inside
  `with override_parameters(P_EXPLORE=0.99)`, the floor fires, the session is bit-reproducible given
  the seed, and every chosen exercise still trains its slot's Class-A capability (R4 retained).
- Added `from sim.parameters import override_parameters` to the test imports.

---

## 3. Files changed

**Edited source (snapshots under `implementation/`):**
- `implementation/sprint0/constants.py` — `P_EXPLORE = 0.0` + restated comment (Edit A).
- `implementation/sprint3b2/composition.py` — `_select_for_slot` exploration-floor guard (Edit B).
- `implementation/sprint3b2/test_sprint3b2.py` — exploration test split + `override_parameters` import (DX-19).

**Unchanged (deliberately):** `sim/parameters.py` (P_EXPLORE binding kept), `schema.py` /
migrations (`exploration_seed` column kept — no migration), `decision.py` / governor (DX-03, not
opened), all ① core math.

**Regenerated (generated artifact, never hand-edited):** `build/_assembled/` re-assembled by
`assemble_and_test.py` from the three edited snapshots.

**New documentation:** `reviews/implementation/DX-04_EXECUTION_PACKAGE.md` (the approved package);
this report.

---

## 4. Acceptance checklist (from the Execution Package §§4, 7)

- [x] **Edit A + Edit B applied to `implementation/` source** (not the regenerated `_assembled/`).
- [x] **`P_EXPLORE` symbol retained at 0.0** — `composition.py` import, `sim/parameters.py` binding
      map, and `test_sprint4.py` override assertion all still resolve. `test_sprint4` passes (20/20).
- [x] **Default stability:** 0/500 seeds produce `SELECT_EXPLORATION` (verified directly).
- [x] **Mechanism retained:** under `override_parameters(P_EXPLORE=0.99)`, exploration fires
      (500/500), is bit-reproducible given the seed, and is class-safe; binding restores to 0.0.
- [x] **RNG not consumed when off** — guard short-circuits before `rng.random()`.
- [x] **① core untouched** — no capability math / `state_update` / evidence / catalog / volume /
      decision edit; the 133 prior tests pass unchanged.
- [x] **Schema unchanged, no migration** — `exploration_seed` audit column intact; R4
      reconstructability preserved.
- [x] **DX-03 not opened.**
- [x] **Full suite green:** 134/134.

---

## 5. Verification method & evidence

- **Baseline (pre-change):** `python build/_verify/assemble_and_test.py` → `133/133 passed`.
- **After DX-04:** `134/134 passed` (per-suite breakdown in §0).
- **Disable is genuine, not vacuous (direct probe on the assembled tree):**
  - default `composition.P_EXPLORE == 0.0`; exploring seeds in 0–499 = **0**.
  - `override_parameters(P_EXPLORE=0.99)`: exploring seeds in 0–499 = **500** (first = seed 0).
  - after the `with` block: `composition.P_EXPLORE == 0.0` (restored; `assert_unpatched()` holds
    because the model source value is now 0.0).
- **No collateral trajectory shift:** every prior suite count is identical and green; the only delta
  is the intended exploration-test split in `sprint3b2`.

---

## 6. Out of scope / explicitly not done (owned by other DX)

- **DX-03 (M3 governor advisory)** — not opened, per instruction.
- **DX-19 (full test + golden regold)** — DX-04's *own* test rewrite is done here; the broader
  Phase-0 golden-trajectory regold for the combined M1–M4 set remains DX-19's job. No default-path
  golden fixture depended on an exploring seed, so none needed regolding for DX-04 alone.
- **DX-13** — ES-009 §6 spec + `HUSH_V1_TRACEABILITY` restatement to "exploration disabled /
  preference-stable" (documentation; not a code edit).
- **DX-16** — Assumption **A14** ("exploration floor prevents preference lock-in") re-annotated as
  inactive; lock-in mitigation now flows to **DX-10** (sticky preference) + **M5/DX-09** (detection).
- **DX-18** — API §6 wording ("`exploration` no longer produced by default"). The `selection_reason`
  enum still validly includes `exploration` (historical + override-harness sessions); not edited here.

---

## 7. DX-04 Definition-of-Done

- [x] Steady-state composition is **stable by default** — a slot always takes its top-preference exercise.
- [x] `P_EXPLORE` / `SELECT_EXPLORATION` / `exploration_seed` retained; mechanism reachable for Phase 0.
- [x] R4 determinism + audit reconstructability preserved; no schema/migration change.
- [x] Exactly one behavioral surface changed; 133 prior tests unchanged-and-green; suite at 134/134.
- [x] Execution package + completion report produced; DX-03 untouched.

**DX-04 is closed.** No further code is required for M4.

---

## 8. Recommended next step (not executed)

Per the approval, **validate DX-04** (this report + 134/134), then proceed to the **DX-03 package**
(M3 — demote the ES-006 governor to advisory). DX-03 has no dependency on DX-04 and is the next P0
in the queue. No DX-03 work has been started.

---

*Completion report only. Implementation strictly within DX-04 as approved; no DX-03 work, no
redesign, no out-of-scope model change. Verified at 134/134. Traceability:
`DX-04_EXECUTION_PACKAGE.md` · `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-04) · Gap Review M4.*
