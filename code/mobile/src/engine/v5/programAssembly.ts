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
import { CANONICAL_MUSCLE_ORDER, SETS_MIN, SETS_MAX } from './constants';
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
  /** Per-exercise set count when Loop 3 has LEARNED this muscle's volume (distributeMuscleSets). Absent
   *  entries fall back to the day-one `setsFor`, so a muscle still on its day-one shape is untouched. */
  setCounts: Record<string, number>;
}

/** How many exercises a muscle gets on day one, from its starting weekly-set target (min 1, S-63). */
export function exerciseCountFor(weeklySets: number): number {
  return Math.max(1, Math.round(weeklySets / DAY_ONE_EX_DIVISOR));
}

/**
 * Distribute a muscle's LEARNED per-occurrence set target (Loop 3, S-32/S-34) across its exercises —
 * the physical answer to "where the earned set goes" (register Part 4 §E). Each exercise holds
 * SETS_MIN…SETS_MAX sets (F-1, [3,5]); when the target exceeds what the current exercises can hold, the
 * next set OPENS A NEW EXERCISE (S-32), and when cutting would shave an exercise below the floor, one is
 * DROPPED rather than starved (S-35 — "3×4 beats 2×5"). Returns the per-exercise set counts in
 * assembly order, LARGEST FIRST, so the compound (which leads assembly) keeps the fullest scheme
 * (S-35 — a compound is never sacrificed before an isolation). Pure, deterministic.
 *
 * At the day-one seed (target = Σ of her exercises' `setsFor`) this reproduces the existing shape: a
 * Chest of bench(4)+fly(3) → target 7 → [4, 3], the compound leading. There is NO new constant — only
 * F-1's [3,5] and the "~4 sets/exercise" lean that `setsFor` itself already expresses.
 *
 * `maxExercises` caps the exercise COUNT at what her pool actually holds: a small-pool muscle (triceps,
 * calves) cannot open a third exercise it does not have, so the earned sets pile onto the existing ones
 * up to the [3,5] ceiling instead — which keeps realized volume MONOTONIC as the target grows (without
 * the cap, proposing a phantom third exercise would silently steal sets from the real two). Once every
 * available exercise is at 5, the target is physically full and further growth simply does not fit.
 */
export function distributeMuscleSets(target: number, maxExercises = Infinity): number[] {
  const t = Math.max(SETS_MIN, Math.round(target)); // never below one exercise at the floor (S-35)
  const minCount = Math.ceil(t / SETS_MAX); // each ≤ 5
  const maxCount = Math.max(1, Math.floor(t / SETS_MIN)); // each ≥ 3
  // Aim for ~4 working sets per exercise (the setsFor lean), clamped so every bucket lands in [3,5],
  // then capped at the exercises she actually has (a phantom exercise would steal the real ones' sets).
  let count = Math.max(1, Math.min(Math.max(Math.round(t / 4), minCount), maxCount));
  count = Math.min(count, Math.max(1, Math.floor(maxExercises)));
  const base = Math.floor(t / count);
  let remainder = t - base * count; // spread the leftover onto the FIRST buckets → largest first
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    out.push(Math.min(SETS_MAX, Math.max(SETS_MIN, base + extra))); // excess beyond 5×count cannot fit
  }
  return out;
}

/**
 * Deterministic exercise pick for a muscle: a LEAVE-IT first (guaranteed + leading, S-71), then
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
  leaveIt?: string,
  substitutes: Record<string, string> = {},
): string[] {
  const pool = exercisesForMuscle(muscle as MuscleGroup).filter((e) => !isSwapOnly(e.id));
  const ordered = [...pool].sort((a, b) => (a.tier === 'compound' ? 0 : 1) - (b.tier === 'compound' ? 0 : 1));
  let ids = ordered.map((e) => e.id);
  if (leaveIt && ids.includes(leaveIt)) ids = [leaveIt, ...ids.filter((id) => id !== leaveIt)];
  const picked = ids.slice(0, Math.max(1, count));
  const out: string[] = [];
  for (const id of picked) {
    const finalId = resolveChain(id, substitutes);
    if (!out.includes(finalId)) out.push(finalId);
  }
  return out;
}

/**
 * Follow a substitute chain to the lift that currently stands for an anchor: anchor → … → current.
 * SAME-MUSCLE at every hop (a corrupt / cross-muscle entry stops the walk and never moves a lift into
 * the wrong day), with a cycle guard. A single substitute is just a chain of length one. Chains arise
 * when a learned swap later graduates or rotates — e.g. a swapped-in `knee_push_up` graduating to
 * `push_up` (S-52) leaves `bench → knee_push_up → push_up`.
 */
function resolveChain(id: string, substitutes: Record<string, string>): string {
  const muscle = muscleOf(id);
  const seen = new Set<string>([id]);
  let cur = id;
  while (substitutes[cur]) {
    const next = substitutes[cur];
    if (seen.has(next) || muscleOf(next) !== muscle) break; // cycle, or cross-muscle → stop the walk
    seen.add(next);
    cur = next;
  }
  return cur;
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
  leaveItsByMuscle: Record<string, string> = {},
  substitutes: Record<string, string> = {},
  volumeByMuscle: Record<string, number> = {},
): DayList[] {
  const targets = weeklyTargets(map, CANONICAL_MUSCLE_ORDER); // off muscles absent (S-2)
  delete targets['Core']; // supplemental — never its own structural day
  const trainable = Object.keys(targets);
  if (trainable.length === 0 || days <= 0) return []; // S-3

  const regionDays = assignRegionDays(targets, days); // ['upper'|'lower'] × days; ≥1 day per region w/ volume
  const names = nameDays(regionDays);
  const dayExercises: string[][] = Array.from({ length: days }, () => []);
  const setCounts: Record<string, number> = {}; // exerciseId → learned per-occurrence sets (Loop 3)

  for (const region of ['upper', 'lower'] as const) {
    const regionIdxs = regionDays.map((r, i) => (r === region ? i : -1)).filter((i) => i >= 0);
    if (regionIdxs.length === 0) continue;
    const muscles = trainable
      .filter((m) => regionOf(m) === region)
      .sort((a, b) => CANONICAL_MUSCLE_ORDER.indexOf(a) - CANONICAL_MUSCLE_ORDER.indexOf(b)); // F-9 determinism

    // Every exercise this region trains, muscle by muscle (compound-led within a muscle). When Loop 3
    // has LEARNED this muscle's volume, its exercise COUNT follows the learned target (a grown muscle
    // opens a new exercise, a trimmed one drops back), and each exercise's set count is the learned
    // distribution (largest first → the compound keeps the fullest scheme). Otherwise the day-one
    // density (exerciseCountFor) and setsFor stand — byte-identical to before Loop 3 has any data.
    const picks: string[] = [];
    for (const m of muscles) {
      const learned = volumeByMuscle[m];
      if (learned != null) {
        // Cap the exercise count at her actual pool so the target lands on real lifts, not a phantom
        // one (which would steal sets and make realized volume non-monotonic as the target grows).
        const poolSize = pickExercises(m, Number.MAX_SAFE_INTEGER, leaveItsByMuscle[m], substitutes).length;
        const dist = distributeMuscleSets(learned, poolSize);
        const picked = pickExercises(m, dist.length, leaveItsByMuscle[m], substitutes);
        picked.forEach((id, i) => { if (i < dist.length) setCounts[id] = dist[i]; });
        picks.push(...picked);
      } else {
        picks.push(...pickExercises(m, exerciseCountFor(targets[m]), leaveItsByMuscle[m], substitutes));
      }
    }

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

  return dayExercises.map((exerciseIds, i) => ({ name: names[i], region: regionDays[i], exerciseIds, setCounts }));
}
