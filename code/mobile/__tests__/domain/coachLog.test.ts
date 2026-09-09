// @ts-nocheck
// 
import { appendDecisions, recentDecisions, COACH_LOG_CAP, type CoachDecision } from '@/domain/coachLog';
import { coachFacts } from '@/domain/coachFacts';
import type { Profile, Program } from '@/data/local/models';

/**
 * The return path. Everything else in the sheet is what HAPPENED; this is what the coach itself
 * said last time.
 *
 * The founder's observation, and it dissolved what I had been calling an unsolved risk: consistency
 * over months IS the product's "Why?" — the app has always recorded a reason and shown it, and the
 * only missing direction was the reason coming back to the thing that made it.
 */

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 4, healthConnected: false,
};
const program: Program = { id: 'p', frequency: 4, days: [] };

describe('a decision remembers itself', () => {
  it('keeps every note from a plan, each stamped with when the plan landed', () => {
    const log = appendDecisions(undefined, [
      { ex: 'bb_bench_press', say: 'You cleared 12 at 30 twice, so we go up.' },
      { ex: 'bb_row', say: 'Holding here — your rows have been shorter than the ask.' },
    ], '2026-07-31T12:00:00.000Z');
    expect(log).toEqual([
      { at: '2026-07-31T12:00:00.000Z', ex: 'bb_bench_press', say: 'You cleared 12 at 30 twice, so we go up.' },
      { at: '2026-07-31T12:00:00.000Z', ex: 'bb_row', say: 'Holding here — your rows have been shorter than the ask.' },
    ]);
  });

  it('keeps same-instant decisions apart rather than de-duplicating them', () => {
    // Two decisions about two lifts in one plan are two decisions. Collapsing on time drops one.
    const log = appendDecisions(undefined, [{ ex: 'a', say: 'one' }, { ex: 'b', say: 'two' }], 't');
    expect(log.length).toBe(2);
  });

  it('drops a note with nothing in it rather than logging an empty reason', () => {
    const log = appendDecisions(undefined, [{ say: '' }, { ex: 'a' } as never, { say: 'kept' }], 't');
    expect(log).toEqual([{ at: 't', say: 'kept' }]);
  });

  it('leaves the log untouched when a plan explained nothing', () => {
    const before: CoachDecision[] = [{ at: 't0', say: 'earlier' }];
    expect(appendDecisions(before, [], 't1')).toBe(before);
    expect(appendDecisions(before, undefined, 't1')).toBe(before);
  });

  it('keeps the RECENT past when it overflows — that is what contradicts', () => {
    let log: CoachDecision[] = [];
    for (let i = 0; i < COACH_LOG_CAP + 15; i++) {
      log = appendDecisions(log, [{ say: `decision ${i}` }], `t${i}`);
    }
    expect(log.length).toBe(COACH_LOG_CAP);
    expect(log[0].say).toBe('decision 15'); // the oldest fell off the front
    expect(log.at(-1)!.say).toBe(`decision ${COACH_LOG_CAP + 14}`);
  });
});

describe('what the coach is reminded of', () => {
  const log: CoachDecision[] = [
    { at: 't1', ex: 'bb_bench_press', say: 'up to 32.5' },
    { at: 't2', ex: 'bb_row', say: 'holding' },
    { at: 't3', ex: 'bb_bench_press', say: 'holding — you reported a tender shoulder' },
  ];

  it('reads newest first, because the newest is what a new decision contradicts', () => {
    expect(recentDecisions(log).map((d) => d.at)).toEqual(['t3', 't2', 't1']);
  });

  it('narrows to one lift when that is the question', () => {
    expect(recentDecisions(log, { forExercise: 'bb_bench_press' }).map((d) => d.at)).toEqual(['t3', 't1']);
  });

  it('takes a limit off the top, not the bottom', () => {
    expect(recentDecisions(log, { limit: 2 }).map((d) => d.at)).toEqual(['t3', 't2']);
  });

  it('says nothing about a log that does not exist yet', () => {
    expect(recentDecisions(undefined)).toEqual([]);
  });
});

describe('and it reaches the sheet', () => {
  it('travels back newest first, so the coach reads its own last word first', () => {
    const decided: CoachDecision[] = [
      { at: 't1', ex: 'bb_bench_press', say: 'up to 32.5' },
      { at: 't2', ex: 'bb_bench_press', say: 'holding — you reported a tender shoulder' },
    ];
    const f = coachFacts({ profile, plan: null, history: [], decided });
    expect(f.decided!.map((d) => d.say)).toEqual([
      'holding — you reported a tender shoulder',
      'up to 32.5',
    ]);
  });

  it('is ABSENT on an athlete the coach has never decided anything for', () => {
    // Empty would read as "I have decided nothing", which is a different statement from "this is
    // the first decision".
    expect('decided' in coachFacts({ profile, plan: null, history: [] })).toBe(false);
    expect('decided' in coachFacts({ profile, plan: null, history: [], decided: [] })).toBe(false);
  });

  it('carries no private second reason — one sentence, said and remembered', () => {
    // The design this test defends: a public `say` plus a private `why` would let the coach hold a
    // real reason it never told her, and the gap between them IS the drift this app forbids.
    const decided: CoachDecision[] = [{ at: 't', ex: 'a', say: 'the reason' }];
    const f = coachFacts({ profile, plan: null, history: [], decided });
    expect(Object.keys(f.decided![0]).sort()).toEqual(['at', 'ex', 'say']);
  });
});
