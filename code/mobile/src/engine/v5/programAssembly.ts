/**
 * Hush Engine v5 · Revision 7 — map-driven programme assembly (register Part 3). PURE.
 *
 * Turns the body map into the WEEK'S SHAPE: which region each day trains, and which exercises fill it,
 * from the athlete's declared muscles + emphasis. It REPLACES MEN_SPLITS / WOMEN_SPLITS — the
 * programme is generated, never chosen from a demographic shelf. Structure is an OUTPUT of volume
 * (Part 3): mark Glutes + Quads on 3 days and two lower days fall out, because the volume has to go
 * somewhere. An `off` muscle never appears (S-2); everything off yields no workout (S-3).
 *
 * It produces only the day NAME + exercise-id LIST per day; the existing generator
 * (dayFromBlueprint → orderForFlow / set counts / engine slot ids, then addWeeklyCore + enforceTimeCap)
 * builds each day from that list, so the ordering / clustering / time-cap laws are shared verbatim.
 *
 * DAY-ONE DENSITY is the one number the register leaves to this layer — structure is an output, but the
 * sets→exercises granularity is ours. `DAY_ONE_EX_DIVISOR` turns a muscle's starting weekly-set target
 * (B-2: 10 normal, 16 emphasis) into an exercise COUNT; Loop 3 refines volume from there (S-32/34). It
 * is named and tunable, not doctrine.
 */
import { weeklyTargets, assignRegionDays, regionOf } from './assembler';
import type { BodyMap } from './bodyMap';
import { CANONICAL_MUSCLE_ORDER } from './constants';
import { exercisesForMuscle, isSwapOnly, muscleOf, type MuscleGroup } from '@/data/exercises';

/**
 * A muscle's starting weekly-set target (B-2) divided by this → its day-one exercise COUNT (min 1). At
 * 10 normal / 16 emphasis this yields 2 exercises for a normal muscle and 3 for an emphasised one — a
 * standard day-one shape. Loop 3 grows or trims volume from there. Tunable (founder), not doctrine.
 */
export const DAY_ONE_EX_DIVISOR = 5;

export interface DayList {
  name: string;
  region: 'upper' | 'lower';
  exerciseIds: string[];
}

/** How many exercises a muscle gets on day one, from its starting weekly-set target (min 1, S-63). */
export function exerciseCountFor(weeklySets: number): number {
  return Math.max(1, Math.round(weeklySets / DAY_ONE_EX_DIVISOR));
}

/**
 * Deterministic exercise pick for a muscle: a pinned lift first (guaranteed + leading), then
 * compound-before-isolation, then catalogue order. Swap-only advanced movements (S-61 — hanging leg
 * raise, ab wheel) are never GENERATED: anyone may swap into them, but a day-one athlete is not
 * assigned a lift that needs strength she has not shown. Sliced to `count`.
 *
 * A standing `substitutes` map (a learned adoption, S-69, or a manual edit-swap) then replaces an
 * anchor with its chosen lift — but ONLY when the substitute trains the SAME muscle, so a corrupt or
 * cross-muscle entry can never move a lift into the wrong muscle's day. Duplicates are dropped (the
 * muscle simply gets one fewer that occurrence; Loop 3 refines volume).
 */
export function pickExercises(
  muscle: string,
  count: number,
  pinned?: string,
  substitutes: Record<string, string> = {},
): string[] {
  const pool = exercisesForMuscle(muscle as MuscleGroup).filter((e) => !isSwapOnly(e.id));
  const ordered = [...pool].sort((a, b) => (a.tier === 'compound' ? 0 : 1) - (b.tier === 'compound' ? 0 : 1));
  let ids = ordered.map((e) => e.id);
  if (pinned && ids.includes(pinned)) ids = [pinned, ...ids.filter((id) => id !== pinned)];
  const picked = ids.slice(0, Math.max(1, count));
  const out: string[] = [];
  for (const id of picked) {
    const sub = substitutes[id];
    const finalId = sub && sub !== id && muscleOf(sub) === muscleOf(id) ? sub : id;
    if (!out.includes(finalId)) out.push(finalId);
  }
  return out;
}

/** Name a region's days A, B, C… in the order they fall across the week. */
function nameDays(regionDays: ('upper' | 'lower')[]): string[] {
  const seen: Record<string, number> = { upper: 0, lower: 0 };
  return regionDays.map((r) => {
    const letter = String.fromCharCode(65 + seen[r]); // A, B, C…
    seen[r] += 1;
    return `${r === 'upper' ? 'Upper' : 'Lower'} ${letter}`;
  });
}

/**
 * Assemble the week's day exercise-lists from the body map. Returns [] when nothing is trainable (S-3:
 * the caller says "turn something on"; it never invents a muscle). Core is excluded here — it is a
 * supplemental finisher added downstream (addWeeklyCore), never a structural muscle (S-50 volume still
 * flows to it through that path).
 */
export function assembleV5DayLists(
  map: BodyMap | undefined,
  days: number,
  pinsByMuscle: Record<string, string> = {},
  substitutes: Record<string, string> = {},
): DayList[] {
  const targets = weeklyTargets(map, CANONICAL_MUSCLE_ORDER); // off muscles absent (S-2)
  delete targets['Core']; // supplemental — never its own structural day
  const trainable = Object.keys(targets);
  if (trainable.length === 0 || days <= 0) return []; // S-3

  const regionDays = assignRegionDays(targets, days); // ['upper'|'lower'] × days; ≥1 day per region w/ volume
  const names = nameDays(regionDays);
  const dayExercises: string[][] = Array.from({ length: days }, () => []);

  for (const region of ['upper', 'lower'] as const) {
    const regionIdxs = regionDays.map((r, i) => (r === region ? i : -1)).filter((i) => i >= 0);
    if (regionIdxs.length === 0) continue;
    const muscles = trainable
      .filter((m) => regionOf(m) === region)
      .sort((a, b) => CANONICAL_MUSCLE_ORDER.indexOf(a) - CANONICAL_MUSCLE_ORDER.indexOf(b)); // F-9 determinism

    // Every exercise this region trains, muscle by muscle (compound-led within a muscle).
    const picks: string[] = [];
    for (const m of muscles) picks.push(...pickExercises(m, exerciseCountFor(targets[m]), pinsByMuscle[m], substitutes));

    // Spread across the region's days: k % len puts one on each day first, then round-robins the rest —
    // so a day is a coherent session, and none is lopsided. Deterministic.
    picks.forEach((exId, k) => dayExercises[regionIdxs[k % regionIdxs.length]].push(exId));
  }

  // Hole guard: no workout may be EMPTY (a very sparse map at a high frequency — few muscles, many
  // days). An empty day borrows its region's leading lift; a repeat is legal (S-29 — a lift trained
  // twice a week builds on itself) and strictly better than an empty session. Trainable is non-empty,
  // so a donor always exists.
  for (let i = 0; i < days; i++) {
    if (dayExercises[i].length > 0) continue;
    const donor =
      dayExercises.find((d, j) => regionDays[j] === regionDays[i] && d.length > 0) ??
      dayExercises.find((d) => d.length > 0);
    if (donor && donor.length) dayExercises[i].push(donor[0]);
  }

  return dayExercises.map((exerciseIds, i) => ({ name: names[i], region: regionDays[i], exerciseIds }));
}
