/**
 * A PLAN, SHARED (v7 11.4 / 11.5).
 *
 * The feature makes ONE promise — "your weights and your body data never travel with it" — and this
 * file exists to make that promise mechanical rather than remembered. The leak test below reads the
 * whole encoded payload as text and asserts that not one private number appears anywhere in it, so
 * a field added to `Program` next year cannot quietly start travelling.
 */
// @ts-nocheck

// 

import {
  PLAN_SHARE_VERSION,
  decodePlan,
  encodePlan,
  planBandSummary,
  planLiftCount,
  sharedPlan,
} from '@/domain/planShare';

/**
 * THE COACH'S PLAN, carrying exactly the things that must NOT travel beside the things that must.
 *
 * It reads the coach's programme now rather than the engine's `Program`, and that RAISED the stakes
 * of the leak test below rather than changing it: the coach's plan holds her actual prescription —
 * every load, every band, every rest — so a careless port would have started sharing precisely the
 * numbers this feature exists to keep private.
 *
 * There is also a RUN in it. A shared week can contain one, and filtering to lifts would share a
 * marathon plan as its three strength sessions with the running quietly missing.
 */
const program = {
  v: 2,
  sessions: [
    {
      name: 'Upper A',
      blocks: [
        { rounds: 4, restS: 120, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 42.5 }] },
        { rounds: 4, restS: 90, items: [{ kind: 'reps', ex: 'bb_row', reps: [8, 12], load: 47.5 }] },
      ],
    },
    {
      name: 'Lower A',
      blocks: [
        { rounds: 4, restS: 150, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 60 }] },
        { rounds: 1, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 3000 }] },
      ],
    },
  ],
} as never;

describe('what travels', () => {
  it('carries the shape: the days, their muscles, and the lifts', () => {
    const p = sharedPlan(program);
    expect(p.v).toBe(PLAN_SHARE_VERSION);
    expect(p.days.map((d) => d.name)).toEqual(['Upper A', 'Lower A']);
    expect(p.days[0].exerciseIds).toEqual(['bb_bench_press', 'bb_row']);
    // The muscle line is READ from the catalogue — the coach names its own sessions and does not
    // state muscles, and inventing them would be a claim about a week nobody made.
    expect(p.days[0].muscleGroups).toEqual(['Chest', 'Back']);
    // The run travels too. A movement resolves to no muscle, so it adds none — a run is not a muscle.
    expect(p.days[1].exerciseIds).toEqual(['bb_back_squat', 'run_outdoor']);
    expect(p.days[1].muscleGroups).toEqual(['Quads']);
    expect(planLiftCount(p)).toBe(4);
  });

  it('drops a session with nothing in it', () => {
    // There are no rest DAYS to drop any more — the coach writes only the sessions she trains — but
    // an empty one is still nothing to adopt.
    const withEmpty = { v: 2, sessions: [{ name: 'Ghost', blocks: [] }, ...(program as never as { sessions: unknown[] }).sessions] } as never;
    expect(sharedPlan(withEmpty).days.some((d) => d.name === 'Ghost')).toBe(false);
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
      v: 2,
      sessions: [
        {
          name: 'Upper A',
          blocks: [
            {
              rounds: 4,
              restS: 120,
              items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 42.5, say: 'a rep short of failure' }],
            },
          ],
          // things a coach plan might grow, and things it already has that must not travel
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
    // The coach's own numbers and its instruction to HER: her prescription, not the week's shape.
    expect(text).not.toContain('42.5');
    expect(text).not.toContain('failure');
    expect(text).not.toContain('restS');
  });
});

describe('the link', () => {
  it('survives the round trip, non-ASCII names included', () => {
    const p = sharedPlan(
      { sessions: [{ name: 'עליון א', blocks: [{ items: [{ ex: 'bb_bench_press' }] }] }] } as never,
      { from: 'דנה' },
    );
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
