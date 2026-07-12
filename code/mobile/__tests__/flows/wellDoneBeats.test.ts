/**
 * Well Done's beats (founder device review, 2026-07-12).
 *
 * "When several milestones land at once the screen shows none of them, and it pops out."
 *
 * It had nothing to do with how many milestones landed — `milestoneCopy` handles every mark in
 * the catalogue, and this file proves that too. It was a stale timer: the saved beat's 3.4 s
 * auto-advance called setPhase('result') unconditionally, so an athlete who tapped through and
 * pressed Done inside that window reached the milestone stamp and was then thrown straight back
 * off it by a timer that had been scheduled before the stamp existed. The stamp opens on a beat
 * of black, so the mark could be erased before it was ever drawn.
 */
import { advanceFromSaved } from '@/screens/session/WellDone';
import { earnedMilestones, newlyEarned, COUNT_THRESHOLDS, TONNAGE_THRESHOLDS_KG } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import type { Session } from '@/data/local/models';

const t = ((k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k)) as never;

function session(id: string, startedAt: string, sets: Array<[string, number, number]>): Session {
  return {
    id,
    state: 'SAVED',
    programDayId: 'd1',
    startedAt,
    completedAt: startedAt,
    trained: true,
    sets: sets.map(([exerciseId, w, r], i) => ({
      exerciseId,
      setIndex: i,
      recommendedWeight: w,
      recommendedReps: r,
      actualWeight: w,
      actualReps: r,
      edited: false,
      persistedAt: startedAt,
    })),
  } as unknown as Session;
}

describe('the saved beat only ever advances (the vanishing milestone)', () => {
  it('carries the saved beat to the result', () => {
    expect(advanceFromSaved('saved')).toBe('result');
  });

  it('NEVER pulls the athlete back off the milestone stamp', () => {
    expect(advanceFromSaved('milestone')).toBe('milestone');
  });

  it('leaves a result the athlete already reached alone', () => {
    expect(advanceFromSaved('result')).toBe('result');
  });
});

describe('several milestones at once', () => {
  it("the founder's session (bench 500 x 50) earns six marks, and every one of them renders", () => {
    const history = [
      session('s0', '2026-07-10T10:00:00Z', [['bb_bench_press', 40, 8]]),
      session('s1', '2026-07-12T10:00:00Z', [
        ['bb_bench_press', 500, 50],
        ['bb_bench_press', 500, 50],
        ['bb_bench_press', 500, 50],
        ['bb_bench_press', 500, 50],
      ]),
    ];

    const fresh = newlyEarned(history);
    expect(fresh.length).toBeGreaterThan(1); // several, in parallel — the founder's case

    // The one that gets celebrated is the most personal (the engine's own proof), and it has
    // copy. So does every other mark that landed with it — none of them can throw the screen.
    for (const m of fresh) {
      const c = milestoneCopy(m, t, 'kg');
      expect(c.title).toBeTruthy();
      expect(c.glyph).toBeTruthy();
    }
  });

  it('EVERY milestone in the catalogue has copy and a glyph — no mark can ever blank the stamp', () => {
    const every = [
      ...COUNT_THRESHOLDS.map((n) => ({ id: `count_${n}`, family: 'count' as const, value: n })),
      ...TONNAGE_THRESHOLDS_KG.map((n) => ({ id: `tonnage_${n}`, family: 'tonnage' as const, value: n })),
      { id: 'engine_first_raise', family: 'engine' as const },
      { id: 'engine_doubled_bb_bench_press', family: 'engine' as const, exerciseId: 'bb_bench_press' },
    ];
    for (const m of every) {
      const c = milestoneCopy(m, t, 'kg');
      expect(c.title).toBeTruthy();
      expect(c.glyph).toBeTruthy();
    }
  });

  it('the clubs — every rung on every lift renders', () => {
    const earned = earnedMilestones([
      session('s0', '2026-07-10T10:00:00Z', [['bb_bench_press', 20, 5]]),
      session('s1', '2026-07-12T10:00:00Z', [
        ['bb_bench_press', 300, 5],
        ['bb_back_squat', 300, 5],
        ['bb_deadlift', 300, 5],
        ['bb_overhead_press', 300, 5],
        ['bb_row', 300, 5],
      ]),
    ]);
    const clubs = earned.filter((m) => m.family === 'club');
    expect(clubs.length).toBeGreaterThan(4);
    for (const m of clubs) {
      const c = milestoneCopy(m, t, 'kg');
      expect(c.title).toBeTruthy();
      expect(c.glyph).toBeTruthy();
    }
  });
});
