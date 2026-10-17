/**
 * One more set (2026-09-09, the formula report) — hers to add, at the end of the lift's run,
 * never into the record.
 */
// @ts-nocheck

//

import { addWorkingSet } from '@/state/stores/sessionStore';

type Step = Parameters<typeof addWorkingSet>[0][number];

function plan(runs: [string, number][]): Step[] {
  const out: Step[] = [];
  for (const [ex, n] of runs) {
    for (let i = 0; i < n; i++) {
      out.push({
        exerciseId: ex,
        globalIndex: out.length,
        exerciseSetIndex: i,
        totalSetsInExercise: n,
        target: { exerciseId: ex, setIndex: i, recommendedWeight: 60, recommendedReps: 8, repBandLo: 8, repBandHi: 10, reasonType: i === 0 ? 'increase' : undefined },
        restAfterS: 90,
        lastSetOfExercise: i === n - 1,
        lastSetOfSession: false,
      } as Step);
    }
  }
  out[out.length - 1] = { ...out[out.length - 1], lastSetOfSession: true };
  return out;
}

describe('addWorkingSet', () => {
  it('appends a copy of the run\'s last working set, renumbered, with the run grown by one', () => {
    const p = plan([['a', 3], ['b', 2]]);
    const next = addWorkingSet(p, 1, 'a'); // standing on a's second set
    expect(next).toHaveLength(6);
    const a = next.filter((s) => s.exerciseId === 'a');
    expect(a.map((s) => s.exerciseSetIndex)).toEqual([0, 1, 2, 3]);
    expect(a.every((s) => s.totalSetsInExercise === 4)).toBe(true);
    expect(a.map((s) => s.lastSetOfExercise)).toEqual([false, false, false, true]);
    expect(a[3].target).toMatchObject({ setIndex: 3, recommendedWeight: 60, recommendedReps: 8, repBandLo: 8 });
    expect(a[3].target.reasonType).toBeUndefined(); // a reason belongs to the set it was written for
    expect(a[3].restAfterS).toBe(90);
    expect(next.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(next.map((s) => s.lastSetOfSession)).toEqual([false, false, false, false, false, true]);
    // b is untouched but renumbered.
    expect(next.slice(4).map((s) => s.exerciseId)).toEqual(['b', 'b']);
  });

  it('during the transition rest right after the last set, the added set is the very next thing', () => {
    const p = plan([['a', 2], ['b', 2]]);
    const next = addWorkingSet(p, 2, 'a'); // boundary = b's first set; a's run just ended
    expect(next[2].exerciseId).toBe('a');
    expect(next[2].exerciseSetIndex).toBe(2);
    expect(next[3].exerciseId).toBe('b');
  });

  it('refuses a lift she finished and walked away from — the record gains nothing', () => {
    const p = plan([['a', 2], ['b', 2], ['c', 1]]);
    expect(addWorkingSet(p, 3, 'a')).toBe(p); // on b's second set; a's run ended before the boundary
    expect(addWorkingSet(p, 1, 'zzz')).toBe(p);
  });

  it('never copies a warm-up bridge, and grows only the working count', () => {
    const p = plan([['a', 2]]);
    const bridged = [
      { ...p[0], exerciseSetIndex: -1, warmup: { index: 0, count: 1 }, target: { ...p[0].target, setIndex: -1, recommendedWeight: 30 }, lastSetOfExercise: false },
      ...p,
    ].map((s, i) => ({ ...s, globalIndex: i }));
    const next = addWorkingSet(bridged, 0, 'a');
    expect(next).toHaveLength(4);
    expect(next[3].target.recommendedWeight).toBe(60);
    expect(next[3].warmup).toBeUndefined();
    expect(next[0].warmup).toBeDefined();
  });

  it('a step with no rep prescription cannot be added to', () => {
    const p = plan([['a', 1]]).map((s) => ({ ...s, target: undefined, item: { kind: 'hold', seconds: 45 } }));
    expect(addWorkingSet(p, 0, 'a')).toBe(p);
  });
});
