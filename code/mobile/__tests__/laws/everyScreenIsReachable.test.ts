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
