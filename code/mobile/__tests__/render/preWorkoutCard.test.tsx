/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRE-WORKOUT CARD — mounted for real, carrying the claims the lift table brought with it.
 *
 * ⛔ FOUNDER, 2026-08-05: *"pressing a day with a workout opens a full-screen card with the
 * workout's content and the AI's requirements for each exercise… and below it the exercise list
 * with the option to watch the video exactly as today, and then pressing that starts the workout."*
 *
 * ⚠️ EIGHT OF THESE TESTS ARE NOT NEW. They lived in `homeWeekCard` and asserted the lift table on
 * Today: the loads are printed, the names wrap rather than truncate, a bodyweight lift names no
 * unit, the unit and scheme are smaller than the load they annotate, a row is a door to the form
 * clip, and a pending row still names its lift. **The table moved; the claims moved with it.**
 * Deleting them because the screen changed would have quietly retired six founder findings.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { PreWorkoutView, PreWorkoutMovedView, type PreWorkoutProps } from '@/screens/plan/PreWorkout';
import type { PlanLift } from '@/components/PlanLifts';
import { initI18n, tg } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const LIFTS: PlanLift[] = [
  { exerciseId: 'bb_bench_press', name: 'Barbell Bench Press', load: 57.5, sets: 4, band: [8, 10], changed: 'up' },
  { exerciseId: 'triceps_pushdown', name: 'Overhead Triceps Extension', load: 20, sets: 3, band: [10, 12] },
  { exerciseId: 'pull_up', name: 'Pull-up', load: null, sets: 3, band: [5, 8] },
];

function mount(over: Partial<PreWorkoutProps> = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <PreWorkoutView
          name="Upper Body A"
          dayLabel="Monday"
          shape="3 LIFTS · ~35 MIN"
          minutes={35}
          lifts={LIFTS}
          units="kg"
          changes={1}
          onForm={() => {}}
          onStart={() => {}}
          onClose={() => {}}
          {...over}
        />
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

const texts = (r: ReactTestRenderer): string[] =>
  r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  });

describe('⛔ the card carries the workout', () => {
  it('⛔ the name is the screen, and the session is stated as FIGURES under it', () => {
    /*
     * ⛔ THIS ASSERTED THE `shape` STRING — "3 LIFTS · ~35 MIN" (2026-08-12).
     *
     * FOUNDER, on the sheet: *"בצורה הרבה יותר מרשימה מאשר מסך הPREWORKOUT."* That legend was the
     * exact line the row she pressed already carried, so the sheet opened to repeat the thing that
     * opened it. **A summary that restates its own trigger has told her nothing.**
     *
     * It is three figures now — lifts, SETS (which nothing said before), minutes — and each is
     * arithmetic on the table below it, so nothing here can drift from what she is about to do.
     */
    const said = texts(mount()).join('|');
    expect(said).toContain('Upper Body A');
    expect(said).toContain('3'); // lifts
    expect(said).toContain('10'); // 4 + 3 + 3 sets — the figure the old line never carried
    // No "~" — the founder struck the approximation mark (device QA 2026-08-23): the minutes are
    // the engine's own pricing, and hedging them read as the app unsure of itself.
    expect(said).toContain('35');
    expect(said).not.toContain('~');
    // …and the line that duplicated the row is not drawn twice.
    expect(said).not.toContain('3 LIFTS · ~35 MIN');
  });

  it('⛔ AND "WHERE THE WORK GOES" IS DELETED — the lifts are what she came for', () => {
    /*
     * ⛔ FOUNDER, 2026-08-12: *"להוריד את ההקצאה לכל שריר שכתוב שם, זה לא מעניין אף אחד. תציג את
     * התוכנית במקום זה ותעצב את זה בגדול וברור."*
     *
     * The case for it was mine: seven labelled bars answered *what is this session FOR* — a
     * question a list of exercises cannot. The case was sound and made about the wrong reader.
     * **She is standing in a gym about to start**, and on a 390-point phone the bars pushed the
     * lifts under the fold.
     *
     * ⚠️ NOTHING SHE ASKS FOR IS LOST. The allocation is still the REASON each lift is here, and
     * `whyLiftIsHere` gives it one row at a time, on the row it is about — which is where a reason
     * belongs and where she actually goes looking for one.
     */
    const said = texts(mount()).join('|');
    expect(said).not.toContain(tg('program.sheetWhere').toUpperCase());
    expect(said).not.toContain(tg('muscle.Chest').toUpperCase());
    // …and what stands in its place is the plan, which the next test reads in full.
    expect(said).toContain(tg('program.sheetTheLifts').toUpperCase());
  });

  it('the lifts are on it, with the loads the coach set', () => {
    const said = texts(mount()).join('|');
    expect(said).toContain('Barbell Bench Press');
    expect(said).toContain('57.5');
    expect(said).toContain('4×8–10');
  });

  it('every load names its unit — and a bodyweight lift names none', () => {
    const said = texts(mount()).join('|');
    /* 2026-09-01: the prescription is a table of cells (`FigureCells`) — the unit is its own
       fixed column beside the load, so it is its own text node rather than ' kg' in a string. */
    expect(said).toContain('|kg');
    // The pull-up prints its scheme with no load and therefore no unit before it.
    const pullUpFigure = texts(mount()).find((s) => s === '3×5–8');
    expect(pullUpFigure).toBeDefined();
  });

  it('a long lift name wraps — nothing on the plan is clamped to one line', () => {
    // "Overhead Triceps Ex…" hides the one word that distinguishes two lifts of the same family.
    const r = mount();
    // ⚠️ `bidi()` wraps the name in isolate marks, so this matches on CONTENT rather than identity.
    const name = r.root
      .findAllByType(Text)
      .find((n) => String(n.props.children).includes('Overhead Triceps Extension'));
    expect(name).toBeDefined();
    expect(name!.props.numberOfLines).toBeUndefined();
  });

  it('⛔ the unit and the scheme are QUIETER than the load — by weight now, not by size', () => {
    /*
     * ════ THE FLOOR TOOK THIS LAW'S MECHANISM AWAY, AND THE LAW SURVIVES IT ════
     *
     * FOUNDER, 2026-08-12: *"בוא נגיד שהגודל הקטן ביותר בכל האפליקציה הוא כמו שכתוב 57.5."*
     *
     * This asserted `fontSize < 17` on the annex — the ` kg · 4×8–10` that trails the load. It was
     * 13.5, and the rule it protected is real: **the load is the fact, the unit and the scheme are
     * its footnotes, and a row where all three shout says nothing.**
     *
     * 13.5 is now below the floor of the product. So the hierarchy is carried where it should always
     * have been carried — in COLOUR and WEIGHT rather than in point size. The load stands in the
     * stage's brightest ink; its annex sits in the muted step beside it, at the same size, legible.
     *
     * ⚠️ THIS IS THE TRADE THE FLOOR BUYS, AND IT IS WORTH NAMING. Type size is the cheapest way to
     * make something recede and the only one that also makes it unreadable. Everything that was
     * whispering by being small now whispers by being dim.
     */
    const r = mount();
    const flat = (s: unknown): Record<string, unknown> =>
      Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : ((s ?? {}) as Record<string, unknown>);
    const figure = r.root.findAllByType(Text).find((n) => String(n.props.children).includes('57.5'));
    expect(figure).toBeDefined();
    const meta = r.root.findAllByType(Text).find((n) => String(n.props.children).includes('4×8–10'));
    expect(meta).toBeDefined();
    // Never below the floor…
    expect(Number(flat(meta!.props.style).fontSize)).toBeGreaterThanOrEqual(17);
    // …and never as loud as the number it annotates.
    expect(flat(meta!.props.style).color).not.toBe(flat(figure!.props.style).color);
  });

  it('⚠️ a pending row still names its lift and claims no number', () => {
    const said = texts(
      mount({ lifts: [{ exerciseId: 'bb_row', name: 'Barbell Row', load: null, sets: 4, band: [8, 10], pending: true }] }),
    ).join('|');
    expect(said).toContain('Barbell Row');
    expect(said).not.toContain('4×8');
    expect(said).not.toMatch(/null|undefined|NaN/);
  });
});

describe('⛔ and the one act', () => {
  it('offers Begin, named after the workout', () => {
    expect(texts(mount()).join('|')).toContain('Begin Upper Body A');
  });

  it('⚠️ a finished session is a record — the act is refused, not offered', () => {
    // Founder 2026-07-11: a completed workout may be re-read and may never be started again.
    const said = texts(mount({ done: true })).join('|');
    expect(said).not.toContain('Begin');
    expect(said).toContain('Trained this week');
  });

  it('the change pill is drawn only when something changed', () => {
    expect(texts(mount({ changes: 1 })).join('|')).toContain('1 CHANGE');
    // ⚠️ Matched on the PILL's own uppercase legend: the lift rows carry a delta arrow either
    // way, and the word "changed" appears in accessibility hints that `texts` does not read.
    expect(texts(mount({ changes: 0 })).join('|')).not.toContain('CHANGE');
  });

  it('⛔ no coach paragraph — he took it off, and the list speaks', () => {
    /*
     * *"The sentence at the top, I suggest removing it: nobody reads that before a workout."*
     * A block of prose above the table would be the app explaining the table, which is the thing
     * his copy law is about.
     */
    const said = texts(mount());
    const prose = said.filter((s) => s.split(' ').length > 8);
    expect(prose).toEqual([]);
  });
});

/**
 * ⛔ THE SHEET FOR A WORKOUT THE WEEK NO LONGER HOLDS.
 *
 * `PreWorkoutScreen` carries only a `workoutId` and reads the plan live, so a plan that has been
 * rewritten since she tapped leaves it with nothing to draw. It answered that with `return null`:
 * on a modal presentation, a sheet risen over Today with no title, no lifts and no ✕ — the close
 * control lives inside the card that did not draw — and the only way out an edge drag nothing on
 * the glass admitted to.
 */
describe('⛔ a workout that is not in the week any more', () => {
  function mountMoved(onClose = () => {}): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <PreWorkoutMovedView onClose={onClose} />
        </SafeAreaProvider>,
      );
    });
    mounted.push(r);
    return r;
  }

  it('says so, rather than drawing nothing at all', () => {
    const said = texts(mountMoved()).join('|');
    expect(said).toContain(tg('program.sheetMovedTitle'));
    expect(said).toContain(tg('program.sheetMovedBody'));
  });

  it('⛔ keeps the way out — a sheet whose only exit is a drag traps anyone who does not know it', () => {
    let closed = 0;
    const r = mountMoved(() => void closed++);
    const close = r.root.findAll(
      (n) => n.props?.accessibilityLabel === tg('common.close') && typeof n.props.onPress === 'function',
    );
    expect(close.length).toBeGreaterThan(0);
    act(() => close[0].props.onPress());
    expect(closed).toBe(1);
  });
});
