# Sprint 3A Completion Report — Decision Hierarchy (ES-006)

> Completion record for Sprint 3A, the first half of the approved Sprint 3 split. It
> states what was built, what remains deferred, and what is known to be unproven, as of
> the close of Sprint 3A. It does not redesign the frozen model; every claim traces to a
> frozen specification (`HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`) or to
> delivered, tested code. Mirrored into the canonical status anchor
> (`docs/canonical/HUSH_V1_PROJECT_STATUS.md`). Governing rule: *no redesign without
> explicit model review.*

- **Date:** 2026-06-10
- **Model:** Hush v1 (frozen)
- **Build:** Sprint 0 ✅ · Sprint 1 ✅ · Sprint 2 ✅ · **Sprint 3A ✅**
- **Tests:** 64 passing (12 + 7 + 27 + 18); the 46 prior tests unchanged **bit-for-bit**
- **Schema version:** 3 (additive ES-006 decision migration applied)
- **Inputs:** `SPRINT_3_PLANNING_REVIEW.md`, `SPRINT_3A_IMPLEMENTATION_PLAN.md`,
  `SPRINT_3A_CODE_READINESS_REVIEW.md` (all accepted)

---

## 1. What was implemented

Sprint 3A turned the load *computation* the system already did into an explicit,
auditable, oscillation-resistant **ES-006 decision**, on the existing single-block path.

**The governor (ratified design).** ES-006 acts as a **governor / rate-limiter over the
ES-005.1 score-derived target load**: the score-derived load is the *target*, and the
decision layer decides whether — and how fast — the emitted load moves toward it. The
**single source of truth for load is preserved** (Invariant 3): the governor never
computes a load from scratch; it returns either the held load or the held load stepped by
**one** equipment increment toward the target.

| Mechanism | Spec | Where |
|---|---|---|
| L1 decision tree (KEEP / INCREASE / DECREASE) as a governor | ES-006 | `decision.govern()` |
| Default `KEEP_LOAD` under uncertainty / conflict | ES-006 Default Behavior, Safety Rules | `decision.govern()` |
| Stability guard — `STABILITY_N = 3` consistent observations (ratified) | ES-006 Stability Requirement | `decision.update_streaks()` |
| Streak on the **fatigue-adjusted surprise** (`S_obs_clean − score_before`) | ES-011 C.1 | `pipeline.py` (governed path) |
| Confidence gate on whether/how far the load moves | ES-006 Confidence Gate | `decision.govern()` |
| Load progression by equipment increment (never exceed granularity) | ES-006 Load Progression | `constants.EQUIPMENT_STEP_KG` |
| Reset-the-streak-on-fire (no immediate re-fire) | ES-006 Recommendation Memory | `pipeline.py` |
| Decision memory (`last_recommended_weight`, `last_decision`, streaks) | ES-006 | `domain.CapabilityState` (projected) |
| `decision_type` + `target_load` audit ("why didn't it move?") | ES-006 audit / Invariant 7 | `domain.Recommendation`, schema |
| Sprint 2 fatigue gating folded in as named decisions (`fatigue_hold`, INCREASE veto) | ES-011 B.2/B.3 | `recommendation.py` (behavior unchanged) |

**`decision.py` is the single live decision authority** (mandated condition 1):
recommendation, fatigue, and decision-reason codes converge there; the Sprint 2
`fatigue.decision_reason()` helper is marked **superseded** (retained only for its unit
tests). Legacy reason strings (`working_set:…`, `fatigue_hold:…`) are preserved verbatim
as `decision.py` constants, so the audit log and the Sprint 0–2 assertions are unchanged.

**Default-inert by construction.** The governor engages only when
`last_recommended_weight` is non-NULL, and only the opt-in governed pipeline path
(`report_set(…, govern=True)`) ever writes it. Every Sprint 0–2 caller leaves it at
default, so `recommend()` takes the cold-start branch and is byte-identical to before.

**Observed governed trajectory** (seeded score 40, truth 60, confidence 55): load held at
the cold-start seed (52.5) while the score climbs, then a single 2.5 kg step at the
sessions where the re-derived target clears the held load (e.g. weeks 6 and 11). Load lags
the rising score, one plate at a time — load is the fast knob, used gently.

**Persistence & audit (MR2 honored).** Five decision-memory fields added to
`capability_state`; `decision_type`/`target_load` added to `recommendation`, and
`decision_type` to `state_update_log`. All five `CapabilityState` fields are written in
**`create_athlete`**, **`write_capability_state`**, and read in **`_row_to_cap`** — the
three-site checklist — guarded by `test_decision_memory_round_trips`. Migration 003 is
additive and idempotent (schema_version → 3); a migrated Sprint 2 DB is semantically
unchanged (inert defaults).

## 2. What remains deferred

Deferred items are stubbed at clean boundaries (forward-referenced, not redesigned around):

- **L2 `REPLACE_EXERCISE`** — **signal-only.** Needs the ES-002 exercise catalog,
  PreferenceState, and `replacement_group` — all **Sprint 3B**. 3A defines the branch point.
- **`CHANGE_STRATEGY` (L4)** — signal-only; licensed only by a completed investigation (ES-013).
- **Session composition + volume (ES-009 / ES-009.1)** — Sprint 3B, including the ES-011
  fatigue ceiling and recovery gate (Class-A only; Vertical Pull / Core Stability inactive).
- **Override-productivity metrics / TrustScore (ES-012)** — Sprint 6. 3A keeps the three
  override metrics **un-collapsed** and the override target loggable (A9), but does not
  compute them; the synthetic athlete performs the recommendation, so overrides are not yet
  exercised on real data.
- **Threshold calibration** — `DECISION_CONF_GATE`, `SURPRISE_DEADBAND` are **provisional**
  (no external anchor; a Phase 0 responsibility, like κ/τ/σ²_ref). `STABILITY_N = 3` is ratified.
- **Per-athlete τ, `effort_offset`** — unchanged from Sprint 2 (fixed τ; offset = 0).
- **Multi-set blocks** — 3A blocks are single-set; the streak update is confined to one per
  block (`set_number == 1`). Sprint 3B (multi-set blocks) must relocate it to block completion.

## 3. Current architecture state

**One model package + a persistence layer; synchronous; single SQLite database.** No
microservices, queue, or network boundary.

**Engines:**

| Engine | State | Notes |
|---|---|---|
| Prediction (ES-004/005.1/011) | ✅ built | fatigue-adjusted (`score − Fatigue_c`) |
| Evidence (ES-004/010) | ✅ built | load-space attribution; de-fatigue ordering (C.3) |
| State Update (ES-007/005.1/010 C) | ✅ built | precision blend + variance damping; **sole state writer** |
| Recommendation (ES-006/005.1/011) | ✅ built (L1) | **Sprint 3A: governor over the ES-005.1 target** — KEEP/INCREASE/DECREASE + stability guard + confidence gate + fatigue gating; L2 REPLACE signal-only (3B) |
| Fatigue & Recovery (ES-011) | ✅ built | generation, fixed-τ decay, de-fatigue, veto |
| Workout / Session (ES-001/009/009.1) | ◑ partial | ES-001 hierarchy persisted; composition/volume = Sprint 3B |
| Investigation (ES-013) | ✗ deferred | — |
| Trust Measurement (ES-012) | ✗ deferred | — |

**State zones:**
- *Mutable projection:* `athlete`, `athlete_state` (+ systemic fatigue), `capability_state`
  (+ fatigue, variance moments, **+ Sprint 3A decision memory:**
  `last_recommended_weight`, `last_decision`, `consecutive_positive/negative`,
  `last_decision_week`).
- *Immutable history:* `workout_session → exercise_block → set_record`, `observation`,
  `evidence`, `recommendation` (**+ `decision_type`, `target_load`**), `state_update_log`
  (**+ `decision_type`**). Append-only; version-stamped.
- *Bookkeeping:* `schema_version` (= 3).

**Invariants holding:** decisions read from state not history (the streak/memory are
projected state, never a history scan — Invariant 1); recommendation ⇄ learning share one
inverted model — **the governor steps toward the score-derived target; no second load
formula** (Invariant 3); single state writer; transactional atomicity; every conclusion
carries `decision_type` + `target_load` so "why didn't the load move?" is reconstructable
(Invariant 7). **Operating mode:** Recommendation Mode only.

## 4. Current test counts

| Suite | Count | Scope |
|---|---|---|
| Sprint 0 | 12 | golden values, round-trip, decay/confidence anchors, closed-loop recovery |
| Sprint 1 | 7 | persistence, ES-001 hierarchy, transactional rollback, audit chain, pure↔persisted parity |
| Sprint 2 | 27 | fatigue generation/accumulation/decay, C.3 ordering, surprise (C.1), ES-010 C suppression/damping, recommendation gating, persisted fatigue audit, migration, harness stability |
| **Sprint 3A** | **18** | governor branches (KEEP/INCREASE/DECREASE, gate, step-to-target, conflict, cap-at-target); streak update + fatigue-can't-manufacture-DECREASE; cold-start parity + no-double-discount; MR2 memory round-trip; migration 003 additive/idempotent; **multi-session sequencing harness** (stability guard → INCREASE, streak persistence, reset-on-fire) |
| **Total** | **64** | all passing |

The 46 Sprint 0/1/2 tests pass **bit-for-bit** post-Sprint-3A (the Sprint 1 parity test at
`<1e-9` and the Sprint 2 reason-string identities are unchanged; the governor is
default-inert until decision memory exists).

**Verification (honest):** this checkout holds per-sprint *snapshots*, not the assembled
runnable tree, and has no `pytest`. The 64/64 result was produced by
`build/_verify/assemble_and_test.py`, which assembles the documented `hush_model/ + sim/ +
tests/` tree from the snapshot files and runs every `test_*` via a plain-assert runner. In
a real tree, `PYTHONPATH=. python -m pytest tests/ -q` should report 64 passing.

## 5. Known limitations

1. **`DECISION_CONF_GATE`, `SURPRISE_DEADBAND` are provisional/UNVALIDATED** — no external
   anchor; calibrated at the Phase 0 harness. `STABILITY_N = 3` is ratified. Do not tune them
   to fit a scenario.
2. **κ, τ, σ²_ref remain provisional** (Sprint 2 limitation, unchanged) — the fatigue/variance
   correction the governor's DECREASE-vs-fatigue branch relies on is directional, not calibrated.
3. **Overrides are instrumented but not exercised.** The synthetic athlete performs the
   recommendation, so the LOAD-override path (ES-010 B.4) and the three un-collapsed override
   metrics (ES-012) are scaffolded but not driven by data until a real athlete or an injected
   override scenario; full override productivity is Sprint 6.
4. **Single-set blocks only.** The streak update is confined to one per block; multi-capability
   and multi-set blocks (Sprint 3B) will activate the C.3 multi-capability approximation and
   require relocating the streak update to block completion.
5. **No session composition / volume / fatigue ceiling yet** — Sprint 3B.
6. **`CHANGE_STRATEGY` and `REPLACE_EXERCISE` are signal-only** — REPLACE awaits the catalog
   + PreferenceState (3B); CHANGE_STRATEGY awaits an investigation (ES-013).
7. **No instrumentation / API / app / Phase 0 harness** — later sprints.
8. **Repo layout:** snapshots ≠ assembled package; the runnable tree and `pytest` are not in
   this checkout (see §4).
9. **Existential assumptions (A1–A4) remain unreachable in MVP** by construction.

## 6. Recommended next sprint

**Sprint 3B — Session composition (ES-009) + volume (ES-009.1), Class-A only.**

Rationale: Sprint 3A delivered the ES-006 L1 decision hierarchy; the remaining half of the
approved split is composition + volume. The headline specs are ES-009/009.1, but the real
work (and risk) is the **prerequisites that do not yet exist**: the ES-002 exercise
catalog, StrategyState, PreferenceState, and the global-confidence/calibration plumbing —
these dominate the effort. The ES-011 **fatigue ceiling** (replacing `MAX_SESSION_SETS`)
and the **recovery gate** become implementable on the Sprint 2 fatigue state, and **L2
`REPLACE_EXERCISE`** becomes buildable once the catalog + PreferenceState exist.

Class-A only (ratified): Vertical Pull (Class B, needs bodyweight) and Core Stability
(Class C, duration pipeline) stay inactive; the 7-capability split templates are frozen but
inactive. Begin with a Sprint 3B planning review (the prerequisite foundation is the
gating dependency, exactly as the Sprint 3 planning review flagged).

After 3B: Sprint 4 instrumentation + Phase 0 gate → Sprint 5 app/cohort → Sprint 6
Investigation + Trust (per `HUSH_V1_EXECUTION_CONTEXT.md` §5).

## 7. Updated repository status

```
docs/canonical/    HUSH_V1_PROJECT_STATUS.md     <- canonical status anchor (now through Sprint 3A)
                   HUSH_V1_EXECUTION_CONTEXT / TRACEABILITY / SPEC_MANIFEST / INDEX
reviews/planning/  SPRINT_2_PLANNING_REVIEW, SPRINT_3_PLANNING_REVIEW,
                   SPRINT_3A_IMPLEMENTATION_PLAN, SPRINT_3A_CODE_READINESS_REVIEW
reviews/completion/ SPRINT_3A_COMPLETION_REPORT.md   <- THIS FILE
implementation/sprint0/  pure model loop + synthetic athlete (edited in place through 3A)
implementation/sprint1/  persistence, hierarchy, pipeline (edited in place through 3A)
implementation/sprint2/  fatigue/recovery/variance + migration_002 (decision_reason superseded)
implementation/sprint3a/ decision.py, migration_003_decision.py, test_sprint3a.py, README.md
build/_verify/     assemble_and_test.py (snapshot -> hush_model tree; plain-assert runner)
```

- **Model:** Hush v1, frozen. **Sprints:** 0, 1, 2, 3A complete.
- **Tests:** 64 passing (46 prior unchanged bit-for-bit).
- **DB schema version:** 3.
- **Canonical docs updated this sprint:** `HUSH_V1_PROJECT_STATUS.md` (status, engine table,
  state zones, test counts, next sprint), `HUSH_V1_EXECUTION_CONTEXT.md` (§4 status, §5
  3A/3B split), `HUSH_V1_TRACEABILITY.md` (Recommendation Engine / decision-type rows,
  governor + stability-guard formulas, CapabilityState decision memory). This report (new).
- **Next sprint:** Sprint 3B — session composition & volume (Class-A only).
- **Provisional, pending Phase 0:** `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`; κ, τ_sys, τ_cap, σ²_ref.

---

*This report records the close of Sprint 3A. For the frozen model, start at
`HUSH_V1_EXECUTION_CONTEXT.md`; for rule origins, `HUSH_V1_TRACEABILITY.md`; for the live
status anchor, `HUSH_V1_PROJECT_STATUS.md`.*
