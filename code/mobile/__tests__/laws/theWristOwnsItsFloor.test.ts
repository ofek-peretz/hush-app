/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ACTION ZONE REACHES THE BOTTOM EDGE — ON EVERY SCREEN, WITHOUT ANYTHING BEING PASSED.
 *
 * ⛔ FOUNDER, 2026-08-05, after asking three times and being told twice that it was done:
 *
 *   > *"You have not answered me for several messages now — did you understand that I want the
 *   > button to START from the bottom of the watch's own frame, in order to free up space?"*
 *
 * **I had built it and applied it to one screen.** `StageButton.seated` cancels the container's
 * gutters with negative padding of its own, and exactly one call site out of ten passed the flag.
 * Rest, Paused, Edit Set, the cardio menu and cardio-saved all kept a floating button with three
 * points of dead air beneath it — and all five are the screenshots where the button is sliced.
 *
 * ── WHY A FLAG WAS THE WRONG SHAPE ──────────────────────────────────────────────────────────────
 * A flag every call site must remember is a flag nine call sites will forget. It also failed
 * silently and looked correct from the call site: `StageButton(title:kind:height:fontSize:action:)`
 * reads like a complete button.
 *
 * So the floor moved onto `WristScreen`: the horizontal gutter is applied to the CONTENT, and the
 * actions slot simply has none. Every screen that uses the container gets it, and there is nothing
 * to pass.
 *
 * ── WHAT THIS TEST GUARDS ───────────────────────────────────────────────────────────────────────
 *   1. The container still puts its gutter on the content and not on itself.
 *   2. No screen re-pads its own bottom edge — that is how four of them escaped the container.
 *   3. The bottom-most control of every action block carries `seated`, which is now only about the
 *      SHAPE (square bottom corners, because the case's own curve finishes them).
 *
 * ⚠️ It reads the source. Swift is not compiled in this environment and never has been — the wrist
 * is verified by reading and by the build, which is exactly why the rules that hold it together
 * have to be mechanical.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { readFileSync } from 'fs';
import { join } from 'path';

const WATCH = join(__dirname, '../../targets/watch/WatchScreens.swift');
const src = () => readFileSync(WATCH, 'utf8');

/** Strip comments so a rule quoted in prose never counts as code. */
const code = () =>
  src()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('⛔ the wrist owns its floor', () => {
  it('the container pads the CONTENT, never itself', () => {
    const c = code();
    const container = c.slice(c.indexOf('struct WristScreen'), c.indexOf('extension WristScreen'));
    // The gutter rides the content…
    expect(container).toMatch(/content[\s\S]{0,220}\.padding\(\.horizontal, Wrist\.side\)/);
    // …and the container itself pads neither side nor foot, or the actions slot inherits it again.
    expect(container).not.toMatch(/\}\s*\.padding\(\.horizontal, Wrist\.side\)/);
    expect(container).not.toMatch(/\.padding\(\.bottom, Wrist\.foot\)/);
  });

  it('⚠️ no screen re-pads its own bottom edge', () => {
    /*
     * Four screens laid themselves out by hand — their own gutters, their own foot — which is
     * exactly how the container's floor could not reach them. `Wrist.foot` is the tell.
     */
    const offenders = code()
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\.padding\(\.bottom, Wrist\.foot\)/.test(l));
    expect(offenders.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });

  it('every action block ends in a seated control', () => {
    const c = code();
    const missing: string[] = [];
    let from = 0;
    for (;;) {
      const at = c.indexOf('actions: {', from);
      if (at < 0) break;
      from = at + 10;
      // Walk to the matching brace — an action block is small, so this is exact rather than clever.
      let depth = 0;
      let end = at + 9;
      for (; end < c.length; end += 1) {
        if (c[end] === '{') depth += 1;
        else if (c[end] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const block = c.slice(at, end);
      const controls = [...block.matchAll(/\b(StageButton|OutlineButton)\(/g)];
      if (controls.length === 0) continue; // a screen with no actions is not a screen with a hole
      const last = block.slice(controls[controls.length - 1].index!);
      if (!/seated:\s*true/.test(last)) missing.push(last.slice(0, 90).replace(/\s+/g, ' '));
    }
    expect(missing).toEqual([]);
  });

  it('⚠️ and `seated` is passed in the position the memberwise initialiser declares', () => {
    /*
     * Swift's memberwise initialiser is POSITIONAL. `OutlineButton(title:seated:tint:…)` compiles
     * to nothing — it is a different initialiser that does not exist — and I wrote exactly that on
     * two of the four call sites before checking. There is no compiler in this environment to
     * catch it, so the order is checked here.
     */
    const c = code();
    const order: Record<string, string[]> = {};
    for (const name of ['StageButton', 'OutlineButton']) {
      const i = c.indexOf(`struct ${name}: View`);
      const decl = c.slice(i, c.indexOf('var body: some View', i));
      order[name] = [...decl.matchAll(/^\s*(?:let|var) (\w+)\s*[:=]/gm)].map((m) => m[1]);
    }
    const wrong: string[] = [];
    for (const m of c.matchAll(/\b(StageButton|OutlineButton)\(([^{]*?)[)\{]/gs)) {
      const labels = [...m[2].matchAll(/(\w+):/g)].map((x) => x[1]).filter((l) => order[m[1]].includes(l));
      const idx = labels.map((l) => order[m[1]].indexOf(l));
      if (idx.some((v, k) => k > 0 && v < idx[k - 1])) wrong.push(`${m[1]}(${labels.join(', ')})`);
    }
    expect(wrong).toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ AN Attribute SITS ON THE DECLARATION IT APPLIES TO — build 43's compile failure.
 *
 * `'@discardableResult' attribute cannot be applied to this declaration`, twice, and the build died
 * before it produced an artifact.
 *
 * I inserted a doc comment and an `enum` between a pre-existing `@discardableResult` and the
 * `func reportPain` it belonged to. My edit anchored on the function signature; the attribute was
 * on the line ABOVE it, outside the text I matched — so it silently re-attached itself to the enum,
 * which is not a declaration that can carry it.
 *
 * ⚠️ EVERY CHECK I HAD RUN PASSED. Brace balance was correct, argument order was correct, the
 * symbol was reachable, the type-check was green — because none of them read Swift. **There is no
 * compiler in this environment, so an insertion that separates an attribute from its declaration
 * is invisible until EAS spends nine minutes discovering it.**
 *
 * This is the cheapest possible guard against the whole family: an attribute line must be followed
 * by another attribute, or by something a declaration can start with. Never by a comment, never by
 * a blank line, never by a type.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ Swift attributes touch their declarations', () => {
  const SWIFT = ['WatchModel.swift', 'WatchScreens.swift', 'WatchSessionManager.swift', 'WatchStore.swift', 'WatchCopy.swift', 'LocalWorkoutEngine.swift', 'WorkoutRuntime.swift'];

  it('nothing is inserted between an attribute and what it applies to', () => {
    const bad: string[] = [];
    for (const file of SWIFT) {
      const path = join(__dirname, '../../targets/watch', file);
      let lines: string[];
      try {
        lines = readFileSync(path, 'utf8').split('\n');
      } catch {
        continue; // a file that is not there is not a violation
      }
      lines.forEach((line, i) => {
        /*
         * Only attributes that stand ALONE on their line can be orphaned — `@State private var x`
         * and `@MainActor final class Y` carry their declaration with them. The parenthesised form
         * (`@available(iOS 16, *)`) counts too, and that is the one a narrower rule would miss.
         */
        if (!/^\s*@\w+(\([^)]*\))?\s*$/.test(line)) return;
        // Look past nothing: the very next line must be the declaration, or another attribute.
        const next = (lines[i + 1] ?? '').trim();
        const ok =
          /^@/.test(next) ||
          /^(public|private|internal|fileprivate|open|static|final|override|nonisolated|convenience|required|dynamic|lazy|weak|unowned|func|var|let|init|subscript|deinit|class|struct|enum|extension|actor|protocol|typealias|case|associatedtype)\b/.test(
            next,
          );
        if (!ok) bad.push(`${file}:${i + 1} — @attribute followed by: ${next.slice(0, 60) || '(blank line)'}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
