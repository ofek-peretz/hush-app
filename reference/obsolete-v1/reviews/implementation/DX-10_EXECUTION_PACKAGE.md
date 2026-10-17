# DX-10_EXECUTION_PACKAGE.md — sticky persistent exercise preference

> **Scope:** the implementation delta for **DX-10** (Delta Plan P1, **Small**) — make an athlete-initiated
> exercise **replacement a sticky, persistent preference** for that slot, replacing the bounded ±5
> `PREFERENCE_NUDGE` with a **sticky-set** (pin the chosen family to a dominant score, demote the displaced
> family) so the chosen exercise is the **deterministic, durable** selection going forward. Closes the
> spec-ahead-of-code contradiction in Product Specification **Principle 6 / §6 / §13** (Open-Items **KL-18**).
> **Goal: make the athlete's own choice persist — not a preference-learning engine, not exploration, not a new
> score axis.** No ① core-math change, no change to selection/composition/blend/decay/evidence/governor/
> `kappa`. Additive except **one** sanctioned golden re-baseline. No schema change.
>
> **Binding product constraint (Product Specification §1/§6/§13):** Hush **automates nothing** — stickiness
> durably encodes the **athlete's own** explicit replacement; Hush never initiates, reverts, or decays a
> selection. Replacement stays **preference-driven, NEVER performance-driven** (ES-006).
>
> **Baseline:** Sprint 0–4 ✅ · Wave 1 ✅ · DX-07/04/03 ✅ · M1 ✅ · DX-11 ✅ · DX-09/M5 ✅ · DX-08 ✅ · docs
> aligned (DX-13…18) · Schema **v9** · **165/165**. Dependencies: **none** (Delta Plan marks DX-10
> independent). Date: 2026-06-12. Trace: Delta Plan DX-10; Open-Items KL-18; ES-006/007/009 §6; Product Spec
> §2/§6/§13. Gated by `DX-10_READINESS_REVIEW.md`.

---

## 0. Pre-implementation gate (READ FIRST — see `DX-10_READINESS_REVIEW.md`)

The readiness review **LOCKS** the interpretation (sticky = the athlete's latest explicit replacement is the
slot's deterministic, durable selection) and resolves the four build decisions to their recommended defaults:

- **D1 = (a) sticky-set within the existing `preference_state` table** — no schema change, no migration, no
  version re-gold; reuse the `argmax` selection primitive by writing dominating scores.
- **D2 = (a) keep `nudge()` + `PREFERENCE_NUDGE`** as a retained-but-inactive pure helper (still tested, still
  registered in `sprint4/parameters.py`); switch only the production call-site.
- **D3 = (a) pin chosen to `PREFERENCE_STICKY` (= 100), demote displaced to `PREFERENCE_DEFAULT_SCORE` (50)** —
  deterministic, idempotent (no ratchet), trivially the unique argmax in the 2-family catalog groups.
- **D4 = (a) calibration unchanged** — selection still returns the canonical exercise during calibration; the
  sticky preference is recorded but only takes effect in steady state.

If any default is overridden at sign-off, re-open the corresponding § below before coding.

---

## 1. The change in one paragraph

At the L2 REPLACE call-site, when the athlete's chosen exercise belongs to a **different family** than the one
they are replacing, instead of nudging both families ±5, **pin the chosen family's `preference_score` to
`PREFERENCE_STICKY` (100) and demote the displaced (current) family to `PREFERENCE_DEFAULT_SCORE` (50)**. The
existing `argmax`-by-preference selection (`catalog.replace` / `catalog.select`) then returns the chosen
exercise **deterministically and durably** for that slot going forward — most-recent-replacement-wins,
independent of nudge history (the §2-readiness failure is fixed). The sole preference writer
(`StateRepository.write_preference_state`) and the `preference_state` table are reused unchanged; the
chosen≠current guard (no-ratchet / SM3) is kept and is now reinforced by the **idempotent** sticky-set. New: a
named `PREFERENCE_STICKY` constant and a pure `apply_sticky` helper in `preference.py`; the `nudge` primitive
and `PREFERENCE_NUDGE` are **retained but inactive** in production. **No schema change** (reuses
`preference_state`, schema v9).

---

## 2. Source-of-truth note + MAP

`build/_assembled/` is generated — edit `implementation/` only. **All MAP entries already exist** (no new
assembler MAP row; contrast DX-08, which added `strength_standards.py`).

| Symbol / change | Source-of-truth file | Assembled dest |
|---|---|---|
| **NEW** `PREFERENCE_STICKY` constant (additive, named, Phase-0-tunable) | `implementation/sprint0/constants.py` | `hush_model/constants.py` |
| **NEW** pure `apply_sticky` helper (+ retain `nudge`, mark inactive) | `implementation/sprint3b1/preference.py` | `hush_model/preference.py` |
| `replace_exercise`: swap the two `nudge(...)` writes for pin-chosen / demote-displaced | `implementation/sprint1/service.py` | `hush_model/persistence/service.py` |
| **RE-GOLD** one preference golden + **NEW** sticky/durability tests (additive) | `implementation/sprint3b1/test_sprint3b1.py` | `tests/test_sprint3b1.py` |

> **MAP-confirmed (per `hush-build-workflow` memory — trust the MAP, not the plan's prose):** the real
> call-site is **`sprint1/service.py`**, *not* `decision.py`. The Delta Plan's DX-10 row names
> `decision.py (REASON_REPLACE_PREFERENCE)`, but `decision.py` only *defines* that reason string (it is
> emitted unchanged); the `nudge` writes live in `service.py::replace_exercise`. `domain.py`,
> `repositories.py`, `schema.py`, `catalog.py`, and the migrations are **untouched**.

---

## 3. Exact code changes

### 3.1 `constants.py` (ADDITIVE — one named scalar)

```python
# --- DX-10 sticky preference (ES-009 §6 / Product Spec Principle 6) ---
# On an athlete-initiated REPLACE, the chosen family's preference_score is SET to this
# sticky-dominant value (and the displaced family demoted to PREFERENCE_DEFAULT_SCORE),
# so the chosen exercise is the deterministic, durable argmax going forward — "a
# replacement becomes the persistent preferred exercise" (Product Spec §6). This is the
# single knob; PROVISIONAL/structural (it sets WHICH exercise persists, not how fast a
# preference moves). PREFERENCE_NUDGE below is retained but INACTIVE in production (DX-10).
PREFERENCE_STICKY: float = PREFERENCE_SCORE_MAX        # = 100.0; the chosen family is pinned maximally preferred
```
Placed immediately after the existing `PREFERENCE_SCORE_MIN/MAX` block (lines 221–222) so the preference
constants stay co-located. `PREFERENCE_NUDGE` (line 220) is left in place with an added one-line
"inactive in production since DX-10 — see `apply_sticky`" note.

### 3.2 `preference.py` (ADDITIVE pure helper; `nudge` retained, marked inactive)

```python
from .constants import (
    PREFERENCE_NUDGE, PREFERENCE_STICKY,
    PREFERENCE_DEFAULT_SCORE, PREFERENCE_SCORE_MIN, PREFERENCE_SCORE_MAX,
)

def apply_sticky(chosen_score: float | None = None) -> float:
    """DX-10: the chosen family on an accepted REPLACE becomes the slot's PERSISTENT
    preference (Product Spec §6). Return the sticky-dominant score the chosen family is
    SET to (not nudged toward) — making it the deterministic, durable argmax of its
    replacement group going forward. Idempotent: re-choosing the same family re-sets the
    same value, so identical evidence cannot ratchet (SM3). `chosen_score` is accepted
    for symmetry with `nudge` and ignored — stickiness is a SET, not a delta."""
    return PREFERENCE_STICKY

def demote(score: float | None = None) -> float:
    """DX-10: the DISPLACED (replaced-from) family is demoted below the sticky band so
    the most-recently-chosen exercise is the unique argmax (most-recent-replacement-wins).
    Returns the default-unobserved score; idempotent."""
    return PREFERENCE_DEFAULT_SCORE

# RETAINED but INACTIVE in production since DX-10 (sticky-set replaced the bounded nudge).
# Kept as a pure, tested helper still registered in sprint4/parameters.py (PREFERENCE_NUDGE).
def nudge(score: float, up: bool, step: float = PREFERENCE_NUDGE) -> float:
    ...  # unchanged body
```
> **Design note (D3):** pinning to `PREFERENCE_STICKY` (100) and demoting to `PREFERENCE_DEFAULT_SCORE` (50)
> is deterministic and idempotent. Because every replacement group in the 3B-1 catalog has exactly **two**
> families, demoting the single displaced family guarantees the chosen family is the unique argmax. For a
> hypothetical 3+-family slot (Phase 2/3), generalize `demote` to lower every non-chosen family in the group;
> recorded as a forward note, not built here.

### 3.3 `service.py::replace_exercise` (the one behavior change)

Replace the import and the two nudge writes:

```python
from ..preference import apply_sticky, demote        # DX-10 (was: from ..preference import nudge)
...
# DX-10: an accepted replacement becomes the slot's PERSISTENT preference (Product Spec §6).
# Pin the chosen family to the sticky band; demote the displaced family — so the chosen
# exercise is the deterministic, durable argmax going forward (most-recent-replacement-wins).
# Only when the choice actually changed the family (chosen != current) — re-selecting the
# same exercise must not write (no ratchet, SM3); sticky-set is itself idempotent.
if chosen.exercise_family != current.exercise_family:
    state_repo.write_preference_state(athlete_id, PreferenceState(
        athlete_id, chosen.exercise_family, apply_sticky()))
    state_repo.write_preference_state(athlete_id, PreferenceState(
        athlete_id, current.exercise_family, demote()))
```
Everything else in `replace_exercise` (the catalog selection, the `recommend(...)` call, the emitted
`Recommendation` with `REASON_REPLACE_PREFERENCE` / `REPLACE_EXERCISE`, the audit fields, the return dict) is
**unchanged**. `decision.py` is **untouched** (the reason code is emitted as-is).

### 3.4 `domain.py` / `repositories.py` / `schema.py` / `catalog.py` — NO change
`PreferenceState`, `AthleteState.preference_score` (default-50-on-absence), the `preference_state` upsert
writer, and the `argmax`-by-preference selection are all reused exactly as built.

---

## 4. Data flow

```
athlete replaces exercise (explicit; equipment/skip/pref trigger)        [Product Spec §6]
        │
   service.replace_exercise
        │
   catalog.replace(current_id, ath.preference_score)  ──►  argmax over the replacement group
        │                                                   (UNCHANGED selection primitive)
        ▼
   chosen.exercise_family != current.exercise_family ?
        │ no  ──► no write (no ratchet, SM3)            [test_replace_same_family_… stays green]
        │ yes
        ▼
   write_preference_state(chosen, apply_sticky() = 100)   ── pin chosen (dominant)
   write_preference_state(current, demote()      = 50)    ── demote displaced
        │
        ▼   GOING FORWARD — steady-state composition (ES-009 §6, catalog.select):
            argmax over {chosen:100, displaced:50, …} → CHOSEN, deterministically & durably.
            (during CALIBRATION, select() still returns the canonical anchor — D4, unchanged.)
```
The selection, recommendation, learning, and governor paths are **unchanged** — they consume
`preference_state` exactly as before; only the **values written on replace** change.

---

## 5. Test impact

**RE-GOLD (exactly one — the sanctioned behavior change):**
- `test_replace_nudges_chosen_up_and_rejected_down` → rename/re-gold to
  **`test_replace_sets_chosen_sticky_and_demotes_rejected`**: after `replace_exercise` into `bench_press`,
  assert `ath.preference_score("bench_barbell") == PREFERENCE_STICKY` (100, chosen) and
  `ath.preference_score("bench_dumbbell") == PREFERENCE_DEFAULT_SCORE` (50, displaced) — replacing the old
  `88+5 / 50−5` expectations. *(This is the only existing assertion whose values move.)*

**STAYS GREEN (no change):**
- `test_nudge_clamps_to_bounds` — tests the retained pure `nudge` helper directly (D2=a). Unchanged.
- `test_replace_same_family_does_not_double_nudge` — chosen==current (canonical tie-break) ⇒ guard skips both
  writes ⇒ `ath.preferences == {}`. The chosen≠current guard is preserved, so this is **bit-for-bit green**.

**NEW (additive — the contract guarantees):**
- `test_replace_into_less_preferred_family_now_persists` — **the §2-readiness failure, now fixed**: pre-load
  `bench_dumbbell = 88`, replace **into** `bench_barbell`; assert the *next* `catalog.replace`/composition
  selection returns `bench_press` (barbell) — the explicit choice **persists** despite the historical 88.
- `test_replace_is_sticky_most_recent_wins` — two successive replaces in one slot (A→B then B→C / B→A);
  assert the **latest** chosen family is the unique argmax and the prior sticky family was demoted.
- `test_sticky_is_idempotent_no_ratchet` — replacing into the already-chosen family re-sets `PREFERENCE_STICKY`
  (100→100) rather than ratcheting; durability holds with no unbounded growth.
- `test_sticky_inert_during_calibration` (optional, D4) — while calibrating, `select()` still returns the
  canonical exercise even with a sticky preference recorded; stickiness takes effect only in steady state.

**Existing 165:** **164 unchanged + 1 re-golded = 165**, plus the new sticky tests added. Per-suite counts
reported at sign-off.

---

## 6. Golden impact

**One re-gold, by design.** Unlike DX-08 (zero re-gold, additive-on-new-input), DX-10 **intentionally
changes the post-replace preference values**, so the single golden that asserts the old ±5 nudge
(`test_replace_nudges_chosen_up_and_rejected_down`) is re-baselined to the sticky contract (100 / 50). This is
a sanctioned, scoped behavior change — the same discipline as DX-03/M1 — and is the **only** moving golden:
no capability/score/blend/decay/seed/convergence/stability/composition golden is touched (the preference
update rule feeds none of them). `test_nudge_clamps_to_bounds` and the no-ratchet golden stay green.

**Acceptance check:** run the suite before merge — it must read **165/165** with **exactly one** prior
assertion re-baselined (named in the completion report) and the new sticky/durability tests added; **no**
schema version, migration count, or any other golden value changed.

---

## 7. Rollback strategy (code-only; no data migration)

- Revert `service.py::replace_exercise` to the two `nudge(...)` writes (restore the import); drop
  `PREFERENCE_STICKY` and the `apply_sticky`/`demote` helpers; re-restore the original golden. `nudge` /
  `PREFERENCE_NUDGE` never left the tree (D2=a), so the revert is a clean call-site swap.
- **No schema or data migration** — `preference_state` is unchanged; a written `100`/`50` is a legal
  `preference_score` the loop reads identically. Already-stuck athletes keep a valid preference row; reverting
  to nudge simply resumes ±5 stepping from whatever value is stored — **no state is corrupted**.
- **Soft rollback without a code revert:** set `PREFERENCE_STICKY = PREFERENCE_DEFAULT_SCORE + PREFERENCE_NUDGE`
  (≈55) to approximate the old single-step lean without touching code paths (a knob-only dampening); the true
  kill-switch is the call-site revert above.

---

## 8. Acceptance criteria

- [ ] `PREFERENCE_STICKY` added to `constants.py` (named, co-located with the preference block, marked the
      single sticky knob); `PREFERENCE_NUDGE` left in place and annotated **inactive in production since DX-10**.
- [ ] `apply_sticky` (+ `demote`) added to `preference.py` (pure, idempotent); `nudge` retained unchanged and
      still imported by `sprint4/parameters.py` + `test_nudge_clamps_to_bounds`.
- [ ] `service.py::replace_exercise` writes **pin-chosen (100) / demote-displaced (50)** under the existing
      **chosen≠current** guard; `decision.py` and the emitted `REASON_REPLACE_PREFERENCE`/`REPLACE_EXERCISE`
      unchanged.
- [ ] **Determinism + durability:** after one replace, the chosen exercise is the **unique argmax** of its
      replacement group going forward — **including** the §2 case (replace into a historically-less-preferred
      family now persists).
- [ ] **Most-recent-replacement-wins** verified across two successive replaces in one slot.
- [ ] **No-ratchet (SM3) preserved** — `test_replace_same_family_does_not_double_nudge` green; sticky-set
      idempotent.
- [ ] **Calibration unchanged (D4)** — `select(..., calibrating=True)` still returns the canonical anchor.
- [ ] Suite **165/165** with **exactly one** golden re-baselined (named) + new sticky tests added;
      `assemble_and_test.py` green; per-suite counts reported.
- [ ] ① core math, selection/composition, blend, decay, evidence, governor, `kappa` **untouched**; **no
      schema / migration / version bump**; ES-006 (preference-driven, never performance-driven) preserved;
      Hush still automates nothing.

---

## 9. Risk assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Over-reach into a preference-**learning** engine / decay / exploration | Med | Low | Scope is a **SET on explicit replace** only; no performance signal, no curve, no decay; readiness review §0/§5 forbids it; acceptance criteria assert "selection primitive untouched". |
| Pinning to 100 loses preference *ordering* information | Low | Med | v1 needs **which** exercise persists, not a ranking; all groups are 2-family so dominance is unambiguous; `PREFERENCE_STICKY` is a named, Phase-0-tunable knob if a softer band is later wanted. |
| Multi-family slot (Phase 2/3) under-handled by single-family demote | Low | Low (no such slot in v1) | 2-family invariant documented; `demote` generalization recorded as a forward note; no v1 catalog slot triggers it. |
| Re-gold hides an unintended trajectory change | Med | Very low | **Exactly one** preference golden moves and it is **named** in the completion report; every score/blend/decay/seed/convergence/stability/composition golden is asserted unchanged (the preference rule feeds none of them). |
| `decision.py`-vs-`service.py` mis-edit (Delta Plan names `decision.py`) | Med | Med | §2 MAP note: the call-site is **`service.py`**; `decision.py` only defines the reason string — confirmed against the assembler MAP, not the plan's prose (the `hush-build-workflow` gotcha). |

**Net:** lower-blast-radius than DX-03/M1 (one re-gold, no schema, no migration, selection primitive
untouched) and tighter than DX-08 (no new module, no fitted table). The change is a **call-site swap plus one
constant**; the real value is closing a four-statement spec contract the code silently violated. Reversible
via a clean call-site revert.

---

## 10. Dependencies, ordering

- **Upstream:** none — the Delta Plan marks DX-10 **independent**; the catalog, `preference_state`, the
  selection primitive, and the replace call-site all already exist.
- **Downstream (NOT here):** DX-12 (Phase-0 instrument/gate repoint) is the remaining open P1 and is
  independent. The slot-level `preferred_exercise_id` design (readiness D1-b) is a Phase-2/3 evolution if
  multi-family slots ship.
- **Recommended order:** DX-10 → DX-12 (per the M1-status memory and Delta Plan) — DX-10 first because it is
  cheap, independent, and closes the Principle-6 contradiction; DX-12 last (validation-only repoint, best
  after DX-08 so metrics repoint once).

---

*Execution package only — implements sticky persistent preference within DX-10's bounded scope. No ① core-math
change, no schema/migration/version change, no new selection branch; ES-006 preserved; Hush automates nothing;
one sanctioned preference golden re-baselined. Gated by `DX-10_READINESS_REVIEW.md`. Trace: Delta Plan DX-10;
Open-Items KL-18; ES-006/007/009 §6; Product Specification §2/§6/§13.*
