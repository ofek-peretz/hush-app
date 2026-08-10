/**
 * Hush Engine v5 â€” the assembler core (Stage 4). The programme is GENERATED from her body map, days,
 * and volume â€” never chosen from a demographic shelf (MEN_SPLITS/WOMEN_SPLITS are deleted).
 *
 * This module owns the volumeâ†’structure decision: how many weekly sets each muscle gets (from the
 * map), and how those sets shape the week's days by region. Session STRUCTURE is an output of volume
 * allocation, never an input â€” mark Glutes+Quads and a 3-day week yields two lower days, because the
 * volume has to go somewhere (register Part 3). Exercise selection / ordering / station clustering /
 * the time cap remain the integration layer's job (reused from the existing generator).
 *
 * Pure. Deterministic.
 */

import { STARTING_WEEKLY_SETS, startingWeeklySets, emphasisBonusFor, FULL_BODY_UNTIL_DAYS, MUSCLE_REGION, WEEKLY_SETS_FLOOR, EMPHASIS_FRACTION } from './constants';
import { exerciseCountFor, DAY_ONE_EX_DIVISOR } from './programAssembly';
import { stanceOf, trainableMuscles, emphasisMuscles, type BodyMap } from './bodyMap';

/** Region of a muscle (upper/lower); unknown â†’ upper (safe default, never its own day). */
export function regionOf(muscle: string): 'upper' | 'lower' {
  return MUSCLE_REGION[muscle] ?? 'upper';
}

/**
 * Starting weekly set target per trainable muscle (B-2). Off muscles are absent; emphasised muscles
 * start with the bonus (their first claim on volume, S-4). Earned/cut volume (Loop 3) overwrites
 * these within a few weeks â€” this is only the day-one shape.
 */
export function weeklyTargets(
  map: BodyMap | undefined,
  allMuscles: readonly string[],
  /** How many days a week she trains. Frequency is what BUYS recoverable volume, so it sets it â€”
   *  see `startingWeeklySets`. Omitted (older callers, tests of the map itself) â†’ the flat B-2 base,
   *  which is what this function returned for every frequency before 2026-08-08. */
  days?: number,
): Record<string, number> {
  // Core is supplemental, so it is not one of the muscles the week's work spreads over.
  const trainable = trainableMuscles(map, allMuscles).filter((m) => m !== 'Core');
  const out: Record<string, number> = {};
  for (const m of trainableMuscles(map, allMuscles)) {
    // Each muscle draws its OWN share of the week's pot (MUSCLE_VOLUME_SHARE) — a back is not a calf.
    out[m] = days == null ? STARTING_WEEKLY_SETS.base : startingWeeklySets(days, trainable.length, m, trainable);
  }

  /*
   * ⛔ AN EMPHASIS MARK MOVES VOLUME. IT DOES NOT ADD IT (founder 2026-08-10).
   *
   * It used to ADD `emphasisBonusFor(base)` and leave every other muscle alone, so a mark she placed
   * in one tap grew the week's total. That total is not hers to grow — her hour is fixed — so the
   * extra work never reached her: `enforceTimeCap` cut it back out on the way to the screen, and
   * WHICH sets it cut was an accident of the trim. Measured, at the 60-minute default:
   *
   *     Shoulders   plain 9 sets / 3 exercises      emphasis 9 sets / 2 exercises
   *
   * The mark had inflated the target from 23 weekly sets to 37 — above `WEEKLY_SETS_CEILING`, a
   * number nobody trains — which asked for SEVEN shoulder exercises, filled them with compounds, and
   * left the cap to hack it back to two. Her instruction was neutralised to the set, and Chest and
   * Back each paid a set for it.
   *
   * Under a fixed hour, *"lead with this"* can only mean *"at the expense of something else"*. Four
   * days of sixty minutes is about eighty weekly sets; across nine muscles that is nine each, and no
   * arrangement of the hour changes it. Anything but a transfer is a promise the clock breaks.
   *
   * ── ⛔ AND THE UNIT IS AN EXERCISE, NOT A SET. THIS IS THE WHOLE FIX. ────────────────────────
   * The first attempt moved SETS and conserved them exactly — and still broke, because
   * `exerciseCountFor` ROUNDS sets into lifts. Four donors each giving two sets lose no exercise
   * between them while the marked muscle's gain crosses a rounding boundary and buys one, so the
   * week came out a lift heavier than it started. On a three-day full-body week there is nowhere to
   * put that lift: six sessions landed at ~69 minutes against a 60-minute ceiling, on days the time
   * cap is forbidden to trim (every lift at the three-set floor, every one its muscle's only lift).
   *
   * Moving whole `DAY_ONE_EX_DIVISOR`-sized blocks makes the rounding irrelevant: five sets out of
   * one muscle is exactly one lift out, five in is exactly one lift in. Sets AND lifts are conserved
   * by construction rather than by a correction pass — and the correction pass is what broke the
   * back's two pulls when I tried it, because it shaved donors one set at a time until a muscle fell
   * off a boundary nobody was watching.
   *
   * ⚠️ A DONOR KEEPS ITS FLOOR AND ITS SECOND LIFT. Below `WEEKLY_SETS_FLOOR` is under MEV, and below
   * two exercises a muscle that needs two PATTERNS — a back needs a row and a pulldown (S-55b) —
   * cannot have both. A mark redistributes training; it does not switch a muscle off or strip it of
   * a movement. `off` is the control that does that, and she has it.
   */
  const marked = trainable.filter((m) => stanceOf(map, m) === 'emphasis');
  const donors = trainable.filter((m) => stanceOf(map, m) !== 'emphasis');
  if (days != null && marked.length > 0 && donors.length > 0) {
    for (const m of marked) {
      /* How many LIFTS the mark is worth — the same proportional weight, counted in the right unit. */
      const chunks = Math.max(1, Math.round(exerciseCountFor(out[m]) * EMPHASIS_FRACTION));
      for (let c = 0; c < chunks; c += 1) {
        const donor = donors
          .filter((d) => out[d] - DAY_ONE_EX_DIVISOR >= WEEKLY_SETS_FLOOR
            && exerciseCountFor(out[d] - DAY_ONE_EX_DIVISOR) >= 2)
          .sort((a, b) => (out[b] - out[a]) || a.localeCompare(b))[0];
        if (!donor) break; // nothing left to give without going under a floor — a smaller mark, not a hole
        out[donor] -= DAY_ONE_EX_DIVISOR;
        out[m] += DAY_ONE_EX_DIVISOR;
      }
    }
  }
  return out;
}

/**
 * Total weekly sets per region, from the per-muscle targets. Core is EXCLUDED â€” it is a supplemental
 * finisher trained across days (never its own session), so it does not shape the upper/lower split.
 */
export function regionVolume(targets: Record<string, number>): { upper: number; lower: number } {
  let upper = 0;
  let lower = 0;
  for (const [m, sets] of Object.entries(targets)) {
    if (m === 'Core') continue;
    if (regionOf(m) === 'lower') lower += sets;
    else upper += sets;
  }
  return { upper, lower };
}

/**
 * How the week's `days` split into upper/lower sessions â€” proportional to region volume, so the
 * SHAPE follows the map. Each side gets at least one day when it has any volume; the remainder is
 * apportioned by volume, ties to upper (the canonical lead). This is what makes "emphasise glutes +
 * quads on 3 days â†’ two lower days" fall out automatically, with no split chosen from a shelf.
 */
export function assignRegionDays(targets: Record<string, number>, days: number): ('upper' | 'lower' | 'full')[] {
  const { upper, lower } = regionVolume(targets);
  if (days <= 0) return [];
  /*
   * ════ AT LOW FREQUENCY, SPLITTING THE BODY COSTS HER THE FREQUENCY (founder 2026-08-09) ════
   *
   * Measured before this existed: at TWO days every muscle was trained ONCE a week, and at three the
   * whole lower body was trained once. Splitting upper from lower divides the week's sessions among
   * the regions, so two days means one upper and one lower — and one session a week is the dose the
   * evidence is clearest about, because twice a week grows roughly 63% more at equal volume.
   *
   * The split is worth its cost only once there are enough days to give both halves two sessions
   * each. Below that, every day trains the whole body, which is what any coach writes for a two- or
   * three-day athlete and for the same reason: the compounds cover several muscles at once and the
   * frequency is what is scarce.
   *
   * ⛔ This is a structural choice made from her DAYS, which is a fact she gave us — not from sex,
   * not from a shelf, and not from a self-report. Structure is still an output (Part 3); this simply
   * recognises that below four days the volume cannot shape a split worth having.
   */
  if (days <= FULL_BODY_UNTIL_DAYS && upper > 0 && lower > 0) return Array(days).fill('full');
  if (upper === 0) return Array(days).fill('lower');
  if (lower === 0) return Array(days).fill('upper');

  // Largest-remainder apportionment of `days` between upper and lower by volume, each â‰¥ 1.
  const total = upper + lower;
  let lowerDays = Math.round((lower / total) * days);
  lowerDays = Math.max(1, Math.min(days - 1, lowerDays)); // both sides get at least one day
  const upperDays = days - lowerDays;

  // Interleave so sessions alternate where possible (upper leads â€” the canonical order).
  const out: ('upper' | 'lower')[] = [];
  let u = upperDays;
  let l = lowerDays;
  while (u + l > 0) {
    if (u >= l && u > 0) { out.push('upper'); u--; }
    else if (l > 0) { out.push('lower'); l--; }
    else if (u > 0) { out.push('upper'); u--; }
  }
  return out;
}

/** True when she has emphasised any muscle â€” the map is doing real work (for tests / narration). */
export function hasEmphasis(map: BodyMap | undefined, allMuscles: readonly string[]): boolean {
  return emphasisMuscles(map, allMuscles).length > 0;
}
