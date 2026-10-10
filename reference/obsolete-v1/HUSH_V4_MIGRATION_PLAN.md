# Hush v4 Engine Migration Plan (Mobile-First)

**Status:** DRAFT FOR APPROVAL — no implementation has begun.
**Date:** 2026-06-24
**Sources of truth (authoritative, frozen):** `מנוע Hush/hush-mvp-engine-spec (1).md` (v4 Frozen Spec) + `מנוע Hush/hush-v4-handoff (1).md` (Engineering Handoff).
**Rule of precedence:** Where this document and the Frozen Spec disagree, the Spec wins — except for the five explicitly **product-approved overrides** in §6, which are binding product decisions made by the owner.

> Do not redesign v4. Do not reintroduce removed concepts. The Frozen Spec is authoritative. Any divergence not listed in §6 is a defect in this plan, not a design choice.

---

## 0. Scope & target (approved)

- **Target layer:** the **live mobile TypeScript engine** (`code/mobile/src/data/…`). Every signed-in user runs this today (`selectModel` falls back to `fixtureModel`; no backend token exists). The Python backend (`implementation/`, `hush_model`) is **out of scope for this migration** and is addressed separately in §7.5.
- **Goal:** replace the current mobile progression engine with the v4 architecture, **preserving the existing product experience** only where §6 explicitly approves it.
- **Non-goal:** any change to the deployed Python engine, the design/UX skin, or the backend API contract beyond what the mobile client already consumes.

---

## 1. Current mobile engine audit

### 1.1 Engine-related files (mobile)

| File | Role |
|---|---|
| `src/data/progression.ts` | **The progression engine.** `prescribe()` (equipment-aware double-progression off raw logged history) + `computePortrait()` (display-only relative-strength bars). |
| `src/data/api/fixtureModel.ts` | **The runtime model client.** Program generation (split library), cold-start starting weights, set/rep schemes, session-minute cap, weekly core insertion, preference application, `sessionTargets`/`programChanges`/`portraitSnapshot`/swap+order preference writes. |
| `src/data/exercises.ts` | **Catalog.** 59 exercises; 5 `capability` values; 10 `muscle` groups; progression rules (load step / bodyweight rep ladder); swap candidate scoring; engine↔catalog id reconciliation. |
| `src/data/api/modelClient.ts` | **Interface contract** the app consumes (the app never implements the model). |
| `src/data/api/selectModel.ts` | Chooses `HttpModelClient` (backend) vs `fixtureModel`; today always resolves to `fixtureModel`. |
| `src/data/api/decisionMap.ts`, `httpClient.ts`, `modelClient.ts` | Backend client mapping (dormant). |
| `src/data/local/models.ts` | Persisted/rendered data types (`Profile`, `Program`, `Slot`, `SetTarget`, `PortraitSnapshot`, …). |
| `src/data/local/db.ts` | AsyncStorage persistence: profile, completed-session history, portrait snapshots, forecasts, **preferences** (pins/substitutes/backups/order), telemetry, schema version (currently **v2**). |
| `src/domain/progressReport.ts` | Progress-report derivations (display). |

### 1.2 Current decision flow (per `sessionTargets`)

```
loadProfile() ─┐
loadHistory() ─┤→ for each catalog exercise:
               │     seed   = startingWeight(ex, profile)          // cold-start, sex×bw×exp×age
               │     bottom = repsFor(ex.tier, goal, age)           // goal×tier reps
               │     presc  = prescribe(ex.id, seed, bottom, history)
               │        ├─ bodyweight: +1 rep → ceiling → harder variation
               │        └─ weighted double-progression:
               │             every set ≥ (bottom+spread) → +equipment step, reset to bottom   (INCREASE)
               │             two sessions missing bottom → −equipment step                      (DECREASE)
               │             else hold last load
               └→ emit MAX_SETS SetTargets/exercise; voice gated to ADVISORY (≥7 sessions)
```

Program assembly (`generateProgram`): pick split by `sex × daysPerWeek` from `MEN_SPLITS`/`WOMEN_SPLITS` → build days from blueprints → `orderForFlow` (compounds first, equipment-clustered) → apply athlete pins → append ONE weekly core block (3 sets, last, upper-preferred) → `enforceTimeCap` (≤60 min by minutes) → apply athlete exercise/workout order.

### 1.3 Current progression logic — characterization

- **Reactive** (reads completed history; predicts nothing) — *philosophically aligned with v4*.
- **Per-exercise, stateless** — recomputed from `db.loadHistory()` each call; **no persisted progression state**.
- **Double-progression only** — has INCREASE / DECREASE / HOLD, but **none** of v4's: reprice-to-demonstrated-e1RM, rep_target progression with stall window, lever ladder (vol→load→range), patient hold + periodic probe, calibration state machine + seed discard, implied-e1RM rail, adherence gate, absence/injury deload, tenure+mismatch swap, `{observation, conclusion, action}` explanations.
- **Goal/age/sex/bodyweight** shape only the cold-start seed and the rep/set scheme — not week-over-week decisions.

### 1.4 Current state model (what is persisted)

`db` (AsyncStorage, schema v2): `profile`, **completed-session history** (the truth), portrait snapshots, forecasts, **OwnedPreferences** (`pinsByMuscle`, `substitutes`, `backups`, `workoutOrder`, `exerciseOrderByWorkout`), recents, telemetry, pending-sync.

**No fatigue / readiness / score / confidence / trajectory / variance / maintenance / calibration state is persisted in the mobile layer.** (All of that lives only in the dormant Python `CapabilityState` — see §7.5.) **Consequence: the mobile migration has no forbidden-state to purge; it has new v4 state to *introduce*.**

---

## 2. Target v4 flow (mobile)

A single deterministic pure function, invoked weekly, surfaced through the existing `ModelClient` interface:

```
plan_next_week(profile, slotStates[], globalState, weekResults[], library, constants)
  → { nextProgram, updatedSlotStates[], updatedGlobal, explanations[] }

  1. adherence < 0.67            → hold all, sets−1 (floor MEV), no progression → EMIT, STOP
  2. extended_absence (>10d) | injury → DELOAD affected (load×0.85, sets×0.50 floor MEV, rep mid)
  3. else per progressing slot:
        demo = demonstrated(weekResult, rep_target)         // best_e1rm, demo_load_at_target, hit/room/missed
        if calibrating         → calibrate() (×1.10 / ×0.90 / step); exit after 2 in-range → discard seed
        elif missed            → reprice_keep_volume() (load→demo; KEEP sets; KEEP rep_target; miss_streak++)
                                  if miss_streak≥3 & isolated & DOWN → consider swap (tenure+mismatch)
        else                   → reactive_progress():
                                     beat/room → +1 rep_target (cap top) else +STEP load, reset bottom
                                     FLAT past STALL_WINDOW → lever ladder vol→load→range → PATIENT_HOLD (probe/4wk)
  4. apply_rails()  // implied-e1RM rail (+3%), ≤10% jump, session set-cap (22), ≤+1 set/≤2 patterns, round DOWN
  5. assemble_gym_flow()  // split library (§6 override) + add CORE accessory + explanations
```

**Progression unit (see Conflict C-1):** keyed per **exercise-slot within a pattern**, not per pattern, because the product runs multiple exercises per pattern per session.

---

## 3. Pattern model (after approved overrides)

**Engine-progressing patterns (6):** `HORIZONTAL_PUSH, HORIZONTAL_PULL, VERTICAL_PUSH, VERTICAL_PULL, KNEE_DOMINANT, HIP_DOMINANT`.
**Assembler-only accessory (NOT an engine pattern):** `CORE`.

| Pattern | Today | After migration |
|---|---|---|
| HORIZONTAL_PUSH | ✓ capability | ✓ unchanged |
| HORIZONTAL_PULL | ✓ (also absorbs vertical pull + biceps) | ✓ — vertical-pull lifts removed from it |
| VERTICAL_PUSH | ✓ capability | ✓ unchanged |
| **VERTICAL_PULL** | ✗ folded into horizontal_pull | **✓ NEW first-class engine pattern** (own progression, reprice, calibration, hold, swap, history) — `pull_up`, `chin_up`, `lat_pulldown` reclassified |
| KNEE_DOMINANT | ✓ (incl. Calves) | ✓ unchanged (Calves stay isolation within it) |
| HIP_DOMINANT | ✓ (incl. Core muscle) | ✓ — **Core muscle removed** from this pattern |
| **CORE** | mapped under hip_dominant; inserted as supplemental slot | **assembler-level accessory only** — NO calibration/reprice/swap/miss-streak/e1RM/progression state; 3–4 sets, end of selected (upper-preferred) workouts |

> Net pattern change = **+1** (add VERTICAL_PULL) and **−0** engine patterns from removing CORE (Core was never a true progressing capability; it was a `muscle` under `hip_dominant` surfaced as a supplemental slot). The catalog's `Capability` union goes 5 → 6.

---

## 4. Workout mapping (split library kept — approved override §6)

The existing market-standard split library (`MEN_SPLITS`/`WOMEN_SPLITS`, 1–6 days: Full Body, Upper/Lower, PPL, women's glute-emphasis) **remains the assembler**. v4's literal A/B/C/D mapping is treated as a **reference implementation only**, not a product constraint.

**How the split library maps into the v4 engine (exposure / frequency / pattern distribution):**

- Each blueprint slot resolves to a catalog exercise → its (pattern, exerciseId) is the engine's **slot identity** (C-1).
- A pattern may appear **multiple times per week and multiple times per session** (e.g., men's *Pull A* = deadlift [HIP], row [H-PULL], pulldown [→V-PULL after reclassification], face_pull [H-PULL], curl [H-PULL/biceps]). The v4 engine therefore tracks state **per exercise-slot**, and computes the **effective weekly volume ceiling** per pattern as `min(MRV_landmark, SESSION_SET_CAP × pattern_frequency_in_split)`.
- **Conflicts surfaced by keeping the library — see §5 C-1..C-4.** The volume-landmark math (`VOL_FLOOR`/`VOL_CEIL`, "≤+1 set / ≤2 patterns/week", RA-1 spread-not-stack) was written against v4's clean A/B/C/D distribution; it must be re-expressed against arbitrary library distributions. This is the single largest design task and is detailed in §5.

---

## 5. Gap analysis & conflicts (current vs v4) with proposed resolutions

### Forbidden-concept audit (mobile) — clean

| Removed v4 concept | Present in mobile engine? | Action |
|---|---|---|
| Fatigue inference | **No** | none (verify by I-30/I-31 lint) |
| Readiness / recovery scoring | **No** | none |
| Bayesian / latent score / confidence | **No** (display-only `computePortrait` uses Epley vs benchmark — allowed; not a decision signal) | KEEP `computePortrait` as display only |
| Trajectory / projection / ceiling / velocity | **No** | none |
| Maintenance state | **No** | none |
| Scheduled / systemic / sustained-drop deload | **No** | none |
| Aggression dial | **No** | none |
| Swap benefit/cost scoring | **Partial** — `similarExercises` token/tier scoring orders swap *candidates* | REPLACE swap *trigger* with tenure+mismatch binary; candidate *ordering* for the manual UI may remain (it never triggers an engine swap) |
| Satisfaction / engagement | **No** | none |

**All forbidden runtime concepts live only in the dormant Python layer (§7.5). The mobile migration adds v4 mechanics; it does not have to tear out a Bayesian core.**

### Behavioral / structural conflicts

| ID | Conflict | Proposed resolution | Needs sign-off? |
|---|---|---|---|
| **C-1** | v4 `PatternState` assumes **one exercise per pattern**; the product's split library runs **multiple exercises per pattern** per session/week. v4's swap, tenure, miss_streak, load, rep_target are all per-`current_exercise_id`. | **APPROVED (2026-06-24).** v4 state is keyed per **program SLOT** (a stable position in the split), NOT per exercise ID. The slot is the durable progression entity: replacing the exercise inside it does not destroy slot continuity. **Slot-durable fields** (survive a swap): `slotId`, `pattern`, `order_index`, `locked`, slot lineage for reporting. **Exercise-scoped fields** (re-initialized on swap, per v4 §8): `current_exercise_id`, `current_load_kg`, `rep_target`, `rep_range`, `e1RM history`, `calibrating`, `calib_weeks`, `tenure_weeks` (→0), `miss_streak` (→0), `flat_weeks`, `levers_tried`, `hold_mode`, `weeks_since_swap` (→0). Rationale for the split: demonstrated capability is physically per-exercise — a Bench load cannot transfer to a Machine Chest Press — and v4 mandates the new lift start CALIBRATING. | **RESOLVED** |
| **C-2** | v4 volume landmarks + "≤+1 set/wk, ≤2 patterns/wk" + RA-1 spread-not-stack assume A/B/C/D. | Re-express volume bounds **per pattern across the actual split**; effective ceiling `= min(MRV, SESSION_SET_CAP × pattern_freq)`; RA-1 ordering over the real session distribution. Behavior identical to v4 when the split *is* A/B/C/D. | YES (mechanical, but confirm) |
| **C-3** | Goal taxonomy: app `get_stronger / build_muscle / general_fitness / toning` vs v4 `strength / hypertrophy / general_fitness`. | Keep app goals user-facing; map internally: `get_stronger→strength`, `build_muscle→hypertrophy`, `toning→hypertrophy`, `general_fitness→general_fitness`. (§6 approved; toning→hypertrophy.) | Resolved (§6) |
| **C-4** | Frequency 1–6 (app) vs 2–4 (v4 reference). | Keep 1–6 via the split library; v4 reference mapping is non-binding. (§6 approved.) | Resolved (§6) |
| **C-5** | Rep ranges: v4 is `[lo,hi]` per goal with `rep_target` that progresses to the top then converts to +load. Current uses a fixed `bottomReps` + `RANGE_SPREAD`. | Adopt v4 `rep_range` + progressing `rep_target` per goal (`strength [3,6]@5`, `hypertrophy [8,12]@8`, `gen_fit [6,12]@8`). Replaces `repsFor`/`RANGE_SPREAD`. | Resolved by spec |
| **C-6** | Session cap: current = **minutes** (`enforceTimeCap`, 60 min); v4 = **SESSION_SET_CAP = 22 working sets**. | Adopt v4 set-cap as primary (I-3). The minute estimate may stay as a *display* aid only. | Resolved by spec |
| **C-7** | Program ownership: rich preference log (pins by muscle, substitutes, backups, custom order) vs v4 `locked` + manual replace. | Map `pin/substitute` → v4 manual replace (records `current_exercise_id`, resets slot to CALIBRATING per v4 swap selection); expose `locked` as a new per-slot flag; keep backups/order as **assembler-layer** features (no engine effect). | YES (reconciliation) |
| **C-8** | Units kg/lb + sex/age/bodyweight load taper. | Keep as **cold-start seed inputs only** (v4 §4.3 allows a seed lookup); discarded at calibration exit (§4.4). STEP stays the fixed v4 kg formula. lb is a display conversion. | Confirm |
| **C-9** | CORE currently sits under `hip_dominant` capability. | Reclassify CORE as assembler-accessory; remove from `Capability`; `addWeeklyCore` stays but is formally outside the engine (no state, no rail, no progression). Allow 3–4 sets (today fixed at 3). | Resolved (§6) |

---

## 6. Product overrides (APPROVED — binding alongside v4)

1. **VERTICAL_PULL = first-class engine pattern.** Own progression, reprice, calibration, hold, swap, history. Not merged into HORIZONTAL_PULL.
2. **CORE = assembler-level accessory finisher.** No calibration, reprice, swap, miss-streak, progression state, or e1RM tracking. 3–4 sets at the end of selected (upper-preferred) workouts. Does not participate in the v4 progression engine.
3. **Keep the existing split library** (Full Body, Upper/Lower, PPL, women's glute-emphasis, etc.) as the assembler. v4 A/B/C/D is a reference, not a constraint.
4. **Keep 1–6 training days.** Not restricted to v4's 2–4.
5. **Keep user-facing goals incl. "Toning."** Map internally to v4 goals; `toning → hypertrophy`.

---

## 7. Migration plan

### 7.1 Component mapping — Keep / Modify / Remove / Replace (mobile)

| Component | Action | Notes |
|---|---|---|
| `progression.ts` → `prescribe()` | **REPLACE** | Becomes the v4 per-slot core: `demonstrated`, `calibrate`, `reprice_keep_volume`, `reactive_progress` (beat/room, lever ladder, patient-hold). |
| `progression.ts` → `computePortrait()` | **KEEP** | Display-only; not a decision signal. |
| `fixtureModel.ts` → split library + `generateProgram` + `orderForFlow` | **MODIFY** | Stays the assembler; now consumes v4 `updatedSlotStates` for loads/reps; honors VERTICAL_PULL split coverage. |
| `fixtureModel.ts` → `startingWeight / repsFor / setsFor / ageLoadFactor` | **MODIFY** | Becomes the v4 **cold-start seed** (wk-1 only, discarded at calibration exit). `repsFor`→v4 `rep_range/rep_target`. |
| `fixtureModel.ts` → `enforceTimeCap` (minutes) | **REPLACE** | v4 `SESSION_SET_CAP=22` + effective-ceiling rule (I-3/I-4). |
| `fixtureModel.ts` → `addWeeklyCore` | **MODIFY** | Keep, formalize as accessory (3–4 sets), explicitly outside engine. |
| `fixtureModel.ts` → `sessionTargets / programChanges / portraitSnapshot` | **MODIFY** | Source loads/reps/changes/explanations from `plan_next_week` output. |
| `fixtureModel.ts` → pins/substitutes/backups/order writers | **MODIFY** | Pin/substitute → v4 manual replace + `locked`; backups/order stay assembler-only. |
| `exercises.ts` catalog | **MODIFY** | Add `VERTICAL_PULL` capability; reclassify `pull_up/chin_up/lat_pulldown`; remove `Core` from `hip_dominant`; add v4 library fields (`is_compound`, `body_region`, `swap_group`, `swap_cost_tier`, `fatigue_cost`, `default_rep_range`). |
| `exercises.ts` → `similarExercises` | **MODIFY** | Engine swap trigger replaced by tenure+mismatch binary; token ordering retained only for the manual swap UI. |
| `modelClient.ts` interface | **KEEP / MODIFY** | Stable surface; extend `SetTarget`/changes to carry v4 `{observation, conclusion, action, text}` explanations and per-slot state hand-off. |
| `local/models.ts` | **MODIFY** | Add `Capability='vertical_pull'`; add `SlotState`/`GlobalState` types; goal-mapping helper. |
| `local/db.ts` | **MODIFY** | Bump `SCHEMA_VERSION` 2→3; persist `slotStates[]` + `globalState`; migration in §7.3. |

### 7.2 New modules (build bottom-up per Handoff Artifact 7)

- `src/engine/v4/constants.ts` — exact v4 constants (§12 / Handoff 2.2).
- `src/engine/v4/types.ts` — `Profile`(mapped), `SlotState`, `GlobalState`, `PatternResult`, `WeekRecord`, `Slot`, `PlanResult`, enums, validators (F-cases).
- `src/engine/v4/reads.ts` — `demonstrated()`, `progress_metric()`, `classify_trend()`, `STEP`, round-DOWN normalization.
- `src/engine/v4/calibrate.ts` — `calibrate()` + exit + seed-discard.
- `src/engine/v4/reactive.ts` — `reprice_keep_volume()`, `reactive_progress()` (levers + patient hold + probe).
- `src/engine/v4/swap.ts` — `swap_allowed()` + `select_replacement()` (tenure+mismatch, equipment filter, 8-wk reuse, 4-wk cooldown, deterministic tie-break).
- `src/engine/v4/rails.ts` — `apply_rails()` (I-1..I-6, I-29).
- `src/engine/v4/assemble.ts` — split-library assembler + CORE accessory + RA-3 stable ordering.
- `src/engine/v4/explain.ts` — `{observation, conclusion, action, text}` templates (reprice never says "fatigue").
- `src/engine/v4/planNextWeek.ts` — the top-level pure function (global order → per-slot loop → rails → assemble → explain).
- `src/engine/v4/invariants.ts` — runtime I-1..I-43 runner.

### 7.3 State / data migrations

- **No forbidden state to remove** in mobile (it never existed there).
- **Add** persisted `slotStates[]` (per (pattern, exerciseId): `current_load_kg`, `current_sets`, `rep_target`, `rep_range`, `locked`, `tenure_weeks`, `flat_weeks`, `miss_streak`, `levers_tried`, `hold_mode`, `weeks_since_swap`, `calibrating`, `calib_weeks`, last-6 `history`) and `globalState{days_since_last_session}`.
- **Migration (schema v2→v3):** for existing users with completed-session history, **initialize each slot from history** — best_e1rm from logged sets → `current_load` at the goal `rep_target`; set `calibrating=true` if <2 in-range weeks exist, else `false` with seed already discarded. Users with no history start all slots CALIBRATING from the cold-start seed. Preferences (`pins/substitutes/backups/order`) carry forward; pins/substitutes are re-expressed as the slot's `current_exercise_id` (+ `locked` where a pin implies a lock — confirm in review).

### 7.4 Removed (mobile)

- `RANGE_SPREAD` + the bespoke double-progression branch in `prescribe()`.
- Minute-based `enforceTimeCap` as the *cap* mechanism (kept only as a display estimate).
- `similarExercises` as a *swap trigger*.

### 7.5 Python backend (OUT OF SCOPE here; tracked, not touched)

The deployed `hush_model` engine (`sprint0…sprint7`, `wave1`) is the Bayesian/fatigue/variance/decay/prediction/confidence engine — the literal embodiment of every v4-forbidden concept (`CapabilityState{score,confidence,fatigue,var_*}`, `recommendation.py`, `prediction.py`, `decay.py`, `fatigue.py`, `variance.py`, `decision.py`, `stagnation*.py`). Because no client consumes it (no token), it does **not** affect users today. **It must be either ported to v4 or formally decommissioned in a separate, later workstream** before any backend connection ships — otherwise wiring the backend would silently reintroduce forbidden behavior. Flagged as a follow-up; no work in this migration.

---

## 8. Test strategy

### 8.1 v4 invariant enforcement
- Port **I-1..I-43** into `invariants.ts`; run on **every** emitted `PlanResult` across all engine tests (Handoff Artifact 4).
- Structural lint for forbidden concepts (I-30..I-41): no `fatigue`/`readiness`/`score`/`confidence`/`trajectory` fields in engine state; reprice text contains neither "fatigue" nor a volume-change claim (I-27).

### 8.2 Unit + integration (Handoff Artifact 5)
- Unit: `U-demonstrated, U-trend, U-step, U-rail, U-reprice, U-calibrate, U-swap_allowed, U-range_change, U-session_cap, U-deload_math`.
- Integration: `IT-progress, IT-reprice, IT-flat-levers, IT-patient-hold-probe, IT-absence, IT-injury, IT-adherence, IT-session-cap, IT-locked, IT-goal-change`.
- Edge/failure: `E-*` (all-zero week, week-0 seed, single-week trend, cap=floor, no-equipment swap, range-top, tenure boundary, RA-1 selection) and `F-*` validation.
- Reference walkthroughs 6.1–6.6 as golden tests.

### 8.3 Regression / parity
- **Freeze regression suite `R-*`** (one per removed concept): `R-no-fatigue, R-no-systemic, R-no-sustained-deload, R-no-scheduled-deload, R-no-trajectory, R-no-maintenance, R-no-dial, R-seed-discarded, R-determinism (1000 random inputs ×2 deep-equal), R-loop-termination (260-week soak across ta×goal×adherence×noise)`.
- **Parity guards for product overrides:** VERTICAL_PULL produces independent state from HORIZONTAL_PULL; CORE never acquires engine state (no calibrating/miss_streak/reprice); split library across 1–6 days always yields valid plans; goal-mapping (`toning→hypertrophy`) verified.
- **Migration parity:** a synthetic existing-user history produces a slot state whose first emitted plan is sane (no spurious deload/swap on import).

### 8.4 Rollout & verification
- Build bottom-up (Artifact 7 Phase 0→6); `apply_rails` is always the last transform; determinism checked continuously.
- Gate before merge: `tsc` clean + full `jest` suite green (current baseline 370/370 must not regress) + `expo export --platform ios` clean (per [[eas-build-presubmit-gate]]).
- Behind a swap point: keep `fixtureModel` selectable until the v4 engine passes the full invariant+regression suite; flip the live default only after green.
- On-device QA via TestFlight build after suites pass (respect the 15-build/month budget — batch).

---

## 9. Sign-off items — status & recommendations

### 9.1 RESOLVED
- **C-1 — slot-keyed state. APPROVED (2026-06-24).** State attaches to the durable program SLOT, not the exercise ID; a swap preserves slot continuity but re-initializes exercise-scoped progression (see C-1 row in §5).

### 9.2 APPROVED (2026-06-24) — all items signed off; implementation authorized

> C-2, C-7, C-8, and the existing-user migration are approved exactly as recommended below. Pattern volume is the source of truth (C-2). Pinned/manual exercises ⇒ `locked=true`; athlete owns selection, engine owns load/progression/reprice/volume/state (C-7). All personalization is seed-only with zero post-calibration influence (C-8). Slots with ≥2 completed sessions import as established; <2 start through calibration (migration). Standing instruction: if any new behavioral decision-point is discovered, STOP and surface it before coding; otherwise introduce no behavior beyond the frozen spec, ratified resolutions, and approved overrides.

#### Recommendations (as approved)

**C-2 — volume logic over the split library.** v4 is authoritative for volume (owner directive). Recommend:
- **Pattern weekly volume** = sum of working sets across all that pattern's slots in the week, bounded by `[MEV_floor(ta), min(MRV_ceil(ta), SESSION_SET_CAP × pattern_frequency_in_split)]`.
- **Starting volume** from v4 §4.1 (novice 8 / int 10 / adv 12 major), with the user's volume lever (low/moderate/high) as a within-band offset (low→toward MEV, high→toward ceiling) rather than the current fixed per-exercise `setsFor`.
- Engine adds/holds sets via the v4 stall ladder (vol→load→range) and RA-1 spread-not-stack, applied over the real session distribution.
- **Impact / why it needs sign-off:** this replaces the current per-exercise set scheme (`setsFor`, 3–5 by goal×tier) with v4 pattern-volume distributed across slots. It is the **second load-bearing decision** after C-1. **Recommendation: APPROVE** (it is the faithful v4 model and the owner already designated volume logic as v4-authoritative).

**C-7 — preferences → v4 reconciliation.** Recommend:
- An **athlete-pinned / substituted** exercise → set the slot's `current_exercise_id` **and `locked = true`**, so the engine never auto-swaps a lift the athlete explicitly chose. This honors the ratified Program Ownership Contract (*athlete owns exercise selection; model owns load/progression*). The athlete can still manually replace a locked lift; `locked` blocks only **engine-initiated** swaps. Engine-generated default slots stay **unlocked** (eligible for tenure+mismatch auto-swap).
- **Backups & custom order** stay **assembler-layer only** — no engine/progression effect.
- **Recommendation: APPROVE** (pin ⇒ locked; backups/order assembler-only).

**C-8 — seed-only personalization.** Recommend confirming:
- kg/lb is a **display conversion**; sex / age / bodyweight taper and experience modulate the **cold-start seed only** (v4 §4.3 allows a seed lookup keyed by sex × training_age; extending it with bodyweight/age is acceptable because the seed is **discarded at calibration exit**, §4.4). **STEP stays the fixed v4 kg formula** — never modulated by age/sex/bodyweight.
- **Recommendation: APPROVE** (keep the richer seed since it only improves week-1 and then vanishes).

**§7.3 — existing-user state migration (schema v2→v3).** Recommend:
- For each slot, look at the athlete's logged history of its current exercise:
  - **≥ 2 sessions of history** → import as **established**: `calibrating = false`, `current_load = demonstrated_load_at_target(best_e1rm, goal rep_target)`, `tenure_weeks` = capped weeks of history, `miss_streak = flat_weeks = 0`, `hold_mode = false`. (Avoids dropping an established lifter back to seed loads.)
  - **< 2 sessions** → start **CALIBRATING** from the cold-start seed (genuinely lacks v4's 2 in-range weeks to exit).
- Preferences carry forward and are re-expressed per C-7. `miss_streak`/`flat_weeks` start at 0 so the first emitted plan can never produce a spurious deload or swap on import.
- **Recommendation: APPROVE** (≥2-session threshold mirrors v4's calibration-exit rule; no fabrication, no friction).

No code will be written until §9.2 is approved.

---

## 10. Implementation status (live)

### 10.1 DONE — v4 engine, built + verified in isolation (mobile)
Built bottom-up per Handoff Artifact 7 under `code/mobile/src/engine/v4/`, fully unit/integration/regression tested, **zero change to the live app** (it is not yet wired into `fixtureModel`):

| Phase | Module(s) | Status |
|---|---|---|
| 0 | `constants.ts`, `types.ts` (validators, goal/training-age map) | ✅ |
| 1 | `reads.ts` (`demonstrated`, `classifyTrend`, `STEP`, round-DOWN `normalizeLoad`) | ✅ |
| 2 | `decisions.ts` (calibrate, reprice, reactive ladder, patient hold, routing) | ✅ |
| 3 | `swap.ts` (tenure+mismatch binary, deterministic select, slot-durable applySwap) | ✅ |
| 4 | `planNextWeek.ts` (adherence→injury→absence→per-slot loop + swap) | ✅ |
| 5 | `rails.ts`, `explain.ts`, `planWeek.ts` (rail, jump cap, pattern-volume/RA-1, assembly, explanations) | ✅ |
| 6 | `invariants.ts` (I-1..I-43 runner) + regression suite (R-*) + 260-week soak + determinism | ✅ |
| 7a | `catalogAdapter.ts` (exercise→Pattern, meta, candidate pools) | ✅ |

**Verification:** `tsc` clean; **jest 440/440** (370 prior baseline + **70 new v4 tests** incl. the invariant-clean 260-week soak and one regression per removed concept).

### 10.2 Engineering sub-decisions resolved during the build (all spec-faithful)
1. **Bodyweight** (spec-silent): maps onto v4 — rep_target progresses to range top, then graduates to a harder variation (no phantom load; rail/reprice inactive). *(flagged + recommended; in use)*
2. **Load normalization** (6b silent on machine/cable): barbell 2.5 / dumbbell 1.0 (spec-exact), machine/cable 2.5 (fine, round-down can't breach rail). *(flagged + recommended; in use)*
3. **Calibration**: follow normative rule 22 / I-19, not walkthrough 6.1's illustrative load arithmetic (C3-6 permits).
4. **Absence vs injury**: absence → load ×0.90 keep-volume rebuild (§6 step 2/I-6); injury → full deload ×0.85 + sets×0.50 + rep-mid (§9/I-20/21). Neither is performance-triggered (I-34).
5. **Load floor vs rail**: a load already at the minimum loadable increment cannot be clamped lower, so the rail (a demand cap) yields to that physical floor (only reachable at a near-zero demonstrated capacity).
6. **Portrait stays 5 bars**: VERTICAL_PULL is a first-class *engine* `Pattern`, mapped via `catalogAdapter`; the app's `Capability` union and the 5-bar Portrait are **untouched** — no display redesign, minimal blast radius.

### 10.3 DONE — live integration (Phase 7b), gated (approved: wire + verify; cadence = week rollover)
Built and wired behind a default-OFF flag (`src/engine/v4/flag.ts`), so live behavior is unchanged until on-device sign-off:
- **`catalogAdapter.ts`**: `exerciseId → Pattern` (VERTICAL_PULL first-class; CORE → null/accessory), meta, candidate pools. App `Capability`/Portrait untouched.
- **`v4Engine.ts`**: profile mapping; `deriveSlots` (slotId = `${dayKey}:${pattern}#${idx}`, stable across regen — C-1); `ensureSlots` (init from history per §9.2; athlete pin → locked manual replace — C-7); `maybeAdvance` (week rollover: aggregate the completed week → `planNextWeek` → persist); `currentTargets`/`targetFor`.
- **Persistence**: db `SCHEMA_VERSION` 2→3, additive `hush.engine.v4` key; non-destructive boot guard; wiped by `clearAll`.
- **`fixtureModel` wiring (gated)**: `generateProgram` ensures slots; `sessionTargets` advances + reads v4 prescriptions when ON; `prescribe()` path retained for OFF and as the swap-only fallback.
- **Verification**: `tsc` clean; **jest 449/449** (incl. end-to-end integration test); **`expo export --platform ios` rc=0**.

**Remaining before flipping the default ON:** on-device TestFlight QA (loads/reps sanity across goals/splits), then set the flag default to ON. The advisory voice (reason/forecast on SetTargets) and explanation surfacing in the v4 path are deliberately minimal for now and can be layered next.
