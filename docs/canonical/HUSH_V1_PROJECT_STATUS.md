# HUSH_V1_PROJECT_STATUS.md — Status Anchor (current: close of DX-09 / M5)

> **Canonical project status document.** This is the authoritative, rolling record of what
> is built, what is deferred, and what is known to be unproven — **current as of the close
> of DX-09 (M5 stagnation)**. It supersedes `CURRENT_STATUS.md.md` as the single status anchor. It does
> not redesign the frozen model; every claim traces to a frozen specification (see
> `HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`) or to delivered, tested code.
> Per-sprint completion records live in `reviews/completion/` — the latest is
> `reviews/completion/DX-09_COMPLETION_REPORT.md`. Sections 1–7 below retain the Sprint 2
> completion detail (still accurate for the fatigue/variance build); the Sprint 3A, 3B-1,
> 3B-2, and 4 deltas are the callout blocks further below; **the post-Sprint-4 delta tranche
> (DX-07/04/03, M1, DX-11, DX-09) is the callout block immediately below.**

- **Date:** 2026-06-12
- **Model:** Hush v1 — **advisory** (Hush recommends; the athlete decides; not a load-authority system)
- **Build:** Sprint 0 ✅ · 1 ✅ · 2 ✅ · 3A ✅ · 3B-1 ✅ · 3B-2 ✅ · 4 ✅ · Wave 1 ✅ · DX-07 ✅ ·
  DX-04 ✅ · DX-03 ✅ · **M1 (DX-01/02/20/05/06/19) ✅** · DX-11 ✅ · **DX-09 / M5 ✅** · DX-08 ✅ ·
  DX-10 ✅ · DX-12 ✅ · **Wave-2 backend (API shell, B1–B5) ✅** · **BB-16 seed-coverage gate ✅** ·
  **BB-17 equipment coverage ✅ (resolved — V1 = commercial gym)** · **BB-32 validation export ✅ (+BB-23 metrics)** ·
  **BB-28 observability ✅ (backend half)** · **BB-5/BB-3 migration+backup mechanism ✅** ·
  **BB-11 A7 gate ARMED ✅ (OD-8 thresholds ratified)** · **OD-2 erasure ✅ (logical anonymization)**
- **Tests:** 284 passing — model golden runner **189** (sprint0 19 · seed_validation 6 · sprint1 12 ·
  sprint2 27 · sprint3a 18 · sprint3b1 22 · sprint3b2 26 · equipment_coverage 9 · sprint4 23 · wave1 12 ·
  sprint5 3 · sprint6 12) + **API pytest 95** (core 19 · connection 7 · instruments 4 · metrics 5 · gate 8 ·
  observability 15 · migrate 12 · erasure 8 · ops_monitor 17). One gate: `python build/_verify/assemble_and_test.py`.
  (Reconciliation 2026-06-12: header was 264/API-75 pre-BB-22/BB-27; live gate is **284** — the §4 table
  below retains the Sprint-4-close snapshot, see its reconciliation note.)
- **Schema version:** 11 (migration_007 bodyweight v7 · migration_008 session_progress v8 ·
  migration_009 stagnation_marker v9 · migration_010 web-shell infra — idempotency_key, auth_token — v10 ·
  **migration_011 erasure_record — OD-2 right-to-erasure — v11**)
- **Governing rule:** no redesign without explicit model review

> **Wave-2 backend tranche (API shell over the frozen model) ✅ (2026-06-12).** Additive web layer
> (`app/`) wrapping the frozen pipeline behind the frozen `API_CONTRACT_V1.md`; the API computes no
> load/score/decision. **Closed (code):** BB-13 (assembled pytest-green tree), BB-9 (connection-per-
> request + serialized writer + re-entrant txn), BB-14 (full §4 surface), BB-1 (idempotency/anti-
> replay), BB-2 (atomicity, fault-rollback verified), BB-19/20/24 (per-token authz no-IDOR, hashed
> tokens, throttling), BB-8 (bounds; effort/RIR→422), BB-4/6/7 (version stamping / server clock /
> lossless override), BB-10 (A8 shadow in path), BB-12 (reconstruct_session), BB-23/25 (operator
> enrollment/token mint, partial), BB-31 (pinned deps + Dockerfile). Report:
> `reviews/completion/WAVE_2_BACKEND_COMPLETION_REPORT.md`; deploy/ops handoff: `deploy/README.md`.
> **Product decisions OD-2/3/4/8 RATIFIED 2026-06-12** (see `HUSH_V1_OPEN_ITEMS.md` §1 + the ratified
> baseline) → unblocked code shipped same day: **OD-8 → BB-11 ARMED** (A7 thresholds 0.0/0.80/5);
> **OD-2 → erasure mechanism built** (`erase_athlete` + migration 011, v11); **OD-4 → no V1 code**
> (HealthKit not a model input); **OD-3 → ratified; impl DEFERRED (no partial build) → bundled into the
> future enrollment/consent/email-delivery workstream (BB-33 + BB-30)**.
> **Open (NOT code on this host — Operations / Mobile / consent):** BB-30/21/22/27/29 ops infra +
> the **live runs** of BB-3/5/28 against the deployed env; BB-15/26 iOS app; BB-33/35/37
> consent/compliance + the OD-3 email-recovery build. **The executable before-beta backend surface is
> complete.**

> **Post-Sprint-4 delta tranche (DX-07/04/03 → M1 → DX-11 → DX-09 / M5).** The model pivoted from a
> load-authority posture to an **advisory** one and gained read-only stagnation detection:
> - **DX-07** — `bodyweight_kg` collected (migration_007, schema v7; `AthleteState` + `onboard` + profile contract).
> - **DX-04 (M4)** — exploration auto-substitution **off** by default (`P_EXPLORE=0.0`); composition is preference-stable.
> - **DX-03 (M3)** — the ES-006 L1 governor is **advisory**: it computes KEEP/INCREASE/DECREASE + reason
>   and surfaces them, but emits the **held** load; the one-step move is never applied.
> - **M1 (DX-01/02/20/05/06/19)** — the athlete-logged `actual_weight` is a **learning input** (quality
>   evaluated at the actual load; honest heavier-load/fewer-reps rescued 0.3→1.0); future programs are
>   built from the score-derived `target_load`, not the held anchor. API contract + F1 report reversed.
> - **DX-11** — event-driven set-report primitive (`SessionRuntime`) + persisted `session_progress`
>   accumulator (migration_008, v8); differential-replay is **bit-for-bit** with `SessionEngine`.
> - **DX-09 / M5** — read-only, advisory **stagnation detection** (5 trend states + imbalance) over the
>   learned score history, surfacing ≤1 insight / ≤1 advisory CHANGE_STRATEGY / ≤1 acceptance-gated volume
>   option per week, 4-week cooldown (migration_009, v9). **ES-013 active investigation is NOT shipped —
>   detection = M5.** M5 applies nothing.
>
> **All three now SHIPPED (2026-06-12):** DX-08 (Option D bodyweight-keyed seeding — replaced the 3-bucket
> seed), DX-10 (sticky exercise preference — `PREFERENCE_STICKY`/demote replaced the bounded
> `PREFERENCE_NUDGE`), DX-12 (Phase-0 instrumentation/gate repoint — validation-only reframe). The model
> delta is complete; documentation aligned in DX-13…18 (2026-06-12).
> ① core math unchanged throughout; no parameter adopted (model review 2026-06-10).

> **Sprint 4 close (Instrumentation & the Phase 0 simulation/calibration harness).** Built the Build
> Plan's Phase 0 modules — a **simulation harness** driving the frozen model through the production
> `SessionEngine` over synthetic cohorts; **validation instrumentation** (shadow baseline A8,
> override-target logging A9, offline fresh-state recoverability A1, complete `reconstruct_session`);
> and a **parameter-calibration + sensitivity framework** ending at the **Phase 0 gate**. The
> `override_parameters` context manager patches the exact production binding sites and restores them
> (the calibration-target constants are bound at import/def time), so sweeps drive the real path
> without leaking. **RECOMMEND-ONLY (Q1): no parameter was adopted** — `constants.py` is unchanged;
> sweeps produced recommendations + evidence for a separate adoption review. **Phase 0 findings:** the
> loop is **stable** (no oscillation/drift/ratchet) and **recovers** hidden synthetic capability
> (beats a no-learning baseline), with a documented *conservative-discount equilibrium bias* (settles a
> few score units above true) and κ/τ flagged knife-edge-sensitive; the verdict is **provisional until
> the proposed gate thresholds are ratified** (Q5). Schema v6 (additive migration 006); 125 tests (105
> prior bit-for-bit + 20 new).

> **Parameter-adoption review close (RATIFIED 2026-06-10): NO ADOPTION.** A formal model review
> (`reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md`) re-ran the sweeps on a fine grid centered on
> the baselines and found that **all reviewed parameters should remain unchanged**: κ, τ_sys, τ_cap are
> already at the convergence-error minimum (and knife-edge-sensitive — a change degrades recovery);
> σ²_ref and the decision thresholds (`DECISION_CONF_GATE`, `SURPRISE_DEADBAND`) are **unexercised** by
> the present stable-truth scenarios (no adoption evidence). `constants.py` is untouched; no test
> re-baselined. Follow-up before any future adoption review: extend the harness with conflict /
> progress-regress / varied-rest scenarios. **Next: Sprint 5 (mobile app + cohort, Phase 1).**

> **Sprint 3B-2 close (Session Composition + Volume + live fatigue ceiling).** Built the **ES-009
> Session Composition Engine** (four stages: Class-A-restricted frozen templates → calibration
> info-gain / steady-state focus priority → per-slot selection via `catalog.select` + the
> **exploration floor** → `CAPABILITY_PRIORITY_ORDER` ordering) and the **ES-009.1 Volume Engine**
> (two-lever slots×sets, focus weighting, calibration restraint; sole owner of `target_sets`),
> coupled (009.1 runs inside 009). The **ES-011 session fatigue ceiling is now live** (`SESSION_
> FATIGUE_CEILING = 24`, **PROVISIONAL/UNVALIDATED/CALIBRATION-REQUIRED**) with a **trim-only
> recovery gate** (drop lowest-priority slots; never rebuild). A new **`SessionEngine` driver**
> composes → persists → runs multi-set blocks → advances ES-006 decision memory **once per
> capability** (primary slot drives; R2). Exploration is **fully deterministic from a persisted
> seed** (R4); composition is **load-free** (Inv. 3); single-capability slots only (guarded).
> Class-A only — 5/5 coverage re-proven; 7-cap templates frozen inactive. Schema v5 (additive
> migration 005); 105 tests (82 prior bit-for-bit + 23 new). **Next: Sprint 4 — instrumentation +
> Phase 0 calibration harness.**

> **Sprint 3B-1 close (Foundation + REPLACE).** Built the prerequisite foundation ES-009/009.1
> assume: the **ES-002 exercise catalog** (code-resident, Class-A only, canonical + ≥1 alternate;
> canonical `difficulty_factor`/`exercise_cost = 1.0` — parity firewall), **StrategyState**
> (`weekly_frequency`, `weekly_volume` enum, focus), **PreferenceState** (`exercise_family`,
> `preference_score=50`; one bounded provisional nudge — no learning engine), and
> **`global_confidence = mean(Class-A confidences)` + `calibration_phase` (<70)**, derived not
> stored. **L2 `REPLACE_EXERCISE` is now live** — preference-driven, never performance-driven,
> capability-preserving, audit-reconstructable. The Sprint 3A decision-memory update was
> **relocated to a single `complete_block()` hook** shared by the rested and fatigue-aware paths
> (no duplicated governor; block surprise = `s_obs − score_at_block_entry`, once per block).
> Migration 004 additive/idempotent (schema v4); default-on-absence == freshly-seeded. **Next:
> Sprint 3B-2 — ES-009 composition + ES-009.1 volume + ES-011 fatigue ceiling (Class-A only).**

> **Sprint 3A close (ES-006 Decision Hierarchy).** Full L1 KEEP/INCREASE/DECREASE shipped
> as a **governor / rate-limiter over the ES-005.1 score-derived target** — single load
> formula preserved (Invariant 3). Stability guard (`STABILITY_N=3` on the fatigue-adjusted
> surprise), confidence gate, one-equipment-step progression, reset-on-fire, decision memory
> + `decision_type`/`target_load` audit. `decision.py` is the single live decision authority;
> `fatigue.decision_reason()` is superseded. REPLACE_EXERCISE and CHANGE_STRATEGY are
> signal-only. The governor is default-inert (engages only once decision memory exists, which
> only the opt-in governed path writes), so the rested/fatigue paths are unchanged. **Next:
> Sprint 3B — ES-009/009.1 session composition + volume (Class-A only).**

---

## 1. What was implemented (Sprint 2)

Sprint 2 delivered **ES-011 (Fatigue & Recovery)** and **ES-010 Part C (variance-suppressed
confidence)**, applying the two frozen ES-011 amendments deliberately (not as redesign):

- **ES-005.1 §4 amendment** — `effort_offset` is the *stable* component of the joint
  correction `correction = effort_offset + Fatigue_c`. **MVP value: `effort_offset = 0`**
  (Decision 3; A5 untestable without RIR).
- **ES-010 Part A ordering amendment** — fatigue is removed **in rep space, before** the
  ES-005.1 conversion and **before attribution** (`evidence.py` reorder, ES-011 C.3).

Delivered mechanism:

| Area | Spec | Delivered |
|---|---|---|
| Fatigue generation | ES-011 A.4 | `set_fatigue = κ·rel_load·reps·proximity·exercise_cost` (`fatigue.py`) |
| Accumulation | ES-011 A.5 | systemic += full cost; capability += `w_c`·cost (same ES-010 `w_c`) |
| Recovery / decay | ES-011 D | `Fatigue·e^{−Δt/τ}`, **fixed population τ** (`recovery.py`) |
| De-fatigue ordering | ES-011 C.3 | rep-space add-back before conversion/attribution; exact ≡ score-space add-back |
| Surprise discrimination | ES-011 C.1 | `surprise = S_obs_raw − (score − est_fatigue)` |
| Fatigue-adjusted prediction | ES-011 B.1 | predict from `score − Fatigue_c` (`prediction.py`) |
| Fatigue-aware recommendation | ES-011 B.2/B.3 | hold load + cut reps first; drop weight only below the rep floor; `fatigue_hold`; **INCREASE structurally vetoed** |
| Variance-suppressed confidence | ES-010 C.2 | decay-weighted moments → `agreement` → multiplies the saturation curve (`variance.py`, `confidence.py`) |
| Learning-rate damping | ES-010 C.4 | effective weight = `w_i · agreement` (`state_update.py`) |
| Persistence + audit | ES-011 E | fatigue state, variance moments, and assumed-fatigue/agreement audit persisted; transactional `report_set_fatigue_aware` |
| Migration | Build Plan §3 | additive, idempotent `migration_002_fatigue.py` (schema_version=2) |
| Simulation | Build Plan §7 | synthetic athlete gains an **independent** (non-circular) fatigue/recovery generator |

**Design property that protects the prior build:** every change is backward-compatible by
default (new params default to zero-fatigue / `agreement = 1.0`), so the Sprint 0/1 rested
path is provably unchanged — the 19 prior tests pass bit-for-bit.

**Variance suppression treated as infrastructure, not calibration** (accepted constraint):
accumulators + agreement + wiring shipped; `σ²_ref` is provisional and was **not tuned**.

---

## 2. What remains deferred

Deferred items are stubbed at clean boundaries (forward-referenced, not redesigned around):

- **Decision hierarchy (ES-006)** — **L1 KEEP/INCREASE/DECREASE done in Sprint 3A** (governor
  over the ES-005.1 target, cross-session). **L2 REPLACE_EXERCISE went live in Sprint 3B-1**
  (preference-driven, on the ES-002 catalog + PreferenceState). CHANGE_STRATEGY signal-only (ES-013).
- **Session composition + volume (ES-009 / ES-009.1)** — **BUILT in Sprint 3B-2** (Class-A only):
  four-stage composition, two-lever volume, the **live ES-011 fatigue ceiling** (`SESSION_FATIGUE_
  CEILING=24`, provisional; trim-only recovery gate), the exploration floor (deterministic from a
  persisted seed), and multi-set/multi-slot blocks via the 3B-1 `complete_block()` hook (one
  governor update per capability). Class-B/C slots stay deferred (7-cap templates frozen inactive).
- **`CHANGE_STRATEGY` on chronic systemic fatigue (ES-011 B.3)** — signal only; licensing
  requires a completed investigation (ES-013).
- **Investigation Engine + probes (ES-013)** — plateau resolution, mode controller.
- **Trust Measurement (ES-012)** — TrustScore, shadow-baseline analysis, operator dashboard.
- **Per-athlete τ learning (ES-011 D.3 / A6)** — ship fixed τ; revisit Phase 3.
- **`effort_offset` identification (A5)** — needs RIR (Anti-Requirement); ships at 0, flagged.
- **Parameter calibration (κ, τ, σ²_ref)** — **Phase 0 simulation responsibility.** Until
  then the fatigue/variance correction is *directional, not calibrated* (ES-011 closing note).
- **Phase 0 stability/calibration harness, API, mobile app** — later sprints.

---

## 3. Current architecture state

**One model package + a persistence layer; synchronous; single SQLite database.** No
microservices, queue, or network state boundary (System Architecture; Build Plan).

**Engines:**

| Engine | State | Notes |
|---|---|---|
| Prediction (ES-004/005.1/011) | ✅ built | fatigue-adjusted (`score − Fatigue_c`) |
| Evidence (ES-004/010) | ✅ built | load-space attribution; de-fatigue ordering (C.3) |
| State Update (ES-007/005.1/010 C) | ✅ built | precision blend + variance-damped weight + suppressed confidence; **sole state writer** |
| Recommendation (ES-006/005.1/011) | ✅ built (L1+L2) | governor over ES-005.1 target: KEEP/INCREASE/DECREASE + stability guard + confidence gate + fatigue gating (Sprint 3A); **L2 REPLACE_EXERCISE live (Sprint 3B-1)** |
| Fatigue & Recovery (ES-011) | ✅ built | generation, fixed-τ decay, de-fatigue, veto; **live session ceiling + trim-only recovery gate (3B-2)** |
| Workout / Session (ES-001/009/009.1) | ✅ built | ES-001 hierarchy; catalog/Strategy/Preference (3B-1); **ES-009 composition + ES-009.1 volume + session driver (3B-2)**, Class-A only |
| Investigation (ES-013) | ✗ **retired in v1** | active investigation/mode-controller not built; **replaced by M5 stagnation detection** (DX-09) |
| Stagnation / M5 (Product Spec §12/§13) | ✅ built (DX-09) | read-only, advisory; 5 trend states + imbalance; ≤1 insight / ≤1 advisory rec / ≤1 acceptance-gated volume option per week; `hush_model/stagnation.py` |
| Trust Measurement (ES-012) | ◐ Phase-0 instruments only | shadow baseline (A8) + de-biased error built in Sprint 4; full TrustScore/authority deferred (Phase 3) |

**State zones (ES-Founder §34 / ES-001):**
- *Mutable projection:* `athlete`, `athlete_state` (+ `fatigue_systemic`, `last_workout_at_week`),
  `capability_state` (+ `fatigue`, variance moments `var_w/var_ws/var_ws2`).
- *Immutable history:* `workout_session → exercise_block → set_record`, `observation`,
  `evidence`, `recommendation` (+ assumed-fatigue), `state_update_log` (+ agreement, σ²_recent,
  fatigue). Append-only; version-stamped.
- *Mutable projection (Sprint 3A):* `capability_state` also carries the ES-006 decision
  memory (`last_recommended_weight`, `last_decision`, `consecutive_positive/negative`,
  `last_decision_week`); `recommendation`/`state_update_log` carry `decision_type` (+ `target_load`).
- *Mutable projection (Sprint 3B-1):* new `strategy_state` (`weekly_frequency`, `weekly_volume`
  enum, `primary/secondary_focus`) and `preference_state` (`exercise_family`, `preference_score`)
  tables; `recommendation` carries REPLACE audit (`replaced_from_exercise`, `replace_reason`).
  `global_confidence`/`calibration_phase` are **derived** (mean of Class-A confidences; <70), not
  stored. The ES-002 catalog is **code-resident reference data** (`catalog.py`), not in the DB.
- *Immutable history (Sprint 3B-2):* `workout_session` carries the ES-009 composition snapshot
  (`exploration_seed`, `session_index`, `weekly_frequency`, `weekly_volume`, `calibration_phase`)
  and `exercise_block` carries `selection_reason` — so a composed session reconstructs its template,
  volume, exploration draw, and "why this exercise" (Inv. 7). Composition writes no mutable state.
- *Immutable history (Sprint 4):* `shadow_recommendation` (A8 paired comparison) + `observation`
  override-target columns (A9) — written only by the Phase 0 harness / live instrumentation; empty on a
  non-instrumented DB. The simulation harness lives in `sim/` and drives the production path.
- *Bookkeeping:* `schema_version` (=6).

**Invariants holding:** decisions read from state not history; history immutable / state
mutable; recommendation ⇄ learning share one inverted model (round-trip exact, incl. the new
rep-space de-fatigue); `observed = capability − fatigue` now realized; single state writer;
transactional atomicity; every conclusion carries the fatigue/agreement it assumed.

**Operating modes:** Recommendation Mode only, now **advisory** (the athlete owns load; the ES-006
governor and ES-011 fatigue gating are advisory — DX-03/DX-20). Investigation Mode and the
`Fatigue/Safety > Investigation > Recommendation` precedence are **retired in v1** (ES-013); read-only
**M5 stagnation detection** (DX-09) is the v1 plateau path and applies nothing.

---

## 4. Current test counts

| Suite | Count | Scope |
|---|---|---|
| Sprint 0 | 12 | golden values, round-trip, decay/confidence anchors, closed-loop recovery |
| Sprint 1 | 7 | persistence, ES-001 hierarchy, transactional rollback, audit chain, **pure↔persisted parity** |
| Sprint 2 | 27 | zero-fatigue identity, generation/accumulation/decay, C.3 ordering, surprise (C.1), ES-010 C suppression + damping + Contradiction 4, recommendation gating/order, persisted fatigue audit, migration, harness stability |
| Sprint 3A | 18 | governor branches (KEEP/INCREASE/DECREASE, gate, step-to-target, conflict), streak update + fatigue-can't-manufacture-DECREASE, cold-start parity + no-double-discount, MR2 memory round-trip, migration 003, multi-session sequencing harness (stability guard → INCREASE, streak persistence, reset-on-fire) |
| Sprint 3B-1 | 18 | catalog integrity + parity firewall, StrategyState/PreferenceState round-trip, global_confidence=mean + calibration boundary @70, migration 004, default-on-absence==seeded, REPLACE preference-driven/audited, nudge clamp, block-completion hook |
| Sprint 3B-2 | 23 | Class-A 5/5 coverage + templates-are-7cap-minus-inactive; frequency clamp; calibration-info-gain vs steady-focus priority; times_trained restricted; two-lever volume tables + **documented band collapse (Q3)**; focus volume; calibration restraint; **exploration determinism-given-seed / never-in-calibration / class-safe (R4)**; preference + distinct second slot; Stage-4 `CAPABILITY_PRIORITY_ORDER` ordering; single-capability guard; **trim-only ceiling (Q2)** + never-exceeded-under-Class-A; driver audit + **one governor update per capability (R2)** + seed reconstructable; migration 005 additive/idempotent + fresh-vs-migrated parity; 70-boundary flip |
| Sprint 4 | 20 | `override_parameters` take-effect + restore (HD1) + globals/kwdefaults + reject-non-targets; constant-stable-bounded / improver-rises / recovery-converges (R2) / fatigued-recovers; determinism; shadow fixed+state-free (R5) + rows recorded + paired metric + inert-when-not-instrumented; override logging (A9) + complete reconstruction; migration 006 additive/idempotent + fresh-vs-migrated; metric detectors; calibration recommends-without-adopting (Q1) + under-exercised report + gate-raw-first (Q5) + recommend-only guard |
| **Sprint 0–4 subtotal** | **125** | all passing (the table above is the Sprint-4-close snapshot) |
| **+ post-Sprint-4 model deltas** | **+64** | Wave 1 / DX-07/04/03 / M1 / DX-11 / DX-09-M5 / DX-08/10/12 → model golden **189** |
| **+ Wave-2 backend (API pytest)** | **+95** | core 19 · connection 7 · instruments 4 · metrics 5 · gate 8 · observability 15 · migrate 12 · erasure 8 · ops_monitor 17 |
| **Current total** | **284** | model golden **189** + API pytest **95** — schema **v11** |

> **Reconciliation note (2026-06-12).** The detailed table above is preserved as the *Sprint-4-close*
> snapshot (125 tests, schema v6). The **current** as-built suite is **284** (model golden 189 + API
> pytest 95) at **schema v11** — the authoritative breakdown is in the header of this document.

The 105 Sprint 0–3B-2 tests pass **bit-for-bit** post-Sprint-4, and the golden baseline held bit-for-bit
across the entire post-Sprint-4 delta tranche: the harness/instruments are additive and default-inert
(new tables empty unless the harness records), `SessionEngine` is unchanged, and **no model constant
value changed** (recommend-only — a test asserts the calibration targets are unchanged).

**Verification status (updated 2026-06-12):** the snapshot→assemble→test workflow is now the **single
gate** — `python build/_verify/assemble_and_test.py` assembles the documented `hush_model/ + sim/ + app/
+ tests/` tree from the snapshot files and runs the model golden runner **and** API `pytest` (BB-13
closed — assembled, runnable, `pytest`-green service tree). Current result: **284 passing**. The
per-sprint snapshots remain the editable source of truth (`ATD-1`, by design).

---

## 5. Known limitations

1. **κ, τ, σ²_ref are provisional/UNVALIDATED.** They exist so the engine runs; they have no
   external anchor (unlike `A_c`/`k`). The fatigue and variance corrections are **directional,
   not calibrated** until the Phase 0 harness sets them. *Do not tune them to fit a scenario.*
2. **`effort_offset = 0`.** Effort/fatigue separability (A5) is unidentifiable without RIR;
   every fatigue/effort-dependent conclusion must be flagged un-separated (Invariant 7).
3. **Fixed population τ.** Per-athlete recovery (A6) is not learned at MVP N.
4. **Single-capability blocks.** Multi-capability attribution exists, but de-fatigue uses one
   rep count with `w_c`-combined fatigue (exact for single-capability, an approximation for
   multi-capability — per the C.3 ordering trade-off). Sprint 1/2 exercise single-cap only.
5. **Session composition / volume / fatigue ceiling BUILT (Sprint 3B-2), with provisional knobs.**
   `SESSION_FATIGUE_CEILING=24` is **PROVISIONAL/UNVALIDATED/CALIBRATION-REQUIRED** and effectively
   inert under Class-A (session total never exceeds 24). **Band collapse (accepted Q3):** under
   Class-A `times_trained` collapses to 1 for once-trained capabilities, so `moderate==high` for
   them (low stays distinct; twice-trained caps stay distinct) — a restriction consequence, not an
   ES-009.1 defect. With default `focus=null` every capability takes the ×0.75 multiplier (literal
   ES-009.1 §3) — flagged for Phase-0 model review. `P_EXPLORE=0.10` provisional (deterministic
   given the persisted seed). Single-capability slots only; the C.3 approximation stays dormant.
6. **`PREFERENCE_NUDGE` is provisional/UNVALIDATED** (Sprint 3B-1) — the single bounded
   preference step has no external anchor (like κ/τ); it is the minimal slice, not a learning
   engine. *Do not tune it.* **`CHANGE_STRATEGY` is signal-only** — no investigation to license it.
7. **Instrumentation + Phase 0 harness + API now BUILT (not yet deployed).** The validation instruments
   (shadow baseline A8, override log A9, offline fresh-state A1) shipped in Sprint 4 and are live in the
   Wave-2 request path (BB-10); the backend API + auth + observability are built and `pytest`-green
   (Wave-2). **Still not live:** the deployed environment (Ops) and the **iOS app** (Mobile). *(This
   item was "nothing built" at Sprint-2 close; retained here re-stated.)*
8. **Repo layout:** snapshots ≠ assembled package; the runnable tree and `pytest` are not in
   this checkout (see §4).
9. **Existential assumptions (A1–A4) remain unreachable in MVP** by construction — a successful
   MVP proves *safe, interpretable, probably good*, not *correct over the long run*.

---

## 6. Recommended next sprint

> **Update (2026-06-12).** The gated parameter-adoption review below **closed with NO adoption**
> (2026-06-10); the post-Sprint-4 delta tranche (DX-07/04/03 → M1 → DX-11 → DX-09/M5 → **DX-08/10/12**)
> has shipped; and the **Wave-2 backend (API shell, BB-1/9/14/19 …)** wrapping the DX-11 runtime is built
> and `pytest`-green. **The executable on-host model + backend surface is COMPLETE.** Actual next is no
> longer code on this host — it is **off-host**: the deployed environment (Ops — BB-30/21/22/27/29), the
> **iOS app** (Mobile — BB-15/26), and the **consent/enrollment pipeline** (Product/Ops — BB-33/35/37,
> which also carries the deferred OD-3 email-recovery build), then cohort recruitment (Phase 1) gated by
> the **armed A7 seed-safety check** (BB-11). ES-013 active investigation is retired (detection = M5). The
> paragraphs below are retained as the original Sprint-4-close recommendation.

**(Historical — Sprint-4 close.) A gated parameter-adoption review, then Sprint 5 — Mobile app (6 screens) + cohort recruitment (Phase 1).**

Sprint 4 stood up the Phase 0 instruments + harness and produced **recommended** parameter values +
evidence (κ ~×1.5, τ_sys ~×1.5, σ²_ref ~×0.5, gate/deadband lower; κ/τ knife-edge-sensitive) — but
**adopted nothing** (Q1). The next step is therefore a **separate, explicit adoption review**: present
the evidence, decide which values to adopt, update `constants.py`, and **deliberately re-baseline the
affected golden tests** (adoption changes behavior; it is a model-review act, not a silent edit).

After adoption, the program proceeds to **Phase 1** — Sprint 5 mobile app + cohort recruitment, with the
Sprint 4 instruments (shadow baseline, override logging, fresh-state) live from day one (Build Plan),
gated by the **A7 seed-safety** week-1 check. Then Sprint 6 — Investigation Engine + Trust metric
(ES-013/ES-012), the Phase 2 gate. (Live fresh-state probe slots remain deferred to ES-013.)

---

## 7. Updated repository status

```
docs/canonical/   HUSH_V1_PROJECT_STATUS.md   <- THIS FILE (canonical status)
                  HUSH_V1_INDEX / EXECUTION_CONTEXT / SPEC_MANIFEST / TRACEABILITY
docs/architecture, docs/assumptions, docs/founder, specs/   frozen v1 document set
reviews/planning/   SPRINT_2_PLANNING_REVIEW.md
reviews/completion/ (this report is mirrored as the canonical doc above)
implementation/sprint0/  pure model loop + synthetic athlete (edited in place for Sprint 2)
implementation/sprint1/  persistence, hierarchy, pipeline (edited in place for Sprint 2)
implementation/sprint2/  fatigue.py, recovery.py, variance.py, migration_002_fatigue.py,
                         test_sprint2.py, README.md
implementation/sprint3a/ decision.py, migration_003_decision.py, test_sprint3a.py, README.md
                         (edits in place: constants/domain/recommendation/schema/repositories/pipeline)
implementation/sprint3b1/ catalog.py, preference.py, migration_004_foundation.py, test_sprint3b1.py
implementation/sprint3b2/ composition.py, volume.py, session.py, migration_005_composition.py,
                         test_sprint3b2.py, README.md
                         (edits in place: constants/schema/repositories/pipeline)
implementation/sprint4/  parameters.py, shadow.py, harness.py, scenarios.py, metrics.py, calibration.py,
                         gate.py, migration_006_instrumentation.py, test_sprint4.py, README.md
                         (edits in place: schema/repositories/service)
reviews/planning/        + SPRINT_4_PLANNING_REVIEW, SPRINT_4_IMPLEMENTATION_PLAN, SPRINT_4_CODE_READINESS_REVIEW
build/_verify/           assemble_and_test.py (snapshot -> hush_model + sim trees; plain-assert runner)
```

- **Model:** Hush v1 — advisory. **Sprints:** 0, 1, 2, 3A, 3B-1, 3B-2, 4 + Wave 1 + DX-07/04/03 +
  M1 + DX-11 + DX-09/M5 + **DX-08/10/12** + **Wave-2 backend (API shell)** complete. *(The `implementation/`
  layout block above is the Sprint-4-close snapshot; later deltas add `sprint5/` (runtime, migration_008),
  `sprint6/` (stagnation, migration_009), and the `app/` web layer (migrations 010 web-shell, 011 erasure).)*
- **Tests:** **284 passing** (model golden 189 + API pytest 95).
- **DB schema version:** **11** (migration_007 bodyweight · 008 session_progress · 009 stagnation_marker ·
  010 web-shell infra — idempotency_key/auth_token · 011 erasure_record — OD-2 right-to-erasure).
- **Canonical docs updated (DX-15, 2026-06-12):** all of `HUSH_V1_PROJECT_STATUS` / `EXECUTION_CONTEXT` /
  `SPEC_MANIFEST` / `TRACEABILITY` / `INDEX` / `OPEN_ITEMS`, + `README.md.md`, `CURRENT_STATUS.md.md`.
- **Next (off-host — no remaining on-host code):** deployed environment + backups + monitoring (Ops —
  BB-30/21/22/27/29), the **iOS app** (Mobile — BB-15/26), and the **consent/enrollment pipeline**
  (Product/Ops — BB-33/35/37, carrying the deferred OD-3 email-recovery build), then cohort recruitment
  (Phase 1) gated by the armed A7 check (BB-11). DX-08/10/12 and the Wave-2 backend are shipped; the
  post-Sprint-4 parameter-adoption review is **closed with NO adoption**
  (`reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md`).
- **Provisional, REVIEWED and KEPT UNCHANGED (model review 2026-06-10 — adopt nothing; all values
  remain at their current provisional settings):** κ, τ_sys, τ_cap, σ²_ref, `DECISION_CONF_GATE`,
  `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`, `SESSION_FATIGUE_CEILING`, `P_EXPLORE`, the 8/12/18 bands /
  lever clamps, the null-focus multiplier. Future re-review requires an extended harness (conflict /
  progress-regress / varied-rest scenarios).

---

*This document is the canonical entry point for project status. For the frozen model itself,
start at `HUSH_V1_EXECUTION_CONTEXT.md`; for rule origins, `HUSH_V1_TRACEABILITY.md`.*
