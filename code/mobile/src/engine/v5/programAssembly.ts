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
import { stanceOf } from './bodyMap';
import type { BodyMap } from './bodyMap';
import { CANONICAL_MUSCLE_ORDER, SETS_MIN, SETS_MAX } from './constants';
import { exerciseById, exercisesForMuscle, isSwapOnly, muscleOf, type Exercise, type MuscleGroup, type SwapPattern } from '@/data/exercises';
// S-55b — the one physical question ("can this equipment hold her load?"), asked by BOTH selectors:
// this assembler and Loop 2's rotation resolver (domain/engineChanges). One home, no second copy.
import { canLoad, type LoadProfile } from '@/domain/startingLoad';
import { forbiddenFor } from '@/domain/painReport';

/**
 * A muscle's starting weekly-set target (B-2) divided by this → its day-one exercise COUNT (min 1). At
 * 10 normal / 16 emphasis this yields 2 exercises for a normal muscle and 3 for an emphasised one — a
 * standard day-one shape. Loop 3 grows or trims volume from there. Tunable (founder), not doctrine.
 */
export const DAY_ONE_EX_DIVISOR = 5;

/**
 * ════ PATTERNS A MUSCLE MAY NOT BE PROGRAMMED WITHOUT (founder 2026-08-08) ════
 *
 * The diversity score below rewards a NEW movement pattern (+4), which is enough to spread a muscle
 * across its shapes — and not enough to guarantee any particular one. The audit showed the cost:
 * every male programme trained Back with a Barbell Row and a Face Pull and **never once a pulldown
 * or a pull-up**. No serious coach would sign a back day with no vertical pull in it.
 *
 * It happened because catalogue order seats the row as the anchor, `pulldown` and `rear_delt` then
 * score identically as "a pattern we don't have yet", and the tie falls to catalogue order again.
 * Nothing was wrong; nothing was watching either.
 *
 * The two back patterns are not variations of each other. A row loads the lats with the humerus
 * moving horizontally and builds thickness; a pulldown loads them overhead and builds width, and the
 * research is consistent that a complete back needs both. So the pair is stated, and it outranks
 * every other diversity term rather than competing with it.
 *
 * ⛔ This is a SHORT list on purpose. It exists for pairs that are anatomically non-substitutable and
 * that a reader would notice missing — not as a place to encode preferences. A muscle whose whole
 * pool trains one shape (Biceps: every entry is a curl) has nothing to state here, and a muscle that
 * only gets ONE exercise at her frequency simply cannot cover a pair — the guard is "when there is
 * room for two, both shapes appear", never "always both".
 */
export const ESSENTIAL_PATTERNS: Record<string, readonly SwapPattern[]> = {
  Back: ['row', 'pulldown'],
  /*
   * ⛔ HAMSTRINGS, ADDED 2026-08-09 — AND THE REASON GENERALISES.
   *
   * With Back switched off, the audit read Quads 20 weekly sets against Hamstrings 7, a three-to-one
   * split between two muscles whose shares are 1.3 and 1.2. Tracing it: the targets were 29 and 27,
   * the selector picked six quad lifts and five hamstring lifts — both correct — and the time cap
   * left five quads and TWO hamstrings.
   *
   * The hamstring's five were an RDL, a deadlift, and three leg curls. Its two movements are a hip
   * HINGE, which is compound, and KNEE FLEXION, which every machine in the catalogue performs as an
   * isolation. The cap drops isolations first, so it took the knee flexion — the muscle's other
   * primary movement — while the quad, whose work is squats and presses, lost almost nothing.
   *
   * A leg curl is not an accessory to an RDL. The hamstring crosses two joints and the two movements
   * train it at different lengths; a programme with only hinges is an incomplete hamstring, exactly
   * as a back with only rows is an incomplete back. The engine was penalising a muscle for the tier
   * its catalogue entries happen to carry, which is a fact about equipment, not about training.
   */
  Hamstrings: ['hinge', 'knee_flexion'],
};

/**
 * ════ ACCESSORY PATTERNS — REAL WORK, BUT NEVER AHEAD OF THE MAIN MOVEMENT ════
 *
 * ⛔ Founder, 2026-08-09, asking for programmes he would sign as the best in the world. The block
 * was the back: at four days the assembler SELECTED six back lifts — more than any other muscle,
 * exactly as its volume share intends — and only TWO survived the time cap. Nothing was cutting
 * unfairly. The six were a row, a pulldown, two rear-delt flies and two shrugs, and the cap drops
 * isolations first, so it removed the four accessories and left the two real pulls.
 *
 * The cause is the diversity score. A NEW movement pattern is worth +4, which is right while the
 * patterns are peers — and Back's four patterns are not peers. `row` and `pulldown` are the muscle's
 * work; `rear_delt` and `shrug` are accessories to it. Scoring them equally means a muscle's third
 * slot goes to a shrug rather than to a second row, and a shrug is what the cap then deletes. The
 * back was being handed volume in a currency the day could not spend.
 *
 * So an accessory pattern earns the diversity bonus only ONCE — enough that a rear-delt fly reaches
 * the programme, which it should and previously often did not — and after that a REPEAT of a primary
 * pattern outscores a second accessory. The muscle keeps its variety and stops trading its main
 * movement for it.
 *
 * ⛔ This is not a list of lifts to avoid. Every pattern here is worth training; the claim is only
 * about ORDER of claim on a limited number of slots.
 */
export const ACCESSORY_PATTERNS: ReadonlySet<SwapPattern> = new Set<SwapPattern>([
  'rear_delt', 'shrug', // Back — the lats and the mid-back are the work
  'front_raise', // Shoulders — the front delt is saturated by every press
  'abduction', 'adduction', 'kickback', // Glutes — the thrust and the hinge are the work
]);

export interface DayList {
  name: string;
  region: 'upper' | 'lower' | 'full';
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
  /*
   * ⛔ A MOVEMENT SHE HAS REPORTED IS NOT OFFERED (founder 2026-08-11, `FORBIDDEN_PATTERNS`).
   *
   * Switching the MUSCLE off was the whole of the old answer, and it leaves the obvious hole open: a
   * hurt shoulder switched off `Shoulders` while chest pressing kept loading that shoulder the next
   * day. Every exercise already carries its `pattern`; the engine simply never asked.
   *
   * ⚠️ NO "KEEP THE POOL IF IT EMPTIES" FALLBACK HERE, unlike `canLoad` below. That fallback exists
   * so a muscle is never emptied by an equipment check — a pool of only-too-heavy lifts still yields
   * its catalogue lead, because she can always load something. A ban is the opposite: if every lift
   * for this muscle uses a movement she reported, the honest answer is that it rests this week.
   * Handing it back would be the app overruling her report to keep the shape tidy.
   */
  const banned = forbiddenFor(muscle, profile?.painEases, Date.now());
  const all = exercisesForMuscle(muscle as MuscleGroup)
    .filter((e) => !isSwapOnly(e.id))
    .filter((e) => !banned.has(e.pattern));
  if (all.length === 0) return [];
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
    // A missing ESSENTIAL pattern outranks every other kind of diversity — see ESSENTIAL_PATTERNS.
    const owed = (ESSENTIAL_PATTERNS[muscle] ?? []).filter((p) => !patterns.has(p));
    let best = remaining[0];
    let bestScore = -Infinity;
    for (const c of remaining) {
      // An owed essential pattern must be filled by a COMPOUND where the pool has one. Without the
      // +2, the `isolation ? 1` term below decided it: Back's owed `pulldown` was answered by the
      // STRAIGHT-ARM pulldown — a single-joint lat isolation that carries the pattern name and is
      // not a vertical pull in any sense a coach means — and the trim, which drops isolations first,
      // then took it straight back out. The pattern was satisfied on paper at every frequency and
      // absent from the programme at four and five days.
      // A NEW pattern is worth +4 while the patterns are peers. An ACCESSORY pattern is not a peer
      // of the muscle's main movement, so it collects that bonus once and then stops competing —
      // after which a repeat of a primary pattern (+2) outscores a second accessory (+1).
      const isAccessory = ACCESSORY_PATTERNS.has(c.pattern);
      const accessoriesTaken = chosen.filter((e) => ACCESSORY_PATTERNS.has(e.pattern)).length;
      const novelty = patterns.has(c.pattern)
        ? isAccessory ? 0 : 2 // a second row still beats a second shrug
        : isAccessory ? (accessoriesTaken === 0 ? 4 : 1) : 4;
      const score =
        (owed.includes(c.pattern) ? (c.tier === 'compound' ? 12 : 10) : 0) +
        novelty +
        (equips.has(c.equipment) ? 0 : 2) +
        (c.tier === 'isolation' ? 1 : 0);
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
function nameDays(regionDays: ('upper' | 'lower' | 'full')[]): string[] {
  const seen: Record<string, number> = { upper: 0, lower: 0, full: 0 };
  const label = { upper: 'Upper', lower: 'Lower', full: 'Full Body' } as const;
  return regionDays.map((r) => {
    const letter = String.fromCharCode(65 + seen[r]); // A, B, C…
    seen[r] += 1;
    return `${label[r]} ${letter}`;
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
    // A FULL-BODY day belongs to BOTH regions, so it receives from both passes (S-3 / Part 3).
    const regionIdxs = regionDays.map((r, i) => (r === region || r === 'full' ? i : -1)).filter((i) => i >= 0);
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
        /*
         * ════ AN EMPHASIS MARK MUST BUY A SECOND LIFT (founder 2026-08-10) ════
         *
         * Reading the marked programmes: marking Calves changed nothing at all — 6 weekly sets
         * before and after — and so did marking Biceps, Triceps or Shoulders. The mark raised the
         * target, the target is divided by `DAY_ONE_EX_DIVISOR`, and for a muscle with a small
         * SHARE that still rounds to one exercise. One exercise is capped at five sets by F-1, so
         * there was nowhere for the extra work to go and the athlete saw an identical week.
         *
         * A mark she can place and not see is worse than no mark. Two exercises is the smallest
         * change that gives the volume somewhere to land, and it is bounded by her pool.
         */
        const marked = stanceOf(map, m) === 'emphasis';
        /*
         * ⛔ A MUSCLE IS NEVER GIVEN MORE LIFTS THAN ITS REGION CAN HOLD DISTINCTLY (founder
         * 2026-08-11 — the selection fix, after the dealing fixes were measured and failed).
         *
         * A day may not repeat a muscle's movement, and `mustPlace` never yields — a muscle's first
         * lift, and the one bringing it to a second day, are placed whatever the day already holds.
         * So when a region collapses to ONE session — switching off a lower muscle does it, and so do
         * two upper marks at four days — every lower lift is forced onto that day, and the dealer has
         * no move left. A sweep of 1,260 weeks found thirty in exactly that shape.
         *
         * Two attempts to fix it while DEALING both failed and were reverted: refusing the duplicate
         * cancelled the emphasis mark, and preferring the day holding least of the pattern changes
         * nothing when there is only one day to prefer. The fault was never in the dealing. **The
         * muscle was being asked for more exercises than can exist without a repeat**, and the honest
         * place to say so is here, where the count is decided.
         *
         * The ceiling is arithmetic, not a guess: `days in this muscle's region × distinct patterns
         * it owns` is exactly how many of its lifts can be placed with no day repeating a movement.
         *
         * ⚠️ THE FLOOR STILL WINS. A muscle always gets at least one lift, and a marked one at least
         * two — S-2/S-35 and S-4 outrank tidiness, and a mark that bought nothing is the defect this
         * engine spent a day removing.
         */
        const regionOfM = regionDays.filter((r) => r === 'full' || r === regionOf(m)).length || 1;
        const distinctPatterns = new Set(
          pickExercises(m, Number.MAX_SAFE_INTEGER, leaveItsByMuscle[m], substitutes, profile)
            .map((id) => exerciseById(id)?.pattern)
            .filter(Boolean),
        ).size || 1;
        const room = Math.max(marked ? 2 : 1, regionOfM * distinctPatterns);
        const want = Math.min(room, Math.max(exerciseCountFor(targets[m]), marked ? 2 : 1));
        picks.push(...pickExercises(m, want, leaveItsByMuscle[m], substitutes, profile));
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
    /*
     * ════ AND IT DEALS A PATTERN ONLY ONCE TO A DAY (founder 2026-08-08) ════
     *
     * `k % len` is blind to what a day already holds, and the audit printed the result: Lower A came
     * out **Barbell Back Squat then Front Squat** — two `squat` lifts, back to back, in one session.
     * No coach programmes a front squat immediately after a back squat; it is the same movement
     * trained twice while the lunge and the leg extension sit on the other day.
     *
     * It is not a selection fault. A muscle with more exercises than patterns MUST repeat one
     * (Quads has four lifts across `squat`/`lunge`/`knee_extension`), and repeating is fine — the
     * two copies just have to land on DIFFERENT days. The dealer now places each lift on the day
     * that does not already train that muscle's pattern, and falls back to the emptiest day when
     * every candidate already does.
     *
     * Deterministic: ties break on day index, which is the order `k % len` used.
     */
    /*
     * ════ A DAY IS FULL BEFORE THE CLOCK SAYS SO (founder 2026-08-09) ════
     *
     * The dealer places every exercise the targets ask for and leaves it to `enforceTimeCap` to cut
     * back. That works while the cap has legal moves, and on a FULL-BODY week it does not: every
     * muscle is already down to one lift, the row and the pulldown are protected as essential
     * patterns, and a three-day week with two emphasis marks came out at 72 minutes with nothing the
     * cap was allowed to remove.
     *
     * Choosing which lift a day does without is a TRAINING decision — it belongs here, where the
     * volume targets and the body map are, not in a blunt pass that only knows the clock. So the
     * dealer stops at a day's realistic capacity, and the muscle whose exercise did not fit keeps
     * its remaining lifts on the days that still have room.
     *
     * Seven is a 60-minute session at three to five sets a lift, which is the same arithmetic the
     * time cap prices — one number, not two opinions about how long an hour is.
     */
    const MAX_LIFTS_PER_DAY = 7;
    const dealTo = (exId: string) => {
      const ex = exerciseById(exId);
      const load = (i: number) => dayExercises[i].length;
      /*
       * ⛔ …BUT A MUSCLE'S FIRST LIFT IS NEVER THE ONE THAT DOES NOT FIT (S-2/S-35).
       *
       * A full day may turn away a muscle's second or third exercise. Turning away its FIRST would
       * switch off a muscle she left on, which is the one thing the body map forbids — and it is
       * silent, because nothing downstream knows the lift was ever wanted. So capacity yields here:
       * the muscle takes the emptiest day even if that day is already at its limit, and the time cap
       * deals with the overflow the ordinary way.
       */
      const daysWithMuscle = ex
        ? dayExercises.filter((d) => d.some((o) => exerciseById(o)?.muscle === ex.muscle)).length
        : 0;
      // Capacity also yields for the lift that brings a muscle to a SECOND day. Twice a week is the
      // best-supported number in the literature and the whole reason a low-frequency week is now
      // full-body; refusing that lift to keep a day at seven trades the dose for the tidiness.
      const mustPlace = daysWithMuscle < 2;
      if (!mustPlace && regionIdxs.every((i) => load(i) >= MAX_LIFTS_PER_DAY)) return; // every day is full
      const clashes = (i: number) =>
        dayExercises[i].some((other) => {
          const o = exerciseById(other);
          return o && ex && o.muscle === ex.muscle && o.pattern === ex.pattern;
        });
      // The lift that opens a muscle, or brings it to a second day, ignores capacity (see above).
      const withRoom = mustPlace ? regionIdxs : regionIdxs.filter((i) => load(i) < MAX_LIFTS_PER_DAY);
      const candidates = withRoom.length > 0 ? withRoom : regionIdxs;
      const free = candidates.filter((i) => !clashes(i));
      /*
       * ⛔ A DAY NEVER REPEATS A MUSCLE'S MOVEMENT (founder 2026-08-11, after the catalogue split).
       *
       * The line under this was `const pool = free.length > 0 ? free : candidates;` — when every
       * legal day already trained this muscle's pattern, the lift was placed anyway. Thirty-one
       * sessions came out holding the same muscle+pattern twice: `Quads/squat` twice in one Lower A
       * is a back squat and a hack squat back to back while the lunge sits on the other day.
       *
       * ⚠️ THIS COULD NOT BE FIXED IN THE ENGINE, AND TWO ATTEMPTS PROVED IT. Refusing the duplicate
       * broke `emphasis earns MORE exercises` (S-4/S-63) and `compounds are spread across the week`,
       * because `Quads` owned three patterns — so a marked muscle's fourth lift had no clash-free day
       * anywhere, and refusing it cancelled the mark. Scoping the ban to compounds changed nothing:
       * the twins WERE the compounds. The vocabulary was too poor to describe what a coach already
       * distinguishes, and splitting `squat` / `row` / `hinge` is what made this line affordable.
       *
       * ⚠️ `mustPlace` still ignores it entirely, as it ignores capacity: a muscle's FIRST lift, or
       * the one bringing it to a second day, is never the lift that does not fit.
       */
      if (free.length === 0 && !mustPlace) return;
      const pool = free.length > 0 ? free : candidates;
      let best = pool[0];
      for (const i of pool) if (load(i) < load(best)) best = i; // strict: ties keep the lowest index
      dayExercises[best].push(exId);
    };
    for (const id of picks.filter((id) => exerciseById(id)?.tier === 'compound')) dealTo(id);
    for (const id of picks.filter((id) => exerciseById(id)?.tier !== 'compound')) dealTo(id);
  }

  /*
   * ⛔ AND THEN THE DAYS ARE LEVELLED (founder 2026-08-10, measured).
   *
   * The dealer places each lift on the emptiest legal day, which balances a week where every muscle
   * wants the same number of exercises. It does not balance one where they do not: compounds are
   * dealt before isolations, so a muscle with two compounds fills days in the first pass while
   * another muscle's only lift — an isolation — arrives in the second to find them full. Capacity
   * yields for that lift (it must: refusing a muscle's FIRST exercise switches off a muscle she left
   * on), and the yields pile up.
   *
   * Measured on a three-day full-body week, female 75 kg:
   *
   *     no mark        7 / 7 / 7 exercises
   *     Glutes mark    9 / 7 / 6      ← the first day cannot fit her hour, and cannot be cut
   *
   * That 9-lift day is irreducible by the time cap: every lift is at the three-set floor and every
   * one is its muscle's only lift, so S-35 forbids all of them. The fix has to be here, before the
   * clock ever sees it.
   *
   * ⚠️ A MOVE, NEVER A DROP. This only ever relocates a lift from the fullest day to the emptiest,
   * and only when the destination does not already train that muscle's pattern — so the week keeps
   * every exercise it chose, and no day gains a movement it already has. Nothing can be lost here,
   * which is what makes it safe to run after every other rule has had its say.
   *
   * ⚠️ AND IT LEVELS TO WITHIN ONE. Exact equality is impossible when the lift count is not divisible
   * by the day count, and chasing it would move lifts for ever; the guard bounds the passes anyway.
   */
  const totalDealt = dayExercises.reduce((n, d) => n + d.length, 0);
  for (let guard = 0; guard < totalDealt + dayExercises.length; guard++) {
    let fullest = 0;
    let emptiest = 0;
    for (let i = 0; i < dayExercises.length; i++) {
      if (regionDays[i] !== regionDays[fullest]) continue;
      if (dayExercises[i].length > dayExercises[fullest].length) fullest = i;
    }
    for (let i = 0; i < dayExercises.length; i++) {
      if (regionDays[i] !== regionDays[fullest]) continue;
      if (dayExercises[i].length < dayExercises[emptiest].length) emptiest = i;
    }
    if (dayExercises[fullest].length - dayExercises[emptiest].length <= 1) break;
    const movable = dayExercises[fullest].find((id) => {
      const ex = exerciseById(id);
      return ex && !dayExercises[emptiest].some((other) => {
        const o = exerciseById(other);
        return o && o.muscle === ex.muscle && o.pattern === ex.pattern;
      });
    });
    if (!movable) break;
    dayExercises[fullest].splice(dayExercises[fullest].indexOf(movable), 1);
    dayExercises[emptiest].push(movable);
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
