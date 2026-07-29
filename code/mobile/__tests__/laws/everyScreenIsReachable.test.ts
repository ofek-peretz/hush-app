/**
 * EVERY SCREEN IS REACHABLE, AND EVERY ROUTE EXISTS.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * On 2026-07-27 four finished screens — 10.1 the welcome back, 10.2 the lapsed state, 11.4 share
 * your plan, 11.5 plan received — were built, tested, drawn in the gallery, and **unreachable from
 * inside the app**. Nothing navigated to them and two of them were not even registered as routes.
 * The gallery showed them, so they LOOKED done; only walking the navigation graph found it.
 *
 * A screen nobody can open is not a feature. This test walks the graph mechanically:
 *   · every route declared on `MainParamList` is registered on the navigator, and
 *   · every registered route is either navigated to somewhere, or named here as a deliberate
 *     exception with the reason it has no in-app caller.
 *
 * ── AND THE SCREENS THAT ARE NOT ROUTES ───────────────────────────────────────────────────────
 * §10's screens answer "what is true when she opens the app", so they are STATES Today returns
 * instead of itself — you do not GO to having been away, or to owning an Apple Watch. A route
 * walker is blind to every one of them, which is precisely how 10.1 and 10.2 came to be finished
 * and unreachable in the first place. The gallery is blind too: it mounts `HomeView`, and not one
 * of these three lives there. So they are checked where they actually live — the `Home` container.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Routes with no `navigate(...)` caller, and why that is correct. */
const REACHED_WITHOUT_NAVIGATE: Record<string, string> = {
  HomeTabs: 'the stack root — the app opens on it',
  PlanReceived: 'opened by the hush://plan deep link (Root: Linking), never by a tap',
};

function declaredRoutes(): string[] {
  const src = read('app/navigation.ts');
  const block = src.slice(src.indexOf('export type MainParamList'), src.indexOf('};', src.indexOf('export type MainParamList')));
  return [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

function registeredRoutes(): string[] {
  return [...read('app/Root.tsx').matchAll(/<MainStack\.Screen\s+name="(\w+)"/g)].map((m) => m[1]);
}

/** Every `navigate('X')` / `navigateMain('X')` / `replace('X')` anywhere outside the dev harness. */
function navigatedNames(): Set<string> {
  const out = new Set<string>();
  for (const f of globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })) {
    if (f.replace(/\\/g, '/').includes('/screens/dev/')) continue; // the gallery mounts, never navigates
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:navigate|navigateMain|replace|push)\(\s*'(\w+)'/g)) out.add(m[1]);
  }
  return out;
}

describe('the navigation graph has no orphans', () => {
  it('every declared route is registered on the navigator', () => {
    const registered = new Set(registeredRoutes());
    const missing = declaredRoutes().filter((r) => !registered.has(r));
    expect({ declaredButNeverRegistered: missing }).toEqual({ declaredButNeverRegistered: [] });
  });

  it('every registered route can actually be opened', () => {
    const navigated = navigatedNames();
    const orphans = registeredRoutes().filter((r) => !navigated.has(r) && !REACHED_WITHOUT_NAVIGATE[r]);
    expect({ registeredButUnreachable: orphans }).toEqual({ registeredButUnreachable: [] });
  });

  it('every exception named here is still a real route', () => {
    const registered = new Set([...registeredRoutes(), 'HomeTabs']);
    const stale = Object.keys(REACHED_WITHOUT_NAVIGATE).filter((r) => !registered.has(r));
    expect({ staleExceptions: stale }).toEqual({ staleExceptions: [] });
  });
});

/**
 * §10 · the screens Today returns INSTEAD OF ITSELF. Each pairs the view with the module that
 * decides whether it is due, because a state whose gate is never consulted is unreachable in the
 * same way a route with no `navigate` is — it simply fails silently instead of loudly.
 */
const STATES_THAT_REPLACE_TODAY: { view: string; gate: string; what: string }[] = [
  { view: 'WelcomeBackView', gate: 'comebackAfterGap', what: '10.1 · after a gap' },
  { view: 'LapsedView', gate: 'entitlement', what: '10.2 · subscription lapsed' },
  { view: 'OnYourWristView', gate: 'offerTheWrist', what: '10.4 · on your wrist' },
];

describe('the states that replace Today are rendered by Today', () => {
  const home = read('screens/home/Home.tsx');

  for (const { view, gate, what } of STATES_THAT_REPLACE_TODAY) {
    it(`${what} — Home imports it, renders it, and consults its gate`, () => {
      expect({
        state: what,
        imported: new RegExp(`import\\s*\\{[^}]*\\b${view}\\b`, 's').test(home),
        rendered: new RegExp(`<${view}\\b`).test(home),
        gated: home.includes(gate),
      }).toEqual({ state: what, imported: true, rendered: true, gated: true });
    });
  }
});
