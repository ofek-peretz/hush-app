// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST CARRIES OUR OWN MARK (2026-10-10)
 *
 * The founder, looking at the photographs of the wrist's closing screen:
 *
 *   > *"מה שיותר מוזר לי שאני לא רואה את השם או הלוגו של האפליקציה שלנו מופיעה במסכי השעון. והאם
 *   > הלוגו שבשעון עצמו של האפליקציה צריך לבדוק גם. תראה למשל את מסך הסיום, מה קשור המשקולת הזאת?
 *   > הסמל שלנו אחר בכלל."*
 *
 * What was there:
 *
 *   · The closing was sealed with a moss rule between two end ticks. It was Hush's range mark, kept
 *     through the rename under the name "tally" — and on glass a rule with a tick at each end is a
 *     dumbbell. It stood centred above the workout's name on the one screen a person photographs.
 *   · Home — the first face of every session — named the workout and never the product.
 *   · Where the name did stand (the waiting face, the run's closing) it was `Text("FERROX")` in
 *     the system face with its letters pushed apart. FERROX has a wordmark; the phone draws it.
 *   · The watch's app icon was the right mark, drawn at seven tenths of the phone's size: under the
 *     watch's circular mask, at the size of the Home Screen's grid, the smallest mark on the dial.
 *
 * What stands now: the mark and the DRAWN name (`FerroxLockup`, geometry from the brand's masters)
 * on the wrist's covers — the waiting face and both closings; the mark alone leading Home's header;
 * nothing on a set, a rest or a crossing, where every point belongs to the lift.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const SCREENS = read('targets/watch/WatchScreens.swift');
const FACE = read('targets/watch-widget/HushComplication.swift');
/** The source with its comments taken out — a law about what is DRAWN must not be satisfied, or
 *  broken, by a sentence that only talks about it. */
const code = (src: string): string =>
  src
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => l.trim().length > 0 && !/^\s*\/\//.test(l))
    .join('\n');
const DRAWN = code(SCREENS);
const count = (src: string, needle: string): number => src.split(needle).length - 1;
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('⛔ the dumbbell is gone, and it cannot come back under another name', () => {
  it('nothing on the wrist draws the old range mark', () => {
    expect(DRAWN).not.toContain('TallyMark');
    expect(DRAWN).not.toContain('RangeGlyph');
  });

  it('the closing of a workout is signed with the lockup, in the header lane', () => {
    const result = between(DRAWN, 'private var result: some View', 'private func milestoneBeat');
    expect(result).toContain('ClockLane { FerroxLockup() }');
    // …and the body under it opens on the workout's name: no mark of any kind takes a row there.
    const body = between(result, 'VStack(spacing: Fit.s(10)) {', 'ViewThatFits');
    expect(body.split('\n')[1].trim()).toBe('Text(mirror.workoutName ?? WatchCopy.thatsTheWork)');
  });

  it("the run's closing carries the same lockup", () => {
    const run = between(DRAWN, 'struct CardioCompleteScreen', 'private var paceLabel');
    expect(run).toContain('ClockLane { FerroxLockup() }');
  });
});

describe('⛔ the name is drawn, not typed', () => {
  it('no screen sets FERROX in a system face', () => {
    expect(DRAWN).not.toMatch(/Text\("FERROX"\)/);
    // The one place the word is a string: what VoiceOver reads for the lockup.
    expect(count(DRAWN, '"FERROX"')).toBe(1);
    expect(DRAWN).toContain('.accessibilityLabel("FERROX")');
  });

  it("the wordmark is the brand master's geometry", () => {
    const master = fs.readFileSync(path.join(MOBILE, '..', '..', 'brand', 'logo', 'export', 'ferrox-wordmark.svg'), 'utf8');
    expect(master).toContain('viewBox="-2 -4 704 108"');
    const strokes = between(DRAWN, 'private struct FerroxWordStrokes', 'private struct FerroxWordBowls');
    const bowls = between(DRAWN, 'private struct FerroxWordBowls', 'private struct FerroxWordmark');
    expect(strokes).toContain('rect.width / 704, rect.height / 108');
    // Every bar of the master is a bar here — F's three and E's four by their own numbers, the two
    // stems of the Rs by the pair of x they stand at.
    const bars = [...master.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"\/>/g)].map((m) => m.slice(1, 5));
    expect(bars).toHaveLength(9);
    for (const [x, y, w, h] of bars) {
      if (x === '222' || x === '346') {
        expect([y, w, h]).toEqual(['0', '16', '100']);
        continue;
      }
      expect(strokes).toContain(`bar(${x}, ${y}, ${w}, ${h})`);
    }
    expect(strokes).toContain('for x: CGFloat in [222, 346]');
    expect(strokes).toContain('path.addRect(bar(x, 0, 16, 100))');
    // The counters: two radii for an R's bowl, two ellipses for the O.
    expect(master).toContain('A29 29 0 0 1 270 58');
    expect(master).toContain('A13 13 0 0 1 270 42');
    expect(bowls).toContain('[(0, 0, 29), (16, 16, 13)]');
    expect(master).toContain('A51 51.5');
    expect(master).toContain('A35 35.5');
    expect(bowls).toContain('p(470, -1.5), size: CGSize(width: 102 * s, height: 103 * s)');
    expect(bowls).toContain('p(486, 14.5), size: CGSize(width: 70 * s, height: 71 * s)');
    // Strokes overlap (a hole wherever F's stem met its arm, if filled even-odd); counters ARE holes.
    const word = between(DRAWN, 'private struct FerroxWordmark', 'private struct FerroxLockup');
    expect(word).toContain('FerroxWordStrokes().fill(Palette.ink0)');
    expect(word).toContain('FerroxWordBowls().fill(Palette.ink0, style: FillStyle(eoFill: true))');
  });

  it('the lockup reads left to right on a Hebrew wrist — a mirrored wordmark is not a name', () => {
    const lockup = between(DRAWN, 'private struct FerroxLockup', '\n}\n');
    // A right-to-left layout mirrors a shape's path AND the row's order; one flip of the whole row
    // undoes both. The direction is read, never set — the wrist turns around once, at the root.
    expect(lockup).toContain('@Environment(\\.layoutDirection) private var direction');
    expect(lockup).toContain('.scaleEffect(x: direction == .rightToLeft ? -1 : 1, y: 1)');
    expect(lockup.indexOf('FerroxMark(')).toBeLessThan(lockup.indexOf('FerroxWordmark('));
    expect(DRAWN.match(/\.environment\(\\\.layoutDirection/g)).toHaveLength(1);
  });
});

describe('⛔ the brand stands on the covers, and never on the lift', () => {
  it('the lockup is drawn in three places: the waiting face and the two closings', () => {
    expect(count(DRAWN, 'FerroxLockup(')).toBe(3);
    const idle = between(DRAWN, 'case .idle:', 'Text(WatchCopy.idleWaiting)');
    expect(idle).toContain('FerroxLockup(mark: 24)');
  });

  it("Home's two faces are led by the mark, and no other strip is", () => {
    expect(DRAWN).toContain('TopStrip(text: WatchCopy.firstWorkout, mark: true)');
    expect(DRAWN).toContain('TopStrip(text: WatchCopy.upNext.uppercased(), mark: true)');
    expect(count(DRAWN, 'mark: true')).toBe(2);
    // The mark is the first thing on the row, ahead of the legend.
    const strip = between(DRAWN, 'private struct TopStrip', 'private func line(');
    expect(strip.indexOf('if mark { FerroxMark()')).toBeGreaterThan(-1);
    expect(strip.indexOf('if mark { FerroxMark()')).toBeLessThan(strip.indexOf('if let full {'));
  });

  it('the mark is the horns in cream and the dot in moss', () => {
    const mark = between(DRAWN, 'private struct FerroxMark', '\n}\n');
    expect(mark).toContain('FerroxHorns().fill(Palette.ink0)');
    expect(mark).toContain('FerroxDot().fill(Palette.signal)');
  });
});

describe('the face and the icon', () => {
  it("the complication's mark is the same horns and dot, in the face's one ink", () => {
    expect(FACE).toContain('private struct FerroxHorns: Shape');
    expect(FACE).toContain('path.addArc(center: p(50, 64), radius: 14 * s');
    expect(SCREENS).toContain('path.addArc(center: p(50, 64), radius: 14 * s');
  });

  it('the watch icon is no longer described as a placeholder', () => {
    const target = read('targets/watch/expo-target.config.js');
    expect(target).not.toMatch(/placeholder/i);
    expect(target).toContain("icon: './icon.png'");
  });
});
