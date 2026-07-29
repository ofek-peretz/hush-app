/**
 * A PLAN, SHARED (v7 11.4 / 11.5).
 *
 * The feature makes ONE promise — "your weights and your body data never travel with it" — and this
 * file exists to make that promise mechanical rather than remembered. The leak test below reads the
 * whole encoded payload as text and asserts that not one private number appears anywhere in it, so
 * a field added to `Program` next year cannot quietly start travelling.
 */
import {
  PLAN_SHARE_VERSION,
  decodePlan,
  encodePlan,
  planBandSummary,
  planLiftCount,
  sharedPlan,
} from '@/domain/planShare';

/** A program carrying exactly the things that must NOT travel, alongside the things that must. */
const program = {
  id: 'p1',
  frequency: 4,
  days: [
    {
      id: 'd0',
      name: 'Upper A',
      muscleGroups: ['Chest', 'Back', 'Shoulders'],
      isRest: false,
      slots: [
        { exerciseId: 'bb_bench_press', setCount: 4, recommendedWeight: 42.5, oneRepMax: 61 },
        { exerciseId: 'bb_row', setCount: 4, recommendedWeight: 47.5 },
      ],
    },
    { id: 'd1', name: 'Rest', muscleGroups: [], isRest: true, slots: [] },
    {
      id: 'd2',
      name: 'Lower A',
      muscleGroups: ['Quads', 'Hamstrings'],
      isRest: false,
      slots: [{ exerciseId: 'bb_back_squat', setCount: 4, recommendedWeight: 60 }],
    },
  ],
} as never;

describe('what travels', () => {
  it('carries the shape: the days, their muscles, and the lifts', () => {
    const p = sharedPlan(program);
    expect(p.v).toBe(PLAN_SHARE_VERSION);
    expect(p.days.map((d) => d.name)).toEqual(['Upper A', 'Lower A']);
    expect(p.days[0].exerciseIds).toEqual(['bb_bench_press', 'bb_row']);
    expect(p.days[0].muscleGroups).toEqual(['Chest', 'Back', 'Shoulders']);
    expect(planLiftCount(p)).toBe(3);
  });

  it('drops rest days — there is nothing in one to adopt', () => {
    expect(sharedPlan(program).days.some((d) => d.name === 'Rest')).toBe(false);
  });

  it('carries the rep bands — a preference, not a measurement', () => {
    const p = sharedPlan(program, { repBandByMuscle: { Chest: '8-10', Quads: '8-10' } });
    expect(p.repBandByMuscle).toEqual({ Chest: '8-10', Quads: '8-10' });
    expect(planBandSummary(p)).toBe('8–10');
    // …and when they disagree, the reading says so rather than showing only the commonest
    expect(planBandSummary(sharedPlan(program, { repBandByMuscle: { Chest: '8-10', Quads: '12-15' } }))).toMatch(/\+1$/);
  });
});

describe('THE PROMISE · no weight and no body data ever leaves', () => {
  it('no private number appears anywhere in the encoded payload', () => {
    const token = encodePlan(sharedPlan(program, { from: 'Dana', repBandByMuscle: { Chest: '8-10' } }));
    const text = JSON.stringify(decodePlan(token));

    // The loads that sit right beside every lift in the source program.
    for (const secret of ['42.5', '47.5', '60', '61', 'recommendedWeight', 'oneRepMax', 'setCount']) {
      expect(text).not.toContain(secret);
    }
  });

  it('is an ALLOW-LIST — a field added to a program tomorrow does not travel by default', () => {
    const withSecrets = {
      days: [
        {
          name: 'Upper A',
          muscleGroups: ['Chest'],
          isRest: false,
          slots: [{ exerciseId: 'bb_bench_press' }],
          // things a future Program might grow
          bodyweightKg: 78,
          athleteSex: 'female',
          notes: 'my left shoulder hurts',
        },
      ],
    } as never;
    const text = JSON.stringify(sharedPlan(withSecrets));
    expect(text).not.toContain('78');
    expect(text).not.toContain('female');
    expect(text).not.toContain('shoulder');
  });
});

describe('the link', () => {
  it('survives the round trip, non-ASCII names included', () => {
    const p = sharedPlan({ days: [{ name: 'עליון א', muscleGroups: ['חזה'], isRest: false, slots: [{ exerciseId: 'bb_bench_press' }] }] } as never, { from: 'דנה' });
    const back = decodePlan(encodePlan(p));
    expect(back!.days[0].name).toBe('עליון א');
    expect(back!.from).toBe('דנה');
  });

  it('refuses anything it cannot trust', () => {
    expect(decodePlan('not-base64!!')).toBeNull();
    expect(decodePlan(globalThis.btoa('{"v":999,"days":[{"name":"x","exerciseIds":["a"]}]}'))).toBeNull();
    expect(decodePlan(globalThis.btoa('{"v":1,"days":[]}'))).toBeNull();
    expect(decodePlan(globalThis.btoa('{"v":1}'))).toBeNull();
  });

  it('re-reads a hand-crafted payload through the allow-list', () => {
    const hostile = globalThis.btoa(
      JSON.stringify({ v: 1, days: [{ name: 'X', exerciseIds: ['bb_row'], muscleGroups: ['Back'], evil: 'drop table' }] }),
    );
    const text = JSON.stringify(decodePlan(hostile));
    expect(text).not.toContain('evil');
    expect(text).not.toContain('drop table');
  });
});
