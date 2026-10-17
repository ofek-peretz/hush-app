# Sprint 3B-2 Code Readiness Review — Session Composition (ES-009) + Volume (ES-009.1) + Live Fatigue Ceiling, Class-A only

> Code-readiness review, produced after the accepted `SPRINT_3B2_PLANNING_REVIEW.md` and
> `SPRINT_3B2_IMPLEMENTATION_PLAN.md`, **before any 3B-2 code**. It pressure-tests the plan against
> the *delivered* Sprint 0–3B-1 code to surface hidden dependencies, migration/state hazards, and
> test gaps. It does **not** redesign the frozen model; where it finds an under-determined seam it
> raises it as a gating question. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0/1/2/3A/3B-1 ✅ (82 tests) · Schema v4 · No code written.

> **STATUS: ACCEPTED (2026-06-10).** Carries the ratified decisions: Class-A only; live
> fatigue ceiling (24 fallback); single-capability slots; trim-only recovery gate (Q2);
> accept-and-document the band collapse (Q3); `CAPABILITY_PRIORITY_ORDER = (knee_dominant,
> hip_dominant, horizontal_push, horizontal_pull, vertical_push)`. **The five §6 gating items are
> resolved (R1–R5 below); implementation is authorized to proceed calibration-spine-first.**
>
> **§6 RESOLUTIONS (2026-06-10):**
> - **R1 — Provisional ceiling approved.** `SESSION_FATIGUE_CEILING = 24`, marked **PROVISIONAL /
>   UNVALIDATED / CALIBRATION REQUIRED** (same posture as κ/τ/σ²_ref). The live ceiling *is* 24 for
>   V1; the trim order is the ratified deterministic reduction.
> - **R2 — One governor update per capability per session.** Multiple blocks of the same capability
>   must **not** advance decision memory / streak more than once; the capability's **primary
>   (highest-priority, first) slot** drives the single `complete_block()`; secondary slots run the
>   learning path only (`govern=False`, no decision-memory write).
> - **R3 — Governor memory stays capability-scoped.** **No** exercise-specific governor memory in
>   3B-2; `last_recommended_weight` is not cleared on exercise change; `difficulty_factor` remains
>   responsible for exercise translation (the df-aware `target_load` is what the governor steers
>   toward, so the system self-corrects over sessions; the one-session transient is accepted).
> - **R4 — Fully deterministic exploration.** Every exploration decision derives from a **persisted
>   session seed** via an injected `random.Random(seed)`; no system-time / global randomness; the
>   session is bit-reconstructable from its seed.
> - **R5 — Parity baseline** confirmed green via `build/_verify/assemble_and_test.py` before
>   composition code lands (see the Sprint 3B-2 build log / completion report).
>
> **Headline (now resolved):** the two decision-memory semantics 3B-2 activates as **common**
> steady-state paths — **SM1** (two same-capability blocks/session) and **SM2** (exercise swap vs
> held load) — are settled by **R2** (memory advances once, primary slot drives) and **R3** (memory
> stays capability-scoped; df translates). Implement to these rules exactly.

## 1. Hidden dependencies

- **HD1 — The multi-set / multi-block session *driver* does not exist.** `complete_block()` and the
  `govern=False` per-set learning path were built in 3B-1, but **nothing calls them in sequence**:
  the live sim path is still single-set, single-block (3B-1 Limitation #4). ES-009 emits a load-free
  skeleton; 3B-2 must build the *orchestration* that, per block in `position` order: captures
  `score_at_block_entry` once (before set 1), loops `target_sets` × `report_set_fatigue_aware(govern=
  False)`, chooses a representative `block_s_obs`, then calls `complete_block()` **once**. This driver
  is net-new and is where every interaction below lives. It is the real surface area of the sprint —
  not the four ES-009 stages, which are comparatively small. *Plan §2's flow assumes this driver;
  name it explicitly as a build artifact.*

- **HD2 — `block_s_obs` for a multi-set block is under-specified.** `_record_block_decision`
  (`pipeline.py:71`) computes `block_surprise = block_s_obs − score_at_block_entry`. On the single-set
  path `block_s_obs` is the one set's `ev.s_obs`; for a *multi-set* block the driver must pick a
  representative (last set? mean of de-fatigued `s_obs`? first set?). The choice changes which way the
  stability streak moves. **Must be ratified** (recommend: the last completed set's de-fatigued
  `s_obs`, matching the existing "last-wins" loop in `pipeline.py:172/334`, so single-set stays
  bit-identical). Until ratified, the streak direction on multi-set blocks is undefined.

- **HD3 — Stage 2 staleness source is live, but only advanced *on training*.** `apply_evidence`
  writes `state.last_trained_at_week = week` (`state_update.py:43`) inside the persisted path, so
  `staleness(cap) = min(days_since_last_trained/7, 2.0)` has a real, persisted source — **no gap.**
  But it advances only for capabilities actually trained in a session; capabilities *omitted* by a
  thin Class-A session correctly age. The composition driver must read `last_trained_at_week` from
  `capability_state` (state, not history — Inv. 1), which it already supports. *Confirmed sound;
  flagged so the driver does not re-derive staleness from session history.*

- **HD4 — The live fatigue-ceiling formula has no source in this checkout.** `MAX_SESSION_SETS` and
  any ceiling function **do not exist in code** — the only frozen ceiling is the static `24` in the
  ES-009.1 §4 *text*, and ES-011 (which the docs say "replaces" it with the live mechanism) is **not
  in `build/_txt/`**. So the mapping `fatigue → live ceiling value` is unspecified here. The trim
  *order* is ratified (Q2 + `CAPABILITY_PRIORITY_ORDER`); the *threshold/formula that sets the ceiling
  value* is not. This is a gating item (§6 R1).

- **HD5 — `weekly_volume` is a free-text TEXT column carrying an enum contract.** `strategy_state.
  weekly_volume` is `TEXT DEFAULT 'moderate'` (`schema.py:77`); `volume.py` must map it through
  `VOLUME_BANDS`. A value outside `{low,moderate,high}` (a legacy/hand-edited row) KeyErrors the whole
  allocation. *Add an explicit validation/guard (reject or clamp-to-moderate with an audit note); do
  not assume the column is clean.*

## 2. Migration risks

- **MR1 — Baseline schema and migration_005 must add identical columns.** Per the established
  discipline, `schema.py` `SCHEMA_SQL` is edited **in place** each sprint (it already carries the
  3B-1 `strategy_state`/`preference_state`/REPLACE-audit columns), so a *fresh* DB gets the new
  columns from `SCHEMA_SQL` while a *migrated* DB gets them from `migration_005`. If the two diverge
  (name, type, default), fresh ≠ migrated. *Mitigation: add the new `workout_session`/`exercise_block`
  columns to both, identical defaults; add a fresh-vs-migrated column-parity test (the analogue of
  3B-1's `default-on-absence == freshly-seeded`).*

- **MR2 — Column adds on immutable-history tables are additive but must stay inert.** `exercise_block`
  and `workout_session` are append-only history. `ADD COLUMN exploration_seed/session_index/...` and
  `selection_reason TEXT NOT NULL DEFAULT ''` are additive; existing rows take NULL/`''`. *Guard each
  add with a `_columns()` PRAGMA check (migration_004 pattern); prove idempotency by re-running
  `apply()`.* No `UPDATE` of existing rows (would violate immutability).

- **MR3 — Schema version bump must be exactly +1 and forward-only.** `schema_version` 4 → 5, no
  down-migration (consistent with 002/003/004). A 3B-1 DB with no composed sessions must migrate to v5
  and read back **semantically unchanged** (the single-block trajectories untouched).

- **MR4 — No catalog migration.** The catalog stays code-resident (3B-1 ruling). History already
  snapshots `exercise`/`difficulty_factor` per block, so reconstruction needs no DB catalog copy. *Do
  not introduce a catalog table under cover of composition.*

- **MR5 — `exploration_seed` type.** Persist as INTEGER and seed an explicit `random.Random(seed)`
  instance; do **not** rely on a float or on global RNG state (CE4). A NULL seed on a pre-3B-2 session
  is the inert default and must never be fed to the RNG (those sessions had no exploration).

## 3. State-model risks

- **SM1 — (gating) Two slots of one capability → double decision-memory / streak write per session.**
  Decision memory (`last_recommended_weight`, `consecutive_positive/negative`, `last_decision`) lives
  on `capability_state` — **one row per capability** (`schema.py:47`). At frequency-2 steady state the
  two-lever math gives `slots = clamp(round(12/3),1,2) = 2` for **every** capability (low/mod/high all
  ≥ 8 → 2 slots; see planning §5 R-VD), so a capability appears as **two blocks** in one session. The
  driver would then call `complete_block()` **twice for the same capability**, and the *second* block
  reads the `last_recommended_weight` the *first* just wrote, and `update_streaks` advances twice on
  one capability in one session. This is the **common** steady-state path at freq 2, not an edge.
  ES-006/ES-009 do not define whether a multi-slot capability is one decision cycle or two. *Must be
  ratified before coding (recommend: the capability's decision memory + streak advance **once per
  session**, driven by the primary/first slot; the second slot recommends from the same pre-session
  `score`/held load but does not re-write decision memory). §6 R2.*

- **SM2 — (gating) Exercise swap steps the governor from an incompatible held load.** `recommend()`
  feeds `held_load = state.last_recommended_weight` into `govern()` (`recommendation.py:86`), while
  `target_load` is derived **per-exercise** through `exercise_rm1(..., difficulty_factor)`
  (`recommendation.py:70`). `last_recommended_weight` is per-capability and was recorded under whatever
  exercise was used last. When Stage 3 selects a *different* exercise — routine at steady state via
  preference `argmax`, the **exploration floor**, or a live REPLACE — its `difficulty_factor` differs
  (catalog alternates are 0.85–0.95 vs canonical 1.0), so the held kg and the new target kg are on
  different scales and the first governed step lands on an incompatible base. 3A never hit this (fixed
  exercise); 3B-1 REPLACE can, but is exercised only by injection. *Must be ratified (recommend: on an
  exercise change for a slot, re-seed the governor to the fresh ES-005.1 working-set load for the new
  exercise — i.e. treat as cold-start-for-this-exercise — rather than stepping the stale held kg;
  equivalently, clear `last_recommended_weight` when the slot's exercise changes). §6 R3.*

- **SM3 — Preference must not be nudged by system-initiated exploration.** `preference.nudge`
  (`preference.py:17`) moves a family's score on **athlete behavior** (REPLACE/skip). The Stage-3
  *exploration draw* is system-initiated, not athlete preference, so it must **not** nudge. *The driver
  must route only athlete REPLACE/skip into `nudge`, never the exploration selection — assert it.*

- **SM4 — Steady-state priority with null focus is defined but untested.** Default athletes have
  `primary/secondary_focus = NULL` (`domain.py:64`). ES-009 §5 steady state orders focus-aligned caps
  first, then "the rest" by info-gain tie-break — so null focus ⇒ pure info-gain ordering. Defined, but
  it means *most* MVP athletes never exercise the focus-ordering branch. *Test both the null-focus
  (info-gain) and set-focus paths explicitly.*

- **SM5 — `global_confidence` mean over the FIXED Class-A set already guards partial population**
  (`domain.py:112`). The calibration→steady transition at 70 is a single threshold crossing that flips
  selection (canonical→preference), volume restraint (1×2 → bands), exploration (off→on), and priority
  (info-gain→focus) **all at once**. *Not a bug, but the largest single behavioral discontinuity in the
  system; test the session immediately below and above 70.*

## 4. Composition-engine risks

- **CE1 — Second-slot fill needs a distinct exercise but the pool is size 2.** Each capability has
  exactly canonical + one alternate (`catalog.py`). A 2-slot capability must fill slot 2 with a
  *distinct* same-capability exercise → forced to the alternate (no real choice), and a hypothetical
  1-exercise capability could not fill a 2nd slot at all. *Clamp `slots = min(allocated, available
  exercises)`; assert the two blocks are distinct; this also means the exploration floor on a 2-slot
  capability has an empty "other" pool for the already-used exercises — handle gracefully.*

- **CE2 — Single-capability guard is currently free, but must be enforced at the seam.** Every catalog
  entry is single-capability, so composed blocks cannot be multi-capability and the C.3 de-fatigue
  approximation stays dormant (planning R4). *Assert `len(exercise.capabilities) == 1` at block
  emission so a future multi-capability catalog entry trips a test, not a silent approximation.*

- **CE3 — Stage 4 ordering / trim both key off `CAPABILITY_PRIORITY_ORDER`.** Ordering = priority asc
  (knee→hip→h_push→h_pull→v_push), then `difficulty_factor` desc (canonical before alternate), then
  slot index. Trim (Q2) removes **lowest** priority first = **last** in the list (v_push, then h_pull,
  …), `sets_per_slot` down before dropping a second slot, deterministically. *One frozen constant, two
  consumers — test both read it and that trim is the exact reverse priority.*

- **CE4 — Exploration is the only nondeterminism; it must use an injected seeded RNG.** Use
  `random.Random(exploration_seed)` threaded explicitly through Stage 3 — **never** the module-global
  `random`. Draw only at steady state, only within the class-matched pool, never during calibration.
  *`assert_deterministic_given_seed` (identical inputs+seed ⇒ identical session) is a first-class test;
  persist the seed (MR5) or the session is unreconstructable (ES-009 §9 — invalid).*

- **CE5 — Ceiling trim can reduce a single session's capability coverage.** Trimming a capability's
  only slot drops it from *that* session. Coverage is a multi-session property (5/5 in ≤2 sessions), so
  this is acceptable, but the interaction (trim vs coverage) should be documented and the trim should
  prefer dropping *second* slots over a capability's *only* slot where the ceiling math allows. *Pin
  the order: reduce sets → drop second slots → (last resort) drop a sole slot, lowest priority first.*

- **CE6 — Calibration restraint makes the early-life path fully deterministic** (1 slot × 2 sets,
  canonical, single-cap, no exploration, info-gain priority). This is the parity anchor (it reduces to
  today's single-block path) **and** means SM1/SM2/CE1/CE4 are all dormant during calibration — they
  switch on only at `global_confidence ≥ 70`. *Sequence the build calibration-path-first (plan §5
  Phase-B hard checkpoint) so the deterministic spine is proven before the steady-state surface.*

## 5. Test coverage gaps

- **TC1 — No real multi-block session test exists.** 3B-1 only synthetically tested a multi-set
  *single* block. Need an integration test: compose → drive blocks in order → load → sets →
  `complete_block` per block → full-session audit reconstruction.
- **TC2 — No test for SM1** (two same-capability slots → decision memory/streak fires the ratified
  number of times, not twice by accident).
- **TC3 — No test for SM2** (exercise swap re-seeds the governor; a post-swap recommendation does not
  step from the prior exercise's held kg).
- **TC4 — No determinism-given-seed harness** (CE4) and no test that exploration never fires in
  calibration / never crosses class.
- **TC5 — Band-distinctness collapse not asserted** (Q3): encode the *known* collapse (freq-2:
  low=mod=high per once-trained cap; freq-3 partial) as an explicit test so it cannot silently change,
  and assert distinctness where it survives (twice-trained caps, focus multiplier).
- **TC6 — Class-A 5/5 coverage proof** (≤2 sessions per frequency) is a new frozen-property test;
  template edits must re-prove it.
- **TC7 — Live-ceiling / trim test is blocked on HD4/R1** (no ceiling formula to assert against);
  the *trim order* can be tested against a fixed ceiling value now, but the *ceiling value derivation*
  cannot until the formula is pinned.
- **TC8 — Fresh-vs-migrated schema parity for the new columns** (MR1) — extend the 3B-1 parity test.
- **TC9 — Calibration→steady transition at 70** (SM5): one session each side of the boundary,
  asserting the simultaneous flips (selection/volume/exploration/priority).
- **TC10 — Parity (blocking):** all 82 prior tests bit-for-bit; a single-capability calibration
  session ≡ today's single-block path.

## 6. Reasons Sprint 3B-2 should NOT begin (gating)

Resolve each before coding the affected area. R2/R3 block the **steady-state** path; the
calibration spine (CE6) could begin in parallel, but starting steady-state code first is the error.

1. **R1 — The live fatigue-ceiling formula is unspecified in this checkout (HD4).** Only the static
   `MAX_SESSION_SETS = 24` exists in spec text; ES-011's "live ceiling" mapping is not in `build/_txt/`
   and not in code. The trim *order* is ratified, but the *ceiling value* the trim targets is not.
   **Locate/confirm the ES-011 B.1 ceiling formula, or ratify a conservative provisional** (e.g.,
   ceiling = 24 unless systemic fatigue > a flagged threshold, then reduce by a fixed step) — flagged
   provisional, 24 always the hard fallback. Without this, the ceiling/recovery-gate cannot be built
   or tested (TC7).
2. **R2 — Multi-slot decision-memory semantics are undefined (SM1).** Two same-capability blocks per
   session is the *common* freq-2 steady-state path; whether the per-capability decision memory/streak
   advances once or twice is not defined by ES-006/ES-009. **Ratify the rule** (recommended: once per
   capability per session, primary slot drives memory) before the driver is written.
3. **R3 — Exercise-swap governor base is undefined (SM2).** Preference/exploration/REPLACE routinely
   change a slot's exercise at steady state; the governor would step from a held kg recorded under a
   different `difficulty_factor`. **Ratify the rule** (recommended: re-seed to the fresh working-set
   load for the new exercise — clear `last_recommended_weight` on exercise change) before steady-state
   selection is wired to loads.
4. **R4 — `block_s_obs` representative for multi-set blocks unratified (HD2).** The streak direction on
   a multi-set block depends on it. **Ratify** (recommended: last completed set's de-fatigued `s_obs`,
   preserving single-set parity) before the driver computes block surprise.
5. **R5 — Parity baseline must be reproducibly green first.** This checkout is snapshots with no
   `pytest`; 82/82 comes only from `build/_verify/assemble_and_test.py`. Since 3B-2 adds the first
   nondeterminism, a parity regression would be undetectable unless 82/82 is confirmed green via the
   harness *before* composition code lands.

*Non-blockers (ratified — must not re-open):* the Class-A band collapse (Q3 accept-and-document),
trim-only recovery gate (Q2), single-capability slots, Class-A-only coverage, and the provisional
status of `P_EXPLORE` / `PREFERENCE_NUDGE` / κ/τ/σ²_ref (Phase 0). The `CAPABILITY_PRIORITY_ORDER` is
fixed. **Recommendation: begin the calibration spine (Phases A–B) once R5 holds; do not begin
steady-state selection/volume/ceiling (Phases C–D) until R1–R4 are ratified.**

---

*Sources read: `docs/canonical/*`; `SPRINT_3B2_PLANNING_REVIEW.md`, `SPRINT_3B2_IMPLEMENTATION_PLAN.md`,
`SPRINT_3B1_*`; ES-009 + ES-009.1 (`build/_txt/`); delivered code `pipeline.py`
(`_record_block_decision`/`complete_block`/`report_set_fatigue_aware`), `decision.py` (`govern`/
`update_streaks`), `recommendation.py` (`recommend` held-load↔target↔difficulty_factor),
`state_update.py` (`apply_evidence` writes `last_trained_at_week`), `catalog.py` (single-capability,
2 exercises/capability), `preference.py` (`nudge`), `domain.py` (`CapabilityState` decision memory,
`global_confidence`), `schema.py` (`exercise_block`/`workout_session`/`strategy_state`). No grep
located any existing ceiling/`MAX_SESSION_SETS` symbol in code. No code written.*
