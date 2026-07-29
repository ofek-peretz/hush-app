/**
 * 2.4d states a rule CHANGING, so the number it shows must be the number the engine will
 * prescribe — not an impression of it. `restWithSample` asks the one median rule the same
 * question with her new sample added.
 */
import { restWithSample } from '@/domain/restPrescription';
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
      ],
    } as unknown as Session;
    // 300 is excluded, so the median of {100, 100} is 100 — not dragged up by the walk.
    expect(restWithSample([withFirstSet], 'bb_row', 100)).toBe(100);
  });

  it('another lift\'s rests are not this lift\'s', () => {
    expect(restWithSample([session([150, 150])], 'bb_curl', 60)).toBe(60);
  });
});
