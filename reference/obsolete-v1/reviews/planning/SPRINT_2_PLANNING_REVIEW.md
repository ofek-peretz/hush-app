# Sprint 2 Planning Review — Fatigue & Recovery Engine (ES-011)

> Planning and readiness review for Sprint 2. Produced before any Sprint 2 code is written.
> It does **not** redesign the frozen model; it plans the faithful implementation of ES-011
> and reconciles the as-built sprint sequence with the canonical roadmap. Every scope claim
> traces to a frozen spec — see `docs/canonical/HUSH_V1_SPEC_MANIFEST.md` and
> `HUSH_V1_TRACEABILITY.md`. Governing rule (CURRENT_STATUS): *no redesign without explicit
> model review.*

Date: 2026-06-09
Status of model: Hush v1 (frozen)
Status of build: Sprint 0 complete, Sprint 1 complete (19 tests passing)
Proposed Sprint 2: **ES-011 Fatigue & Recovery Model**

---

## 1. Where we are

| | Canonical roadmap (`HUSH_V1_EXECUTION_CONTEXT.md` §5) | What actually shipped |
|---|---|---|
| Sprint 0 | Pure model loop + synthetic athlete + e2e | ✅ Done — matches |
| Sprint 1 | **Fatigue & full prediction** (ES-011 + ES-010 Part C) | ⚠️ Shipped **Persistence/Hierarchy/Pipeline** instead (the roadmap's *Sprint 3*) |
| Sprint 2 | Decision hierarchy & session assembly (ES-006/009/009.1) | — (planned next per this review) |
| Sprint 3 | Persistence & service | ✅ Already delivered in actual Sprint 1 |

**Finding.** The team pulled persistence forward (delivered as Sprint 1) and deferred the
fatigue work the canonical roadmap had placed first. `CURRENT_STATUS.md` and `README.md.md`
now both name **Sprint 2 = ES-011 Fatigue Engine**, i.e. returning to the deferred fatigue
work under a new number.

**This is a sequence change, not a model change**, and it is defensible: persistence was
low-complexity, unblocked the audit chain early, and the Sprint 1 pipeline already wraps the
pure functions verbatim, so inserting fatigue into a persisted pipeline is cleaner than
retrofitting persistence around an already-fatigue-aware loop. **Recommendation: accept the
re-sequence, and record it** — update `HUSH_V1_EXECUTION_CONTEXT.md` §5 so the canonical
roadmap stops contradicting the as-built history (otherwise a fresh implementer reading the
canonical doc will believe fatigue shipped in Sprint 1).

---

## 2. Sprint 2 objective

Implement **ES-011 Fatigue & Recovery** as the explicit latent state between true capability
and observed performance, so the learning loop stops crediting recovery state to capability
change (Principle #59: `observed = capability − fatigue`). This is the single most
consequential correction to the model built so far: until now every observation has been
treated as a clean capability readout, and ES-011 *retroactively changes what every prior
observation meant.*

ES-011 is, by its own declaration, an **amending spec**. Sprint 2 must implement both
amendments deliberately (they are not redesigns — they are frozen corrections):

- **Amends ES-005.1 §4** — `effort_offset` is redefined as the *stable* component of a joint
  correction `correction(t) = effort_offset + Fatigue_c(t)`; fatigue is the time-varying part.
- **Amends ES-010 Part A ordering** — fatigue is removed **in rep/load space, before the
  ES-005.1 conversion, therefore before attribution**. ES-010's attribution-first ordering is
  overruled for fatigued observations.

The second amendment is the highest-impact code change in the sprint: it reorders the live
pipeline in `pipeline.py` / `evidence.py`.

---

## 3. Scope

### In scope (ES-011 Parts A–E)

1. **Fatigue state** (ES-011 A.3) — new mutable projection:
   - Per athlete: `Fatigue_systemic` (scalar, score units), `last_workout_at`.
   - Per capability: `Fatigue_capability,c`, `last_trained_at,c`.
   - **No** `recovery_score` stored — recovery is *derived* from time + accumulated fatigue
     (A.3 forbids the double-representation error).
2. **Set → fatigue generation** (ES-011 A.4):
   `set_fatigue = κ · relative_load · reps · proximity_to_failure · exercise_cost`,
   split to capabilities by the **same ES-010 `w_c`** used for load attribution (one split
   rule, two uses — load credit and fatigue cost).
3. **Accumulation** (A.5) — additive within and across sessions, before decay.
4. **Decay / recovery** (Part D) — exponential return to zero with `τ_sys` and `τ_cap,c`.
   **Ship FIXED population τ. Do NOT enable per-athlete τ learning** (ES-011 final note; A6;
   Validation Architecture A6 verdict). Per-athlete τ is the single riskiest learning in the
   system and is unidentifiable at MVP N.
5. **De-fatigue ordering in the pipeline** (Part C.3) — the mandatory reorder; see §4.
6. **Fatigue-adjusted prediction** (Part B.1) — Prediction Engine predicts from
   `observed_capability = score − Fatigue_c(t)`, not from `score` alone.
7. **Fatigue-aware recommendation** (Part B.2/B.3) — veto on `INCREASE_LOAD` while fatigue
   elevated; reduction order **reps → sets → weight** (Principle #56, load touched last);
   decision-reason codes `fatigue_hold`, `recovered_progression`, `unexplained_regression`.
8. **Surprise discrimination** (Part C.1) — `surprise = S_obs_raw − (score − est_Fatigue_c)`:
   underperformance with high estimated fatigue → learn nothing; with low fatigue → genuine
   negative capability evidence.
9. **Audit** (Part E) — every recommendation stores the fatigue/recovery state it assumed
   (`Fatigue_systemic`, `Fatigue_capability,c`, τ used, elapsed time, add-back amount); the
   chain answers *"worse today, but why did the score not move?"*. New audit columns + reason
   codes persisted (extends Sprint 1 `state_update_log` / `recommendation`).
10. **Simulation harness extension** — synthetic athlete gains injected fatigue + recovery so
    the loop can be exercised under fatigue (see §6). First-class deliverable per Build Plan §7.

### Out of scope (explicitly deferred, stubbed at clean boundaries)

- **Session composition recovery gate** (ES-009 §B.1) and **fatigue ceiling replacing
  `MAX_SESSION_SETS`** (ES-009.1 → ES-011 B.1): ES-009 / ES-009.1 are **not built yet**, so
  these interactions are stubbed. Fatigue *generation/decay/de-fatigue/prediction* do not
  depend on them. Flag forward-reference.
- **`CHANGE_STRATEGY` on chronic systemic fatigue** (B.3): the decision exists, but
  strategy-change is licensed only by a completed investigation (ES-013, not built). Sprint 2
  emits the *signal/flag*; it does not act on it.
- **Per-athlete τ learning** (D.3) — deferred to Phase 3 (decision above).
- **`effort_offset` identification** (C.4 / A5) — see §7; ship `effort_offset = 0` (fully
  rested floor) and flag every fatigue/effort-dependent conclusion as un-separated.

### Scope decision to ratify (recommend bundling)

**Variance-suppressed confidence (ES-010 Part C)** is currently deferred (Sprint 0/1 README:
"clean loop has no conflict"). But ES-011 **B.4 + Contradiction 4** assert that removing
fatigue *before* the variance computation stabilizes confidence for hard-training athletes —
a claim that is *vacuous until the variance term exists*. The canonical roadmap bundled
fatigue and variance-suppressed confidence into one sprint for exactly this reason.

**Recommendation: include ES-010 Part C in Sprint 2.** It is one multiplicative term
(`agreement = 1 − min(σ²_recent/σ²_ref, 1)`; `c_cap = 100·(1−e^{−Σw/8})·agreement`) plus a
decayed running variance of recent `S_obs`, and Sprint 2 is the first sprint where the
ordering guarantee that protects it (de-fatigue before variance) actually matters. If the
team prefers to keep Sprint 2 minimal, the alternative is to explicitly note that B.4's
stabilization benefit is **not realized** until a later sprint. Pick one and write it down.

---

## 4. The critical change: pipeline reordering (ES-011 C.3)

Today's live pipeline (`implementation/sprint1/pipeline.py`) and pure loop
(`orchestrator.py`) run, per set: `recommend → perform → observe → attribute (evidence) →
state update`. Attribution (`evidence.py`) currently converts the *raw* observed reps
straight through Epley⁻¹ → `ln/k`.

ES-011 C.3 mandates a new ordering for fatigued observations:

```
Observation (raw: actual_weight, actual_reps)
  → estimate Fatigue_c(t) from stored state + elapsed time (Part D)
  → de-fatigue: lift actual_reps to fatigue-free equivalent      [REP SPACE]
  → ES-005.1 conversion: RM1_obs, S_obs_clean per capability     [load→score]
  → ES-010 attribution: split by w_c                             [score space]
  → Evidence → blend
```

Why before conversion and before attribution (C.3, verbatim rationale):
- Fatigue suppresses **reps**; the `ln` conversion is non-linear. Removing fatigue *after*
  the `ln` is position-dependent and unstable. Removing it in rep space keeps the correction
  linear and physical.
- De-fatigued reps feed **all** mapped capabilities; de-fatiguing after the `w_c` split would
  require re-deriving fatigue in each capability's score space after mixing.

**Implementation note.** `evidence.observation_to_evidence` and the pipeline must accept an
estimated-fatigue input and apply the rep-space correction *before* `rm1_from(...)`. This is
a real interface change to two Sprint-0 functions that Sprint 1 reuses verbatim — touching
them is sanctioned because it implements a frozen amendment, but it must keep the Sprint 0
fully-rested path bit-identical when `Fatigue_c ≈ 0` (see §8 regression invariant).

---

## 5. State & schema additions

Extends the Sprint 1 schema (`implementation/sprint1/schema.py`) — **additive only**, no
rewrite of existing tables:

- **Mutable state:** `Fatigue_systemic` + `last_workout_at` on `athlete_state`;
  `fatigue` + `last_trained_at_week` already-partial on `capability_state` (a `fatigue`
  column is new; `last_trained_at_week` exists). Confirm O(1) update discipline.
- **History / audit:** fatigue snapshot fields on `recommendation` and `state_update_log`
  (estimated `Fatigue_systemic`, `Fatigue_capability,c`, τ used, elapsed, add-back), plus the
  new `decision_reason` codes. Stamp `model_version` as today.
- **Single-writer invariant preserved:** only `StateRepository` writes fatigue state, same as
  capability state (ES-007; Build Plan §5 StateWriter chokepoint).

`domain.py` gains the fatigue fields on `CapabilityState` / `AthleteState` (mutable) and the
audit fields on the frozen history objects.

---

## 6. Simulation harness extension (first-class deliverable)

The current synthetic athlete (`sim/synthetic_athlete.py`) generates **fully-rested** reps
from true capability. Sprint 2 cannot validate fatigue without a synthetic athlete that
*gets tired and recovers*. Per Build Plan §7, this is a first-class deliverable, not a test
fixture, and it carries a hard constraint:

> **Do not generate observations with the same equations you are testing.** The synthetic
> athlete's fatigue/recovery generator must be *plausible but independent* of ES-011's `κ`,
> `τ`, and decay form, or the test is circular and proves nothing.

Required sanity scenarios (Build Plan §7 / Validation Architecture Phase 0):
- Constant true capability, varied rest intervals → inferred score stays **flat and stable**
  (no fatigue leaking into score) — this is the A1/A2 offline signal.
- Genuinely improving athlete → rising inferred score despite fatigue noise.
- Heavily fatigued session → suppressed-then-recovered observed performance; **surprise ≈ 0**
  and **no negative capability evidence** when fatigue is high (Part C.1, E.2).

---

## 7. Parameters, dependencies, and known gaps

### κ and τ are un-anchored free parameters

Unlike `A_c`/`k` (anchored by ES-008 v2 landmarks), **`κ` (set→fatigue scaling) and the `τ`
half-lives have no external anchor** (ES-011 final note). Until calibrated against trial
data, *the entire fatigue correction is directional, not calibrated.* Consequences for
Sprint 2:

- Ship **population-default** `κ`, `τ_sys`, `τ_cap,c` as named constants in `constants.py`
  (single source of truth), explicitly labelled provisional/uncalibrated.
- The **only** principled place to set them before they touch a person is the Phase 0
  simulation harness (Validation Architecture Phase 0; Build Plan §10). Sprint 2 should
  produce *defaults from simulation sweeps*, not guesses — this connects Sprint 2 directly to
  the Phase 0 gate, which the as-built sequence has not yet reached.
- Mirror the discipline ES-011 recommends for `σ²_ref`: freeze before trusting.

### `effort_offset` (ES-005.1 §4 / ES-011 C.4 / A5)

`effort_offset` is **not implemented** in Sprint 0/1 (absent from `constants.py` /
`recommendation.py`). ES-011 C.4 makes the correction *joint*: `correction = effort_offset +
Fatigue_c`. But identifying the two requires an effort anchor (RIR/proximity-to-failure)
**which the product refuses to collect** (Anti-Requirement; A5 verdict: *cannot test*).
Decision for Sprint 2: set `effort_offset = 0` (the fully-rested floor) so fatigue is the
sole correction, and **flag every fatigue/effort-dependent conclusion as un-separated** per
Invariant 7. Do not invent an effort signal. `proximity_to_failure` in A.4 is computed from
the prescribed RIR machinery already in `recommendation.py` (`DEFAULT_RIR`), not from a
collected RIR.

### Assumptions this sprint is load-bearing on

| ID | Assumption | Sprint 2 obligation |
|---|---|---|
| A1 | Capability recoverable from confounded observations | Record what could not be excluded (Inv. 7); fresh-state-probe support is later, but de-fatigue logic must not *claim* certainty. |
| A5 | effort/fatigue separable | **Cannot test** (no RIR). Ship `effort_offset=0`; flag conclusions. |
| A6 | per-athlete τ learnable | **Ship fixed τ.** Do not enable D.3 learning. |
| A2 | coupled loop converges | Only reachable offline → the harness extension (§6) is mandatory, not optional. |

---

## 8. Test plan / new verified invariants

Extends `test_sprint0.py` (12) + Sprint 1 (7). Sprint 2 must add at least:

1. **Rested-path regression (non-negotiable):** with `Fatigue_c = 0`, the fatigue-aware
   pipeline reproduces the Sprint 0 / Sprint 1 score trajectory **bit-for-bit**. Fatigue is
   additive on a path that must reduce to the existing one when fatigue is absent.
2. **Generation:** a worked set produces the expected `set_fatigue` from
   `κ·rel_load·reps·proximity·exercise_cost`; splits to capabilities by `w_c`.
3. **Decay anchors:** `Fatigue·e^{−Δt/τ}` returns toward zero at the population τ; systemic
   decays slower than small-muscle capability fatigue.
4. **De-fatigue ordering:** de-fatigue applied in rep space *before* `rm1_from`; a fatigued
   observation yields a higher `S_obs_clean` than the raw value, and equals the rested result
   when fatigue is removed. Multi-capability split happens on de-fatigued reps.
5. **Surprise discrimination (C.1):** underperformance + high estimated fatigue → `surprise ≈
   0` → **score unchanged**; underperformance + low fatigue → negative evidence → score drops.
6. **Recommendation gating (B.3):** `INCREASE_LOAD` blocked while fatigue elevated even on
   positive evidence (`fatigue_hold`); `DECREASE_LOAD` only fires when fatigue is low
   (`unexplained_regression`); `recovered_progression` only from a recovered state.
7. **Reduction order (B.2):** reps reduced before weight; weight is the last knob.
8. **Audit reconstruction (E.2):** a "worse today, no score change" session is fully
   reconstructable — fatigue high, surprise ~0, nothing learned.
9. **Harness sanity (§6):** constant-truth/varied-rest athlete → flat stable inferred score.
10. *(if ES-010 Part C bundled)* **Variance suppression:** alternating `±` signals suppress
    confidence despite rising `sum_w`; confidence recovers when evidence coheres; and fatigue
    swings, removed first, do **not** inflate `σ²_recent` (Contradiction 4).

---

## 9. Definition of done

- All prior tests still pass (19) + new fatigue tests; rested-path regression bit-identical.
- ES-011 Parts A–E implemented; both amendments (ES-005.1 §4, ES-010 ordering) applied and
  commented as deliberate frozen corrections.
- Fixed population `κ`/`τ` in `constants.py`, labelled provisional, with a simulation sweep
  that justifies the defaults (or an explicit note that calibration is pending the Phase 0
  gate).
- Synthetic athlete injects independent fatigue/recovery; non-circularity documented.
- Audit chain stores assumed fatigue/recovery state and new reason codes; persisted pipeline
  reconstructs it.
- Deferred interactions (ES-009 recovery gate, ES-009.1 fatigue ceiling, ES-013
  CHANGE_STRATEGY, per-athlete τ, `effort_offset`) stubbed at clean boundaries with
  forward-reference notes — **not** redesigned around.
- `HUSH_V1_EXECUTION_CONTEXT.md` §5 roadmap updated to match the as-built sequence (§1).
- Sprint 2 README written in the house style (run commands, structure, deferred items,
  verified invariants).

---

## 10. Suggested sequencing

1. State + schema additions (additive; preserve single-writer + O(1)). 
2. Constants: `κ`, `τ_sys`, `τ_cap,c`, `exercise_cost`, `σ²_ref` (if bundling Part C).
3. Fatigue generation + accumulation (pure functions, golden-value tested).
4. Decay/recovery (pure; anchor-tested).
5. **Pipeline reorder** — de-fatigue before conversion/attribution (the risky change; lean on
   the rested-path regression test to prove no behavior change at zero fatigue).
6. Fatigue-adjusted prediction + surprise discrimination.
7. Fatigue-aware recommendation (veto, reduction order, reason codes).
8. *(optional, recommended)* ES-010 Part C variance-suppressed confidence.
9. Audit fields + reconstruction.
10. Synthetic-athlete fatigue/recovery + sanity scenarios.
11. Parameter sweep → set provisional defaults.
12. Docs: Sprint 2 README + canonical roadmap correction.

The correctness-critical spine (1–7) is pure computation over state and should carry
near-total test coverage (Build Plan §6). The harness (10–11) gates any later trust in `κ`/τ.

---

## 11. Open questions for explicit model review

These require a model-review decision before or during Sprint 2 (governing rule: no redesign
without one):

1. **Bundle ES-010 Part C (variance-suppressed confidence) into Sprint 2?** Recommended yes
   — ES-011 B.4 is otherwise vacuous. (§3 scope decision.)
2. **Calibrate `κ`/`τ` now or ship flagged-provisional?** The Phase 0 harness is the only
   principled calibration path and the as-built sequence hasn't reached the Phase 0 gate.
   Recommend: produce *informed defaults* from a Sprint 2 sweep, mark calibration as a Phase 0
   exit condition. (§7.)
3. **`effort_offset = 0` for the MVP?** Recommended yes (A5 untestable without RIR), with
   every fatigue/effort conclusion flagged un-separated. (§7.)
4. **Update the canonical roadmap to the as-built sequence?** Recommend yes (§1) — leaving it
   stale will mislead the next implementer about whether fatigue shipped.

---

*Sources read for this review: `docs/canonical/*` (Index, Execution Context, Spec Manifest,
Traceability); ES-011 (full), ES-010 (full), ES-006/007, ES-009; Hush v1 System Architecture,
Technical Build Plan, Validation Architecture; `implementation/sprint0/*` and
`implementation/sprint1/*`; `CURRENT_STATUS.md.md`, `README.md.md`. No code was written.*
