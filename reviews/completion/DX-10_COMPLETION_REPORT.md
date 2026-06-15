# DX-10_COMPLETION_REPORT.md — sticky persistent exercise preference

> Completion report for **DX-10** (Delta Plan P1, Small — **sticky persistent preference**), executed per
> `reviews/implementation/DX-10_EXECUTION_PACKAGE.md` and gated by `DX-10_READINESS_REVIEW.md` (GO;
> interpretation LOCKED). **DX-10 is complete.** Tests: **169/169 passing** (was **165/165**; **+4 net-new**
> in `test_sprint3b1`; **exactly one golden re-baselined** — by rename, net 0). An athlete-initiated exercise
> **replacement now becomes the slot's persistent preference**: the chosen family is **set** to the sticky
> band (`PREFERENCE_STICKY = 100`) and the displaced family **demoted** to the default (`50`), so the chosen
> exercise is the **deterministic, durable** argmax going forward (most-recent-replacement-wins). This closes
> the spec-ahead-of-code contradiction in Product Specification **Principle 6 / §6 / §13** (Open-Items
> **KL-18**). **No ① core-math change** — selection/composition, blend, decay, evidence weighting, decision
> governor, and `kappa` are untouched; **no schema change** (reuses `preference_state`, Schema **v9**); ES-006
> preserved (preference-driven, never performance-driven); Hush still automates nothing.
>
> Date: 2026-06-12 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + DX-11 ✅ + DX-09 ✅ +
> DX-13…18 ✅ + DX-08 ✅ + **DX-10 ✅** (Schema **v9**, unchanged) · Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`PREFERENCE_STICKY`** | Additive constant (named, structural) | ✅ Done | `= PREFERENCE_SCORE_MAX` (100); the single sticky knob; co-located with the preference block in `constants.py` |
| **`apply_sticky` / `demote`** | Pure helpers (new) | ✅ Done | `apply_sticky()→100` (SET, idempotent, no ratchet); `demote()→50`; I-O-free; in `preference.py` |
| **`replace_exercise` sticky-set** | The one behavior change | ✅ Done | pin chosen family / demote displaced under the existing **chosen≠current** guard; `decision.py` + `REASON_REPLACE_PREFERENCE` unchanged |
| **`nudge` / `PREFERENCE_NUDGE`** | Retained-but-inactive (D2=a) | ✅ Verified | kept as a pure tested helper + `sprint4/parameters.py` registry entry; unused by production |
| **Assembler MAP** | Build wiring | ✅ Unchanged | all targets (`constants.py`, `preference.py`, `service.py`, `test_sprint3b1.py`) already mapped — no new row |
| **No schema / migration / version bump** | Invariant | ✅ Verified | reuses `preference_state` (REAL `[0,100]`); `test_wave1` version asserts untouched |
| **DX-10 tests** | 1 re-gold + 4 additive | ✅ Done | sticky-set values, idempotent-set unit, dominant-and-persists, most-recent-wins, reselect-no-ratchet |

**Test result:** `==== 169/169 passed ====` — per-suite:
`sprint0 19 · sprint1 12 · sprint2 27 · sprint3a 18 · sprint3b1 22 · sprint3b2 26 · sprint4 20 · wave1 10 · sprint5 3 · sprint6 12`.
Baseline before DX-10 was **165/165** (`sprint3b1 18`). Net: **sprint3b1 +4**; **every other suite count is
identical and green**. The change is contained to the preference-update rule, which feeds no other golden.

---

## 1. The change

At the L2 REPLACE call-site, when the chosen exercise belongs to a **different family** than the one being
replaced, the preference update is now a **set**, not a bounded delta:

```
chosen family    ← apply_sticky()  = PREFERENCE_STICKY        (100)   # pinned dominant
displaced family ← demote()        = PREFERENCE_DEFAULT_SCORE (50)    # demoted below the band
```

The existing `argmax`-by-preference selection (`catalog.select` / `catalog.replace` / `_argmax_by_preference`)
then returns the chosen exercise **deterministically and durably** going forward — by a full 50-point band,
not the old fragile +5 lean. The **chosen≠current guard is preserved** (re-selecting the same exercise writes
nothing → no ratchet, SM3), and is now reinforced by the **idempotent** sticky-set (re-choosing the same
family re-sets 100 → 100, never grows). Selection is unchanged — stickiness works *through* the existing
argmax by writing dominating scores, **not** by adding a new selection branch. During calibration,
`select(..., calibrating=True)` still returns the canonical anchor (D4, unchanged).

**Files (source-of-truth `implementation/`):** `sprint0/constants.py` (+`PREFERENCE_STICKY`; `PREFERENCE_NUDGE`
annotated inactive), `sprint3b1/preference.py` (+`apply_sticky`/`demote`; `nudge` retained, marked inactive),
`sprint1/service.py` (`replace_exercise`: two `nudge(...)` writes → pin/demote), `sprint3b1/test_sprint3b1.py`
(1 re-gold + 4 additive). **No assembler MAP change; no schema/migration; `decision.py` untouched.**

> **MAP-confirmed (per the `hush-build-workflow` gotcha):** the call-site is **`sprint1/service.py`**, *not*
> `decision.py` — the Delta Plan's DX-10 row named `decision.py`, but that module only *defines* the
> `REASON_REPLACE_PREFERENCE` string (emitted unchanged); the preference writes live in
> `service.py::replace_exercise`. Confirmed against the assembler MAP, not the plan's prose.

---

## 2. Behavioral effect (verified, not assumed — direct probe on the assembled tree)

Scenario from the readiness review §2: `bench_dumbbell` historically at preference **88**, athlete triggers a
replace and the model selects dumbbell over the default-50 barbell (`horizontal_push`):

| | chosen `bench_dumbbell` | displaced `bench_barbell` | steady-state selection | margin |
|---|---:|---:|---|---:|
| **DX-10 sticky-set** | **100.0** | **50.0** | **`db_bench_press`** | **50.0** |
| (prior ±5 nudge) | 93.0 | 45.0 | `db_bench_press` | 8.0 |

The chosen exercise is now the slot's selection by a **full-band, durable margin (50)** rather than a fragile
8-point lean any later opposing event could erode. **The contract failure the readiness review demonstrated
is fixed:** a single explicit replacement now makes the chosen exercise persist outright, independent of
nudge history — "a replacement becomes the persistent preferred exercise" (Product Spec §6) is true in code.

**Most-recent-replacement-wins (verified, `test_sticky_most_recent_replacement_wins`):** a later replacement
pins the new family to 100 and **demotes the prior sticky family to 50**, so the slot follows the athlete's
*latest* explicit choice — not a cumulative tally. **No-ratchet (verified, `test_sticky_reselect_does_not_
ratchet` + `test_replace_same_family_does_not_double_nudge`):** re-selecting the already-sticky exercise
writes nothing and the idempotent set never grows past the band.

---

## 3. The re-gold (expected, stated — not hidden)

DX-10 **intentionally changes** the post-replace preference values, so **exactly one** existing golden was
re-baselined — the same sanctioned discipline as DX-03/M1:

| Before (Sprint 3B-1 nudge) | After (DX-10 sticky) |
|---|---|
| `test_replace_nudges_chosen_up_and_rejected_down`: chosen `== 88 + PREFERENCE_NUDGE` (93), rejected `== 50 − PREFERENCE_NUDGE` (45) | `test_replace_sets_chosen_sticky_and_demotes_rejected`: chosen `== PREFERENCE_STICKY` (100), displaced `== PREFERENCE_DEFAULT_SCORE` (50) |

**Rationale:** the ±5 nudge was a deliberately minimal Sprint 3B-1 slice (so flagged in `preference.py` and
`constants.py`) that **could not** satisfy Principle 6 — a single bounded step cannot overcome historical
accumulation, so an explicit replacement did not reliably persist (readiness §2). DX-10 replaces that rule
with a sticky-set; the golden that asserted the old ±5 behavior necessarily moves to the new contract. This is
the **only** moving golden: no capability/score/seed/blend/decay/convergence/stability/composition assertion is
touched (the preference-update rule feeds none of them), and `test_nudge_clamps_to_bounds` stays green because
the `nudge` primitive is retained unchanged (D2=a).

**Net count:** baseline `sprint3b1` 18 → 22. The re-gold was a **rename** (net 0); the **+4** are net-new:
`test_apply_sticky_and_demote_are_idempotent_sets`, `test_sticky_choice_is_dominant_and_persists`,
`test_sticky_most_recent_replacement_wins`, `test_sticky_reselect_does_not_ratchet`. Suite **165 → 169**.

---

## 4. Acceptance criteria (execution package §8)

- [x] `PREFERENCE_STICKY` added to `constants.py` (named, co-located, the single sticky knob); `PREFERENCE_NUDGE`
      left in place and annotated **inactive in production since DX-10**.
- [x] `apply_sticky` (+ `demote`) added to `preference.py` (pure, idempotent); `nudge` retained unchanged and
      still imported by `sprint4/parameters.py` + `test_nudge_clamps_to_bounds`.
- [x] `service.py::replace_exercise` writes **pin-chosen (100) / demote-displaced (50)** under the existing
      **chosen≠current** guard; `decision.py` and the emitted `REASON_REPLACE_PREFERENCE`/`REPLACE_EXERCISE`
      unchanged.
- [x] **Determinism + durability:** after one replace, the chosen exercise is the **unique argmax** of its
      replacement group (probe §2 + `test_sticky_choice_is_dominant_and_persists`), including the §2 case.
- [x] **Most-recent-replacement-wins** verified across two successive replaces (`test_sticky_most_recent_replacement_wins`).
- [x] **No-ratchet (SM3) preserved** — `test_replace_same_family_does_not_double_nudge` green; sticky-set
      idempotent (`test_sticky_reselect_does_not_ratchet`).
- [x] **Calibration unchanged (D4)** — `select(..., calibrating=True)` still returns the canonical anchor (no
      code change to the calibration branch).
- [x] Suite **165 → 169** with **exactly one** golden re-baselined (named, §3) + 4 new sticky tests;
      `assemble_and_test.py` green; per-suite counts reported (§0).
- [x] ① core math, selection/composition, blend, decay, evidence, governor, `kappa` **untouched**; **no
      schema / migration / version bump**; ES-006 preserved; Hush still automates nothing.

---

## 5. Scope boundary (honest)

Built exactly the bounded *persistence* correction the readiness review licensed — **not** a preference-
learning engine, exploration, or preference decay; Hush still never initiates, reverts, or decays a selection
(it durably encodes the **athlete's own** explicit choice). **Carried forward / not done here:**

1. **Slot-level `preferred_exercise_id` (readiness D1-b).** The sticky-set reuses the `preference_state`
   table; the 3B-1 catalog has exactly **two** families per replacement group, so demoting the single
   displaced family makes the chosen exercise the unique argmax. A 3+-family slot (Phase 2/3) would either
   generalize `demote` to every non-chosen family or adopt an explicit per-slot preferred-exercise column
   (a migration + schema bump). Recorded as the Phase-2/3 evolution; **not** a v1 concern (no such slot ships).
2. **`nudge` / `PREFERENCE_NUDGE` retirement (readiness D2-b).** Retained inactive to keep the blast radius
   minimal (it is wired into the Sprint-4 parameter registry + its own golden). Removing it is an optional,
   separately-reviewed cleanup, not part of DX-10.

**Not licensed / out of scope (unchanged):** any change to selection/composition/blend/decay/evidence/
governor/`kappa`; a preference-learning curve, exploration, or decay; letting Hush initiate or revert a
selection.

---

## 6. Rollback

Code-only, no data migration. Revert `service.py::replace_exercise` to the two `nudge(...)` writes (restore
the import), drop `PREFERENCE_STICKY` and the `apply_sticky`/`demote` helpers, and re-restore the original
golden — `nudge`/`PREFERENCE_NUDGE` never left the tree (D2=a), so it is a clean call-site swap. **No schema
or data migration:** `preference_state` is unchanged and a written `100`/`50` is a legal `preference_score`
the loop reads identically; already-stuck athletes keep valid rows and reverting simply resumes ±5 stepping
from the stored value — no state is corrupted. **Soft rollback without a code revert:** set
`PREFERENCE_STICKY = PREFERENCE_DEFAULT_SCORE + PREFERENCE_NUDGE` (≈55) to dampen the band toward the old
single-step lean.

---

*Completion report only. Implements sticky persistent preference within DX-10's bounded scope: no ① core-math
change, no schema/migration/version change, no new selection branch; ES-006 preserved; Hush automates nothing;
one sanctioned preference golden re-baselined (165 → 169). Closes Open-Items KL-18 / the Principle-6
contradiction. Trace: `DX-10_EXECUTION_PACKAGE.md`; `DX-10_READINESS_REVIEW.md`; Delta Plan DX-10; ES-006 /
ES-007 / ES-009 §6; Product Specification §2/§6/§13.*
