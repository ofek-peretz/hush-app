# Sprint 3B-1 Completion Report — Foundation + REPLACE_EXERCISE

> Completion record for Sprint 3B-1, the first half of the approved Sprint 3B split. It
> states what was built, what remains deferred, and what is known to be unproven, as of
> the close of Sprint 3B-1. It does not redesign the frozen model; every claim traces to a
> frozen specification (`HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`) or to
> delivered, tested code. Mirrored into the canonical status anchor
> (`docs/canonical/HUSH_V1_PROJECT_STATUS.md`). Governing rule: *no redesign without
> explicit model review.*

- **Date:** 2026-06-10
- **Model:** Hush v1 (frozen)
- **Build:** Sprint 0 ✅ · Sprint 1 ✅ · Sprint 2 ✅ · Sprint 3A ✅ · **Sprint 3B-1 ✅**
- **Tests:** 82 passing (12 + 7 + 27 + 18 + 18); the 64 prior tests unchanged **bit-for-bit**
- **Schema version:** 4 (additive foundation migration applied)
- **Inputs:** `SPRINT_3B_PLANNING_REVIEW.md`, `SPRINT_3B1_IMPLEMENTATION_PLAN.md`,
  `SPRINT_3B1_CODE_READINESS_REVIEW.md` (all accepted)

---

## 1. What was implemented

Sprint 3B-1 built the **prerequisite foundation** ES-009/009.1 silently assume but the
Sprint 0–3A build never created, and proved it end-to-end by promoting **L2
`REPLACE_EXERCISE`** from signal-only to a live decision — all on the existing
single-block path, with the Sprint 0–3A trajectories preserved bit-for-bit.

| Mechanism | Spec | Where |
|---|---|---|
| ES-002 exercise catalog (Class-A; canonical + ≥1 alternate per capability) | ES-002 | `catalog.py` (code-resident frozen reference data) |
| Three distinct relations: capability · `replacement_group` · `exercise_family` | ES-002 / ES-009 §6 | `catalog.py` |
| Stage-3 selection primitive (canonical-in-calibration / preference-at-steady-state) | ES-009 §6 | `catalog.ExerciseCatalog.select` |
| StrategyState (`weekly_frequency`, `weekly_volume` **enum**, focus) | ES-008 v2 / ES-009 / ES-009.1 | `domain.StrategyState`, `strategy_state` table |
| PreferenceState (`exercise_family`, `preference_score=50`) | ES-007/010 / ES-009 §6 | `domain.PreferenceState`, `preference_state` table |
| `global_confidence = mean(Class-A confidences)` + `calibration_phase` (<70) | ES-009 §5 / ES-008 v2 | `domain.AthleteState.global_confidence` / `.calibration_phase` (derived) |
| L2 `REPLACE_EXERCISE` — preference-driven, never performance-driven | ES-006 / ES-009 §6 | `service.replace_exercise`, `catalog.replace` |
| Minimal behaviour nudge (one bounded step per REPLACE event) | ES-009 §6 | `preference.nudge` (`PREFERENCE_NUDGE`, provisional) |
| REPLACE audit (`replaced_from_exercise`, `replace_reason`) | ES-006 audit / Inv. 7 | `domain.Recommendation`, schema, `repositories.insert_recommendation` |
| **Single block-completion hook** (decision memory updates once per block) | ES-006 (relocation) | `pipeline._record_block_decision` / `pipeline.complete_block` |

**The three ratified rulings, honored:**

1. **Pipeline unification through one `complete_block()` hook.** The Sprint 3A
   decision-memory update lived only in `report_set` at `set_number == 1`;
   `report_set_fatigue_aware` had no governor at all. Sprint 3B-1 makes
   `_record_block_decision` the **single** updater (no duplicated governor logic). Both
   per-set methods now delegate to it at end-of-call (single-set blocks complete in-call,
   preserving the 3A governed trajectory bit-for-bit), and the public `complete_block()` is
   the hook multi-set callers (Sprint 3B-2 composition) use.
2. **Block surprise = `s_obs − score_at_block_entry`**, captured once per block from the
   score at block open — independent of intra-block score drift. On the single-capability
   single-set path it equals `S_obs_clean − score_before`, identical to the 3A inline value.
3. **Parity firewall.** Canonical catalog entries are `difficulty_factor = 1.0` and
   `exercise_cost = 1.0`; catalog `exercise_cost` is **reference-only**; `difficulty_factor`
   still flows from the caller. Nothing here is wired into the existing numeric paths.

**Single source of truth for StrategyState defaults (mandated additional requirement).**
`constants.STRATEGY_DEFAULT_*` → `domain.default_strategy_state` is the one place defaults
live; both onboarding seeding (`create_athlete`) and default-on-absence (`get_strategy_state`
for a migrated, row-less athlete) route through it, so a migrated athlete and a freshly-seeded
athlete are provably identical (`test_default_on_absence_equals_freshly_seeded`).

**REPLACE is preference-driven, never performance-driven.** `service.replace_exercise`
selects the most-preferred exercise in the current exercise's `replacement_group`
(class-constrained, capability-preserving — Principle #53), emits a recommendation for it
with `decision_type = REPLACE_EXERCISE` and the replacement audit, and applies one bounded
nudge per event (chosen family up, rejected family down; no nudge — hence no ratchet — when
the choice did not change the family). No performance signal enters the selection or the nudge.

**Persistence & migration.** Two new mutable-projection tables (`strategy_state`,
`preference_state`) with sole-writer methods on `StateRepository`, both following the
three-site discipline (create-seed / write / load) guarded by round-trip tests; two additive
REPLACE-audit columns on `recommendation`. `migration_004_foundation.py` is additive and
idempotent (schema_version → 4); **no backfill** — a migrated Sprint 3A DB has no
strategy/preference rows and resolves to the single-source defaults (default-on-absence).

## 2. What remains deferred

Deferred items are stubbed at clean boundaries (forward-referenced, not redesigned around):

- **Session composition + volume (ES-009 / ES-009.1)** — **Sprint 3B-2.** Frozen split
  templates + a Class-A 5/5 coverage proof, Stage-2 priority, two-lever volume, the Stage-3
  selection primitive (`catalog.select`, built here), the **exploration floor** (the system's
  first nondeterminism, seed to be logged), and Stage-4 ordering.
- **ES-011 fatigue ceiling (live) + recovery gate** — **Sprint 3B-2;** the ceiling becomes the
  live mechanism (`MAX_SESSION_SETS = 24` fallback only), consuming Sprint 2 fatigue state.
- **Multi-set / multi-capability blocks** — **Sprint 3B-2;** they use the `complete_block()`
  hook built here and activate the C.3 de-fatigue approximation (prefer single-capability
  slots, ratified).
- **A PreferenceState learning curve** — only the minimal bounded nudge ships; the nudge
  magnitude (`PREFERENCE_NUDGE`) is provisional/unvalidated (like κ/τ).
- **Volume band auto-progression / ES-007 Strategy Evaluation consumer** — StrategyState is
  written at onboarding/explicit-set only; ES-009.1 §6 emits a band-change *signal* to ES-007
  (unbuilt) and never swings the band.
- **Class-B `vertical_pull` / Class-C `core_stability`** — inactive; **absent** from the
  catalog so a Class-A lookup can never surface a cross-class exercise.
- **`CHANGE_STRATEGY` (L4)** — signal-only; licensed only by a completed investigation (ES-013).
- **Investigation Engine + probes (ES-013), Trust Measurement (ES-012)** — later sprints.
- **Per-athlete τ, `effort_offset`** — unchanged (fixed τ; offset = 0).
- **Parameter calibration (κ, τ, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`)** — Phase 0.
- **Phase 0 stability/calibration harness, API, mobile app** — later sprints.

## 3. Current architecture state

**One model package + a persistence layer; synchronous; single SQLite database.** No
microservices, queue, or network boundary.

**Engines:**

| Engine | State | Notes |
|---|---|---|
| Prediction (ES-004/005.1/011) | ✅ built | fatigue-adjusted (`score − Fatigue_c`) |
| Evidence (ES-004/010) | ✅ built | load-space attribution; de-fatigue ordering (C.3) |
| State Update (ES-007/005.1/010 C) | ✅ built | precision blend + variance damping; **sole state writer** |
| Recommendation (ES-006/005.1/011) | ✅ built (L1+L2) | governor over the ES-005.1 target (Sprint 3A); **L2 REPLACE_EXERCISE live (Sprint 3B-1)**, preference-driven |
| Fatigue & Recovery (ES-011) | ✅ built | generation, fixed-τ decay, de-fatigue, veto |
| Workout / Session (ES-001/009/009.1/002) | ◑ partial | ES-001 hierarchy + **ES-002 catalog / StrategyState / PreferenceState / calibration (Sprint 3B-1)**; composition/volume/ceiling = Sprint 3B-2 |
| Investigation (ES-013) | ✗ deferred | — |
| Trust Measurement (ES-012) | ✗ deferred | — |

**State zones:**
- *Static / catalog:* `athlete`; **ES-002 catalog is code-resident reference data**
  (`catalog.py`), version-tied to `CAPABILITY_MODEL_VERSION` — not in the DB.
- *Mutable projection:* `athlete_state` (+ systemic fatigue), `capability_state` (+ fatigue,
  variance moments, Sprint 3A decision memory), **`strategy_state`** (`weekly_frequency`,
  `weekly_volume` enum, `primary/secondary_focus`) and **`preference_state`**
  (`exercise_family`, `preference_score`) — both new in Sprint 3B-1.
  `global_confidence` / `calibration_phase` are **derived** (mean of Class-A confidences; <70),
  never stored.
- *Immutable history:* `workout_session → exercise_block → set_record`, `observation`,
  `evidence`, `recommendation` (+ Sprint 3A `decision_type`/`target_load`; **+ Sprint 3B-1
  `replaced_from_exercise`/`replace_reason`**), `state_update_log`. Append-only; version-stamped.
- *Bookkeeping:* `schema_version` (= 4).

**Invariants holding:** decisions read from state not history (Inv. 1 — streak/memory and the
strategy/preference projections are state, never a history scan); history immutable, catalog
reference data with history snapshotting consumption (Inv. 2); recommendation ⇄ learning share
one inverted model — REPLACE selects an exercise but does **not** introduce a second load
formula (Inv. 3); single state writer (the two new tables are written only by
`StateRepository`); transactional atomicity; the replacement is reconstructable
(`replaced_from_exercise` + reason — Inv. 7). **Operating mode:** Recommendation Mode only.

## 4. Current test counts

| Suite | Count | Scope |
|---|---|---|
| Sprint 0 | 12 | golden values, round-trip, decay/confidence anchors, closed-loop recovery |
| Sprint 1 | 7 | persistence, ES-001 hierarchy, transactional rollback, audit chain, pure↔persisted parity |
| Sprint 2 | 27 | fatigue generation/accumulation/decay, C.3 ordering, surprise (C.1), ES-010 C suppression/damping, recommendation gating, persisted fatigue audit, migration, harness stability |
| Sprint 3A | 18 | governor branches, streak update + fatigue-can't-manufacture-DECREASE, cold-start parity + no-double-discount, MR2 memory round-trip, migration 003, multi-session sequencing harness |
| **Sprint 3B-1** | **18** | catalog integrity + parity firewall (canonical df/cost=1.0, Class-A only); StrategyState/PreferenceState round-trip; `global_confidence`=mean + calibration boundary @70 (+ fixed Class-A set); migration 004 additive/idempotent; default-on-absence == freshly-seeded; REPLACE preference-driven / never-performance / capability-preserving / audited; nudge clamp + no-double-nudge; **block-completion hook fires once for a multi-set block + fatigue-aware path now governs** |
| **Total** | **82** | all passing |

The 64 Sprint 0/1/2/3A tests pass **bit-for-bit** post-Sprint-3B-1 (the parity firewall: the
catalog is reference-only with canonical df/cost=1.0, new state is additive with inert
defaults, `govern` defaults False on both pipeline paths).

**Verification (honest):** this checkout holds per-sprint *snapshots*, not the assembled
runnable tree, and has no `pytest`. The 82/82 result was produced by
`build/_verify/assemble_and_test.py`, which assembles the documented `hush_model/ + sim/ +
tests/` tree from the snapshot files and runs every `test_*` via a plain-assert runner. In a
real tree, `PYTHONPATH=. python -m pytest tests/ -q` should report 82 passing.

## 5. Known limitations

1. **`PREFERENCE_NUDGE` is provisional/UNVALIDATED.** The single bounded preference step has
   no external anchor (like κ/τ/σ²_ref and the decision thresholds). It is the minimal slice —
   *that* preference drives selection is frozen (ES-009 §6); *how fast* it moves is not. Do
   not tune it to fit a scenario; a real preference-learning curve is a later responsibility.
2. **κ, τ, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND` remain provisional** (unchanged) —
   the fatigue/variance/decision corrections are directional, not calibrated, until Phase 0.
3. **REPLACE has no organic trigger on the current path.** The synthetic athlete performs the
   recommendation and never skips or hits equipment-busy, so REPLACE is exercised via an
   explicit (injected) preference/equipment/skip call — the same instrumentation posture as the
   Sprint 3A override path. Organic triggers arrive with composition (3B-2) and the app.
4. **Single-set, single-capability blocks only.** The `complete_block()` hook is **structured**
   for multi-set blocks and **tested** with a synthetic multi-set block, but the live (sim) path
   is still single-set; true multi-set / multi-capability blocks (and the C.3 de-fatigue
   approximation they activate) arrive in Sprint 3B-2.
5. **`weekly_volume` / StrategyState are written but unconsumed.** Stored as a validated enum;
   the ES-009/009.1 consumers that read frequency/volume/focus arrive in Sprint 3B-2 (an
   accepted forward-reference, like Sprint 2 emitting decision codes before acting on them).
6. **No session composition / volume / fatigue ceiling yet** — Sprint 3B-2.
7. **`effort_offset = 0`; fixed population τ** — unchanged (A5 needs RIR; A6 unidentifiable at MVP N).
8. **No instrumentation / API / app / Phase 0 harness** — later sprints.
9. **Repo layout:** snapshots ≠ assembled package; the runnable tree and `pytest` are not in
   this checkout (see §4).
10. **Existential assumptions (A1–A4) remain unreachable in MVP** by construction.

## 6. Recommended next sprint

**Sprint 3B-2 — Session composition (ES-009) + volume (ES-009.1) + ES-011 fatigue ceiling, Class-A only.**

Rationale: Sprint 3B-1 delivered the foundation (catalog, StrategyState, PreferenceState,
global-confidence/calibration) and live L2 REPLACE on the existing path. The remaining half of
the approved 3B split is the composition engine itself, now buildable on a **proven** foundation:

- **ES-009 composition** — frozen split templates restricted to the five Class-A capabilities
  with a re-proven **5/5 coverage** property (the frozen 7/7 guarantee cannot hold Class-A-only),
  Stage-2 priority (calibration info-gain vs steady-state focus), the Stage-3 selection primitive
  (`catalog.select`, built here), the **exploration floor p≈0.10** (the first nondeterminism —
  thread and log a seed), and Stage-4 compound-first ordering.
- **ES-009.1 volume** (coupled — runs inside ES-009 between Stage 2 and Stage 3): enum bands
  (8/12/18), two-lever allocation (slots × sets), focus weighting, calibration restraint.
- **ES-011 fatigue ceiling** as the **live** mechanism (`MAX_SESSION_SETS = 24` fallback) + the
  **recovery gate**, on Sprint 2 fatigue state; deterministic reduction order.
- **Multi-set / multi-capability blocks**, via the `complete_block()` hook built here; prefer
  single-capability slots in V1 (ratified) to keep the C.3 de-fatigue exact; flag the
  approximation at the seam.

Begin with a Sprint 3B-2 planning review (the templates/coverage proof and the new
nondeterminism are the gating design items). After 3B-2: Sprint 4 instrumentation + Phase 0 gate
→ Sprint 5 app/cohort → Sprint 6 Investigation + Trust (per `HUSH_V1_EXECUTION_CONTEXT.md` §5).

## 7. Updated repository status

```
docs/canonical/    HUSH_V1_PROJECT_STATUS.md     <- canonical status anchor (now through Sprint 3B-1)
                   HUSH_V1_EXECUTION_CONTEXT / TRACEABILITY / SPEC_MANIFEST / INDEX
reviews/planning/  SPRINT_2_PLANNING_REVIEW, SPRINT_3_PLANNING_REVIEW, SPRINT_3A_*,
                   SPRINT_3B_PLANNING_REVIEW, SPRINT_3B1_IMPLEMENTATION_PLAN,
                   SPRINT_3B1_CODE_READINESS_REVIEW
reviews/completion/ SPRINT_3A_COMPLETION_REPORT, SPRINT_3B1_COMPLETION_REPORT  <- THIS FILE
implementation/sprint0/  pure model loop + synthetic athlete (edited in place through 3B-1)
implementation/sprint1/  persistence, hierarchy, pipeline, service (edited in place through 3B-1)
implementation/sprint2/  fatigue/recovery/variance + migration_002
implementation/sprint3a/ decision.py, migration_003_decision.py, test_sprint3a.py, README.md
implementation/sprint3b1/ catalog.py, preference.py, migration_004_foundation.py,
                         test_sprint3b1.py, README.md
                         (edits in place: constants/domain/schema/repositories/pipeline/service/decision)
build/_verify/     assemble_and_test.py (snapshot -> hush_model tree; plain-assert runner)
```

- **Model:** Hush v1, frozen. **Sprints:** 0, 1, 2, 3A, 3B-1 complete.
- **Tests:** 82 passing (64 prior unchanged bit-for-bit).
- **DB schema version:** 4.
- **Canonical docs updated this sprint:** `HUSH_V1_PROJECT_STATUS.md` (status anchor, engine
  table, state zones, test counts, limitations, next sprint, repo status),
  `HUSH_V1_EXECUTION_CONTEXT.md` (§4 status, §5 3B-1/3B-2 roadmap), `HUSH_V1_TRACEABILITY.md`
  (Workout/Session + Recommendation engine rows, Exercise/catalog + StrategyState +
  PreferenceState state rows, REPLACE_EXERCISE decision row, five new formula rows). This report (new).
- **Next sprint:** Sprint 3B-2 — session composition + volume + live fatigue ceiling (Class-A only).
- **Provisional, pending Phase 0:** `PREFERENCE_NUDGE`; `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`; κ, τ_sys, τ_cap, σ²_ref.

---

*This report records the close of Sprint 3B-1. For the frozen model, start at
`HUSH_V1_EXECUTION_CONTEXT.md`; for rule origins, `HUSH_V1_TRACEABILITY.md`; for the live
status anchor, `HUSH_V1_PROJECT_STATUS.md`.*
