/**
 * The paywall's argument is her own numbers (founder 2026-08-23) — and a measured sentence must be
 * impossible to print wrong. See `domain/paywallCase` for the rules; these pin the edges where a
 * wrong sentence would be printed on the one screen that asks for money.
 */

//

import { paywallCase } from '@/domain/paywallCase';
import type { Session, SetLog } from '@/data/local/models';

let seq = 0;
const T0 = Date.parse('2026-08-01T10:00:00.000Z');
const DAY = 86_400_000;

function log(exerciseId: string, weight: number | null, reps = 8): SetLog {
  return {
    exerciseId,
    setIndex: 0,
    recommendedWeight: weight,
    recommendedReps: reps,
    actualWeight: weight,
    actualReps: reps,
    edited: false,
    persistedAt: new Date(T0).toISOString(),
  } as SetLog;
}
function session(atMs: number, sets: SetLog[]): Session {
  return { id: `s${++seq}`, programDayId: 'd', startedAt: new Date(atMs).toISOString(), state: 'SAVED', earlyFinish: false, sets } as Session;
}

beforeEach(() => {
  seq = 0;
});

describe('paywallCase', () => {
  it('names the biggest riser, then vs now, and counts the others', () => {
    const history = [
      session(T0, [log('bb_deadlift', 50), log('bb_bench_press', 40), log('bb_back_squat', 60)]),
      session(T0 + 7 * DAY, [log('bb_deadlift', 62.5), log('bb_bench_press', 42.5), log('bb_back_squat', 60)]),
    ];
    const c = paywallCase(history, 'kg');
    expect(c).not.toBeNull();
    expect(c!.exerciseId).toBe('bb_deadlift');
    expect(c!.delta).toBe(12.5);
    expect(c!.unit).toBe('kg');
    expect(c!.othersUp).toBe(1); // the bench rose; the squat held and is not counted
  });

  it('one session is not a rise — then vs now needs a then', () => {
    expect(paywallCase([session(T0, [log('bb_deadlift', 50)])], 'kg')).toBeNull();
  });

  it('a lift seen in ONE session claims nothing, even beside older sessions', () => {
    const history = [
      session(T0, [log('bb_bench_press', 40)]),
      session(T0 + 7 * DAY, [log('bb_deadlift', 100)]), // first and only outing — no "rise"
    ];
    expect(paywallCase(history, 'kg')).toBeNull();
  });

  it('nothing rose → null, never a fished compliment', () => {
    const history = [
      session(T0, [log('bb_deadlift', 60)]),
      session(T0 + 7 * DAY, [log('bb_deadlift', 57.5)]),
    ];
    expect(paywallCase(history, 'kg')).toBeNull();
  });

  it('bodyweight sets (null load) never fabricate a champion', () => {
    const history = [
      session(T0, [log('pull_up', null, 6)]),
      session(T0 + 7 * DAY, [log('pull_up', null, 10)]),
    ];
    expect(paywallCase(history, 'kg')).toBeNull();
  });

  it('the rise converts to the display unit as a difference — lb never invents mass', () => {
    const history = [
      session(T0, [log('bb_deadlift', 50)]),
      session(T0 + 7 * DAY, [log('bb_deadlift', 60)]),
    ];
    const c = paywallCase(history, 'lb');
    expect(c).not.toBeNull();
    expect(c!.unit).toBe('lb');
    // 10 kg ≈ 22 lb; the exact figure follows displayWeight's own rounding, and must be positive.
    expect(c!.delta).toBeGreaterThan(20);
    expect(c!.delta).toBeLessThan(24);
  });
});
