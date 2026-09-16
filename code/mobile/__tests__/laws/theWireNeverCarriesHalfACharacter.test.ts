/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WIRE NEVER CARRIES HALF A CHARACTER.
 *
 * ⛔ FOUNDER, 2026-09-08, photographing his watch: **`wc:badframe:json · rx:0`** under "Open on
 * iPhone". `json` is the wrist's word for "the document would not parse" — before any field is
 * looked at — and `theWristCanDecodeWhatThePhoneSends` could not have caught it, because that law
 * holds decoded JSON against Swift structs and this failure happens one step earlier.
 *
 * ── THE ONLY WAY `JSON.stringify` OUTPUT FAILS APPLE'S PARSER ──────────────────────────────────
 * A JavaScript string is UTF-16. An emoji is a surrogate PAIR, and any code that cuts a string by
 * index — `.slice(0, n)`, `s[0]`, a length cap — or any `JSON.parse` of a file that already held a
 * lone `\uD83D` escape, leaves an unpaired half behind. `JSON.stringify` then emits that half as a
 * `\uD83D` escape (the well-formed-stringify rule), and Foundation refuses the WHOLE document:
 * "Unable to convert data to string". Mirror, lobby, plan and copy pack vanish together, and every
 * later frame carrying the same name dies the same way. That is exactly the shape of `rx:0`.
 *
 * So the bridge repairs every outgoing envelope (the lone half becomes U+FFFD) and reports WHERE
 * it was found, so the source gets fixed in the data. This law pins both halves of that.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { WATCH_EVENTS } from '@/platform/events';
import { makeStateEnvelope, repairWireStrings, serializeEnvelope } from '@/platform/watch/protocol';
import { WatchSession } from '@/platform/watch/watchBridge';

/** Would Apple's parser accept this text? It refuses any unpaired `\uD800–\uDFFF` escape. */
function unpairedEscapes(json: string): string[] {
  const out: string[] = [];
  // JSON.stringify emits lower-case hex; the escape sits behind an even number of backslashes.
  const re = /(?<!\\)(?:\\\\)*\\u(d[89ab][0-9a-f]{2})(?!\\ud[c-f][0-9a-f]{2})|(?<!\\ud[89ab][0-9a-f]{2})(?<!\\)(?:\\\\)*\\u(d[c-f][0-9a-f]{2})/g;
  for (const m of json.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

const HALF_EMOJI = 'Push day \uD83D'; // a name cut one code unit into 💪
const LONE_LOW = '\uDCAA Pull day';

function lobbyWith(name: string) {
  return {
    workoutId: 'w1',
    workoutName: name,
    muscles: '',
    lifts: 6,
    resting: false,
    gated: false,
    workouts: [
      { id: 'w1', name, lifts: 6, muscles: '', done: false },
      { id: 'w2', name: 'Legs 💪 fine', lifts: 5, muscles: '', done: false },
    ],
  };
}

describe('the wire never carries half a character', () => {
  test('a half-cut emoji in a workout name is a lone \\ud83d escape — the very thing Apple refuses', () => {
    // The premise, stated as a fact rather than assumed: this is what stringify does with the half.
    expect(JSON.stringify(HALF_EMOJI)).toBe('"Push day \\ud83d"');
    expect(unpairedEscapes(JSON.stringify(HALF_EMOJI))).toEqual(['d83d']);
    // …and a whole emoji is NOT an escape at all, so the guard cannot fire on healthy text.
    expect(unpairedEscapes(JSON.stringify('Legs 💪 fine'))).toEqual([]);
  });

  test('serializeEnvelope never emits an unpaired surrogate, whatever the data holds', () => {
    const env = makeStateEnvelope(null, 1, 1_000, lobbyWith(HALF_EMOJI), null, null, 7);
    const json = serializeEnvelope(env);
    expect(unpairedEscapes(json)).toEqual([]);
    // Parses on this side too, and the name kept everything but the broken half.
    const back = JSON.parse(json);
    expect(back.lobby.workoutName).toBe('Push day �');
    expect(back.lobby.workouts[1].name).toBe('Legs 💪 fine');
  });

  test('repairWireStrings names every place it repaired, with array indices kept', () => {
    const lobby = lobbyWith(HALF_EMOJI);
    lobby.workouts[1].name = LONE_LOW;
    const env = makeStateEnvelope(null, 1, 1_000, lobby, null, null, 7);
    const { value, repaired } = repairWireStrings(env);
    expect(repaired).toEqual(['lobby.workoutName', 'lobby.workouts[0].name', 'lobby.workouts[1].name']);
    expect(value.lobby.workouts[1].name).toBe('� Pull day');
    // Copy-on-write: the caller's envelope is not mutated…
    expect(env.lobby.workoutName).toBe(HALF_EMOJI);
    // …and a clean envelope is handed back as the SAME object, not a copy per frame.
    const clean = makeStateEnvelope(null, 2, 1_000, lobbyWith('Push day 💪'), null, null, 7);
    const r = repairWireStrings(clean);
    expect(r.repaired).toEqual([]);
    expect(r.value).toBe(clean);
  });

  test('the bridge repairs before the transport sees the frame, and tells telemetry where', () => {
    const sent: string[] = [];
    const tracked: Array<[string, unknown]> = [];
    const session = new WatchSession({
      transport: {
        isReachable: () => true,
        sendState: (env) => {
          sent.push(serializeEnvelope(env));
          return true;
        },
        onIntent: () => () => {},
        onReachabilityChange: () => () => {},
      },
      now: () => 1_000,
      track: (name, props) => tracked.push([name, props]),
      dispatch: () => {},
      markEquipmentOccupied: () => {},
    });
    session.publishLobby(lobbyWith(HALF_EMOJI));
    expect(sent).toHaveLength(1);
    expect(unpairedEscapes(sent[0])).toEqual([]);
    const repair = tracked.find(([name]) => name === WATCH_EVENTS.wireRepaired);
    expect(repair).toBeDefined();
    expect(repair[1].paths).toBe('lobby.workoutName,lobby.workouts[0].name');
    // A clean lobby reports nothing — the event means "your data is broken here", never noise.
    tracked.length = 0;
    session.publishLobby(lobbyWith('Push day 💪'));
    expect(tracked.some(([name]) => name === WATCH_EVENTS.wireRepaired)).toBe(false);
  });
});
