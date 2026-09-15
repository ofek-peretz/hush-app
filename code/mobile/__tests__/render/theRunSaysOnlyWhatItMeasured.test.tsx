/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE RUN SAYS WHAT IT MEASURED, IN HER LANGUAGE, AS ONE SENTENCE.
 *
 * Four findings on the cardio surfaces (2026-08-18), each of them a thing the screen states that it
 * has no right to state — or states in a way she cannot receive:
 *
 *   · **A FABRICATED "0 KCAL".** The poster drew the burn ungated, so a run that recorded time and
 *     no credited distance closed on a figure of zero — while the record it wrote in the same breath
 *     OMITS the field, and the average heart rate right beside it has been gated all along with the
 *     rule "a run with no average heart rate is not a run with a blank one".
 *   · **AN UNKNOWN SPENT AS A "NO".** `readWatchPresence().paired` was read without `.known`, and
 *     `watchTransportNative` is explicit that null and `activated: false` both mean *we do not know*
 *     and are "never reported as no watch". A WCSession that had not finished activating cost her
 *     the heart-rate seat for the whole run.
 *   · **A HARD-CODED ENGLISH UNIT.** `KM ${s.km}` in the saved run's splits — Latin capitals on a
 *     Hebrew phone, on the one screen that is nothing but her own record.
 *   · **THREE STOPS FOR ONE FACT.** The hero, the pace and every readout were sibling `<Text>`s with
 *     no label, so VoiceOver read "482", stop, "m" — a number with no name, then a name with no
 *     number, on a screen she is reading at eight kilometres an hour.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import i18next from 'i18next';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { CardioComplete, CardioLiveView, watchSeatIsReal } from '@/screens/cardio/Cardio';
import { CardioDetail } from '@/screens/cardio/CardioDetail';
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
const said = (r: ReactTestRenderer) => texts(r).join(' ').toUpperCase();
const label = (key: string) => tg(key).toUpperCase();

/** Every sentence VoiceOver would actually stop on. */
function announced(r: ReactTestRenderer): string[] {
  return r.root
    .findAll((n) => n.props?.accessible === true && typeof n.props?.accessibilityLabel === 'string')
    .map((n) => n.props.accessibilityLabel);
}

const SPLITS = [1, 2, 3].map((km) => ({ km, durationSec: 379, paceSec: 379, gait: 'run' as const }));

const done = {
  preview: true as const,
  navigation: { goBack: () => {}, navigate: () => {} } as never,
  gait: 'run' as const,
  startedAt: new Date('2026-08-18T07:00:00.000Z').toISOString(),
  elapsedSec: 26 * 60 + 14,
  distanceKm: 4.62,
  avgHr: 141,
  splits: SPLITS,
  route: [],
};

const live = {
  elapsedSec: 26 * 60 + 14,
  distanceKm: 4.62,
  paceSec: 342,
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

describe('⛔ a run with no burn is not a run with a blank one', () => {
  it('no credited distance ⇒ the poster does not print "0 KCAL"', () => {
    const r = mount(<CardioComplete {...done} distanceKm={0} calories={0} splits={[]} />);
    expect(said(r)).not.toContain(label('cardio.kcal'));
    expect(texts(r)).not.toContain('0');
  });

  it('…and a run that HAS the measurement still states it', () => {
    expect(said(mount(<CardioComplete {...done} calories={318} />))).toContain(label('cardio.kcal'));
  });

  it('⚠️ the poster and the record agree — both are gated on the same fact', () => {
    // The saved activity omits `calories` unless `props.calories > 0`; the stage now asks the same
    // question. A figure printed on the one screen she screenshots, and refused by the log behind
    // it, is the app disagreeing with itself about what it measured.
    const r = mount(<CardioComplete {...done} calories={0} />);
    expect(said(r)).not.toContain(label('cardio.kcal'));
  });
});

describe('⛔ an unknown wrist is not a missing one', () => {
  it('the predicate: only a KNOWN "not paired" closes the seat', () => {
    expect(watchSeatIsReal({ known: false, paired: false })).toBe(true); // WCSession has not answered
    expect(watchSeatIsReal({ known: true, paired: true })).toBe(true);
    expect(watchSeatIsReal({ known: true, paired: false })).toBe(false); // the only honest "no watch"
  });

  it('⚠️ and an unknown draws the seat, waiting, rather than removing it for the whole run', () => {
    const row = said(mount(<CardioLiveView {...live} hr={null} watchPaired={watchSeatIsReal({ known: false, paired: false })} />));
    expect(row).toContain(label('cardio.hrShort'));
  });
});

describe('⛔ one fact, one sentence — VoiceOver reads the run, not its pieces', () => {
  it('the LIVE row announces its metres and unit together (the ring retired 2026-08-24)', () => {
    const heard = announced(mount(<CardioLiveView {...live} />));
    const liveRow = heard.find((l) => l.includes(tg('cardio.metresUnit')));
    expect(liveRow).toBeTruthy();
    expect(liveRow).toContain('620'); // …620 m into her fifth kilometre
  });

  it('every readout on the live row names what its figure is', () => {
    const heard = announced(mount(<CardioLiveView {...live} />));
    // ⛔ The first seat is the total DISTANCE since 2026-08-23 — no live pace on the stage.
    expect(heard).toContain(`${tg('cardio.km')} 4.62`);
    expect(heard).toContain(`${tg('cardio.hrShort')} 141`);
    expect(heard).toContain(`${tg('cardio.kcal')} 318`);
  });

  it('…and the poster says its hero, its pace and its facts the same way', () => {
    const heard = announced(mount(<CardioComplete {...done} calories={318} />));
    expect(heard).toContain(`4.6 ${tg('cardio.km')}`);
    expect(heard.some((l) => l.includes(tg('cardio.perKm')))).toBe(true);
    expect(heard).toContain(`${tg('cardio.kcal')} 318`);
    expect(heard).toContain(`${tg('cardio.avgHrShort')} 141`);
  });
});

describe('⛔ the saved run names its kilometres in her language', () => {
  const activity = {
    kind: 'cardio' as const,
    id: 'cardio_1',
    gait: 'run' as const,
    startedAt: new Date('2026-08-18T07:00:00.000Z').toISOString(),
    durationSec: 1574,
    distanceKm: 4.62,
    avgPaceSec: 341,
    splits: SPLITS,
  };
  const detail = () =>
    mount(
      <CardioDetail
        navigation={{ goBack: () => {}, navigate: () => {} } as never}
        route={{ params: { activity } } as never}
      />,
    );

  // Inside `act`: a language change re-renders every mounted screen, and this one runs before the
  // suite's unmount.
  afterEach(async () => {
    await act(async () => {
      await i18next.changeLanguage('en');
    });
  });

  it('English: the ordinal comes from the copy file, not from JSX', () => {
    expect(said(detail())).toContain(tg('cardio.kmOrdinal', { n: 3 }).toUpperCase());
  });

  it('⛔ Hebrew: the splits are not "KM 3" in Latin capitals', async () => {
    await i18next.changeLanguage('he');
    const spoken = texts(detail()).join(' ');
    expect(spoken).toContain(tg('cardio.kmOrdinal', { n: 3 }));
    expect(spoken).not.toContain('KM 3');
  });
});
