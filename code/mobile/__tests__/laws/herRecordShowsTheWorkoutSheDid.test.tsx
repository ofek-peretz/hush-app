/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WORKOUT SHE DID IS IN THE RECORD SHE READS.
 *
 * The last place the "only sets count" assumption was still hiding, and the worst one to leave: the
 * LOG. An interval session — a warm-up, six 400 m repeats, a cool-down — logs no `SetLog` at all.
 * It is saved. It counts as trained. It goes to the coach, which decides her next week from it.
 *
 * And `History` filtered on `sets.length > 0`, so **it never appeared.** She trained, the app kept
 * every measurement, and the one screen that exists to show her what she has done behaved as though
 * the session had not happened. One level deeper, `WorkoutDetail` grouped `sets` — so even reaching
 * it another way opened a page with an empty body.
 *
 * This is the same defect the session machine had, the sheet had, and the completion rule had; the
 * record is the fourth reader that was counting the wrong thing. It is written down here because it
 * is the one an athlete would report as "the app lost my workout".
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { HistoryView } from '@/screens/history/History';
import { WorkoutDetailView } from '@/screens/history/WorkoutDetail';
import { initI18n } from '@/i18n';
import type { ItemResult, Session } from '@/data/local/models';

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
beforeAll(async () => { await initI18n(); });

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { while (mounted.length) mounted.pop()!.unmount(); }); });

/** Six 400 m repeats with a walk between them, a warm-up and a cool-down. Not one set. */
const items: ItemResult[] = [
  { kind: 'time', ex: 'warm_up', block: 1, round: 1, position: 1, seconds: 600, askedSeconds: 600, at: '2026-08-01T09:00:00.000Z' },
  ...[1, 2, 3].flatMap((r): ItemResult[] => [
    { kind: 'distance', ex: 'run_outdoor', block: 2, round: r, position: 1, metres: 400, askedMetres: 400, at: `2026-08-01T09:${10 + r * 4}:00.000Z` },
    { kind: 'time', ex: 'walk_outdoor', block: 2, round: r, position: 2, seconds: 90, askedSeconds: 90, at: `2026-08-01T09:${12 + r * 4}:00.000Z` },
  ]),
  { kind: 'time', ex: 'cool_down', block: 3, round: 1, position: 1, seconds: 300, askedSeconds: 300, at: '2026-08-01T09:40:00.000Z' },
];

const intervals: Session = {
  id: 's1', programDayId: 'coach_0', programDayName: 'Intervals',
  startedAt: '2026-08-01T09:00:00.000Z', state: 'SAVED', earlyFinish: false, trained: true,
  sets: [], items,
};

function textOf(r: ReactTestRenderer): string {
  return r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  }).join('\n');
}

function draw(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>); });
  mounted.push(r);
  return r;
}

const noop = () => {};

describe('the log', () => {
  it('⚠️ shows a session that logged no sets at all', () => {
    const r = draw(
      <HistoryView sessions={[intervals]} cardio={[]} dayName={(x) => x.programDayName ?? ''} onLifts={noop} onSession={noop} onCardio={noop} />,
    );
    expect(textOf(r)).toContain('Intervals');
  });

  it('still refuses a session with nothing in it — a workout entered and abandoned', () => {
    // The founder's rule (2026-07-10) is about PERFORMED work, and it stands. What changed is only
    // what counts as performed: everything she did, not everything she lifted.
    const empty: Session = { ...intervals, id: 's2', programDayName: 'Nothing', items: [], sets: [] };
    const r = draw(
      <HistoryView sessions={[empty]} cardio={[]} dayName={(x) => x.programDayName ?? ''} onLifts={noop} onSession={noop} onCardio={noop} />,
    );
    expect(textOf(r)).not.toContain('Nothing');
  });

  it('counts the work and the time it took, instead of zero and zero', () => {
    const read = textOf(
      draw(<HistoryView sessions={[intervals]} cardio={[]} dayName={(x) => x.programDayName ?? ''} onLifts={noop} onSession={noop} onCardio={noop} />),
    );
    // Four distinct things trained (warm-up, run, walk, cool-down) and forty minutes of wall clock —
    // both read off `items`, because `sets` says nothing about either.
    expect(read).toContain('4');
    expect(read).toContain('40');
  });
});

describe('and opening it shows the workout', () => {
  it('⚠️ draws every step she did, not an empty page', () => {
    const read = textOf(
      draw(
        <WorkoutDetailView
          session={intervals}
          forward={{}}
          loading={false}
          units="kg"
          dayName="Intervals"
          onBack={noop}
        />,
      ),
    );
    for (const name of ['Warm-up', 'Run', 'Walk', 'Cool-down']) {
      expect({ name, shown: read.includes(name) }).toEqual({ name, shown: true });
    }
    // …and what she actually did, in the unit the stage used while she was doing it.
    expect(read).toContain('400 m');
    expect(read).toContain('10:00');
  });
});
