// @ts-nocheck
/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST TAKES THE WHOLE GLASS — and it is PHOTOGRAPHED, not computed (2026-10-10)
 *
 * The founder, after the watch pass:
 *
 *   > *"ארצה רק שתוודא שהמסכים עצמם לא עמוסים מבחינת פרופורציה ושהכל קריא וברור עבור המשתמש, כי צריך
 *   > לזכור שזה שעון ובזמן אימון."*
 *
 * Nothing in this repository had ever DRAWN the watch app. Every wrist law reads source; the
 * 2026-09-15 proportion pass was arithmetic against a 197 pt case and said so ("no Swift compiles
 * here and nothing was rendered"). So a gallery was built (`native-tests/watch-gallery`): the watch
 * target's own sources, compiled into a simulator app, fed the envelopes a phone sends, and
 * photographed on every case size. The first photographs (watchOS 26, 40 mm and 45 mm):
 *
 *   · watchOS keeps an app's root INSIDE its safe area. The row beside the clock — 37.5 pt on 40 mm —
 *     stood empty with our header under it, and 19 pt at the foot stood empty under buttons whose
 *     "seated" bottom was drawn in mid-air. 140 pt of 197 were ours. Bodies shrank to the 0.75 floor
 *     and still ran under the buttons: the crossing's ring behind Skip rest, "Paused" behind Resume,
 *     the live set's own figures sliced by Complete set.
 *   · With the glass taken: the lift's name under the clock's figures on 45 mm (the clock does not
 *     scale by our factor); "…תרגיל" and "…2 · ירך אחורית" (the count lost, the word kept); a lift's
 *     name cut at the word that tells it from its neighbour; "2.5+" over "ק״ג" in one chip; the
 *     lift-done check drawn BACKWARDS on a Hebrew wrist; the pain door read "משהו לא מרגיש…".
 *
 * This law holds the fixes; the photographs are the evidence, and they are one push away again
 * (`git push origin HEAD:ci/watch-gallery`, then `git fetch origin ci/watch-renders`).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');
const SCREENS = read('targets/watch/WatchScreens.swift');
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('⛔ every screen takes the container, top and bottom', () => {
  it('the root takes it — and so does every PAGE, because a pager hands its pages the safe area back', () => {
    const glass = flat(between(SCREENS, 'struct WholeGlass<Content: View>: View', '// MARK: Root'));
    expect(glass).toContain(
      'GeometryReader { glass in content() .padding(.top, Wrist.rowTop(band: glass.safeAreaInsets.top)) .frame(maxWidth: .infinity, maxHeight: .infinity) .ignoresSafeArea(.container, edges: [.top, .bottom]) }',
    );
    const root = between(SCREENS, 'struct WatchRootView: View', '@ViewBuilder private var content: some View');
    // Named as a view, not through the modifier: `everythingBuiltCanBeReached` walks from view to view.
    expect(flat(root)).toMatch(/WholeGlass \{ (\/\*[\s\S]*?\*\/ )?content \} \.background\(Palette\.stage0\.ignoresSafeArea\(\)\)/);
    // The second photographs: applied at the root alone, every execution screen stayed where it was.
    const pager = between(SCREENS, 'private struct ExecutionPager<Content: View>: View', 'private extension View');
    expect(pager.match(/\.wholeGlass\(\)/g)).toHaveLength(3); // pause · the stage · glance
    const run = between(SCREENS, 'struct CardioPager: View', 'private struct KmLoggedScreen');
    expect(run.match(/\.wholeGlass\(\)/g)).toHaveLength(2);
    // Every `TabView` in the file is one of those two.
    expect(SCREENS.match(/\bTabView\(/g)).toHaveLength(2);
  });

  it('⛔ the header row is placed by the SYSTEM\'s band, not by our scale — the clock does not grow with `Fit`', () => {
    expect(flat(SCREENS)).toContain('static func rowTop(band: CGFloat) -> CGFloat { max(Fit.s(4), band * 0.46 - Fit.s(head) / 2) }');
    // The numbers the rule was read off (pt): the band, and where the clock's figures centre and end.
    const head = 20;
    for (const [name, fit, band, clockMid, clockEnd] of [['40 mm', 1.0, 37.5, 16.25, 23.5], ['45 mm', 198 / 162, 49, 23.5, 31]] as const) {
      const top = Math.max(4 * fit, band * 0.46 - (head * fit) / 2);
      const rowMid = top + (head * fit) / 2;
      const nameTop = top + head * fit + 1 * fit; // the live set: the row, a 1 pt gap, the lift's name
      expect({ name, level: Math.abs(rowMid - clockMid) <= 2 }).toEqual({ name, level: true });
      expect({ name, clear: nameTop >= clockEnd + 2 }).toEqual({ name, clear: true });
    }
    // The fixed 6 pt this replaced would have put the 45 mm name at ~33 pt — under figures ending at 31.
    expect(SCREENS).not.toMatch(/static let top: CGFloat/);
  });

  it('the live set\'s header keeps the clock\'s lane on the PHYSICAL right, and its row is the row every screen has', () => {
    const header = between(SCREENS, 'private var header: some View', 'private func positionLine');
    expect(header).toContain('ClockLane {');
    expect(header).toContain('.frame(height: Fit.s(Wrist.head))');
    // `.trailing` is the left of a Hebrew wrist: harmless while the row sat under the clock, wrong beside it.
    expect(SCREENS).not.toMatch(/\.padding\(\.trailing, Fit\.s\(52\)\)/);
  });

  it('a screen with nothing to press keeps its last line out of the case\'s curve — and no button ever gets that gap', () => {
    expect(SCREENS).toContain('static let sill: CGFloat = 12');
    expect(SCREENS.match(/\.padding\(\.bottom, Fit\.s\(Wrist\.sill\)\)/g)).toHaveLength(2); // the glance · connection lost
    for (const line of SCREENS.split('\n').filter((l) => l.includes('Wrist.sill') && l.includes('padding'))) {
      expect(line).not.toMatch(/StageButton|OutlineButton/);
    }
  });
});

describe('⛔ nothing she reads is cut', () => {
  it('the strip gives way in order — the chip\'s chevron, then the word — and never loses the count', () => {
    const strip = flat(between(SCREENS, 'private struct TopStrip: View', 'private struct ClockLane'));
    expect(strip).toContain('HStack(spacing: Fit.s(7)) { line(full); chip(chevron: true) } HStack(spacing: Fit.s(7)) { line(full); chip(chevron: false) } HStack(spacing: Fit.s(7)) { line(brief ?? full).minimumScaleFactor(0.75); chip(chevron: false) }');
    expect(strip).toContain('private var brief: String? { text != nil ? short : lift.map { "\\($0.i)/\\($0.n)" } }');
    // The crossing's short form keeps its direction on a Hebrew wrist (it has no Hebrew letter of its own).
    expect(SCREENS).toContain('return WatchCopyStore.isRTL ? "\\u{200F}\\(i) ← \\(min(i + 1, n))" : "\\(i) → \\(min(i + 1, n))"');
    expect(SCREENS).toContain('TopStrip(text: crossing, short: crossingShort, controlsHint: true)');
  });

  it('the live set: the muscle gives way before the count, and the lift\'s name is read whole', () => {
    const header = flat(between(SCREENS, 'private var header: some View', 'private func positionLine'));
    expect(header).toContain('ViewThatFits(in: .horizontal) { positionLine(setPosition) positionLine(setCount).minimumScaleFactor(0.75) }');
    expect(header).toContain('Text(mirror.exerciseName) .font(.system(size: Fit.s(Wrist.body), weight: .semibold)).foregroundStyle(Palette.ink0) .lineLimit(2).minimumScaleFactor(0.85).multilineTextAlignment(.leading) .fixedSize(horizontal: false, vertical: true)');
    // …and the header is as tall as its name: the fixed 38 pt that held it to one line is gone.
    expect(header).not.toContain('.frame(height: Fit.s(38)');
  });

  it('a label never touches its button\'s edge, and an outline button takes two lines before an ellipsis', () => {
    const stage = flat(between(SCREENS, 'struct StageButton: View', 'private struct Triangle'));
    expect(stage).toContain('.padding(.horizontal, Fit.s(8)) .frame(maxWidth: .infinity).frame(height: Fit.s(height))');
    const outline = flat(between(SCREENS, 'private struct OutlineButton: View', '* ════ CR1 · READY'));
    expect(outline).toContain('.lineLimit(2).minimumScaleFactor(0.8).multilineTextAlignment(.center) } .padding(.horizontal, Fit.s(6)) .frame(maxWidth: .infinity).frame(height: Fit.s(height))');
  });

  it('the closing screen: three figures at ONE size, and a lift read back by its whole name', () => {
    const done = between(SCREENS, 'struct CompleteScreen: View', '// MARK: 07 · Paused');
    /*
     * Photographed 2026-10-10: each figure scaled into its own third, so "52", "412" and "11.7" stood
     * in three sizes on one row; and the read-back held every name to one line beside its figures —
     * "לחיצת חזה…" twice, for the bar and for the incline dumbbells.
     */
    expect(flat(done)).toContain('ViewThatFits(in: .horizontal) { completeRow(sm, size: 26) completeRow(sm, size: 22) completeRow(sm, size: 19) completeRow(sm, size: 16) }');
    const metric = flat(between(done, 'private func completeMetric(_ value: String, _ label: String, _ size: CGFloat) -> some View', '/**'));
    expect(metric).toContain('.font(.system(size: Fit.s(size), weight: .medium, design: .monospaced)).monospacedDigit()');
    expect(metric).toContain('.lineLimit(1).fixedSize()');
    expect(metric).not.toContain('minimumScaleFactor'); // a figure never scales by itself — the ROW picks the size
    const read = flat(between(done, 'private var readBack: some View', 'private func readBest'));
    expect(read).toContain('ViewThatFits(in: .horizontal) { HStack(spacing: Fit.s(4)) { Text(lift.name) .font(.system(size: Fit.s(14))) .foregroundStyle(Palette.ink0) .lineLimit(1).fixedSize() Spacer(minLength: Fit.s(4)) readBest(lift.best) }');
    expect(read).toContain("Text(lift.name) .font(.system(size: Fit.s(14))) .foregroundStyle(Palette.ink0) .lineLimit(1).truncationMode(.tail) .frame(maxWidth: .infinity, alignment: .leading) }");
    // Every list on the wrist is clipped to its own frame: with the glass taken, rows scrolled up under the header and the clock.
    expect(SCREENS.split('ScrollView {').length - 1).toBe(2);
    expect(SCREENS.split('\n').filter((l) => l.trim() === '.clipped()')).toHaveLength(2);
  });

  it('the moved-load chip is one line, and its sign stays in front of its number', () => {
    const delta = flat(between(SCREENS, 'struct LoadDelta: View', 'private struct CheckShape'));
    expect(delta).toContain('.lineLimit(1).fixedSize()');
    expect(delta).toContain('return "\\u{2066}" + (dir > 0 ? "+" : "−") + fmtW(abs(deltaKg)) + "\\u{2069} " + WatchCopy.kg');
  });
});

describe('⛔ a Hebrew wrist is set in Hebrew', () => {
  it('no legend is letter-spaced, and a legend that carries a word is not set in a face with no Hebrew', () => {
    expect(SCREENS).toContain('static func track(_ v: CGFloat) -> CGFloat { WatchCopyStore.isRTL ? 0 : Fit.s(v) }');
    expect(SCREENS).toContain('static var legendDesign: Font.Design { WatchCopyStore.isRTL ? .default : .monospaced }');
    // Every spaced line goes through the one helper. (The wordmark was the one exception while it
    // was typed; it is drawn now — `theWristCarriesOurOwnMark`.)
    const spaced = SCREENS.split('\n').filter((l) => /\.tracking\(/.test(l) && !/^\s*(\*|\/\/|\/\*)/.test(l));
    expect(spaced.filter((l) => !l.includes('Wrist.track('))).toEqual([]);
    // …and none of them pairs a word with the monospaced face.
    expect(spaced.filter((l) => l.includes('design: .monospaced') && l.includes('Wrist.track('))).toEqual([]);
  });

  it('a check is the same mark in every script — a right-to-left layout does not draw it backwards', () => {
    const check = flat(between(SCREENS, 'private struct DrawCheck: View', '// MARK: The brand'));
    expect(check).toContain('.scaleEffect(x: direction == .rightToLeft ? -1 : 1, y: 1)');
    // Read, never set: the wrist still turns around exactly once, at the root.
    expect(SCREENS.match(/\.environment\(\\\.layoutDirection/g)).toHaveLength(1);
  });
});

describe('the gallery — how the wrist is seen', () => {
  it('it compiles the PRODUCT\'s sources and draws the PRODUCT\'s root; nothing in it lays out a screen', () => {
    const render = read('native-tests/watch-gallery/render.sh');
    expect(render).toContain('cp "$MOBILE"/targets/watch/*.swift "$WORK/src/"');
    expect(render).toContain('rm "$WORK/src/HushWatchApp.swift"');
    expect(render).toMatch(/swiftc -parse-as-library -Onone -D GALLERY/);
    const app = read('native-tests/watch-gallery/GalleryApp.swift');
    expect(app).toContain('WatchRootView(model: model)');
    expect(app).toContain('guard let envelope = WatchWire.decodeEnvelope(json)');
    expect(app).toContain('model.apply(envelope)');
    // It never opens the wire or asks HealthKit: a gallery has neither a phone nor a body.
    expect(app.replace(/\/\/.*$/gm, '')).not.toMatch(/model\.start\(\)/);
  });

  it('⛔ the product carries exactly ONE seam for it, compiled out of every build that ships', () => {
    const watch = fs.readdirSync(path.join(MOBILE, 'targets', 'watch')).filter((f) => f.endsWith('.swift')).map((f) => read(`targets/watch/${f}`)).join('\n');
    expect(watch.match(/#if GALLERY/g)).toHaveLength(1);
    const seam = between(SCREENS, '#if GALLERY', '#endif');
    expect(seam).toContain('ProcessInfo.processInfo.environment["HUSH_OPEN"]');
    // CI's type-check of the shipping target defines no flag.
    const ci = fs.readFileSync(path.join(MOBILE, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('swiftc -typecheck -parse-as-library -target arm64_32-apple-watchos10.0 code/mobile/targets/watch/*.swift');
    expect(ci).not.toContain('GALLERY');
  });

  it('the frames are the phone\'s own shape and her own words; and the job runs only when asked', () => {
    const frames = read('native-tests/watch-gallery/build-frames.cjs');
    expect(frames).toContain("type: 'session_state'");
    expect(frames).toContain("if (!k.endsWith('_female') && typeof v === 'string' && v.length > 0) s[k] = v;");
    const flow = fs.readFileSync(path.join(MOBILE, '..', '..', '.github', 'workflows', 'watch-gallery.yml'), 'utf8');
    expect(flow).toMatch(/on:\s+push:\s+branches: \["ci\/watch-gallery"\]\s+workflow_dispatch:/);
    expect(flow).toContain('ci/watch-renders');
  });
});
