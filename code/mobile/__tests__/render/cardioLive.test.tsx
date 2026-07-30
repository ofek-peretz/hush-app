/**
 * THE LIVE RUN DRAWS WHAT THE HANDOFF DRAWS, AND NOTHING IT CANNOT MEASURE — founder C.19.
 *
 * Two findings, one screen:
 *
 *   "There is a line across the middle connected to nothing — remove it."
 *      The rule above the km/hr/kcal row was never the problem: it is in the canonical file, at the
 *      top of the stat table. What was wrong is what stood ABOVE it. The GPS status sat in a FIXED
 *      20 px slot so the layout would not jump — and with a lock (the ordinary case) that slot drew
 *      nothing, so between the body's two 30 px gaps the rule had EIGHTY pixels of void over it and
 *      read as a hairline floating in the middle of the stage. The canonical body has THREE
 *      children on a 32 px rhythm. This had four.
 *
 *   "For someone with no Apple Watch, HR must not appear — tie it to the same flag as the watch
 *    presence."
 *      The row drew the heart unconditionally and fell back to an em-dash, so an athlete with no
 *      watch got a permanent empty seat labelled HR on every run she will ever take.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { CardioLiveView, CardioComplete, showsHeartRate } from '@/screens/cardio/Cardio';
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

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;
/** Legends are drawn uppercased, so every label assertion here compares case-blind. */
function said(r: ReactTestRenderer): string {
  return texts(r).join(' ').toUpperCase();
}
const label = (key: string): string => tg(key).toUpperCase();

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

const SPLITS = [1, 2, 3, 4].map((km) => ({ km, durationSec: 379, paceSec: 379, gait: 'run' as const }));

const live = {
  elapsedSec: 26 * 60 + 14,
  distanceKm: 4.62,
  hr: 141 as number | null,
  calories: 318,
  splits: SPLITS,
  gps: 'ready' as const,
  watchPaired: true,
  paused: false,
  confirmEnd: false,
  kmMoment: null,
  onPause: () => {},
  onResume: () => {},
  onAskEnd: () => {},
  onKeepGoing: () => {},
  onFinish: () => {},
};

/**
 * The stage's middle column — the flex child that holds the clock, the band and the stat row.
 * Found by its layout rather than a test id, because its CHILD COUNT is the thing under test.
 */
function liveBody(r: ReactTestRenderer): ReactTestInstance {
  return r.root.findAll((n) => {
    const s = n.props.style;
    const flat = Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s;
    return flat?.flex === 1 && flat?.gap === 30 && flat?.justifyContent === 'center';
  })[0];
}

describe('nothing on the stage is abandoned by what stands above it', () => {
  /**
   * The canonical stage is three children — clock, band, stat row. A fixed-height slot that draws
   * nothing is a fourth, and it is invisible in every way except the one that mattered: it pushed
   * the stat row's rule 80 px away from the band and left it hanging on its own.
   */
  it('with a GPS lock the body has exactly the canonical THREE children', () => {
    expect(liveBody(mount(<CardioLiveView {...live} />)).props.children.filter(Boolean)).toHaveLength(3);
  });

  it('…and no empty element is left standing in for the silent GPS line', () => {
    const r = mount(<CardioLiveView {...live} />);
    expect(said(r)).not.toContain(label('cardio.gpsAcquiring'));
    expect(said(r)).not.toContain(label('cardio.gpsOff'));
  });

  it('but a phone WITHOUT a fix still says so, in the same place', () => {
    expect(said(mount(<CardioLiveView {...live} gps="acquiring" />))).toContain(label('cardio.gpsAcquiring'));
    expect(said(mount(<CardioLiveView {...live} gps="denied" />))).toContain(label('cardio.gpsOff'));
    expect(said(mount(<CardioLiveView {...live} gps="unavailable" />))).toContain(label('cardio.gpsOff'));
  });
});

describe('Hush does not name a measurement it has no instrument for', () => {
  it('the predicate: a paired wrist, or a reading already arriving', () => {
    expect(showsHeartRate(null, true)).toBe(true); // paired, first beat not in yet
    expect(showsHeartRate(141, false)).toBe(true); // a live number outranks a flag that is unsure
    expect(showsHeartRate(141, true)).toBe(true);
    expect(showsHeartRate(null, false)).toBe(false); // nothing to measure with, nothing to draw
  });

  it('NO WATCH: the heart is gone from the row — not an em-dash sitting in its seat', () => {
    const row = said(mount(<CardioLiveView {...live} hr={null} watchPaired={false} />));
    expect(row).not.toContain(label('cardio.hrShort'));
    expect(row).not.toContain('—');
    // …and the two facts her phone CAN measure are untouched.
    expect(row).toContain(label('cardio.km'));
    expect(row).toContain(label('cardio.kcal'));
  });

  it('A PAIRED WATCH, no beat yet: the seat is real and it waits', () => {
    const row = said(mount(<CardioLiveView {...live} hr={null} watchPaired />));
    expect(row).toContain(label('cardio.hrShort'));
    expect(row).toContain('—');
  });

  it('A READING, whatever the flag says: presence can be UNKNOWN, a heartbeat cannot', () => {
    const row = said(mount(<CardioLiveView {...live} hr={141} watchPaired={false} />));
    expect(row).toContain(label('cardio.hrShort'));
    expect(row).toContain('141');
  });

  /** The SAVED stage asks the other honest question: was a measurement taken at all? */
  it('a saved run with no average heart rate does not print a blank one', () => {
    const done = {
      preview: true as const,
      navigation: { goBack: () => {}, navigate: () => {} } as never,
      gait: 'run' as const,
      startedAt: new Date().toISOString(),
      elapsedSec: 26 * 60 + 14,
      distanceKm: 4.62,
      calories: 318,
      splits: SPLITS,
      route: [],
    };
    const without = said(mount(<CardioComplete {...done} avgHr={null} />));
    expect(without).not.toContain(label('cardio.avgHrShort'));
    expect(without).not.toContain('—');
    // …and one that HAS the measurement still states it.
    const withIt = said(mount(<CardioComplete {...done} avgHr={141} />));
    expect(withIt).toContain(label('cardio.avgHrShort'));
    expect(withIt).toContain('141');
  });
});
