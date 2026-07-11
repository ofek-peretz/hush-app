/**
 * The engine advances WITH the program bucket, never ahead of it (founder batch 2026-07-10).
 *
 * A mid-week signup's first bucket is stamped for the NEXT Sat 23:59 (weekCadence.firstBucketOpen)
 * so the athlete's first plan gets a full runway. The engine's roll is a Sat-23:59 boundary too, so
 * without this rule it would bump loads (and publish a Weekly Update) in the MIDDLE of the plan the
 * athlete is still executing. Passing the bucket anchor to maybeAdvance anchors the first roll to
 * the bucket's expiry instead.
 */
import { maybeAdvance, toEngineProfile } from '@/engine/v4/v4Engine';
import { db } from '@/data/local/db';
import { currentWeekOpen, nextWeekOpen } from '@/domain/weekCadence';
import type { Program, Session, SetLog } from '@/data/local/models';

const program: Program = {
  id: 'p_anchor',
  frequency: 1,
  days: [
    {
      id: 'day_0',
      key: '0',
      name: 'Push',
      muscleGroups: ['Chest'],
      isRest: false,
      slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 3 }],
    },
  ],
};

const eprofile = toEngineProfile({
  sex: 'male', age: 30, weightKg: 80, experience: 'intermediate', goal: 'build_muscle', daysPerWeek: 1,
});
const seedFor = () => 50;

function benchSession(atMs: number): Session {
  const startedAt = new Date(atMs).toISOString();
  const sets: SetLog[] = [0, 1, 2].map((s) => ({
    exerciseId: 'bb_bench_press',
    setIndex: s,
    recommendedWeight: 50,
    recommendedReps: 8,
    actualWeight: 50,
    actualReps: 12, // top of the range — a decision is due at the next roll
    edited: false,
    persistedAt: startedAt,
  }));
  return { id: `s_${atMs}`, programDayId: 'day_0', startedAt, state: 'SAVED', earlyFinish: false, sets };
}

beforeEach(async () => {
  await db.clearAll();
});

describe('engine roll is anchored to the program bucket', () => {
  it('an extended first bucket defers the engine anchor to the bucket open (no mid-plan advance)', async () => {
    const now = Date.now();
    const bucketOpen = nextWeekOpen(now); // the mid-week signup's extended first bucket
    await maybeAdvance(program, eprofile, [], seedFor, new Set(), now, bucketOpen);

    const state = (await db.loadEngineV4())!;
    // Anchored to the BUCKET, not to this calendar week — so the Saturday in the middle of the
    // extended bucket is NOT a roll (weekOpen === anchor, and the roll needs weekOpen > anchor).
    expect(state.lastAdvanceWeekOpen).toBe(bucketOpen);
    expect(state.lastAdvanceWeekOpen).toBeGreaterThan(currentWeekOpen(now));
    expect(state.weeksProcessed ?? 0).toBe(0); // nothing folded yet
  });

  it('the ordinary bucket anchor is the identity (the engine still rolls every Saturday)', async () => {
    const now = Date.now();
    const bucketOpen = currentWeekOpen(now); // the ordinary case: bucket built for this week
    await maybeAdvance(program, eprofile, [], seedFor, new Set(), now, bucketOpen);

    const state = (await db.loadEngineV4())!;
    expect(state.lastAdvanceWeekOpen).toBe(currentWeekOpen(now));
  });

  it('once the extended bucket expires, the whole bucket\'s work is folded in ONE roll', async () => {
    const now = Date.now();
    const bucketOpen = nextWeekOpen(now);
    await maybeAdvance(program, eprofile, [], seedFor, new Set(), now, bucketOpen);

    // The athlete trains inside the extended bucket (before its open).
    const history = [benchSession(now + 60_000)];

    // The Saturday in the MIDDLE of the extended bucket: not a roll for this bucket.
    await maybeAdvance(program, eprofile, history, seedFor, new Set(), bucketOpen + 1000, bucketOpen);
    expect(((await db.loadEngineV4())!.weeksProcessed ?? 0)).toBe(0);

    // The bucket expires at the NEXT Saturday → exactly one advance, folding the bucket's work.
    const expiry = nextWeekOpen(bucketOpen) + 1000;
    await maybeAdvance(program, eprofile, history, seedFor, new Set(), expiry, bucketOpen);
    const rolled = (await db.loadEngineV4())!;
    expect(rolled.weeksProcessed).toBe(1);
    expect(rolled.lastAdvanceAt).toBe(1); // the session was folded
  });
});
