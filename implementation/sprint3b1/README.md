# Sprint 3B-1 — Foundation + REPLACE_EXERCISE

> First half of the approved Sprint 3B split. Builds the prerequisite foundation that
> ES-009/009.1 and ES-006-REPLACE assume — the ES-002 catalog, StrategyState,
> PreferenceState, and the global-confidence/calibration aggregate — and promotes L2
> `REPLACE_EXERCISE` from signal-only to live, on the existing single-block path. No
> composition, volume, or fatigue ceiling (those are Sprint 3B-2). Every mechanism traces
> to a frozen spec; nothing is redesigned. Governing rule: *no redesign without explicit
> model review.*

- **Status:** complete. **Tests:** 82 passing (64 prior bit-for-bit + 18 new).
- **Schema version:** 4 (additive foundation migration).
- **Canonical plan:** `reviews/planning/SPRINT_3B1_IMPLEMENTATION_PLAN.md` (accepted).
- **Readiness review:** `reviews/planning/SPRINT_3B1_CODE_READINESS_REVIEW.md` (accepted).
- **Planning review:** `reviews/planning/SPRINT_3B_PLANNING_REVIEW.md` (accepted).

---

## 1. What this sprint delivers

| Mechanism | Spec | Where |
|---|---|---|
| ES-002 exercise catalog (canonical + ≥1 alternate per Class-A capability) | ES-002 | `catalog.py` (code-resident, frozen reference data) |
| Three distinct relations: capability · replacement_group · exercise_family | ES-002 / ES-009 §6 | `catalog.py` |
| Stage-3 selection primitive (canonical-in-calibration / preference-at-steady-state) | ES-009 §6 | `catalog.ExerciseCatalog.select` |
| StrategyState (`weekly_frequency`, `weekly_volume` **enum**, focus) | ES-008 v2 / ES-009 / ES-009.1 | `domain.StrategyState`, `strategy_state` table |
| PreferenceState (`exercise_family`, `preference_score=50`) | ES-007/010 / ES-009 §6 | `domain.PreferenceState`, `preference_state` table |
| `global_confidence = mean(Class-A confidences)` + `calibration_phase` (<70) | ES-009 §5 / ES-008 v2 | `domain.AthleteState.global_confidence` / `.calibration_phase` (derived) |
| L2 `REPLACE_EXERCISE` — preference-driven, never performance-driven | ES-006 / ES-009 §6 | `service.replace_exercise`, `catalog.replace` |
| Minimal behaviour nudge (one bounded step per REPLACE event) | ES-009 §6 | `preference.nudge` (`PREFERENCE_NUDGE`, provisional) |
| REPLACE audit (`replaced_from_exercise`, `replace_reason`) | ES-006 audit / Inv. 7 | `domain.Recommendation`, schema |
| **Single block-completion hook** (decision memory updates once per block) | ES-006 (relocation) | `pipeline._record_block_decision` / `pipeline.complete_block` |

## 2. The block-completion unification (ratified design)

Sprint 3A's streak/decision-memory update lived **only** in `report_set` at `set_number == 1`;
`report_set_fatigue_aware` had no governor at all. Sprint 3B-1 unifies both behind **one**
shared hook, `_record_block_decision`, so there is no duplicated governor logic (readiness
review HD1):

- `complete_block(...)` is the public hook for **multi-set** blocks: report each set with
  `govern=False` (learning only), then call `complete_block` **once** — the sole place the
  ES-006 streak advances for multi-set blocks (Sprint 3B-2 composition uses this).
- `report_set(..., govern=True)` and `report_set_fatigue_aware(..., govern=True)` each
  **delegate to the same hook** at end-of-call. Because 3A blocks are single-set, the block
  completes in-call and the Sprint 3A governed trajectory is reproduced **bit-for-bit**.
- **Block surprise** is `s_obs − score_at_block_entry` (ratified), captured once per block
  from the score at block open — independent of intra-block score drift. On the
  single-capability single-set path it equals `S_obs_clean − score_before`, identical to 3A.

## 3. Why the 64 prior tests stay bit-for-bit (the parity firewall)

Nothing here is wired into the existing numeric paths. `recommend()` and `fatigue.set_fatigue`
still receive `difficulty_factor` from the caller; canonical catalog entries are
`difficulty_factor = 1.0` and `exercise_cost = 1.0`, and catalog `exercise_cost` is
**reference-only**. The new state is additive with inert defaults (no strategy/preference
rows ⇒ single-source defaults via `default_strategy_state` / `preference_score = 50`), and
`govern` defaults False on both pipeline paths. So the Sprint 0/1/2/3A trajectories — the
Sprint 1 parity test (`<1e-9`), the Sprint 2 reason-string identities, and the 3A governed
sequencing harness — all pass unchanged.

## 4. Single source of truth for defaults (MR3)

StrategyState defaults live in **one** place: `constants.STRATEGY_DEFAULT_*` → the factory
`domain.default_strategy_state`. Both onboarding seeding (`create_athlete`) and
default-on-absence (`get_strategy_state` for a migrated, row-less athlete) route through it,
so a migrated athlete and a freshly-seeded athlete are provably identical
(`test_default_on_absence_equals_freshly_seeded`).

## 5. Files

**New:** `catalog.py` (ES-002, code-resident), `preference.py` (the bounded nudge),
`migration_004_foundation.py` (two tables + REPLACE audit cols, additive/idempotent),
`test_sprint3b1.py`, this README.
**Edited in place (additive):** `constants.py` (calibration threshold, volume enum,
strategy defaults, `PREFERENCE_NUDGE`), `domain.py` (StrategyState/PreferenceState + factory,
AthleteState `strategy`/`preferences` + `global_confidence`/`calibration_phase`,
Recommendation +2 audit fields), `schema.py` (2 tables + 2 recommendation columns),
`repositories.py` (strategy/preference sole-writer methods, seeding, `load_athlete_state`
wiring, `insert_recommendation` audit columns), `pipeline.py` (the shared
`_record_block_decision` hook, public `complete_block`, `govern` on the fatigue-aware path),
`service.py` (`replace_exercise`), `decision.py` (REPLACE reason constant).

## 6. Conditions honored (acceptance gate)

1. **Pipeline unified through one `complete_block()`** for rested and fatigue-aware flows;
   no duplicated governor (`_record_block_decision` is the sole updater).
2. **Block surprise = `s_obs − score_at_block_entry`**, computed once per block.
3. **Parity firewall** — canonical `difficulty_factor`/`exercise_cost = 1.0`; catalog cost
   reference-only; the 64 prior tests stay bit-for-bit.
4. **Single source of truth for StrategyState defaults** — seeding and default-on-absence
   share one factory.

## 7. Deferred to Sprint 3B-2 / later (stubbed at clean boundaries)

- ES-009 composition stages + ES-009.1 volume/two-lever allocation + exploration floor — 3B-2.
- ES-011 fatigue ceiling (live) + recovery gate — 3B-2 (`MAX_SESSION_SETS = 24` fallback).
- Class-B `vertical_pull` / Class-C `core_stability` — inactive; **absent** from the catalog.
- Volume band auto-progression / ES-007 Strategy Evaluation consumer — later.
- A preference-learning engine — only the minimal bounded nudge ships (`PREFERENCE_NUDGE`
  provisional/unvalidated, like κ/τ; do not tune).
- `CHANGE_STRATEGY` (ES-013), TrustScore (ES-012) — later sprints.

## 8. Running

This checkout holds per-sprint **snapshots**, not the assembled tree. To verify:
`python build/_verify/assemble_and_test.py` assembles `hush_model/ + sim/ + tests/` from the
snapshots and runs every `test_*` (plain-assert runner; no pytest in this checkout).
Expected: `82/82 passed`. In a real assembled tree,
`PYTHONPATH=. python -m pytest tests/ -q` should report 82 passing.
