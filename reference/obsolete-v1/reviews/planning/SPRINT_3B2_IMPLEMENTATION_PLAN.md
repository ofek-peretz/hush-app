# Sprint 3B-2 Implementation Plan — Session Composition (ES-009) + Volume (ES-009.1) + Live Fatigue Ceiling, Class-A only

> Implementation plan for Sprint 3B-2, the second half of the approved Sprint 3B split. Scope is
> the **composition engine itself** (ES-009 four stages + ES-009.1 coupled volume) plus the **live
> ES-011 fatigue ceiling + trim-only recovery gate**, built on the proven Sprint 3B-1 foundation
> (catalog, StrategyState, PreferenceState, global-confidence/calibration, the `complete_block()`
> hook). Implements frozen specs; does not redesign the model. Governing rule: *no redesign without
> explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0/1/2/3A/3B-1 ✅ (82 tests) · Schema v4 · No code written.

> **STATUS: ACCEPTED (2026-06-10).** Carries the five `SPRINT_3B_PLANNING_REVIEW.md` §7 rulings
> and the three resolutions ratified in `SPRINT_3B2_PLANNING_REVIEW.md` §8:
> **Q1** frozen capability-priority ordering, no new catalog metadata · **Q2** trim-only recovery
> gate (drop lowest-priority slots until ≤ ceiling; never rebuild) · **Q3** accept-and-document the
> Class-A volume-band collapse, ES-009.1 unchanged. **The ratified `CAPABILITY_PRIORITY_ORDER` is
> fixed below (§4) — gating precondition #2 is now resolved.**

> **RATIFIED CONSTANT (2026-06-10) — `CAPABILITY_PRIORITY_ORDER`** (lower-body compounds first,
> upper-body primaries second, vertical push last):
> `1. knee_dominant · 2. hip_dominant · 3. horizontal_push · 4. horizontal_pull · 5. vertical_push`.
> This single frozen order governs **Stage 4 block ordering**, **recovery-gate / ceiling trim order**
> ("lowest priority" = last in this list = trimmed first), and **all deterministic tie-breaks**.

## 1. Scope

**In scope (the 3B-2 deliverable):**

- **ES-009 Session Composition — four stages** (Section 3 pipeline, none skippable), Class-A only:
  - **Stage 1 — Template:** frozen Class-A-restricted split templates by `weekly_frequency`
    (clamp to {2,3,4}); `session_index mod len(template)` picks the day. The frozen 7-cap templates
    are kept as inactive reference; the *active* templates have `vertical_pull`/`core_stability`
    removed. Re-prove **Class-A 5/5 coverage** (≤2 sessions/frequency — proof in the planning review §5).
  - **Stage 2 — Priority:** calibration → `staleness + uncertainty` info-gain ordering/inclusion;
    steady-state → `primary/secondary_focus` first, info-gain as tie-break. Source
    `capability_state.last_trained_at_week` (exists since Sprint 0). Never touches load.
  - **Stage 3 — Selection:** one class-matched exercise per slot via the **existing
    `catalog.select`** primitive (canonical during calibration; `argmax(preference_score)`,
    tie-break `difficulty_factor`, at steady state) **+ the new exploration floor `p_explore ≈ 0.10`**
    (the only behavioral addition to selection; never during calibration, never across the class
    constraint). Second-slot fill draws the next-best **distinct** exercise in the same capability.
  - **Stage 4 — Ordering:** **frozen capability-priority order** (Q1), then canonical-before-alternate
    (`difficulty_factor` desc), then slot index → `position` (0-indexed). **No new catalog metadata.**
- **ES-009.1 Volume Composition — coupled, runs *inside* ES-009 between Stage 2 and Stage 3:**
  enum bands `low/moderate/high → 8/12/18` weekly sets/cap; two-lever allocation
  (`per_session_sets = weekly_sets / times_trained`; `slots = clamp(round(p/3),1,2)`;
  `sets_per_slot = clamp(round(p/slots),2,4)`); focus weighting `×1.25 / ×1.00 / ×0.75`;
  calibration restraint (fixed **1 slot × 2 sets**); **sole owner of `target_sets`**. `times_trained`
  computed from the **restricted** templates. **ES-009.1 is otherwise unchanged (Q3).**
- **ES-011 fatigue ceiling (live) + trim-only recovery gate (Q2):** the live ceiling replaces the
  static `MAX_SESSION_SETS = 24` (kept as a hard fallback). If a session exceeds the ceiling,
  **remove the lowest-priority slot(s)** (lowest-focus `sets_per_slot` first, then drop second
  slots) until it satisfies the ceiling — **deterministic, trim-only, never rebuilt/re-optimized,
  no session deferral.** Consumes Sprint 2 fatigue state read-only.
- **Multi-set / multi-block wiring:** compose → ES-006 loads each block → set loop honors
  `target_sets` → **`complete_block()` fires once per block** (3B-1 hook; block surprise
  `= s_obs − score_at_block_entry`). Single-capability blocks only (catalog is single-capability;
  guard the seam).
- **Audit / nondeterminism:** thread an explicit per-session **exploration seed**, persist it, and
  make every block reconstruct `(template, priority, band, focus, times_trained, slot,
  selection_reason, seed, ceiling-trim)`.

**Out of scope (later / stub at clean boundaries):** Class-B `vertical_pull` / Class-C
`core_stability` as live slots (7-cap templates frozen inactive); volume-band auto-progression
(ES-009.1 §6 emits a band-change *signal* to ES-007 — emit, never swing); ES-007 Strategy
Evaluation consumer; CHANGE_STRATEGY licensing + ES-013 interaction; κ/τ/σ²_ref + fatigue-ceiling
threshold + band/clamp calibration (Phase 0; ceiling threshold ships flagged-provisional); per-athlete
τ, `effort_offset`; a PreferenceState learning curve; the multi-capability C.3 de-fatigue
approximation (dormant by catalog construction — guarded, not built).

## 2. Session-generation flow

A new **pure composition layer** (`composition.py` + `volume.py`, model-package root, siblings of
`catalog.py`/`decision.py`) produces a load-free `ExerciseBlock[]` skeleton; the **existing
pipeline** then loads, runs, and learns per block. Composition writes no state and touches no load.

```
generate_session(athlete_id, session_index, seed):
  inputs  ← StrategyState, AthleteState (+derived global_confidence/calibration_phase),
            CapabilityState[5] (score, confidence, last_trained_at_week),
            preference_fn (family→score), ExerciseCatalog, Sprint-2 fatigue state
  ─ ES-009 Stage 1  template = TEMPLATES[clamp_freq(weekly_frequency)][session_index mod len]
  ─ ES-009 Stage 2  priority = info_gain(staleness+uncertainty)            if calibration_phase
                             = focus_order(primary,secondary) + info_gain tiebreak  otherwise
  ─ ES-009.1        per capability: times_trained ← restricted template;
     (volume)       slots, sets_per_slot ← two-lever(band, focus, times_trained)
                    calibration ⇒ slots=1, sets_per_slot=2                 (restraint)
  ─ ES-009 Stage 3  for each slot: exercise = catalog.select(cap, preference_fn, calibrating)
                    + exploration floor (seeded RNG, p≈0.10, steady-state only, class-safe);
                    second slot ⇒ next-best DISTINCT exercise (same capability)
                    [single-capability guard: assert len(exercise.capabilities)==1]
  ─ ES-009.1        each block.target_sets ← sets_per_slot
  ─ ES-009 Stage 4  order blocks by CAPABILITY_PRIORITY_ORDER, then df desc, then slot → position
  ─ ES-011 ceiling  live_ceiling ← f(Sprint-2 fatigue); fallback MAX_SESSION_SETS=24
                    while Σ(slots×sets) > ceiling:  trim lowest-priority slot/sets  (Q2, trim-only)
  ⇒ returns ordered, load-free ExerciseBlock[] skeletons (+ session audit: seed, session_index,
     frequency/volume/calibration snapshot)

then (existing pipeline, per block, in order):
  ES-006 decision.govern → recommended_weight + target_reps           (composition stays load-free)
  set loop ×target_sets  → report_set / report_set_fatigue_aware
  complete_block()       → ONE decision/streak update, block surprise = s_obs − score_at_block_entry
```

**Frozen ordering honored (planning review §3):** ES-009.1 runs *inside* ES-009 (Stage 2 → allocate
slots → Stage 3 → set `target_sets`); compose precedes ES-006 loading; the ceiling/gate consume
fatigue one-directionally; L2 REPLACE and ES-001 equipment-busy reuse Stage 3 over the
`replacement_group` (already live since 3B-1 — composition must not fork a second selection path).

## 3. Schema changes (additive; migration 005 → schema_version 5)

The ES-001 hierarchy schema **already carries** everything composition emits: `exercise_block`
has `capability`, `exercise`, `difficulty_factor`, `position`, `target_sets`, `recommended_weight`,
`target_reps`, `status`, and `workout_session` exists. **Composition produces existing rows.** The
only genuinely new persistence requirement is the **audit of the first nondeterminism** (ES-009 §9:
"the exploration draw must be logged with its seed; a session that cannot be reconstructed is
invalid"). Additive only, inert defaults, same migration_002/003/004 discipline.

**`workout_session` — ADD COLUMNS (history snapshot, Invariant 2):**

| Column | Type / default | Spec / why |
|---|---|---|
| `exploration_seed` | INTEGER NULL | **Required.** ES-009 §9 — reconstruct the nondeterministic draw. |
| `session_index` | INTEGER NULL | Stage 1 — which template day (with frequency) produced the slots. |
| `weekly_frequency` | INTEGER NULL | Snapshot of mutable StrategyState at compose time (template). |
| `weekly_volume` | TEXT NULL | Snapshot of the band that drove ES-009.1 (deterministic re-derive). |
| `calibration_phase` | INTEGER NULL | Snapshot (0/1) — restraint + canonical-vs-preference branch. |

**`exercise_block` — ADD COLUMN:**

| Column | Type / default | Spec / why |
|---|---|---|
| `selection_reason` | TEXT NOT NULL DEFAULT '' | "why this exercise": `canonical` / `preference` / `exploration` / `replacement` (ES-009 §6, audit chain). |

**No new catalog metadata (Q1):** Stage 4 ordering is driven by the frozen `CAPABILITY_PRIORITY_ORDER`
constant in `constants.py`, not by an `is_compound`/score column. **No catalog table** (3B-1 ruling
stands; the catalog is code-resident; history already snapshots `exercise`/`difficulty_factor`).
`PRAGMA table_info` guards as in migration_003/004; bump `schema_version` to 5.

## 4. State changes

**No new mutable-projection tables, no new state fields.** Every projection ES-009/009.1 reads was
built in 3B-1 or earlier: StrategyState (`weekly_frequency`, `weekly_volume`, focus),
PreferenceState (`exercise_family`, `preference_score`), `capability_state.last_trained_at_week`
(Stage-2 staleness), `global_confidence`/`calibration_phase` (derived), Sprint-2 fatigue state
(ceiling/gate input). **State is read-only to composition** (Principle #53: ES-009 selects and
orders; nothing more).

**New engine logic (pure, no state):**
- `composition.py` — `ExerciseCatalog`-driven Stage 1–4. Functions: template selection +
  frequency clamp; priority resolution (info-gain vs focus); Stage-3 selection that **wraps**
  `catalog.select` with the exploration branch + second-slot distinct fill + single-capability
  guard; Stage-4 ordering by `CAPABILITY_PRIORITY_ORDER`. Returns load-free block skeletons.
- `volume.py` — ES-009.1 two-lever allocation, focus weighting, calibration restraint;
  `times_trained` from the restricted template; sets `target_sets`. **Sole owner of `target_sets`.**
- ES-011 ceiling/gate — a deterministic `trim_to_ceiling(blocks, live_ceiling)` (Q2 trim-only) and
  the live-ceiling derivation from Sprint-2 fatigue, with `MAX_SESSION_SETS = 24` fallback.

**New frozen constants (`constants.py`, single source of truth):**
`TEMPLATES_CLASS_A` (the active restricted templates) + `TEMPLATES_7CAP` (frozen inactive
reference); `CAPABILITY_PRIORITY_ORDER = (knee_dominant, hip_dominant, horizontal_push,
horizontal_pull, vertical_push)` (ratified 2026-06-10; governs Stage 4 ordering, ceiling/gate trim
order, and all deterministic tie-breaks — "lowest priority" = last = trimmed first); `VOLUME_BANDS = {low:8, moderate:12,
high:18}`; `FOCUS_MULTIPLIERS = {primary:1.25, secondary:1.00, other:0.75}`; lever bounds
(`SLOTS∈[1,2]`, `SETS_PER_SLOT∈[2,4]`, baseline 3); `CALIBRATION_SLOTS=1`, `CALIBRATION_SETS=2`;
`P_EXPLORE ≈ 0.10` (**provisional**); `FATIGUE_CEILING_*` threshold (**provisional, Phase 0**);
`MAX_SESSION_SETS = 24` (fallback). The exploration RNG is **seeded per session** from the persisted
`exploration_seed`; given the seed the session is bit-reproducible.

**Exploration nondeterminism — the one behavioral seam (R6):** a single seeded RNG, threaded
explicitly into Stage 3, drawn only at steady state and only within a capability's class-matched
pool. The seed is chosen by the caller (so tests pin it), persisted on `workout_session`, and is
the *only* source of non-reproducibility; `assert_deterministic_given_seed` is a first-class test.

## 5. Migration requirements

- **`migration_005_composition.py`** — additive, idempotent, same runner shape as
  `migration_004_foundation.py`: guarded `ALTER TABLE workout_session ADD COLUMN ...` (×5) and
  `ALTER TABLE exercise_block ADD COLUMN selection_reason ...`, each guarded by a `_columns()`
  check, then `INSERT OR REPLACE INTO schema_version VALUES (5, ...)`.
- **Inert defaults / parity:** every added column is NULL or `''`. A Sprint 3B-1 DB migrates with
  **zero semantic change**; existing sessions carry NULL seed/index (they were single-block,
  composition-free). The 82 prior tests stay bit-for-bit.
- **No backfill, forward-only** (consistent with 002/003/004); idempotency proven by re-running
  `apply()` (no-op second time). **Catalog is not migrated** (code-resident).
- **No data migration of `exercise_block`/`workout_session` rows** — only column adds.

## 6. Test strategy (extends the 82; parity is blocking)

1. **Parity (blocking).** A single-capability **calibration** session (1 slot × 2 sets, canonical,
   no exploration, single block) reduces to today's single-block path; all 82 prior tests pass
   **bit-for-bit**. Add a "composition-of-one-block ≡ today's path" identity test.
2. **Class-A coverage (frozen property).** Each frequency covers **5/5** Class-A capabilities in
   ≤2 sessions (the planning-review §5 table, asserted); template edits must re-prove it. Record
   the thin/duplicate-session side effects (freq-2 Session B, freq-4 B≡D).
3. **Stage 1 templates.** Frequency clamp {2,3,4}; `session_index mod len` cycles correctly; the
   active templates contain **no** Class-B/C slots; the 7-cap templates exist but are inactive.
4. **Stage 2 priority.** Crafted `last_trained_at_week`/`confidence` ⇒ calibration info-gain
   ordering (`staleness + uncertainty`); steady-state ⇒ focus-first, info-gain tie-break only.
5. **ES-009.1 volume (incl. the documented collapse, Q3).** Two-lever totals match the hand-computed
   table on the **restricted** templates; focus multiplier applied pre-distribution; calibration
   restraint = 1 slot × 2 sets. **Encode the band-collapse limitation as an explicit test** (freq-2:
   low=moderate=high per once-trained capability; freq-3: partial), so it is a *known, asserted* V1
   property, not a silent regression; assert distinctness where it survives (twice-trained caps,
   focus). ES-009.1 numbers unchanged.
6. **Stage 3 selection + exploration.** Steady-state `argmax(preference_score)` (db_bench 88 vs
   bench 50 → db_bench); exploration floor fires with a fixed seed → **deterministic given seed**;
   **never** during calibration; **never** crosses the class constraint; second slot is a *distinct*
   same-capability exercise; **single-capability guard** holds. `selection_reason` recorded correctly.
7. **Stage 4 ordering.** Blocks ordered by the frozen `CAPABILITY_PRIORITY_ORDER`, then df desc,
   then slot index; `position` deterministic; no catalog metadata consulted.
8. **Live fatigue ceiling + trim-only gate (Q2).** When `Σ(slots×sets) >` live ceiling, the deterministic
   trim removes lowest-priority slots/sets until ≤ ceiling and **never rebuilds**; the static 24 is the
   fallback bound; trim order is reproducible; a session at/under the ceiling is untouched.
9. **Multi-set block completion.** A real multi-set block runs compose → load → `target_sets` sets →
   **one** `complete_block()` update; block surprise captured once from `score_at_block_entry`; the
   3A multi-session sequencing harness (stability guard → INCREASE, streak persistence, reset-on-fire)
   stays green on multi-set blocks.
10. **Audit reconstruction.** A full steady-state session (incl. a preferred and an explored
    selection) reconstructs `(template, priority, band, focus, times_trained, slot, selection_reason,
    seed, ceiling-trim)`; `assert_deterministic_given_seed` for the whole session.
11. **Migration 005.** Additive + idempotent (re-apply = no-op); a 3B-1 DB migrates, `schema_version
    = 5`, and a session composed pre-migration (single-block) is semantically unchanged.

## 7. Definition of Done

- **ES-009 four stages live** (`composition.py`): Class-A-restricted templates + frequency clamp;
  info-gain vs focus priority; Stage-3 selection wrapping `catalog.select` with the exploration
  floor + second-slot distinct fill + single-capability guard; Stage-4 frozen-priority ordering.
  **No new catalog metadata** (Q1).
- **ES-009.1 volume live** (`volume.py`), running *inside* ES-009 between Stage 2 and Stage 3; sole
  owner of `target_sets`; two-lever allocation + focus + calibration restraint on the restricted
  templates; **ES-009.1 spec unchanged** and the band-collapse documented (Q3).
- **Class-A 5/5 coverage** re-proven and frozen; thin/duplicate sessions documented.
- **Live ES-011 fatigue ceiling + trim-only recovery gate** (Q2) on Sprint-2 fatigue; 24 fallback;
  deterministic trim; threshold flagged provisional.
- **Multi-set blocks** wired through `complete_block()` (one update/block; block surprise from
  block entry); single-capability only, guarded.
- **Exploration nondeterminism contained and auditable:** seed threaded, persisted, reproducible;
  never fires during calibration or across the class constraint.
- **Migration 005 additive/idempotent**; `schema_version = 5`; a migrated 3B-1 DB semantically
  unchanged (parity).
- **All 82 prior tests bit-for-bit** + the new 3B-2 tests passing (via `assemble_and_test.py`).
- Invariants preserved: Inv. 1 (state not history), Inv. 2 (catalog reference, history snapshots
  consumed values incl. the new audit columns), Inv. 3 (composition is load-free — one load formula),
  single-writer, transactional atomicity, Inv. 7 (every block reconstructable incl. the seed).
- Sprint 3B-2 README + completion report (house style) + canonical updates (PROJECT_STATUS,
  EXECUTION_CONTEXT §4/§5, TRACEABILITY: Workout/Session engine → 3B-2 code, composition/volume/
  ceiling formula rows, the Q3 known-limitation entry).

## 8. Reasons Sprint 3B-2 should NOT begin (gating preconditions)

These are genuine blockers; if any is unmet, **do not start coding** — resolve it first.

1. **Parity baseline not reproducibly green.** This checkout is per-sprint snapshots with **no
   `pytest`**; the 82/82 result comes only from `build/_verify/assemble_and_test.py`. Bit-for-bit
   parity is the non-negotiable acceptance gate of every sprint, and 3B-2 introduces the first
   nondeterminism — if the assemble harness cannot currently re-run 82/82 green, a parity regression
   would be **undetectable**. *Confirm 82/82 via the harness before any composition code.*
2. **~~The frozen `CAPABILITY_PRIORITY_ORDER` is not yet written down.~~ RESOLVED (2026-06-10).**
   The exact order is ratified: `(knee_dominant, hip_dominant, horizontal_push, horizontal_pull,
   vertical_push)` — lower-body compounds first, upper-body primaries second, vertical push last.
   It drives Stage 4 ordering, ceiling/gate trim ("lowest priority" = last = trimmed first), and all
   deterministic tie-breaks. No longer a blocker.
3. **Migration 005 audit-schema not signed off.** Every prior migration was reviewed before code
   (002/003/004). The five `workout_session` snapshot columns + `exercise_block.selection_reason`
   are the 3B-2 schema delta; the **`exploration_seed` column is mandatory** for ES-009 §9
   reconstructability. If the schema delta or the seed-source/threading contract (caller-supplied,
   persisted, reproducible) is not accepted, the audit chain cannot be closed — and an
   unreconstructable session is invalid by spec.
4. **Live-ceiling threshold provenance unagreed.** The ES-011 fatigue-ceiling threshold is
   **provisional/uncalibrated** (Phase 0). That is *accepted* — but only if it ships explicitly
   flagged and the 24 static fallback is always present. If anyone expects a *calibrated* ceiling in
   3B-2, the scope is wrong: calibration is Phase 0, not 3B-2. (Not a blocker if the provisional
   posture is accepted; a blocker if a calibrated ceiling is expected.)
5. **Concurrent edits to the 3A streak-relocation / `complete_block()` site.** 3B-2's multi-set
   blocks depend on the 3B-1 relocation of the decision update to block completion being stable. If
   that site is mid-change, multi-set completion will mis-fire the stability guard. *Confirm the
   3B-1 `complete_block()` hook and the 3A sequencing harness are green and frozen first.*

*Non-reasons (explicitly NOT blockers — ratified):* the Class-A volume-band collapse (Q3 accept-and-
document), the trim-only recovery gate (Q2), and the absence of Class-B/C capabilities (ratified
Class-A only) are **accepted** and must not re-open as objections to starting.

---

*Sources read: `docs/canonical/*`; `SPRINT_3B_PLANNING_REVIEW.md`, `SPRINT_3B2_PLANNING_REVIEW.md`,
`SPRINT_3B1_IMPLEMENTATION_PLAN.md`, `reviews/completion/SPRINT_3B1_COMPLETION_REPORT.md`; ES-009 +
ES-009.1 (full, `build/_txt/`); delivered code `implementation/sprint3b1/catalog.py`,
`sprint1/schema.py` (existing `exercise_block`/`workout_session` shape), `repositories.py`,
`sprint0/domain.py`. No code written.*
