/**
 * A RUN IS PROGRESS TOO — Progress · Lifts, the day-one gate and the board's arithmetic.
 *
 * The screen decided "nothing has been measured yet" from `entries`, which is built from logged
 * SETS. So an athlete three runs in — kilometres, calories and minutes all sitting in the aggregate,
 * a CARDIO row on the board waiting for exactly her — was shown a dashed ghost and told she had not
 * started. The page denied work it was already holding.
 *
 * And the two figures that would have carried her: a distance under 500 m rounded to `0`, and a
 * lifetime burn folded to `"3k"` the moment it passed a thousand.
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ProgressLifts } from '@/screens/progress/ProgressLifts';
import type { ProgressAggregate } from '@/domain/progressAggregate';
import { initI18n, tg } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const mounted: ReactTestRenderer[] = [];

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  mounted.push(r);
  return r;
}

afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;

function joined(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out.join(' | ');
}

const EMPTY: ProgressAggregate = {
  liftedKg: 0,
  workouts: 0,
  weeks: 1,
  raises: 0,
  kcal: 0,
  cardioKm: 0,
  minutes: 0,
  weeklyTonnes: [0],
};

/** Three runs and not one set: the case the day-one gate could not see. */
const RUNNER: ProgressAggregate = {
  ...EMPTY,
  weeks: 2,
  kcal: 1240,
  cardioKm: 17.4,
  minutes: 96,
};

const screen = (aggregate: ProgressAggregate) => (
  <ProgressLifts loaded units="kg" entries={[]} aggregate={aggregate} onLog={() => {}} />
);

describe('a run is progress too', () => {
  it('shows the board to someone who has only ever run — she has no lifts, not no history', () => {
    const all = joined(mount(screen(RUNNER)));
    expect(all).not.toContain(tg('progress.dayOneTitle'));
    /*
     * ⚠️ COMPARED WITHOUT CASE SINCE 2026-08-27, and the change is in the app, not in the standard.
     *
     * The caption used to be uppercased by `textTransform` — a DRAW-TIME transform, which leaves the
     * text node itself alone, so this read the string as authored. It is a `<Legend>` now (it was a
     * hand-rolled copy of one that tracked its Hebrew), and `Legend` uppercases in JS because it has
     * to: it decides the FACE from the string it is about to draw, so it must decide from the string
     * it will actually draw. The board still says the same word in the same case on the glass.
     */
    expect(all.toUpperCase()).toContain(tg('progress.badgeCardio').toUpperCase());
    expect(all).toContain('17'); // her kilometres, on the row that exists for her
  });

  it('still says day one when nothing at all has been measured', () => {
    const all = joined(mount(screen(EMPTY)));
    expect(all).toContain(tg('progress.dayOneTitle'));
  });

  it('keeps the tenth of a kilometre — a 400 m walk is not zero', () => {
    const all = joined(mount(screen({ ...EMPTY, cardioKm: 0.4, minutes: 6 })));
    expect(all).toContain('0.4');
  });

  it('does not fold a real burn total into "3k"', () => {
    const all = joined(mount(screen({ ...RUNNER, kcal: 3400 })));
    expect(all).toContain('3400');
    expect(all).not.toContain('3k');
  });
});

describe('the lens row promises only what it does', () => {
  /**
   * "Lifts" was a selected radio in a group of two, and "Log" navigates away — so the state it
   * announced could never hold. A control that announces itself to a screen reader and then does
   * nothing is a lie the size of a tap.
   */
  it('offers no radio group, because there is no state to flip', () => {
    const r = mount(screen(RUNNER));
    const radios = r.root.findAll((n) => n.props?.accessibilityRole === 'radio', { deep: true });
    expect(radios).toHaveLength(0);
  });

  /**
   * ⚠️ WHAT THIS ASSERTS CHANGED ON 2026-08-27, AND THE PRINCIPLE ABOVE GOT STRONGER, NOT WEAKER.
   *
   * The old shape was hand-rolled here and NOWHERE ELSE: the live lens was a bare `View` with no
   * role, the ledger a `Pressable` with `role="button"`. It satisfied the sentence above by giving
   * the surface she is standing on no role at all — which is a second cost the sentence never
   * asked for. **A screen-reader user could not tell the two were a pair**, because only one of
   * them was in the accessibility tree as anything.
   *
   * They are the design system's `<SegmentedControl>` now, for a reason that has nothing to do with
   * a11y — `History` drew this same switch with it, so the control changed SHAPE when she used it
   * (see the note at the markup). But the a11y is the better half of the trade:
   *
   *     role="tab" + selected:true   — "Lifts, selected"   the surface she is on, and it says so
   *     role="tab" + selected:false  — "Log, tab"          the one that goes somewhere
   *
   * A selected TAB may be pressed and do nothing; that is what a tab is, in every platform's
   * vocabulary, and the reader announces the state rather than promising an action. The lie the
   * docblock above guards against was `role="button"` over an empty branch, and that is gone.
   */
  it('draws both lenses as tabs, and only the one she is standing on is selected', () => {
    const r = mount(screen(RUNNER));
    /* One node per tab: findAll walks composites AND the host they render, so a bare match
       counts each segment three times. The host element is the tab. */
    const tabs = r.root
      .findAll((n) => n.props?.accessibilityRole === 'tab', { deep: true })
      .filter((n) => typeof n.type === 'string');
    expect(tabs).toHaveLength(2);

    const selected = tabs.filter((n) => n.props?.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);

    /* …and it is LIFTS, because that is the lens this screen IS. */
    const textIn = (n: { props?: { children?: unknown } }): string => {
      const out: string[] = [];
      const walk = (x: unknown): void => {
        if (typeof x === 'string') return void out.push(x);
        if (Array.isArray(x)) return void x.forEach(walk);
        if (x && typeof x === 'object' && 'props' in x) walk((x as { props?: { children?: unknown } }).props?.children);
      };
      walk(n.props?.children);
      return out.join('');
    };
    expect(textIn(selected[0]!)).toContain(tg('progress.tabLifts'));

    /* Both words are still on the switch — it is a pair, not a label with a button beside it. */
    const all = joined(r);
    expect(all).toContain(tg('progress.tabLifts'));
    expect(all).toContain(tg('progress.tabLog'));
  });
});
