# Sprint 4 Code Readiness Review — Instrumentation & the Phase 0 Simulation / Calibration Harness

> Code-readiness review, after the accepted `SPRINT_4_PLANNING_REVIEW.md` and
> `SPRINT_4_IMPLEMENTATION_PLAN.md`, **before any Sprint 4 code**. It pressure-tests the plan against
> the *delivered* code to surface hidden dependencies, migration/state hazards, harness pitfalls, and
> test gaps. No model redesign, no product feature, no parameter adoption (Q1). Governing rule: *no
> redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0–3B-2 ✅ (105 tests) · Schema v5 · No code written.

> **STATUS: DRAFT — AWAITING APPROVAL.** Carries Q1 recommend-only · Q2 fresh-state offline · Q3
> quantify-don't-compensate · Q4 production `SessionEngine` path · Q5 propose-thresholds/report-raw.
>
> **Headline:** Q4 (drive the production path) collides with the fact that **every calibration-target
> constant is bound into the production path at import/def-time** — so a parameter sweep that drives
> `SessionEngine` cannot change those values by setting `constants.X`. The sweep must monkeypatch the
> **exact binding sites** and restore them; getting that inventory wrong **silently calibrates nothing**
> and a missed restore **poisons the 105-test golden suite**. That is **HD1**, the gating item.

## 1. Hidden dependencies

- **HD1 — (gating) The production path binds calibration-target constants at import/def-time.** The
  pipeline/composition/decision callers invoke the math **without passing the parameter**, so each value
  is frozen at module-load and **setting `constants.X` at runtime does nothing**. The exact binding
  sites a sweep must patch (verified in code):

  | Parameter | Binding site to patch | Why |
  |---|---|---|
  | κ (`KAPPA`), `RIR_REFERENCE`, `EXERCISE_COST_DEFAULT` | `fatigue.set_fatigue.__defaults__` | `set_fatigue(...kappa=KAPPA...)`; pipeline calls without these |
  | τ_sys (`TAU_SYS`) | `pipeline.TAU_SYS` | imported name referenced at the `decay_fatigue(...)` call site |
  | τ_cap (`TAU_CAP`) | `pipeline.TAU_CAP` | imported dict referenced at the call site |
  | σ²_ref (`SIGMA2_REF`) | `variance.agreement.__defaults__` | pipeline calls `compute_agreement(...)` (same fn) without `sigma2_ref` |
  | `DECISION_CONF_GATE` | `decision.govern.__defaults__` | `recommendation.recommend` calls `govern(...)` without `conf_gate` |
  | `SURPRISE_DEADBAND` | `decision.update_streaks.__defaults__` | `_record_block_decision` calls without `deadband` |
  | `PREFERENCE_NUDGE` | `preference.nudge.__defaults__` | `service.replace_exercise` calls without `step` |
  | `P_EXPLORE` | `composition.P_EXPLORE` | module global referenced in `_select_for_slot` at call time |
  | `SESSION_FATIGUE_CEILING` | `composition.compose_session.__defaults__` | `SessionEngine` calls `compose_session(...)` without `ceiling` |

  *Mitigation:* `sim/parameters.override_parameters(**overrides)` resolves each name to its binding site
  **via `inspect.signature` (name→position), not hardcoded `__defaults__` indices** (the tuple order is
  position-dependent and fragile), patches, yields, and **restores in `finally` with a post-restore
  equality assertion**. It must **never** wrap the golden suite. (`STABILITY_N`, bands, templates,
  `CAPABILITY_PRIORITY_ORDER` are ratified — not patchable targets.)

- **HD2 — The shadow policy needs its own running state + a defined seed.** A "fixed linear progression"
  baseline must start somewhere and track its own weight per (athlete, exercise) — it cannot read
  `capability_state` (that would make it a second learner, R5). *Mitigation:* seed the shadow from the
  **same cold-start working set** the model emits on session 1 (so the paired comparison is fair from
  t=0), then apply a fixed rule (+1 increment on hitting target reps, hold otherwise) over **actuals
  only**; keep the shadow's running weight in the harness/instrumentation layer (or the
  `shadow_recommendation` history), never in mutable model state.

- **HD3 — Two clocks must advance together.** The model's fatigue recovery reads `week −
  last_workout_at_week` / `last_trained_at_week`; the synthetic athlete decays its **own** `true_fatigue`
  and applies `weekly_gain` in `advance_week`. If the harness advances `week` without calling
  `athlete.advance_week` (or vice-versa), model-fatigue and true-fatigue desynchronize and every metric
  is wrong. *Mitigation:* the harness owns one week counter; each step advances `week` **and** calls
  `athlete.advance_week(Δ)` together; assert monotonic non-overlapping session weeks.

- **HD4 — Per-session seed policy (R4) must be deterministic yet varied.** Exploration draws from a
  persisted per-session seed; the harness must supply `seed_fn(athlete, week, session_index)` that is
  reproducible across runs but varies across sessions (else exploration never varies). *Mitigation:* a
  pure hash of `(athlete_id, week, session_index)`; record it (the session already persists
  `exploration_seed`); assert two identical harness runs produce identical trajectories.

- **HD5 — `SessionEngine.run_session` currently has no `instrument` hook.** Shadow + override recording
  must be added as an additive, default-off parameter; the per-set `pipeline` is intentionally **not**
  touched (keeps parity trivial). *Mitigation:* `run_session(..., instrument=False)`; record shadow per
  block and an optional injected override only when on.

## 2. Migration risks

- **MR1 — Fresh-vs-migrated parity.** `schema.py` (fresh) and `migration_006` (upgrade) must add the
  identical `shadow_recommendation` table + `observation` columns with identical defaults. *Mitigation:*
  add to both; extend the 3B-2 fresh-vs-migrated column-parity test to v6.
- **MR2 — Additive/inert on immutable history.** `observation` is append-only; `ADD COLUMN
  override_category TEXT NOT NULL DEFAULT ''` + `override_target REAL NULL` are additive (existing rows
  take ''/NULL). Guard each with a `_columns()` PRAGMA check; prove idempotency by re-running `apply()`.
- **MR3 — `shadow_recommendation` FK + emptiness.** The table references `recommendation(id)`; it must
  stay **empty unless `instrument=True`**, so a non-instrumented DB (and all 105 prior tests) is
  byte-unchanged. *Mitigation:* the writer is only reached on the instrumented path; assert the table is
  empty after a non-instrumented session.
- **MR4 — Version bump exactly +1, forward-only.** `schema_version` 5 → 6; no down-migration; a 3B-2 DB
  migrates and reads back semantically unchanged.

## 3. State-model & instrumentation risks

- **SM1 — Shadow must never enter the live path (R5).** If `ShadowPolicy` reads `capability_state` or
  its output feeds `recommend`/learning, A8 is invalid (it would compare the model to itself).
  *Mitigation:* the policy takes only the shadow's own running weight + the actual reps; a test asserts
  it ignores `capability_state` and that the live recommendation/score are identical with `instrument`
  on vs off.
- **SM2 — Override logging is exercised only by injection.** The synthetic athlete performs the
  recommendation and never organically overrides (the standing Sprint 3A/3B-1 limitation). A9 logging is
  therefore *scaffolding* tested via an injected override (like REPLACE in 3B-1), not an organic signal.
  *Mitigation:* state this plainly; test the injected path; defer organic-override analysis to the app
  (Phase 1).
- **SM3 — `effective_load` argument-name footgun in the κ binding.** `fatigue.set_fatigue`'s defaults
  tuple is `(EXERCISE_COST_DEFAULT, KAPPA, RIR_REFERENCE)` — patching by index is brittle. *Mitigation:*
  resolve by parameter name via `inspect.signature` in `override_parameters` (HD1), never by literal
  index.
- **SM4 — Recommend-only must be provable (Q1).** Nothing may adopt a calibrated value. *Mitigation:* a
  test asserts the model `constants.py` calibration-target values are unchanged at suite end; the
  recommended-values table is data/markdown output, not a code change.

## 4. Harness & calibration-engine risks

- **CE1 — Non-circularity (R2) is the validity of the whole exercise.** If the synthetic athlete ever
  generates reps using the model's κ/τ, the harness validates a tautology. *Mitigation:* the athlete
  keeps its independent `fatigue_per_set`/`recovery_tau_weeks`/`true_score`; the one intended shared
  physics (ReferenceStrength+Epley) is varied through the **hidden** true score (the model never sees
  it); a test asserts the model recovers a truth it was not seeded with.
- **CE2 — Under-exercised parameters give weak calibration signal (R4/Q3).** `SESSION_FATIGUE_CEILING`
  never binds under Class-A (session total ≤ 24) and the volume bands collapse, so sweeping them yields
  little. *Mitigation:* report them as **under-exercised** with the quantified band-collapse / null-focus
  ×0.75 effect (Q3); do **not** fabricate a recommended value; defer to Class-B/C breadth.
- **CE3 — Stability metrics need a burn-in and a flat-truth athlete.** Measuring oscillation/drift on a
  still-converging score (calibration phase) would mislabel healthy convergence as drift. *Mitigation:*
  measure after a burn-in `B`; the constant-truth athlete must reach steady state; report the raw
  trajectory so a borderline verdict is inspectable (Q5).
- **CE4 — Compute cost on the production path (Q4).** Driving `SessionEngine` (many transactions/session)
  over cohort × weeks × a parameter grid is the expensive choice the owner accepted for fidelity.
  *Mitigation:* in-memory SQLite; modest cohort (10–20, per the Validation Architecture); bounded
  horizons (≤52 weeks); coarse grids; the harness is offline so wall-clock is acceptable. If it proves
  too slow, surface it — do **not** silently switch to the pure loop (Q4 ratified the production path).
- **CE5 — Gate thresholds are quasi-parameters (Q5).** Presenting a pass/fail before the thresholds are
  ratified would smuggle judgment into a "result." *Mitigation:* raw metrics are the primary output;
  the verdict is labelled provisional-until-thresholds-ratified.
- **CE6 — Determinism of the harness.** A non-seeded RNG anywhere (athlete noise, exploration) breaks
  reproducibility of the calibration evidence. *Mitigation:* every RNG is seeded (athlete `rng`,
  per-session seed via HD4); a test asserts run-to-run identical trajectories.

## 5. Test coverage gaps

- **TC1 — `override_parameters` round-trip** (HD1): inside the CM the production path uses the swept
  value (a changed κ changes generated fatigue); after the CM every patched site is restored (assert
  equality), proven by a golden-path assertion immediately after.
- **TC2 — Harness sanity (known-answer):** improver↑ / constant→flat / fatigued→suppressed-then-recovered.
- **TC3 — Non-circularity (CE1/R2):** seed-away-from-truth converges toward truth.
- **TC4 — Shadow is a fixed policy (SM1/R5):** ignores `capability_state`; identical live trajectory with
  `instrument` on/off; a `shadow_recommendation` row per recommendation when on.
- **TC5 — Override logging (SM2):** injected override records category + target; reconstructable.
- **TC6 — Audit completeness:** `reconstruct_session` returns composition audit + rec + shadow + obs +
  evidence + state update.
- **TC7 — Metrics detectors:** flag known-bad (oscillation/drift/ratchet) trajectories, pass known-good;
  recoverability beats naive.
- **TC8 — Migration 006** additive/idempotent + fresh-vs-migrated parity (MR1).
- **TC9 — Determinism (CE6):** two identical harness runs → identical trajectories + seeds.
- **TC10 — Recommend-only guard (SM4/Q1):** model `constants.py` targets unchanged at suite end.
- **TC11 — Parity (blocking):** all 105 prior tests bit-for-bit with `instrument=False` and no overrides.

## 6. Reasons Sprint 4 should NOT begin (gating)

1. **HD1 binding-site inventory unconfirmed.** Until `override_parameters` is built against the verified
   site map (resolving by name, restoring with assertion), parameter sweeps on the production path either
   sweep nothing or poison the golden suite. Build and test the CM **first**; nothing else in calibration
   is trustworthy without it.
2. **Parity baseline not reproducibly green.** Confirm 105/105 via `assemble_and_test.py` before adding
   instrumentation, so the instruments are provably additive.
3. **Shadow-policy definition unpinned (A8).** Pin the seed (= model cold-start working set), the fixed
   increment/success rule, and "reads actuals only" before computing any A8 number — a wrong baseline
   invalidates the most important quality assumption.
4. **Gate thresholds unratified (Q5).** The harness may run and report raw metrics immediately, but the
   pass/fail verdict must not be presented as authoritative until the proposed thresholds are ratified.
5. **Recommend-only must be firmly held (Q1).** No path may adopt a calibrated value; the suite asserts
   the model constants are unchanged. If in-sprint adoption is expected, the scope is wrong — stop.

*Non-reasons (ratified — must not re-open):* fresh-state offline-only (Q2), quantify-don't-compensate
the 3B-2 behaviors (Q3), the production-path fidelity cost (Q4). Class-A-only and the provisional status
of every model parameter are accepted.

---

*Sources read: `SPRINT_4_PLANNING_REVIEW.md`, `SPRINT_4_IMPLEMENTATION_PLAN.md`; delivered code
`sim/synthetic_athlete.py`, `session.py`, `pipeline.py` (`TAU_SYS`/`TAU_CAP` import + call sites,
`compute_agreement` alias), `fatigue.py` (`set_fatigue(kappa=KAPPA)` default tuple order),
`variance.py` (`agreement(sigma2_ref=SIGMA2_REF)`), `composition.py` (`P_EXPLORE` global,
`compose_session(ceiling=…)` default), `recommendation.py`/`decision.py` (`govern`/`update_streaks`
defaults), `preference.py` (`nudge(step=…)`), `repositories.py`, `service.py`, `schema.py`,
`migration_004/005`. No code written.*
