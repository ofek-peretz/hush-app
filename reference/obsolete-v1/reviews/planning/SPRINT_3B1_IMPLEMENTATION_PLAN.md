# Sprint 3B-1 Implementation Plan — Foundation + REPLACE_EXERCISE

> Implementation plan for Sprint 3B-1, the first half of the approved Sprint 3B split. Scope is the **prerequisite foundation** (ES-002 catalog, StrategyState, PreferenceState, global-confidence/calibration) plus **L2 REPLACE_EXERCISE promoted to live**, on the existing single-block path — **no composition, no volume, no fatigue ceiling** (those are 3B-2). Implements frozen specs; does not redesign the model. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0/1/2/3A ✅ (64 tests) · Schema v3 · No code written.

> **STATUS: ACCEPTED (2026-06-10).** Ratified decisions (see §8):
> 1. **Code-resident catalog.** The ES-002 catalog is frozen reference data and does **not** enter the database.
> 2. **`global_confidence = mean(Class-A capability confidences)`.**
> 3. **Default-on-absence migration.** No backfill; absent strategy/preference rows resolve to defaults.
> 4. **Fixed provisional preference nudge constant** — a single bounded constant, clearly marked provisional/unvalidated.
> 5. **StrategyState default seeding:** `weekly_frequency = 3`, `weekly_volume = moderate`, `focus = null`.
> 6. **Streak relocation lands in Sprint 3B-1.**

## 1. Objective

Build the static and projected state that ES-009/009.1 and ES-006-REPLACE silently assume but the Sprint 0–3A build never created, and prove it end-to-end by promoting **L2 `REPLACE_EXERCISE`** from signal-only to a live, preference-driven decision on the existing single-block path. The foundation is not stranded scaffolding: REPLACE *consumes* the catalog and PreferenceState, so shipping it exercises every new object before 3B-2's composition multiplies the branches. The non-negotiable, as in every prior sprint, is that with the new state at inert defaults the Sprint 0/1/2/3A trajectories reproduce **bit-for-bit** (64 tests green).

## 2. Scope

**In scope (the 3B-1 deliverable):**
- **ES-002 exercise catalog** — a frozen, **code-resident** (ratified), read-only Class-A catalog: per exercise `{exercise_id, capability(s)+contribution_weight, difficulty_factor, equipment, class, replacement_group, exercise_family, exercise_cost}`. Canonical (`difficulty_factor = 1.0`) + ≥1 alternate per Class-A capability. Single source of truth in a `catalog.py` module, version-tied to `CAPABILITY_MODEL_VERSION`; **not** athlete state, **not** in the DB.
- **StrategyState** (mutable projection) — `weekly_frequency`, `weekly_volume` **enum** (low/moderate/high), `primary_focus`, `secondary_focus`. Seeded at onboarding defaults (freq 3 / moderate / null focus — ratified); single-writer.
- **PreferenceState** (mutable projection) — `(exercise_family, preference_score=50)`; **minimal behavior-driven** update only (a single bounded provisional nudge), no learning curve (ratified).
- **global_confidence aggregate + `calibration_phase`** (`< 70 ⇒ calibrating`) — **derived** as `mean(Class-A confidences)` (ratified), not stored.
- **Multi-set streak relocation** — move the ES-006 decision/streak update from `set_number == 1` to **block completion** (3A debt; must precede 3B-2's multi-set blocks).
- **L2 `REPLACE_EXERCISE` live** — preference/equipment/skip-driven only, **never performance-driven**; a reusable selection over the capability's `replacement_group`, honoring the class constraint (the primitive ES-009 Stage 3 will later reuse).

**Out of scope (3B-2 / later, stub at clean boundaries):**
- ES-009 composition stages, ES-009.1 volume/two-lever allocation, the ES-011 fatigue ceiling + recovery gate, the exploration floor and its nondeterminism — **all 3B-2**.
- Class-B/Class-C exercises in the catalog as *active* (may be present but inert; no live slots).
- Volume band auto-progression / ES-007 Strategy Evaluation consumer — StrategyState is written at onboarding/explicit-set only this sprint.
- CHANGE_STRATEGY (ES-013), TrustScore/override-productivity (ES-012).
- A preference-learning engine — the score moves by a single bounded nudge, flagged provisional.

## 3. Schema changes (additive; migration 004 → schema_version 4)

Mirror the migration_002/003 discipline exactly: **additive only** (new tables + `CREATE TABLE IF NOT EXISTS`; `ALTER ADD COLUMN` for new columns), idempotent, every new column defaulted to an **inert** value, so a Sprint 3A DB migrates with zero semantic change and the 64 prior tests stay bit-for-bit.

**New table — `strategy_state` (mutable projection, 1 row/athlete):**

| Column | Type / default | Spec |
|---|---|---|
| `athlete_id` | TEXT PK → athlete(id) | ES-008 v2 |
| `weekly_frequency` | INTEGER NOT NULL DEFAULT 3 | ES-009 §4 |
| `weekly_volume` | TEXT NOT NULL DEFAULT 'moderate' | ES-009.1 §1 (enum: low/moderate/high) |
| `primary_focus` | TEXT NULL | ES-009 §5 |
| `secondary_focus` | TEXT NULL | ES-009 §5 |
| `updated_at` | TEXT NOT NULL | — |

**New table — `preference_state` (mutable projection, 1 row/(athlete, exercise_family)):**

| Column | Type / default | Spec |
|---|---|---|
| `athlete_id` | TEXT NOT NULL → athlete(id) | ES-007/010 |
| `exercise_family` | TEXT NOT NULL | ES-002 / ES-009 §6 |
| `preference_score` | REAL NOT NULL DEFAULT 50 | ES-009 §6 (default 50 if unobserved) |
| `updated_at` | TEXT NOT NULL | — |
| | PRIMARY KEY (athlete_id, exercise_family) | — |

**No catalog table** (ratified). The ES-002 catalog is frozen reference data in `catalog.py`, single source of truth, versioned by `CAPABILITY_MODEL_VERSION`. History rows already snapshot the consumed `exercise`/`difficulty_factor` per block (Invariant 2), so audit reconstruction does not need a DB copy of the catalog.

**Optional column adds (only if REPLACE/audit needs them):** `recommendation.replaced_from_exercise` (TEXT NULL) + `recommendation.replace_reason` (TEXT DEFAULT '') so a live REPLACE is reconstructable (Invariant 7). Additive, inert defaults.

`PRAGMA table_info` / `sqlite_master` guards as in migration_003; bump `schema_version` to 4.

## 4. State changes

**Static/catalog (new, code-resident):** `catalog.py` — `ExerciseCatalog` with lookup by capability (class-matched), by `replacement_group`, and `canonical_for(capability)`. Read-only; imported like constants. Supersedes the placeholder `EXERCISE_COST_DEFAULT` / single-canonical-exercise assumption in `constants.py`. **Parity rule:** canonical entries are `difficulty_factor = 1.0`, `exercise_cost = 1.0`; the fatigue/recommendation paths continue to receive `difficulty_factor` exactly as today, so Sprint 2 fatigue values are unchanged.

**Mutable projection (new):**
- `StrategyState` dataclass + table; written **only** by `StateRepository` (new `create`/`write`/`load` methods), seeded in `create_athlete` with ratified defaults. Single-writer extended, not bypassed.
- `PreferenceState` dataclass + table; written **only** by `StateRepository`. Minimal update: on a REPLACE/skip, nudge the chosen/rejected family's `preference_score` by `PREFERENCE_NUDGE` (a single bounded provisional constant, clamped [0,100]); **no** performance signal enters it (ES-006: replacement is preference-driven, never performance-driven).

**Mutable projection (derived, no new storage):** `global_confidence(athlete_state) = mean(capability_state.confidence over CLASS_A_CAPABILITIES)`; `calibration_phase = global_confidence < 70`. Computed on read; not stored.

**Mutable projection (relocation, no new fields):** the 3A decision-memory streak update (`consecutive_positive/negative`, `last_recommended_weight`, `last_decision`) moves from "first set of the block" to **block completion**. The projected streak still lives on `capability_state` (unchanged columns); only its *write site* moves. Precondition for 3B-2's multi-set blocks; keeps the stability guard reading one decision per block, not per set.

**Single-writer invariant — the three-site checklist extends to two new tables.** For `capability_state` the lockstep sites are `create_athlete` / `write_capability_state` / `_row_to_cap` (guarded by `test_decision_memory_round_trips`). `strategy_state` and `preference_state` each get the same three-site discipline (create-seed / write / row-read), each guarded by a round-trip test.

## 5. Migration requirements

- **`migration_004_foundation.py`** — additive, idempotent, same runner shape as `migration_003_decision.py`: `CREATE TABLE IF NOT EXISTS strategy_state (...)`, `CREATE TABLE IF NOT EXISTS preference_state (...)`, optional `ALTER ... ADD COLUMN` for the recommendation audit fields (guarded by `_columns`), then `INSERT OR REPLACE INTO schema_version VALUES (4, ...)`.
- **Default-on-absence (ratified):** a migrated Sprint 3A DB has **no** strategy/preference rows. Code treats "no StrategyState row" as the default strategy (freq 3 / moderate / null focus) and "no PreferenceState row" as `preference_score = 50` — identical to a fresh athlete — so an un-onboarded-for-3B athlete is semantically unchanged. **No backfill.**
- **Forward-only**, no down-migration (consistent with 002/003). Idempotency proven by re-running `apply()` (no-op second time).
- **Catalog is not migrated** (code-resident).

## 6. Test strategy (extends the 64; parity is blocking)

1. **Parity (blocking):** with no strategy/preference rows and the catalog defaulting to the canonical exercise (df=1.0, cost=1.0), the Sprint 0/1/2/3A pipelines reproduce their trajectories **bit-for-bit** — the 64 stay green.
2. **Migration 004:** additive + idempotent (re-apply = no-op); a Sprint 3A DB migrates, `schema_version = 4`, and an athlete with no new rows behaves identically (semantic-unchanged assertion).
3. **Round-trip (three-site guards):** `StrategyState` and `PreferenceState` each survive create → write → load unchanged (the `test_decision_memory_round_trips` analogue for each new table).
4. **Catalog integrity:** every Class-A capability has a canonical exercise (df=1.0) and ≥1 class-matched alternate in its `replacement_group`; no exercise maps across a class boundary; `vertical_pull`/`core_stability` entries (if present) are inactive and never returned for a Class-A slot.
5. **global_confidence / calibration_phase:** derived value crosses `calibration_phase` false at the 70 boundary; not stored; recomputes after a confidence-moving update.
6. **REPLACE_EXERCISE (live):** preference-driven selection from the `replacement_group` (e.g. db_bench 88 vs bench_press 50 → db_bench), class constraint honored; **never performance-driven** (a low-performance high-preference exercise is not replaced on performance); the swap preserves the capability; audit-reconstructable.
7. **Preference nudge (minimal):** a REPLACE/skip nudges `preference_score` by `PREFERENCE_NUDGE`, clamped [0,100]; no performance signal alters it; flagged provisional.
8. **Multi-set streak relocation:** with a synthetic multi-set block, the decision/streak update fires **once at block completion**, not per set; the 3A multi-session sequencing harness (stability guard → INCREASE, streak persistence, reset-on-fire) stays green after the move.
9. **Audit reconstruction:** a session using a non-canonical (preferred) exercise reconstructs which catalog entry/family/preference drove the selection.

## 7. Definition of Done

- ES-002 Class-A catalog live in `catalog.py` (canonical + ≥1 alternate per capability; class/replacement_group/family/difficulty_factor/cost), single source of truth, version-tied; placeholder `EXERCISE_COST_DEFAULT`/single-canonical assumptions retired without changing fatigue values.
- `StrategyState` + `PreferenceState` tables, dataclasses, and single-writer methods landed; the three-site write-checklist held for each and guarded by a round-trip test.
- `global_confidence = mean(Class-A confidences)` + `calibration_phase` derived (not stored); boundary-tested at 70.
- ES-006 streak/decision update relocated to **block completion**; 3A sequencing harness green.
- **L2 `REPLACE_EXERCISE` live** — preference/equipment/skip-driven, never performance-driven, capability-preserving, class-constrained, audit-reconstructable; CHANGE_STRATEGY still signal-only.
- Migration 004 additive/idempotent; `schema_version = 4`; a migrated Sprint 3A DB semantically unchanged (default-on-absence).
- **All 64 prior tests bit-for-bit** + the new 3B-1 tests passing.
- Single-writer / Inv. 1 (state not history) / Inv. 2 (catalog reference, history snapshots) / Inv. 7 (replacement reconstructable) preserved.
- Sprint 3B-1 README (house style) + canonical updates (PROJECT_STATUS, EXECUTION_CONTEXT §4, TRACEABILITY rows: ES-002 catalog, PreferenceState, StrategyState, REPLACE_EXERCISE → 3B-1 code).

## 8. Open questions — RESOLVED (2026-06-10)

1. **Catalog as code module vs DB table:** **RESOLVED — code-resident frozen reference data; not in the DB.**
2. **`global_confidence` aggregation:** **RESOLVED — mean of the five Class-A capability confidences.**
3. **Migration backfill vs default-on-absence:** **RESOLVED — default-on-absence; no backfill.**
4. **PreferenceState nudge magnitude:** **RESOLVED — a single fixed bounded constant (`PREFERENCE_NUDGE`), flagged provisional/unvalidated; no learning curve.**
5. **StrategyState seeding:** **RESOLVED — defaults freq 3 / moderate / null focus; no onboarding capture this sprint.**
6. **Streak-relocation timing:** **RESOLVED — lands in Sprint 3B-1 (so 3B-2's multi-set blocks arrive on the corrected site).**
