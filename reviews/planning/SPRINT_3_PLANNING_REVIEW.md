# Sprint 3 Planning Review — Decision Hierarchy (ES-006) & Session Assembly (ES-009 / ES-009.1)

> Planning and readiness review for Sprint 3. Produced before any Sprint 3 code is written. It does **not** redesign the frozen model; it plans the faithful implementation of ES-006/009/009.1 and surfaces the prerequisites those specs silently assume. Every scope claim traces to a frozen spec (`HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`). Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-09 · Model: Hush v1 (frozen) · Build: Sprint 0 ✅ · 1 ✅ · 2 ✅ (46 tests) · No code written.

> **STATUS: ACCEPTED (2026-06-09).** Ratified decisions (see §7):
> 1. **Approved the Sprint 3 split** — Sprint 3A = ES-006 Decision Hierarchy; Sprint 3B = ES-009 + ES-009.1 Session Composition.
> 2. **Approved Class-A-only composition for Sprint 3B** — `vertical_pull` (Class B) and `core_stability` (Class C) remain inactive until their dedicated pipelines exist; the 7-capability templates are frozen but inactive.
> 3. **Approved the fatigue ceiling as a provisional constant**, pending Phase 0 calibration.
> 4. **Approved static volume bands** with signal-only band-change recommendations for future strategy changes.

## 0. Where we are (one paragraph)

Sprint 2 closed with fatigue/recovery live and the recommendation engine emitting the correct fatigue-aware **decision codes** (`fatigue_hold`, etc.) but **not running the cross-session decision tree**, and with the Workout/Session engine still at ES-001 hierarchy only — **no composition, no volume, no fatigue ceiling**. Sprint 3 is the first athlete-facing assembly sprint: it turns per-set load decisions into a standing cross-session policy (ES-006) and produces the ordered, volume-bearing `ExerciseBlock[]` skeleton that every downstream spec has been assuming since the Model Completion Roadmap's "Gap 2" (ES-009/009.1). The central planning finding is that **the two in-scope composition specs depend on three substantial pieces of infrastructure that are not built** (the ES-002 catalog, StrategyState, PreferenceState) and on **Class-B/C capability handling that the current 5-Class-A build cannot satisfy** — which is the basis for the split recommendation in §6.

---

## 1. Sprint goal

**Make the system decide across sessions and assemble a session.** Concretely, deliver two frozen capabilities that fatigue (Sprint 2) unblocked:

1. **ES-006 full decision hierarchy** — the cross-session KEEP / INCREASE / DECREASE / REPLACE policy (confidence-gated, oscillation-guarded, fatigue-vetoed) built on top of the fatigue-aware codes Sprint 2 already emits, with recommendation memory and explainable reasons. *Deepen the load decision the system already makes.*
2. **ES-009 + ES-009.1 session & volume composition** — the engine that decides *which* capabilities and exercises appear today (ES-009) and *how much* work each gets (ES-009.1), emitting the ordered `ExerciseBlock[]` skeleton ES-006 then loads — including the **ES-011 fatigue ceiling** (replacing the static `MAX_SESSION_SETS = 24`) and the **recovery gate**, now that fatigue state exists. *Add the breadth dimension the build has never had.*

The sprint succeeds when a deterministic, fully-reconstructable session is composed from capabilities → exercises → volume → loads, with every block traceable to (template, priority, selection rule, exploration seed, volume band, focus, fatigue ceiling) and the existing rested single-block path unchanged.

---

## 2. Scope

### 2A. In scope — the frozen mechanism

**ES-006 Decision Hierarchy** (canonical: ES-006 + ES-011 gating + ES-012 override metrics):
- L1–L5 hierarchy with the **"prefer the lowest level capable of solving the problem"** rule; V1 decision set `KEEP/INCREASE/DECREASE/REPLACE_EXERCISE/CHANGE_STRATEGY`.
- **Cross-session decision rule** on (prediction error × confidence) read **from projected state, not raw history** (Invariant 1 — see Risk R5).
- **Stability/oscillation guard**: a single observation rarely triggers change; require **2–3 consistent observations** (a streak/run projected into state).
- **Confidence gate** on step size, reconciled with the already-built ES-005.1 `safety_discount` (Risk R7).
- **Fatigue gating** (ES-011 B.2/B.3): INCREASE structurally vetoed while fatigue elevated; reduction order reps→sets→weight; DECREASE only when fatigue low. *(Codes already emitted in Sprint 2; Sprint 3 makes them drive the tree.)*
- **Recommendation memory**: `last_recommendation`, `last_accepted_recommendation`, `override_history`; "same evidence must not re-fire the same recommendation."
- **Explainability + audit chain**: every recommendation carries `decision_reason` and is reconstructable.

**ES-009 Session Composition** (canonical: ES-009; ordering per Principle #53):
- Stage 1 frozen split templates (freq 2/3/4; clamp others); Stage 2 priority (calibration info-gain vs steady-state focus); Stage 3 one exercise per slot (class-constrained, canonical-during-calibration, preference-at-steady-state, **exploration floor p≈0.10**); Stage 4 compound-first ordering, core last.
- Determinism + exploration-seed logging.

**ES-009.1 Volume Composition** (canonical: ES-009.1; ceiling per ES-011):
- `weekly_volume` enum (low/mod/high → 8/12/18 sets/cap); **two-lever** allocation (slots × sets); focus weighting (×1.25/×1.00/×0.75); calibration restraint (2 sets, 1 slot); runs **between ES-009 Stage 2 and Stage 3**.
- **ES-011 fatigue ceiling** replacing the static `MAX_SESSION_SETS=24` (ES-011 B.1) + **recovery gate** (down-weight/skip a capability whose fatigue has not recovered). Deterministic reduction order preserved.

### 2B. In scope but **currently unbuilt prerequisites** (the real cost of this sprint)

These are assumed-present by ES-009/009.1 and ES-006-REPLACE, but do not exist in the Sprint 0–2 build. They are *not* redesigns; they are frozen objects that were forward-referenced. **They must be built or explicitly stubbed, and they dominate the effort estimate:**

| Prerequisite | Required by | Current state |
|---|---|---|
| **ES-002 exercise catalog** (mappings, `difficulty_factor`, equipment, **class**, `replacement_group`, `exercise_family`) | ES-009 Stage 3, ES-006 REPLACE | catalog **deferred** (only `A_c` constants exist; Sprint 0–2 use single canonical exercises) |
| **StrategyState** (`weekly_frequency`, `weekly_volume` enum, `primary_focus`, `secondary_focus`) | ES-009 templates, ES-009.1 budget | **not built** (traceability: deferred) |
| **PreferenceState** (`exercise_family`, `preference_score`) | ES-009 steady-state selection, ES-006 REPLACE | **not built** (deferred) |
| **calibration_phase / global_confidence aggregate** (`<70 ⇒ calibrating`) | ES-009 Stage 2/3, ES-009.1 §5 | confidence is per-capability; the global aggregate + phase flag need confirming/building |

### 2C. Out of scope — deferred, stub at clean boundaries

- **Class-B (vertical_pull) and Class-C (core_stability) capabilities** as live slots — **RATIFIED: Class-A-only composition for Sprint 3B.** Composition runs over the **five Class-A capabilities only**; the 7-capability templates are frozen but inactive until B/C pipelines + bodyweight exist.
- **ES-013 Investigation-Mode probe-slot interaction** and the **investigation recovery gate** (manifest: ES-013 extends ES-009/009.1). Sprint 3 builds only the **ES-011** fatigue ceiling + fatigue recovery gate; the investigation layer stays deferred (Sprint 6).
- **`CHANGE_STRATEGY`** — remains **signal-only** (licensed only by a completed investigation, ES-013). ES-006 may emit the candidate; it does not act.
- **Volume band auto-progression** — **RATIFIED: static bands.** ES-009.1 §6 only *recommends* band changes to ES-007's Strategy Evaluation (unbuilt); ship static bands, emit the signal, do not change the band.
- **κ/τ/σ²_ref calibration** — unchanged; the fatigue ceiling threshold is **directional, not calibrated** until the Phase 0 harness (Risk R4). **RATIFIED: provisional constant.**
- **Per-athlete τ, `effort_offset`** — unchanged from Sprint 2 (fixed τ, offset = 0).

---

## 3. Dependencies

**Consumed (built, Sprint 0–2):** CapabilityState (score/confidence/sum_w), fatigue + recovery state and decay, fatigue-aware prediction/recommendation codes, evidence/state_update, ES-005.1 math (discount, quantization), persistence (3 zones), single-writer StateRepository, transactional audit chain.

**Hard prerequisites that must land first (see §2B):** ES-002 catalog · StrategyState · PreferenceState · global-confidence/calibration_phase. **None of these exist today** — this is the gating dependency for the *composition* half of the sprint. The *decision-hierarchy* half (ES-006) depends on these only for **REPLACE_EXERCISE** (L2); KEEP/INCREASE/DECREASE (L1) ride on already-built state.

**Internal ordering dependencies (frozen):**
- ES-009.1 runs **inside** ES-009's pipeline (between Stage 2 and Stage 3) — they are one coupled unit, not two sequential ones. Do **not** split 009 from 009.1.
- Runtime order is **ES-009/009.1 (compose skeleton) → ES-006 (load each block)**. But for *implementation*, ES-006's decision tree is testable on the **existing single-block path** without composition — so it can and should be built first.
- Fatigue ceiling/recovery gate **consume** Sprint 2 fatigue state (one-directional; fatigue does not depend on them).

**Deferred-but-must-stub-cleanly:** ES-013 investigation interaction, CHANGE_STRATEGY licensing, ES-007 strategy-evaluation trigger.

---

## 4. Risks (ranked)

**R1 — Prerequisite scope explosion (highest).** The headline specs are ES-006/009/009.1, but the real work is the three unbuilt prerequisites (catalog, StrategyState, PreferenceState) plus the global-confidence/calibration plumbing. Mis-scoping Sprint 3 as "implement three specs" undercounts by the largest unbuilt surface in the project. *Mitigation: front-load a prerequisite foundation; reflect it in the split (§6).*

**R2 — The frozen templates require 7 capabilities; only 5 exist.** Every ES-009 template names `vertical_pull` (Class B — **needs bodyweight, which the frozen Athlete entity does not collect** — existential data gap) and `core_stability` (Class C — needs the **duration curve + DurationObservation** pipeline, unbuilt; never touches kg/Epley). Faithful composition **cannot emit the frozen sessions** with the current build. **RESOLVED (model review): Class-A-only — option (a).** Compose over Class-A; freeze the 7-cap templates as inactive.

**R3 — Multi-capability blocks activate the approximate de-fatigue path.** ES-009 permits multi-capability blocks; Sprint 2 Limitation #4 notes C.3 de-fatigue is **exact only for single-capability** blocks (uses one rep count with `w_c`-combined fatigue). Composition is the first place multi-cap blocks appear, silently switching on the approximation. *Mitigation: flag explicitly; prefer single-capability slots in V1 selection where the catalog allows; document the approximation at the seam.*

**R4 — The fatigue ceiling is built on uncalibrated κ/τ.** The ceiling and recovery gate threshold are functions of fatigue magnitude, and κ/τ/σ²_ref are **provisional/unvalidated** (Limitation #1) until the Phase 0 harness (Sprint 4). The ceiling will be *directional, not calibrated*. **RESOLVED: ship as a flagged provisional constant.** *Do not tune the threshold to make a scenario pass.*

**R5 — "Read from state, not history" vs. ES-006's cross-session memory.** The stability guard ("2–3 consistent observations") and recommendation memory require knowing the recent run of agreeing evidence — but **Invariant 1 forbids decisions reading raw history**. The streak/run and last-recommendation must live as a **projected state field** (e.g., an evidence-run counter / decision-state on CapabilityState or a new DecisionState), written only by the single-writer. *Mitigation: design this state object up front; it is the subtle correctness core of ES-006.*

**R6 — New nondeterminism: the exploration floor (p≈0.10).** ES-009 Stage 3 introduces the system's first stochastic element into an otherwise deterministic, bit-reproducible pipeline. The audit chain requires the **exploration seed logged** so sessions stay reconstructable. *Mitigation: thread an explicit seed through composition; assert determinism-given-seed in tests.*

**R7 — Double-counting conservatism.** ES-006's confidence gate on step size overlaps the already-built ES-005.1 `safety_discount` (`1 − 0.12·(1−c/100)`). Applying both naively double-discounts low-confidence athletes. *Mitigation: define precisely which knob each governs (discount = load magnitude; gate = whether/how big a *change* fires) and test a low-confidence case for no double penalty.*

**R8 — Determinism/regression surface for the rested path.** As in Sprint 2, the non-negotiable is that the existing single-block rested trajectory stays **bit-for-bit** identical. Composition and the decision tree add many branches; the zero-fatigue, single-capability, calibration path must reduce to the current behavior. *Mitigation: keep the Sprint 0/1 parity test green; add a "composition of one block ≡ today's path" identity test.*

---

## 5. Exact implementation sequence

Built so the correctness-critical, low-infra piece (ES-006 on the existing path) lands and is provable **before** the high-infra composition piece, and so each step has a test before the next depends on it.

**Phase A — Prerequisite foundation (unblocks everything below):**
1. **ES-002 catalog** object + a minimal frozen Class-A catalog (canonical + ≥1 alternate per capability, with `difficulty_factor`, `class`, `replacement_group`, `exercise_family`). Additive; single source of truth in constants/catalog module.
2. **StrategyState** (mutable): `weekly_frequency`, `weekly_volume` **enum**, `primary_focus`, `secondary_focus`. Schema-additive migration (schema_version → 3); single-writer.
3. **PreferenceState** (mutable): `exercise_family`, `preference_score` (default 50). Plumb the ES-007/ES-010 preference-from-behavior update (not from onboarding).
4. **global_confidence aggregate + `calibration_phase` (`<70`)** on AthleteState; confirm derivation, do not store a redundant flag.

**Phase B — ES-006 decision hierarchy (on the existing single-block path):**
5. **DecisionState / evidence-run projection** (Risk R5): the consistent-evidence streak + recommendation memory as single-writer state, never a history scan.
6. **Cross-session decision tree**: KEEP default; INCREASE/DECREASE on (repeated error × confidence) with the stability guard; **fatigue gating wired to drive the tree** (Sprint 2 codes become branches); reduction order reps→sets→weight.
7. **Confidence gate vs. discount reconciliation** (R7); step sizing per ES-006 Load Progression (equipment granularity).
8. **REPLACE_EXERCISE (L2)**: preference/equipment/skip-driven only (never performance), using the Phase-A catalog + PreferenceState; CHANGE_STRATEGY emitted as **signal-only**.
9. **Audit + reasons**: persist `decision_reason`, recommendation memory; prove reconstructability. *Gate: ES-006 tested on the single-block path; rested parity bit-for-bit.*

**Phase C — ES-009 + ES-009.1 composition (one coupled unit):**
10. **Stage 1 templates** (Class-A-restricted per R2 decision) + frequency clamp; **Stage 2 priority** (calibration info-gain vs steady-state focus).
11. **ES-009.1 volume** *(between Stage 2 and 3)*: enum bands, two-lever allocation, focus weighting, calibration restraint; emit `target_sets` + required slot counts.
12. **Stage 3 selection**: class constraint, canonical-during-calibration, preference-at-steady-state, **exploration floor with logged seed** (R6); second-slot fill for two-lever.
13. **Stage 4 ordering** (compound-first, core last) → assign `position`.
14. **ES-011 fatigue ceiling** replacing `MAX_SESSION_SETS` + **recovery gate**, consuming Sprint 2 fatigue state; named provisional threshold, flagged uncalibrated (R4); deterministic reduction order.
15. **Wire compose → ES-006 load each block**; multi-cap blocks flagged for the approximate de-fatigue path (R3).

**Phase D — Verification & docs:**
16. Tests: rested/single-block identity (R8); decision-tree (stability, fatigue veto, confidence gate, no double-discount); template coverage 7/7-within-3–5 (or the restricted-set proof); volume-band distinctness per frequency; ceiling trim determinism; exploration-seed reconstructability; full session audit reconstruction.
17. Update canonical docs (PROJECT_STATUS, EXECUTION_CONTEXT §4, TRACEABILITY rows for ES-006/009/009.1) and the Sprint 3 README in house style.

---

## 6. Should Sprint 3 be split? — **Yes (RATIFIED). Two implementation sprints over a shared prerequisite foundation.**

The roadmap names "Decision hierarchy & session assembly" as one sprint, but the two halves have **very different infrastructure cost, risk profile, and dependency depth**, and there is a clean seam between them:

- **Sprint 3A — Decision Hierarchy (ES-006).** Builds on already-shipped state and fatigue codes; deepens the load decision on the **existing single-block path**; low new-infra (only DecisionState + a minimal catalog/PreferenceState slice for REPLACE). High correctness density, small surface. **Ship this first** — it is testable in isolation and de-risks the subtle Invariant-1 decision-state design before composition multiplies the branches.

- **Sprint 3B — Session & Volume Composition (ES-009 + ES-009.1, kept together).** Carries the bulk of Phase A (full catalog, StrategyState, calibration plumbing), the templates, the two-lever volume, the fatigue ceiling/recovery gate, the new nondeterminism, and the Class-A-only restriction. ES-009 and ES-009.1 are **frozen-coupled** (009.1 runs inside 009's pipeline) and must not be split from each other.

**Do not split further.** ES-009/009.1 are one unit; the prerequisite foundation (catalog/StrategyState/Preference) is shared and should be front-loaded into 3B (with the thin REPLACE slice pulled into 3A). A third "pure infrastructure" sprint would strand untested scaffolding — build each prerequisite directly behind the spec that first consumes it.

---

## 7. Open questions requiring model review — RESOLVED (2026-06-09)

1. **Class-B/C templates (R2):** **RESOLVED — Class-A-only.** Vertical Pull and Core Stability remain inactive until their dedicated pipelines exist; the 7-capability templates are frozen but inactive.
2. **Split into 3A (ES-006) then 3B (ES-009/009.1)?** **RESOLVED — approved.**
3. **Fatigue ceiling on provisional κ/τ:** **RESOLVED — ship a flagged provisional constant; calibrate at Phase 0.**
4. **Static volume bands** (no auto-progression; ES-009.1 emits a band-change *signal* only)? **RESOLVED — approved.**
5. **Multi-capability blocks (R3):** prefer single-capability slots in V1 to keep de-fatigue exact, accepting reduced compound coverage. *(Carried into Sprint 3B; recommended for V1.)*

---

*Sources read: `docs/canonical/*` (Execution Context, Project Status, Traceability, Spec Manifest, Index); ES-006/007 (full), ES-009 (full), ES-009.1 (full); Sprint 2 Planning Review; Sprint 0–2 status. ES-006/009/009.1 `.docx` extracted to `build/_txt/` for reading. No code written.*
