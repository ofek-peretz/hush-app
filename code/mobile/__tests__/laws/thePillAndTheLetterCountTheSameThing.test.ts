// @ts-nocheck
// 
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

  /**
   * ⛔ STRENGTHENED 2026-08-05. This pinned `fromCoach ? fromCoach.count : view?.changedCount ?? 0`,
   * which was the right fix at the time — both surfaces read the coach's log. Then Today's pill
   * moved to counting measured DIFFERENCES (a hold is not a change) and this line did not, which
   * would have re-opened this very law's bug in the opposite direction: Today saying 2 and the
   * letter saying 10.
   *
   * Both now ask `coachChanges`, and the letter's ROWS are those changes rather than a parallel
   * list about the same week — so the count and its rows are one derivation on both screens.
   */
  it('and `changedCount` is the measured difference, the same one the pill counts', () => {
    expect(letter()).toContain('const changes = React.useMemo(() => coachChanges(plans.now, plans.before)');
    /*
     * ⛔ TIGHTENED AGAIN 2026-08-12, AND THIS LAW HAD BEEN ASSERTING THE BUG.
     *
     * It pinned `const changedCount = changes?.length ?? 0;` — the diff of two stored `CoachPlan`
     * snapshots — while the letter's ROWS came from `changes ?? fromCoach ?? view`. Two derivations,
     * which is the exact fault this whole file exists to forbid.
     *
     * ⚠️ AND IT WENT LIVE THE DAY THE MODEL WAS REMOVED. With no coach plans stored, `changes` is
     * null on every athlete: the count is 0, `steady` is true, and the letter prints "I changed
     * nothing this week" over a `view` holding every change the engine just made. The founder
     * photographed it and called it a tax letter; the gallery's own `3.1` — *"a week WITH
     * decisions"* — could not draw a single one.
     *
     * The count is the ROWS' length now. `coachChanges` still feeds them (asserted above), so the
     * pill and the letter still count one thing; they just cannot fall out of step over which.
     */
    expect(letter()).toContain('const changedCount = allChanges.length;');
    // …and the rows are derived BEFORE the count that describes them, which is what makes it true.
    expect(letter().indexOf('const allChanges = React.useMemo')).toBeLessThan(
      letter().indexOf('const changedCount ='),
    );
    /*
     * ⚠️ THE LETTER READS THE WEEK'S ANCHOR, not `coachPlanPrev`. The coach answers after every
     * workout, so `prev` is one session old by Wednesday, and a screen titled "what changed this
     * week" would report only its last session. `loadCoachPlanWeek` rotates once per week.
     */
    expect(letter()).toContain('db.loadCoachPlanWeek()');
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
    /*
     * ════ ⛔ "THE SAME WAY" IS THE DERIVATION, NOT THE NUMBER (rewritten 2026-08-26) ════
     *
     * This asserted that Home computed `coachBrief(log, app.weekOpenMs)` and `coachChanges(coachPlan,
     * weekAnchor)` — the WEEK's totals — so that its pill and the letter could never disagree. Two
     * things have since made that the wrong seam to hold:
     *
     *   1. ⛔ FOUNDER, 2026-08-12: *"a count belongs to the thing it counts."* Today's pill draws
     *      `todayChanges` — the rows of the session ON THE CARD — precisely so that a load moved in
     *      Lower B is not counted on a card that does not contain it. Today and the letter are
     *      SUPPOSED to show different numbers now: one session, one week.
     *   2. The week totals it pinned reached a view that read neither (`briefCount`, `briefUnseen`),
     *      so this law was holding a seam between the letter and a number nobody could see — and
     *      passing on it. They were deleted on 2026-08-26.
     *
     * What must still never drift is what they are counting FROM. Both sides read the engine's own
     * stamped changes; the letter over the week, Today over one session. One derivation, two scopes.
     */
    const home = read('src/screens/home/Home.tsx');
    // Today: the engine's stamped directions, filtered to the rows of the card she is looking at.
    expect(home).toContain("const engineDirections: Record<string, 'up' | 'down'> = {};");
    expect(home).toContain('setChangedDir(directions);');
    expect(read('src/screens/home/HomeView.tsx')).toContain('todayChanges > 0');
    // …and the letter, over the same stamped record.
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
  /**
   * ⛔ AND ON 2026-08-05 THE COUNT STOPPED BEING `fromCoach.count` ALTOGETHER.
   *
   * This law's claim — nothing to compare against means no count — is unchanged and is now carried
   * by `coachChanges`, which returns `null` without a previous plan for exactly this reason. What
   * changed is what a change IS: the founder saw "6 changes" over a programme where nothing had
   * moved, because the count was counting the coach's NOTES and a hold gets a note. See
   * `aCountAndItsRowsAreOneDerivation`.
   */
  it('the pill counts differences against the week it opened on, and nothing before there is one', () => {
    const src = read('src/screens/home/Home.tsx');
    /*
     * ⛔ AND ON 2026-08-19 THE SOURCE MOVED AGAIN — from the two coach programmes to the engine.
     *
     * The law is unchanged and is the reason for the move: the pill counts DIFFERENCES, and
     * `coachChanges` subtracts two `CoachPlan` snapshots that nothing has written since the coach
     * was taken out on 2026-08-12. So it answered null on every device, and the pill went dark on
     * every week the engine actually changed something — the same failure this law exists to catch,
     * with the count too low instead of too high.
     *
     * `changeLog` only ever holds a move (a hold stamps nothing), so a hold still cannot be counted
     * — which is the 2026-08-05 half of this law, kept by the source rather than by a filter.
     */
    expect(src).toContain("engineDirections[c.exerciseId] = c.loadTo > c.loadFrom ? 'up' : 'down';");
    /*
     * ⛔ THE WEEK'S TOTAL IS NO LONGER COMPUTED HERE (2026-08-26), and the day-one rule is kept by a
     * stronger thing than a null.
     *
     * `engineMoved` / `coachChanges(coachPlan, weekAnchor)` fed `briefCount` — the WEEK's count —
     * and `HomeView` had stopped reading it when the pill moved onto the workout it belongs to. So
     * the null-on-day-one guard was protecting a number nobody drew, while the pill she actually
     * sees was already governed by something better: `changedDir` is built from `changeLog`, which
     * has NOTHING in it until the engine moves something. On day one there are no entries, so
     * `todayChanges` is 0 and the pill does not render — no count to be null about.
     */
    expect(src).toContain('const directions = Object.keys(engineDirections).length > 0 ? engineDirections : fromPlans;');
    // …and the pill is drawn from that map, filtered to the card's own rows.
    expect(read('src/screens/home/Home.tsx')).toContain('.filter((r) => changedDir[r.ex]).length');
  });

  it('⚠️ and the pill is hidden on an absent count, not drawn as zero', () => {
    /*
     * `null` and `0` must not read the same: one is "no comparison yet", the other is "compared,
     * nothing moved" — and neither is worth a pill on her screen.
     *
     * ⛔ THE PILL MOVED HOUSE ON 2026-08-12 and this assertion followed it. It read
     * `props.briefCount != null && props.briefCount > 0` on `HomeView` — the WEEK's total, drawn on
     * a title row above the column. The pill now belongs to the workout whose loads moved
     * (`WeekColumn`, `w.changes`), because a count on the queued card that included another day's
     * work was describing something she could not see.
     *
     * ⚠️ `?? 0` COLLAPSES BOTH ABSENT CASES INTO THE SAME SILENCE, which is correct here and is why
     * the wording of this test changed from "null" to "absent": a workout with no `changes` field and
     * a workout with zero changes are the same screen — nothing is drawn. What must never happen is
     * a pill reading "0 CHANGES", and `> 0` is what forbids it.
     */
    const col = read('src/components/WeekColumn.tsx');
    expect(col).toContain('const changes = w.changes ?? 0;');
    expect(col).toContain('{!done && changes > 0 ? (');
  });
});
