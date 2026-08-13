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
// @ts-nocheck

// 

import fs from 'fs';
import path from 'path';
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
    /* ⚠️ `gap: 34` and `flex-start` since 2026-08-05 — the founder asked for the clock to rise, so
       the body hangs from the top instead of centring. Matched on the SHAPE that identifies it (a
       flexed body with a gap), not on the two numbers that were free to change. */
    /* ⚠️ 28 → 26 on 2026-08-12 with the per-kilometre rows. Matched on the SHAPE (a flexed body
       with a gap and a horizontal padding), never on the padding's value — pinning the number is
       what made a spacing change break a law about children. */
    /* ⚠️ Matched on the SHAPE — a flexed body with a gap and horizontal padding — never on the
       numbers. Pinning `paddingTop: 18` is what broke this law when the body was asked to spread. */
    return flat?.flex === 1 && typeof flat?.gap === 'number' && typeof flat?.paddingHorizontal === 'number' && typeof flat?.paddingTop === 'number';
  })[0];
}

describe('nothing on the stage is abandoned by what stands above it', () => {
  /**
   * ⛔ THE LAW IS "EVERY CHILD DRAWS", NOT "THERE ARE THREE OF THEM".
   *
   * The original defect was a fixed-height GPS slot that drew nothing — invisible in every way
   * except the one that mattered: it pushed the stat row's rule 80 px from the band and left it
   * hanging on its own. The count was how that was caught; it was never the rule.
   *
   * The run's SHAPE joined the body on 2026-08-04 (founder: the split bars), so the count is four
   * once a kilometre has landed — and THREE before one has, because a bar chart with no bars in it
   * is exactly the empty slot this law was written about.
   */
  it('with a GPS lock and kilometres logged, every child of the body draws', () => {
    /*
     * ⛔ FOUR since the founder's ring landed (2026-08-12): the clock, the RING, the GPS line and
     * the per-kilometre rows. It was five for an afternoon, when the rows and the bar TEXTURE were
     * both drawn — and he took the texture off: *"תוריד את המשבצות האלה כי זה לא ברור בכלל."* The
     * rows say 6:19 and 6:24 in figures, which is the same comparison without asking her to measure
     * rectangles at eight kilometres an hour.
     */
    expect(liveBody(mount(<CardioLiveView
  paceSec={342} {...live} />)).props.children.filter(Boolean)).toHaveLength(4);
  });

  it('⛔ …and before the first kilometre the ROWS do not stand as an empty frame', () => {
    expect(liveBody(mount(<CardioLiveView
  paceSec={342} {...live} splits={[]} />)).props.children.filter(Boolean)).toHaveLength(3);
  });

  it('…and no empty element is left standing in for the silent GPS line', () => {
    const r = mount(<CardioLiveView
  paceSec={342} {...live} />);
    expect(said(r)).not.toContain(label('cardio.gpsAcquiring'));
    expect(said(r)).not.toContain(label('cardio.gpsOff'));
  });

  it('but a phone WITHOUT a fix still says so, in the same place', () => {
    expect(said(mount(<CardioLiveView
  paceSec={342} {...live} gps="acquiring" />))).toContain(label('cardio.gpsAcquiring'));
    expect(said(mount(<CardioLiveView
  paceSec={342} {...live} gps="denied" />))).toContain(label('cardio.gpsOff'));
    expect(said(mount(<CardioLiveView
  paceSec={342} {...live} gps="unavailable" />))).toContain(label('cardio.gpsOff'));
  });
});

describe('⛔ the absence sentence names the source she actually chose', () => {
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * FOUNDER, 2026-08-12, on a screenshot reading "Motion tracking is off": *"תבדוק את זה עכשיו אם
   * מדובר בבאג או לא."*
   *
   * Two sentences can stand in that slot and each is true of exactly one mode. Outdoors the phone
   * is waiting for a SATELLITE; on a belt there is no satellite to wait for and the only failure
   * worth a sentence is having no motion source at all. Saying either one on the other mode is the
   * same class of lie as a pace on a table, which is the defect this whole module was rebuilt from.
   *
   * ⚠️ THE ANSWER TO HIS QUESTION IS: correct on a treadmill, and this is what proves it. On the
   * web harness `health` is the stub, `distanceSince` returns null, and the indoor mode stands down
   * exactly as designed — that screenshot was the stub, not a defect.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('OUTDOORS with no fix yet: it waits for the satellite', () => {
    const r = mount(<CardioLiveView paceSec={0} {...live} splits={[]} distanceKm={0} gps="acquiring" />);
    expect(said(r)).toContain(tg('cardio.gpsAcquiring').toUpperCase());
    expect(said(r)).not.toContain(tg('cardio.motionOff').toUpperCase());
  });

  it('OUTDOORS with location refused: it says so, and never blames the motion sensor', () => {
    const r = mount(<CardioLiveView paceSec={0} {...live} splits={[]} distanceKm={0} gps="denied" />);
    expect(said(r)).toContain(tg('cardio.gpsOff').toUpperCase());
    expect(said(r)).not.toContain(tg('cardio.motionOff').toUpperCase());
  });

  it('⛔ INDOORS: no satellite is ever mentioned — acquiring or otherwise', () => {
    const r = mount(<CardioLiveView paceSec={0} {...live} splits={[]} distanceKm={0} gps="acquiring" indoor />);
    expect(said(r)).not.toContain(tg('cardio.gpsAcquiring').toUpperCase());
    expect(said(r)).not.toContain(tg('cardio.gpsOff').toUpperCase());
  });

  it('…and INDOORS with no motion source it names that, which is the only thing that can fail there', () => {
    const r = mount(<CardioLiveView paceSec={0} {...live} splits={[]} distanceKm={0} gps="unavailable" indoor />);
    expect(said(r)).toContain(tg('cardio.motionOff').toUpperCase());
  });

  it('⚠️ and the mode reaches the stage as an EXPLICIT flag, so it cannot be inherited', () => {
    /*
     * `navigate(name, undefined)` does not clear a route's params. A treadmill run followed by an
     * outdoor one could inherit `{indoor: true}` and spend the whole run reporting a motion sensor
     * while the satellite sat unopened. An explicit `false` cannot be inherited.
     */
    const root = fs.readFileSync(path.join(__dirname, '..', '..', 'src/app/Root.tsx'), 'utf8');
    expect(root).toContain("navigateMain('CardioLive', { indoor })");
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
    const row = said(mount(<CardioLiveView
  paceSec={342} {...live} hr={null} watchPaired={false} />));
    expect(row).not.toContain(label('cardio.hrShort'));
    expect(row).not.toContain('—');
    // …and the two facts her phone CAN measure are untouched.
    expect(row).toContain(label('cardio.km'));
    expect(row).toContain(label('cardio.kcal'));
  });

  it('A PAIRED WATCH, no beat yet: the seat is real and it waits', () => {
    const row = said(mount(<CardioLiveView
  paceSec={342} {...live} hr={null} watchPaired />));
    expect(row).toContain(label('cardio.hrShort'));
    expect(row).toContain('—');
  });

  it('A READING, whatever the flag says: presence can be UNKNOWN, a heartbeat cannot', () => {
    const row = said(mount(<CardioLiveView
  paceSec={342} {...live} hr={141} watchPaired={false} />));
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
