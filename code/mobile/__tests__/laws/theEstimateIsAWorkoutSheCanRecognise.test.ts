import { coachWeek } from '@/domain/coachWeek';
import { REST_TRANSITION_S } from '@/domain/restPrescription';
import type { CoachPlan } from '@/domain/coachPlan';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ESTIMATED TIME IS A WORKOUT SHE WOULD RECOGNISE.
 *
 * ⛔ FOUNDER, 2026-08-03: *"He gave a programme with 6 exercises — 4 sets on the first two and 3 on
 * the rest — and says the estimated time is about 35 minutes. Obviously that is never realistic."*
 *
 * The number is OURS, not the coach's: `coachWeek` computes it and Today prints it. It counted the
 * work and the rest BETWEEN ROUNDS, and charged **zero** for the gap between one exercise and the
 * next — finding the rack, changing the plates, waiting for the machine, crossing the floor. On his
 * six-exercise session that is five transitions billed at nothing.
 *
 * ⚠️ THIS IS ALSO WHY THE COACH CANNOT SIZE A SESSION. It is told her session length and then judged
 * against an estimate that under-counts by ten minutes — so a workout it believed fitted her hour
 * genuinely does not. Fixing the estimate is a precondition for asking the coach to respect a time
 * budget at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The founder's own session: six exercises, 4·4·3·3·3·3, one lift per block. */
const hisPlan: CoachPlan = {
  v: 2,
  sessions: [{
    name: 'Upper A',
    blocks: [4, 4, 3, 3, 3, 3].map((rounds, i) => ({
      rounds,
      restS: 90,
      items: [{ kind: 'reps' as const, ex: `lift_${i}`, reps: [8, 10] as [number, number], load: 40 }],
    })),
  }],
};

describe('the gap between exercises is not free', () => {
  const week = () => coachWeek(hisPlan)[0];

  it('⛔ charges for every transition except the one after the last block', () => {
    /*
     * Six blocks = five transitions. Asserted as a DIFFERENCE against the old arithmetic rather than
     * as an absolute, so the test states the defect rather than restating the implementation:
     *   work  = 20 sets × EXEC_S
     *   rests = (4-1)+(4-1)+(3-1)×4 = 14 between-round rests
     * Anything the estimate has beyond that is the transitions, and there must be exactly five.
     */
    const EXEC_S = 40;
    const withoutTransitions = (20 * EXEC_S + 14 * 90) / 60;
    const gained = week().minutes - withoutTransitions;
    expect(Math.round((gained * 60) / REST_TRANSITION_S)).toBe(5);
  });

  it('⚠️ the estimate is no longer one a person would laugh at', () => {
    // Not a pinned number — a floor. Twenty working sets with ninety seconds between them cannot be
    // a 35-minute session, and that is the whole complaint.
    expect(week().minutes).toBeGreaterThan(40);
  });

  it('a single-block session is charged no transition at all', () => {
    // There is nothing to walk to. The last block must never be billed for a gap that does not exist.
    const one: CoachPlan = {
      v: 2,
      sessions: [{ name: 'A', blocks: [{ rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'x', reps: [8, 10], load: 40 }] }] }],
    };
    expect(coachWeek(one)[0].minutes).toBe(Math.round((3 * 40 + 2 * 90) / 60));
  });

  it('honours a transition the COACH asked for, over our default', () => {
    // `restAfterS` is the coach's own answer to the same question. Ours is the fallback, not a veto.
    const stated: CoachPlan = {
      v: 2,
      sessions: [{
        name: 'A',
        blocks: [
          { rounds: 1, restAfterS: 300, items: [{ kind: 'reps', ex: 'x', reps: [8, 10], load: 40 }] },
          { rounds: 1, items: [{ kind: 'reps', ex: 'y', reps: [8, 10], load: 40 }] },
        ],
      }],
    };
    expect(coachWeek(stated)[0].minutes).toBe(Math.round((2 * 40 + 300) / 60));
  });
});
