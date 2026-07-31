/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PLAN RUN — turning what the coach wrote into the order the athlete meets it.
 *
 * `coachPlan` describes a session the way a coach says it: blocks of items, done so many rounds.
 * That is the right shape to WRITE and the wrong shape to RUN — an athlete does not meet a block,
 * she meets one thing at a time, in order, with rests in the gaps. This expands the first into the
 * second, and it is the only place that knows how.
 *
 * ── WHY THIS IS A FILE AND NOT A LOOP INSIDE THE SCREEN ─────────────────────────────────────────
 * Because rounds are where a circuit and a straight set stop looking alike, and getting it wrong is
 * silent. Four sets of bench and a three-lift circuit done three times expand differently — the
 * first repeats one item four times, the second repeats three items three times — and a screen that
 * wrote the loop inline would be a second place that could get it wrong. It is also the piece the
 * session machine will consume when the transport exists, so it is pure and has no React in it.
 *
 * ── WHERE THE REST GOES ─────────────────────────────────────────────────────────────────────────
 * `restS` is rest BETWEEN ROUNDS, so it belongs after the last item of a round — not after every
 * item. In a straight block (one item) those are the same thing; in a circuit they are emphatically
 * not, and resting between the exercises of a circuit is a different workout from resting between
 * its laps. The last round gets no between-rounds rest — the block is over — and `restAfterS`
 * follows the block instead.
 *
 * Pure and I/O-free.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { EXERCISES } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';
import type { PlannedItem, PlannedSession } from './coachPlan';

const nameById = new Map<string, string>([
  ...EXERCISES.map((e) => [e.id, e.name] as const),
  ...MOVEMENTS.map((m) => [m.id, m.name] as const),
]);

/** What the athlete meets, one at a time. The item, plus where in the session it sits. */
export interface RunStep {
  /** The item exactly as the coach wrote it — shape, numbers and `say` untouched. */
  item: PlannedItem;
  /** Display name for `item.ex`, resolved once here so no screen resolves it twice. */
  name: string;
  /** 1-based block index and total, for "lift 2 of 6". */
  block: number;
  blocks: number;
  /** 1-based round index and total, for "set 3 of 4" / "lap 3 of 6". */
  round: number;
  rounds: number;
  /** 1-based position within the round, for a circuit's "2 of 3". */
  position: number;
  positions: number;
  /** Seconds to rest AFTER this step, or 0. Between-rounds rest, then the block's own tail. */
  restAfterS: number;
  /** True when this is the last step of the whole session — nothing follows it. */
  last: boolean;
}

/**
 * Expand a session into the ordered list of steps the athlete performs.
 *
 * An item whose `ex` resolves to nothing keeps its id as its name rather than being dropped: by the
 * time a plan reaches here it has already been through `parseCoachPlan`, which refuses an
 * unresolvable id outright. A step silently vanishing here would be a set the athlete never sees
 * and the record never explains.
 */
export function runSteps(session: PlannedSession): RunStep[] {
  const steps: RunStep[] = [];
  const blocks = session.blocks.length;

  session.blocks.forEach((block, b) => {
    const positions = block.items.length;
    for (let round = 1; round <= block.rounds; round++) {
      block.items.forEach((item: PlannedItem, i) => {
        const endOfRound = i === positions - 1;
        const endOfBlock = endOfRound && round === block.rounds;
        steps.push({
          item,
          name: nameById.get(item.ex) ?? item.ex,
          block: b + 1,
          blocks,
          round,
          rounds: block.rounds,
          position: i + 1,
          positions,
          // Between ROUNDS, not between the items of a round — see the header.
          restAfterS: endOfBlock ? (block.restAfterS ?? 0) : endOfRound ? (block.restS ?? 0) : 0,
          last: false,
        });
      });
    }
  });

  if (steps.length > 0) {
    const end = steps[steps.length - 1];
    // Nothing follows the last step, so nothing is being rested FOR. A trailing rest is a timer the
    // athlete watches after the workout is over.
    steps[steps.length - 1] = { ...end, restAfterS: 0, last: true };
  }
  return steps;
}

/** Total prescribed rest in a session, in seconds — what the plan intends her to spend waiting. */
export function plannedRestS(session: PlannedSession): number {
  return runSteps(session).reduce((sum, s) => sum + s.restAfterS, 0);
}
