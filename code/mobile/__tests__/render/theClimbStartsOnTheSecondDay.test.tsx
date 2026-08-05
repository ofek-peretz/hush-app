/**
 * "NO GRAPH WHEN YOU OPEN A LIFT" — founder C.18.
 *
 * There was one, technically. At a single training day `Climb` draws a lone dot in the middle of a
 * 138 px box: no line, no fill, no shape, no reason given. A dot in a void is not a graph, and it
 * withholds the honest thing — that ONE DAY IS NOT A CLIMB YET. Two points are the fewest that can
 * rise.
 *
 * So the graph draws from the second day, and the first one gets a sentence in the same slot. The
 * page keeps its shape, and instead of looking broken it says what it is waiting for. Her CURRENT
 * figure stays beside the title throughout — the number she has is never withheld, only the shape
 * it has not made yet.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { LiftDetailView } from '@/screens/progress/LiftDetail';
import { initI18n, tg } from '@/i18n';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

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

function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    (n as { children?: unknown[] }).children?.forEach(walk);
  };
  walk(r.toJSON());
  return out;
}

const DAY = 24 * 60 * 60 * 1000;
const point = (i: number, v: number) => ({ atMs: Date.now() - i * DAY, value: v, dayBest: v, sessionId: `s${i}` });

const view = (points: ReturnType<typeof point>[]) => (
  <LiftDetailView
    exerciseId="bb_row"
    units="kg"
    loaded
    band={[8, 10]}
    onBack={() => {}}
    climb={{
      mode: 'load',
      firstAtMs: points[0]?.atMs ?? null,
      current: points[points.length - 1]?.dayBest ?? 0,
      best: Math.max(0, ...points.map((p) => p.value)),
      points,
    }}
    moments={[]}
    changes={[]}
  />
);

/** The SVG the climb is drawn into — the only one on this screen. */
const hasGraph = (r: ReactTestRenderer): boolean =>
  r.root.findAll((n) => {
    const name = typeof n.type === 'string' ? n.type : (n.type as { displayName?: string })?.displayName;
    return name === 'Polyline' || name === 'RNSVGPolyline';
  }).length > 0;

describe('the climb starts on the second day, and says so on the first', () => {
  it('ONE day: no graph-shaped void — a sentence in its place', () => {
    const r = mount(view([point(0, 34)]));
    expect(hasGraph(r)).toBe(false);
    expect(texts(r).join(' ')).toContain(tg('progress.climbNeedsTwo'));
  });

  it('…and her number is still on the screen — only the shape is waiting', () => {
    expect(texts(mount(view([point(0, 34)]))).join(' ')).toContain('34');
  });

  it('TWO days: the climb draws, and the sentence is gone', () => {
    const r = mount(view([point(7, 34), point(0, 36)]));
    expect(hasGraph(r)).toBe(true);
    expect(texts(r).join(' ')).not.toContain(tg('progress.climbNeedsTwo'));
  });

  /**
   * A lift never trained is a different sentence and already had one. It must not pick up the
   * "second day" line — she has not had a first.
   */
  it('NEVER trained: the empty line, not the waiting line', () => {
    const said = texts(mount(view([]))).join(' ');
    expect(said).toContain(tg('progress.liftEmpty'));
    expect(said).not.toContain(tg('progress.climbNeedsTwo'));
  });
});

/**
 * ════ AND ONE FOUND WHILE ANSWERING C.15 ════
 *
 * "The engine added a set to three different exercises in one session — I want to understand why."
 *
 * The answer is that Loop 3 decides per MUSCLE (S-32), never per exercise: complete every set for
 * a muscle AND have one of its lifts advance, and that muscle earns +1 — which lands on one
 * exercise inside it. An upper day trains three or four muscles, so three of them clearing that
 * bar is three separate decisions, not one decision applied three times.
 *
 * 2.5 has said so per muscle since Rev 15. What it did NOT do is say it in Hebrew: the engine
 * stamps `muscle` as the raw English name — correctly, it is pure and the lift names in this copy
 * are English — and the row's TITLE translated it while the sentence underneath did not. So the
 * one line whose whole job is to answer "why" read "העבודה על chest מתקדמת".
 */
import i18next from 'i18next';
import { SessionEarned } from '@/screens/session/WellDone';

describe('the reason a muscle earned a set is spoken in her language', () => {
  // ENGLISH cannot see this: `muscle.Chest` is authored lowercase for mid-sentence and the row's
  // title capitalises it, so the two words differ there by design. Hebrew is where the raw key
  // showed through, so Hebrew is where the law is stated.
  beforeAll(async () => {
    await i18next.changeLanguage('he');
  });
  afterAll(async () => {
    await i18next.changeLanguage('en');
  });

  const earned = (
    <SessionEarned
      /* ⛔ THE POSTER — the facts this screen leads with (founder 2026-08-04). */
      poster={{
        hero: { kind: 'tonnes', value: 4.2 },
        minutes: 58,
        kcal: 412,
        tonnes: 4.2,
        sets: 19,
        lifts: [
        { exerciseId: 'bb_back_squat', load: 60, unit: 'kg', reps: [8, 7, 8, 7] },
        { exerciseId: 'bb_rdl', load: 50, unit: 'kg', reps: [9, 8, 8] },
        { exerciseId: 'leg_press', load: 120, unit: 'kg', reps: [11, 10, 10] },
        ],
      }}
      workoutName="Lower A"
      savedLegend="Upper A · Saved"
      partial={false}
      durationLabel="58"
      kcal={412}
      tonnes={4.8}
      answered
      decisions={[]}
      volume={[
        { muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: { key: 'explain.volumeUp.text', params: { muscle: 'chest' } } },
      ]}
      onDone={() => {}}
      onRecord={() => {}}
    />
  );

  it('the sentence names the muscle in the same words the row does', () => {
    const r = mount(earned);
    /*
     * ⛔ THE ROWS MOVED BEHIND A BOX (founder 2026-08-05) — so the test presses it. The law here is
     * about the WORDS in the row, not about where the row lives; the Hebrew athlete must read the
     * muscle in her language in both the title and the sentence under it, wherever they are drawn.
     */
    act(() => {
      for (const node of r.root.findAll((n) => typeof n.props?.accessibilityLabel === 'string')) {
        if (/החלט|decision/i.test(String(node.props.accessibilityLabel)) && typeof node.props.onPress === 'function') {
          node.props.onPress();
          break;
        }
      }
    });
    const said = texts(r).join(' ');
    const muscle = tg('muscle.Chest');
    // The TITLE has always been translated; the law is that the reason under it agrees — so the
    // word appears twice, once in each.
    expect(said.match(new RegExp(muscle, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2);
    // …and the raw English key never reaches the glass.
    expect(said).not.toContain('chest');
  });
});
