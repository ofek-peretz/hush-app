/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SYNC TRACE — what the five surfaces did, on real glass, to the millisecond. (2026-09-17)
 *
 *   > founder: *"חייב שהכל יעבוד בסנכרון מושלם."*
 *
 * `__tests__/sync/theSurfacesNeverDisagree` proves the phone hands every surface the same truth.
 * What no test can see is what happens AFTER the phone hands it over: how late WatchConnectivity
 * delivers a frame, whether iOS let the Live Activity update, when the wrist's GO buzz actually
 * landed against the rest's end, how late a lock-screen tap was replayed. This records exactly that,
 * during a workout, when — and only when — the founder has switched it on (a long press on the
 * version line in You). Off, every call here is a single boolean read.
 *
 * ── What a row is ───────────────────────────────────────────────────────────────────────────────
 * `t|K|fields…` — `t` is ms since the trace began, `K` one letter:
 *
 *   P  published to the wrist      seq · phase · globalIndex · restEnd · os-accepted(1/0)
 *   L  Live Activity asked         op · phase · restEnd              l  …and iOS answered   op · ok
 *   W  a wrist tap arrived         type · issued · accepted(1/0) · reason
 *   R  the wrist RECEIVED a frame  seq · received                    (reported by the wrist)
 *   H  the wrist BUZZED            offsetS · fired · intended        (reported by the wrist)
 *   K  a lock-screen tap replayed  type · tapped
 *   A  the phone armed its alert   restEnd
 *   V  the voice began a line      chars                             v  …and finished it
 *   S  the app changed state       active|background|inactive
 *
 * Every instant inside a row is relative to the same base, so `R` minus `P` is the delivery delay
 * of one frame, and `H` against `P`'s rest end is how far the wrist's buzz landed from the truth.
 * The wrist's and the phone's clocks are both network time; the few ms between them are the noise.
 *
 * ── Where it goes ───────────────────────────────────────────────────────────────────────────────
 * Shipped through the ordinary telemetry sink as `sync_trace` events, the text cut into pieces the
 * sink's 256-character string rule allows — at every trip to the background (so an app kill loses
 * nothing already recorded) and at the workout's end. No load, no name, nothing of hers beyond the
 * timing of her own taps.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { shipToSink, track } from '@/platform/telemetry';

const KEY = 'hush.syncTrace';
const MAX_ROWS = 8000;
/** The sink keeps strings of up to 256 characters; the rest of the event needs none of them. */
export const SYNC_TRACE_PIECE = 240;

let on = false;
let base = 0;
let rows: string[] = [];
let traceId = '';
let part = 0;
let loaded = false;

type Field = string | number | boolean | null | undefined;

function cell(f: Field): string {
  if (f == null) return '';
  if (typeof f === 'boolean') return f ? '1' : '0';
  if (typeof f === 'number') return Number.isFinite(f) ? String(Math.round(f)) : '';
  return f.replace(/[|\n]/g, ' ').slice(0, 40);
}

export const syncTrace = {
  /** Read the switch once at launch and start listening to the app's lifecycle. */
  async load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
      on = (await AsyncStorage.getItem(KEY)) === '1';
    } catch {
      on = false;
    }
    AppState.addEventListener('change', (s) => {
      syncTrace.add('S', s);
      if (s === 'background') void syncTrace.ship();
    });
  },

  isOn(): boolean {
    return on;
  },

  async setOn(v: boolean): Promise<void> {
    if (!v) await syncTrace.ship();
    on = v;
    try {
      await AsyncStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* the switch holds for this run */
    }
    void track('sync_trace_switched', { on: v });
  },

  /** An absolute instant, as the trace writes it — relative to the trace's base. */
  rel(ms: number | null | undefined): number | null {
    if (!on || ms == null || !Number.isFinite(ms)) return null;
    if (!base) base = Date.now();
    return ms - base;
  },

  add(kind: string, ...fields: Field[]): void {
    if (!on) return;
    const now = Date.now();
    if (!base) base = now;
    if (!traceId) traceId = `${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    if (rows.length >= MAX_ROWS) return; // a trace that long has already said what it can
    rows.push([String(now - base), kind, ...fields.map(cell)].join('|'));
  },

  /** Ship what is recorded so far, in sink-sized pieces. Recording continues after. */
  async ship(): Promise<void> {
    if (!on || rows.length === 0) return;
    const text = `B|${base}\n${rows.join('\n')}`;
    rows = [];
    part += 1;
    const pieces = Math.ceil(text.length / SYNC_TRACE_PIECE);
    for (let i = 0; i < pieces; i++) {
      await track('sync_trace', {
        trace: traceId,
        part,
        i,
        n: pieces,
        c: text.slice(i * SYNC_TRACE_PIECE, (i + 1) * SYNC_TRACE_PIECE),
      });
    }
    void shipToSink();
  },

  /** The workout ended: ship, and let the next workout begin a trace of its own. */
  async end(): Promise<void> {
    await syncTrace.ship();
    base = 0;
    traceId = '';
    part = 0;
  },
};

/** The wrist's own report, riding on its taps: `[[seq, receivedMs]]` and `[[offsetS, firedMs, intendedMs]]`. */
export function traceWristReport(raw: unknown): void {
  if (!on || !raw || typeof raw !== 'object') return;
  const o = raw as { rx?: unknown; hx?: unknown };
  const rowsOf = (v: unknown): number[][] =>
    Array.isArray(v)
      ? v
          .filter((r): r is unknown[] => Array.isArray(r))
          .map((r) => r.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)))
          .slice(0, 200)
      : [];
  for (const [seq, at] of rowsOf(o.rx)) syncTrace.add('R', seq, syncTrace.rel(at));
  for (const [offset, fired, intended] of rowsOf(o.hx)) syncTrace.add('H', offset, syncTrace.rel(fired), syncTrace.rel(intended));
}
