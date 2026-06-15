# Sprint 4 Planning Review — Instrumentation & the Phase 0 Simulation / Calibration Harness

> Planning/readiness review, produced before any Sprint 4 code. Does **not** redesign the frozen
> model and adds **no new product features**: Sprint 4 builds the *instruments* that observe the
> frozen model and the *offline harness* that drives it, then uses them to produce informed
> parameter defaults. Every scope claim traces to a frozen source (`Hush Validation Architecture v1`,
> `Hush v1 Technical Build Plan`, the Assumptions Register, ES-012). Governing rule: *no redesign
> without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Build: Sprint 0/1/2/3A/3B-1/3B-2 ✅ (105 tests) · Schema v5 · No code written.

> **STATUS: ACCEPTED (2026-06-10).** The five §8 questions are resolved (see §8):
> **Q1 recommend-only** (no in-sprint adoption; calibration outputs are recommendations + evidence;
> adoption is a separate review) · **Q2** fresh-state offline-only (live probe deferred) · **Q3**
> quantify-and-report the 3B-2 band-collapse / null-focus behaviors, do not compensate · **Q4**
> the harness drives the production `SessionEngine` path (fidelity over speed) · **Q5** the impl plan
> proposes gate thresholds, but **raw metrics are the primary output**. These keep all 105 tests green
> (instruments/harness are additive; no parameter value changes).

## 0. Where we are (one paragraph)

Sprint 3B-2 closed the Class-A learning loop end-to-end: a full session composes (ES-009),
volume-allocates (ES-009.1), orders, loads (ES-006), runs, and learns — deterministically and
reconstructably. But every numeric correction in that loop still rides on **provisional, unanchored
constants** (κ, τ_sys/τ_cap, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`,
`SESSION_FATIGUE_CEILING`, `P_EXPLORE`) plus two documented open behaviors (the Class-A band collapse
and the null-focus ×0.75 multiplier). The Validation Architecture is unambiguous that the **Phase 0
offline simulation harness is the only access to the existential stability assumption (A2) and the
only safe place to set those parameters before they touch a person**, and that the **instruments
(shadow baseline, fresh-state checks, override logging) must be built before the trial, not during
it**. Sprint 4 is exactly that: the Build Plan's modules **[2] simulation harness**, **[3] parameter
calibration + stability runs**, and **[7] validation instrumentation**, ending at the **Phase 0 gate**
— *the model is stable in simulation across the parameter ranges and recovers synthetic capability*.
This is the cheapest place to catch the existential stability risk; it costs only compute.

---

## 1. Sprint goal

**Stand up the Phase 0 instruments and harness, and produce the calibration + stability + sensitivity
evidence that the Phase 0 gate requires** — driving the **frozen model package verbatim** (the harness
imports the same `hush_model` the live path uses, so it tests the real model, not a reimplementation).
Concretely, Sprint 4 delivers:

- **A simulation/replay harness** that runs synthetic athletes (known true capability + injected,
  independent fatigue/effort) through simulated months-to-years of **composed** sessions, and
  reproduces the three known-answer sanity scenarios (improver → rising score; constant → flat/stable
  score; fatigued → suppressed-then-recovered).
- **Validation instrumentation** — shadow-baseline computation (A8), fresh-state recoverability checks
  (A1, offline), override-target logging (A9), and complete audit reconstruction — all additive,
  pure-computation, behavior-neutral.
- **A parameter-calibration + sensitivity framework** that produces **recommended** informed defaults
  for the provisional constants and a sensitivity map showing no knife-edge dependence.
- **The Phase 0 gate verdict**: stability (no oscillation/drift/ratchet on constant-truth athletes
  across the swept ranges) and recoverability (inferred score beats a naive baseline), stated honestly.

Succeeds when the harness reproduces the sanity scenarios, the instruments reconstruct a complete
chain (shadow + Hush prediction present for every recommendation), the sensitivity sweep runs, and the
Phase 0 gate is evaluated — **with all 105 prior tests still green bit-for-bit** (instruments and
harness are additive; parameter *values* are unchanged unless Q1 decides otherwise).

---

## 2. Scope

### 2A. In scope — instrumentation architecture (Build Plan [7]; A8/A9/A1)

- **Shadow baseline (A8):** on every recommendation, also compute what a **fixed linear-progression
  policy** would have recommended and predicted (using the frozen forward model), and store both
  alongside actuals — the within-athlete paired comparison that powers A8. Pure computation; it never
  influences the live decision.
- **Override-target logging (A9):** record, on an override, the athlete's chosen target vs the
  recommended one and the ES-010 override category (the taxonomy already exists; REPLACE is already
  audited). Additive columns/rows; exercised by injected overrides (no organic overrides in sim).
- **Fresh-state recoverability check (A1, offline):** the harness's controlled rested re-test —
  compare predicted reps-to-failure against the synthetic athlete's known rested performance, vs a
  naive "last working set" baseline. (The *live* probe-slot version is ES-013 / Phase-1 — see §6 / Q2.)
- **Complete audit reconstruction:** extend `reconstruct_observation` so a recorded session
  reconstructs the full chain — composition audit (template/priority/band/seed/trim, Sprint 3B-2) +
  recommendation + shadow + observation + evidence + state update.

### 2B. In scope — Phase 0 simulation harness (Build Plan [2])

A first-class `sim/` deliverable (not a test fixture) that **extends the existing
`sim/synthetic_athlete.py`** (which already carries known true capability, weekly gain, rep noise, and
an *independent* fatigue/recovery generator) into a multi-capability, multi-week, multi-athlete
**cohort runner** driving the Sprint 3B-2 `SessionEngine` over simulated time. Deliverables: the cohort
runner; the three known-answer sanity scenarios; trajectory recording (per-capability inferred score,
confidence, load, fatigue over weeks); and the non-circularity guard (the athlete generates reps from
its own constants, never the model's κ/τ).

### 2C. In scope — parameter calibration strategy (Build Plan [3]; A2)

For each provisional constant — κ, τ_sys, τ_cap, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`,
`PREFERENCE_NUDGE`, `SESSION_FATIGUE_CEILING`, `P_EXPLORE` — define a plausible search range, an
objective (recovery error and stability on the relevant sanity scenario), and a recommended value.
**`STABILITY_N`, the 8/12/18 bands' structure, `CAPABILITY_PRIORITY_ORDER`, and the templates are
ratified, not calibration targets.** The Class-A band collapse and the null-focus ×0.75 multiplier
(3B-2 Limitations) are *quantified* here so their adoption decision is evidence-based. **Output is a
recommended-values table + evidence — adoption is a separate gate (Q1).**

### 2D. In scope — sensitivity analysis framework (A2)

Sweep each parameter across its range (others held at default); record the effect on final-score
error and the stability metrics; flag any **knife-edge** dependence (a steep local derivative). The
deliverable is a sensitivity map per parameter and a pass/fail on "no knife-edge dependence."

### 2E. In scope — validation methodology (the Phase 0 gate)

Define and compute the **stability metrics** (post-burn-in oscillation, drift-vs-flat-truth, load
ratcheting) and the **recoverability metric** (inferred-score error vs a naive baseline), with
explicit numeric pass thresholds (proposed in the impl plan, ratified — Q5). Produce the **Phase 0
gate verdict** and the honest contract (what the offline gate does and does not establish — it gives
*simulation-only* assurance on A2, never live convergence).

### 2F. Out of scope — defer, stub at clean boundaries

Live fresh-state **probe slots** and the Investigation Engine (ES-013); the Trust metric / operator
dashboard (ES-012, Phase 2); the API and mobile app; cohort recruitment (Phase 1); per-athlete τ and
`effort_offset` identification (A5/A6); any change to a model **formula or structure**; adoption of
re-calibrated values without the Q1 gate.

---

## 3. Dependencies

**Consumed (built):** the entire frozen `hush_model` package + `SessionEngine` (3B-2) + the persisted
pipeline; `sim/synthetic_athlete.py` (known-truth generator with independent fatigue/recovery); the
3-zone persistence + audit chain; `service.reconstruct_observation`; the provisional constants in
`constants.py` (the calibration targets). **None of these is modified structurally.**

**Hard prerequisites:** none new — Sprint 4 is pure-computation + logging + an offline driver over an
already-complete loop. This is the payoff of having built "pure functions first": the harness reuses
the model verbatim.

**Frozen couplings to respect:**
- The harness **must import the model package**, never reimplement any formula (Build Plan: this is
  what makes the sim test the real model). Non-circularity: the synthetic athlete generates reps from
  its **own** constants, never the model's κ/τ.
- The shadow baseline is a **parallel** computation — it must never enter the live decision/learning
  path (it is a counterfactual, not a second recommender).
- Instrumentation is **additive and behavior-neutral**: with it present, the 105 prior trajectories
  reproduce bit-for-bit (parity firewall, as every prior sprint).

---

## 4. Risks (ranked)

- **R1 — Calibrated values vs the golden tests (highest).** The 105 tests pin behavior at the
  *current* provisional constants. **Committing** re-calibrated κ/τ/σ²_ref/etc. changes fatigue and
  decision trajectories and **breaks the golden values**. *Mitigation (default posture, Q1): Sprint 4
  produces a **recommended-values table + evidence**; the *adoption* of any new value is a separate,
  explicit, owner-reviewed re-baseline (its own change, with the affected tests updated deliberately).
  This keeps Sprint 4 additive and green, and makes every parameter change auditable — the opposite of
  silent tuning.*
- **R2 — Harness non-circularity (existential to the exercise).** If the synthetic athlete generates
  reps with the model's own κ/τ, the harness validates nothing (it tests a tautology). *Mitigation:
  the athlete keeps its **independent** `fatigue_per_set`/`recovery_tau_weeks`/`true_score`; assert in
  tests that the model recovers truth it was **not** given; document the one intended shared physics
  (ReferenceStrength+Epley *is* the model's definition of the world — varied via the hidden true
  score).*
- **R3 — Stability/gate thresholds are themselves judgment calls.** "No oscillation," "beats naive,"
  "no knife-edge" need numeric thresholds, which are quasi-parameters. *Mitigation: propose explicit
  thresholds in the impl plan, ratify them (Q5); report the raw metrics so the verdict is
  reconstructable, not a black-box pass.*
- **R4 — The ceiling is inert and the bands collapse under Class-A.** `SESSION_FATIGUE_CEILING=24`
  never binds under Class-A (3B-2), and once-trained bands collapse (moderate==high). Calibrating them
  on Class-A-only sim gives little signal. *Mitigation: calibrate what the Class-A loop actually
  exercises (κ/τ/σ²_ref/thresholds/nudge/P_EXPLORE); for the ceiling and bands, record that they are
  under-exercised in V1 and defer their real calibration to when Class-B/C breadth exists (state it,
  don't fabricate a number).*
- **R5 — Shadow baseline must reduce to a *fixed* policy, not a second learner.** If the "linear
  progression" baseline reads learned state, it stops being a counterfactual. *Mitigation: the shadow
  policy is a fixed rule (e.g. +1 increment on success, hold otherwise) over actuals only; assert it
  ignores `capability_state`.*
- **R6 — Simulated "months-to-years" cost.** Driving the full persisted `SessionEngine` over many
  athletes × many weeks × parameter sweeps is compute. *Mitigation: in-memory SQLite, modest cohort
  (10–20 synthetic athletes per the Validation Architecture), bounded horizons (8–52 simulated weeks),
  and sweeps over a small grid; the harness is offline so wall-clock is acceptable.*
- **R7 — Fresh-state / probe-slot scope creep.** A *live* fresh-state probe slot touches ES-009
  composition + ES-013 (deferred) and would be a new feature. *Mitigation (Q2): Sprint 4 does the
  **offline** A1 recoverability check only; the live probe slot is deferred to ES-013/Phase-1.*

---

## 5. Exact implementation sequence

**Phase A — Harness foundation (drives the frozen model):**
1. Extend `sim/synthetic_athlete.py` cohort support (multi-athlete, diverse cohorts) + a `harness`
   runner that drives `SessionEngine` over simulated weeks (`advance_week` between sessions), recording
   per-capability trajectories. Non-circularity guard asserted.
2. The three known-answer sanity scenarios (improver / constant / fatigued) with asserted expected
   qualitative shapes. **Checkpoint: if the harness can't reproduce these, stop — it's wrong.**

**Phase B — Instrumentation (additive, behavior-neutral):**
3. Shadow-baseline computation + storage (fixed linear-progression policy via the frozen forward
   model), recorded per recommendation; parity assertion (live trajectories unchanged).
4. Override-target logging (A9) columns + recording path; complete audit reconstruction across the
   composition + shadow + learning chain. Additive migration 006.

**Phase C — Validation methodology + metrics:**
5. Stability metrics (oscillation/drift/ratchet) + the recoverability metric (vs naive baseline) +
   the offline fresh-state check (A1); explicit pass thresholds (ratified, Q5).

**Phase D — Calibration + sensitivity:**
6. Parameter-sweep + sensitivity framework; per-parameter ranges/objectives; the recommended-values
   table + sensitivity map; the documented under-exercised parameters (ceiling/bands, R4).

**Phase E — Phase 0 gate + docs:**
7. Compute and record the **Phase 0 gate verdict** (stability across ranges + recoverability) with the
   honest contract; canonical-doc + traceability updates; Sprint 4 README + completion report. **No
   parameter value is adopted without the Q1 gate.** All 105 prior tests stay green.

---

## 6. What must remain deferred

- **Live fresh-state probe slots + Investigation Engine (ES-013)** — Sprint 6 / Phase 2; Sprint 4 does
  the offline A1 recoverability test only.
- **Trust metric + operator dashboard (ES-012)** — Phase 2.
- **API, mobile app, cohort recruitment (Phase 1), real overrides** — later sprints; override logging
  ships as instrumentation exercised by injected overrides.
- **Per-athlete τ (A6) and effort_offset identification (A5)** — Phase 3 / RIR-gated; the harness ships
  fixed population τ and offset 0 unchanged.
- **Adoption of re-calibrated parameter values** — a separate reviewed re-baseline (Q1); Sprint 4
  *recommends*, it does not silently *adopt*.
- **Class-B/C calibration of the ceiling and volume bands** — deferred until those pipelines exist
  (R4); recorded as under-exercised, not fabricated.
- **Any change to a model formula or structure** — out of scope by construction (no redesign).

## 7. Should Sprint 4 be split? — **Recommend no; gate internally at the Phase-A checkpoint.**

The three Build-Plan modules ([2] harness, [3] calibration, [7] instrumentation) are tightly coupled —
calibration and sensitivity *use* the harness, and the gate *consumes* both the harness and the
instruments — so a sprint-level split would strand the harness as un-usable scaffolding. The honest
de-risking is the **internal Phase-A checkpoint**: prove the harness reproduces the three known-answer
sanity scenarios *before* trusting any calibration or sensitivity number it produces (a harness that
can't show a constant athlete as flat cannot be believed about stability). One caveat for the owner:
if instrumentation must ship independently of calibration (e.g. to unblock a parallel app track), [7]
is cleanly separable from [2]/[3] — but at current sequencing there is no such pressure.

## 8. Open questions requiring model review — RESOLVED (2026-06-10)

1. **Q1 — RESOLVED: recommend-only.** Sprint 4 does **not** adopt calibrated values; calibration
   outputs are **recommendations + evidence**, never automatic model changes. Any parameter adoption is
   a separate review-and-approval step (with deliberate golden-test re-baselining). The 105 tests stay
   green because no constant value changes this sprint.
2. **Q2 — RESOLVED: fresh-state offline only.** Sprint 4 builds the offline A1 recoverability check in
   the harness; **live probe infrastructure stays deferred** (ES-013 / Phase 1).
3. **Q3 — RESOLVED: quantify and report.** The harness quantifies and reports the 3B-2 band-collapse
   and null-focus ×0.75 behaviors; Sprint 4 does **not** redesign or compensate for them.
4. **Q4 — RESOLVED: `SessionEngine`.** The harness exercises the **exact production path** (compose →
   persist → run → learn), accepting slower wall-clock for fidelity.
5. **Q5 — RESOLVED: propose-but-report-raw.** The impl plan proposes explicit gate thresholds, but the
   **raw metrics are the primary output** so the Phase 0 verdict is reconstructable, not a black-box pass.

---

*Sources read: `docs/canonical/*`; `Hush Validation Architecture v1` (Phase 0–3 plan, per-assumption
design, A1/A2/A8 verdicts), `Hush v1 Technical Build Plan` (modules [2]/[3]/[7], Phase 0 gate, sim
non-circularity), `Hush v1 Assumptions Register` (A1–A9 risk/testability), `HUSH_V1_SPEC_MANIFEST.md`,
ES-012 (shadow baseline F.1, de-biased error D.1); delivered code `sim/synthetic_athlete.py`,
`session.py`, `service.py`, `constants.py`. No code written.*
