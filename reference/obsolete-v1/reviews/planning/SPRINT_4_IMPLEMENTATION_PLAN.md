# Sprint 4 Implementation Plan — Instrumentation & the Phase 0 Simulation / Calibration Harness

> Implementation plan for Sprint 4, built on the accepted `SPRINT_4_PLANNING_REVIEW.md` (Q1–Q5
> resolved). Scope is the Build Plan's modules **[2] simulation harness**, **[3] parameter calibration
> + stability runs**, and **[7] validation instrumentation**, ending at the **Phase 0 gate**. **No model
> redesign, no product feature, no parameter adoption** (Q1 recommend-only). Implements the frozen
> validation program; does not redesign the model. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0–3B-2 ✅ (105 tests) · Schema v5 · No code written.

> **STATUS: DRAFT — AWAITING APPROVAL.** Carries Q1 recommend-only · Q2 fresh-state offline-only ·
> Q3 quantify-don't-compensate · Q4 production `SessionEngine` path · Q5 propose thresholds / report
> raw metrics. **Gating precondition (see §9 / the readiness review): the production path binds the
> calibration-target constants at import/def-time, so the sweep needs a scoped `override_parameters`
> context manager that patches the exact binding sites and restores them — never active during the
> golden suite.**

## 1. Scope

**In scope (the Sprint 4 deliverable):**
- **Simulation harness** (`sim/`) driving the production `SessionEngine` (Q4) over synthetic-athlete
  cohorts across simulated weeks; per-capability trajectory recording; the three known-answer sanity
  scenarios (improver / constant / fatigued). Non-circular by construction.
- **Validation instrumentation**: shadow baseline (A8 — fixed linear-progression counterfactual),
  override-target logging (A9), offline fresh-state recoverability check (A1), complete audit
  reconstruction (`reconstruct_session`). Additive, behavior-neutral (default off on the live path).
- **Calibration framework**: per-parameter sweeps producing a **recommended-values table + evidence**
  for κ, τ_sys, τ_cap, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`,
  `SESSION_FATIGUE_CEILING`, `P_EXPLORE`. **Recommend-only (Q1) — no value is adopted.**
- **Sensitivity framework**: sweep each parameter, map effect on the metrics, flag knife-edge dependence.
- **Validation methodology + Phase 0 gate**: stability metrics (oscillation/drift/ratchet),
  recoverability vs naive baseline, the offline fresh-state check; **raw metrics are the primary
  output** (Q5) with proposed thresholds; the Phase 0 gate verdict + honest contract.
- **Quantified 3B-2 behaviors (Q3)**: report (not fix) the Class-A band collapse and the null-focus
  ×0.75 effect.

**Out of scope (defer / stub):** live fresh-state probe slots + Investigation Engine (ES-013); Trust
metric/dashboard (ES-012); API, app, cohort recruitment; real overrides (logging exercised by
injection); per-athlete τ / effort_offset (A5/A6); **adoption of any calibrated value** (Q1); any
change to a model formula, structure, or ratified constant (`STABILITY_N`, bands, templates,
`CAPABILITY_PRIORITY_ORDER`).

## 2. Harness & instrumentation architecture

Pure / offline; imports the frozen `hush_model` + production `SessionEngine` verbatim (Build Plan:
"tests the real model, not a reimplementation"). No model code is reimplemented in `sim/`.

```
sim/parameters.py     override_parameters(**overrides)  -> context manager (HD1):
                        patches the EXACT production binding sites for the sweep, restores in finally,
                        asserts restoration. NEVER wraps the golden suite. (κ/τ/σ²_ref/gates/nudge/
                        P_EXPLORE/ceiling — see the readiness review for the binding-site map.)
sim/shadow.py         ShadowPolicy (FIXED linear progression): pure; seeds from the SAME cold-start
                        working set as the model's first recommendation, then +1 increment on success
                        / hold otherwise. Reads ACTUALS only — NEVER capability_state (R5).
sim/harness.py        run_athlete(athlete, weeks, seed_fn, instrument) -> Trajectory
                        loop: per simulated week -> SessionEngine.run_session(...) -> record
                        (inferred score/conf/load/fatigue per capability) -> athlete.advance_week().
                        seed_fn(athlete, week, session_index) -> deterministic per-session seed (R4).
sim/scenarios.py      improver / constant / fatigued cohort builders + expected qualitative shapes.
sim/metrics.py        stability: oscillation, drift_vs_flat, load_ratchet; recoverability vs naive;
                        fresh_state_check (A1 offline); shadow paired-comparison (A8).
sim/calibration.py    sweep(param, grid) using override_parameters; objective = recovery error s.t.
                        stability pass; recommended-values table + sensitivity map + knife-edge flag.
```

**Instrumentation on the production path (additive, default-off):** `SessionEngine.run_session(...,
instrument=False)`. When `instrument=True` it (a) records, per block, the `ShadowPolicy`
recommendation into `shadow_recommendation`, and (b) accepts an optional injected override and records
its category/target. Default `False` ⇒ the existing 105 trajectories are byte-unchanged. The harness
runs with `instrument=True`.

**Runtime ordering honored:** the shadow computation is a **parallel counterfactual** — it is computed
and stored, and never feeds the live recommendation/learning (R5). The override logging records what
happened; it does not change the decision.

## 3. Schema changes (additive; migration 006 → schema_version 6)

Same migration_002–005 discipline: additive only, idempotent, inert defaults, fresh (`schema.py`) and
migrated column/table sets identical (MR1). The instrument tables are written only when
`instrument=True`, so a non-instrumented DB is byte-unchanged.

**New table — `shadow_recommendation` (immutable history; A8 paired comparison):**

| Column | Type | Spec |
|---|---|---|
| `id` | TEXT PK | — |
| `recommendation_id` | TEXT → recommendation(id) | links the live rec it shadows |
| `athlete_id` / `capability` / `exercise` | TEXT | — |
| `shadow_weight` | REAL | the fixed-policy recommended load |
| `shadow_predicted_rtf` | REAL | fixed-policy predicted reps-to-failure (frozen forward model) |
| `model_predicted_rtf` | REAL | Hush's predicted reps-to-failure (paired) |
| `actual_reps` | INTEGER | the observed result both are scored against |
| `week` / `created_at` | REAL / TEXT | — |

**`observation` — ADD COLUMNS (A9 override-target logging):**

| Column | Type / default | Spec |
|---|---|---|
| `override_category` | TEXT NOT NULL DEFAULT '' | ES-010 B.1 taxonomy (LOAD / EXERCISE_REPLACEMENT / …) |
| `override_target` | REAL NULL | the athlete's chosen target (e.g. actual vs recommended load) |

`PRAGMA table_info` guards as in migration_005; bump `schema_version` to 6. **No catalog table; no
mutable-state changes** (instrumentation is history + harness only).

## 4. New modules & state changes

**New (sim/, offline, no production behavior):** `parameters.py`, `shadow.py`, `harness.py`,
`scenarios.py`, `metrics.py`, `calibration.py` (per §2). All pure/offline; import the frozen model.

**Edits in place (additive, default-off / behavior-neutral):**
- `session.py` — `run_session(..., instrument=False)`; when on, record shadow per block and an optional
  injected override. Default off ⇒ parity.
- `repositories.py` — a `LearningRepository.insert_shadow_recommendation(...)` writer + the
  `observation` override columns in `insert_observation` (additive params, default ''/None).
- `service.py` — `reconstruct_session(session_id)` returning the complete chain (composition audit +
  per-block recommendation + shadow + observation + evidence + state update).
- `schema.py` — the new table + columns (fresh-DB parity with migration 006).
- `constants.py` — **shadow-policy** constants only (the counterfactual's fixed increment / success
  rule), clearly labelled as the **baseline policy's** params, NOT model params. **No model constant
  value changes** (Q1). The Phase 0 **gate thresholds** live in `sim/` (sim-only, ratifiable), not in
  the model's `constants.py`.

**No mutable-projection / state-shape changes.** Instrumentation reads model state; it never writes
capability/strategy/preference state (the single-writer invariant is untouched).

## 5. Migration requirements

- **`migration_006_instrumentation.py`** — additive/idempotent, migration_005 shape: `CREATE TABLE IF
  NOT EXISTS shadow_recommendation (...)`, guarded `ALTER TABLE observation ADD COLUMN
  override_category/override_target ...`, then `schema_version → 6`.
- **Inert defaults / parity:** a Sprint 3B-2 DB migrates with zero semantic change; instrument tables
  stay empty unless `instrument=True`. The 105 prior tests stay bit-for-bit.
- **No backfill, forward-only**; idempotency proven by re-running `apply()`. **Fresh-vs-migrated column
  parity** tested (MR1). Catalog not migrated.

## 6. Calibration & sensitivity methodology + proposed Phase 0 gate thresholds (Q5)

**Stability metrics** (constant-true-capability athlete, after a burn-in of `B` weeks; window `W`):
- `oscillation` = std-dev of inferred score over the last `W` weeks (and a sign-reversal count).
- `drift_vs_flat` = |OLS slope of inferred score over the last `W` weeks| (true capability is flat).
- `load_ratchet` = longest run of strictly-increasing recommended load with no positive surprise streak.
- `convergence_error` = |final inferred score − true score|.

**Recoverability (A1 offline):** `model_error` = |final inferred − true|; `naive_error` = |score implied
by the last working set − true|; pass if `model_error < naive_error` by a margin. **Fresh-state check:**
predicted reps-to-failure at a standardized rested re-test vs the athlete's true rested reps, vs naive.

**Shadow paired comparison (A8):** per recommendation, `|actual − model_predicted_rtf|` vs `|actual −
shadow_predicted_rtf|`; report within-athlete win rate and effect size (directional, per the Validation
Architecture — not a single significance test).

**Sensitivity:** sweep each parameter on a grid spanning roughly ±50% of its current value (others at
default); record each metric; flag **knife-edge** if a one-grid-step change flips a stability pass→fail
or moves `convergence_error` by more than a stated fraction.

**Calibration objective (recommend-only):** for each parameter, the recommended value is the one
minimizing `convergence_error` (and the recovery scenarios' error) **subject to** passing the stability
metrics, reported with its full curve. Under-exercised params (`SESSION_FATIGUE_CEILING` — never binds
under Class-A; the volume bands — collapsed) are reported as **under-exercised, not fabricated** (R4/Q3).

**Proposed gate thresholds (for ratification; RAW METRICS ARE THE PRIMARY OUTPUT — Q5):**
`B = 8` weeks burn-in, `W = 8` weeks window; `oscillation < 1.0` score units; `drift_vs_flat < 0.1`
units/week; `convergence_error < 3.0` units; recoverability margin `≥ 1.0` unit better than naive; no
knife-edge across the swept grid. **These are sim-only thresholds, proposed, ratifiable — the harness
reports the raw numbers regardless so the verdict is reconstructable.**

## 7. Test strategy (extends the 105; parity is blocking)

1. **Parity (blocking).** With `instrument=False` and no parameter overrides, all 105 prior tests pass
   **bit-for-bit**; the new tables are empty; `SessionEngine` trajectories are unchanged.
2. **Harness sanity (known-answer).** improver → rising inferred score; constant → flat/stable; fatigued
   → suppressed-then-recovered. **If these fail, the harness is wrong before any conclusion.**
3. **Non-circularity (R2).** A constant athlete seeded *away* from truth converges *toward* truth using
   the model's own κ/τ — the athlete never shares the model's parameters.
4. **`override_parameters` round-trip (HD1).** Inside the CM the production path uses the overridden
   value (assert a swept κ changes generated fatigue); after the CM **every patched binding site is
   restored** (assert equality to the originals) — proven by running a golden-path assertion after.
5. **Stability/recoverability metrics.** The detectors flag a known-bad trajectory (injected oscillation
   /drift/ratchet) and pass a known-good one; recoverability beats naive on the recovery scenario.
6. **Shadow (A8).** `ShadowPolicy` ignores `capability_state` (fixed policy, R5); with `instrument=True`
   a `shadow_recommendation` row exists for every recommendation; the paired metric computes.
7. **Override logging (A9).** An injected override records category + target; `reconstruct_session`
   surfaces it.
8. **Audit completeness.** `reconstruct_session` returns the full chain (composition audit + rec +
   shadow + observation + evidence + state update) for an instrumented session.
9. **Migration 006.** Additive + idempotent (re-apply no-op); schema v6; fresh-vs-migrated columns match.
10. **Sensitivity smoke.** A sweep over a small grid runs and produces a metrics map (determinism given
    seeds).
11. **Recommend-only guard (Q1).** Assert the model `constants.py` calibration-target values are
    **unchanged** at end of suite (no adoption leaked in).

## 8. Definition of Done

- Harness drives the production `SessionEngine` over synthetic cohorts across weeks; the three sanity
  scenarios reproduce; non-circularity asserted.
- Instruments built and **behavior-neutral**: shadow baseline (fixed policy, ignores state), override
  logging, offline fresh-state check, complete `reconstruct_session`. `instrument` defaults off.
- `override_parameters` context manager patches the production binding sites and **provably restores**
  them; calibration sweeps run through it.
- Calibration produces a **recommended-values table + evidence**; sensitivity map + knife-edge flags;
  under-exercised params (ceiling/bands) and the null-focus ×0.75 effect **quantified and reported**
  (Q3) — **nothing adopted, nothing compensated** (Q1/Q3).
- Phase 0 gate verdict computed with **raw metrics as the primary output** (Q5); honest contract stated
  (simulation-only assurance on A2).
- Migration 006 additive/idempotent; schema v6; fresh-vs-migrated parity.
- **All 105 prior tests bit-for-bit** + the new Sprint 4 tests; **model constants unchanged** (Q1).
- Sprint 4 README + completion report + canonical/traceability updates (engine status unchanged — this
  is instrumentation; add the Validation/Phase-0 rows and the recommended-values appendix pointer).

## 9. Reasons Sprint 4 should NOT begin (gating preconditions)

1. **The `override_parameters` binding-site map must be correct first (highest).** The production path
   binds κ/σ²_ref/gates/nudge/ceiling as **import/def-time defaults** and τ/`P_EXPLORE` as **imported
   module names**, and the pipeline calls them **without** passing overrides. A sweep that patches the
   wrong site **silently calibrates nothing** (it sweeps a value the production path never reads), and a
   missed restore **poisons the golden suite**. The exact binding-site inventory (readiness review) must
   be confirmed, and the CM must assert restoration, before any sweep code.
2. **Parity baseline reproducibly green.** Confirm 105/105 via `assemble_and_test.py` before adding
   instrumentation — the instruments must be provably additive.
3. **The shadow-policy definition must be pinned.** A8's validity depends entirely on the baseline being
   a *fixed, non-learning* policy seeded comparably to the model's cold start. Pin the seed + increment +
   success rule (and that it reads actuals only) before computing any A8 number.
4. **Gate thresholds proposed, ratified before the verdict is treated as authoritative (Q5).** The
   harness can run and report raw metrics immediately; the *pass/fail verdict* must not be presented as
   authoritative until the thresholds are ratified.
5. **Recommend-only must hold (Q1).** No code path may adopt a calibrated value; the suite asserts the
   model constants are unchanged. If anyone expects in-sprint adoption, the scope is wrong.

---

*Sources read: `SPRINT_4_PLANNING_REVIEW.md`; `Hush Validation Architecture v1`, `Hush v1 Technical
Build Plan` (modules [2]/[3]/[7], Phase 0 gate); delivered code `sim/synthetic_athlete.py`,
`session.py`, `pipeline.py`, `fatigue.py` (`set_fatigue(kappa=KAPPA)` default-arg binding),
`variance.py` (`agreement(sigma2_ref=SIGMA2_REF)`), `composition.py` (`P_EXPLORE` / `compose_session(
ceiling=…)`), `recommendation.py`/`decision.py` (gate defaults), `repositories.py`, `service.py`,
`schema.py`. No code written.*
