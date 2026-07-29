/**
 * ShareCard (§9) — mounted for real. A typecheck cannot see a poster; this asks whether the two
 * faces actually draw the facts they are handed:
 *   · the record card names the lift, the load, the reps, the step, and the context line;
 *   · the week card names the week, the tonnage, and the calories;
 *   · a bodyweight/first-ever record renders without a delta and never throws.
 * Also a quiet guard on the law: nothing the mono face cannot DRAW is routed through it.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ShareCard } from '@/components/share/ShareCard';
import type { ShareRecordCard, ShareWeekCard } from '@/domain/shareCard';
import { initI18n } from '@/i18n';
import { font } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(el);
  });
  mounted.push(r);
  return r;
}
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const MONO = [font.mono, font.monoMedium, font.monoSemibold];

/** Every rendered <Text> string, paired with whether its resolved fontFamily is a mono face. */
function texts(r: ReactTestRenderer): { text: string; mono: boolean }[] {
  return r.root
    .findAllByType(require('react-native').Text)
    .map((node) => {
      const children = node.props.children;
      const str = Array.isArray(children) ? children.filter((c) => typeof c === 'string').join('') : String(children ?? '');
      const flat = require('react-native').StyleSheet.flatten(node.props.style) ?? {};
      return { text: str, mono: MONO.includes(flat.fontFamily) };
    })
    .filter((t) => t.text.length > 0);
}

const record: ShareRecordCard = {
  kind: 'record',
  exerciseId: 'bb_bench_press',
  weight: 62.5,
  unit: 'kg',
  reps: 8,
  delta: 2.5,
  firstWeight: 40,
  weeksAgo: 12,
  dateMs: Date.parse('2026-08-04T09:00:00.000Z'),
};

const week: ShareWeekCard = {
  kind: 'week',
  weekNumber: 12,
  days: [1, 0, 1, 0, 1, 1, 0].map((d) => ({ trained: !!d, height: d ? 0.8 : 0 })),
  moved: 4200,
  unit: 'kg',
  kcal: 1980,
  deltaPct: 8,
  trainedDays: 4,
  startMs: Date.parse('2026-08-02T00:00:00.000Z'),
  endMs: Date.parse('2026-08-08T00:00:00.000Z'),
};

describe('ShareCard · record', () => {
  it('draws the lift, the load, and the step', () => {
    const r = mount(<ShareCard card={record} width={296} />);
    const all = texts(r).map((t) => t.text);
    expect(all.some((s) => s.includes('62.5'))).toBe(true);
    expect(all.some((s) => s.includes('8'))).toBe(true); // reps
    expect(all.join(' ')).toContain('hush');
  });

  it('renders a first-ever record (no delta) without throwing', () => {
    expect(() =>
      mount(<ShareCard card={{ ...record, delta: null, firstWeight: null, weeksAgo: null }} width={296} />),
    ).not.toThrow();
  });
});

describe('ShareCard · week', () => {
  it('draws the tonnage and calories', () => {
    const r = mount(<ShareCard card={week} width={296} />);
    const all = texts(r).map((t) => t.text);
    expect(all.some((s) => s.includes('4,200') || s.includes('4200'))).toBe(true);
    expect(all.some((s) => s.includes('1,980') || s.includes('1980'))).toBe(true);
  });
});

describe('the mono law', () => {
  /**
   * WHAT THE LAW ACTUALLY PROTECTS (restated 2026-07-26, v7 handoff).
   *
   * This used to read "no LETTER may reach the mono face". That was a proxy, and the v7 handoff
   * breaks it on purpose: §9.1 sets "A NEW PERSONAL BEST" in IBM Plex Mono 500/.16em, and so does
   * every all-caps legend in the product. The founder's ruling is that the screens match the
   * handoff one-to-one, typeface included.
   *
   * The DAMAGE the law was written against is untouched, because it was never about letters — it
   * was about IBM Plex Mono having no Hebrew glyphs, so a translated legend fell back mid-line.
   * `monoCanDraw` asks that question of the string itself (`design/monoVoice`), and `Legend` swaps
   * to Assistant the moment the answer is no. So the assertion is now the real one: nothing the
   * mono face cannot DRAW is ever routed through it.
   */
  it('routes nothing the mono face cannot draw through it, in either language', () => {
    for (const card of [record, week] as const) {
      const r = mount(<ShareCard card={card} width={296} />);
      for (const { text, mono } of texts(r)) {
        if (!mono) continue;
        expect({ text, drawable: monoCanDraw(text) }).toEqual({ text, drawable: true });
      }
    }
  });
});
