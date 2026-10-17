# DX-10_READINESS_REVIEW.md — model review gating sticky exercise preference

> **Purpose.** DX-10 changes a model behavior (what happens to a slot's exercise preference when the
> athlete replaces an exercise) to close a **spec-ahead-of-code contradiction**: Product Specification
> **Principle 6 / §6** promise that *an athlete-initiated replacement becomes the persistent preferred
> exercise for that slot going forward*, but the code ships only the bounded `PREFERENCE_NUDGE` (±5) — a
> minimal slice that is **demonstrably not sticky**. Per the governing rule — *no redesign without explicit
> model review* — **this document is that review.** It (a) confirms scope and truthfulness against the
> approved Product Specification and the founder constraint, (b) demonstrates the exact contract failure an
> implementer must fix, (c) names the decisions that must be made before coding, and (d) gives a **go / no-go**
> with conditions. Pairs with `DX-10_EXECUTION_PACKAGE.md`. Date: 2026-06-12. Baseline: schema **v9**, **165/165**.

---

## 0. APPROVED DIRECTION — what "sticky" means, LOCKED

The binding interpretation of Principle 6 / §6 for v1:

- **An athlete-initiated replacement is an explicit, durable choice.** Once the athlete replaces exercise A
  with exercise B for a slot, **B is the exercise that slot uses going forward** — deterministically, until
  the athlete themselves replaces it again.
- **Most-recent-replacement wins.** The persisted preference reflects the athlete's *latest* explicit
  decision for that slot, not a cumulative tally of past nudges.
- **Stickiness is preference-driven, NEVER performance-driven** (ES-006). No performance/quality signal may
  enter the preference update. The trigger is the athlete's explicit replace/skip action only.
- **Hush still changes nothing automatically.** Stickiness makes the *athlete's own* choice durable; it does
  not let Hush initiate, revert, or decay an exercise selection (Product Spec §1/§6/§13).
- **Conservative scope.** This is the *persistence* of an already-built selection primitive, **not** a
  preference-learning engine, not exploration, not a new score axis. ES-009 §6 fixes that *preference drives
  selection*; DX-10 fixes only that *the selection persists*.

This is exactly the reading that makes Principle 6 ("**persistent** preferred exercise"), §6 ("a replacement
**becomes** the athlete's persistent preferred exercise"), §13 ("an athlete-initiated exercise replacement
**persists**"), and the §"Athlete owns / Hush owns" split ("replacements which then **persist** as
preferences") simultaneously true. **This question is closed.**

---

## 1. Scope & truthfulness check (PASS — with one honest behavior change to state)

| Claim under review | Verdict |
|---|---|
| Spec **promises** sticky persistence (Principle 6, §6, §13, §"ownership") | ✅ Verified in `HUSH_V1_PRODUCT_SPECIFICATION.md` lines 37–38, 110–116, 239, 250 — four independent statements; the contract is unambiguous. |
| Code **does not** deliver it — only bounded `PREFERENCE_NUDGE` (±5) | ✅ Verified: `sprint1/service.py::replace_exercise` applies one ±5 nudge per event; `constants.py` flags `PREFERENCE_NUDGE` PROVISIONAL and the docstrings call it "the MINIMAL slice … deliberately NOT a learning engine." Registry **KL-18** already labels this *spec-ahead-of-code*. |
| The gap is **demonstrable**, not cosmetic | ✅ See §2 — a single explicit replacement into a historically-less-nudged family fails to persist. The contract is *violated*, not merely *weakly honored*. |
| Fix is the founder/advisory model (athlete owns structure; Hush automates nothing) | ✅ Stickiness durably encodes the **athlete's own** choice; Hush still never initiates/reverts a selection. No performance signal enters (ES-006 preserved). |
| Goal is **persistence of an existing primitive, not a new system** | ✅ No change to selection (`catalog.select`/`replace` argmax), composition, blend, decay, evidence, governor, or `kappa`. The only change is the **update rule** at the replace call-site (nudge → sticky-set). |
| No false "done" — sticky preference is the *pending* item DX-10 | ✅ This builds it; DX-13/15 docs and KL-18 already label it pending. |

**Truthfulness note carried into the build:** DX-10 **intentionally changes** the post-replace preference
values (chosen family is pinned to a sticky-dominant score; the displaced family is demoted), so exactly one
existing golden — `test_sprint3b1::test_replace_nudges_chosen_up_and_rejected_down` — **must be re-golded**.
This is a sanctioned, scoped behavior change (the same discipline as DX-03/M1) and **must be stated, not
hidden**, in the completion report: *"the ±5 nudge is replaced by a sticky-set; one preference golden was
re-baselined to the new contract."*

---

## 2. The contract failure, demonstrated (so the implementer fixes the right thing)

The bounded ±5 nudge is **symmetric and cumulative**, so the family that wins selection is the
**cumulatively-most-nudged** family — *not* the family the athlete most recently chose. These diverge, and
when they do, the spec's "the replacement persists" is violated. The existing golden makes the failure
concrete:

```
# State: bench_dumbbell historically at preference 88; bench_barbell at default 50.
# (replacement_group "horizontal_push" = { bench_press→family bench_barbell,
#                                           db_bench_press→family bench_dumbbell })

athlete EXPLICITLY replaces INTO bench_barbell  (current = db_bench_press, chosen = bench_press)
  nudge:  bench_barbell 50 → 55   (chosen, up)
          bench_dumbbell 88 → 83  (rejected, down)
  next composition argmax over {bench_barbell:55, bench_dumbbell:83} → bench_dumbbell  ✗

  ⇒ the athlete's just-chosen barbell does NOT become the slot's exercise going forward.
    The contract (Principle 6 / §6) is VIOLATED: a single bounded step cannot overcome
    historical accumulation, so "the replacement persists" is false.
```

A second, milder failure mode (erosion): even when one replacement *does* flip the argmax (e.g. both
families start at 50 → 55/45), the 10-point margin is **fragile** — any later opposing event erodes it, so
persistence is not durable. The fix must make the chosen exercise **deterministically and durably** the
slot's selection, independent of nudge history.

---

## 3. Decisions required before coding

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | **Persistence mechanism.** How is "sticky" stored? | **(a) Sticky-set within the existing `preference_state` table** — on an accepted replace, *set* the chosen family's `preference_score` to a sticky-dominant value and *demote* the displaced family below it, so the existing `argmax` selection deterministically returns the chosen exercise. **No schema change.** (b) New slot-level `preferred_exercise_id` column/table that selection consults first. | **(a)** — it is the truest *minimal* reading of Principle 6 (reuses the selection primitive, the table, and the writer), is **Small** as the Delta Plan rates DX-10, needs **no migration / no schema bump / no version re-gold**, and is fully reversible. (b) is architecturally "cleaner per-slot" but costs a migration + schema bump + `test_wave1` version re-gold + a new selection branch — **out of proportion** to a Small item; record it as the Phase-2/3 evolution if multi-family slots arrive. |
| **D2** | **Fate of the old `nudge` primitive + `PREFERENCE_NUDGE`.** | (a) **Keep** `nudge()` and the `PREFERENCE_NUDGE` constant as a retained-but-inactive pure helper (still covered by `test_nudge_clamps_to_bounds`; still registered in `sprint4/parameters.py`); switch only the production call-site to sticky. (b) **Retire** `nudge`/`PREFERENCE_NUDGE`, delete its direct test, and unregister it from the Sprint-4 parameter registry. | **(a)** — minimal blast radius and maximal reversibility. `PREFERENCE_NUDGE` is wired into `sprint4/parameters.py` (lines 49, 63) and its own golden; removing it widens the change into the parameter registry + Sprint-4 tests for no functional gain. Keep it as an inactive PROVISIONAL primitive (the same posture as other reviewed-kept params, KL-9); offer (b) only as an explicit, separately-reviewed cleanup. |
| **D3** | **Sticky-dominant value.** What score does the chosen family take? | (a) Pin to `PREFERENCE_SCORE_MAX` (100) via a named `PREFERENCE_STICKY` constant; demote the displaced family to `PREFERENCE_DEFAULT_SCORE` (50). (b) Relative: `max(group)+margin`, clamped. | **(a)** — deterministic, idempotent (re-choosing the same family re-sets 100 → 100, so **no ratchet**, preserving the SM3 no-double-nudge property *for free*), and trivially the unique argmax in the 2-family groups the 3B-1 catalog ships. (b) adds clamp/edge complexity for no v1 benefit (all replacement groups have exactly two families). Add `PREFERENCE_STICKY` as a single, named, Phase-0-tunable knob. |
| **D4** | **Calibration interaction.** Does stickiness fire during calibration? | (a) Selection still returns the **canonical** exercise during calibration (`catalog.select(..., calibrating=True)`), unchanged; the sticky preference is **recorded** but only *takes effect* in steady state. (b) Let sticky override calibration. | **(a)** — unchanged from today; calibration's clean-anchor requirement (ES-009 §6) outranks preference, and the athlete's choice still persists for steady state. **No change needed**; state it so it isn't mistaken for a regression. |

---

## 4. Blast-radius & invariant audit (PASS)

- **① core math untouched** — no change to blend, decay, confidence saturation, evidence weighting,
  recommendation, the decision governor, or `kappa`. DX-10 changes **only the preference-update rule** at the
  replace call-site and adds one constant + one pure helper.
- **Selection primitive untouched** — `catalog.select` / `catalog.replace` / `_argmax_by_preference` are
  **unchanged**; sticky works *through* the existing argmax by writing dominating scores, not by adding a new
  selection branch.
- **No schema / migration / version bump** — reuses the `preference_state` table (D1 = sticky-set);
  `preference_score` stays a `REAL` in `[0,100]`; **no `test_wave1` version re-gold.**
- **Single write path changes** — only `replace_exercise` swaps `nudge(...)` for the sticky-set; the sole
  preference writer (`StateRepository.write_preference_state`) and its upsert are reused unchanged.
- **ES-006 preserved** — replacement stays **preference-driven, never performance-driven**; no performance
  signal enters the sticky-set (the trigger is the explicit athlete action, exactly as before).
- **No-ratchet (SM3) preserved and strengthened** — the chosen≠current guard stays; sticky-set is
  **idempotent**, so re-selecting the same family cannot ratchet (cleaner than the nudge it replaces).
- **Hush-automates-nothing preserved** — stickiness encodes the **athlete's own** choice durably; Hush never
  initiates, reverts, or decays a selection (Product Spec §1/§6/§13).
- **Reversibility = revert the call-site** — restore the two `nudge(...)` writes and drop `PREFERENCE_STICKY`
  + the sticky helper; no data migration; already-written sticky `preference_state` rows remain legal scores
  the loop reads identically (a 100/50 row is just a preference value).

---

## 5. Go / No-Go

**GO — to implement now. The interpretation is LOCKED (§0); the gap is demonstrated (§2); nothing blocks
implementation.**

- **Approved to build immediately (D1=a, D2=a, D3=a, D4=a):** add `PREFERENCE_STICKY` to `constants.py`; add
  a pure `apply_sticky` (or `set_sticky`) helper to `preference.py`; switch `service.py::replace_exercise`
  from the two `nudge(...)` writes to **pin-chosen / demote-displaced**; re-gold the single affected
  preference golden; add the new sticky + persistence-durability tests. Additive except the one sanctioned
  re-gold; no schema; reversible.
- **Conditions on the build (acceptance gates, §8 of the package):**
  1. The chosen exercise is the **deterministic, durable** argmax of its replacement group after one replace
     — including the §2 demonstrated case (replace into a historically-less-nudged family **must** now
     persist).
  2. **Most-recent-replacement-wins** verified across two successive replaces in one slot.
  3. `test_replace_same_family_does_not_double_nudge` stays green (chosen==current ⇒ no write ⇒ no ratchet).
  4. Existing **165 → 165** with exactly **one** golden re-baselined (`test_replace_nudges_chosen_up_and_
     rejected_down`) and new tests added; `assemble_and_test.py` green; per-suite counts reported.
- **Not licensed:** any change to selection/composition/blend/decay/evidence/governor/`kappa`; a
  preference-**learning** curve, exploration, or decay of preference; letting Hush initiate or revert a
  selection; the slot-level-column design (D1-b) — defer to Phase 2/3 if multi-family slots ship.

**Governing-rule status:** this review licenses the bounded *persistence* behavior change for athlete-
initiated replacements, exactly as DX-10 scopes it. No redesign; the model's equations are unchanged; the
change closes a contradiction the spec already mandates.

---

*Readiness review only. Confirms scope/truthfulness against `HUSH_V1_PRODUCT_SPECIFICATION.md` (Principle 6;
§6; §13; §"ownership") and the founder constraint, demonstrates the bounded-nudge contract failure, and gates
the build on the §5/§8 acceptance set. Pairs with `DX-10_EXECUTION_PACKAGE.md`. Trace: Delta Plan DX-10;
Open-Items KL-18; ES-006 / ES-007 / ES-009 §6; Product Spec §2/§6/§13.*
