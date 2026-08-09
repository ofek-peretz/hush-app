// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

/**
 * ════ BUILT IS NOT THE SAME AS REACHABLE ════
 *
 * The founder found five coach screens that existed, rendered, and appeared nowhere in the index.
 * That is one instance of a class, and the class is worth naming: **a thing that is built, wired,
 * and unreachable looks exactly like a thing that works.** Nothing errors. Nothing is missing from
 * a list. It simply never happens, and the only way to notice is to go looking for it.
 *
 * So this file asks the same question of every surface:
 *
 *   · the PHONE — is every registered route navigated to from somewhere, and is every screen
 *     module either registered or used inside another screen?
 *   · the WATCH — does every view reach the root, and does every view USE what it is handed?
 *
 * The last one is the sharp one. `ActiveSetScreen` accepts `onSwap`, `undo` and `onUndo`; the root
 * wires all three to real model methods; the body reads none of them. From the call site the swap
 * looks connected. On the wrist it does not exist.
 */

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PHONE
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the phone — every route has a door', () => {
  const rootSrc = read('src/app/Root.tsx');

  /** Every route registered on a navigator. */
  const routes = [...rootSrc.matchAll(/\.Screen\s+name="(\w+)"|\.Screen\s*\n\s*name="(\w+)"/g)]
    .map((m) => m[1] ?? m[2]);

  /** Every route name anything anywhere asks to open. */
  function everyNavCall(): Set<string> {
    const out = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          for (const re of [/navigateMain\(\s*'(\w+)'/g, /navigate\(\s*'(\w+)'/g,
                            /push\(\s*'(\w+)'/g, /replace\(\s*'(\w+)'/g, /name:\s*'(\w+)'/g]) {
            for (const m of s.matchAll(re)) out.add(m[1]);
          }
        }
      }
    };
    walk('src');
    return out;
  }

  it('finds the routes at all', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('⚠️ opens every registered route from somewhere', () => {
    /*
     * The entry points are reached by BEING the initial route, not by a call: the two stacks' roots
     * and the four tabs. Everything else has to be navigated to by something, or it is a screen
     * that can only be reached by editing the code.
     */
    const entries = new Set(['HomeTabs', 'Authentication', 'Today', 'Cardio', 'Progress', 'You']);
    const called = everyNavCall();
    const orphans = [...new Set(routes)].filter((r) => !called.has(r) && !entries.has(r));
    expect(orphans).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PHONE, ONE LEVEL DOWN — a branch INSIDE a screen
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * ⚠️ THE ROUTE CHECK ABOVE PASSES ON A SCREEN NOBODY CAN REACH.
 *
 * `ItemStage` is not a route. It is three stages the workout screen was supposed to branch to when
 * the coach prescribes a hold, a distance or an open item — built, styled, unit-tested, drawn in the
 * gallery, and imported by **nothing but the gallery** for an entire build. `SessionFlow` rendered
 * the set screen for every step of every session, so a plank reached the athlete as a set with no
 * weight and no rep band. Every layer around it was green, and the route law could not see it: a
 * dead branch inside a screen is not a missing door, it is a door that was never drawn.
 *
 * So: a stage the APP does not use is not built, whatever the harness can show. The gallery is
 * explicitly not a user of anything — its whole job is to render things in isolation, which is
 * exactly why it cannot be the proof that they are connected.
 */
describe('the phone — nothing is reachable only from the harness', () => {
  const GALLERY = 'src/screens/dev/gallery.tsx';

  /**
   * Every source file, comments stripped.
   *
   * A component named in a comment is not a component anybody renders — and this file's own prose
   * names several. Read the code, never the account of it (`svgBackgroundsAreSizedOneWay` learned
   * the same lesson by flagging the comment that explained its own fix).
   */
  function sources(): { rel: string; text: string }[] {
    const out: { rel: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          const text = fs
            .readFileSync(path.join(ROOT, rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
          out.push({ rel, text });
        }
      }
    };
    walk('src');
    return out;
  }

  it('⚠️ renders every screen component it builds — the item stages were gallery-only', () => {
    const files = sources();
    const orphans: string[] = [];
    for (const { rel, text } of files) {
      if (!rel.startsWith('src/screens/') || rel === GALLERY) continue;
      // A component, not a helper: an exported function whose name is capitalised.
      for (const m of text.matchAll(/export function ([A-Z]\w+)/g)) {
        const name = m[1];
        const re = new RegExp(`\\b${name}\\b`, 'g');
        /*
         * Its OWN file counts — a screen split into presentational parts renders them itself, and
         * that is reachable. What may not count is the declaration (every component has exactly
         * one) and the gallery (which renders things in isolation on purpose).
         */
        const uses = files
          .filter((f) => f.rel !== GALLERY)
          .reduce((n, f) => n + (f.text.match(re)?.length ?? 0), 0);
        if (uses <= 1) orphans.push(`${rel}:${name}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WATCH
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the watch — every view reaches the root, and reads what it is given', () => {
  const raw = read('targets/watch/WatchScreens.swift');

  /**
   * Comments and string bodies out, so prose is never mistaken for code — but a Swift
   * INTERPOLATION is code, and blanking it makes a property that is only ever printed look dead.
   * `GlanceScreen.sets` is exactly that: its one reader is `"\(WatchCopy.metricKgSets) \(sets)"`.
   */
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (lit) =>
      ` ${[...lit.matchAll(/\\\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((m) => m[1]).join(' ')} `);

  /** Every `struct X: View` and its body. */
  const views = new Map<string, string>();
  for (const m of code.matchAll(/struct (\w+)(?:<[^>]*>)?: View \{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }
    views.set(m[1], code.slice(m.index! + m[0].length, i - 1));
  }

  it('finds the views at all', () => {
    expect(views.size).toBeGreaterThan(30);
  });

  it('⚠️ reaches every view from WatchRootView', () => {
    /*
     * A SwiftUI view is instantiated with a paren OR a trailing brace (`WristScreen { … }`), so
     * both count. An island of views nothing renders is a screen an athlete cannot see, and on a
     * wrist there is no URL to type to find out.
     */
    const seen = new Set(['WatchRootView']);
    const stack = ['WatchRootView'];
    while (stack.length) {
      const body = views.get(stack.pop()!) ?? '';
      for (const other of views.keys()) {
        if (seen.has(other)) continue;
        if (new RegExp(`\\b${other}\\s*[({]`).test(body)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    expect([...views.keys()].filter((v) => !seen.has(v))).toEqual([]);
  });

  it('⚠️ uses every input it accepts — the live-set swap was wired and dead', () => {
    /*
     * `ActiveSetScreen` took `onSwap`, `undo` and `onUndo`. The root wired all three to real model
     * methods. The body read none of them, so WT11b could not be opened from a live set at all —
     * and from the call site it looked completely connected.
     *
     * A property is dead when its name occurs exactly ONCE in the whole struct: its own
     * declaration. That counts a computed property declared above `var body` as a real reader,
     * which it is.
     */
    const dead: string[] = [];
    for (const [name, body] of views) {
      const head = body.split('var body')[0];
      for (const m of head.matchAll(/(?:let|var) (\w+)\s*:/g)) {
        const prop = m[1];
        const hits = body.match(new RegExp(`\\b${prop}\\b`, 'g'))?.length ?? 0;
        if (hits <= 1) dead.push(`${name}.${prop}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
