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
import { exerciseById, exercisesForMuscle, isSwapOnly, muscleOf, type Exercise, type MuscleGroup } from '@/data/exercises';
// S-55b — the one physical question ("can this equipment hold her load?"), asked by BOTH selectors:
// this assembler and Loop 2's rotation resolver (domain/engineChanges). One home, no second copy.
import { canLoad, type LoadProfile } from '@/domain/startingLoad';

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
  profile?: LoadProfile,
): string[] {
  const all = exercisesForMuscle(muscle as MuscleGroup).filter((e) => !isSwapOnly(e.id));
  // Lifts whose floor she can actually load lead; the rest stay available behind them, so a muscle
  // is never emptied by the check — a pool of only-too-heavy lifts still yields its catalogue lead.
  const fits = all.filter((e) => canLoad(e, profile));
  const pool = fits.length > 0 ? fits : all;
  if (pool.length === 0) return [];
  const wanted = Math.max(1, count);

  // The ANCHOR leads the muscle (S-35: the compound keeps the fullest set scheme; S-71: a leave-it is
  // guaranteed + first). A pinned leave-it wins the seat; otherwise the leading compound in catalog
  // order. Catalog order is the stable tie-break throughout (the pool is already in it).
  // The ANCHOR is the lift the engine will STEER, so it prefers one it can steer. A bodyweight lift
  // has no load axis at all (S-51 — Loop 1 has nothing to correct), so it never takes the seat over a
  // loadable compound; behind that seat it stands exactly where the catalogue puts it. This is not a
  // ranking of exercises — a pull-up is not a lesser lift — it is a statement about which lift the
  // correction loops can actually act on.
  const rank = (e: Exercise) => (e.tier === 'compound' ? 0 : 2) + (e.bodyweight ? 1 : 0);
  const compoundFirst = [...pool].sort((a, b) => rank(a) - rank(b));
  const anchor = (leaveIt ? pool.find((e) => e.id === leaveIt) : undefined) ?? compoundFirst[0];

  // Each FURTHER slot maximises STIMULUS DIVERSITY against what is already chosen — a different
  // movement pattern first (the point), a different equipment family second (a byproduct, not chased
  // for its own sake), and the ISOLATION contrast to the compound anchor last: a compound + a
  // stretch/isolation beats two overlapping compounds fighting the same failure point (S-77, founder
  // 2026-07-25). Greedy + deterministic — ties fall to catalog order via the strict `>`.
  const chosen = [anchor];
  const remaining = pool.filter((e) => e.id !== anchor.id);
  while (chosen.length < wanted && remaining.length > 0) {
    const patterns = new Set(chosen.map((e) => e.pattern));
    const equips = new Set(chosen.map((e) => e.equipment));
    let best = remaining[0];
    let bestScore = -Infinity;
    for (const c of remaining) {
      const score = (patterns.has(c.pattern) ? 0 : 4) + (equips.has(c.equipment) ? 0 : 2) + (c.tier === 'isolation' ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    chosen.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }

  const out: string[] = [];
  for (const e of chosen) {
    const finalId = resolveChain(e.id, substitutes);
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
/**
 * ════ THE ORDER YOU WALK (founder 2026-07-27) ════
 *
 * "Don't leave a station until you're done with it — but always a compound of the muscle first, and
 * don't make the whole workout one station."
 *
 * Before this, a day was ordered by muscle alone, so Upper A read: barbell, barbell, CABLE, barbell,
 * barbell — the athlete crossed the gym twice for one pushdown and came back. Lower A changed
 * station seven times in eight lifts.
 *
 * Two passes, and the training law wins both:
 *
 *   1. COMPOUNDS BEFORE ISOLATIONS. Non-negotiable, and it is the ordering every serious programme
 *      already uses: the heavy work happens on a fresh nervous system, the small work fills in after.
 *   2. INSIDE each pass, keep a station together. The first lift of a pass is the one catalogue order
 *      already chose; from there, whenever the next lift could equally be any of several, take the
 *      one on the equipment already in hand.
 *
 * So the order never trades a compound for a shorter walk — it only spends the freedom it already
 * had. Deterministic: ties fall to the incoming order, which is catalogue order.
 */
export function orderWithinDay(ids: string[]): string[] {
  const compounds = ids.filter((id) => exerciseById(id)?.tier === 'compound');
  const isolations = ids.filter((id) => exerciseById(id)?.tier !== 'compound');

  const out: string[] = [];
  // The station carries ACROSS the two passes: the isolations begin wherever the compounds left the
  // athlete standing, so the last heavy lift and the first light one share a rack whenever they can.
  const drain = (group: string[]) => {
    const left = [...group];
    while (left.length > 0) {
      const at = out.length > 0 ? exerciseById(out[out.length - 1])?.equipment : undefined;
      const here = at ? left.findIndex((id) => exerciseById(id)?.equipment === at) : -1;
      out.push(left.splice(here >= 0 ? here : 0, 1)[0]);
    }
  };
  drain(compounds);
  drain(isolations);
  return out;
}

export function assembleV5DayLists(
  map: BodyMap | undefined,
  days: number,
  leaveItsByMuscle: Record<string, string> = {},
  substitutes: Record<string, string> = {},
  volumeByMuscle: Record<string, number> = {},
  /** Her sex + bodyweight — read ONLY to ask whether a lift's floor is loadable for her (S-55b). */
  profile?: LoadProfile,
): DayList[] {
  // `days` is passed so the weekly pot follows her frequency (B-2, 2026-08-08). Without it every
  // frequency drew the same 10 sets a muscle and the extra days were empty calories.
  const targets = weeklyTargets(map, CANONICAL_MUSCLE_ORDER, days); // off muscles absent (S-2)
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
        const picked = pickExercises(m, dist.length, leaveItsByMuscle[m], substitutes, profile);
        picked.forEach((id, i) => { if (i < dist.length) setCounts[id] = dist[i]; });
        picks.push(...picked);
      } else {
        picks.push(...pickExercises(m, exerciseCountFor(targets[m]), leaveItsByMuscle[m], substitutes, profile));
      }
    }

    /* ════ THE SPREAD DEALS COMPOUNDS FIRST (founder 2026-07-27) ════
     *
     * `picks` arrives muscle by muscle, each muscle's compound leading. A flat `k % len` therefore
     * dealt EVERY muscle's leading compound to the same day: Upper A came out four-fifths barbell
     * and Upper B came out one compound and four isolations — a heavy day and a scraps day, not two
     * sessions. Nobody chose that; it fell out of the arithmetic.
     *
     * Dealing the compounds round-robin FIRST and the isolations round-robin after gives every day
     * its share of the real work, and breaks the accidental single-equipment session on the way.
     * Still deterministic, still catalogue-ordered inside each pass.
     */
    const compounds = picks.filter((id) => exerciseById(id)?.tier === 'compound');
    const isolations = picks.filter((id) => exerciseById(id)?.tier !== 'compound');
    compounds.forEach((exId, k) => dayExercises[regionIdxs[k % regionIdxs.length]].push(exId));
    isolations.forEach((exId, k) => dayExercises[regionIdxs[k % regionIdxs.length]].push(exId));
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

  return dayExercises.map((exerciseIds, i) => ({
    name: names[i],
    region: regionDays[i],
    exerciseIds: orderWithinDay(exerciseIds),
    setCounts,
  }));
}
