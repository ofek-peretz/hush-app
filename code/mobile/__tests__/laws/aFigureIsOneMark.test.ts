/**
 * ════ ⛔ A FIGURE IS ONE MARK, AND A SMALL ONE IS NEVER THE HERO (design audit, 2026-09-29) ════
 *
 * The audit walked every screen and found the product's numbers failing in two ways that no
 * existing law could see:
 *
 *   1. **"42 . 5" and "2 : 29".** IBM Plex Mono gives every glyph the same advance — the whole
 *      point of a tabular face — so the decimal point and the colon stand in a full digit-wide cell.
 *      At 40–84 points that cell is a visible gap, and a load reads as three marks instead of one
 *      number. `ds/Figure.opticalFigure` sets the separators in the sans, whose "." is a sliver, and
 *      leaves every digit in the mono. This law holds every BIG mono figure (28 pt and up) to it.
 *
 *   2. **"0.3 t" and "2 kcal" as heroes.** A figure that small, in a unit that big, reads as
 *      nothing — and it sat in the hero slot of the finish poster and the first line of Today.
 *      `sessionMetrics.massFigure` writes a total under a tonne in her own unit (340 kg), and
 *      `energy.KCAL_SHOWN_FROM` keeps a calorie total too small to mean anything off the page.
 *
 * ⚠️ WHAT THE SCAN CAN AND CANNOT SEE. It reads the style sheet of every screen and component,
 * finds each style that sets a mono face at 28 pt or more, and follows each `<Text>` wearing it to
 * its children. A child that is provably an integer (a count, a code, a constant) cannot carry a
 * separator, so it is named below WITH ITS REASON rather than guessed at — and an entry whose Text
 * is gone fails as stale, so the list cannot rot into a blanket exemption.
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import React from 'react';
import { globSync } from 'glob';
import { opticalFigure } from '@/components/ds/Figure';
import { massFigure } from '@/domain/sessionMetrics';
import { KCAL_SHOWN_FROM } from '@/domain/energy';
import { font } from '@/design/tokens';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const files = globSync('**/*.tsx', { cwd: SRC, absolute: true }).filter((f) => !rel(f).startsWith('screens/dev/'));

const RAMP = { body: 17, lead: 20, subhead: 24, head: 30, title: 40, hero: 56 };
const TEXT_SCALE = { '2xs': 17, xs: 17, sm: 17, base: 17, md: 18, lg: 20, xl: 24, '2xl': 30, '3xl': 38, '4xl': 44, '5xl': 64, data: 84 };
const BIG = 28;

/** Mono styles at or above BIG, by name, read with real brace matching (styles nest objects). */
function bigMonoStyles(src: string): Map<string, number> {
  const out = new Map<string, number>();
  const at = src.indexOf('StyleSheet.create(');
  if (at < 0) return out;
  const key = /\n {2}(\w+): \{/g;
  key.lastIndex = at;
  let m: RegExpExecArray | null;
  while ((m = key.exec(src))) {
    let depth = 1;
    let i = key.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const decl = src.slice(key.lastIndex, i);
    key.lastIndex = i;
    if (!/fontFamily: font\.mono/.test(decl)) continue;
    const n = decl.match(/fontSize: (\d+)/);
    const r = decl.match(/fontSize: ramp\.(\w+)/);
    const t = decl.match(/fontSize: textScale(?:\.(\w+)|\['(\w+)'\])/);
    const size = n ? +n[1] : r ? RAMP[r[1]] ?? 0 : t ? TEXT_SCALE[t[1] ?? t[2]] ?? 0 : 0;
    if (size >= BIG) out.set(m[1], size);
  }
  return out;
}

/** Every `<Text>` that wears `styles.<name>`, with the children up to ITS OWN `</Text>`. */
function textsWearing(code: string, name: string): { line: number; kids: string }[] {
  const out: { line: number; kids: string }[] = [];
  const open = new RegExp(`<Text\\b[^>]*\\bstyles\\.${name}\\b[^>]*>`, 'g');
  let u: RegExpExecArray | null;
  while ((u = open.exec(code))) {
    if (u[0].endsWith('/>')) continue;
    let depth = 1;
    const tag = /<Text\b[^>]*?(\/?)>|<\/Text>/g;
    tag.lastIndex = u.index + u[0].length;
    let end = code.length;
    let t: RegExpExecArray | null;
    while ((t = tag.exec(code))) {
      if (t[0] === '</Text>') depth--;
      else if (t[1] !== '/') depth++;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    out.push({ line: code.slice(0, u.index).split('\n').length, kids: code.slice(u.index + u[0].length, end) });
  }
  return out;
}

/**
 * Big mono figures that provably hold an integer, a code, or one glyph — no separator can reach
 * them. `file:style` → why. A new entry needs the same: a reason a reader can check.
 */
const INTEGER_ONLY: Record<string, string> = {
  'screens/session/WellDone.tsx:decisionNum': 'a count of decisions',
  'screens/session/WellDone.tsx:earnedFigure': 'set counts (`setsFrom` / `setsTo`); the load rows wrap their nested runs',
  'screens/session/SessionFlow.tsx:capTimes': 'the lone "×" between the two captured figures',
  'screens/onboarding/ProgramCreated.tsx:bigNum': 'FREE_SESSION_LIMIT, an integer constant',
  'screens/home/HomeView.tsx:liveStatValue': 'kcal and loads-raised are integers; the tonnage wraps',
  'screens/home/HomeView.tsx:sealCount': '"3/3" — whole workouts; "/" is not a separator this face spaces',
  'screens/crew/Crew.tsx:heroNum': 'weeks in a row, an integer',
  'screens/coach/CoachInvite.tsx:code': 'an invite code — letters and digits',
  'components/TrainTogetherSheet.tsx:code': 'a pairing code — letters and digits',
  'screens/cardio/Cardio.tsx:countNum': 'the 3-2-1 countdown, or its word',
  'screens/cardio/Cardio.tsx:kmLiveMetresNum': 'whole metres (Math.floor)',
  'components/WhyHereSheet.tsx:sets': 'a set count',
  'components/ds/NumberPad.tsx:glyph': 'one key of the pad — the "." key is a key, not a figure',
};

describe('⛔ a big figure is set as one mark', () => {
  it('opticalFigure sets ".", ":" and "," in the sans and leaves every digit in the mono', () => {
    const parts = opticalFigure('42.5') as React.ReactElement[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.map((p) => (typeof p === 'string' ? p : p.props.children))).toEqual(['42', '.', '5']);
    expect(parts[1].props.style.fontFamily).toBe(font.sansSemibold);
    const clock = opticalFigure('2:29') as React.ReactElement[];
    expect(clock.map((p) => (typeof p === 'string' ? p : p.props.children))).toEqual(['2', ':', '29']);
    // an integer is returned as itself — no element is made for a figure with nothing to fix
    expect(opticalFigure('412')).toBe('412');
    expect(opticalFigure(58)).toBe('58');
  });

  it('every mono style at 28 pt or more routes its figure through opticalFigure (or is a named integer)', () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const styles = bigMonoStyles(src);
      if (!styles.size) continue;
      const code = src.slice(0, src.indexOf('StyleSheet.create('));
      for (const [name] of styles) {
        const id = `${rel(f)}:${name}`;
        for (const { line, kids } of textsWearing(code, name)) {
          seen.add(id);
          if (/opticalFigure\(|<Figure\b/.test(kids)) continue;
          if (INTEGER_ONLY[id]) continue;
          offenders.push(`${rel(f)}:${line} styles.${name} → ${kids.trim().replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // …and the exemptions still point at something: a stale entry is a hole nobody can see.
    expect(Object.keys(INTEGER_ONLY).filter((id) => !seen.has(id))).toEqual([]);
  });

  it('the scan really read the product (this is not passing on an empty sweep)', () => {
    let n = 0;
    for (const f of files) n += bigMonoStyles(fs.readFileSync(f, 'utf8')).size;
    expect(n).toBeGreaterThan(30);
  });
});

describe('⛔ a small number is never the hero', () => {
  it('a total under a tonne is written in her unit; from a tonne up, in tonnes', () => {
    expect(massFigure(340, 'kg')).toEqual({ value: '340', tonnes: false });
    expect(massFigure(340, 'lb')).toEqual({ value: '750', tonnes: false });
    expect(massFigure(4200, 'kg')).toEqual({ value: '4.2', tonnes: true });
    expect(massFigure(4200, 'lb')).toEqual({ value: '4.2', tonnes: true });
    // the edge: 999.6 kg would round to "1000 kg" — it is a tonne by then, and says so
    expect(massFigure(999.6, 'kg')).toEqual({ value: '1.0', tonnes: true });
    expect(massFigure(0, 'kg')).toEqual({ value: '0', tonnes: false });
    expect(massFigure(Number.NaN, 'kg')).toEqual({ value: '0', tonnes: false });
    // a surface keeps its own tonne format (the board drops the decimal past ten)
    expect(massFigure(12_345, 'kg', (t) => String(Math.round(t)))).toEqual({ value: '12', tonnes: true });
  });

  it('every surface that prints a total mass decides its unit through massFigure', () => {
    const TONNE_COPY = /t\('(weekly\.tonneUnit|progress\.unitTonnes|share\.tonnesMoved|complete\.tonneUnit)'/;
    const off = files
      .filter((f) => TONNE_COPY.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !/massFigure\(/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(off).toEqual([]);
  });

  it('every surface that prints a calorie total holds it to KCAL_SHOWN_FROM', () => {
    expect(KCAL_SHOWN_FROM).toBeGreaterThan(1);
    const KCAL_COPY = /t\('(complete\.kcal|weekly\.statKcal|progress\.unitKcal|share\.weekSpent|progress\.badgeBurned)'/;
    const off = files
      .filter((f) => KCAL_COPY.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !/KCAL_SHOWN_FROM/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(off).toEqual([]);
  });
});
