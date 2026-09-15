/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS LIFT IS IN HER WEEK — the explanation for an exercise the engine has not touched.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תמשיך ל-WHY"* — the WHY per exercise, INCLUDING one not trained yet.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────────────────────────
 * `PlanLifts` opens the reason only when a lift CHANGED:
 *
 *     onPress={() => (lift.changed && onWhy ? onWhy(id) : onForm(id))}
 *
 * A change needs two programmes to compare, so in her FIRST week nothing has changed — and the door
 * to the one thing this product claims to do differently is shut on every row she has. The screen
 * she opens with her bag on her shoulder, the first time she ever sees a Hush programme, cannot
 * answer "why am I doing this?" for a single exercise on it. She meets the engine at its most
 * assertive and least explicable.
 *
 * ── WHAT AN UNTRAINED LIFT CAN HONESTLY BE ASKED ─────────────────────────────────────────────────
 * Not "why did the load move" — nothing moved, and there is no load yet either (S-38: the opening
 * load comes from her FIRST SET, so a weight printed before it would be a number nothing measured).
 * The honest question is the one the engine actually answered when it built the week: **why is this
 * exercise here, and not another one?**
 *
 * ⚠️ AND EVERY FIELD BELOW IS A DECISION THE ENGINE MADE, READ BACK — never a claim assembled for
 * the occasion (R7: Hush never states a reason it did not measure). Nothing here is inferred about
 * the athlete, and nothing is generated:
 *
 *     muscle          `exercise.muscle` — the catalogue's, and what the volume target is keyed on
 *     alsoWorks       `indirectMusclesOf` — compounds only, the table `theVolumeAMuscleActuallyReceives` uses
 *     stance          HER mark on the body map, which is the one input she gave by hand
 *     weeklyTarget    `weeklyTargets(...)[muscle]` — the exact number the assembler dealt against
 *     setsHere        the slot's own `setCount`
 *     weeklyReceived  `weeklyEffectiveSets` — the assembler's OWN accounting, exported from it
 *     essential       `ESSENTIAL_PATTERNS[muscle]` — a pattern the muscle may not be programmed without
 *     firstTime       her saved history, asked plainly
 *
 * ── AND WHAT IT DELIBERATELY DOES NOT CARRY ──────────────────────────────────────────────────────
 * No "best exercise for", no ranking, no physiology claim. The catalogue's diversity score decides
 * WHICH lift of a muscle's pool is picked, and that score is a heuristic about coverage — stating it
 * as a reason ("we chose the incline press because it trains the clavicular head") would be the app
 * arguing on the engine's behalf about something the engine never asserted. What it asserts is the
 * muscle, the dose, and the shape; that is what this returns.
 *
 * Pure and I/O-free — it is handed the week and the history and knows nothing about storage.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseById, indirectMusclesOf, type MuscleGroup } from '@/data/exercises';
import { weeklyEffectiveSets } from '@/data/api/fixtureModel';
import { ESSENTIAL_PATTERNS, essentialPatternOf } from '@/engine/v5/programAssembly';
import { weeklyTargets } from '@/engine/v5/assembler';
import { stanceOf, type BodyMap } from '@/engine/v5/bodyMap';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import type { Session } from '@/data/local/models';

/** Everything the WHY sheet needs about a lift the engine PLACED rather than moved. */
export interface LiftPlacement {
  exerciseId: string;
  /** The muscle the week's volume target is keyed on. */
  muscle: MuscleGroup;
  /** Muscles this lift also feeds as a prime mover — empty for every isolation. */
  alsoWorks: readonly MuscleGroup[];
  /** Her own mark, and the reason the target is what it is when it says `emphasis`. */
  stance: 'emphasis' | 'normal';
  /** The muscle's weekly set target, as the assembler dealt against it. */
  weeklyTarget: number;
  /** Sets on this lift in this session. */
  setsHere: number;
  /** How many sets of this muscle the whole week carries — `setsHere` in context. */
  weeklySetsHere: number;
  /**
   * ⛔ WHAT THE ENGINE COUNTS THE MUSCLE AS RECEIVING — `weeklyEffectiveSets`, the assembler's own
   * function, and the ONLY number on this sheet that may be compared to a threshold (2026-08-18).
   *
   * `weeklySetsHere` above is a DESCRIPTION: the rows she can count on her cards. This is a
   * JUDGEMENT: direct sets plus what every compound lends the muscles it also drives, which is the
   * number `raiseToWeeklyFloor` decides against when it chooses whether to spend another minute of
   * her hour. They differ, and the difference is the whole defect this field closes — see the
   * closing line in `whyHereProps`.
   *
   * ⚠️ AND THAT IS THE LAW HERE NOW, so this cannot happen a second time: a number that is SHOWN may
   * be the prescribed count; a number that is COMPARED must come from the engine's accounting.
   */
  weeklyReceived: number;
  /**
   * The engine holds this lift to the weekly dose at all. False for supplemental work — the core
   * block `addWeeklyCore` appends outside the volume pot, which `weeklyTargets` deletes before the
   * week is dealt and which every volume rule in `domain/weekQuality` excludes. Holding it to a dose
   * nothing ever aimed at it is the same false complaint this file exists to stop making.
   */
  judgedByDose: boolean;
  /** It fills a movement the muscle may not be programmed without (`ESSENTIAL_PATTERNS`). */
  essential: boolean;
  /** She has never logged a set of it. The load line then says so instead of naming a weight. */
  firstTime: boolean;
}

/** The week as this module needs it — slots and their set counts, nothing else. */
export interface PlacementWeek {
  days: { isRest?: boolean; slots: { exerciseId: string; setCount: number; supplemental?: boolean }[] }[];
}

/**
 * Why `exerciseId` is in this week. `null` when the lift is not in it — a caller asking about a
 * lift she is not prescribed has no question this can answer, and inventing one would be worse
 * than the silence.
 */
export function liftPlacement(
  exerciseId: string,
  week: PlacementWeek | null | undefined,
  bodyMap: BodyMap | undefined,
  daysPerWeek: number | undefined,
  history: readonly Session[] = [],
): LiftPlacement | null {
  const ex = exerciseById(exerciseId);
  if (!ex) return null;

  const workouts = (week?.days ?? []).filter((d) => !d.isRest);
  const mine = workouts.flatMap((d) => d.slots).filter((s) => s.exerciseId === exerciseId);
  if (mine.length === 0) return null;

  /*
   * ⚠️ THE WEEKLY FIGURE COUNTS EVERY OCCURRENCE, and `setsHere` counts one. A lift she performs on
   * two days is two rows on two cards, and a sheet that answered "12 sets a week" beside a row
   * showing 4 would read as an error rather than as context — so both numbers are stated and the
   * screen says which is which.
   */
  const setsHere = mine[0].setCount;
  const weeklySetsHere = workouts
    .flatMap((d) => d.slots)
    .filter((s) => exerciseById(s.exerciseId)?.muscle === ex.muscle)
    .reduce((n, s) => n + s.setCount, 0);

  /*
   * ⛔ AND WHAT THE ENGINE COUNTS HER AS RECEIVING — ITS FUNCTION, NOT A SECOND OPINION (2026-08-18).
   *
   * The count above was the sheet's only weekly number and it was being held against
   * `WEEKLY_SETS_FLOOR`. The engine does not judge a muscle that way: `raiseToWeeklyFloor` counts
   * direct sets PLUS `INDIRECT_SHARE` of every compound that also drives the muscle, and skips
   * supplemental work. So a woman with 4 direct biceps sets and 3.5 more from her rows was told
   * *"6 sets a week is the least that grows a muscle. This one has 4, and your hour is why"* — about
   * a shortfall the engine had already decided did not exist, and would never have raised however
   * many times her week was rebuilt.
   *
   * `weeklyEffectiveSets` is that pass's own function, exported rather than copied — a copy is how
   * the two accountings came apart in the first place.
   */
  const received = weeklyEffectiveSets(workouts);

  /*
   * ⚠️ THE TARGET IS RE-ASKED, NOT STORED. `weeklyTargets` is pure and cheap, and it is the single
   * function the assembler itself dealt against — so the number on this sheet cannot drift from the
   * number that built the week. A copy stamped into the programme could, the first time her body
   * map changed and the week had not yet been rebuilt.
   */
  const targets = weeklyTargets(bodyMap, CANONICAL_MUSCLE_ORDER, daysPerWeek);

  const essentials = ESSENTIAL_PATTERNS[ex.muscle];
  return {
    exerciseId,
    muscle: ex.muscle,
    alsoWorks: indirectMusclesOf(exerciseId),
    stance: stanceOf(bodyMap, ex.muscle) === 'emphasis' ? 'emphasis' : 'normal',
    weeklyTarget: targets[ex.muscle] ?? 0,
    setsHere,
    weeklySetsHere,
    weeklyReceived: received[ex.muscle] ?? 0,
    judgedByDose: !mine[0].supplemental,
    essential: !!essentials?.includes(essentialPatternOf(ex.pattern)),
    firstTime: !history.some((s) => s.sets.some((x) => x.exerciseId === exerciseId)),
  };
}
