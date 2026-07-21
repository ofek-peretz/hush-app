/**
 * The Capability Portrait is computed from the athlete's REAL logged history (founder-directed
 * 2026-06-23) — relative strength per capability from best estimated 1RM vs a sex/bodyweight
 * benchmark, with confidence that rises as real data accrues. No hardcoded demo bars.
 */
import { computePortrait } from '@/data/progression';
import type { Capability, Profile, Session } from '@/data/local/models';

const profile: Pick<Profile, 'sex' | 'weightKg'> = {
  sex: 'male', weightKg: 80,
};

function benchSessions(weight: number, n: number): Session[] {
  return Array.from({ length: n }, (_, k) => ({
    id: `s${k}`,
    programDayId: 'd',
    startedAt: '2026-01-01T00:00:00.000Z',
    state: 'SAVED' as const,
    earlyFinish: false,
    sets: [
      { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: weight, recommendedReps: 5, actualWeight: weight, actualReps: 5, edited: false, persistedAt: '2026-01-01T00:00:00.000Z' },
    ],
  }));
}

describe('cold start — a neutral prior, everything still learning', () => {
  it('no history → low confidence and the still-learning flag everywhere', () => {
    const p = computePortrait([], profile);
    for (const cap of Object.keys(p.perCapability) as Capability[]) {
      expect(p.stillLearning[cap]).toBe(true);
      expect(p.confidence[cap]).toBeLessThan(30);
      expect(p.perCapability[cap]).toBeGreaterThan(0); // a neutral prior, not zero
    }
  });

  it('a self-reported experience cannot move the prior — the last v4 self-report is out', () => {
    // Extra fields are ignored by construction: the signature no longer admits `experience`, so two
    // athletes who once called themselves different things get the identical still-learning bar.
    const a = computePortrait([], { sex: 'male', weightKg: 80 });
    const b = computePortrait([], { sex: 'male', weightKg: 80, experience: 'advanced' } as never);
    expect(b.perCapability).toEqual(a.perCapability);
  });
});

describe('real data drives the bar and confidence', () => {
  it('a strong, repeated lift lifts the bar and exits still-learning', () => {
    const p = computePortrait(benchSessions(120, 4), profile); // e1RM 140 vs 1.3×80=104 → full bar
    expect(p.perCapability.horizontal_push).toBe(1); // clamped to a full bar
    expect(p.confidence.horizontal_push).toBeGreaterThanOrEqual(30);
    expect(p.stillLearning.horizontal_push).toBe(false);
    // capabilities with no data stay on the prior, still learning.
    expect(p.stillLearning.hip_dominant).toBe(true);
  });

  it('heavier history yields a higher (monotonic) bar', () => {
    const light = computePortrait(benchSessions(60, 3), profile).perCapability.horizontal_push;
    const heavy = computePortrait(benchSessions(90, 3), profile).perCapability.horizontal_push;
    expect(heavy).toBeGreaterThan(light);
  });

  it('confidence saturates with more sessions of data', () => {
    const few = computePortrait(benchSessions(60, 1), profile).confidence.horizontal_push;
    const many = computePortrait(benchSessions(60, 5), profile).confidence.horizontal_push;
    expect(many).toBeGreaterThan(few);
  });
});

describe('sex-appropriate benchmark', () => {
  it('the same lift reads as more developed for a woman (lower benchmark)', () => {
    const male = computePortrait(benchSessions(50, 3), { ...profile, sex: 'male' }).perCapability.horizontal_push;
    const female = computePortrait(benchSessions(50, 3), { ...profile, sex: 'female' }).perCapability.horizontal_push;
    expect(female).toBeGreaterThan(male);
  });
});
