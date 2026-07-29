/**
 * §03 · THE LAST TWO SCREENS — mounted for real (v7 3.2b and 3.6b).
 *
 * A typecheck cannot see a screen. These mount the actual surfaces and ask what an athlete would:
 *
 *   3.2b · LIFT DETAIL   → the lift is named, where it stands is the one big figure, Milestones
 *                          opens by default with its count, and All changes holds the engine log.
 *                          A tapped point on the climb answers with that day's reading.
 *   3.6b · DAY ONE       → before any data: no figures at all, no Lifts/Log choice to make, and the
 *                          page says so in the first person instead of drawing an empty graph.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { LiftDetailView, type LiftDetailViewProps } from '@/screens/progress/LiftDetail';
import { ProgressLifts } from '@/screens/progress/ProgressLifts';
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

function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out;
}

const joined = (r: ReactTestRenderer) => texts(r).join(' | ');

function pressable(r: ReactTestRenderer, label: string): ReactTestInstance | null {
  const hits = r.root.findAll((n) => n.props?.accessibilityLabel === label, { deep: true });
  return hits.find((n) => typeof n.props.onPress === 'function') ?? hits[0] ?? null;
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => Date.now() - n * DAY;

const liftProps = (over: Partial<LiftDetailViewProps> = {}): LiftDetailViewProps => ({
  exerciseId: 'bb_row',
  units: 'kg',
  loaded: true,
  band: [8, 10],
  onBack: () => {},
  climb: {
    mode: 'load',
    firstAtMs: daysAgo(21),
    current: 47.5,
    best: 47.5,
    points: [
      { atMs: daysAgo(21), value: 34, dayBest: 34, sessionId: 's1' },
      { atMs: daysAgo(14), value: 40, dayBest: 40, sessionId: 's2' },
      { atMs: daysAgo(7), value: 44, dayBest: 44, sessionId: 's3' },
      { atMs: Date.now(), value: 47.5, dayBest: 47.5, sessionId: 's4' },
    ],
  },
  moments: [
    { kind: 'best', value: 47.5, atMs: Date.now() },
    {
      kind: 'club',
      value: 40,
      atMs: daysAgo(14),
      milestone: {
        id: 'club_bb_row_40',
        family: 'club',
        value: 40,
        exerciseId: 'bb_row',
        earnedAt: new Date(daysAgo(14)).toISOString(),
        sessionId: 's2',
      },
    },
    { kind: 'origin', value: 34, atMs: daysAgo(21) },
  ],
  changes: [
    { atMs: Date.now(), loadFrom: 44, loadTo: 47.5, decision: 'progress' },
    { atMs: daysAgo(7), loadFrom: 40, loadTo: 44, decision: 'progress' },
    { atMs: daysAgo(14), loadFrom: 34, loadTo: 40, decision: 'progress' },
  ],
  ...over,
});

describe('3.2b · lift detail', () => {
  it('names the lift, and stands it on ONE figure — where it is today', () => {
    const r = mount(<LiftDetailView {...liftProps()} />);
    const all = joined(r);
    expect(all).toContain('Barbell Row');
    expect(all).toContain('47.5');
    // the meta line: muscle · band · since
    expect(all).toContain('BAND 8–10');
  });

  it('opens on Milestones, and both tabs carry their true count', () => {
    const r = mount(<LiftDetailView {...liftProps()} />);
    // the milestone rows are the ones showing by default — the origin's line proves which tab is open
    expect(joined(r)).toContain(tg('progress.momentOrigin'));
    expect(pressable(r, `${tg('progress.tabMilestones')} (3)`)).not.toBeNull();
    expect(pressable(r, `${tg('progress.tabChanges')} (3)`)).not.toBeNull();
  });

  it('hands the engine log over when All changes is pressed', () => {
    const r = mount(<LiftDetailView {...liftProps()} />);
    act(() => {
      pressable(r, `${tg('progress.tabChanges')} (3)`)!.props.onPress();
    });
    const all = joined(r);
    // A stamped load move prints BOTH ends — the ledger's whole job is the numbers, not a verdict.
    expect(all).toContain(tg('progress.changeFromTo', { from: 44, to: 47.5, unit: 'kg' }));
    expect(all).toContain(tg('progress.changeFromTo', { from: 34, to: 40, unit: 'kg' }));
    // the milestone story has stepped aside — one tab at a time
    expect(all).not.toContain(tg('progress.momentOrigin'));
  });

  it('falls back to the word when a stamped change has no "from" to name', () => {
    const r = mount(
      <LiftDetailView {...liftProps({ changes: [{ atMs: daysAgo(21), loadFrom: null, loadTo: 34, decision: 'seed' }] })} />,
    );
    act(() => {
      pressable(r, `${tg('progress.tabChanges')} (1)`)!.props.onPress();
    });
    expect(joined(r)).toContain(tg('progress.changeWord_hold'));
  });

  it('answers a tapped point with that day’s reading', () => {
    const r = mount(<LiftDetailView {...liftProps()} />);
    // The reach targets are the climb's invisible hit circles — one per training day, in order.
    const targets = r.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && n.props?.r === 18,
      { deep: true },
    );
    expect(targets).toHaveLength(4);

    expect(joined(r)).not.toContain('34 kg'); // nothing tapped: the callout is not on the page
    act(() => {
      targets[0].props.onPress(); // the first day — 34 kg, before any change was stamped
    });
    expect(joined(r)).toContain('34 kg');

    act(() => {
      targets[0].props.onPress(); // tapping it again puts the callout away
    });
    expect(joined(r)).not.toContain('34 kg');
  });

  it('says so plainly when a lift has nothing measured yet — and never draws an empty graph', () => {
    const r = mount(
      <LiftDetailView
        {...liftProps({
          climb: { mode: 'load', firstAtMs: null, current: 0, best: 0, points: [] },
          moments: [],
          changes: [],
        })}
      />,
    );
    expect(joined(r)).toContain(tg('progress.liftEmpty'));
    expect(joined(r)).not.toContain(tg('progress.tapHint'));
  });
});

describe('3.6b · progress, day one', () => {
  const dayOne = <ProgressLifts loaded units="kg" entries={[]} aggregate={null} onLog={() => {}} />;

  it('makes a promise instead of drawing numbers nobody measured', () => {
    const all = joined(mount(dayOne));
    expect(all).toContain(tg('progress.dayOneTitle'));
    // the ghost's label is a LEGEND — stored in sentence case, stamped uppercase like every other
    expect(all).toContain(tg('progress.youAreHere').toUpperCase());
    expect(all).toContain(tg('progress.dayOneFirstMark'));
  });

  it('offers no Lifts/Log choice — both are empty, so there is nothing to choose', () => {
    const all = joined(mount(dayOne));
    expect(all).not.toContain(tg('progress.tabLog'));
    expect(all).not.toContain(tg('progress.chipAllTime'));
  });
});
