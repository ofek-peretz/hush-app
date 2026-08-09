/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ORDER SHE WALKS, NOT THE PROGRAMME SHE DOES.
 *
 * ⛔ FOUNDER, 2026-08-04, twice — the second time because I got it wrong the first:
 *
 *   > *"If a lifter does chest on the high cable, then the coach gives him rear delts with a
 *   > dumbbell, then sends him back to chest on the low cable — it would simply have been better to
 *   > do the two chest exercises first and only then move to the dumbbell… I want the programmes to
 *   > be exactly what he builds. But once he has built them, he should check whether the ORDER can
 *   > be arranged better for equipment use. That's all. It must not affect which programmes he
 *   > chooses."*
 *
 * Gyms are full. Leaving a station and coming back means queueing for something you already had.
 *
 * ── ⚠️ WHY THIS IS CODE AND NOT A PROMPT RULE ──────────────────────────────────────────────────
 * It was a prompt rule first, and it failed twice in opposite directions:
 *
 *   · Written as *"finish a station before leaving it"*, the coach applied it while CHOOSING and
 *     returned five dumbbell lifts in a row — nearly the whole session on one rack.
 *   · Rewritten as a second pass over the finished order, the coach simply did not do it. A single
 *     generation does not reliably re-read and revise its own output, and no rewording changes that.
 *
 * So it moves here, where it can be BOUNDED and PROVEN. This is not the deleted engine returning to
 * form opinions about her training: it never chooses a lift, never touches a load, a rep or a set,
 * and never changes what the session IS. It reorders the walk. It is the same class of thing as the
 * plate maths — a mechanical convenience she never notices, which is exactly how he described it.
 *
 * ── THE BOUNDS, AND EVERY ONE IS TESTED ─────────────────────────────────────────────────────────
 *   1. BLOCKS move, never items. An item inside a block is a superset or a circuit — reordering
 *      those would change the training, which is the one thing forbidden.
 *   2. The OPENER never moves. The first lift of a session is a deliberate choice (the heaviest, the
 *      one she is freshest for), and it is the position a coach thinks hardest about.
 *   3. A swap is accepted only if it STRICTLY REDUCES the number of station changes. Equal is not
 *      better, and "not worse" is how a rewrite sneaks in.
 *   4. At most `MAX_SWAPS` swaps. The result has to stay recognisably the session the coach wrote;
 *      an unbounded sort would return a different-looking programme every week.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { exerciseById } from '@/data/exercises';
import type { PlannedBlock, PlannedSession, CoachPlan } from './coachPlan';

/**
 * How many exchanges we are willing to make.
 *
 * Two is enough for the cases the founder described — one stray lift between two runs of the same
 * station, or two of them — and small enough that the session still reads as the one the coach
 * wrote. It is a ceiling on how much we are prepared to disagree with it about order.
 */
const MAX_SWAPS = 2;

/**
 * The station a block occupies.
 *
 * A movement (a plank, a run, a carry) has no catalogue entry and therefore no equipment: it gets
 * its own bucket rather than being forced into one, because floor work genuinely needs no station
 * and grouping it is as valid as grouping cables.
 *
 * ⚠️ Read from the FIRST item. A block with several items is a circuit, it occupies whatever it
 * occupies for its whole duration, and its first lift is what she walks to.
 */
function stationOf(block: PlannedBlock): string {
  const first = block.items[0];
  if (!first) return 'none';
  return exerciseById(first.ex)?.equipment ?? 'floor';
}

/**
 * ════ THE SECOND LAYER: COMPOUND BEFORE ISOLATION, INSIDE A STATION ════
 *
 * ⛔ FOUNDER, 2026-08-04, looking at the first ordered output: *"in the first example the dumbbells
 * are shoulders first and then chest. Isn't the opposite more logical? But only if it doesn't hurt
 * the sort you already did, because that one seems to be working."*
 *
 * He is right about the training: a lateral raise before an incline press spends the shoulder on the
 * small movement and then asks it to stabilise the big one.
 *
 * ── ⚠️ WHY IT CANNOT HURT THE STATION SORT, AND THIS IS THE WHOLE POINT ─────────────────────────
 * It only ever reorders blocks INSIDE one contiguous run of the same station. A run's boundaries do
 * not move, so the sequence of stations she walks is byte-identical before and after — it is not
 * "unlikely to break it", it is arithmetically incapable of breaking it. `stationChanges` is
 * asserted equal across this pass, not merely non-worse.
 *
 * ⚠️ STABLE, so a run whose blocks are all compound or all isolation comes back untouched and in the
 * coach's own order. This ranks two kinds of movement; it does not have an opinion about which
 * compound comes first.
 */
const ISOLATION = new Set<string>([
  'fly', 'curl', 'elbow_extension', 'lateral_raise', 'front_raise', 'rear_delt', 'shrug',
  'knee_extension', 'knee_flexion', 'calf_straight', 'calf_bent', 'abduction', 'adduction',
  'kickback', 'crunch', 'leg_raise', 'rotation', 'anti_extension',
]);

/** 0 = compound (multi-joint), 1 = isolation. Anything unknown ranks as compound: an unrecognised
 *  movement is more likely a main lift than an accessory, and ranking it late would bury it. */
function weightOf(block: PlannedBlock): number {
  const first = block.items[0];
  const pattern = first ? exerciseById(first.ex)?.pattern : undefined;
  return pattern && ISOLATION.has(pattern) ? 1 : 0;
}

/** How many times she changes station walking this order. The number being minimised. */
export function stationChanges(blocks: PlannedBlock[]): number {
  let n = 0;
  for (let i = 1; i < blocks.length; i += 1) {
    if (stationOf(blocks[i]) !== stationOf(blocks[i - 1])) n += 1;
  }
  return n;
}

/**
 * Reorder one session's blocks to cut return trips.
 *
 * Returns the SAME array when nothing strictly improves — callers compare by identity to know
 * whether anything happened, and an unchanged session must not look like a decision.
 */
export function orderByStation(blocks: PlannedBlock[]): PlannedBlock[] {
  let best = blocks;
  let bestScore = stationChanges(blocks);

  /*
   * ⚠️ THE STATION SWAP NEEDS FOUR BLOCKS TO BE WORTH ANYTHING — with three there is no return trip
   * a swap can remove that reordering would not simply relocate. The COMPOUND pass below has no such
   * floor and runs on every session: a three-lift day still benefits from pressing before flying,
   * and skipping the whole function for short sessions would have silently excluded them.
   */
  for (let swap = 0; blocks.length >= 4 && swap < MAX_SWAPS; swap += 1) {
    let found: PlannedBlock[] | null = null;
    let foundScore = bestScore;
    // From index 1: the opener never moves (bound 2).
    for (let i = 1; i < best.length; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const next = [...best];
        [next[i], next[j]] = [next[j], next[i]];
        const score = stationChanges(next);
        if (score < foundScore) { found = next; foundScore = score; }
      }
    }
    if (!found) break; // nothing strictly better — bound 3
    best = found;
    bestScore = foundScore;
  }
  return compoundFirstWithinRuns(best, bestScore);
}

/**
 * Compound before isolation, inside each run of one station.
 *
 * ⚠️ The opener still never moves (bound 2) — it is excluded from its own run's sort rather than
 * being allowed to drift, because "the first lift of the session" outranks "compounds first".
 */
function compoundFirstWithinRuns(blocks: PlannedBlock[], changesBefore: number): PlannedBlock[] {
  const out = [...blocks];
  let i = 0;
  let touched = false;
  while (i < out.length) {
    let j = i;
    while (j + 1 < out.length && stationOf(out[j + 1]) === stationOf(out[i])) j += 1;
    // `from` skips index 0 so the opener holds its place even inside a run.
    const from = i === 0 ? 1 : i;
    if (j > from) {
      const run = out.slice(from, j + 1);
      const sorted = [...run].sort((a, b) => weightOf(a) - weightOf(b)); // stable
      if (sorted.some((b, k) => b !== run[k])) {
        out.splice(from, run.length, ...sorted);
        touched = true;
      }
    }
    i = j + 1;
  }
  if (!touched) return blocks;
  /*
   * ⛔ THE GUARANTEE, ASSERTED AT RUNTIME AND NOT ONLY IN A TEST. The founder's condition was
   * *"only if it doesn't hurt the sort you already did"*. Sorting inside a run cannot change the
   * station sequence — but if a future edit ever made it possible, the walk is what matters and the
   * reorder is abandoned rather than shipped.
   */
  return stationChanges(out) === changesBefore ? out : blocks;
}

/**
 * The whole plan, walked.
 *
 * ⚠️ Returns the same plan object when NOTHING moved anywhere. That matters: `db.saveCoachPlan`
 * keeps the previous plan to derive Today's change arrows, and a plan rewritten to an identical
 * value would read as a new decision on every call.
 */
export function orderPlanByStation(plan: CoachPlan): CoachPlan {
  let touched = false;
  const sessions: PlannedSession[] = plan.sessions.map((s) => {
    const blocks = orderByStation(s.blocks);
    if (blocks === s.blocks) return s;
    touched = true;
    return { ...s, blocks };
  });
  return touched ? { ...plan, sessions } : plan;
}
