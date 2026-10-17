# DX-04 — Execution Package (M4: exploration off)

> **Scope:** the implementation delta for **DX-04** from `HUSH_V1_DELTA_EXECUTION_PLAN.md`.
> **M4 — disable the `P_EXPLORE` exploration auto-substitution so steady-state composition is
> stable.** Implementation only. No philosophy, no redesign, no new ideas. Complexity: **Trivial.**
> Depends on: **—** (none). Feeds: **DX-19** (tests/golden regold), **DX-13** (ES-009 §6 restatement).
> Date: 2026-06-11. Trace: Gap Review M4; Delta Plan DX-04.

---

## 1. The change in one sentence

The ES-009 Stage-3 "exploration floor" — which, at steady state, draws a non-top-preference
exercise from the same capability with probability `P_EXPLORE` — is **turned off by default**, so a
slot **always** takes its top-preference exercise (`SELECT_PREFERENCE`). The mechanism, the seed
plumbing, the persisted `exploration_seed` audit column, and the `P_EXPLORE` / `SELECT_EXPLORATION`
symbols all **stay in place**; only the default firing probability goes to `0.0`.

**Why M4 (per Gap Review):** Approved Hush is a *default-recommendation* product judged on stable,
trustworthy session-to-session continuity. The system-initiated exploration substitution introduces
a visible, unrequested exercise swap that the athlete did not choose — noise against the "Silent
Operator" stability the product depends on. Preference lock-in (the risk the floor was added to
mitigate, A14) is now handled on the *detection* side by **M5 stagnation (DX-09)** and on the
*preference* side by **sticky accepted replacements (DX-10)**, not by a stochastic swap.

---

## 2. Source-of-truth note (read before editing)

`build/_assembled/` is **generated**. `build/_verify/assemble_and_test.py` does
`shutil.rmtree(OUT)` then copies each file from `implementation/…`. **Any edit made directly in
`build/_assembled/` is destroyed on the next assemble.** Edit the source files only:

| Symbol | Source-of-truth file | Assembled mirror (do NOT edit) |
|---|---|---|
| Stage-3 draw | `implementation/sprint3b2/composition.py` | `build/_assembled/hush_model/composition.py` |
| `P_EXPLORE` constant | `implementation/sprint0/constants.py` | `build/_assembled/hush_model/constants.py` |
| Affected test | `implementation/sprint3b2/test_sprint3b2.py` | `build/_assembled/tests/test_sprint3b2.py` |

---

## 3. Exact edits

### Edit A — `implementation/sprint0/constants.py` (≈ lines 284–291)

Set the default to `0.0` and restate the comment. **Keep the symbol** (it is imported and bound by
name downstream — see §5).

```python
# --- ES-009 §6: exploration floor — DISABLED (M4 / DX-04) ---
# M4 (Approved Hush): the steady-state exploration auto-substitution is OFF, so composition
# is STABLE — a slot always takes its top-preference exercise (SELECT_PREFERENCE). The
# parameter is retained at 0.0 (NOT deleted): composition.py imports it, the Phase-0 harness
# binding map (sim/parameters.py) resolves it by name, and the seeded RNG + persisted
# `exploration_seed` audit column stay intact (R4 reconstructability is preserved).
# Was 0.10 (provisional/unvalidated). Re-enabling for a Phase-0 study is an override-harness
# decision (`override_parameters(P_EXPLORE=…)`), never a field tune.
P_EXPLORE: float = 0.0
```

### Edit B — `implementation/sprint3b2/composition.py` (`_select_for_slot`, ≈ lines 144–148)

Add a `P_EXPLORE > 0.0` short-circuit so that, with exploration off, the seeded RNG is **not
consumed** and the branch is provably dead — while leaving the mechanism reachable under override.

```python
    others = sorted(
        (e for e in pool if e.exercise_id != top.exercise_id),
        key=lambda e: e.exercise_id,   # deterministic order before the seeded draw
    )
    # ES-009 §6 exploration floor — DISABLED by default in V1 (M4 / DX-04): with the default
    # P_EXPLORE = 0.0 this branch never fires and the seeded RNG is not consumed, so a slot is
    # the deterministic top-preference exercise. The seed/plumbing stay so a Phase-0 override
    # (override_parameters(P_EXPLORE=…)) can re-enable and study it (R4 still holds).
    if others and P_EXPLORE > 0.0 and rng.random() < P_EXPLORE:
        return rng.choice(others), SELECT_EXPLORATION
    return top, SELECT_PREFERENCE
```

> The `> 0.0` guard short-circuits **before** `rng.random()`, so the RNG draw is skipped when
> exploration is off. This is observably identical to "always return `top`," but it (a) keeps the
> override path (`P_EXPLORE=0.99`) working bit-for-bit and (b) makes the disable explicit at the
> call site. Do **not** delete the branch or the `SELECT_EXPLORATION` vocabulary constant.

**That is the entire code delta for DX-04** (two files, ~one logical line each plus comments).

---

## 4. Invariants preserved (the firewall holds)

- **① core untouched.** No capability math (`reference_strength`, `epley`, blend, decay,
  confidence/variance), no `state_update`, no evidence consumer, no catalog, no volume engine, no
  decision/governor. DX-04 is one guarded branch + one constant default.
- **Schema unchanged — no migration.** `workout_session.exploration_seed` and the
  `exercise_block.selection_reason` enum stay exactly as built; sessions remain bit-reconstructable
  (R4). A session composed after DX-04 simply never carries a `selection_reason == "exploration"`.
- **API contract unchanged in DX-04.** §6's `selection_reason` enum still validly lists
  `exploration` (historical sessions and override-harness runs can still produce it). The doc note
  "no longer produced by default" is **DX-13/DX-18's** edit, not this package's.
- **Determinism strengthened.** One fewer nondeterministic branch by default; the calibration path
  was already exploration-free.
- **Symbols retained:** `P_EXPLORE` (constants), `SELECT_EXPLORATION` (composition vocab),
  `exploration_seed` (schema/repositories/session driver).

---

## 5. Why the symbol must NOT be deleted (downstream bindings)

Deleting `P_EXPLORE` would break, by name:

- `implementation/sprint3b2/composition.py:35` — `from .constants import (… P_EXPLORE …)`.
- `implementation/sprint4/parameters.py:51` — `"P_EXPLORE": (composition, "P_EXPLORE", "global")`
  (the `override_parameters` binding map; also line 21 doc and line 64 baseline snapshot).
- `implementation/sprint4/test_sprint4.py:52–53` — `with override_parameters(P_EXPLORE=0.99): assert
  composition.P_EXPLORE == 0.99`. **Still passes** with DX-04 (symbol present, override binding
  intact). This test is the guard that proves DX-04 kept the mechanism reachable.

---

## 6. Test impact (DX-19 surface — flagged, executed under DX-19)

DX-04's behavior flip lands its test changes in DX-19; this package enumerates them so DX-19 is
mechanical. Run with `python build/_verify/assemble_and_test.py`.

| Test (`implementation/sprint3b2/test_sprint3b2.py`) | After DX-04 | Action (DX-19) |
|---|---|---|
| `test_calibration_is_seed_independent_and_no_exploration` | **Passes** — calibration never explored; the `!= SELECT_EXPLORATION` assertion is now trivially true across all seeds. | Keep. |
| `test_exploration_deterministic_given_seed_and_class_safe` | **BREAKS** — its `next(s … if any(b.selection_reason == SELECT_EXPLORATION …))` scans seeds 0–199 for one that explores; none do → `StopIteration`. | **Rewrite (recommended):** (a) assert that with the default `P_EXPLORE` **no** seed in 0–199 yields `SELECT_EXPLORATION` (the new *stability* guarantee); and (b) move the existing determinism-given-seed + class-safety assertions under an `override_parameters(P_EXPLORE=0.99)` block so the still-present mechanism stays covered. |
| `test_steady_state_selects_preference_and_second_slot_distinct` | **Passes** — strictly more stable; it asserts preference/second-slot, not exploration. | Keep. |
| `test_sprint4.py` override test (§5) | **Passes.** | Keep. |
| Phase-0 golden trajectories | Any fixture that happened to land on an exploring seed shifts to its top-preference exercise. | Regold under DX-19 alongside M1–M3. |

**Net:** exactly **one** existing assertion (`test_exploration_deterministic_given_seed_and_class_safe`)
encodes the old behavior and must change. Everything else is pass-through or a regold.

---

## 7. Verification procedure

1. Apply Edit A + Edit B to the two `implementation/` source files.
2. Apply the DX-19 rewrite of `test_exploration_deterministic_given_seed_and_class_safe` (above).
3. `python build/_verify/assemble_and_test.py` → expect all suites green, with the rewritten
   exploration test asserting **stability** by default and **determinism/class-safety under
   override**.
4. Spot-check: compose a steady-state session across seeds 0–199 with default params and assert
   `all(b.selection_reason != "exploration")`; then under `override_parameters(P_EXPLORE=0.99)`
   confirm exploration fires and is bit-reproducible given the seed.

---

## 8. Dependencies, ordering, rollback

- **Upstream:** none (`—`). DX-04 is independent of the input-contract flip (DX-01/05/06/11) and of
  the governor demotion (DX-03). Safe to land standalone before Sprint 5.
- **Downstream (not edited here):**
  - **DX-19** — owns the test rewrite + golden regold listed in §6.
  - **DX-13** — restates ES-009 §6 (and `HUSH_V1_TRACEABILITY` row, ES-009 §6 line) to
    "exploration disabled / preference-stable."
  - **DX-16** — re-annotates Assumption **A14** ("exploration floor prevents preference lock-in")
    as inactive; lock-in mitigation shifts to **DX-10** (sticky preference) + **M5/DX-09**.
  - **DX-18** — API §6 wording ("`exploration` no longer produced by default").
- **Rollback:** restore `P_EXPLORE = 0.10` and drop the `P_EXPLORE > 0.0` guard. Fully reversible;
  no schema or data migration is involved either direction.

*Delta only. Sprint 4 → Approved Hush. Trace: Gap Review M4; DX-04.*
