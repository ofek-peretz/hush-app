# M1_MIGRATION_READINESS_REVIEW.md — the input-contract flip + learned-capability program construction

> **Purpose:** confirm the **M1 migration is fully understood before implementation begins.** This is a
> readiness review, **not** an execution package — it prescribes no edits or diffs. It states exactly what M1
> changes, what it implies for the learning path / evidence / trajectory / confidence, the cleanest
> implementation approach for the now-confirmed program-construction behavior, and the validation, rollback,
> and risk posture. The execution package is produced separately, after this review is accepted.
>
> **Scope (the M1 bundle):** **DX-01, DX-02, DX-05, DX-06, DX-19**, plus the **newly-clarified
> program-construction change (proposed DX-20, §6)** that this review surfaces and the model owner has now
> confirmed is in-scope for M1. The *server endpoint* portion (**DX-11**, set-report endpoint +
> `session_progress` accumulator) remains **P1 / Sprint 5** and out of this bundle (§12).
>
> **Confirmed model-owner assumption (governs this review):**
> *Recommendations are advisory; actual performance is truth; future programs are built from learned reality.*
> Concretely: (a) a session stays frozen once composed; (b) no mid-session auto-ratcheting; (c) no automatic
> load progression during execution; **(d) between sessions — and especially at future program construction —
> learned capability must drive the recommended load.** Future programs must **not** be anchored to historical
> recommendation values once those no longer reflect demonstrated capability.
>
> **Baseline:** Sprint 0–4 ✅ + Wave 1 ✅ + **DX-07 ✅ + DX-04 ✅ + DX-03 ✅** · Schema **v7** · **134/134**
> passing · all isolated P0 work closed. Date: 2026-06-11. Governing rule: *no redesign without explicit
> model review* — this review IS that model review for the §6 change. Trace: Gap Review M1/M2; Delta Plan
> DX-01/02/05/06/19; `F1_CLARIFICATION_REPORT.md` (reversed by DX-06).

---

## 0. Verdict

**M1 is understood and ready to package**, now with the program-construction behavior resolved (§5–§6). M1
has two layers, both bounded:

- **Layer 1 — learning input (DX-01/02):** the athlete's logged `actual_weight` becomes a learning input, so
  the **capability score becomes truthful to the real load.** Plumbing + one quality-weight recompute. No ①
  core-math change.
- **Layer 2 — program construction (DX-20, §6):** future session composition derives the recommended load
  from the **learned score** (the score-derived `target_load`), not from the frozen historical anchor
  (`last_recommended_weight`). This is what makes Layer 1 reach the product. It is a **deliberate behavior
  change** to the composition load source, with a real multi-session re-gold (§8/§10).

The two layers are inseparable: Layer 1 without Layer 2 learns reality but never acts on it; Layer 2 without
Layer 1 has no truthful score to build from.

**One packaging decision remains (§11):** the **shape** of the `perform`-callback contract change (the
athlete weight must reach the pipeline; today the callback returns reps only). It is a code-shape choice, not
a model question. The previously-open *anchor-tracking* question is now **resolved** by the confirmed
assumption and specified in §6.

---

## 1. Why M1 exists now (the dependency context that makes it load-bearing)

After the two P0 demotions already shipped, M1 is the **only** path by which real-world performance can move
the program:

- **DX-03 (done)** demoted the ES-006 governor to **advisory**: every governed branch returns the **HELD**
  load (`decision.py:133/136/139/141`), and `recommendation.py:97` emits it. The model no longer steps load
  up on its own.
- **DX-04 (done)** turned exploration off.
- So `recommend()` short-circuits to `held_load` once decision memory exists, and `held_load` is re-persisted
  from itself (`pipeline.py:92`) — a self-perpetuating freeze pinned at the cold-start working set.

The code already anticipates the fix: *"progression is the athlete's logged actual_weight (M1/DX-01)"*
(`decision.py:12-13, 124`; `recommendation.py:88`). DX-03 correctly removed **automatic load authority during
execution**; it was **never intended to freeze future program evolution.** The freeze is collateral, because
composition and execution share the one `recommend()` short-circuit (§5). M1 — Layer 1 *and* Layer 2 —
removes that collateral while preserving DX-03's intent.

---

## 2. Exact learning-path changes (Layer 1: DX-01/02)

The chain is `recommend → perform → observe → attribute (evidence) → state update` (`pipeline.py`). Layer 1
changes exactly two nodes.

### DX-01 — stop overwriting `actual_weight`

| Site | File:line | Current |
|---|---|---|
| rested — set_record | `pipeline.py:154` | `actual_weight=rec.recommended_weight` |
| rested — Observation | `pipeline.py:160` | `actual_weight=rec.recommended_weight` |
| fatigue-aware — set_record | `pipeline.py:319` | `actual_weight=rec.recommended_weight` |
| fatigue-aware — Observation | `pipeline.py:325` | `actual_weight=rec.recommended_weight` |
| (also) orchestrator | `loop/orchestrator.py:77,127` | `actual_weight=rec.recommended_weight` |

Route the **athlete-logged** weight into these sites. The evidence engine already consumes
`obs.actual_weight` (`evidence.py:60`: `effective_load = obs.actual_weight * w_c`) — **no math change**; the
consumer was simply fed a constant.

### DX-02 — `prediction_error` / quality at the **actual** load

Today `prediction_error = actual_reps − rec.predicted_reps_to_failure` (`pipeline.py:162,327`), with
`rec.predicted_reps_to_failure` computed at the **recommended** load. Once `actual_weight ≠
recommended_weight`, that compares reps-at-actual against a prediction-at-recommended — an apples-to-oranges
error feeding `quality = (pred_conf/100) · error_class_weight(|prediction_error|)` (`evidence.py:50`). DX-02
recomputes the prediction at the **actual** load (`predict_reps_to_failure(..., actual_weight,
fatigue=total_fatigue)`; the function already exists, `prediction.py:30`) and forms the error against that.

**Why DX-02 is not optional.** The realistic deviation is *load heavier → fewer reps*. Without DX-02 the
prediction (at the lighter recommended load) over-predicts → large `|error|` → `error_class_weight` → **0.3
("poor")** → the most informative observation is down-weighted to near zero. With DX-02 the error is small →
quality **1.0** → the signal is trusted. **DX-01 without DX-02 is self-defeating.** They ship together.

---

## 3. Observation-construction changes

- **`Observation` entity unchanged**; `actual_weight`/`prediction_error` are existing fields
  (`domain.py:171,174`); schema stores both weights (`schema.py:138`). **No migration — M1 stays at v7.**
- **The one structural change is the `perform` callback.** Today `perform(rec) → actual_reps: int`
  (`pipeline.py:114,149,258,314`; `session.py:57`) — reps only, no weight parameter. The athlete weight must
  arrive through this seam; shape is the §11 decision. The ripple reaches every caller (`session.py:95`,
  `orchestrator.py`, `sim/harness.py:110`, `sim/synthetic_athlete.py:56`, all `truth.perform` call-sites).
- **Default-to-recommended preserves the byte-for-byte baseline** for the Layer-1 no-deviation case (§8).
- **A9 override semantics shift from "log, ignore" to "log AND learn."** Today a deviation is logged as an A9
  LOAD override and never learned (`test_sprint4.py:153-156` hand-builds exactly this and asserts only
  reconstructability). Post-M1 it is both audited and consumed. (A9 re-annotation is DX-16, downstream.)

---

## 4. Evidence implications

- **`s_obs` moves with the real load** (`effective_load = actual_weight · w_c` → `rm1_from` → `score_of`): a
  heavier honest load yields a higher observed-capability score — the intended signal.
- **`quality` / `weight` are protected by DX-02** so honest deviations keep full influence in the blend and
  full credit toward `sum_w` (→ confidence, §7).
- **Multi-capability split unaffected in form** (load-space split scales `effective_load` by `w_c`, each
  capability converts at its own anchor; ES-010 A.5).
- **De-fatigue ordering untouched** (`defatigue_reps` in rep space first; ES-011 C.3) — M1 changes the *load*
  fed to conversion, not the order.
- **Fatigue-generation ripple to flag (DX-02-adjacent).** `set_fatigue(effective_load=rec.recommended_weight,
  …)` (`pipeline.py:362`) still costs fatigue at the *recommended* load. Under M1 the athlete lifted
  `actual_weight`, so the set's true cost is at the actual load. The execution package must decide whether
  `set_fatigue` takes `actual_weight` (consistent with M1) — recommended — or stays at the recommended load.
  Bit-for-bit-preserving when `actual == recommended`; flagged so it is not missed.

---

## 5. Capability-trajectory implications — and the resolved freeze

- **Score becomes truthful.** Pre-M1 it asymptotes to capability-at-the-held-load; post-M1 it tracks
  capability-at-the-load-actually-lifted. A progressing athlete's score now **rises** where it flat-lined.
- **The freeze is real and is the thing Layer 2 removes.** `recommend()` is the single load authority, called
  at **composition** (`session.py:81`, future program) *and* **per set** (`pipeline.py:136,297`, execution).
  Once decision memory exists, both emit `held_load`, and `_record_block_decision` re-persists
  `last_recommended_weight = recommended_weight` (the held value, `pipeline.py:92`). So **both lifecycle
  contexts are pinned to a historical recommendation value** — score and `target_load` climb, the emitted and
  composed loads do not. This is the exact contradiction the confirmed assumption forbids.
- **Resolution (confirmed):** future composition must derive load from the **learned score**, while the
  session stays frozen once composed and execution never ratchets. Specified in §6.
- **No-deviation, single-session Layer-1 trajectories are unchanged**; the visible behavior change is the
  multi-session program load, which is the point (§8/§10).

---

## 6. Future-program construction — the learned-capability composition approach (DX-20)

**Principle:** the **score IS learned reality** — it is the precision-weighted, variance-damped,
decay-aware blend of all evidence from `actual_weight + actual_reps` across sets and sessions. "Build the
program from learned reality" therefore means: **derive the composed load from the score**, not from a frozen
historical recommendation. The held anchor was an *in-session per-recommendation* stability device; it has no
business authoring the *next program*.

**The cleanest implementation — split load authority by lifecycle, not by duplication:**

1. **Composition (future program) = score-derived `target_load`.** At `session.py` composition, the block
   load is the score-derived working load already computed in `recommend()` (`recommendation.py:72-74`:
   `target_load = floor(load_for_reps(target+RIR, exercise_rm1(score)) · safety_discount(conf))`). This is
   the **only** place a new load is authored, and it reflects accumulated evidence. The governed `held_load`
   branch is **no longer the composition load source.**
2. **The composed load is frozen for the session.** The per-set learning chain must consume the **block's
   composed load**, not re-derive a per-set load (the score updates each set, so a re-derivation would drift
   mid-session and break the frozen-session invariant, API_CONTRACT §0.3). Under M1 the per-set
   re-derivation is largely vestigial anyway: `actual_weight` now comes from the athlete (DX-01) and the
   prediction is recomputed at the actual load (DX-02), so the recompute's only remaining job — producing
   `recommended_weight` — should simply *be* the frozen composed load.
3. **No mid-session ratchet, no execution-time progression.** Because the load is fixed at composition and
   the per-set chain reads it, nothing moves the load during the session. DX-03's intent is fully preserved.
4. **The advisory governor (DX-03) stays, repurposed to the right cadence.** It still computes and records
   KEEP / INCREASE / DECREASE — now as a **session-over-session** lean (this composition's `target_load` vs
   the previous composed load, retained in `last_recommended_weight` as audit memory). It feeds the "why"
   view and M5 (DX-09); it never authors the load.

**Why this is safe — stability without a frozen anchor.** The held anchor existed to avoid "chasing sub-step
wiggle" (ES-006). That role is already covered without it: (a) `target_load` is **plate-floored**, so
sub-plate score wiggle cannot move the prescribed load; (b) the score is a **variance-damped, confidence-
weighted blend**, so it does not lurch on a single set; (c) the **`safety_discount`** keeps early
(low-confidence) programs conservative and **auto-removes as confidence rises** (`recommendation.py:50-51`).
So composition-from-score is both responsive to learned reality and inherently stable — which is precisely
"recommendations are advisory, built from learned reality."

**Trajectory shape this produces (the intended loop):** athlete demonstrates 90 kg → evidence (DX-01/02) →
score rises → next composition's `target_load` rises toward 90 (confidence-gated) → next program is built at
the learned load → athlete demonstrates the next reality → … Athlete-led progression, *reflected* by the
system, never *imposed* during a session.

**Mediation is via the score, NOT the raw `actual_weight` (binding).** DX-20 re-anchors composition to the
**score-derived `target_load`** — `target_load` is computed only from `state.score`
(`recommendation.py:72-74`, via `reference_strength(score)`) and never reads `actual_weight` directly. The
athlete's `actual_weight` reaches the program **exclusively** through `evidence → blend → score → target_load`.
The implementation path is:

> `actual_weight → evidence (s_obs) → precision-weighted blend → score → target_load → future program`
> — **never** `actual_weight → future program`.

So a single heavy `actual_weight` moves the score only **partially** (variance-damped, decay-weighted blend)
and `target_load` is further **confidence-gated** (`safety_discount`): the program tracks *accumulated learned
capability*, not the most recent set. This is the approved philosophy — *actual performance → evidence →
score → target load → future program.*

**`last_recommended_weight` is retired as a load source.** It remains only as audit memory (the previous
composed load) feeding the advisory session-over-session lean. It must never override the score-derived
composition load — that is exactly the "anchored to a stale historical value" failure the owner ruled out.

> **Registry note:** this program-construction change is not an existing Delta-Plan ID. The review proposes
> tracking it as **DX-20 ("composition load from learned capability")**, bundled with M1. Confirm the ID at
> packaging; the behavior is owner-confirmed.

---

## 7. Confidence implications

- **DX-02 protects confidence growth on deviation sets.** Because `weight ∝ quality ∝
  error_class_weight(|err|)`, the un-fixed path would feed deviations at quality 0.3, starving `sum_w` and
  stalling confidence. DX-02 lets the deviation set contribute full weight → confidence rises normally.
- **Confidence directly gates Layer 2.** `target_load` is scaled by `safety_discount(confidence)`. So a
  newly-demonstrated heavier load raises the *score* immediately but the *composed* load only as confidence
  in that new reality accrues — the program advances at the rate the evidence justifies. This is the built-in
  guard against over-reacting to one heavy session, and it is why §6 needs **no** extra "consistency" rule.
- **Variance/agreement (fatigue-aware path) see the corrected `s_obs`/`weight`** (`pipeline.py:349-356`),
  so the agreement signal M5 (DX-09) will read becomes trustworthy — another reason M1 precedes M5.
- **No-deviation case:** quality, weight, moments, confidence curve all byte-identical.

---

## 8. Validation strategy

Two-layer contract: **Layer 1 is bit-for-bit where nothing deviated; Layer 2 is an intended multi-session
re-gold.**

1. **Baseline pin.** `python build/_verify/assemble_and_test.py` → **134/134** before any edit (edits go to
   `implementation/` source; the assembler regenerates `build/_assembled/`).
2. **Layer-1 no-deviation invariance.** With the synthetic athlete loading exactly the recommended weight,
   the *learning* numbers (s_obs, quality, prediction_error, blend, confidence) must be unchanged for any
   single-session/cold-start trajectory. Movement here = the default learning path was not preserved →
   stop-the-line.
3. **Layer-1 deviation coverage (DX-19).** New tests driving `actual_weight ≠ recommended_weight`: (a)
   `effective_load`/`s_obs` reflect the actual weight; (b) `prediction_error` formed at the actual load
   (DX-02); (c) heavier-load-fewer-reps yields an **upward** `s_obs` at **full** quality; (d) the A9 override
   row is written **and** the chain learns.
4. **Layer-2 program-evolution coverage (DX-20).** New multi-session tests: across sessions where the score
   rose, the **composed** block load rises toward the score-derived `target_load` (confidence-gated); the
   **in-session** load is constant across a block's sets (frozen); a regression lowers the next program;
   the advisory lean is recorded but never authors the load.
5. **Intended re-gold (NOT silent).** Multi-session goldens and the direct governor tests that currently
   assert held-load emission **will change** and must be re-golded *with the new expected behavior stated*:
   - `test_sprint3b2.py:319-320` (two-session run) — session 2+ load now tracks the score.
   - `test_sprint3a.py:149-153` — `recommend()` with decision memory now emits `target_load`, so the
     `rec.target_load > rec.recommended_weight` assertion (held < target) inverts to `==`.
   - any Phase-0 multi-session golden whose score moved.
   Single-session/cold-start goldens **must not** move; if they do, treat as #2.

**Acceptance bar:** Layer-1 learning numbers unchanged on no-deviation paths · Layer-1 deviation suite green ·
Layer-2 program-evolution suite green · only the intended multi-session/governor goldens re-golded, each with
its new expectation documented.

---

## 9. Rollback strategy

- **No schema, no migration (either layer)** — stays v7; rollback is code-only.
- **Layer 1** reverts by restoring `actual_weight=rec.recommended_weight` at the four sites, dropping the
  DX-02 recompute, and restoring the reps-only `perform` signature.
- **Layer 2 (DX-20)** reverts by restoring composition to emit `held_load` and the per-set re-derivation.
- **Data is non-destructive to roll back:** observations with a real `actual_weight` remain valid rows;
  learned state can be kept or replay-rebuilt from the deterministic event stream.
- **All-or-nothing across the bundle (binding).** DX-01/02/20/05/06 share the reps-only→actual_weight root;
  partial application is internally contradictory (e.g., reverting Layer 1 while Layer 2 composes from a now-
  fictional score, or reverting DX-02 while DX-01 feeds heavy deviations at quality 0.3). Roll back the
  model bundle as a unit.

---

## 10. Migration risks

| # | Risk | Severity | Mitigation / status |
|---|---|---|---|
| R1 | DX-01 without DX-02 → deviations down-weighted to 0.3 (§2). | High | Bundle DX-01+DX-02; deviation test (c) fails loudly otherwise. |
| R2 | `perform` change missed at a caller → silent partial flip. | High | Enumerate callers (§3); a *consistent* miss won't trip the invariance suite, so each entry path needs an explicit deviation test. |
| R3 | **Per-set re-derivation not frozen** → composed load (score) and learned-from load drift apart within a session, breaking the frozen-session invariant (§6.2). | High | The per-set chain must consume the block's composed load; Layer-2 test #4 (constant in-session load) is the guard. |
| R4 | Fatigue still costed at recommended load while learning at actual (§4 ripple). | Med | Execution package decides `set_fatigue` load source; covered by a fatigue-aware deviation test. |
| R5 | DX-02 recompute built rested while `rec.predicted` was fatigue-adjusted. | Med | Recompute must pass `fatigue=total_fatigue`. |
| R6 | **Over-reacting to one heavy session** (program jumps on a single demonstration). | Med | Inherent guard: `safety_discount(confidence)` gates `target_load` (§7) — the program advances only as fast as confidence in the new reality accrues. No extra rule needed; covered by Layer-2 confidence-gating test. |
| R7 | Over-re-golding masks an accidental Layer-1 change. | Med | §8 #2/#5: single-session goldens may not move; only multi-session/governor goldens re-gold, each with a stated new expectation. |
| R8 | Partial rollback leaves the system contradictory (§9). | Med | All-or-nothing bundle rule. |
| R9 | A9 / spec wording still calls `actual_weight` inert. | Low | DX-05/06/16/18 doc work, downstream. |
| R10 | Scope creep into DX-11 (live endpoint). | Low | Explicitly P1/Sprint 5 (§12). |

---

## 11. Decision to confirm before packaging (the one remaining)

**`perform` contract shape.** Widen the callback to return `(actual_weight, actual_reps)`, or add an
`actual_weight` parameter to `report_set*`? Both preserve the default-to-recommended baseline; this is a
code-shape choice. *Recommendation:* widen the callback — it keeps the athlete's inputs in one place and
mirrors the real device set-report payload (forward-compatible with DX-11).

The previously-open **anchor-tracking** question is **resolved**: future composition derives load from the
learned score (§6); the session stays frozen and execution never ratchets. No further model question is open.

---

## 12. Scope boundary

- **In M1 (this bundle):** DX-01, DX-02 (Layer 1) · **DX-20** (Layer 2, §6) · DX-05/06 (contract + F1
  reversal) · DX-19 (tests + re-gold).
- **Out — DX-11** (set endpoint + `session_progress` accumulator): P1/Sprint 5, the runtime half. M1 ends at
  the in-process pipeline + composition; the contract (DX-05) merely *declares* `actual_weight` required so
  DX-11 has a spec.
- **Out — DX-09 (M5 stagnation):** depends on M1; its own Large item.
- **Out — DX-13/16/18:** spec/assumption/wording re-annotations that follow M1; documentation.
- **① core math untouched.** M1 is plumbing + one recompute + a composition load-source change + a contract/F1
  reversal + a re-gold. The capability math, blend, decay, confidence/variance, `state_update`, the evidence
  *consumer*, catalog, and volume engine are not modified.

---

## 13. Readiness checklist

- [x] Exact learning-path change identified (4 DX-01 sites + DX-02 recompute) — §2.
- [x] Observation-construction change identified (no schema/migration; `perform` seam) — §3.
- [x] Evidence implications traced, incl. fatigue-load ripple — §4.
- [x] Trajectory implications traced; the held-anchor freeze diagnosed — §5.
- [x] **Future-program-construction behavior confirmed and implementation approach specified (DX-20)** — §6.
- [x] Confidence implications traced (DX-02 protects growth; `safety_discount` gates Layer 2) — §7.
- [x] Validation strategy defined (Layer-1 invariance + Layer-1/2 deviation & evolution suites + bounded re-gold) — §8.
- [x] Rollback strategy defined (code-only, no migration, all-or-nothing) — §9.
- [x] Risks enumerated with mitigations — §10.
- [x] Anchor-tracking question resolved by owner-confirmed assumption — §6/§11.
- [ ] **One packaging decision: `perform` contract shape** — §11. *Owner action; recommendation given.*

**M1 is fully understood and ready to package.** The single remaining item is the `perform`-callback shape
(§11); the model behavior is fully specified across both layers.

---

*Readiness review only — no edits, no diffs, no execution package. This review IS the model review licensing
the §6 (DX-20) composition load-source change, per the standing rule. Reverses the
`F1_CLARIFICATION_REPORT.md` reps-only conclusion (DX-06). Traceability:
`HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-01/02/05/06/19) · Gap Review M1/M2 · `pipeline.py` · `session.py` ·
`evidence.py` · `prediction.py` · `recommendation.py` · `decision.py` · `domain.py` · `synthetic_athlete.py`
· `API_CONTRACT_V1.md §0.5/§7.1` · `F1_CLARIFICATION_REPORT.md` (superseded).*
