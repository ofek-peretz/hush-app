# Sprint 3B-1 Code Readiness Review

> Pre-implementation readiness review of the accepted Sprint 3B-1 plan, conducted against the **actual built code** (`pipeline.py`, `decision.py`, `recommendation.py`, `repositories.py`, `schema.py`, `domain.py`, `constants.py`, `migration_003`). Checks whether the plan can be implemented faithfully and safely as written. No code written.
>
> Date: 2026-06-10 · Build: Sprint 0/1/2/3A ✅ (64 tests) · Schema v3.

> **STATUS: ACCEPTED (2026-06-10).** Verdict: **GO**, conditional on three pre-coding rulings (§6), all now ratified:
> 1. **Pipeline unification through a single `complete_block()` hook** for both rested and fatigue-aware flows; **no duplicated governor logic.**
> 2. **`block_surprise = s_obs − score_at_block_entry`**, computed once per block, independent of intra-block score drift.
> 3. **Parity firewall:** canonical `difficulty_factor = 1.0`, canonical `exercise_cost = 1.0`; catalog `exercise_cost` is reference-only and does not affect fatigue or recommendation behavior in 3B-1.
> 4. **Additional requirement:** a single source of truth for StrategyState defaults — seeding defaults and default-on-absence must come from the same constant/factory.

## 1. Hidden dependencies

**HD1 — The governor is wired into `report_set` only; `report_set_fatigue_aware` has no streak logic at all (highest).** The 3A streak/decision update (`update_streaks`, `last_recommended_weight`, reset-on-fire) lives **exclusively** in `report_set` under `govern=True` (`pipeline.py:145–166`). `report_set_fatigue_aware` — the path Sprint 2 uses and the one 3B-2 composition will run on — **never calls `update_streaks` and never writes decision memory**. "Relocate the streak update to block completion" is therefore a **reconciliation of two divergent pipelines**, not a move within one function. **RESOLVED — unify behind a single `complete_block()` feeding both paths; do not duplicate the governor.**

**HD2 — There is no block-completion hook; the pipeline is strictly per-set.** `report_set*` processes one set per call; the streak is gated by the proxy `set_number == 1`. "Block completion" is a concept that does not exist in the control flow. Relocation requires **net-new control flow** (a `complete_block()` entry point), plus deciding where the once-per-block write fires. **RESOLVED — add an explicit `complete_block()`; do not infer "last set" inside `report_set`.**

**HD3 — Block-level surprise is undefined for multi-set blocks.** The single-set code computes `surprise = ev.s_obs − score_before` (`pipeline.py:139`), but `score_before` is read once and `apply_evidence` mutates `cap_state.score` per set. With N sets there are N surprises against a drifting score. **RESOLVED — `block_surprise = s_obs − score_at_block_entry`, captured once at block open.**

**HD4 — `AthleteState` gains two new members → new construction/load sites.** `load_athlete_state` (`repositories.py:99`) builds `AthleteState` from athlete + capabilities only. Adding `strategy` and `preferences` means the loader and every construction site must carry them with default-on-absence (a second three-site trap beyond `capability_state` — MR2).

**HD5 — REPLACE has a decision *constant* but no decision *path*.** `decision.REPLACE_EXERCISE` exists (`decision.py:42`) but `govern()` only returns KEEP/INCREASE/DECREASE. REPLACE is an **L2 (exercise-identity) axis, orthogonal to the L1 load governor** — it does not belong inside `govern()`, and on the single-block path it has no natural trigger. 3B-1 builds a standalone selection primitive over `replacement_group` + an **injected trigger** test (the TG2/override analog). This is the primitive 3B-2 Stage 3 reuses.

## 2. Migration risks

**MR1 — schema.py ↔ migration_004 lockstep.** Both new tables (and any recommendation audit columns) must appear in `schema.py` (fresh DBs) and `migration_004` (existing DBs), identically.

**MR2 — The three-site trap, now ×3 tables.** `strategy_state` and `preference_state` each need create-seed + write + row-read in lockstep, and `AthleteState` assembly (HD4) must wire them. *Round-trip test per new table (mandatory DoD).*

**MR3 — Default-on-absence must be proven equivalent to a seeded row.** Two code paths now exist for "this athlete's strategy" (real row vs in-code default); if they diverge, behavior forks silently. **RESOLVED by the additional requirement — one constant/factory feeds both seeder and absence-fallback;** test that a migrated row-less athlete ≡ a freshly-seeded athlete (byte-identical recommendations).

**MR4 — `PRAGMA foreign_keys = ON` + new FK tables.** Both tables carry `REFERENCES athlete(id)`; create order must satisfy FKs and assume no rows. Low risk; cover in the idempotency test.

**MR5 — Catalog is not migrated, but `exercise_cost` is new.** If 3B-1 wires catalog cost into fatigue generation, Sprint 2 fatigue values shift and parity breaks. **RESOLVED — canonical cost ≡ 1.0; the fatigue path keeps `EXERCISE_COST_DEFAULT`; catalog cost is reference-only.**

## 3. State-model risks

**SM1 — Two divergent streak sites (HD1 consequence).** Until unified, decision memory is written on the rested path and not the fatigue-aware path. *Resolved by the `complete_block()` unification.*

**SM2 — `CapabilityStateSnapshot` is partial by design and must stay that way** (`pipeline.py:313`). The relocation reads/writes live `cap_state`, not the snapshot. Note; non-issue if respected.

**SM3 — Preference nudge direction and idempotence.** The nudge moves the chosen family up / rejected down by `PREFERENCE_NUDGE`, clamped [0,100], **once per REPLACE event** (not per set), with no re-firing on identical evidence. *Condition: test the clamp + no-double-nudge.*

**SM4 — `global_confidence` over a fixed Class-A set.** Must iterate `CLASS_A_CAPABILITIES` (the five), not "capabilities present." At seed all five sit at the floor (10), so `calibration_phase` is robustly true early. Pin the iteration set.

**SM5 — `weekly_volume` written but unconsumed in 3B-1.** Acceptable forward-reference, but must be a validated enum at write time (low/moderate/high) or 3B-2 inherits dirty data.

## 4. Catalog risks

**CR1 — `replacement_group`, `exercise_family`, and capability are three distinct relations that are easy to conflate.** Selection picks among a **capability's** exercises, scored by their **family's** `preference_score`, tie-broken by `difficulty_factor`; REPLACE searches the **replacement_group**. *Model the three relations explicitly; test a capability with two families in one group.*

**CR2 — Catalog `difficulty_factor`/`exercise_cost` must not perturb existing numeric paths.** **RESOLVED — canonical df=1.0/cost=1.0; `difficulty_factor` keeps flowing from the caller in 3B-1; catalog supplies factors for new selection only. Blocking parity check.**

**CR3 — Catalog versioning vs audit.** Code-resident, version-tied to `CAPABILITY_MODEL_VERSION`; history rows stamp `difficulty_factor`/`exercise` per block. Any catalog change is a model-version event, not a silent edit. Low risk for 3B-1.

**CR4 — Class-B/C entries present-but-inert is a footgun.** Any capability-lookup not filtering on active Class-A could surface them into a slot. *Condition: lookups filter to active Class-A; test an inactive entry is never returned. Simplest safe option: omit B/C from the 3B-1 catalog.*

## 5. Test coverage gaps

**TG1 — No block-completion test exists (net-new).** "Fires once per block at completion" has never been asserted; the synthetic multi-set block test is the only guard on the HD1/HD2/HD3 relocation. *Mandatory.*

**TG2 — Fatigue-aware governed path is untested (because it doesn't exist).** After unification, a test must run the fatigue-aware pipeline and assert decision memory advances. *Mandatory.*

**TG3 — REPLACE has no trigger in the sim.** Exercise via an injected trigger or it ships unproven. *Mandatory.*

**TG4 — Migration v3→v4 + default-on-absence equivalence.** Additive/idempotent test + the MR3 equivalence test. *Mandatory.*

**TG5 — Enum validation + catalog integrity have no analog** (CR1/CR4). Add per plan tests #3/#4.

## 6. Reasons Sprint 3B-1 should NOT begin — verdict: **GO, conditional on three pre-coding rulings (all ratified)**

No blocking model-ambiguity reason: the six plan questions were ratified, the catalog is Class-A-only, and every consumed prerequisite is built. The risks are integration and parity, not "is the math right" — the 3A risk-shift repeats. Three pre-coding rulings (now resolved) prevent baking in a wrong seam:

1. **Unify the two pipelines behind one `complete_block()` hook before relocating** (HD1/HD2/SM1). **RESOLVED — single shared path, no duplicated governor.**
2. **Define block-level surprise** (HD3). **RESOLVED — `s_obs − score_at_block_entry`, once per block.**
3. **Confirm the catalog parity firewall** (CR2/MR5). **RESOLVED — canonical df/cost = 1.0; caller still supplies df; catalog cost reference-only.**

Plus DoD additions: a round-trip test per new table (MR2), the MR3 default-equivalence test, the multi-set block-completion harness (TG1), the fatigue-aware governed test (TG2), and the injected REPLACE trigger (TG3). No model review required to proceed.

---

*Sources read: the accepted Sprint 3B-1 plan; `pipeline.py`, `decision.py`, `recommendation.py`, `repositories.py`, `schema.py`, `domain.py`, `constants.py`, `migration_003_decision.py`; ES-009 + ES-009.1 (`build/_txt/`); Sprint 3A completion report + code readiness review. No code written.*
