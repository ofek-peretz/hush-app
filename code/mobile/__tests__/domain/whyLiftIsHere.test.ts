/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A LIFT SHE HAS NEVER TRAINED CAN STILL SAY WHY IT IS THERE.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תמשיך ל-WHY"* — including the exercise not trained yet.
 *
 * The rule the whole file is written against is R7: **Hush never states a reason it did not
 * measure.** So the tests below are mostly about what this must REFUSE to say — a target it did not
 * read, a mark she did not place, a first time that was not her first. A WHY screen that is merely
 * plausible is worse than none, because it teaches her to trust a sentence the engine cannot back.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { liftPlacement } from '@/domain/whyLiftIsHere';
import { weeklyTargets } from '@/engine/v5/assembler';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { fixtureModel } from '@/data/api/fixtureModel';
import { muscleOf } from '@/data/exercises';

const athlete = (over = {}) => ({
  id: 'p1',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
  ...over,
});

/** A hand-built week, so the assertions are about this module and not about the assembler. */
const week = (slots) => ({ days: [{ slots }, { isRest: true, slots: [] }] });

const session = (exerciseId) => ({
  startedAt: new Date('2026-08-01T09:00:00Z').toISOString(),
  programDayId: 'd1',
  sets: [{ exerciseId, setIndex: 0, actualReps: 9, actualWeight: 40 }],
});

describe('⛔ why this lift is in her week', () => {
  it('names the muscle the week’s volume is keyed on', () => {
    const p = liftPlacement('bb_bench_press', week([{ exerciseId: 'bb_bench_press', setCount: 4 }]), {}, 4);
    expect(p.muscle).toBe('Chest');
    expect(p.setsHere).toBe(4);
  });

  it('⛔ answers NOTHING for a lift she is not prescribed — silence beats a made-up reason', () => {
    /*
     * A caller can reach this from a swap list or a stale route. The temptation is to answer from
     * the catalogue alone ("it trains the chest"), which is true and is not an explanation of a week
     * she was never given. R7 applies to the question as much as to the answer.
     */
    expect(liftPlacement('bb_bench_press', week([{ exerciseId: 'db_row', setCount: 3 }]), {}, 4)).toBeNull();
    expect(liftPlacement('bb_bench_press', null, {}, 4)).toBeNull();
    expect(liftPlacement('not_a_real_lift', week([{ exerciseId: 'not_a_real_lift', setCount: 3 }]), {}, 4)).toBeNull();
  });

  it('⛔ the target it states is the SAME NUMBER the assembler dealt against', () => {
    /*
     * The one assertion that keeps this honest. If the sheet ever answered from a stored copy, her
     * next body-map edit would move the engine's target and leave the explanation quoting the old
     * one — a reason that was true last week, presented as this week's.
     */
    const map = { Back: 'emphasis' };
    const p = liftPlacement('db_row', week([{ exerciseId: 'db_row', setCount: 4 }]), map, 5);
    expect(p.weeklyTarget).toBe(weeklyTargets(map, CANONICAL_MUSCLE_ORDER, 5).Back);
  });

  it('⛔ HER MARK is reported, and only where she placed it', () => {
    const marked = liftPlacement('db_row', week([{ exerciseId: 'db_row', setCount: 4 }]), { Back: 'emphasis' }, 4);
    const plain = liftPlacement('db_row', week([{ exerciseId: 'db_row', setCount: 4 }]), { Chest: 'emphasis' }, 4);
    expect(marked.stance).toBe('emphasis');
    expect(plain.stance).toBe('normal'); // a mark on ANOTHER muscle is not this lift's reason
  });

  it('a mark really does raise the target it is reported beside', () => {
    // Otherwise "you marked this" would sit next to a number no different from anyone else's.
    const marked = liftPlacement('db_row', week([{ exerciseId: 'db_row', setCount: 4 }]), { Back: 'emphasis' }, 4);
    const plain = liftPlacement('db_row', week([{ exerciseId: 'db_row', setCount: 4 }]), {}, 4);
    expect(marked.weeklyTarget).toBeGreaterThan(plain.weeklyTarget);
  });

  it('⛔ says a lift fills a movement the muscle may not be programmed without', () => {
    // `ESSENTIAL_PATTERNS.Back = ['row', 'pulldown']` — a back with no vertical pull is incomplete,
    // and that IS the engine's stated reason for the pulldown being there rather than a third row.
    const pulldown = liftPlacement('lat_pulldown', week([{ exerciseId: 'lat_pulldown', setCount: 3 }]), {}, 4);
    expect(pulldown.essential).toBe(true);
  });

  it('⛔ …and reads a SUPPORTED variant as the movement it is', () => {
    /*
     * `inverted_row` carries `row_supported`, not `row`. Asking the essentials list about the raw
     * pattern would answer "no" for a lift that is plainly the muscle's row — the same collapse
     * `essentialPatternOf` exists for in the time cap, asked here through the same function so the
     * two can never disagree about what a movement is.
     */
    const supported = liftPlacement('inverted_row', week([{ exerciseId: 'inverted_row', setCount: 3 }]), {}, 4);
    expect(supported.essential).toBe(true);
  });

  it('an ordinary accessory does not claim to be essential', () => {
    const shrug = liftPlacement('bb_shrug', week([{ exerciseId: 'bb_shrug', setCount: 3 }]), {}, 4);
    expect(shrug.essential).toBe(false);
  });

  it('⛔ a compound says what else it feeds; an isolation claims nothing', () => {
    /*
     * ⚠️ THE DEADLIFT AND NOT THE BACK SQUAT, and the first draft of this test had it wrong.
     *
     * `indirectMusclesOf` credits a muscle only when that muscle owns lifts of the SAME capability —
     * so a back squat (`knee_dominant`) is NOT credited with the glutes, whose pool is
     * `hip_dominant`, even though it plainly extends the hip. The table's own note calls that
     * conservatism deliberate: an over-count tells the engine a muscle is fed when it is not, and
     * the floor pass then stops feeding it.
     *
     * This screen inherits that conservatism rather than softening it. "Also works your glutes" on a
     * squat would be true and would be a sentence the ENGINE does not believe — and the day the two
     * disagree is the day the WHY stops being a reading of what was decided.
     */
    const deadlift = liftPlacement('bb_deadlift', week([{ exerciseId: 'bb_deadlift', setCount: 4 }]), {}, 4);
    const squat = liftPlacement('bb_back_squat', week([{ exerciseId: 'bb_back_squat', setCount: 4 }]), {}, 4);
    const extension = liftPlacement('leg_extension', week([{ exerciseId: 'leg_extension', setCount: 3 }]), {}, 4);
    expect(deadlift.alsoWorks).toContain('Glutes');
    expect(squat.alsoWorks).toEqual([]); // the engine does not count it, so neither does the sheet
    expect(extension.alsoWorks).toEqual([]); // one joint — it cannot be a prime mover anywhere else
  });

  it('⛔ FIRST TIME is her history, not our guess', () => {
    const w = week([{ exerciseId: 'bb_bench_press', setCount: 4 }]);
    expect(liftPlacement('bb_bench_press', w, {}, 4, []).firstTime).toBe(true);
    expect(liftPlacement('bb_bench_press', w, {}, 4, [session('db_row')]).firstTime).toBe(true);
    expect(liftPlacement('bb_bench_press', w, {}, 4, [session('bb_bench_press')]).firstTime).toBe(false);
  });

  it('⛔ the WEEKLY figure counts every occurrence of the muscle; the row’s figure counts one', () => {
    /*
     * A lift she performs twice is two rows on two cards. If the sheet reported the week's total as
     * if it were the row's, a 4-set row would sit under "8 sets" and read as an error — so the two
     * are separate fields and the screen says which is which.
     */
    const twice = {
      days: [
        { slots: [{ exerciseId: 'db_row', setCount: 4 }, { exerciseId: 'lat_pulldown', setCount: 3 }] },
        { slots: [{ exerciseId: 'db_row', setCount: 4 }] },
      ],
    };
    const p = liftPlacement('db_row', twice, {}, 4);
    expect(p.setsHere).toBe(4);
    expect(p.weeklySetsHere).toBe(11); // 4 + 3 + 4, every Back set in the week
  });

  it('a rest day carries no lifts into the count', () => {
    const w = {
      days: [
        { slots: [{ exerciseId: 'db_row', setCount: 4 }] },
        { isRest: true, slots: [{ exerciseId: 'db_row', setCount: 99 }] },
      ],
    };
    expect(liftPlacement('db_row', w, {}, 4).weeklySetsHere).toBe(4);
  });

  it('⛔ EVERY LIFT OF A REAL GENERATED WEEK CAN ANSWER — the week-one case, end to end', async () => {
    /*
     * ⛔ THIS IS THE FOUNDER'S ACTUAL ASK. In her first week nothing has changed, so the load-move
     * sheet has nothing for any row. If a single lift the engine placed cannot say why it is there,
     * the door is still shut on the screen she opens first.
     *
     * Swept over every frequency and both sexes, because a lift only reachable at five days is
     * still a lift she taps.
     */
    const mute: string[] = [];
    for (const days of [2, 3, 4, 5, 6])
      for (const sex of ['male', 'female'])
        for (const bodyMap of [{}, { Back: 'emphasis' }, { Calves: 'off', Core: 'off' }]) {
          const program = await fixtureModel.generateProgram(athlete({ daysPerWeek: days, sex, bodyMap }));
          for (const d of program.days.filter((x) => !x.isRest))
            for (const s of d.slots) {
              const p = liftPlacement(s.exerciseId, program, bodyMap, days, []);
              if (!p) { mute.push(`${sex} ${days}d: ${s.exerciseId} — no answer at all`); continue; }
              // …and every answer has to be usable: a muscle, a real dose, and the sets on the row.
              if (!p.muscle) mute.push(`${sex} ${days}d: ${s.exerciseId} — no muscle`);
              if (p.weeklyTarget <= 0) mute.push(`${sex} ${days}d: ${s.exerciseId} — target ${p.weeklyTarget}`);
              if (p.setsHere <= 0) mute.push(`${sex} ${days}d: ${s.exerciseId} — ${p.setsHere} sets`);
              if (p.muscle !== muscleOf(s.exerciseId)) mute.push(`${sex} ${days}d: ${s.exerciseId} — wrong muscle`);
            }
        }
    expect(mute.slice(0, 8)).toEqual([]);
  });

  it('⛔ …and Core, which is added AFTER the targets are drawn, still answers', async () => {
    /*
     * `addWeeklyCore` puts a core lift on the week outside the volume pot — `weeklyTargets` deletes
     * Core before the assembler ever sees it. So Core is precisely the muscle whose target could
     * come back absent, and the sweep above would have passed it silently if the week she was
     * generated happened not to hold one.
     */
    const program = await fixtureModel.generateProgram(athlete({ daysPerWeek: 4 }));
    const core = program.days.flatMap((d) => (d.isRest ? [] : d.slots)).find((s) => muscleOf(s.exerciseId) === 'Core');
    if (!core) return; // no core lift in this week — nothing to assert, and the sweep covers the rest
    const p = liftPlacement(core.exerciseId, program, {}, 4, []);
    expect(p).not.toBeNull();
    expect(p.muscle).toBe('Core');
    expect(p.setsHere).toBeGreaterThan(0);
  });
});
