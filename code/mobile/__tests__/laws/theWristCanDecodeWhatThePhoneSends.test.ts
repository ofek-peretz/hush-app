/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE PHONE ACTUALLY PUTS ON THE WIRE MUST DECODE ON THE WRIST.
 *
 * ⛔ FOUNDER, 2026-08-30, photographing his watch: **`wc:badframe · rx:0`** under "Open on iPhone".
 * Frames were arriving and not one had ever decoded.
 *
 * ── WHY `watchWireParity` DID NOT CATCH IT ──────────────────────────────────────────────────────
 * That law parses the Swift structs and holds them against the TYPESCRIPT INTERFACES — it proves
 * the two declarations agree. This one runs the phone's own builders and holds the RESULTING JSON
 * against the same Swift structs, and the gap between those two questions is where a wrist goes
 * deaf:
 *
 *   · an interface says `muscles: string` and the code that fills it leaves it `undefined` —
 *     `JSON.stringify` DROPS undefined keys entirely, so a required Swift field simply is not
 *     there;
 *   · a field typed `number` in TypeScript arrives as `4.5` into a Swift `Int`, which
 *     `JSONDecoder` refuses;
 *   · a nullable TS field (`string | null`) meets a non-optional Swift `String`.
 *
 * Each of those is invisible to a declaration-vs-declaration check and fatal at runtime — and fatal
 * for the WHOLE envelope, because `try? JSONDecoder().decode(WireEnvelope.self, …)` is all-or-
 * nothing. One bad leaf and the mirror, the lobby, the plan and the copy pack all vanish at once,
 * which is exactly the shape of `rx:0`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeStateEnvelope } from '@/platform/watch/protocol';

const SWIFT = readFileSync(join(__dirname, '../../targets/watch/WatchWire.swift'), 'utf8');

/** `var name: Type` — with whether Swift will accept the key being absent or null. */
function swiftFields(structName: string): Array<{ name: string; type: string; optional: boolean }> {
  const decl = new RegExp(`struct\\s+${structName}\\b`).exec(SWIFT);
  if (!decl) throw new Error(`no Swift struct ${structName}`);
  const open = SWIFT.indexOf('{', decl.index);
  let depth = 0;
  let close = -1;
  for (let i = open; i < SWIFT.length; i++) {
    if (SWIFT[i] === '{') depth++;
    else if (SWIFT[i] === '}') {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  const out = [];
  for (const line of SWIFT.slice(open + 1, close).split('\n')) {
    const m = /^\s*var\s+([A-Za-z0-9_]+)\s*:\s*([^=]+?)\s*$/.exec(line);
    if (!m) continue;
    const type = m[2].trim();
    out.push({ name: m[1], type, optional: type.endsWith('?') });
  }
  return out;
}

/** Does this JSON value satisfy that Swift type? Only the cases the wire actually carries. */
function accepts(type: string, value: unknown): boolean {
  const base = type.replace(/\?$/, '').trim();
  if (value === null || value === undefined) return type.endsWith('?');
  if (base === 'String') return typeof value === 'string';
  // ⛔ THE ONE THAT BITES: Swift refuses 4.5 into an Int, silently killing the whole envelope.
  // ⛔ APPLE WATCH IS 32-BIT (arm64_32): a Swift `Int` there tops out at 2,147,483,647. A millisecond
  // epoch declared `Int` refused the whole envelope from build ~64 to 70 (founder 2026-09-08, the
  // wrist's own words: "Number 1788898463… is not representable in Swift"). `Int64` for those.
  if (base === 'Int') return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 2147483647;
  if (base === 'Int64') return typeof value === 'number' && Number.isInteger(value);
  if (base === 'Double') return typeof value === 'number' && Number.isFinite(value);
  if (base === 'Bool') return typeof value === 'boolean';
  if (base.startsWith('[') && base.endsWith(']')) return Array.isArray(value);
  return typeof value === 'object'; // a nested struct — walked separately
}

/** Walk a decoded JSON object against a Swift struct, and every nested struct under it. */
function check(structName: string, value: unknown, path: string, out: string[]): void {
  if (value === null || value === undefined) return;
  for (const f of swiftFields(structName)) {
    const got = (value as Record<string, unknown>)[f.name];
    const where = `${path}.${f.name}`;
    if (got === undefined && !f.optional) {
      out.push(`${where} — Swift needs ${f.type}, the phone sent NOTHING (dropped by JSON.stringify)`);
      continue;
    }
    if (!accepts(f.type, got)) {
      out.push(`${where} — Swift needs ${f.type}, the phone sent ${JSON.stringify(got)}`);
      continue;
    }
    const base = f.type.replace(/\?$/, '').replace(/^\[|\]$/g, '').trim();
    if (!/^Wire[A-Za-z]+$/.test(base)) continue;
    if (Array.isArray(got)) got.forEach((el, i) => check(base, el, `${where}[${i}]`, out));
    else check(base, got, where, out);
  }
}

/** One realistic lobby — the first thing the wrist is ever sent, and the frame in the photograph. */
const lobby = {
  workoutId: 'day_2',
  workoutName: 'Pull A',
  muscles: '',
  lifts: 6,
  durationLabel: '52 min',
  resting: false,
  firstWorkout: false,
  gated: false,
  workouts: [
    { id: 'day_1', name: 'Push A', lifts: 5, muscles: '', done: true },
    { id: 'day_2', name: 'Pull A', lifts: 6, muscles: '', done: false },
  ],
};

describe('⛔ every envelope the phone builds survives Swift’s decoder', () => {
  /** Exactly what crosses the wire: `JSON.parse(JSON.stringify(x))` drops undefined the way the
   *  native module does when it serialises. Checking the object in memory would miss the bug. */
  const onTheWire = (x: unknown) => JSON.parse(JSON.stringify(x));

  it('⛔ the LOBBY envelope — the first frame, and the one in the photograph', () => {
    const faults: string[] = [];
    check('WireEnvelope', onTheWire(makeStateEnvelope(null, 1, Date.now(), lobby, null, null, Date.now())), 'envelope', faults);
    expect(faults).toEqual([]);
  });

  it('⛔ a lobby with every OPTIONAL absent still decodes', () => {
    /*
     * The ordinary case on day one and the one most likely to be wrong: a phone that knows nothing
     * yet omits `lifts`, `durationLabel`, `resting`, `firstWorkout`, `gated`. Swift must find every
     * REQUIRED field regardless — and `workouts` is required, so an empty array is not the same as
     * no key at all.
     */
    const bare = { workoutId: null, workoutName: '', muscles: '', workouts: [] };
    const faults: string[] = [];
    check('WireEnvelope', onTheWire(makeStateEnvelope(null, 1, Date.now(), bare, null, null, Date.now())), 'envelope', faults);
    expect(faults).toEqual([]);
  });

  it('⛔ an EMPTY envelope — no mirror, no lobby, no plan', () => {
    // What the phone sends between screens. `v`, `type`, `authoritySeq` and `sentAt` are the four
    // Swift will not do without.
    const faults: string[] = [];
    check('WireEnvelope', onTheWire(makeStateEnvelope(null, 1, Date.now(), null, null, null, Date.now())), 'envelope', faults);
    expect(faults).toEqual([]);
  });

  it('⚠️ …and the check itself can fail — a required field dropped is caught', () => {
    // Guards the guard: a test that cannot go red is a test that proves nothing.
    const broken = onTheWire(makeStateEnvelope(null, 1, Date.now(), lobby));
    delete broken.lobby.muscles;
    const faults: string[] = [];
    check('WireEnvelope', broken, 'envelope', faults);
    expect(faults.length).toBeGreaterThan(0);
  });

  it('⚠️ …and so is a float where Swift wants an Int', () => {
    const broken = onTheWire(makeStateEnvelope(null, 1, Date.now(), { ...lobby, lifts: 6.5 }));
    const faults: string[] = [];
    check('WireEnvelope', broken, 'envelope', faults);
    expect(faults.length).toBeGreaterThan(0);
  });
});
