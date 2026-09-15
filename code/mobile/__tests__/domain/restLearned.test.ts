/**
 * 2.4d states a rule CHANGING, so the number it shows must be the number the engine will
 * prescribe — not an impression of it. `restWithSample` asks the one median rule the same
 * question with her new sample added.
 */
// @ts-nocheck

// 

import { restWithSample, REST_ISOLATION_S, REST_COMPOUND_S } from '@/domain/restPrescription';
import type { Session } from '@/data/local/models';

const session = (rests: (number | null)[]): Session =>
  ({
    id: 's',
    startedAt: '2026-07-20',
    sets: rests.map((r, i) => ({ exerciseId: 'bb_row', setIndex: i + 1, actualWeight: 44, actualReps: 8, restBeforeS: r })),
  }) as unknown as Session;

describe('what the rest prescription becomes if this rest joins it', () => {
  it('is the median of her samples INCLUDING the one she just took', () => {
    expect(restWithSample([session([150, 150])], 'bb_row', 120)).toBe(150);
    expect(restWithSample([session([120, 120])], 'bb_row', 90)).toBe(120);
  });

  it('a first-set rest is a TRANSITION and never enters the between-sets median', () => {
    const withFirstSet = {
      id: 's',
      startedAt: '2026-07-20',
      sets: [
        { exerciseId: 'bb_row', setIndex: 0, actualWeight: 44, actualReps: 8, restBeforeS: 300 },
        { exerciseId: 'bb_row', setIndex: 1, actualWeight: 44, actualReps: 8, restBeforeS: 100 },
        { exerciseId: 'bb_row', setIndex: 2, actualWeight: 44, actualReps: 8, restBeforeS: 100 },
      ],
    } as unknown as Session;
    // 300 is excluded, so the median of {100, 100, 100} is 100 — not dragged up by the walk.
    // (Three inter samples, because F-17 will not prescribe off fewer — see the next test.)
    expect(restWithSample([withFirstSet], 'bb_row', 100)).toBe(100);
  });

  /*
   * ⛔ THE TWO BELOW CHANGED WITH F-17 (2026-08-16), AND THE HEADER OF THIS FILE IS WHY.
   *
   * It says the number shown must be *"the number the engine will prescribe"* — and under the
   * evidence gate a lift with one or two samples is NOT prescribed her median, it runs the tier
   * bootstrap. These used to assert the raw median, which is the number the screen would have shown
   * while the clock ran something else. The rule did not weaken; the file's own standard is now
   * actually met.
   */
  it('one sample is not yet a prescription — the tier bootstrap is what will run', () => {
    // bb_curl is an isolation lift and she has never rested through it: 75 s, not the 60 she took.
    expect(restWithSample([session([150, 150])], 'bb_curl', 60)).toBe(REST_ISOLATION_S);
  });

  it('…and a compound she has not rested through runs the long bootstrap', () => {
    expect(restWithSample([], 'bb_row', 40)).toBe(REST_COMPOUND_S);
  });

  it('another lift\'s rests are not this lift\'s', () => {
    // Once bb_curl clears the gate on its OWN samples, bb_row's 150s are still nowhere in it.
    const curls = session([60, 60]);
    (curls.sets as any).forEach((s: any) => { s.exerciseId = 'bb_curl'; });
    expect(restWithSample([session([150, 150]), curls], 'bb_curl', 60)).toBe(60);
  });
});
