/**
 * ════ NOTHING IS LIT THAT CANNOT SAY WHY ════
 *
 * Today lights a load in the direction it moved — up is moss, down is blue, hold is cream, on every
 * surface without exception (founder 2026-07-29). A lit figure is a CLAIM: something changed here.
 * Tapping it opens the case that backs the claim.
 *
 * Both halves moved when the coach took over, and they moved differently, which is why this file
 * exists:
 *
 *   · the DIRECTION is derived — the difference between the current plan and the one before it,
 *     because the coach states a programme and never a delta;
 *   · the REASON is reported — the coach's own sentence, matched to the lift by the note it wrote.
 *
 * Derived and reported can disagree. A lift can move without the coach having written a note about
 * it, and the rule for that case is the one thing this file is really about: **it keeps its colour
 * and has no sheet.** The colour is a fact we computed from two programmes we hold. A sentence is
 * not, and inventing one to sit under the colour would be the app arguing on the coach's behalf.
 */
import { coachLoadDirections, coachChangedCase } from '@/domain/coachWeek';
import { parseCoachPlan, type CoachPlan } from '@/domain/coachPlan';

const plan = (bench: number, squat: number, extra?: string): CoachPlan => {
  const r = parseCoachPlan(
    JSON.stringify({
      say: 'ok',
      sessions: [{
        name: 'Upper',
        blocks: [
          { rounds: 4, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: bench }] },
          { rounds: 3, restS: 120, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [6, 8], load: squat }] },
          ...(extra ? [{ rounds: 3, items: [{ kind: 'reps', ex: extra, reps: [10, 12], load: 20 }] }] : []),
        ],
      }],
    }),
  );
  if (!r.ok) throw new Error(`fixture must parse, got ${r.reason}`);
  return r.answer.plan!;
};

describe('which way it moved', () => {
  it('reads a raise, an ease and a hold off two programmes', () => {
    const dirs = coachLoadDirections(plan(42.5, 60), plan(40, 62.5));
    expect(dirs).toEqual({ bb_bench_press: 'up', bb_back_squat: 'down' });
  });

  it('says HOLD when the load did not move — not silence', () => {
    // A hold is a decision, and cream is its colour. Dropping it would make "unchanged" and
    // "not in the plan" look identical.
    expect(coachLoadDirections(plan(40, 60), plan(40, 60))).toEqual({
      bb_bench_press: 'hold',
      bb_back_squat: 'hold',
    });
  });

  it('leaves a lift that ARRIVED unmarked — it has not moved', () => {
    // A new lift has no previous load. Lighting it as a raise would claim a progression that never
    // happened, on the athlete's very first sight of the exercise.
    const dirs = coachLoadDirections(plan(40, 60, 'lateral_raise'), plan(40, 60));
    expect('lateral_raise' in dirs).toBe(false);
  });

  it('says nothing at all before there is a second programme to compare', () => {
    // Her first week. Everything is new, and none of it has moved.
    expect(coachLoadDirections(plan(40, 60), null)).toEqual({});
  });
});

describe('the case behind the colour', () => {
  it('carries the two loads, the delta, her band, and the coach’s sentence', () => {
    const c = coachChangedCase('bb_bench_press', plan(42.5, 60), plan(40, 60), 'You cleared twelve twice.', 'kg')!;
    expect(c).toMatchObject({
      verdict: 'up',
      from: '40',
      to: '42.5',
      delta: '+2.5',
      band: [8, 12],
      line: { text: 'You cleared twelve twice.' },
    });
  });

  it('writes an ease with a REAL minus sign, like every other figure in the app', () => {
    const c = coachChangedCase('bb_back_squat', plan(40, 57.5), plan(40, 60), 'Easing this while your knee settles.', 'kg')!;
    expect(c.verdict).toBe('down');
    expect(c.delta).toBe('−2.5'); // U+2212, not a hyphen
  });

  it('has nothing to strike through on a hold', () => {
    const c = coachChangedCase('bb_bench_press', plan(40, 60), plan(40, 60), 'Holding this week.', 'kg')!;
    expect(c.verdict).toBe('hold');
    expect(c.from).toBeNull();
    expect(c.delta).toBeNull();
  });

  it('converts for an athlete who reads in pounds', () => {
    expect(coachChangedCase('bb_bench_press', plan(40, 60), plan(40, 60), 'x', 'lb')!.to).toBe('88.18');
  });

  it('⚠️ leaves the SESSIONS empty, because picking them would be inventing the argument', () => {
    /*
     * The engine could name the two sessions that made a decision because it made the decision FROM
     * them, by a rule this app owned. The coach reads her whole record and answers in a sentence.
     * Choosing two sessions afterwards and captioning them "these are why" would be this file
     * inventing the argument and attributing it to the coach. The sentence IS the argument.
     */
    expect(coachChangedCase('bb_bench_press', plan(42.5, 60), plan(40, 60), 'x', 'kg')!.sessions).toEqual([]);
  });

  it('has no case for a lift that is not in the programme', () => {
    expect(coachChangedCase('lateral_raise', plan(40, 60), plan(40, 60), 'x', 'kg')).toBeNull();
  });
});
