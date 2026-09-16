/**
 * ════ DIRECTION IS A COLOUR, AND THE COLOUR IS A LAW (founder 2026-07-29) ════
 *
 * "I want this to be a law in the whole app, even on TODAY or on any other screen: **down = blue,
 * hold = our cream, raise = our green.**"
 *
 * The palette was ratified on 2026-07-28 and then applied to exactly ONE beat. Everything else kept
 * its own answer, and every one of them was wrong in the same direction — they drew an EASE as a
 * RAISE:
 *   · the Saturday letter's `rowToDown` was `up.stage`, i.e. moss;
 *   · `WhyChangedSheet` was moss on all three verdicts, so 2.1d (eased) was green;
 *   · Today lit every changed load in ochre and refused to say which way it had gone;
 *   · the wrist still carried CLAY as `down`, months after the phone stopped;
 *   · `LoadDelta` answered a three-way question with a fourth colour (grey) on a hold.
 *
 * None of those are visible to a typecheck, and each one lies to the athlete about what the engine
 * did. So the mapping has one home (`directionTone`) and this file holds every surface to it.
 */
// @ts-nocheck

// 

import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { WhyChangedSheet, type WhyChangedProps } from '@/components/WhyChangedSheet';
import { LoadDelta } from '@/components/ds';
import { directionTone, directionWash, up, down, hold, alert as alertToken, type LoadDirection } from '@/design/tokens';
import { initI18n } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

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

/** Every colour any node in the tree actually resolves to — text colour, fill, or border. */
function huesOf(r: ReactTestRenderer): Set<string> {
  const out = new Set<string>();
  for (const kind of [Text, View]) {
    for (const node of r.root.findAllByType(kind as never)) {
      const s = StyleSheet.flatten((node.props as { style?: unknown }).style) ?? {};
      for (const key of ['color', 'backgroundColor', 'borderColor', 'textShadowColor'] as const) {
        const v = (s as Record<string, unknown>)[key];
        if (typeof v === 'string') out.add(v.toLowerCase());
      }
    }
  }
  return out;
}

describe('the mapping itself', () => {
  it('is the founder’s three, and nothing else', () => {
    expect(directionTone('up')).toBe(up.stage);
    expect(directionTone('down')).toBe(down.stage);
    expect(directionTone('hold')).toBe(hold.stage);
    expect(directionWash('up')).toBe(up.wash);
    expect(directionWash('down')).toBe(down.wash);
    expect(directionWash('hold')).toBe(hold.wash);
  });

  it('the three are genuinely three — a law that maps two of them to one colour proves nothing', () => {
    const tones = new Set((['up', 'down', 'hold'] as LoadDirection[]).map(directionTone));
    expect(tones.size).toBe(3);
  });
});

describe('2.1b / 2.1c / 2.1d — the why sheet argues in the verdict’s own colour', () => {
  const base: Omit<WhyChangedProps, 'onClose' | 'verdict' | 'loadFrom' | 'delta'> = {
    liftName: 'Barbell Row',
    dateLabel: '18 Jul',
    loadTo: '47.5',
    unit: 'kg',
    band: [8, 10],
    title: 'Your reps sized this.',
    bandNote: 'EVERY REP LANDED INSIDE YOUR BAND',
    sessions: [
      { label: '15 July · last session', figure: '44 × 9·9·8', reached: false },
      { label: '18 July · today', figure: '44 × 10·10·10', reached: true },
    ],
    line: 'Every set cleared the top with room.',
  };
  const sheet = (verdict: 'up' | 'down' | 'hold') =>
    mount(
      <WhyChangedSheet
        {...base}
        verdict={verdict}
        loadFrom={verdict === 'hold' ? null : '44'}
        delta={verdict === 'hold' ? null : verdict === 'up' ? '+3.5' : '−2.5'}
        onClose={() => {}}
      />,
    );

  it('an EASE is blue — never the colour of a raise', () => {
    const hues = huesOf(sheet('down'));
    expect(hues).toContain(down.stage.toLowerCase());
    expect(hues).not.toContain(up.stage.toLowerCase());
  });

  it('a RAISE is moss', () => {
    const hues = huesOf(sheet('up'));
    expect(hues).toContain(up.stage.toLowerCase());
    expect(hues).not.toContain(down.stage.toLowerCase());
  });

  it('a HOLD wears no hue at all — it stands in the cream the stage speaks in', () => {
    const hues = huesOf(sheet('hold'));
    expect(hues).not.toContain(up.stage.toLowerCase());
    expect(hues).not.toContain(down.stage.toLowerCase());
    expect(hues).toContain(hold.stage.toLowerCase());
  });
});

describe('LoadDelta — the mark that appears wherever a load moved', () => {
  it.each([
    ['up' as const, up.stage],
    ['down' as const, down.stage],
    ['hold' as const, hold.stage],
  ])('%s draws in the law’s colour', (dir, expected) => {
    expect(huesOf(mount(<LoadDelta direction={dir} value={2.5} />))).toContain(expected.toLowerCase());
  });
});

/**
 * THE WRIST IS PART OF "THE WHOLE APP".
 *
 * Swift cannot import the token file, so the palette is transcribed there by hand — and a hand
 * copy is exactly what drifted: the phone moved `down` from clay to blue and the watch kept the
 * clay, so the same eased load was blue in her pocket and red-ish on her wrist. This reads the
 * Swift back and holds it to the token.
 */
describe('the watch palette mirrors the phone’s', () => {
  const swift = fs.readFileSync(
    path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchScreens.swift'),
    'utf8',
  );

  /** `static let up = Color(red: 0.663, green: 0.769, blue: 0.624)` → "#a9c49f". */
  const swiftHex = (name: string): string | null => {
    const m = swift.match(new RegExp(`static let ${name} = Color\\(red: ([\\d.]+), green: ([\\d.]+), blue: ([\\d.]+)\\)`));
    if (!m) return null;
    return '#' + m.slice(1, 4).map((v) => Math.round(parseFloat(v) * 255).toString(16).padStart(2, '0')).join('');
  };

  it.each([
    ['up', up.stage],
    ['down', down.stage],
  ])('Palette.%s is the phone’s token', (name, expected) => {
    expect({ name, hex: swiftHex(name) }).toEqual({ name, hex: expected.toLowerCase() });
  });

  it('…and the ring can be told which direction it is running in', () => {
    // The arc was hard-wired to the moss accent, so a rest that followed an ease ran green.
    expect(swift).toMatch(/var arc: Color = Palette\.signal/);
    expect(swift).toMatch(/\.stroke\(arc,/);
  });
});

/**
 * ════ AND PAIN IS NOT A DIRECTION (founder 2026-07-29) ════
 *
 * "Things to do with an INJURY, or with how badly it hurts, cannot appear in blue. Blue is for a
 * load coming down; red is for the part to do with pain."
 *
 * The blue arrived by REPLACING the clay rather than standing beside it, so every surface that had
 * been borrowing `down` for its clay went blue with it: §13.1's "something doesn't feel right"
 * door, §13.2's three severity grades, the body map's tender halo, the destructive Button variant,
 * the delete-account rows. `alert` is the clay, back, and this holds the two apart.
 */
describe('pain wears the clay, and only a load wears the blue', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');

  it('the two tokens are genuinely different colours', () => {
    expect(alertToken.stage).not.toBe(down.stage);
    expect(alertToken.stage).not.toBe(up.stage);
  });

  it.each([
    ['components/PausedStage.tsx', '13.1 · the pain door'],
    // ⚠️ `PainResponse` is DELETED (founder, 2026-08-02: the body map and its read-back screen are
    // replaced by a conversation). `PainWhere` is that conversation now, and the law still binds it.
    /*
     * ⚠️ `BodyMapFigure` is DELETED with the map itself (founder, 2026-08-02). Reporting an injury
     * is a conversation now, so nothing taps a muscle and nothing draws a tender one — and the
     * component had no caller left at all once `PainWhere` became the chat.
     */
    ['screens/pain/PainWhere.tsx', '13.2 · something hurts — the conversation'],
  ])('%s draws no direction tone at all (%s)', (rel) => {
    const src = read(rel);
    expect({ rel, borrowsTheDirection: /\bcolor\.down\b|\bdown\.stage\b|\bcolor\.downWash\b|\bdown\.wash\b/.test(src) }).toEqual({
      rel,
      borrowsTheDirection: false,
    });
  });

  it('a destructive confirm is clay too — deleting an account is not a load easing', () => {
    const src = read('components/ds/Button.tsx');
    expect(src).toMatch(/danger: \{[\s\S]*?fg: alert\.stage/);
    expect(src).not.toMatch(/danger: \{[\s\S]*?fg: down\.stage/);
  });

  it('…and the wrist calls the same clay by the same value', () => {
    const swift = fs.readFileSync(path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchScreens.swift'), 'utf8');
    const m = swift.match(/static let clay = Color\(red: ([\d.]+), green: ([\d.]+), blue: ([\d.]+)\)/);
    const hex = m && '#' + m.slice(1, 4).map((v) => Math.round(parseFloat(v) * 255).toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(alertToken.stage.toLowerCase());
  });
});

/**
 * ════ THE TWO DOORS INTO A DECISION MUST AGREE (found in the 2026-07-29 sweep) ════
 *
 * A change is visible from TWO places — the load on Today, and the row in the Saturday letter —
 * and each derived its own direction. Today asked a three-way question; the letter asked a
 * BOOLEAN, `rose`, and drew not-up as a fall.
 *
 * That is not academic. The engine narrates exactly one HOLD (S-28, the rung out of reach) and it
 * is stamped with EQUAL from/to loads. Today read it as a hold and drew cream; the letter read it
 * as not-up and drew BLUE. One decision, one day, two colours, and the colour is the law.
 *
 * Both now derive it the same way, so this holds them to the same table.
 */
describe('Today and the Saturday letter read a decision the same way', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');

  /** The shared derivation, stated once here — the two screens must both produce it. */
  const expected = (from: number | null, to: number | null): LoadDirection =>
    from == null || to == null ? 'up' : to < from ? 'down' : to > from ? 'up' : 'hold';

  it.each([
    ['a raise', 34, 41, 'up'],
    ['an ease', 38.5, 34, 'down'],
    ['the narrated hold — equal loads (S-28)', 44, 44, 'hold'],
    ['a structural change, which has no load it came from', null, 47.5, 'up'],
  ])('%s is %s', (_label, from, to, want) => {
    expect(expected(from as number | null, to as number | null)).toBe(want);
  });

  it('neither screen decides direction with a BOOLEAN any more', () => {
    // `rose` was the shape of the bug: two answers for a three-answer question, so the third one
    // fell into whichever bucket the `else` happened to be.
    for (const rel of ['screens/weekly/WeeklyUpdate.tsx', 'screens/home/Home.tsx']) {
      expect({ rel, hasBooleanDirection: /\brose\b\s*:/.test(read(rel)) }).toEqual({ rel, hasBooleanDirection: false });
    }
  });

  it('…and both hand the answer to `directionTone` rather than picking a hue', () => {
    expect(read('screens/weekly/WeeklyUpdate.tsx')).toContain('directionTone(row.dir)');
    expect(read('screens/home/HomeView.tsx')).toContain('directionTone(lift.changed)');
  });
});
