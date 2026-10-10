# Build 22 — Release Notes

**iOS buildNumber:** 22 (up from 21)
**Branch:** `feat/live-activity-approved-design`
**Bump commit:** `c180900`
**EAS build ID:** `7390e769-2a0f-40c6-8133-994fa05e5993`

Validation: tsc clean · jest 538/538 · lint:copy pass · lint:rtl pass · expo export (iOS) clean.

## Scope (authorized)

**S2 — Rest matches the work.** Compound sets rest 150s, isolation 75s, transitions
120s (was a flat 90s everywhere). One source of truth feeds phone, watch/Live
Activity mirror, and the standalone plan snapshot.

**S3 — Phone resume matches the watch's standard.** Every live state change now
persists a resume snapshot. A fresh (<3h) interruption is restored exactly —
rests catch up to wall-clock, partial rests resume with true remaining time,
pauses un-freeze at the pause instant, and a logged set is never re-presented.
Home offers "Continue {workout}" as the primary action. Older/finished sessions
still fall back to the existing salvage path.

**S4 — One-tap swap: Hush decides, the athlete vetoes.** Tapping Swap replaces
the exercise immediately — no list, no mid-workout comparison. Decision order:
athlete's saved substitute → their equipment-busy backup → catalog default
(different equipment family first) → similar-effect candidates. Toast offers
"Another option" (walks the ladder) and "Undo." The swapped-in exercise adopts
its own prescription, so a load never rides onto the wrong exercise's numbers
across a swap.

**S6 — Bodyweight lifts graduate instead of dead-ending.** A bodyweight lift
held at the top of its rep range for the stall window swaps to a harder catalog
variation (knee push-up → push-up → dip; chin-up → pull-up), explained in the
Weekly Update. Locked exercises never graduate. Bodyweight slots no longer enter
load calibration (which could never resolve for a rep-only lift).

**Performed-load anchor.** Weekly engine decisions (calibration, load/rep
progression, patient probe, rails) now step from the load the athlete actually
lifted, not the prescription, when the two differ — capped at 2x upward to
bound a mis-entry.

**Sparse-grid fix.** `normalizeLoad` only snaps down to a learned rung within a
2.5kg tolerance, so a sparse equipment grid (e.g. {50, 90}) no longer drags
every in-between ideal load down to the low rung and freezes progression.

**Absence path.** Returning after a gap now reads real wall-clock days-since-
last-session and eases the prescription once per gap, with an explanation
surfaced to the athlete — decoupled from week rollover, which an absent
athlete never reaches.

**Honest edit wheel.** Load-edit wheel now offers 0.5kg / 1lb detents so real
equipment (14/16kg dumbbells, 1kg-rounded seeds) actually sits on the wheel.

**Catalog fixes.** Added Ab Crunch Machine and Knee Push-Up (swap-only);
hanging leg raise and ab wheel became swap-only; Good Morning removed.

**M4 / M5 / F4-F6 — program redesign (complement, not replay).** Added training
days now complement the existing week instead of repeating it:
- M4's 4th day was Upper A verbatim → new Upper B (incline press, cable row, DB
  shoulder press, rear-delt fly, hammer curl, OH triceps extension) with zero
  lift overlap.
- M5's Pull B cable row was the week's third row → replaced with preacher curl,
  giving the 5-day athlete a real second arms slot.
- Women's Legs A (F4+) was half of Lower A re-run → new day built around glute
  bridge, DB RDL, hack squat, cable kickback, hip abduction, standing calf.
  Lower A vs Legs A overlap drops from 0.50 to 0.09.

**Time-cap trim-order fix.** When a day exceeds the time budget, isolation work
is trimmed before compound work (was the reverse) — compound lifts are never
sacrificed to make room.

## Riders (already on the branch, not in the itemized scope list)

These ship in Build 22 because they sit on the same branch tip; flagged and
confirmed for inclusion before cutting the build.

- **Week-cadence fix.** The workouts screen previously never rolled to a new
  training week (`weeklyRest()` was hardcoded `false` in the fixture model,
  freezing the bucket forever). Now calendar-primary: the bucket turns over at
  Sunday 04:00 local regardless of completion; finishing early holds Recovery;
  missed workouts don't carry over.
- **Live Activity widget wiring.** The approved stage/ochre Live Activity design
  (workout legend, load display, paused/transition states, cardio) is now wired
  into the widget target that actually ships (`targets/widget`), replacing a
  placeholder black/white UI. This is this design's first real compile —
  Swift build success and on-device rendering are unverified until this build
  is validated on a device.

## Excluded from this build

S1 warm-ups, seed loadability, F1 (1-day female adjustment), M1 (1-day male
adjustment).

## Device testing checklist

- [ ] Rest timers: confirm 150s/75s/120s split shows correctly for compound vs.
      isolation vs. transition rests.
- [ ] Kill the app mid-set, mid-rest, and mid-pause; relaunch within 3h and
      confirm exact resume (no re-presented set, correct remaining rest).
- [ ] One-tap swap: confirm no list appears, "Another option" walks the ladder,
      "Undo" restores the original, and loads don't bleed across the swap.
- [ ] Run a bodyweight lift to its rep-range top across the stall window and
      confirm graduation + Weekly Update explanation.
- [ ] Verify Live Activity on lock screen/Dynamic Island for both a strength
      and a cardio session (this is the first build where the real widget
      target ships the approved design).
- [ ] Let a week lapse (or adjust device clock) and confirm the bucket rolls
      over at Sunday 04:00 without requiring workout completion.
