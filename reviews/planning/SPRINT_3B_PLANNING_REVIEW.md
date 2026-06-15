# Sprint 3B Planning Review — Session Composition (ES-009) + Volume (ES-009.1), Class-A only

> Planning/readiness review, produced before any 3B code. Does **not** redesign the frozen model; plans the faithful implementation of ES-009/009.1 + the prerequisites they assume, and re-examines the prior "do not split 3B" decision. Every scope claim traces to a frozen spec (`HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`). Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Build: Sprint 0/1/2/3A ✅ (64 tests) · Schema v3 · No code written.

> **STATUS: ACCEPTED (2026-06-10).** Ratified decisions (see §7):
> 1. **Approved splitting Sprint 3B** into **Sprint 3B-1 = Foundation + REPLACE** and **Sprint 3B-2 = Session Composition + Volume**. (Overturns the Sprint 3 review's "do not split 3B"; ES-009 and ES-009.1 remain inseparable within 3B-2.)
> 2. **Approved Class-A-only coverage.** Vertical Pull (Class B) and Core Stability (Class C) remain inactive; the 7-capability templates are frozen but inactive.
> 3. **Approved the ES-011 fatigue ceiling as the live mechanism;** `MAX_SESSION_SETS = 24` remains a fallback bound only.
> 4. **Approved single-capability slot preference in V1** (keeps the C.3 de-fatigue path exact).
> 5. **Approved the minimal PreferenceState slice** — no preference-learning engine this sprint.

## 0. Where we are (one paragraph)

Sprint 3A closed the ES-006 **L1** decision hierarchy as a governor over the ES-005.1 target on the **existing single-block, single-set path**, leaving four things explicitly deferred to 3B: the ES-002 catalog, PreferenceState, the ES-011 fatigue ceiling/recovery gate, and L2 `REPLACE_EXERCISE` (currently signal-only). 3B is the first sprint that produces breadth — an ordered, volume-bearing, **multi-set** `ExerciseBlock[]` — rather than deepening a single block. The dominant fact, unchanged since the Sprint 3 review, is that the two headline specs (ES-009/009.1) sit on **three substantial unbuilt prerequisites** (catalog, StrategyState, PreferenceState) plus a global-confidence/calibration aggregate, and that the frozen templates name two capabilities (Class B/C) this build cannot satisfy. 3B is therefore the largest unbuilt surface in the project and simultaneously the place where the system's first nondeterminism, first multi-capability de-fatigue approximation, and first multi-set blocks all switch on at once — which is the basis for the split ratified in §7.

---

## 1. Sprint goal

**Compose and allocate a full session.** Turn the single-block path into a deterministic, fully-reconstructable, **multi-set** `ExerciseBlock[]` over the five Class-A capabilities: capabilities → priority → volume (slots × sets) → exercises → ordering → loads. Concretely:

- **ES-009 + ES-009.1** emit the ordered, volume-bearing skeleton ES-006 then loads (009.1 runs *inside* 009, between Stage 2 and Stage 3).
- The **ES-011 fatigue ceiling** (replacing the static `MAX_SESSION_SETS = 24`) and the **recovery gate** go live on Sprint 2 fatigue state.
- **L2 `REPLACE_EXERCISE`** is promoted from signal-only to a live, preference-driven decision on the new catalog + PreferenceState.

Succeeds when every block traces to (template, priority, volume band, focus, slot, selection rule, exploration seed, ceiling-trim) and the existing **rested single-block trajectory stays bit-for-bit identical**.

---

## 2. Scope

### 2A. In scope — the frozen mechanism

**ES-009** four stages: (1) frozen split template by `weekly_frequency`, `session_index mod len`; (2) priority — calibration = `staleness + uncertainty` info-gain, steady-state = focus-ordered; (3) one class-matched exercise per slot — canonical during calibration, `argmax(preference_score)` at steady-state, **exploration floor p≈0.10**; (4) compound-first / core-last ordering → `position`.

**ES-009.1** coupled volume: `weekly_volume` enum (low/mod/high → 8/12/18 sets/cap), two-lever allocation (slots 1–2 × sets 2–4), focus weighting (×1.25/×1.00/×0.75), calibration restraint (2 sets, 1 slot), runs between Stage 2 and Stage 3, sole owner of `target_sets`.

**ES-011 fatigue ceiling + recovery gate** consuming Sprint 2 fatigue (deterministic reduction order: lowest-focus sets first, then drop second slots).

**L2 REPLACE_EXERCISE** — preference/equipment/skip-driven only, **never performance-driven**; reuses Stage 3 over the capability's `replacement_group`.

### 2B. In scope — unbuilt prerequisites (the real cost)

ES-002 catalog (mappings, `difficulty_factor`, equipment, `class`, `replacement_group`, `exercise_family`; canonical + ≥1 alternate per Class-A capability) · StrategyState (`weekly_frequency`, `weekly_volume` enum, `primary/secondary_focus`) · PreferenceState (`exercise_family`, `preference_score`, default 50) · `global_confidence` aggregate + `calibration_phase` (<70) on AthleteState.

### 2C. In scope — carried structural debt from 3A

Relocate the ES-006 streak/decision update from `set_number == 1` to **block completion** (3B introduces multi-set blocks; the 3A completion report flags this as mandatory).

### 2D. Out of scope — deferred, stub at clean boundaries

Class-B `vertical_pull` / Class-C `core_stability` as live slots (7-cap templates frozen inactive) · volume band auto-progression (static bands; 009.1 §6 signal-only to ES-007) · the ES-007 Strategy Evaluation consumer · CHANGE_STRATEGY licensing (ES-013) · ES-013 investigation slot/recovery interaction · κ/τ/σ²_ref + ceiling-threshold calibration (Phase 0) · per-athlete τ, `effort_offset` · a full PreferenceState learning curve.

---

## 3. Dependencies

**Consumed (built):** CapabilityState (score/conf/sum_w + 3A decision memory/streaks), fatigue+recovery state/decay, fatigue-aware prediction/recommendation, `decision.py` governor, evidence/state_update, ES-005.1 math, 3-zone persistence, single-writer, transactional audit, schema v3.

**Hard prerequisites that must land first:** ES-002 catalog · StrategyState · PreferenceState · global_confidence/calibration_phase. **None exist** — gating dependency for the composition half.

**Frozen internal ordering (must not be violated):**
- ES-009.1 runs **inside** ES-009 (Stage 2 → 009.1 allocates slots → Stage 3 fills them → 009.1 sets `target_sets`). **Do not split 009 from 009.1.**
- Runtime: compose (009/009.1) → **ES-006 loads each block** (composition is strictly load-free).
- Fatigue ceiling/recovery gate **consume** fatigue (one-directional).
- L2 REPLACE and ES-001 mid-session equipment-busy both **reuse Stage 3** over `replacement_group`.

**Deferred-but-must-stub-cleanly:** ES-007 Strategy Evaluation (009.1 §6 emits a band-change signal to it; it doesn't exist — emit, don't act), ES-013 investigation interaction, CHANGE_STRATEGY licensing.

---

## 4. Risks (ranked)

- **R1 — Prerequisite scope is the sprint (highest).** Catalog + StrategyState + PreferenceState + global_confidence are the largest unbuilt surface in the project; the headline specs are the smaller part. *Front-load the foundation; reflected in the split (§7) — this is the whole of Sprint 3B-1.*
- **R2 — Frozen templates require 7 capabilities; only 5 exist.** Every template names `vertical_pull` (B, needs bodyweight — not collected) and `core_stability` (C, duration pipeline — unbuilt). Class-A-only means those slots are **dropped**, which **breaks the frozen 7/7-in-3–5-sessions coverage guarantee** (ES-009 §4). *Mitigation: define and re-prove a Class-A 5/5 coverage property over the restricted templates; freeze the 7-cap templates inactive. (3B-2.)*
- **R3 — Multi-set blocks break the 3A streak location.** `target_sets ∈ [2,4]` makes blocks multi-set; the 3A streak/decision update lives at `set_number == 1`. It must move to **block completion** or the stability guard mis-fires. Correctness-critical to ES-006. *(Sequenced into 3B-1 Phase C so composition lands on the corrected location.)*
- **R4 — Multi-capability blocks activate the approximate de-fatigue path** (Sprint 2 Limitation #4; C.3 exact only for single-capability). *Mitigation (ratified): prefer single-capability slots in V1; flag the approximation at the seam. (3B-2.)*
- **R5 — Two frozen ceilings collide.** ES-009.1 §4 freezes `MAX_SESSION_SETS = 24`; ES-011 B.1 *replaces* it. *Mitigation (ratified): ES-011 fatigue ceiling is the live ceiling; 24 is a static fallback bound; the fatigue threshold ships as a flagged provisional constant. (3B-2.)*
- **R6 — Exploration floor = first nondeterminism.** p≈0.10 in Stage 3 breaks bit-reproducibility unless the seed is logged. *Mitigation: thread an explicit seed; assert determinism-given-seed; never fires during calibration or across the class constraint. (3B-2.)*
- **R7 — PreferenceState update is under-specified.** *Mitigation (ratified): ship the minimal frozen slice — default 50, behavior-driven only, flagged provisional; no preference-learning curve. (3B-1.)*
- **R8 — Rested/single-block parity regression.** The zero-fatigue single-capability calibration path must reduce to today's behavior. *Mitigation: keep Sprint 0/1 parity green; add a "composition of one block ≡ today's path" identity test.*

---

## 5. Exact implementation sequence

**Sprint 3B-1 — Foundation + REPLACE**

*Phase A — Prerequisite foundation (unblocks everything):*
1. ES-002 catalog object + minimal frozen Class-A catalog (canonical + ≥1 alternate each; `difficulty_factor`, `class`, `replacement_group`, `exercise_family`). Additive.
2. StrategyState (mutable): `weekly_frequency`, `weekly_volume` **enum**, `primary/secondary_focus`. Additive migration → schema v4; single-writer.
3. PreferenceState (mutable): `exercise_family`, `preference_score` (default 50); minimal behavior-driven update only (R7).
4. `global_confidence` aggregate + `calibration_phase` (<70) on AthleteState — derive, don't store a redundant flag.

*Phase B — L2 REPLACE_EXERCISE (completes ES-006 on the existing path):*
5. Promote REPLACE from signal-only to live: preference/equipment/skip-driven, reusing Stage 3 over `replacement_group`; CHANGE_STRATEGY stays signal-only.

*Phase C — Multi-set restructuring (must precede volume):*
6. Relocate the ES-006 streak/decision update from `set_number == 1` to block completion (R3); re-green the 3A sequencing harness.

**Sprint 3B-2 — Session Composition + Volume (one coupled unit)**
7. Stage 1 Class-A-restricted templates + frequency clamp {2,3,4}; **re-prove Class-A coverage** (R2).
8. Stage 2 priority (calibration info-gain `staleness+uncertainty` vs steady-state focus).
9. **ES-009.1 volume** (between Stage 2 and 3): enum bands, two-lever allocation, focus weighting, calibration restraint; emit slot counts + `target_sets`.
10. Stage 3 selection: class constraint, canonical-during-calibration, preference-at-steady-state, **exploration floor with logged seed** (R6); prefer single-capability slots (R4); second-slot fill.
11. Stage 4 ordering (compound-first, core-last → `position`).
12. **ES-011 fatigue ceiling** (live) + static 24 fallback (R5) + **recovery gate** on Sprint 2 fatigue; deterministic reduction order.
13. Wire compose → ES-006 loads each block; flag multi-cap blocks for the approximate de-fatigue path.

*Phase E — Verification & docs (each sub-sprint):* rested/single-block identity (R8); Class-A coverage proof; volume-band distinctness per frequency; ceiling-trim determinism; exploration-seed reconstructability; multi-set streak relocation; REPLACE preference-driven (never performance); full-session audit reconstruction; canonical doc + traceability updates + sprint README in house style.

---

## 6. What must remain deferred

- **Class-B `vertical_pull`** (needs bodyweight — absent from the frozen Athlete entity) and **Class-C `core_stability`** (needs the duration curve + DurationObservation pipeline). 7-cap templates frozen **inactive**.
- **Volume band auto-progression** — static bands; 009.1 §6 emits a band-change *signal* to ES-007 (unbuilt); never swing the band.
- **ES-007 Strategy Evaluation** consumer (10–20-workout cycle) — only signal emission, not consumption.
- **CHANGE_STRATEGY licensing** (ES-013), **ES-013 investigation slot/recovery interaction**.
- **κ/τ/σ²_ref + fatigue-ceiling threshold calibration** — Phase 0; ceiling is directional, not calibrated.
- **Per-athlete τ, `effort_offset`** — fixed τ, offset 0 (unchanged).
- **A full PreferenceState learning curve** — only the minimal behavior-driven slice (R7).

---

## 7. Should Sprint 3B be further split? — **Yes (RATIFIED). 3B-1 (Foundation + REPLACE) then 3B-2 (Composition + Volume).**

The Sprint 3 review ratified "do not split 3B." This review overturns that, because there is a clean seam where the foundation is exercised end-to-end by a real, shippable feature — so it is **not** stranded scaffolding:

- **Sprint 3B-1 — Foundation + REPLACE (completes ES-006).** ES-002 catalog, StrategyState, PreferenceState, global_confidence/calibration_phase, the multi-set streak relocation, and **L2 REPLACE_EXERCISE promoted to live**. REPLACE *consumes* the catalog + PreferenceState, so the foundation is proven on the existing single-block path. This finishes the ES-006 hierarchy (the last signal-only L1/L2 piece goes live) and lands the schema migration. Low new-risk; no nondeterminism.
- **Sprint 3B-2 — Session & Volume Composition (ES-009 + ES-009.1, kept together).** Templates + Class-A coverage proof, two-lever volume, fatigue ceiling/recovery gate, exploration floor. All the new-risk surface, built on a *proven* foundation. **ES-009 and ES-009.1 remain inseparable** (009.1 runs inside 009's pipeline).

The phase order is identical to a monolithic 3B; the split only adds a completion gate after Phase C.

---

## 8. Open questions requiring model review — RESOLVED (2026-06-10)

1. **Split 3B into 3B-1 / 3B-2?** **RESOLVED — approved** (ES-009/009.1 inseparable within 3B-2).
2. **Class-A 5/5 coverage; 7-cap templates frozen inactive?** **RESOLVED — approved.**
3. **ES-011 fatigue ceiling live; `MAX_SESSION_SETS = 24` fallback only?** **RESOLVED — approved.**
4. **Prefer single-capability slots in V1?** **RESOLVED — approved.**
5. **Minimal PreferenceState slice, no preference-learning engine?** **RESOLVED — approved.**

---

*Sources read: `docs/canonical/*` (Execution Context, Project Status, Traceability); `SPRINT_3_PLANNING_REVIEW.md`, `SPRINT_3A_IMPLEMENTATION_PLAN.md`, `SPRINT_3A_COMPLETION_REPORT.md`; ES-009 + ES-009.1 (full, `build/_txt/`); Sprint 1 schema/repositories, Sprint 0 domain/constants, migration 003. No code written.*
