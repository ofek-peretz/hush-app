/**
 * THE RUN, SPOKEN TO THE PERSON RUNNING IT — founder build 36, B.6 · B.7 · B.8.
 *
 * Three findings on the cardio screens, and two of them had the same shape: a screen nothing in
 * the build could look at.
 *
 *   B.6  the countdown read "ריצה · מתחיל" — the wrong word order AND the masculine form for
 *        every woman. Both from one cause: the legend was ASSEMBLED IN JSX, `{run} · {starting}`
 *        with a hard-coded separator, so Hebrew could neither reorder nor conjugate it. And it
 *        lived inside the container behind a live GPS tracker, so no test and no gallery entry
 *        had ever seen it.
 *   B.7  the live screen's small type is tiny in Hebrew. It was a faithful 1:1 of the canonical
 *        handoff — which was drawn in English, where those slots hold LATIN CAPITALS at heavy
 *        tracking. Hebrew has no uppercase, so it gets none of that and the label is simply small.
 *   B.8  "סיים ושמור" (masculine) on the finish control — on the pause screen and again inside the
 *        confirmation behind it.
 *
 * These mount the real screens in Hebrew, in both persons, because the failure mode is silent:
 * the wrong gender is not an error, it is just wrong.
 */
import React from 'react';
import i18next from 'i18next';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { CardioCountdown, CardioLiveView } from '@/screens/cardio/Cardio';
import { initI18n } from '@/i18n';
import { setGender, resetGender } from '@/i18n/gender';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
  await i18next.changeLanguage('he');
});

afterAll(async () => {
  await i18next.changeLanguage('en');
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
  resetGender();
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

/** Every font size anywhere under this node, paired with the string it sets. */
function typeSizes(r: ReactTestRenderer): Array<{ text: string; size: number }> {
  const out: Array<{ text: string; size: number }> = [];
  const visit = (n: ReactTestInstance): void => {
    const s = n.props.style;
    const flat = Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s;
    const str = n.children.find((c) => typeof c === 'string') as string | undefined;
    if (flat?.fontSize && str) out.push({ text: str, size: flat.fontSize });
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(r.root);
  return out;
}

/** Four closed kilometres — enough to raise the split pill AND the kilometre moment. */
const SPLITS = [1, 2, 3, 4].map((km) => ({ km, durationSec: 379, paceSec: 379, gait: 'run' as const }));

const liveProps = {
  elapsedSec: 26 * 60 + 14,
  distanceKm: 4.62,
  hr: 141,
  calories: 318,
  splits: [],
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

/* ══════════════════════════ B.6 ══════════════════════════ */

describe('the countdown speaks Hebrew’s own order, in the athlete’s own person', () => {
  it('leads with the verb — never "ריצה · מתחיל"', () => {
    setGender('male');
    const said = texts(mount(<CardioCountdown count={2} />)).join(' ');
    expect(said).toContain('מתחיל · ריצה');
    expect(said).not.toContain('ריצה · מתחיל'); // ← the order he read on the device
  });

  it('…and conjugates: a woman is told מתחילה', () => {
    setGender('female');
    const said = texts(mount(<CardioCountdown count={2} />)).join(' ');
    expect(said).toContain('מתחילה · ריצה');
    // "מתחיל" is a prefix of "מתחילה", so the masculine claim has to be tested as a whole word.
    expect(said.split(/\s|·/).map((w) => w.trim())).not.toContain('מתחיל');
  });

  it('the countdown still counts, and GO is a word', () => {
    setGender('female');
    expect(texts(mount(<CardioCountdown count={3} />)).join(' ')).toContain('3');
    expect(texts(mount(<CardioCountdown count={0} />)).join(' ')).toContain('קדימה');
  });
});

/* ══════════════════════════ B.8 ══════════════════════════ */

describe('the finish control speaks to the woman pressing it', () => {
  it('the PAUSE screen offers סיימי ושמרי, not סיים ושמור', () => {
    setGender('female');
    const said = texts(mount(<CardioLiveView
  paceSec={342} {...liveProps} paused />)).join(' ');
    expect(said).toContain('סיימי ושמרי');
    expect(said).not.toContain('סיים ושמור');
  });

  /** "…including inside the confirmation that follows" — his words. One key, both doors. */
  it('and so does the CONFIRMATION behind it', () => {
    setGender('female');
    const said = texts(mount(<CardioLiveView
  paceSec={342} {...liveProps} paused confirmEnd />)).join(' ');
    expect(said).toContain('סיימי ושמרי');
    expect(said).not.toContain('סיים ושמור');
  });

  it('a man is still told סיים ושמור, in both places', () => {
    setGender('male');
    const said = texts(mount(<CardioLiveView
  paceSec={342} {...liveProps} paused confirmEnd />)).join(' ');
    expect(said).toContain('סיים ושמור');
    expect(said).not.toContain('סיימי ושמרי');
  });
});

/* ══════════════════════════ B.7 ══════════════════════════ */

/**
 * "The type is tiny — '0 מטר', the kilometre label, and the word 'קרדיו' at the top. Enlarge all
 * of it; there is plenty of room."
 *
 * The floor is 12.5. It is not an arbitrary number: it is the smallest size on this stage that is
 * still a readable Hebrew word rather than a Latin small-caps label pretending to be one. The
 * screen's hero is 84 pt, so nothing here is competing for the room.
 */
describe('nothing on the run is set too small to read', () => {
  const FLOOR = 12.5;

  /**
   * ⚠️ THIS TEST WAS VACUOUS ON ITS FIRST DRAFT and the browser caught what it could not.
   *
   * It rendered `CardioLiveView` with `splits: []`, so the SPLIT PILL — a word on the live stage,
   * set at 12 — never mounted, and the assertion passed over a screen that still had type below
   * its own floor. Every state a word can appear in has to be driven, or the floor only holds for
   * the states the fixture happens to reach.
   */
  const STATES: Array<[string, React.ReactElement]> = [
    ['running', <CardioLiveView
   paceSec={342} key="a" {...liveProps} />],
    ['a kilometre just logged (the split pill)', <CardioLiveView
   paceSec={342} key="b" {...liveProps} splits={SPLITS} />],
    ['paused', <CardioLiveView
   paceSec={342} key="c" {...liveProps} splits={SPLITS} paused />],
    ['the end sheet', <CardioLiveView
   paceSec={342} key="d" {...liveProps} splits={SPLITS} paused confirmEnd />],
    ['the kilometre moment', <CardioLiveView
   paceSec={342} key="e" {...liveProps} splits={SPLITS} kmMoment={SPLITS[1]} />],
  ];

  it.each(STATES)('every word clears the floor — %s', (_name, el) => {
    setGender('female');
    const small = typeSizes(mount(el)).filter((x) => x.size < FLOOR && /[֐-׿]/.test(x.text));
    expect(small).toEqual([]);
  });

  it('the three he named by hand — קרדיו, the band, the kilometre label', () => {
    setGender('female');
    const sizes = typeSizes(mount(<CardioLiveView
  paceSec={342} {...liveProps} />));
    const sizeOf = (text: string) => sizes.find((x) => x.text === text)?.size;
    expect(sizeOf('קרדיו')).toBeGreaterThanOrEqual(15); // the legend at the top
    expect(sizeOf('1,000 מ׳')).toBeGreaterThanOrEqual(FLOOR); // the band's end label
    /*
     * ⚠️ THE THIRD SEAT HOLDS PACE NOW (founder 2026-08-04). It was "4 ק״מ" — the same fact the band
     * directly above draws, twice — so the one seat that could carry the number every runner reads
     * first was spent repeating the instrument. The FLOOR is what he named; the label under it
     * changed, and the floor did not.
     */
    expect(sizeOf('‏/ק״מ')).toBeGreaterThanOrEqual(13); // the pace label under its figure
  });

  /**
   * The live row and the saved stage draw the SAME three facts one screen apart. They are two
   * components (`LiveStat` / `DoneStat`) that happened to share a literal, which is exactly how a
   * screen ends up half-fixed — so the size is one constant and this is the test that says so.
   */
  it('the saved stage’s readout labels agree with the live one’s', () => {
    setGender('female');
    const live = typeSizes(mount(<CardioLiveView
  paceSec={342} {...liveProps} />)).find((x) => x.text === '‏/ק״מ')?.size;
    // The pace slot on the live row and `זמן` on the done row are the same seat in one instrument.
    expect(live).toBeGreaterThanOrEqual(13);
  });
});
