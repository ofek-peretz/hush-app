import fs from 'fs';
import path from 'path';
import { coachBrief } from '@/domain/coachEarned';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE PILL COUNTS IS WHAT THE LETTER SHOWS.
 *
 * ⛔ FOUNDER, 2026-08-03: *"It also shows one change in green, but when I tap it, it says nothing
 * changed."*
 *
 * Two screens counting two different things. Today's pill counts the COACH's decisions
 * (`coachBrief` over the coach log). The letter's "steady week" flag counted `view.changedCount` —
 * the old engine's tally of lifts whose LOAD moved, derived from history.
 *
 * **A coach that HOLDS a lift and writes the reason is exactly one change by the first measure and
 * zero by the second.** So the pill lit, she tapped it, and the screen told her nothing happened.
 *
 * ⚠️ THIS IS THE AI-MOVE FAILURE SHAPE AGAIN, and the third instance in two days: a surface still
 * reading the deterministic engine's number after the coach became the decider. The correction
 * screen and the estimated time were the other two. Worth looking for more.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const at = new Date('2026-08-02T10:00:00.000Z').toISOString();
const weekOpen = Date.parse('2026-08-01T00:00:00.000Z');

describe('a decision with no load change is still a change', () => {
  it('⛔ the coach holding a lift and saying why counts as one', () => {
    // The exact state the founder hit: a note, no load movement anywhere.
    const brief = coachBrief([{ ex: 'bb_bench_press', say: 'Holding this — you have not cleared the band yet.', at }], weekOpen);
    expect(brief).toMatchObject({ count: 1 });
    expect(brief!.lines).toHaveLength(1);
  });

  it('distinguishes a week with no update from a week where nothing moved', () => {
    // Null means "the coach has never decided anything" — week one. It is not zero.
    expect(coachBrief([], weekOpen)).toBeNull();
    expect(coachBrief(null, weekOpen)).toBeNull();
    // …and a decision from BEFORE this week is a real zero, not an absence.
    const old = [{ ex: 'x', say: 'y', at: '2026-07-20T10:00:00.000Z' }];
    expect(coachBrief(old, weekOpen)).toMatchObject({ count: 0 });
  });
});

describe('the letter reads the same number the pill did', () => {
  const letter = () => read('src/screens/weekly/WeeklyUpdate.tsx');

  it('⛔ "steady" is derived from the coach count, not the engine tally', () => {
    // The bug, in one line: `loaded && (view?.changedCount ?? 0) === 0`.
    expect(letter()).not.toContain('const steady = loaded && (view?.changedCount ?? 0) === 0;');
    expect(letter()).toContain('const steady = loaded && changedCount === 0;');
  });

  it('and `changedCount` prefers the coach, falling back to the engine only when there is none', () => {
    expect(letter()).toContain('const changedCount = fromCoach ? fromCoach.count : view?.changedCount ?? 0;');
  });

  it('⚠️ the count is declared BEFORE the flag that uses it', () => {
    /*
     * Ordering is the whole fix. `changedCount` used to be declared 130 lines below `steady`, which
     * is why `steady` reached for the only number in scope — the engine's.
     */
    const src = letter();
    expect(src.indexOf('const changedCount =')).toBeLessThan(src.indexOf('const steady ='));
    // …and it is declared exactly once, or the lower copy shadows the fix.
    expect(src.match(/const changedCount =/g)).toHaveLength(1);
    expect(src.match(/const \[coachLog, setCoachLog\]/g)).toHaveLength(1);
  });

  it('Today counts it the same way', () => {
    // Both sides of the disagreement, asserted together — this is the pair that must not drift.
    expect(read('src/screens/home/Home.tsx')).toContain('coachBrief(log, app.weekOpenMs)');
    expect(letter()).toContain('coachBrief(coachLog, app.weekOpenMs)');
  });
});

describe('⛔ the fourth instance — the Why sheet inside the workout', () => {
  /*
   * FOUND IN THE 2026-08-03 AUDIT, by hunting for the pattern the three bugs above share: a SURFACE
   * still reading a number the deterministic engine produced, after the coach became the decider.
   *
   * `buildPlanFromCoach` writes a target with `exerciseId`, `setIndex`, `recommendedWeight`,
   * `recommendedReps`, `repBandLo`, `repBandHi` — and **no `reasonType`, no `reasonDelta`.**
   * `WhyLoadSheet` read exactly those two for its verdict and its magnitude, so on every
   * coach-built workout the sheet answered "held · 0" whatever the coach had done to the load.
   *
   * ⚠️ The one screen whose entire job is explaining the number was the screen misreporting it —
   * and nothing failed, because a missing field is `undefined` and `undefined` is not 'increase'.
   */
  const flow = () => read('src/screens/session/SessionFlow.tsx');

  it('the coach target genuinely carries no reason — this is why it broke', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    const built = store.slice(store.indexOf('...(st.item.kind === \'reps\''), store.indexOf('satisfies SetTarget'));
    expect(built).not.toContain('reasonType');
    expect(built).not.toContain('reasonDelta');
  });

  it('so the sheet asks `coachChangedCase` — the same home Today has always used', () => {
    expect(flow()).toContain("import { coachChangedCase } from '@/domain/coachWeek';");
    expect(flow()).toContain('setCoachCase(coachChangedCase(exId, now, before, said, units));');
    expect(flow()).toContain('db.loadCoachPlanPrev()');
  });

  it('⚠️ and the engine fields remain the answer for a plan built the OLD way', () => {
    // Not a fallback for absence — two eras, and a session belongs to exactly one. A coach session
    // with no previous plan is a genuine "hold", not a reason to reach for a field that is not there.
    expect(flow()).toMatch(/coachCase\s*\n?\s*\?\s*coachCase\.verdict/);
    expect(flow()).toContain("target.reasonType === 'increase' ? 'up' : target.reasonType === 'decrease' ? 'down' : 'hold'");
  });

  it('⚠️ the delta is not converted twice', () => {
    // `coachChangedCase` states its delta already in her units; `reasonDelta` is kilograms and needs
    // `displayWeight`. Running the coach's number through the converter would show an American
    // athlete a pound figure multiplied by 2.2.
    expect(flow()).toContain('Math.abs(Number(coachCase.delta ?? 0))');
  });
});

describe('⛔ and on day one there is nothing to have changed', () => {
  /*
   * FOUNDER, BUILD 41: *"it still says there is a number of changes on the TODAY screen."*
   *
   * `coachBrief` counts the coach's DECISIONS this week — and the prompt deliberately asks for one
   * per lift on the FIRST programme, *"where every choice is a decision she has no history to
   * explain it with."* The instruction is right; the label was wrong. On day one those are six
   * OPENING POSITIONS, not six changes, and she was being told her week had changed before she had
   * a week.
   *
   * ⚠️ A CHANGE IS A DIFFERENCE BETWEEN TWO PROGRAMMES. With no previous plan there is no
   * difference — which is the same pair `coachLoadDirections` reads for the arrows two lines below.
   */
  it('the pill counts nothing until there is a programme to compare against', () => {
    const src = read('src/screens/home/Home.tsx');
    expect(src).toContain('setBriefCount(before && fromCoach ? fromCoach.count : null);');
    // …and `before` is the stored previous plan, not something derived on the spot.
    expect(src).toContain('db.loadCoachPlanPrev()');
  });

  it('⚠️ and the pill is hidden on a null count, not drawn as zero', () => {
    // `null` and `0` must not read the same: one is "no comparison yet", the other is "compared,
    // nothing moved" — and only the second is worth a row on her screen.
    expect(read('src/screens/home/HomeView.tsx')).toContain('props.briefCount != null && props.briefCount > 0 ?');
  });
});
