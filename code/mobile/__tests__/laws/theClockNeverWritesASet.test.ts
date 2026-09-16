/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CLOCK NEVER WRITES A SET.
 *
 * ⛔ FOUNDER, 2026-09-09, after a workout on build 71: *"הסט האוטומטי עדיין קיים אפילו שאמרתי לך
 * לבטל אותו לגמרי."* For two days (2026-09-07 → 09) `domain/sessionClock` presumed a set done as
 * written when its expected duration passed with no word from her; law 4 (2026-09-08) limited it
 * to one presumption per word of hers; this ruling cancels it outright. A set is written by her
 * hand, her voice, her wrist or the lock screen — never by time.
 *
 * What the clock still does, and must: a REST she started runs on the wall clock, so a phone that
 * slept through the whole rest presents the next set at the instant the rest ended, not at the
 * wake. This pins the arithmetic — pure, wall-clock-injected, the same from a foreground timer
 * and from a locker.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import * as fs from 'fs';
import * as path from 'path';
import { runClock, type ClockStep } from '@/domain/sessionClock';
import { initialSessionMachine, sessionReducer } from '@/state/machines/sessionState';
import { nudgeAfterS } from '@/domain/setDwell';

const LIFT = 'bb_bench_press';
const T0 = 1_700_000_000_000;
const REST_INTER = 90;
const REST_TRANSITION = 120;

function plan(): ClockStep[] {
  const mk = (ex: string, i: number, n: number, last: boolean): ClockStep => ({
    exerciseId: ex,
    exerciseSetIndex: i,
    target: { recommendedReps: 8, repBandLo: 8 },
    lastSetOfExercise: i === n - 1,
    lastSetOfSession: last,
  });
  return [mk(LIFT, 0, 3, false), mk(LIFT, 1, 3, false), mk(LIFT, 2, 3, false), mk('bb_row', 0, 2, false), mk('bb_row', 1, 2, true)];
}
const restAfterStep = (s: ClockStep) => (s.lastSetOfExercise ? REST_TRANSITION : REST_INTER);
const base = (over = {}) => ({
  plan: plan(),
  machine: initialSessionMachine(false),
  restStartedAtMs: null,
  restExtraS: 0,
  restAfterStep,
  nowMs: T0,
  ...over,
});
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('⛔ the clock never writes a set', () => {
  it('a set on stage is hers however long it stands — the ask\'s instant passes, and an hour, and three: zero ticks', () => {
    const askS = nudgeAfterS(LIFT, 8);
    for (const lateMs of [askS * 1000, askS * 1000 + 60 * 60 * 1000, 3 * 60 * 60 * 1000]) {
      const r = runClock(base({ nowMs: T0 + lateMs }));
      expect(r.ticks).toEqual([]);
      expect(r.machine).toEqual(initialSessionMachine(false));
    }
  });

  it('⛔ the reducer has no event that moves the machine on time — `PRESUME_SET` does not exist', () => {
    const s = initialSessionMachine(false);
    // An unknown event is a no-op: the same state back, by identity.
    expect(sessionReducer(s, { type: 'PRESUME_SET', restSeconds: 90, lastSetOfExercise: false } as never)).toBe(s);
    expect(read('src/state/machines/sessionState.ts')).not.toMatch(/case 'PRESUME_SET'/);
    expect(read('src/domain/sessionClock.ts')).not.toMatch(/type: 'PRESUME_SET'|presumed: true/);
    expect(read('src/state/stores/sessionStore.tsx')).not.toMatch(/presumed: true/);
  });

  it('a rest SHE started that ran out while away ends at ITS instant — the next set is presented from there, not from the wake', () => {
    const m = sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_INTER, lastSetOfExercise: false });
    const r = runClock(base({ machine: m, restStartedAtMs: T0, nowMs: T0 + REST_INTER * 1000 + 20 * 60 * 1000 })); // twenty minutes late
    expect(r.ticks).toEqual([{ kind: 'rest_elapsed', atMs: T0 + REST_INTER * 1000, restS: REST_INTER }]);
    expect(r.machine.phase).toBe('SET_PRESENTED');
    expect(r.machine.setIndex).toBe(1);
    expect(r.presentedAtMs).toBe(T0 + REST_INTER * 1000);
    expect(r.restStartedAtMs).toBeNull();
    expect(r.restExtraS).toBe(0);
  });

  it('…and it stops there: the set the rest ended into waits for her, whatever the wall clock says', () => {
    const m = sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_INTER, lastSetOfExercise: false });
    const r = runClock(base({ machine: m, restStartedAtMs: T0, nowMs: T0 + 6 * 60 * 60 * 1000 }));
    expect(r.ticks).toHaveLength(1); // the rest, and nothing after it
    const again = runClock(base({ machine: r.machine, restStartedAtMs: r.restStartedAtMs, nowMs: T0 + 12 * 60 * 60 * 1000 }));
    expect(again.ticks).toEqual([]);
    expect(again.machine).toBe(r.machine);
  });

  it('nothing is due before the rest has run its length', () => {
    const m = sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_INTER, lastSetOfExercise: false });
    const r = runClock(base({ machine: m, restStartedAtMs: T0, nowMs: T0 + REST_INTER * 1000 - 1 }));
    expect(r.ticks).toEqual([]);
    expect(r.restStartedAtMs).toBe(T0); // the anchor is kept, untouched
  });

  it('"+15" lengthens the running rest and the clock honours it', () => {
    const m = sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_INTER, lastSetOfExercise: false });
    const r = runClock(base({ machine: m, restStartedAtMs: T0, restExtraS: 15, nowMs: T0 + (REST_INTER + 14) * 1000 }));
    expect(r.ticks).toEqual([]);
    const r2 = runClock(base({ machine: m, restStartedAtMs: T0, restExtraS: 15, nowMs: T0 + (REST_INTER + 15) * 1000 }));
    expect(r2.ticks).toEqual([{ kind: 'rest_elapsed', atMs: T0 + (REST_INTER + 15) * 1000, restS: REST_INTER + 15 }]);
  });

  it('a transition rest ends the same way, into the next lift\'s first set', () => {
    const m = { ...sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_TRANSITION, lastSetOfExercise: true }), setIndex: 2 };
    const r = runClock(base({ machine: m, restStartedAtMs: T0, nowMs: T0 + REST_TRANSITION * 1000 }));
    expect(r.ticks[0]).toEqual({ kind: 'rest_elapsed', atMs: T0 + REST_TRANSITION * 1000, restS: REST_TRANSITION });
    expect(r.machine.setIndex).toBe(3);
  });

  it('a paused workout is frozen — the clock does nothing however long it waits', () => {
    const resting = sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_INTER, lastSetOfExercise: false });
    const paused = sessionReducer(resting, { type: 'PAUSE' });
    const r = runClock(base({ machine: paused, restStartedAtMs: T0, nowMs: T0 + 60 * 60 * 1000 }));
    expect(r.ticks).toEqual([]);
    expect(r.machine).toBe(paused);
  });

  it('with no anchor for the running rest, it will not guess', () => {
    const m = sessionReducer(initialSessionMachine(false), { type: 'COMPLETE_SET', restSeconds: REST_INTER, lastSetOfExercise: false });
    const r = runClock(base({ machine: m, restStartedAtMs: null, nowMs: T0 + 60 * 60 * 1000 }));
    expect(r.ticks).toEqual([]);
  });
});
