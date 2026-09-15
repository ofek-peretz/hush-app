# Sprint 3B-2 Completion Report — Session Composition + Volume + Live Fatigue Ceiling

> Completion record for Sprint 3B-2, the second half of the approved Sprint 3B split. It states
> what was built, what remains deferred, and what is known to be unproven, as of the close of
> Sprint 3B-2. It does not redesign the frozen model; every claim traces to a frozen specification
> (`HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`, ES-009/ES-009.1) or to delivered, tested
> code. Governing rule: *no redesign without explicit model review.*

- **Date:** 2026-06-10
- **Model:** Hush v1 (frozen)
- **Build:** Sprint 0 ✅ · 1 ✅ · 2 ✅ · 3A ✅ · 3B-1 ✅ · **3B-2 ✅**
- **Tests:** 105 passing (12 + 7 + 27 + 18 + 18 + **23**); the 82 prior tests unchanged **bit-for-bit**
- **Schema version:** 5 (additive composition-audit migration applied)
- **Inputs (all accepted):** `SPRINT_3B2_PLANNING_REVIEW.md`, `SPRINT_3B2_IMPLEMENTATION_PLAN.md`,
  `SPRINT_3B2_CODE_READINESS_REVIEW.md` (with ratified decisions Q1–Q3, R1–R5)

---

## 1. What was implemented

Sprint 3B-2 built the **Session Composition Engine (ES-009)** and the **Volume Composition Engine
(ES-009.1)** that run coupled (009.1 inside 009), promoted the **ES-011 session fatigue ceiling** to
the live mechanism with a **trim-only recovery gate**, and added the **session driver** that runs
multi-set / multi-slot blocks through the Sprint 2 learning chain — all Class-A only, all on the
proven Sprint 3B-1 foundation, with the Sprint 0–3B-1 trajectories preserved **bit-for-bit**.

| Mechanism | Spec | Where |
|---|---|---|
| ES-009 four-stage composition (template → priority → selection → ordering), load-free | ES-009 §3–7 | `composition.py` |
| Class-A-restricted frozen split templates + 5/5 coverage proof; 7-cap templates frozen inactive | ES-009 §4 | `constants.TEMPLATES_CLASS_A` / `TEMPLATES_7CAP` |
| Stage-2 priority: calibration info-gain (`staleness+uncertainty`) vs steady-state focus | ES-009 §5 | `composition.resolve_priority` |
| Stage-3 selection via the 3B-1 `catalog.select` primitive + the **exploration floor** | ES-009 §6 | `composition._select_for_slot` |
| ES-009.1 two-lever volume (slots × sets), focus weighting, calibration restraint; sole owner of `target_sets` | ES-009.1 §1–5 | `volume.py` |
| Stage-4 ordering by frozen `CAPABILITY_PRIORITY_ORDER`, then canonical-first → `position` | ES-009 §7 / Q1 | `composition._order_key` |
| ES-011 **live** session fatigue ceiling + **trim-only** recovery gate (drop lowest-priority slots) | ES-011 / ES-009.1 §4 / Q2 | `composition._trim_to_ceiling` |
| Session driver: compose → persist → run sets → **one** decision update per capability | ES-009 → ES-006 | `session.SessionEngine` |
| Composition audit (seed, session_index, freq/volume/calibration snapshot, selection_reason) | ES-009 §9 / Inv. 7 | `schema.py`, `repositories.py`, `migration_005` |

**The ratified decisions, honored:**

1. **Q1 — `CAPABILITY_PRIORITY_ORDER = (knee_dominant, hip_dominant, horizontal_push,
   horizontal_pull, vertical_push)`** is the one frozen constant driving Stage-4 ordering, the
   ceiling/gate trim order (lowest priority = last = trimmed first), and all deterministic
   tie-breaks. **No new catalog metadata** (`is_compound`/scores) was introduced.
2. **Q2 — trim-only recovery gate.** Over the live ceiling, the gate removes the lowest-priority
   slot(s) — second slots before sole slots (coverage-preserving) — until total ≤ ceiling, and
   **never rebuilds or re-optimizes** the session.
3. **Q3 — band collapse accepted & documented** (§5); ES-009.1 ships unchanged.
4. **R1 — `SESSION_FATIGUE_CEILING = 24`**, flagged **PROVISIONAL / UNVALIDATED / CALIBRATION
   REQUIRED**. Under Class-A the session total never exceeds 24 (max 3 caps × 2 slots × 4 sets), so
   the live ceiling binds at most at equality; the trim is proven on a synthetic over-ceiling case.
5. **R2 — one governor update per capability per session.** All sets run `govern=False` (learning
   only); the ES-006 streak/decision memory advances once per capability via `complete_block()`,
   driven by the capability's **primary** slot. Secondary slots of the same capability contribute
   learning (score blend) but never decision memory. (Verified: a two-slot steady-state session
   advances each capability's streak by exactly one per session, not two.)
6. **R3 — governor memory stays capability-scoped.** No exercise-specific memory; `difficulty_factor`
   translates exercises through the ES-006 target (`recommendation.py`), so a preference/exploration
   swap self-corrects over sessions (the one-session transient is accepted).
7. **R4 — fully deterministic exploration.** The exploration floor draws from a `random.Random(seed)`
   seeded by a **persisted** session seed; no system-time/global randomness; it never fires during
   calibration and never crosses the class constraint. A session is bit-reconstructable from its seed.

**Composition is strictly load-free (Invariant 3 preserved).** `composition.py` emits an ordered
`SessionPlan` of `BlockPlan` skeletons with no load; the driver then calls ES-006 (`recommend`) per
block. There is no second load formula.

**Single-capability slots only (R4/CE2), guarded.** The catalog is entirely single-capability, so
composed blocks cannot be multi-capability and the C.3 de-fatigue approximation stays **dormant**; a
guard trips if a future multi-capability catalog entry would activate it.

**Persistence & migration.** `migration_005_composition.py` is additive and idempotent (schema v5):
five composition-audit columns on `workout_session` (incl. the **required** `exploration_seed`) and
`selection_reason` on `exercise_block`. **No backfill** — pre-3B-2 sessions carry NULL seed and are
semantically unchanged. Fresh (`schema.py`) and migrated column sets match (MR1, tested).

## 2. What remains deferred

Deferred items are stubbed at clean boundaries (forward-referenced, not redesigned around):

- **Class-B `vertical_pull` / Class-C `core_stability` as live slots** — the 7-cap templates are
  frozen **inactive** (`TEMPLATES_7CAP`); Class B needs bodyweight (absent from the Athlete entity)
  and Class C needs the duration curve + DurationObservation pipeline.
- **Volume-band auto-progression / ES-007 Strategy Evaluation consumer** — bands are static;
  ES-009.1 §6 emits a band-change *signal* to ES-007 (unbuilt); never swing the band per session.
- **Fatigue-ceiling / band / `P_EXPLORE` calibration** — Phase 0. `SESSION_FATIGUE_CEILING`,
  `P_EXPLORE`, the 8/12/18 bands and the lever clamps are directional, not calibrated.
- **The multi-capability C.3 de-fatigue approximation** — dormant by catalog construction; guarded.
- **`CHANGE_STRATEGY` (L4)** — signal-only; licensed only by a completed investigation (ES-013).
- **Investigation Engine + probes (ES-013), Trust Measurement (ES-012)** — later sprints.
- **Per-athlete τ, `effort_offset`** — unchanged (fixed τ; offset = 0).
- **A PreferenceState learning curve** — only the 3B-1 minimal bounded nudge; `PREFERENCE_NUDGE`
  provisional. The exploration floor re-tests dropped exercises but does **not** itself nudge
  preference (system-initiated, not athlete behavior).
- **Phase 0 stability/calibration harness, API, mobile app** — later sprints.

## 3. Current architecture state

**One model package + a persistence layer; synchronous; single SQLite database.** No
microservices, queue, or network boundary.

**Engines:**

| Engine | State | Notes |
|---|---|---|
| Prediction (ES-004/005.1/011) | ✅ built | fatigue-adjusted |
| Evidence (ES-004/010) | ✅ built | load-space attribution; de-fatigue ordering (C.3) |
| State Update (ES-007/005.1/010 C) | ✅ built | precision blend + variance damping; sole state writer |
| Recommendation (ES-006/005.1/011) | ✅ built (L1+L2) | governor over the ES-005.1 target; L2 REPLACE live |
| Fatigue & Recovery (ES-011) | ✅ built | generation, fixed-τ decay, de-fatigue, veto; **live session ceiling + trim-only recovery gate (Sprint 3B-2)** |
| Workout / Session (ES-001/009/009.1/002) | ✅ **built** | **ES-009 composition + ES-009.1 volume + the session driver (Sprint 3B-2)**, Class-A only |
| Investigation (ES-013) | ✗ deferred | — |
| Trust Measurement (ES-012) | ✗ deferred | — |

The Workout/Session engine moves from ◑ partial to ✅ built (Class-A): a full session now composes,
orders, volume-allocates, loads, runs, and learns end-to-end, deterministically and reconstructably.

**State zones:**
- *Static / catalog:* `athlete`; the ES-002 catalog is code-resident (`catalog.py`).
- *Mutable projection:* `athlete_state`, `capability_state`, `strategy_state`, `preference_state`
  — **all read-only to composition** (Principle #53). `global_confidence`/`calibration_phase`
  derived.
- *Immutable history:* `workout_session` (+ **Sprint 3B-2** `exploration_seed`, `session_index`,
  `weekly_frequency`, `weekly_volume`, `calibration_phase`) → `exercise_block` (+ **3B-2**
  `selection_reason`) → `set_record`; `observation`, `evidence`, `recommendation`, `state_update_log`.
- *Bookkeeping:* `schema_version` (= 5).

**Invariants holding:** decisions read from state not history (Inv. 1 — composition reads the
strategy/preference/capability projections, never a history scan); history immutable, catalog
reference data, and a composed session now snapshots its template/volume/seed inputs (Inv. 2);
composition is load-free so recommendation ⇄ learning still share one inverted model (Inv. 3); single
state writer (composition writes none); transactional atomicity (each set + each block-completion is
one transaction); every block is reconstructable from `(template, priority, band, focus,
times_trained, slot, selection_reason, seed, ceiling-trim)` (Inv. 7). **Operating mode:**
Recommendation Mode only.

## 4. Current test counts

| Suite | Count | Scope |
|---|---|---|
| Sprint 0 | 12 | golden values, round-trip, decay/confidence anchors, closed-loop recovery |
| Sprint 1 | 7 | persistence, hierarchy, rollback, audit chain, pure↔persisted parity |
| Sprint 2 | 27 | fatigue generation/accumulation/decay, C.3, surprise, ES-010 C, gating, migration |
| Sprint 3A | 18 | governor branches, streaks, cold-start parity, MR2 round-trip, migration 003 |
| Sprint 3B-1 | 18 | catalog/parity firewall, Strategy/Preference round-trip, calibration @70, migration 004, REPLACE |
| **Sprint 3B-2** | **23** | Class-A 5/5 coverage + templates-are-7cap-minus-inactive; frequency clamp; calibration vs focus priority; times_trained restricted; two-lever tables + **documented band collapse (Q3)**; focus volume; calibration restraint; **exploration determinism-given-seed / never-in-calibration / class-safe (R4)**; preference + distinct second slot; Stage-4 ordering; single-capability guard; **trim-only ceiling (Q2)** + never-exceeded-under-Class-A; driver audit + **one governor update per capability (R2)** + seed reconstructable; migration 005 additive/idempotent + fresh-vs-migrated parity (MR1); 70-boundary flip |
| **Total** | **105** | all passing |

The 82 Sprint 0–3B-1 tests pass **bit-for-bit** post-3B-2: composition is a new, load-free code path;
the new `SetResult` fields and `create_session`/`add_block` parameters are additive with inert
defaults; the new schema columns are additive/NULL.

**Verification (honest):** as in prior sprints this checkout holds per-sprint *snapshots*, not the
assembled runnable tree, and has no `pytest`. The 105/105 result was produced by
`build/_verify/assemble_and_test.py`, which assembles the documented tree and runs every `test_*`
via a plain-assert runner. In a real tree, `PYTHONPATH=. python -m pytest tests/ -q` should report
105 passing.

## 5. Known limitations

1. **`SESSION_FATIGUE_CEILING = 24` is PROVISIONAL / UNVALIDATED / CALIBRATION REQUIRED** (ratified
   R1). It has no external anchor (like κ/τ/σ²_ref/`P_EXPLORE`). Under Class-A the session total
   never exceeds 24, so the live ceiling is effectively inert in V1 (binds at most at equality); the
   trim logic is proven on a synthetic over-ceiling case and activates for real only with Class-B/C
   breadth or a calibrated lower ceiling.
2. **Volume bands are not fully distinguishable under Class-A (Q3, accepted).** Once-trained
   capabilities saturate the 2×4 lever, so **moderate == high** for them (all caps at frequency 2;
   the once-trained ones at frequency 3/4); `low` stays distinct, and twice-trained capabilities stay
   fully distinct. A consequence of the Class-A restriction collapsing `times_trained`, not an
   ES-009.1 defect; ES-009.1 is unchanged. Revisit when Class-B/C activate or in Phase-0 calibration.
3. **Default `focus = null` ⇒ every capability takes the ×0.75 "other" multiplier** (literal
   ES-009.1 §3), so the effective default band is 0.75× nominal. Faithful literal reading; flagged
   for model review in case a neutral (×1.0) no-focus multiplier was intended — deferred to Phase 0
   with the band calibration (not a redesign this sprint).
4. **`P_EXPLORE = 0.10` is provisional/unvalidated** — *that* the pool is re-tested is frozen
   (ES-009 §6); *how often* is not. Deterministic given the seed; do not tune to fit a scenario.
5. **Single-capability slots only.** The C.3 de-fatigue approximation is dormant by catalog
   construction (all entries single-capability); a guard trips on a future multi-capability entry.
6. **κ, τ, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`** remain
   provisional (unchanged) — directional, not calibrated, until Phase 0.
7. **No instrumentation / API / app / Phase 0 harness** — later sprints.
8. **Repo layout:** snapshots ≠ assembled package; the runnable tree and `pytest` are not in this
   checkout (see §4).
9. **Existential assumptions (A1–A4) remain unreachable in MVP** by construction.

## 6. Recommended next sprint

**Sprint 4 — Instrumentation & the Phase 0 simulation / calibration harness.** With the model now
composing and learning full sessions end-to-end (Class-A), the gating need is the validation program's
instruments and the only principled way to retire the provisional parameters:

- **Phase 0 simulation & calibration harness** — calibrate κ, τ, σ²_ref, `SESSION_FATIGUE_CEILING`,
  `P_EXPLORE`, `PREFERENCE_NUDGE`, and the decision thresholds against synthetic-cohort runs; resolve
  the null-focus ×0.75 question (Limitation #3) and the band collapse (Limitation #2) with data.
  **Phase 0 gate: model stable in sim, recovers synthetic capability.**
- **Instrumentation** — shadow-baseline logging, fresh-state checks, override-target logging, full
  audit reconstruction (now spanning composition: template/priority/band/seed/trim).

After Sprint 4: Sprint 5 app/cohort (Phase 1 seed-safety gate) → Sprint 6 Investigation + Trust
(Phase 2 gate), per `HUSH_V1_EXECUTION_CONTEXT.md` §5.

## 7. Updated repository status

```
docs/canonical/    HUSH_V1_PROJECT_STATUS.md     <- canonical status anchor (now through Sprint 3B-2)
                   HUSH_V1_EXECUTION_CONTEXT / TRACEABILITY / SPEC_MANIFEST / INDEX
reviews/planning/  ... SPRINT_3B2_PLANNING_REVIEW, SPRINT_3B2_IMPLEMENTATION_PLAN,
                   SPRINT_3B2_CODE_READINESS_REVIEW
reviews/completion/ ... SPRINT_3B1_COMPLETION_REPORT, SPRINT_3B2_COMPLETION_REPORT  <- THIS FILE
implementation/sprint3b2/ composition.py, volume.py, session.py,
                         migration_005_composition.py, test_sprint3b2.py, README.md
                         (edits in place: constants/schema/repositories/pipeline)
build/_verify/     assemble_and_test.py (snapshot -> hush_model tree; plain-assert runner)
```

- **Model:** Hush v1, frozen. **Sprints:** 0, 1, 2, 3A, 3B-1, 3B-2 complete.
- **Tests:** 105 passing (82 prior unchanged bit-for-bit).
- **DB schema version:** 5.
- **Next sprint:** Sprint 4 — instrumentation + Phase 0 calibration harness.
- **Provisional, pending Phase 0:** `SESSION_FATIGUE_CEILING`, `P_EXPLORE`, the 8/12/18 bands /
  lever clamps, the null-focus multiplier question; `PREFERENCE_NUDGE`; `DECISION_CONF_GATE`,
  `SURPRISE_DEADBAND`; κ, τ_sys, τ_cap, σ²_ref.

---

*This report records the close of Sprint 3B-2. For the frozen model, start at
`HUSH_V1_EXECUTION_CONTEXT.md`; for rule origins, `HUSH_V1_TRACEABILITY.md`; for the live status
anchor, `HUSH_V1_PROJECT_STATUS.md`.*
