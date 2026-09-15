/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST KEEPS ITS PROPORTION ON EVERY CASE.
 *
 * Founder, 2026-09-15: *"אני רוצה שתעבור על כל מסכי השעון ותוודא שהם תואמים ומתאימים לכל סוגי הגדלים
 * של האפל ווטש. אני רוצה שתוודא שהכל תואם בדיוק לפרופורציה של כל שעון ושעון."*
 *
 * What the audit found: ONE scale factor, derived from the case HEIGHT only, applied to 79 numbers —
 * while ~300 others (type, gutters, gaps, the header, the clock's reserve, every legend) stayed at their
 * 40 mm size. So no two cases drew the same design: on an Ultra the ring was 27 % larger and the words
 * around it were not. And a height already scaled at the call site was scaled AGAIN inside
 * `StageButton` — the Done button on three closing screens drew ~68 pt tall on an Ultra instead of 53.
 *
 * What holds now, and what this law holds closed:
 *   1 · the factor is the SMALLER of the two axis ratios, unrounded, never below 1 — so the scaled
 *       drawing fits every case on both axes (proved below over every supported case);
 *   2 · no layout number on the wrist is bare — each passes through `Fit.s`;
 *   3 · no number is scaled twice;
 *   4 · the pieces that depend on each other scale together (the seat's bleed and the corner it hides).
 *
 * ── Scope, honestly ────────────────────────────────────────────────────────────────────────────
 * No Swift compiles on this machine. This proves the PROPORTION exactly and by construction: whatever
 * the 40 mm case draws, every case draws the same, larger, and it fits. Whether each screen fits the
 * 40 mm case itself — and how the system's status bar sits on each case — is measured on a device.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SWIFT = readFileSync(join(__dirname, '../../targets/watch/WatchScreens.swift'), 'utf8');

/** Code only — the file's prose quotes the very numbers this law forbids. */
const CODE = SWIFT.split('\n')
  .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')))
  .join('\n');

/** Every case watchOS 10 runs on, in points (width × height). */
const CASES: Array<[string, number, number]> = [
  ['40 mm', 162, 197],
  ['41 mm', 176, 215],
  ['42 mm (Series 10/11)', 187, 223],
  ['44 mm', 184, 224],
  ['45 mm', 198, 242],
  ['46 mm (Series 10/11)', 208, 248],
  ['49 mm Ultra', 205, 251],
];

/** The rule, as the Swift states it — and as this test asserts the Swift states it. */
const scale = (w: number, h: number) => Math.max(1.0, Math.min(w / 162, h / 197));

describe('1 · one rule, both axes', () => {
  it('the factor is the smaller axis ratio, never below one, never capped, never rounded', () => {
    expect(CODE).toContain('static let designWidth: CGFloat = 162');
    expect(CODE).toContain('static let designHeight: CGFloat = 197');
    expect(CODE).toContain('max(1.0, min(width / designWidth, height / designHeight))');
    expect(CODE).toContain('let b = WKInterfaceDevice.current().screenBounds.size');
    expect(CODE).toContain('static func s(_ v: CGFloat) -> CGFloat { v * factor }');
    // The height-only, capped, rounded factor that drew a different design on every case.
    expect(CODE).not.toMatch(/min\(1\.3/);
    expect(CODE).not.toMatch(/\(v \* factor\)\.rounded\(\)/);
  });

  it('⛔ the 40 mm design, scaled, fits EVERY case on BOTH axes', () => {
    const report = CASES.map(([name, w, h]) => {
      const f = scale(w, h);
      return { name, f: Number(f.toFixed(3)), widthFits: 162 * f <= w + 1e-9, heightFits: 197 * f <= h + 1e-9 };
    });
    expect(report.filter((r) => !r.widthFits || !r.heightFits)).toEqual([]);
    // The smallest case IS the design — nothing on it moves.
    expect(report[0].f).toBe(1);
    // …and every larger case gains: nothing is drawn smaller than 40 mm draws it.
    expect(report.every((r) => r.f >= 1)).toBe(true);
  });

  it('a height-only factor would NOT have fitted — the reason the width is in the rule', () => {
    // On the narrower cases the height ratio exceeds the width ratio: scaling by height alone
    // overflows the width by that difference.
    const overflowing = CASES.filter(([, w, h]) => 162 * Math.max(1, h / 197) > w + 1e-9).map(([n]) => n);
    expect(overflowing.length).toBeGreaterThan(0);
  });
});

describe('2 · no layout number is bare', () => {
  const N = String.raw`-?\d+(?:\.\d+)?`;
  const bare = (re: RegExp) =>
    [...CODE.matchAll(re)].map((m) => m[0]).filter((s) => !/(:|\(|,|\[)\s*-?0+(\.0+)?\s*[),\]]?$/.test(s) && !/:\s*-?0+(\.0+)?$/.test(s));

  it('⛔ type', () => {
    expect(bare(new RegExp(String.raw`\.system\(size:\s*(?:${N}|Wrist\.[a-z]+)`, 'g'))).toEqual([]);
  });

  it('⛔ frames', () => {
    const inFrames = [...CODE.matchAll(/\.frame\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g)]
      .map((m) => m[1])
      .flatMap((a) => [...a.matchAll(new RegExp(String.raw`\b(?:width|height|minWidth|minHeight|maxWidth|maxHeight):\s*(?:${N}|Wrist\.[a-z]+)(?![\w.(])`, 'g'))].map((x) => x[0]))
      .filter((s) => !/:\s*0$/.test(s));
    expect(inFrames).toEqual([]);
  });

  it('⛔ gutters, gaps, spacers', () => {
    expect(bare(new RegExp(String.raw`\.padding\((?:[^()\n]*,\s*)?(?:${N}|Wrist\.[a-z]+)\)`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`(?:VStack|HStack|LazyVStack|LazyHStack)\([^)\n]*spacing:\s*${N}(?![\w.(])`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`Spacer\(minLength:\s*${N}\)`, 'g'))).toEqual([]);
  });

  it('⛔ radii, strokes, dashes, tracking, line spacing, offsets, shadows', () => {
    expect(bare(new RegExp(String.raw`\bcornerRadius:\s*${N}(?![\w.(])`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`\blineWidth:\s*${N}(?![\w.(])`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`\bdash:\s*\[\s*${N}`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`\.tracking\(${N}\)`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`\.lineSpacing\(${N}\)`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`\.offset\([^)\n]*\b[xy]:\s*${N}(?![\w.(])`, 'g'))).toEqual([]);
    expect(bare(new RegExp(String.raw`\.shadow\([^)\n]*\bradius:\s*${N}(?![\w.(])`, 'g'))).toEqual([]);
  });

  it('the clock’s reserve grows with the clock', () => {
    expect(CODE).toContain('.padding(direction == .rightToLeft ? .leading : .trailing, Fit.s(52))');
  });
});

describe('3 · nothing is scaled twice', () => {
  it('⛔ a button is handed its 40 mm height and type, and scales them itself', () => {
    // `StageButton` and `OutlineButton` apply `Fit.s` to `height` and `fontSize` inside — a scaled
    // value handed to them is scaled again (the 68 pt Done).
    const calls = [...CODE.matchAll(/\b(?:StageButton|OutlineButton)\(([\s\S]*?)(?:\)\s*\{|action:)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(10);
    expect(calls.filter((a) => /\b(?:height|fontSize):\s*Fit\.s\(/.test(a))).toEqual([]);
    expect(CODE).toContain('.frame(maxWidth: .infinity).frame(height: Fit.s(height))');
    expect(CODE.split('Text(title).font(.system(size: Fit.s(fontSize), weight: .semibold))').length - 1).toBe(2);
  });

  it('a component that takes a size scales it where it draws it', () => {
    expect(CODE).toContain('.font(.system(size: Fit.s(size), weight: .medium)).tracking(Fit.s(0.9))'); // Legend
    expect(CODE).toContain('Text(label(dir)).font(.system(size: Fit.s(fontSize)'); // LoadDelta
    expect(CODE).toContain('.frame(width: Fit.s(size), height: Fit.s(size * 0.82))'); // DrawCheck
    // …and the callers that already scale (`RestRing(diameter:)`, `Metric(valueSize:)`) are not
    // re-scaled inside: they draw what they are handed.
    expect(CODE).toContain('.frame(width: diameter, height: diameter)');
    expect(CODE).toContain('var valueSize: CGFloat = Fit.s(22)');
  });
});

describe('5 · nothing overflows its slot', () => {
  /*
   * Measured against 40 mm, several screens asked for more height than the case has — the inter-set
   * rest the most. SwiftUI does not shrink a stack that does not fit; the body runs on under the
   * buttons. Every screen's body is now offered its slot and, if it needs more, drawn uniformly smaller.
   */
  it('⛔ every screen body is fitted to the slot the action zone leaves', () => {
    const container = CODE.slice(CODE.indexOf('struct WristScreen'), CODE.indexOf('private struct NeededHeightKey'));
    expect(container).toContain('FitToSlot {');
    // …and the body is no longer simply allowed to hang past its frame.
    expect(container).not.toContain('.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)\n        .padding');
  });

  it('the shrink is uniform, laid out wider by the same factor, and floored where type stays readable', () => {
    const fit = CODE.slice(CODE.indexOf('struct FitToSlot'), CODE.indexOf('extension View {', CODE.indexOf('struct FitToSlot')));
    expect(fit).toContain('max(0.75, h / needed)');
    expect(fit).toContain('.frame(width: w / s, alignment: .top)');
    expect(fit).toContain('.frame(width: w / s, height: h / s, alignment: .top)');
    expect(fit).toContain('.scaleEffect(s, anchor: .top)');
    // A block that fits is untouched.
    expect(fit).toMatch(/needed > h \+ 0\.5\) \? max\(0\.75, h \/ needed\) : 1/);
  });

  it('the screen that is not a WristScreen and measured over the case is fitted too', () => {
    const severity = CODE.slice(CODE.indexOf('private struct PainSeverityScreen'), CODE.indexOf('private struct PainAcknowledgedScreen'));
    expect(severity).toContain('.fitToSlot()');
  });

  it('⛔ a one-line label never becomes two inside a row with no height for it', () => {
    for (const line of [
      'Text("\\(WatchCopy.liftWord.uppercased()) \\(lift.i)/\\(lift.n)")',
      'Legend(WatchCopy.whereIsIt, size: Wrist.legend).lineLimit(1)',
      'Legend(WatchCopy.howSharp, size: Wrist.legend).lineLimit(1)',
    ]) {
      expect(CODE).toContain(line);
    }
    const strip = CODE.slice(CODE.indexOf('private struct TopStrip'), CODE.indexOf('private struct ClockLane'));
    expect(strip.split('.lineLimit(1).minimumScaleFactor(0.75)').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('a rail of marks shrinks to its row instead of running off the case', () => {
    expect(CODE).toContain('.frame(minWidth: Fit.s(4), maxWidth: Fit.s(16)).frame(height: Fit.s(5))');
    expect(CODE).toContain('.frame(minWidth: Fit.s(4), maxWidth: Fit.s(14)).frame(height: Fit.s(4))');
  });
});

describe('4 · what depends on each other scales together', () => {
  it('⛔ the seat’s bleed scales with the corner it pushes off the glass', () => {
    // A fixed 16 pt bleed under a scaled 14 pt corner would let the corner peek back on an Ultra.
    expect(CODE).toContain('private var SEAT_BLEED: CGFloat { Fit.s(16) }');
    const seatedCorner = 14;
    for (const [, w, h] of CASES) expect(16 * scale(w, h)).toBeGreaterThanOrEqual(seatedCorner * scale(w, h));
  });

  it('the kilometre knob moves by its own scaled width', () => {
    expect(CODE).toContain('geo.size.width - Fit.s(9), geo.size.width * intoKm - Fit.s(4.5)');
  });
});
