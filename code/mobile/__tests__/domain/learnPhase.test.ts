/**
 * THE "I LEARN YOU" PHASE IS HER NUMBER, NOT A CONSTANT.
 *
 * Loop 1 learns a lift the first time it meets it, so the phase lasts exactly as many sessions as
 * her week holds DIFFERENT workouts. It shipped as `LEARN_COUNT = 4` — right only for an athlete
 * whose week happens to hold four distinct days. Someone training twice a week was promised four
 * learning sessions, two of them re-runs of work the engine had already seen; someone training six
 * had it stop at four (founder 2026-07-28).
 */
import { distinctWorkoutCount } from '@/domain/schedule';

const asDays = (lists: { exerciseIds: string[] }[]) =>
  lists.map((d) => ({ slots: d.exerciseIds.map((exerciseId) => ({ exerciseId })) }));

describe('distinctWorkoutCount — the work, not the label', () => {
  it('counts each different workout once', () => {
    expect(distinctWorkoutCount([
      { slots: [{ exerciseId: 'a' }, { exerciseId: 'b' }] },
      { slots: [{ exerciseId: 'c' }] },
    ])).toBe(2);
  });

  it('a REPEAT is a repeat whatever it is called — same lifts, one workout', () => {
    // The assembler's hole guard borrows a donor's lead lift for an empty day, so two days really
    // can carry the same work under different names ("Upper A" / "Upper B").
    expect(distinctWorkoutCount([
      { slots: [{ exerciseId: 'a' }, { exerciseId: 'b' }] },
      { slots: [{ exerciseId: 'b' }, { exerciseId: 'a' }] }, // same set, other order
    ])).toBe(1);
  });

  it('rest days and empty days are not workouts', () => {
    expect(distinctWorkoutCount([
      { isRest: true, slots: [] },
      { slots: [] },
      { slots: [{ exerciseId: 'a' }] },
    ])).toBe(1);
  });

  /*
   * ⛔ TWO TESTS HERE COMPOSED A WEEK WITH THE ASSEMBLER AND COUNTED ITS DAYS. The assembler is
   * deleted — nothing composes a week. What they were guarding survives in `distinctWorkoutCount`
   * above, which is the part that was ever ours: given a programme, how many distinct workouts is
   * it. Where that programme comes from stopped being a question this file can answer.
   */
});
