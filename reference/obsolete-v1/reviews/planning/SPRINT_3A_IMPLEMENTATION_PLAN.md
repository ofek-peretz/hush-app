# Sprint 3A Implementation Plan — Decision Hierarchy (ES-006)

> Implementation plan for Sprint 3A, the first half of the approved Sprint 3 split. Scope is the **ES-006 cross-session load decision on the existing single-block path** — no composition, no volume, no catalog (those are 3B). It implements a frozen spec; it does not redesign the model. Every mechanism traces to ES-006 (with ES-011 fatigue gating already shipped in Sprint 2, and ES-012 override metrics noted but deferred). Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-09 · Build: Sprint 0/1/2 ✅ (46 tests) · Schema v2 · No code written.

> **STATUS: ACCEPTED (2026-06-09).** Ratified decisions (see §12):
> 1. **Governor interpretation approved.** ES-006 acts as a governor / rate-limiter over the existing ES-005.1 score-derived target load. Single source of truth for load generation; no second independent load formula.
> 2. **REPLACE_EXERCISE is signal-only in Sprint 3A.** Full exercise replacement is a Sprint 3B responsibility, once the exercise catalog and PreferenceState exist.
> 3. **STABILITY_N = 3.** Three consecutive consistent observations before an INCREASE or DECREASE can fire. All threshold values are provisional and subject to future calibration.
> 4. **Decision evaluated at the block / recommendation level, not per-set.** Sprint 3A remains a cross-session decision layer.

## 1. Objective

Turn the load *computation* the system already does into an explicit, auditable, oscillation-resistant **decision**. Today `recommendation.recommend()` re-derives a working load from the (gradually-moving) capability score every call; cross-session progression is therefore *implicit and emergent* — there is no `KEEP/INCREASE/DECREASE` decision, no stability guard, no recommendation memory, no explicit reason beyond the working-set string. Sprint 3A adds the ES-006 decision layer **on top of** the existing ES-005.1 load math and the Sprint 2 fatigue gating, so that every per-capability load recommendation is a named decision (KEEP default; INCREASE/DECREASE only on consistent evidence at sufficient confidence), reconstructable end-to-end, with the rested and fatigued paths from Sprint 0–2 preserved bit-for-bit when the new layer is inert.

## 2. Reconciliation: governor interpretation (RATIFIED)

ES-005.1 and ES-006 describe load motion two different ways, and Sprint 3A reconciles them as a **governor / rate-limiter over the ES-005.1 score-derived target**, honoring Invariant 3 (recommendation and learning share one inverted model):

- **Model α — score-derived (built).** `load = f(score)`; score moves gradually via the precision blend; the working load tracks it. (ES-005.1 §7/§13.)
- **Model β — decision-tree (ES-006 literal).** `load = last_load ± equipment_step`, fired only after consistent evidence, gated by confidence; default `KEEP_LOAD`.

**Ratified reconciliation:** the score-derived load (existing `recommend()`) is the **target**; the ES-006 decision governs **whether, and how fast, the emitted `recommended_weight` moves toward that target**:
- `KEEP_LOAD` (default) — hold `last_recommended_weight`; do not chase sub-step score wiggle.
- `INCREASE_LOAD` — release the held load **up by one equipment step toward the target**, only once the consistent-positive streak ≥ N and confidence clears the gate.
- `DECREASE_LOAD` — step down on a consistent-negative streak **with low fatigue** (genuine regression — the Sprint 2 `unexplained_regression` condition).
- INCREASE remains **structurally vetoed under fatigue** (already enforced in `recommend()` B.3); the governor makes that veto an explicit `fatigue_hold` decision.

**Single source of truth for load preserved:** the governor steps toward the score-derived ES-005.1 target; there is no second load formula (Invariant 3).

## 3. Scope

**In scope (the 3A deliverable):**
- Explicit **L1 decision tree** — `KEEP_LOAD` / `INCREASE_LOAD` / `DECREASE_LOAD` — as a governor over the existing ES-005.1 load, per capability, on the single-block path.
- **Stability guard**: a consecutive-consistent-evidence streak, computed on the **fatigue-adjusted surprise** (reuse Sprint 2's `surprise = S_obs_raw − (score − est_fatigue)`), *not* raw error — so fatigued underperformance never accrues a DECREASE streak. Streak lives in **projected state** (Invariant 1), not a history scan.
- **Confidence gate** on step firing/size, reconciled with the existing `safety_discount` so low confidence is not penalized twice (§6).
- **Load progression steps** by equipment granularity (barbell 2.5 kg today; dumbbell/machine generalized as a named constant; never exceed granularity).
- **Recommendation memory**: `last_recommended_weight`, `last_decision` (+ minimal `last_accepted` / override detection, §7).
- **Decision reason codes** + audit persistence; full reconstructability.
- Fold the **existing Sprint 2 fatigue gating** (`fatigue_hold`, INCREASE veto, reps→weight order) into the explicit tree as named branches — no behavior change to the fatigue path, just naming/auditing it as a decision.

**Out of scope (RATIFIED refinement vs the planning review):**
- **`REPLACE_EXERCISE` (L2)** — **signal-only in 3A.** Requires the ES-002 catalog, PreferenceState, and `replacement_group`, all of which 3B owns. 3A defines the L2 branch point and may emit a `replace_candidate` flag, but does not execute a replacement.
- **`CHANGE_STRATEGY` (L4)** — signal-only, unchanged (licensed only by a completed investigation, ES-013).
- Composition, volume, fatigue ceiling, catalog, StrategyState, PreferenceState — **all 3B**.
- Full override metrics / TrustScore (ES-012) — deferred; 3A only ensures the three override metrics are **not collapsed** and the override target is loggable (ES-012 H, A9 instrumentation).

## 4. State & schema additions (additive; migration 003 → schema_version 3)

Mirror the Sprint 2 migration discipline exactly (`migration_002_fatigue.py`): **additive ALTERs only**, idempotent, every new column defaulted to the **inert/neutral** value so a Sprint 2 DB migrates with zero semantic change and the 46 prior tests stay bit-for-bit.

**Mutable projection — extend `CapabilityState` (`domain.py`) and `capability_state` table:**

| Field | Type / default | Meaning | Spec |
|---|---|---|---|
| `last_recommended_weight` | `REAL` NULL | held load to govern from | ES-006 Recommendation Memory |
| `last_decision` | `TEXT` NULL | last KEEP/INCREASE/DECREASE | ES-006 |
| `consecutive_positive` | `INTEGER` DEFAULT 0 | run of positive surprises | ES-006 Stability Requirement |
| `consecutive_negative` | `INTEGER` DEFAULT 0 | run of negative surprises | ES-006 Stability Requirement |
| `last_decision_week` | `REAL` NULL | cooldown / audit | ES-006 |

Defaults (NULL `last_recommended_weight`, zero streaks) ⇒ first call falls through to the existing working-set computation ⇒ **rested-path identity**. Single-writer discipline unchanged: only `StateRepository.write_capability_state` writes these, inside the existing transaction.

**Immutable history — extend `recommendation` + `state_update_log`:** add `decision_type` (KEEP/INCREASE/DECREASE/…) and keep the richer `decision_reason` string; add `target_load` (the ungoverned ES-005.1 target, for "why didn't it move?" audit). Defaults backward-compatible.

No new tables. (A separate `DecisionState` table was considered and rejected: the fields are 1:1 with capability and O(1), so they belong on `capability_state`, consistent with how Sprint 2 put fatigue/variance there.)

## 5. Decision logic (new module `decision.py`, consumed by `recommendation.py`)

A pure function, golden-value testable, no I/O:

```
decide(cap_state, est_fatigue_total, target_load, equipment_step, confidence) -> Decision
```

Branch order (safety-first; first match wins — mirrors ES-006 "Safety Rules" + ES-011 precedence):

1. **Fatigue veto** (ES-011 B.3, already enforced): fatigue elevated ⇒ `KEEP/fatigue_hold`, INCREASE impossible. (Folds in the existing `recommend()` fatigue branch; reps→weight order unchanged.)
2. **Cold start / no memory** (`last_recommended_weight is None`) ⇒ emit the ES-005.1 working load as today, `decision=KEEP`, reason `working_set_seed`. *(This is the bit-for-bit reduction point.)*
3. **Low confidence gate** (confidence < `DECISION_CONF_GATE`): no INCREASE regardless of streak; small/zero step ⇒ `KEEP/low_confidence_hold`.
4. **Consistent positive** (`consecutive_positive ≥ STABILITY_N` and target_load > held) ⇒ `INCREASE_LOAD`, step the held load up by **one** `equipment_step` toward target, reason `consistent_positive_evidence`. Reset streak on fire.
5. **Consistent negative + low fatigue** (`consecutive_negative ≥ STABILITY_N`) ⇒ `DECREASE_LOAD`, step down one increment, reason `unexplained_regression`.
6. **Conflict / otherwise** ⇒ `KEEP_LOAD`, reason `keep_default` (or `evidence_conflict_hold` when streaks disagree).

**Streak update** (in the single-writer state-update step of the pipeline, on the same de-fatigued evidence): increment `consecutive_positive` / reset `consecutive_negative` (and vice-versa) by the **sign of surprise** vs a deadband (`|surprise| < SURPRISE_DEADBAND` ⇒ neither, treat as agreement). Reuse the Sprint 2 surprise quantity so fatigue is already removed.

**New constants** (in `constants.py`, grouped like the Sprint 2 block, flagged provisional where they have no anchor):
- `STABILITY_N = 3` (RATIFIED).
- `DECISION_CONF_GATE` (provisional; below this, hold/small-step only).
- `EQUIPMENT_STEP` map (barbell 2.5 — already `PLATE_INCREMENT_KG`; dumbbell/machine generalized; "never exceed granularity").
- `SURPRISE_DEADBAND` (provisional; score units) — the "≈" in ES-006's positive/negative examples.

## 6. Confidence gate vs. safety discount — the no-double-count rule

- **`safety_discount` (ES-005.1 §7)** acts on **absolute load magnitude** (how heavy the target is). Unchanged.
- **`DECISION_CONF_GATE` (ES-006)** acts on the **decision to change and the step size** (whether INCREASE/DECREASE fires, and by how much). New.

They compose on different quantities (one scales the target, the other rate-limits motion toward it), so a low-confidence athlete is conservatively loaded **and** slow to progress, but not discounted twice on the same axis. **Test:** a low-confidence positive streak yields a *small/withheld step on an already-discounted target*, and the emitted load equals `governor(step) ∘ discount(target)` — not `discount²`.

## 7. Recommendation memory & overrides (minimal in 3A)

- **Memory**: `last_recommended_weight` / `last_decision` written each cycle (the governor's input next time). Satisfies "same evidence must not re-fire the same recommendation" via streak-reset-on-fire.
- **Overrides**: the schema already stores both `recommended_weight` and `actual_weight` (ES-001 critical rule), and ES-010 B.4 says a LOAD override re-enters the same path on `actual_weight` — *already true in the pipeline*. 3A adds only: (a) detect `actual_weight ≠ recommended_weight`, (b) record an override row/flag with its **target** (A9 instrumentation; do not collapse acceptance/accuracy/override-value — ES-012 H), (c) leave full override-productivity metrics to ES-012 (Sprint 6). The synthetic athlete performs the recommendation, so 3A exercises this via an **injected synthetic override** test, not real data.

## 8. Invariants preserved

- **Inv. 1 (state not history):** streaks/memory are projected state; the decision reads only state. ✔
- **Inv. 3 (one inverted model):** governor steps toward the score-derived ES-005.1 target; no second load formula. ✔
- **Single writer:** all new state written only by `StateRepository` inside the existing transaction. ✔
- **Inv. 7 (carry what you couldn't exclude):** `target_load` vs emitted load + `decision_reason` make "why didn't it move?" reconstructable; fatigue-dependent holds stay flagged un-separated. ✔
- **Rested/Sprint-2 parity:** inert defaults ⇒ Sprint 0/1/2 paths bit-for-bit (the non-negotiable). ✔

## 9. Exact implementation sequence

1. State + migration 003: add the five `CapabilityState` fields + `recommendation`/`state_update_log` columns; idempotent additive migration; bump `schema_version` to 3; extend `CapabilityStateSnapshot` (pipeline) to carry the new fields.
2. Constants: `STABILITY_N=3`, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, `EQUIPMENT_STEP` (flagged provisional where unanchored).
3. `decision.py` (pure): the §5 branch logic + streak-update helper. Golden-value tested in isolation first.
4. Wire `recommendation.recommend()`: compute the ES-005.1 target as today, then pass through `decide(...)`; emit governed `recommended_weight` + `decision_type` + reason. Keep cold-start/inert path identical.
5. Pipeline: in `report_set_fatigue_aware`, after the de-fatigued evidence is formed, update streaks + `last_recommended_weight`/`last_decision` in the single-writer step; persist `decision_type`/`target_load`; minimal override detection.
6. REPLACE/CHANGE_STRATEGY: signal-only branches + reason codes; no execution.
7. Tests (§10).
8. Docs: Sprint 3A README (house style) + canonical updates (PROJECT_STATUS, EXECUTION_CONTEXT §4, TRACEABILITY ES-006 row → Sprint 3A code).

## 10. Test plan (extends the 46; rested/fatigued parity is non-negotiable)

1. **Parity (blocking):** with inert decision state, the fatigue-aware and rested pipelines reproduce the Sprint 2/Sprint 0 trajectories **bit-for-bit** (the 46 stay green).
2. **KEEP default:** sub-streak / mixed evidence ⇒ `KEEP_LOAD`, load held at `last_recommended_weight`.
3. **Stability guard:** N−1 consistent positives ⇒ still KEEP; the N-th ⇒ `INCREASE_LOAD` one equipment step; streak resets after firing (no immediate re-fire).
4. **Confidence gate:** strong positive streak at low confidence ⇒ held/small-step (`low_confidence_hold`), not a normal increase.
5. **No double-discount:** low-confidence increase load = `governor(step) ∘ discount(target)`, asserted not double-discounted.
6. **DECREASE vs fatigue:** consistent underperformance with **high** fatigue ⇒ `fatigue_hold`, score and load unchanged; with **low** fatigue ⇒ `DECREASE_LOAD`/`unexplained_regression`.
7. **Surprise-based streak:** fatigued underperformance contributes **no** negative streak (deadband/surprise sign), proving fatigue can't manufacture a DECREASE.
8. **Memory / no re-fire:** identical evidence twice does not re-emit the same INCREASE.
9. **Override (injected):** `actual_weight ≠ recommended_weight` re-enters learning on `actual_weight` and logs the override target without collapsing the three metrics.
10. **Audit reconstruction:** a held session reconstructs `target_load` ≠ emitted load with `decision_reason` — "why it didn't move" is answerable.

## 11. Definition of done

- Governor interpretation implemented (no second load formula); REPLACE/CHANGE_STRATEGY signal-only.
- ES-006 L1 tree live as a governor over ES-005.1; stability guard on fatigue-adjusted surprise in projected state; confidence gate reconciled with discount.
- Sprint 2 fatigue gating folded in as named decisions, fatigue path unchanged.
- Migration 003 additive/idempotent; schema_version 3; all 46 prior tests bit-for-bit + new decision tests passing.
- Overrides instrumented (not collapsed), full metrics deferred.
- Single-writer / Inv. 1 / Inv. 3 / Inv. 7 preserved; audit reconstructable.
- Sprint 3A README + canonical doc/traceability updates.

## 12. Open questions — RESOLVED (2026-06-09)

1. **Governor vs literal decision-tree (§2):** **RESOLVED — governor interpretation approved.** Single source of truth for load; no second formula.
2. **REPLACE_EXERCISE signal-only in 3A (§3):** **RESOLVED — approved**; full replacement is 3B.
3. **`STABILITY_N` and gate/deadband values:** **RESOLVED — STABILITY_N = 3**; all thresholds provisional, calibrated later.
4. **Decision granularity:** **RESOLVED — block / recommendation level, not per-set.** 3A is a cross-session decision layer.
