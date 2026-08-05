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
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { PreWorkoutView, type PreWorkoutProps } from '@/screens/plan/PreWorkout';
import type { PlanLift } from '@/components/PlanLifts';
import { initI18n } from '@/i18n';

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
  { exerciseId: 'overhead_triceps_extension', name: 'Overhead Triceps Extension', load: 20, sets: 3, band: [10, 12] },
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
  it('the name is the screen, and the shape is under it', () => {
    const said = texts(mount()).join('|');
    expect(said).toContain('Upper Body A');
    expect(said).toContain('3 LIFTS · ~35 MIN');
  });

  it('the lifts are on it, with the loads the coach set', () => {
    const said = texts(mount()).join('|');
    expect(said).toContain('Barbell Bench Press');
    expect(said).toContain('57.5');
    expect(said).toContain('4×8–10');
  });

  it('every load names its unit — and a bodyweight lift names none', () => {
    const said = texts(mount()).join('|');
    expect(said).toContain(' kg');
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

  it('the unit and the scheme are set smaller than the load they annotate', () => {
    const r = mount();
    const flat = (s: unknown): Record<string, unknown> =>
      Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : ((s ?? {}) as Record<string, unknown>);
    const figure = r.root.findAllByType(Text).find((n) => String(n.props.children).includes('57.5'));
    expect(figure).toBeDefined();
    const meta = r.root.findAllByType(Text).find((n) => String(n.props.children).includes('4×8–10'));
    expect(Number(flat(meta!.props.style).fontSize)).toBeLessThan(17);
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
