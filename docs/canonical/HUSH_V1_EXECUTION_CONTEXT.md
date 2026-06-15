# HUSH_V1_EXECUTION_CONTEXT.md

> Canonical onboarding document. A fresh implementer should read this first and in full.
> It summarizes the frozen Hush v1 model, what is built, what is next, and what remains
> unproven. It does not redesign anything; every claim traces to a frozen specification
> (see HUSH_V1_INDEX.md for the document set, HUSH_V1_TRACEABILITY.md for rule origins).

---

## 1. Executive summary of the frozen model

Hush is a per-athlete strength-training system that learns a durable estimate of an
athlete's capability and uses it to recommend training loads, while continuously
measuring whether it has earned the right to be followed.

The model rests on a three-tier ontology:

- **Capabilities** are durable. There are seven (five external-load Class-A: horizontal_push,
  horizontal_pull, vertical_push, knee_dominant, hip_dominant; plus vertical_pull and
  core_stability in other classes). Each has a latent **score** (0–100) and a **confidence**.
- **Exercises** are interchangeable. A capability is trained through many exercises, each
  mapped to one or more capabilities by contribution weights and scaled by a difficulty_factor.
- **Fatigue** is transient. Observed performance = capability − fatigue. The system never
  observes capability directly; it removes estimated fatigue before believing the reps.

The central equation chain (recommendation) and its exact inverse (learning) share one
model, so the system always learns in the scale it recommends in:

```
score --ReferenceStrength(A_c·e^(kS))--> RM1_capability --(×difficulty_factor)--> RM1_exercise
      --Epley--> predicted_reps_to_failure --(target = predicted − RIR)--> recommended load
observed reps --Epley⁻¹--> RM1_obs --(ln/k, per-capability anchor)--> S_obs --precision-weighted blend--> score
```

Everything conservative in the system (light seeds, KEEP_LOAD defaults, confidence-scaled
discount, fatigue veto on progression, round-down loads) exists to protect first-session
safety and the slow accumulation of trust. Everything auditable exists so that every
recommendation and every conclusion is reconstructable, including what it could not exclude.

---

## 2. Product thesis (Hush Thesis v2)

**Become the athlete's trusted default recommendation, earning — over years, not weeks —
the standing to decide on their behalf.**

The thesis is expressed on a five-rung ladder (each rung requires the one below):

| Concept | Meaning |
|---|---|
| **Recommendation** | an output (what to do); costs the athlete nothing |
| **Decision** | a recommendation acted on as binding, without independent scrutiny |
| **Trust** | the *justified* basis for that conversion: accuracy × costly-deference × retained-discernment |
| **Authority** | trust made structural — the default posture, granted to the *next, unseen* recommendation |
| **Override** | the athlete reclaiming the decision; simultaneously the richest learning signal |

Thesis v2 deliberately targets the lower, **validatable** rung ("good, sticky default")
for the MVP, and defers the deeper "take over decision-making" (authority) claim to a
later phase, because authority cannot be validated on a self-selected, short-horizon
cohort. The system as frozen is, in its mechanisms, already a default-recommendation
engine (it welcomes overrides as data and avoids hard calls for safety).

---

## 3. Architecture summary

**One deployable service, seven internal engines, one database, synchronous.** No
microservices, no message bus, no queue — at 10–100 athletes the entire learning chain
runs sub-millisecond inside the request that reports a set, and must be transactional so
the audit chain stays intact.

**Engines:**
1. **Workout / Session Engine** — assembles today's workout (composition, selection, volume, ordering); athlete-facing.
2. **Prediction Engine** — score → predicted reps-to-failure (fatigue-adjusted).
3. **Evidence Engine** — observation → per-capability evidence via load-space attribution.
4. **State Update Engine** — precision-weighted blend; the ONLY writer of capability state.
5. **Recommendation Engine** — decision rules, confidence gate, discount, progression guard.
6. **Fatigue & Recovery Engine** — generates/decays fatigue; removes it from observations; vetoes progression.
7. **Investigation Engine** — *(frozen design)* runs plateau probes; licenses strategy change.
   **v1 status: RETIRED — not built; replaced by read-only M5 stagnation detection (DX-09).**

Plus the **Trust Measurement Framework**, a governance/measurement layer (not a pipeline stage)
that computes the TrustScore and governs whether trust-costly actions may proceed.

**State zones:** static/catalog (Athlete, Exercise); immutable history (Session→Block→Set,
Observation, Evidence, Recommendation, StateUpdateLog, Investigation records); mutable
projection (AthleteState, CapabilityState×7, PreferenceState, StrategyState, Fatigue state,
Investigation state). **Cardinal rule: decisions read from state, never from raw history.**

**Operating modes:** *(frozen design)* per-capability **Recommendation Mode** (default) and
**Investigation Mode**, precedence `Fatigue/Safety > Investigation > Recommendation`, governed by
Trust. **v1 as-built:** Recommendation Mode only, now **advisory** (athlete owns load); Investigation
Mode is **retired** (ES-013), and read-only **M5 stagnation detection** (DX-09) is the v1 plateau path.

**Decision layers (lowest-cost first):** L1 per-set load/reps · L2 per-exercise (preference) ·
L3 volume · L4 strategy (licensed only by a completed investigation) · L5 identity/goal
(athlete-owned).

---

## 4. Current implementation status

> **════ CURRENT STATUS — DX-15 (2026-06-12) ════**
> Beyond the Sprint 0–4 narrative below, the build has advanced through a delta tranche that pivoted the
> model to **advisory** and added stagnation detection, then completed the **Wave-2 backend API shell**
> over the frozen model. **As-built: Schema v11, 284/284 tests** (model golden 189 + API pytest 95).
> - **Wave 1** — migration runner, schema-drift guard, as-built docs (no behavior change).
> - **DX-07** — `bodyweight_kg` collected (migration_007, v7).
> - **DX-04 (M4)** — exploration off by default (`P_EXPLORE=0.0`); composition preference-stable.
> - **DX-03 (M3)** — ES-006 L1 governor **advisory** (computes & surfaces KEEP/INCREASE/DECREASE; emits
>   the **held** load; the step is never applied).
> - **M1 (DX-01/02/20/05/06/19)** — the logged `actual_weight` is a **learning input** (quality at the
>   actual load); programs built from the score-derived `target_load`, not the held anchor.
> - **DX-11** — event-driven `SessionRuntime` + persisted `session_progress` (migration_008, v8);
>   bit-for-bit with `SessionEngine`.
> - **DX-09 / M5** — read-only, advisory **stagnation detection** (Product Spec §12/§13; migration_009,
>   v9). **ES-013 active investigation is retired → detection = M5.**
>
> **Since shipped (2026-06-12):** DX-08 (Option D bodyweight-keyed seeding), DX-10 (sticky preference),
> DX-12 (instrumentation/gate repoint), and the **Wave-2 backend** (API + auth + idempotency + observability
> + migration/erasure mechanisms — `pytest`-green, none deployed). The on-host model + backend surface is
> complete; what remains is off-host (Ops deploy / iOS app / consent). Product framing:
> `HUSH_V1_PRODUCT_SPECIFICATION.md`. The Sprint 0–4 detail below remains accurate for those sprints.

**Sprint 0 — COMPLETE.** Smallest executable learning loop, pure model package + synthetic
athlete simulator + end-to-end run, 12 passing tests. Implemented exactly as frozen:

- `hush_model/` pure package: constants (single source of truth), domain objects,
  ReferenceStrength + inverse, Epley (3 directions), confidence, decay, prediction,
  recommendation (discount + plate-floor), evidence (load-space attribution),
  state_update (precision-weighted blend), seeding (cohort-adjusted cold start),
  loop orchestrator.
- `sim/` synthetic athlete (known-truth, generates reps from true capability) + `run_e2e.py`.
- Verified invariants: ReferenceStrength anchors (S=64 → 113/100/68/150/180 kg),
  exact forward/inverse round-trip, Epley bench@82.5 → 11.09, decay anchors
  (1 wk ≈ 1.0, 78 wk ≈ 0.1, half-life 23.48), seed-confidence floor 10, gradual
  single-set update, closed-loop recovery of true capability, stability when seeded at truth.

**Two findings recorded during Sprint 0 (model behaving correctly, not redesigns):**
- Cold-start prior must carry nonzero precision (seed `sum_w = −8·ln(0.9) = 0.843`),
  else the first observation discards the seed. Encoded in seeding.
- When the seed is far from truth, the conservative discount makes early errors large,
  which are correctly down-weighted as low-quality evidence, so convergence is
  deliberately gradual and accelerates as predictions tighten.

**Sprint 1 — COMPLETE.** Persistence (mutable-state + immutable-history zones), ES-001
session/block/set hierarchy, synchronous transactional learning pipeline, single-writer
StateRepository, audit reconstruction. Parity: persisted pipeline reproduces the pure Sprint 0
score trajectory bit-for-bit.

**Sprint 2 — COMPLETE.** ES-011 fatigue & recovery (generation, fixed-τ decay,
de-fatigue-before-attribution, fatigue-aware prediction + recommendation) and ES-010 Part C
variance-suppressed confidence (accumulators, agreement factor, learning-rate damping).
`effort_offset = 0`; per-athlete τ deferred; κ/τ/σ²_ref provisional, pending Phase 0
calibration. 46 tests passing (19 prior bit-for-bit + 27 new); the rested path is unchanged.

**Sprint 3A — COMPLETE.** Full ES-006 **L1 decision hierarchy** (KEEP/INCREASE/DECREASE)
implemented as a **governor / rate-limiter over the ES-005.1 score-derived target** (single
load formula preserved): stability guard (`STABILITY_N=3` consistent observations on the
fatigue-adjusted surprise), confidence gate, one-equipment-step progression, reset-on-fire,
decision memory + `decision_type`/`target_load` audit. `decision.py` is the single live
decision authority. REPLACE_EXERCISE and CHANGE_STRATEGY are signal-only. 64 tests passing
(46 prior bit-for-bit + 18 new); schema version 3 (additive). The rested/fatigue paths are
unchanged (the governor is default-inert until decision memory exists). Full record:
`reviews/completion/SPRINT_3A_COMPLETION_REPORT.md`.

**Sprint 3B-1 — COMPLETE.** Foundation + REPLACE. Built the prerequisites ES-009/009.1 assume:
the **ES-002 exercise catalog** (code-resident, Class-A only, canonical + ≥1 alternate; canonical
`difficulty_factor`/`exercise_cost = 1.0` — a parity firewall so the existing numeric paths are
untouched), **StrategyState** (`weekly_frequency`, `weekly_volume` enum, focus), **PreferenceState**
(`exercise_family`, `preference_score=50`; a single bounded provisional nudge, not a learning
engine), and **`global_confidence = mean(Class-A confidences)` + `calibration_phase` (<70)**,
derived not stored. **L2 `REPLACE_EXERCISE` is now live** (preference-driven, never
performance-driven, capability-preserving, audit-reconstructable). The Sprint 3A decision-memory
update was **relocated to one `complete_block()` hook** shared by the rested and fatigue-aware
paths (no duplicated governor; block surprise = `s_obs − score_at_block_entry`, once per block).
Schema version 4 (additive migration 004); 82 tests passing (64 prior bit-for-bit + 18 new).

**Sprint 3B-2 — COMPLETE.** Session composition + volume + live fatigue ceiling (Class-A only). Built
the **ES-009 Session Composition Engine** (Class-A-restricted frozen templates → calibration info-gain
/ steady-state focus priority → per-slot selection via `catalog.select` + the **exploration floor** →
`CAPABILITY_PRIORITY_ORDER` ordering) and the **ES-009.1 Volume Engine** (two-lever slots×sets, focus
weighting, calibration restraint; sole owner of `target_sets`), coupled. The **ES-011 session ceiling
is live** (`SESSION_FATIGUE_CEILING = 24`, provisional) with a **trim-only recovery gate**. A new
**`SessionEngine` driver** runs multi-set/multi-slot blocks and advances ES-006 decision memory **once
per capability** (primary slot; R2). Exploration is **deterministic from a persisted seed** (R4);
composition is **load-free** (Inv. 3); single-capability slots only (guarded). 5/5 Class-A coverage
re-proven; 7-cap templates frozen inactive. Schema v5 (additive migration 005); 105 tests (82 prior
bit-for-bit + 23 new).

**Sprint 4 — COMPLETE.** Instrumentation & the Phase 0 simulation/calibration harness. Built the
Build Plan's Phase 0 modules: a **simulation harness** (`sim/`) driving the frozen model through the
production `SessionEngine` over synthetic cohorts; **validation instrumentation** (shadow baseline A8,
override-target logging A9, offline fresh-state A1, complete `reconstruct_session`); and a
**parameter-calibration + sensitivity framework** ending at the **Phase 0 gate**. The
`override_parameters` context manager patches the production binding sites (the calibration-target
constants are bound at import/def time) and restores them, so sweeps drive the real path without
leaking. **RECOMMEND-ONLY: no parameter adopted** — `constants.py` unchanged; sweeps produced
recommendations + evidence for a separate adoption review. Phase 0 findings: the loop is stable
(no oscillation/drift/ratchet) and recovers hidden synthetic capability (beats a no-learning baseline),
with a documented conservative-discount equilibrium bias and κ/τ knife-edge-sensitive; the gate verdict
is provisional until the proposed thresholds are ratified. Schema v6 (additive migration 006); 125 tests.

**Parameter-adoption review — CLOSED, NO ADOPTION (2026-06-10).** A formal model review
(`reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md`) found all reviewed parameters should remain
unchanged (κ/τ already at the convergence minimum and knife-edge-sensitive; σ²_ref and the decision
thresholds unexercised by the present scenarios). `constants.py` untouched; no test re-baselined.

**NOT yet built (deferred — see roadmap):** live fresh-state **probe slots** + Investigation Engine
(ES-013, retired in v1); full Trust metric (ES-012); the **mobile app**; the **deployed environment**;
the **consent/enrollment pipeline**; cohort recruitment (Phase 1). *(The backend API itself is now built
— Wave-2 — and `pytest`-green; it is simply not yet deployed.)* Class-B `vertical_pull` and Class-C
`core_stability` remain inactive (7-cap templates frozen) until their pipelines exist.

---

## 5. Sprint roadmap

The order is fixed by dependency and by the validation program: build the math and the
instruments before anything athlete-facing.

> **As-built note (2026-06-09).** Execution re-sequenced the original plan: persistence was
> pulled forward (the original "Sprint 3") and shipped as **Sprint 1**, and the fatigue work
> (originally "Sprint 1") moved to **Sprint 2**. The decision-hierarchy / session-assembly
> work (originally "Sprint 2") is deferred behind fatigue. The list below reflects the
> **actual** sprint numbering; later sprint numbers (3+) are re-derived from the remaining work.

- **Sprint 0 (done):** pure model loop + synthetic athlete + e2e. Recommendation Mode only.
- **Sprint 1 (done) — Persistence, hierarchy & learning pipeline:** state schema (3 zones:
  mutable state + immutable history), ES-001 session/block/set hierarchy, synchronous
  transactional learning pipeline, single-writer StateRepository, audit reconstruction.
- **Sprint 2 (done) — Fatigue & Recovery (ES-011) + variance-suppressed confidence (ES-010 C):**
  fatigue generation/decay, de-fatigue-before-attribution ordering, fatigue-aware prediction
  and recommendation, variance accumulators + agreement factor. Fixed population κ/τ;
  `effort_offset = 0`; κ/τ/σ²_ref calibration deferred to the Phase 0 harness.
- **Sprint 3 — Decision hierarchy & session assembly (split into 3A + 3B):**
  - **Sprint 3A (done) — ES-006 decision hierarchy:** full L1 KEEP/INCREASE/DECREASE as a
    governor over the ES-005.1 target, stability guard, confidence gate, decision memory +
    audit. REPLACE/CHANGE_STRATEGY signal-only. (`decision.py`, schema v3, 64 tests.)
  - **Sprint 3B-1 (done) — Foundation + REPLACE:** ES-002 catalog (code-resident, Class-A
    only), StrategyState, PreferenceState, `global_confidence`/`calibration_phase` (derived),
    live L2 REPLACE_EXERCISE (preference-driven), and the shared `complete_block()` decision
    hook (rested + fatigue-aware unified). Schema v4; 82 tests. (`catalog.py`, `preference.py`.)
  - **Sprint 3B-2 (done) — ES-009 composition + ES-009.1 volume + live ES-011 ceiling (Class-A only):**
    Class-A-restricted frozen templates + re-proven 5/5 coverage, calibration-info-gain / steady-focus
    priority, two-lever volume (sole owner of `target_sets`), Stage-3 selection via `catalog.select` +
    the exploration floor (deterministic from a **persisted seed**), `CAPABILITY_PRIORITY_ORDER`
    ordering, the **live** session fatigue ceiling (`SESSION_FATIGUE_CEILING=24`, provisional) +
    trim-only recovery gate, and the `SessionEngine` driver (multi-set/multi-slot; one governor update
    per capability). Schema v5; 105 tests. (`composition.py`, `volume.py`, `session.py`.) Vertical Pull
    (Class B) and Core Stability (Class C) stay inactive (7-cap templates frozen) until their pipelines exist.
- **Sprint 4 (done) — Instrumentation & Phase 0 harness:** simulation harness driving the frozen
  model through the production `SessionEngine`; shadow-baseline (A8) + offline fresh-state (A1) +
  override-target (A9) instrumentation + complete `reconstruct_session`; parameter calibration +
  sensitivity and the **Phase 0 gate** (stable in sim; recovers synthetic capability, beats a
  no-learning baseline). **RECOMMEND-ONLY — no value adopted (`constants.py` unchanged); the verdict
  is provisional until the proposed gate thresholds are ratified.** (`sim/`, schema v6, 125 tests.)
- **Parameter-adoption review (done) — NO ADOPTION:** the fine-grid Sprint 4 evidence did not improve
  any current value (κ/τ already optimal-and-sensitive; σ²_ref + decision thresholds unexercised), so
  all parameters remain unchanged. Future re-review requires an extended harness (conflict /
  progress-regress / varied-rest scenarios). (`reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md`.)
- **Post-Sprint-4 delta tranche (done) — advisory pivot + M5 + seeding/preference/repoint:**
  DX-07/04/03 → M1 → DX-11 → DX-09/M5 → **DX-08/10/12**. See §4 callout.
- **Wave-2 backend (done) — API shell over the frozen model:** BB-1/9/14/19 … the additive `app/` web
  layer wrapping the DX-11 runtime (idempotency, per-token authz, bounds, server clock, A8-in-path,
  reconstruct, observability, migration/erasure mechanisms). `pytest`-green; **Schema v11, 284 tests**.
- **Next (off-host — no remaining on-host code):** the **deployed environment** + backups + monitoring
  (Ops), the **iOS app** (Mobile), and the **consent/enrollment pipeline** (Product/Ops — carrying the
  deferred OD-3 email-recovery build), then **cohort recruitment (Phase 1)** with instruments live from
  day one. **Phase 1 gate: A7 seed safety, week 1 — armed (BB-11, OD-8 thresholds).**
- **~~Sprint 6 — Investigation Engine~~ (retired):** the active ES-013 investigation engine is **not
  built**; its plateau role is filled by read-only **M5 stagnation detection** (DX-09, shipped). The
  **Trust metric** (ES-012 TrustScore + operator dashboard) remains a later-phase item; Phase-0
  instruments (shadow baseline A8, de-biased error) are built. **Phase 2 gate: learning beats shadow
  baseline; trust measurable and earned.**
- **Phase 3 (post-MVP):** durability/convergence on real athletes, delegation, per-athlete
  recovery learning, effort identifiability — the assumptions the MVP cannot reach.

---

## 6. Open assumptions (from the Assumptions Register)

Ranked by risk; the existential four are the product's foundation and the MVP cannot fully
test them — risk and testability are inversely correlated.

**Existential:** A1 capability recoverable from confounded observations · A2 coupled loop
converges · A3 trust measurable through behavior · A4 athletes will delegate.

**High:** A5 effort/fatigue separable (needs RIR, which the product refuses) · A6 per-athlete
recovery (τ) learnable (unidentifiable at MVP N — **ship fixed population τ**) · A7 seed
safety across cohorts (**fully testable week 1; recruit for cohort diversity**) · A8 de-biased
error is a valid model-quality signal (testable only directionally — shadow-baseline paired
comparison) · A9 overrides interpretable (fully testable — log override targets).

**Data the model needs but does not collect:** bodyweight (dimensionally required for Class-B;
absent from the frozen Athlete entity), proximity-to-failure/RIR (dominant fatigue input,
refused as an Anti-Requirement), off-catalog exercise identity, life context.

**Non-negotiables for the validation program:** the Phase 0 simulation harness is the only
access to A2 and the safe place to calibrate κ, τ, σ²_ref; instrumentation (shadow baseline,
fresh-state checks, probes) must be live before the first real session, or three existential
and two high-risk assumptions are untestable by construction.

**The honest contract:** a successful MVP proves Hush is safe, interpretable, and probably
good. It does not prove Hush is correct over the long run or that it has earned authority.
Every conclusion the system emits must carry what it could not exclude — that is the measure
of its honesty about what it does not know.
