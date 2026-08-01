import fs from 'fs';
import path from 'path';

/**
 * ════ WELL DONE IS STILL THE SESSION ════
 *
 * Founder, device QA 2026-07-30: *"I managed to start a workout from the watch while the phone was
 * showing What this session earned."*
 *
 * Two things had to be true at once, and both were in the PHONE rather than the watch — which is
 * why this law lives here and not beside a Swift file no machine in this project can compile.
 *
 *   1. The lobby's guard read the machine's PHASE: `plan.length > 0 && phase !== 'SESSION_SAVED' &&
 *      phase !== 'WELL_DONE'`. So the instant the last set was written the wrist got the lobby back
 *      and its Start came alive — while the phone was still on the closing beat.
 *   2. `watchStartRef` is bound while Home is MOUNTED rather than focused, deliberately, so a watch
 *      Begin still works with Settings or Well Done pushed on top. A lobby already sitting on the
 *      wrist can therefore call in even after the phone stops publishing one.
 *
 * Fixing only the first leaves the doorway open to whatever is already on the wrist. So the source
 * refuses as well: a START with a live plan is refused outright, because a second one replaces the
 * first and the remaining sets of the first simply cease to exist.
 *
 * ── AND THE PHASE WAS THE WRONG THING TO READ ───────────────────────────────────────────────────
 * `SESSION_SAVED` and `WELL_DONE` were excluded so the lobby would come back promptly. It comes
 * back anyway: `END` empties the plan, and an EMPTY PLAN is what "she has left the session" means.
 * The phase was a step inside the finish, not the finish — and reading a step as the end is the
 * whole of this bug.
 *
 * ── WHY THIS IS A SOURCE LAW ────────────────────────────────────────────────────────────────────
 * The guard lives inside the store's closure, reachable only through a mounted React tree and a
 * fake watch bridge. What matters is not that one arrangement behaves — it is that nobody
 * reintroduces the phase check while "fixing" something else. That is a property of the text.
 */

const STORE = path.join(__dirname, '..', '..', 'src', 'state', 'stores', 'sessionStore.tsx');

/** The file with comments stripped — this one's own header quotes the bug it forbids. */
function code(): string {
  return fs
    .readFileSync(STORE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The body of a named method, to its closing brace at the method's indent. */
function body(name: string): string {
  const src = code();
  const start = src.indexOf(`${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('\n      },', start);
  return src.slice(start, end);
}

describe('the lobby waits for the session to be over', () => {
  it('publishes only on an EMPTY PLAN', () => {
    expect(body('publishWatchLobby')).toMatch(/if \(plan\.length > 0\) return;/);
  });

  it('⚠️ does NOT read the machine phase — a step in the finish is not the finish', () => {
    /*
     * The exact regression. `SESSION_SAVED` means the record is written; she is still standing on
     * the closing beat reading what the workout earned, and the wrist offering Start there is the
     * app telling her the workout is over while the phone tells her it is not.
     */
    const guard = body('publishWatchLobby');
    expect(guard).not.toMatch(/SESSION_SAVED/);
    expect(guard).not.toMatch(/WELL_DONE/);
  });
});

describe('one session at a time, at the source', () => {
  it('refuses a START while a plan is live, through EITHER door', () => {
    // The engine door and the coach door. A stale lobby on the wrist can call in through either,
    // and a second START would replace the live plan without a word.
    for (const door of ['async start(', 'async startCoach(']) {
      const src = code();
      const at = src.indexOf(door);
      expect({ door, found: at > -1 }).toEqual({ door, found: true });
      // The guard is the first thing the method does — before the salvage, before any await.
      expect({ door, guarded: src.slice(at, at + 400).includes('if (plan.length > 0) return;') }).toEqual({
        door,
        guarded: true,
      });
    }
  });
});
