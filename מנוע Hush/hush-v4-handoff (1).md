# Hush Training Engine v4 — Engineering Handoff Package

**Source of truth:** `hush-mvp-engine-spec.md` (frozen v4). This package is a faithful derivation for implementation. It adds **no** new behavior. Where this document and the spec ever disagree, the spec wins and the disagreement is a bug in this document.

**Engine nature:** deterministic, pure function of `(profile, per-pattern state, global state, completed-week data, exercise library, constants)` → `(next-week program, updated state, explanations)`. No randomness, no clock-based behavior except the `days_since_last_session` fact, no I/O, no learning, no hidden state.

---

# Artifact 1 — Architecture Freeze Document

## 1.1 Non-negotiable rules (every one must hold in the implementation)

1. The decision unit is the **week**. The engine observes a completed week and emits the next week. No set-by-set or mid-week adaptation.
2. **The prescription is a hypothesis; the completed work is the truth.** Every decision reads completed sets `{load, reps, failed}`. The engine never acts on the prescription as if it were performed.
3. **Capability is read, never inferred.** `best_e1rm = max(load×(1+reps/30))` over completed sets. `demonstrated_load_at_target = best_e1rm/(1+rep_target/30)`.
4. **Missed target → reprice load to demonstrated, KEEP volume, KEEP rep_target.** Never cut volume on a miss. Never label it fatigue.
5. **Progression:** beat target with room → +1 rep_target (cap at range top); at range top → +STEP load, reset rep_target to range bottom.
6. **STEP** = upper: `max(2.5, 0.025×load)`; lower: `max(5, 0.05×load)`; isolation: half, min 1 kg. Fixed. No aggression dial.
6b. **Load normalization (RESOLVED C4-3):** every computed load is rounded **DOWN** to the nearest valid
   loadable increment (2.5 kg barbell / 1.0 kg dumbbell, per equipment). Rounding is always toward the
   lower increment — never up — so normalization can never push implied e1RM above the rail. Safety wins
   over precision. The rail (I-1) is checked AFTER normalization; if a down-rounded load still violates
   the rail (only possible via upstream error), clamp further down to satisfy it.
7. **FLAT only acts after the STALL_WINDOW** for the training age (novice 2 / int 4 / adv 6). Inside the window, FLAT → hold.
8. **Stall lever order (Minimum Effective Intervention):** volume (if `sets<ceiling` AND `session_sets+1 ≤ SESSION_SET_CAP`) → load (if not tried) → range change (if not tried) → PATIENT HOLD.
9. **PATIENT HOLD:** hold the week; re-allow the load lever every `PATIENT_PROBE_EVERY` (4) flat weeks for a single probe. HOLD always keeps re-testing; it is never a terminal state.
10. **Hard load rail (implied-demand form):** never prescribe a top set whose implied e1RM `load×(1+reps/30)` exceeds `best_e1rm × (1+RAIL_HEADROOM)` (3%). Caps demand, not raw load.
11. **Per-session set cap:** a session may never exceed `SESSION_SET_CAP` (22) working sets. The volume lever may add a set only if the session stays ≤ cap.
12. **Effective weekly volume ceiling** = `min(MRV_landmark, SESSION_SET_CAP × frequency)`.
13. **Load jump ≤ 10%** of current load on any single change (`LOAD_STEP_CAP`).
14. **Volume bounds:** within `[MEV_floor, ceiling]` except during an evidence-triggered deload. `≤ +1 set/pattern/week`; `≤ 2 patterns` receive +1 in one week.
14b. **Volume-allocation order (RA-1):** when >2 patterns qualify for +1 set, choose the two by: (1) keep every session ≤ SESSION_SET_CAP; (2) prefer spreading across sessions over stacking into one workout; (3) then longest-flat (max `flat_weeks`); (4) then pattern enum order. Deterministic.
15. **Deload triggers are ONLY** `extended_absence (days_since_last_session > 10)` and `injury_flag`. Deload = `load ×0.85 ; sets ×0.50 (floor MEV) ; rep_target = mid-range ; next week = fresh baseline`.
16. **Adherence gate:** `adherence < 0.67` → hold all, `sets −1` (floor MEV), no progression, emit & stop.
17. **Absence:** affected patterns `load ×0.90`, rebuild; never resume at full pre-gap load after a >10-day gap.
18. **Swap rule:** LOCKED → never replace. Unlocked & `tenure_weeks < SWAP_MIN_TENURE (4)` → never replace. Unlocked & tenure ≥ 4 → replace only if `persistent_mismatch (miss_streak ≥ MISS_ESCALATE (3), isolated to this exercise, no broad cause)`. Trigger is observed failure of the CURRENT exercise — never a prediction another is better.
19. **Swap selection:** same pattern, equipment in `available_equipment`, prefer same compound class, unused in last 8 weeks; new lift starts CALIBRATING.
20. **No swap within 4 weeks** of last swap (except CALIBRATING/absence).
21. **Locked exercises never swapped; never prescribe unavailable equipment.**
22. **CALIBRATING:** `best ≥ target+3 → load ×1.10`; `missed → load ×0.90`; else standard small step. Exits after 2 in-range weeks (`|best−target| ≤ 2`).
23. **Cold-start seed** is used to compute the week-1 prescription ONLY, then **permanently discarded** at CALIBRATING exit. It must never influence any decision afterward.
24. **Range change:** `[8,12]↔[4,6]`, `[5,8]↔[8,12]`; reset rep_target to range bottom; recompute load.
25. **Goal-specific progress metric:** strength → e1RM; hypertrophy → volume_load AND reps-at-fixed-load (e1RM secondary); general_fitness → adherence + gentle e1RM uptrend. (No satisfaction term — satisfaction layer removed.)
26. **Every emitted change carries an explanation** `{observation, conclusion, action}`. Reprice explanation never says "fatigue" and never implies volume was cut.
27. **Determinism:** identical inputs → identical outputs. No randomness anywhere in the engine.
28. **No subjective/affective state.** The engine holds no satisfaction, engagement, mood, or review state and accepts no weekly rating. It reacts only to completed history, profile, and explicit athlete actions (locks, replacements, profile edits). (RA-2)

## 1.2 Removed concepts that must NEVER reappear

These were each removed by evidence. Reintroducing any of them violates the freeze. Automated tests must assert their absence (see Artifact 4, I-30..I-39).

- **Per-pattern fatigue inference** — no `fatigued` flag; no decision may read set-to-set variance or within-session rep-decay as a fatigue/recovery signal.
- **Trajectory / future-progress / expected-velocity / ceiling estimation** — no component may compute or store an expected future value, a glide path, a progress-rate target, or a ceiling estimate.
- **Maintenance state** — no committed "at-limit" state; the at-limit athlete is handled by PATIENT HOLD (which re-probes).
- **Scheduled / calendar deloads** — no `BLOCK_LENGTH`; no deload triggered by a week number.
- **Systemic / multi-pattern deload** — no deload triggered by N patterns dropping in one week; no `SYSTEMIC_FRAC`.
- **Sustained-drop deload** — no deload triggered by a single pattern declining for N weeks; no `SUSTAINED_DROP_WEEKS`.
- **Aggression dial** — STEP is fixed; no scalar modulates step size.
- **FAVORITE** — no favorite field; attachment is LOCKED + swap tiers only.
- **Swap benefit/cost scoring** — no `SWAP_THRESHOLD`, `SWAP_TIER` as a decision input, `FAVORITE_COST`, `TENURE_PER_8WK`, `CHURN`, `VARIETY_ADJUST`. Swap is the binary tenure+mismatch rule.
- **Hidden athlete state of any kind** — capability, recovery, readiness, motivation must never be modeled as a latent variable.
- **Post-calibration priors** — the seed and any population data have zero influence after CALIBRATING exit.
- **Satisfaction / engagement layer (RA-2)** — no weekly rating, no `satisfaction_history`, no `engagement_mode`, no `human_review_flag`, no engagement bias. No subjective signal may drive any decision.
- **Prediction that another exercise is "theoretically better"** as a swap trigger.

---

# Artifact 2 — Engine Contract

## 2.1 Top-level function

```
plan_next_week(
    profile:        Profile,
    patterns:       List[PatternState],     # current per-pattern state
    global_state:   GlobalState,
    week_results:   List[PatternResult],    # completed week, one per pattern trained
    library:        ExerciseLibrary,        # static
    constants:      Constants = DEFAULTS
) -> PlanResult
```
Pure function. No side effects. `week_results` may be empty for a brand-new athlete (week-0 → emit week-1 from seed).

## 2.2 Data structures, fields, enums, defaults, validation

### Profile (immutable within a planning cycle; edited only via profile update)
| field | type / enum | default | validation |
|---|---|---|---|
| sex | `"male"|"female"` | required | must be enum |
| age | int | required | 13–100 |
| bodyweight_kg | float | required | 30–300 |
| training_age | `"novice"|"intermediate"|"advanced"` | required | enum |
| goal | `"strength"|"hypertrophy"|"general_fitness"` | required | enum |
| variety_preference | `"low"|"medium"|"high"` | `"medium"` | enum |
| workout_count | int | 4 | 2–4 (4=A/B/C/D, 3=drop C, 2=A/B) |
| available_equipment | list of `"barbell"|"dumbbell"|"machine"|"cable"|"bodyweight"` | required | non-empty subset |
| gym_busyness | `"low"|"medium"|"high"` | `"medium"` | enum |

`variety_preference` and `gym_busyness` are **assembler/UX inputs only** in v4 (swap scoring removed); they must not enter any progression/safety decision.

### PatternState (mutable; one per movement pattern)
| field | type | default | validation / notes |
|---|---|---|---|
| pattern | PatternEnum | required | one of the 7 |
| current_exercise_id | str | required | must exist in library, equipment available |
| current_load_kg | float | from seed wk1 | > 0; multiple of 2.5 (barbell) or 1.0 (db) |
| current_sets | int | from §4.1 | within `[MEV_floor, effective_ceiling]` |
| rep_target | int | from §4.2 | within `rep_range` inclusive |
| rep_range | [int,int] | from §4.2/goal | lo ≤ hi |
| locked | bool | false | athlete-set |
| tenure_weeks | int | 0 | ≥ 0; weeks on current_exercise_id |
| history | list[WeekRecord] | [] | keep last 6 |
| flat_weeks | int | 0 | ≥ 0 |
| miss_streak | int | 0 | ≥ 0 |
| levers_tried | set⊆{"vol","load","range"} | {} | cleared on any progress |
| hold_mode | bool | false | true while in PATIENT HOLD |
| weeks_since_swap | int | large | ≥ 0; gates 4-week swap cooldown |
| calibrating | bool | true | true until 2 in-range weeks |
| calib_weeks | int | 0 | ≥ 0; counts calibration weeks |

`WeekRecord`: `{week:int, sets:list[{load,reps,failed}], e1rm_week:float, volume_load:float, completed_sets:int, prescribed_sets:int}`.

### GlobalState
| field | type | default | notes |
|---|---|---|---|
| days_since_last_session | int | 0 | the only time-based fact; drives absence |

**Forbidden global fields (must not exist):** any `fatigue`, `readiness`, `aggression`, `trajectory`, `ceiling`, `maintenance`, `block_week`, stored `seed`, `satisfaction_history`, `engagement_mode`, `human_review_flag`.

### PatternResult (input — completed week)
`{pattern, exercise_id, sets:list[{load:float, reps:int, failed:bool}], sessions_completed:int, sessions_planned:int}`
Validation: `reps ≥ 0`; `load > 0`; `failed == (reps < prescribed_target)` should be consistent but engine recomputes `missed` itself from reps vs current rep_target.

### ExerciseLibrary entry (static, read-only)
`{id, pattern, is_compound:bool, default_rep_range:[lo,hi], equipment, fatigue_cost:"low|medium|high", body_region:"upper|lower|core", swap_group, swap_cost_tier:"LOW|MEDIUM|HIGH"}`
`fatigue_cost` and `swap_cost_tier` are **assembler hints only** — never decision signals.

### Constants (defaults — exact values from spec §12)
```
TREND_BAND=0.02      ADHERENCE_MIN=0.67    ABSENCE_DAYS=10
STALL_WINDOW={novice:2, intermediate:4, advanced:6}
MISS_ESCALATE=3      RAIL_HEADROOM=0.03    SESSION_SET_CAP=22
DELOAD_LOAD=0.85     DELOAD_SETS=0.50      LOAD_STEP_CAP=0.10
PATIENT_PROBE_EVERY=4 SWAP_MIN_TENURE=4
# (satisfaction constants removed — RA-2)
VOL_FLOOR={novice:4, intermediate:6, advanced:8}        # CORE floor 4
VOL_CEIL ={novice:12, intermediate:18, advanced:22}     # CORE ceil 12/16/20
STARTING_VOL_MAJOR={novice:8, intermediate:10, advanced:12}
STARTING_VOL_CORE ={novice:6, intermediate:8,  advanced:10}
REP_RANGE_BY_GOAL={strength:[3,6]@5, hypertrophy:[8,12]@8, general_fitness:[6,12]@8, CORE:[10,15]@12}
```

### PlanResult (output)
```
{
  next_program: {
     workouts: { A:[Slot...], B:[...], C:[...], D:[...] },   # per workout_count
     # Slot = {pattern, exercise_id, load_kg, sets, rep_target, rep_range, order_index}
  },
  updated_patterns: List[PatternState],
  updated_global:   GlobalState,
  explanations:     List[{pattern, observation, conclusion, action, text}]
}
```
Output invariants are enforced by Artifact 4 before return.

## 2.3 Pure sub-functions (contract level)
```
progress_metric(pattern, goal)            -> float
classify_trend(metric_now, history, ta)   -> "UP"|"FLAT"|"DOWN"
demonstrated(result, rep_target)          -> {best_e1rm, demonstrated_load_at_target, hit, room, missed}
calibrate(pattern, demo)                  -> PatternDecision
reactive_progress(pattern, trend, demo)   -> PatternDecision    # beat / flat-levers / hold
reprice_keep_volume(pattern, demo)        -> PatternDecision
swap_allowed(pattern)                     -> bool
select_replacement(pattern, library)      -> exercise_id
apply_rails(decisions, patterns, consts)  -> decisions          # clamps + asserts
assemble_gym_flow(decisions, profile)     -> next_program
explain(decision)                         -> {observation, conclusion, action, text}
```

---

# Artifact 3 — State Machine Specification

The engine has a **per-pattern** state machine. Engine-global flow (adherence/absence) is procedural ordering, not states.

## 3.1 Per-pattern states
`CALIBRATING, PROGRESSING, REPRICING, FLAT_HOLD_LEVERS, PATIENT_HOLD, DELOADING`

Note: REPRICING, PROGRESSING, FLAT_HOLD_LEVERS, PATIENT_HOLD are **single-week action modes** the pattern resolves into each week from observed data; the pattern does not "live" in them across weeks except CALIBRATING (persists until exit) and PATIENT_HOLD (persists while flat-and-capped, re-probing).

| State | Entry condition | Exit condition | Allowed actions | Forbidden actions |
|---|---|---|---|---|
| **CALIBRATING** | new pattern, or after a swap; `calibrating=true` | 2 in-range weeks (`|best−target|≤2`, not missed) → discard seed, → PROGRESSING/REPRICING next week | load ×1.10 (best≥target+3) / ×0.90 (missed) / standard step | adding sets; rep-range change; swap; reading seed after exit |
| **PROGRESSING** | not calibrating, not missed, (trend UP or beat-with-room) | next week's read | +1 rep_target (room) OR +STEP load at range top; clear levers_tried | cutting volume; inferring fatigue |
| **REPRICING** | not calibrating, `missed` this week | next week's read | load → demonstrated_load_at_target; keep sets; keep rep_target; `miss_streak+=1` | cutting volume; raising load; declaring fatigue/deload |
| **FLAT_HOLD_LEVERS** | not calibrating, not missed, trend FLAT past STALL_WINDOW, levers remain | a lever applied this week → next week's read | one of: +1 set (if `sets<ceil` and session cap ok) / +STEP load / range change — in that order, first untried | applying >1 lever; exceeding session cap; cutting volume |
| **PATIENT_HOLD** | FLAT past window AND all of {vol,load,range} tried | a progress week (beat/room) → PROGRESSING; a miss → REPRICING | hold; re-allow load lever every 4th flat week (one probe) | new exercise swap on flatness alone; volume withdrawal; declaring maintenance |
| **DELOADING** | extended_absence OR injury_flag (engine-global, applied to pattern) | after the deload week → fresh baseline → normal reads | load ×0.85; sets ×0.50 (floor MEV); rep_target mid-range | being triggered by any performance drop |

## 3.2 Allowed transitions
```
(new) ─────────────► CALIBRATING
CALIBRATING ──2 in-range──► PROGRESSING | REPRICING | FLAT_HOLD_LEVERS   (per next read; seed discarded)
PROGRESSING ◄──────────────► REPRICING            (miss ↔ progress, by week)
PROGRESSING ───flat≥window──► FLAT_HOLD_LEVERS
FLAT_HOLD_LEVERS ──levers exhausted──► PATIENT_HOLD
FLAT_HOLD_LEVERS ──progress/miss──► PROGRESSING | REPRICING
PATIENT_HOLD ──probe/any progress──► PROGRESSING
PATIENT_HOLD ──miss──► REPRICING
REPRICING ──miss_streak≥3 & isolated & DOWN & swap_allowed──► CALIBRATING (via swap)
any (absence/injury) ───► DELOADING ──► (fresh baseline) normal
```

## 3.3 Forbidden transitions (tests must assert these never occur)
- CALIBRATING → swap (a calibrating lift has no tenure; cannot be replaced).
- Any state → DELOADING triggered by a performance drop (only absence/injury may).
- PATIENT_HOLD → swap caused by flatness alone (swap needs miss-streak mismatch, not flat).
- LOCKED pattern → CALIBRATING-via-swap (locked never swaps).
- Unlocked pattern with `tenure_weeks < 4` → swap.
- Any transition that cuts volume on a single missed/declining week (only deload and the adherence gate reduce volume, by their own rules; engagement layer removed — RA-2).
- Re-entry into any removed state (MAINTENANCE, fatigue-driven hold, scheduled deload) — these states do not exist.

---

# Artifact 4 — Invariant Specification (assertions for automated testing)

Each invariant `I-n` is checkable after `apply_rails` and before `PlanResult` returns. CI must run them on every emitted plan across all tests.

**Safety**
- **I-1** For every emitted Slot: `load×(1+rep_target/30) ≤ best_e1rm(exercise) × (1+RAIL_HEADROOM)`. (Rail; for a never-demonstrated exercise in CALIBRATING, rail is inactive.)
- **I-2** For every pattern: `|new_load − prev_load| ≤ LOAD_STEP_CAP × prev_load` (≤10%), except deload (×0.85 allowed) and absence (×0.90 allowed) and CALIBRATING ×1.10/×0.90.
- **I-2b** Every emitted load is a valid loadable increment (multiple of 2.5 barbell / 1.0 dumbbell) obtained by rounding DOWN; rounding never increases implied e1RM (round-down only). Rail (I-1) holds after normalization.
- **I-3** Every session's total working sets `≤ SESSION_SET_CAP` (22).
- **I-4** Every pattern's weekly sets ∈ `[MEV_floor(ta), min(MRV_ceil(ta), SESSION_SET_CAP×freq)]`, except during a deload week (may go to floor).
- **I-5** `≤ +1 set` per pattern vs last week; `≤ 2 patterns` increased in one week.
- **I-5b (RA-1)** When >2 patterns qualify for +1 set in a week, exactly the top-2 by this deterministic order receive it:
   (1) the add must keep every affected session ≤ SESSION_SET_CAP (hard session-time limit first);
   (2) prefer adds that DISTRIBUTE volume across sessions rather than stacking into one workout
       (an add that lands in a less-loaded session ranks above one that crowds a fuller session);
   (3) among remaining candidates, prefer patterns flat the longest (max `flat_weeks`);
   (4) final tie-break: pattern enum order.
   Principle: never concentrate volume into a single workout when it can be spread.
- **I-6** After a >10-day gap, no pattern resumes at `> 0.90 × pre-gap load`.

**Preference / lock**
- **I-7** A `locked` pattern's `current_exercise_id` is identical to last week's (never swapped).
- **I-8** No Slot uses an exercise whose equipment ∉ `available_equipment`.
- **I-9** No unlocked pattern with `tenure_weeks < SWAP_MIN_TENURE` changes exercise.
- **I-10** No pattern swaps within 4 weeks of its last swap (except absence/CALIBRATING).
- **I-11** A swap only occurs when `miss_streak ≥ MISS_ESCALATE AND isolated AND not(absence/injury broad cause)`.

**Capability / progression**
- **I-12** On a missed week, `new_sets == prev_sets` (volume never cut on a miss) and `new_rep_target == prev_rep_target`.
- **I-13** On a missed week, `new_load ≤ demonstrated_load_at_target` (repriced down, not up).
- **I-14** A FLAT week inside the STALL_WINDOW produces no progression change (hold).
- **I-15** Stall levers are applied at most one per pattern per week, in order vol→load→range.
- **I-16** PATIENT_HOLD weeks change nothing except the periodic probe (every `PATIENT_PROBE_EVERY`).
- **I-17** STEP equals the fixed formula; no scalar/dial modifies it.

**Seed / calibration**
- **I-18** After a pattern's `calibrating` has ever become false, no field of the cold-start seed appears in any computation (seed object is not even in scope post-calibration).
- **I-19** CALIBRATING exits only after 2 in-range non-missed weeks.

**Deload / recovery**
- **I-20** A DELOADING week occurred only if `extended_absence OR injury_flag` was true. No deload from any performance metric.
- **I-21** Deload math exactly `load×0.85, sets×0.50 (floor MEV), rep_target=mid-range`.

**Adherence**
- **I-22** If `adherence < 0.67`: all patterns held, `sets −=1` (floor MEV), zero progression changes emitted.
- **I-23** (removed with satisfaction/engagement layer — RA-2). No engagement/satisfaction state exists.

**Determinism / purity**
- **I-24** `plan_next_week` called twice with identical inputs returns deep-equal outputs.
- **I-25** No engine call reads wall-clock, RNG, or external state.

**Output integrity**
- **I-26** Every emitted change has a non-empty `{observation, conclusion, action, text}`.
- **I-27** The reprice explanation text contains neither the word "fatigue" nor any claim that volume changed.
- **I-28** Program contains exactly `workout_count` workouts; every pattern appears at its mapped frequency.
- **I-29** Every Slot's `rep_target ∈ rep_range`.

**Forbidden-concept guards (structural)**
- **I-30** No state object contains a `fatigue`/`readiness` field.
- **I-31** No code path reads set-variance or within-session rep-decay to drive a decision.
- **I-32** No trajectory/ceiling/expected-velocity value is computed or stored.
- **I-33** No MAINTENANCE state exists.
- **I-34** No deload is reachable from a week-number or a multi-pattern/sustained drop.
- **I-35** No aggression/step-scaling scalar exists.
- **I-36** No FAVORITE field or favorite-cost term exists.
- **I-37** No swap benefit/cost arithmetic exists (swap is the binary rule only).
- **I-38** No population data influences any decision after CALIBRATING exit.
- **I-39** Swap is never triggered by "another exercise is better"; only by current-exercise observed mismatch.
- **I-40** `select_replacement` is deterministic: identical library+filters → identical choice (first in library order on ties). (C3-7)
- **I-41** No satisfaction/engagement/human-review state exists or is read anywhere. No weekly rating is an input. (RA-2)
- **I-42** When >2 patterns qualify for +1 set, the chosen ≤2 follow the deterministic RA-1 order (session-spread first, then longest-flat, then pattern-enum). (RA-1)
- **I-43** Assembler output is deterministic for identical inputs (stable order; ties by pattern-enum). (RA-3)

---

# Artifact 5 — Comprehensive Test Specification

## 5.1 Unit tests (pure sub-functions)
- **U-demonstrated:** `demonstrated([{80,6,F},{80,5,F},{80,4,T}], target=5)` → best_e1rm=96.0, missed=False (best=6≥5), room=True. `[{80,4,T},{80,3,T}]` target5 → missed=True.
- **U-trend:** baseline 93.3, now 96.0 → delta +2.9% → UP. now 93.5 → FLAT. now 91.0 → DOWN. Single-week history → FLAT.
- **U-step:** load 80 upper → 2.5; load 200 upper → 5.0 (0.025×200); load 100 lower → 5.0; isolation 40 → max(1, half)=1.25→round.
- **U-rail:** best_e1rm 100, target 5 → max load = 103/(1+5/30)=88.3; prescribing 90×5 (impl 105) is clamped; prescribing 88×5 passes.
- **U-reprice:** prescribed 82.5×8 completed 82.5×6,82.5×5,80×6 → best_e1rm=99.0 → demo_at_8=78.2 → new_load=77.5, sets unchanged, target unchanged.
- **U-calibrate:** best target+3 → ×1.10; missed → ×0.90; in-range twice → calibrating False, seed discarded.
- **U-swap_allowed:** locked→False; tenure 3→False; tenure 5 + miss_streak 3 isolated→True; tenure 5 + miss_streak 1→False.
- **U-range_change:** [8,12]→[4,6] target→4; [5,8]→[8,12] target→8.
- **U-session_cap:** pattern at sets where `round((sets+1)/freq) > 22` → volume lever refused, escalates to load.
- **U-deload_math:** load100 sets10 floor6 → load85 sets6 (since 5<floor→6) rep mid.

## 5.2 Integration tests (full `plan_next_week`)
- **IT-progress:** thriving novice, beats target 3 wks → load climbs by STEP each transition; e1rm monotone up; no swaps; no deload.
- **IT-reprice (RESOLVED C3-6):** intermediate misses once → assert ONLY spec-guaranteed facts: (a) new load ≤ demonstrated_load_at_target, (b) `current_sets` unchanged, (c) `rep_target` unchanged, (d) explanation contains no 'fatigue' and no volume-change claim. Recovery timing is a sim tendency, NOT asserted.
- **IT-flat-levers:** force FLAT past window → week1 +set, week2 +load, week3 +range, week4 PATIENT_HOLD; assert order and one-lever-per-week.
- **IT-patient-hold-probe:** sustained flat at cap → HOLD; every 4th week a single load probe; miss→reprice; beat→PROGRESSING.
- **IT-absence:** set days_since=11 → all affected patterns ×0.90, rebuild; assert no full-load resume.
- **IT-injury:** injury_flag → DELOADING math; next week fresh baseline.
- **IT-adherence:** sessions 2/4 → hold all, sets−1, no progression, explanation = adherence text.
- **IT-session-cap:** advanced, drive volume up → assert no session exceeds 22 and weekly ceiling = min(MRV, 22×freq).
- **IT-locked:** locked pattern with miss_streak ≥3 → asserts NO swap (I-7, I-11).
- **IT-goal-change:** profile goal hypertrophy→strength → rep_range shifts to [3,6], rep_target→5, load RECOMPUTED from demonstrated best_e1rm at the new target, `calibrating` stays false, normal reactive flow continues; no error; seed not consulted. (C4-1 resolved)

## 5.3 Edge cases
- **E-all-zero-week (RESOLVED C4-2):** every set 0 reps → no demonstrated capability → load ×0.90, KEEP volume, KEEP rep_target. This is the defined behavior for the empty-demonstrated case (the `max` over completed sets is otherwise undefined).
- **E-empty-week_results (week 0):** new athlete → emit week-1 from seed; all patterns CALIBRATING.
- **E-single-week-history:** trend = FLAT (no baseline); no spurious UP/DOWN.
- **E-cap-equals-floor:** deload where ×0.50 < MEV → clamp to floor, not below.
- **E-no-equipment-match:** swap needed but no alternative with available equipment → keep current, in-place fallback (range/hold).
- **E-rep_target-at-range-top:** beat with room at top → +load and reset to bottom (not target+1 beyond range).
- **E-tenure-boundary:** tenure exactly 4 with mismatch → swap allowed; exactly 3 → not.
- **E-two-patterns-want-set (RA-1):** three+ patterns flat-want-volume → exactly the top-2 by the RA-1 deterministic order (session-cap-safe → spread-not-stack → longest-flat → enum) receive +1; the rest hold their volume this week and remain eligible next week. Assert deterministic selection (I-5b).

## 5.4 Failure cases (must raise/validate, not silently proceed)
- **F-invalid-profile:** age 5, bodyweight 5, unknown goal, empty equipment → validation error.
- **F-exercise-not-in-library / equipment-unavailable** at init → reject.
- **F-rep_target outside rep_range** in state → validation error.
- **F-negative reps / negative load** in week_results → reject.
- **F-load not on increment (RESOLVED C4-3)** → normalize by rounding DOWN to nearest valid increment (2.5 barbell / 1.0 dumbbell); never round up; re-check rail after. Never reject — always produce a loadable, rail-safe weight.

## 5.5 Regression tests (lock the freeze — one per removed concept)
- **R-no-fatigue:** inject a high-variance / steep-decay but target-hit week → assert NO volume cut, NO deload (I-12, I-31).
- **R-no-systemic:** make 5 of 7 patterns DOWN same week (none missed-below-target) → assert NO deload, each flows to reactive logic (I-34).
- **R-no-sustained-deload:** one pattern DOWN 3 wks but hitting target → reprice/HOLD only, NO volume-cut deload (I-20, I-34).
- **R-no-scheduled-deload:** run 12 thriving weeks → assert zero deloads (no week-5 event) (I-34).
- **R-no-trajectory:** assert no stored expected/ceiling value influences load (I-32).
- **R-no-maintenance:** advanced at-limit → PATIENT_HOLD re-probes; assert no committed maintenance state (I-33).
- **R-no-dial:** identical inputs at different "aggression" history → identical STEP (I-17, I-35).
- **R-seed-discarded:** force calibration exit, then mutate seed table → assert outputs unchanged (I-18, I-38).
- **R-determinism:** 1000 random valid inputs, run twice → deep-equal (I-24).
- **R-loop-termination:** 260-week run on each (ta×goal×adherence×noise) cell → always terminates, always emits valid plan, no dead-end (covers Artifact-1 loop/dead-end checks).

---

# Artifact 6 — End-to-End Reference Walkthroughs

Loads rounded to 2.5 kg. STEP shown per rule. These are expected engine outputs; tests in 5.2 assert them.

## 6.1 Novice / hypertrophy — progression + reprice + recover
Bench, range [8,12], target 8, 3 sets. Seed load 50 kg.
```
Wk1 CALIBRATING  prescribe 50×8×3  → did 12,12,11  (best 12 ≥ target+3=11) → load×1.10=55
Wk2 CALIBRATING  prescribe 55×8×3  → did 11,10,10  (in range, |11-8|=3>2? best-target=3) → not in-range → step; calib continues
Wk3 CALIBRATING  prescribe 57.5×8  → did 9,9,8     (|9-8|=1 ≤2, not missed) [2nd in-range] → EXIT CALIBRATING, seed discarded
Wk4 PROGRESSING  prescribe 57.5×8  → did 9,9,9      room(≥9) → +1 rep_target → target 9
Wk5 PROGRESSING  prescribe 57.5×9  → did 10,9,9     room → target 10
Wk6 REPRICING    prescribe 57.5×10 → did 8,7,8 (best 8 < target 10) MISSED
                 best_e1rm=57.5×(1+8/30)=72.7 → demo_at_10=72.7/(1.333)=54.5 → load 52.5, sets 3, target 10 (kept)
Wk7 PROGRESSING  prescribe 52.5×10 → did 11,10,10   room → target 11   (volume never cut; load was repriced to demonstrated — recovery TIMING is illustrative, not guaranteed)
```
Explanations: Wk4 "+reps", Wk6 reprice ("…came in at 8 instead of 10… set to 52.5, sets unchanged"), Wk7 "+reps".

## 6.2 Intermediate / strength — flat → levers → hold, with rail
Squat, range [3,6], target 5, 10 sets/wk (freq 2 → 5/session). Established (post-calibration), best_e1rm 150.
```
Wk1 PROGRESSING  150-ish working loads; hits 5s with room → +load (STEP lower = max(5,0.05×120)=6 → 5 increment rounding) 
Wk2 FLAT (past int window 4 only after 4 flat wks; weeks 1-4 flat → HOLD inside window)
...four flat weeks accrue (held, no change) — STALL_WINDOW int=4...
Wk5 FLAT_HOLD_LEVERS  sets 10<ceil 18 and session 5+? (round(11/2)=6≤22) → +1 set (vol)        levers={vol}
Wk6 FLAT_HOLD_LEVERS  load not tried → +STEP load (rail: implied e1rm must ≤ best×1.03)         levers={vol,load}
Wk7 FLAT_HOLD_LEVERS  range not tried → [3,6]→[8,12]? no: strength uses [3,6]; range alt → [8,12] variety; target→8  levers={vol,load,range}
Wk8 PATIENT_HOLD      all levers tried → HOLD; probe scheduled wk that is 4th flat
Wk12 PATIENT_HOLD     4th flat week → re-allow load lever → single probe +STEP (rail-capped)
                      → did beat → PROGRESSING (capacity returned)
```
Assert: rail clamps any probe whose implied e1rm > best×1.03; HOLD always re-probes.

## 6.3 Advanced / general_fitness — absence then rebuild
Established advanced. days_since_last_session reaches 11 during a 2-week gap.
```
Wk_n   normal week
[gap 12 days]
Wk_n+1 GLOBAL: extended_absence → every pattern load ×0.90, rebuild; explanation "Over a week off — eased ~10%…"
Wk_n+2 normal reactive reads resume from the reduced loads; climbs back via PROGRESSING
```
Assert I-6 (no full-load resume), deload-by-fact only.

## 6.4 Intermediate / hypertrophy — unlocked swap on persistent mismatch
Incline DB press, unlocked, tenure 6 weeks, isolated misses.
```
Wk1 REPRICING miss_streak=1 (repriced, volume kept)
Wk2 REPRICING miss_streak=2
Wk3 REPRICING miss_streak=3, isolated, trend DOWN, tenure≥4, not within 4wk of last swap, equipment available
     → swap_allowed → select_replacement(same pattern, available eq, prefer compound, unused 8wk) = flat DB press
     → new lift starts CALIBRATING; weeks_since_swap=0; miss_streak=0
Wk4 CALIBRATING on flat DB press…
```
Contrast LOCKED: same miss pattern on a LOCKED lift → NO swap (I-7), engine keeps repricing/holding.

## 6.5 Goal change mid-stream (profile edit) — RESOLVED C4-1
```
Athlete hypertrophy, patterns in [8,12]. Profile updated goal→strength.
Next planning cycle:
  1. rep_range ← REP_RANGE_BY_GOAL[strength]=[3,6]; rep_target ← range bottom (5 per goal default).
  2. RECOMPUTE working load from the athlete's DEMONSTRATED capability:
       new_load = demonstrated_load_at_target(best_e1rm_history, new_rep_target)
       (best_e1rm carries over from existing history; it is goal-independent.)
  3. DO NOT set calibrating=true. The athlete is NOT new — demonstrated history exists and is used.
  4. Continue through the normal reactive flow from this load/target.
No CALIBRATING, no seed (seed already discarded long ago). Goal is profile data, not engine state.
```
**Rule (engine):** On any profile goal change, for each affected pattern set the new rep_range/rep_target
from REP_RANGE_BY_GOAL, recompute current_load_kg = demonstrated_load_at_target using the existing
best_e1rm from history, and proceed reactively. `calibrating` stays false. The seed is never consulted.

## 6.6 Lock / unlock toggle
```
Athlete locks Bench at wk10 → from wk10 swap_allowed(Bench)=False permanently while locked, regardless of misses.
Athlete unlocks at wk20 → swap eligibility returns, but tenure clock already satisfied; a swap now requires the
normal miss_streak≥3 isolated mismatch to fire. No retroactive swap.
```

---

# Artifact 7 — Implementation Order

Build bottom-up; each layer is independently testable before the next. Dependencies in parentheses.

**Phase 0 — Foundations (no engine logic)**
1. **Data models + validation** (Profile, PatternState, GlobalState, PatternResult, WeekRecord, Slot, PlanResult, Constants). Enums, defaults, validators. → unit-validate with F-cases.
2. **Exercise library loader** (static schema, equipment filter, swap_group index). (1)

**Phase 1 — Pure reads (the observation layer)**
3. **`demonstrated()`** — best_e1rm, demo_load_at_target, hit/room/missed. (1) → U-demonstrated.
4. **`progress_metric()` + `classify_trend()`** — goal-specific, stall-window gating. (1,3) → U-trend.
5. **`STEP` + rounding utilities.** (1) → U-step.

**Phase 2 — Per-pattern decision core**
6. **`calibrate()`** + calibration-exit + **seed discard**. (3,5) → U-calibrate, I-18/19.
7. **`reprice_keep_volume()`** — the capability rule; volume/target invariants. (3) → U-reprice, I-12/13.
8. **`reactive_progress()`** — beat/room, flat-lever ladder (vol→load→range), PATIENT_HOLD + probe. (3,4,5) → IT-flat-levers, IT-patient-hold.
9. **Per-pattern state machine wiring** (Artifact 3 transitions + forbidden-transition guards). (6,7,8) → transition tests.

**Phase 3 — Swap subsystem**
10. **`swap_allowed()` + `select_replacement()`** — tenure+mismatch binary, lock guard, equipment filter, 8-week reuse, 4-week cooldown, deterministic tie-break = first in library order (C3-7). (2,9) → U-swap, IT-locked, I-7..I-11, I-39.

**Phase 4 — Engine-global ordering**
11. **Global flow:** adherence gate → absence → per-pattern loop. (9) → IT-adherence, IT-absence.
12. **`deload()`** by fact (absence/injury) only. (11) → IT-injury, I-20/21, R-no-*-deload.
(Satisfaction/engagement processing removed — RA-2; no module to build.)

**Phase 5 — Safety + assembly (final gate before output)**
14. **`apply_rails()`** — implied-e1RM rail, 10% jump cap, volume bounds, session-set cap, ≤+1 set / ≤2 patterns. Runs last; enforces I-1..I-6, I-29. (all prior) → U-rail, IT-session-cap.
15. **`assemble_gym_flow()`** — pattern→workout mapping; ordering per §13 heuristic; **RA-3 determinism:** implement as a STABLE sort by (§13 priority key, then pattern enum order) so identical inputs always yield identical ordering. Session-cap respected. Affects neither progression, safety, nor volume. (14) → I-28, I-43.
16. **`explain()`** — templates; reprice never says fatigue. (all) → I-26/27.

**Phase 6 — Verification harness**
17. **Invariant runner** (I-1..I-39 asserted on every emitted plan). (14,15,16)
18. **Regression suite** (R-*, one per removed concept) wired into CI. (17)
19. **260-week multi-cell soak** (loop/dead-end/termination). (all)

**Critical ordering constraints**
- `apply_rails` (14) MUST be the last transform before output; nothing may prescribe past it.
- Seed-discard (6) MUST be verifiable before swap (10) exists (a swap re-enters CALIBRATING).
- The forbidden-concept guards (I-30..I-39) should be added in Phase 0–2 as structural lint so removed concepts can't be reintroduced during later phases.
- Determinism (I-24/25) checked continuously from Phase 1 — any RNG/clock dependency is a build-stop.

---

# Appendix A — Resolved gaps (ratified decisions, locked)

These were the only places the handoff exceeded the literal frozen spec. Each is now ratified; none
leaves discretion to the implementer. They are engine-behavior decisions made by the product owner and
are binding alongside v4.

| ID | Gap | Ratified resolution | Engine-behavior? |
|---|---|---|---|
| C4-1 | Goal change transition (v4 silent) | Update rep_range/target from goal; RECOMPUTE load from demonstrated best_e1rm at new target; `calibrating` stays false; continue reactive flow; seed never consulted. NOT a new-athlete path. | Yes |
| C4-2 | All-zero week (demonstrated undefined) | load ×0.90; KEEP volume; KEEP rep_target. | Yes |
| C4-3 | Load normalization (v4 silent) | Round DOWN to nearest valid increment (2.5 barbell / 1.0 dumbbell); never up; re-check rail after; clamp further down if needed. Safety over precision. | Yes |
| C4-4 | human_review surfacing | **Superseded by RA-2:** the satisfaction/engagement layer (incl. `human_review_flag`) was removed entirely, so there is no flag to surface. PlanResult has no `flags` field. | n/a (removed) |
| C3-6 | Walkthrough recovery-timing assertions | Reworded to assert only spec-guaranteed facts (reprice ≤ demonstrated, volume/target unchanged, no 'fatigue' text). Recovery timing is illustrative, never asserted. | No (test-only) |
| C3-7 | Replacement tie-break (both docs silent) | Deterministic: first candidate in library order. | Yes |
| RA-1 | >2 patterns want +1 set (v4 silent on WHICH) | Deterministic order: (1) session-cap-safe; (2) spread across sessions, not stack; (3) longest-flat; (4) pattern enum. | Yes (volume) |
| RA-2 | Satisfaction/engagement layer | **Removed entirely** from spec and handoff (no unique problem solved). Engine reacts only to completed history, profile, explicit athlete actions. | Yes (removal) |
| RA-3 | Assembler tie ordering | Stable sort by (§13 priority, pattern enum); deterministic; no effect on progression/safety/volume. | Yes (output only) |

All other handoff content is Category 1 (directly specified) or Category 2 (logical restatement). After
these ratifications, **no Category 4 items remain** and the engine decision path contains no implementer
discretion: every branch resolves to a defined behavior by either the frozen v4 spec or a ratified
resolution above.

---

*End of handoff package. Derived from frozen v4 (`hush-mvp-engine-spec.md`) plus the six ratified resolutions in Appendix A. No new behavior beyond those ratified decisions; any other divergence from the spec is a defect in this document, not a design change.*
