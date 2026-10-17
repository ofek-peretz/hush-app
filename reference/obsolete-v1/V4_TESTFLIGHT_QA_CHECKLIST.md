# Hush v4 — First TestFlight QA Checklist

**Purpose:** verify the frozen v4 engine + new surfaces on-device before flipping the v4 flag ON for users.
**Build under test:** branch `feat/live-progression-and-program-quality`. Engine is FROZEN (no decision/progression/rail/swap changes).
**Default state:** `engine/v4/flag.ts` ships **OFF**. For QA, enable it (see §0) so the v4 path is exercised.

Legend: ☐ = to verify · note pass/fail + device/iOS + screenshot.

---

## 0. Setup
- ☐ Confirm flag state: `isV4Enabled()` — for this QA pass set `setV4Enabled(true)` (temporary; do NOT ship ON yet).
- ☐ Fresh install (delete app first) so `hush.engine.v4` and schema v3 initialize clean.
- ☐ Settings → Developer → **"v4 engine state"** opens the debug screen (DEV builds only).
- ☐ Repeat the core passes once with the flag **OFF** to confirm the legacy double-progression path is unchanged (no regression).

## 1. Onboarding → first program (cold start)
- ☐ Complete onboarding for each goal: Get Stronger, Build Muscle, General Fitness, Toning.
- ☐ Program generates before Home renders; workouts match the chosen split (sex × days).
- ☐ Debug screen: a slot exists per non-core exercise; all start `calibrating=true`, `tenure_weeks=0`, sane seed `load_kg` (barbell compounds ≥ 20), bodyweight slots `load_kg=null`.
- ☐ **VERTICAL_PULL** present as its own pattern (pull-up / chin-up / lat pulldown slots show `VERTICAL_PULL`, NOT folded into horizontal pull).
- ☐ **CORE** finisher appears in the program but has **no** debug slot (accessory, not engine-managed).
- ☐ Rep targets match goal: strength 5 (range 3–6), hypertrophy/general 8, toning → hypertrophy (8).

## 2. Per-session prescriptions
- ☐ Session targets show the persisted v4 prescription (weight + reps) per exercise.
- ☐ Swap-only / non-program exercises still show a sensible seed (cold-start fallback).
- ☐ Loads are valid increments (barbell 2.5, dumbbell 1.0); never 0 or negative.

## 3. Week rollover + progression (the core loop)
- ☐ Complete a full week (all N workouts) beating targets → next week loads/reps advance.
- ☐ Calibration: an exercise exits CALIBRATING after ~2 in-range weeks (debug: `calibrating` flips false, `tenure_weeks` climbing).
- ☐ Beat-with-room below range top → `rep_target` +1; at range top → load +STEP, target resets to bottom.
- ☐ A missed week → load repriced DOWN, **sets unchanged**, rep_target unchanged (debug: `miss_streak` +1).
- ☐ Long plateau (hit target, no room, past stall window) → one lever/week in order vol → load → range → PATIENT HOLD (debug: `flat_weeks`, `levers_tried`, `hold_mode`).
- ☐ No session exceeds ~60–65 min of working sets (session set cap 22).

## 4. Weekly Update + Why surfaces
- ☐ The weekly notification opens the **Weekly Update** screen (flag ON); legacy → Program (flag OFF).
- ☐ Each change row reads in first person and matches what the engine did.
- ☐ Tapping a row reveals the **Why**: What I saw / What it means / What I did (observation / conclusion / action).
- ☐ A reprice explanation NEVER says "fatigue" and never claims volume changed.
- ☐ Calibration weeks and steady holds surface NO change line (empty week → "everything held steady").
- ☐ Hebrew (עברית): Weekly Update + Why render correctly RTL with translated copy.

## 5. Exercise swaps + locks (athlete ownership)
- ☐ Manually replacing an exercise persists across weekly regeneration (debug: slot `current_exercise_id` updated, `locked=true`, new lift `calibrating=true`).
- ☐ A LOCKED / athlete-chosen exercise is never auto-swapped by the engine.
- ☐ An engine auto-swap only fires on a genuine persistent mismatch (unlocked, tenure ≥ 4, miss_streak ≥ 3, trend down) and lands on a same-pattern, equipment-available alternative.

## 6. Goal change (C4-1)
- ☐ (If/when a goal editor exists) changing goal updates every slot's rep range/target and recomputes load from demonstrated history; `calibrating` stays as-is (no forced re-calibration). *(No in-app goal editor today — verify via re-onboarding or note as N/A.)*

## 7. Deload by fact only
- ☐ Adherence drop (complete < ~⅔ of the week) → next week holds all, trims a set, no progression; Weekly Update says so.
- ☐ A >10-day gap → loads ease ~10%, volume kept ("eased ~10%, we'll rebuild").
- ☐ NO deload ever appears from a normal performance dip, a plateau, or a week number (regression-locked, but eyeball it).

## 8. Splits / frequency coverage
- ☐ Generate and skim 1–6 day programs for both sexes; every weekly plan covers all major patterns; women's splits keep the lower-body / glute emphasis.
- ☐ Switching the volume lever (low/moderate/high) rebuilds the week and is reflected in slot `sets`.

## 9. Analytics / event tracking (verify events fire)
Use the debug telemetry buffer or backend sink. Confirm events: `onboarding_completed`, `days_per_week_selected`, `goal_selected`, `experience_selected`, `program_generated` (reason onboarding/weekly/volume), `volume_changed`, `session_started`, `set_completed`, `session_completed`, `replacement_*` (swaps), `weekly_update_viewed` / `weekly_update_why_opened` / `weekly_update_dismissed`, `notification_opened`.
- ☐ Each fires at the expected moment with sane payload.
- ☐ **Not instrumented (no feature yet):** cardio/walk sessions, an explicit exercise-lock toggle, a post-onboarding goal editor — confirm these are genuinely absent (no dead UI), not missed events.

## 10. Stability / regression
- ☐ Kill + relaunch mid-week: v4 slot state, history, and the pending Weekly Update survive (durable persistence).
- ☐ Delete Account wipes `hush.engine.v4` (no state leak into a fresh identity).
- ☐ Offline: prescriptions + Weekly Update still resolve from local state; no crash.
- ☐ No console errors crossing the Weekly Update / debug / session screens.

---

## Pre-merge engineering gates (already green in CI — re-confirm on the build commit)
- ☐ `tsc --noEmit` clean.
- ☐ `jest` full suite green (baseline **463** incl. 90+ v4 tests, 43-invariant runner, 24-week × all-splits sims, freeze regressions).
- ☐ `expo export --platform ios` rc=0 (Metro bundle clean).

## Go / no-go to flip the flag ON
- ☐ All §1–§8 core passes green on ≥1 real device.
- ☐ No P0/P1 defects open against the engine or Weekly Update.
- ☐ Founder sign-off on the on-device loads/reps feel across goals.
- ☐ Then: set `engine/v4/flag.ts` default ON, re-run gates, ship the next build.
