/**
 * Client telemetry — a durable on-device journal, Sentry breadcrumbs when a DSN exists, and —
 * since 2026-09-01 — a real research sink when `EXPO_PUBLIC_TELEMETRY_URL` is configured (see THE
 * SINK below). No URL → the wire half is inert and this file is exactly what it was.
 *
 * ── WHERE THE EVENTS GO NOW (v4 sink deleted, founder ruling 2026-08-25) ────────────────────────
 * This pipeline used to POST to the v4 backend's `/telemetry` — a server that is not in this
 * repository, behind a base URL set in no build, so in every binary ever shipped `flush()` returned
 * at `if (!base || !token)` and the journal only ever accumulated. The dishonest half was the
 * header, which promised "athlete journeys can be reconstructed" by a backend nobody could reach.
 *
 * What the ~60 `track()` call sites actually buy, and keep:
 *   · a DURABLE RING JOURNAL (1000 events, survives relaunch) — on a support case, the athlete's
 *    own device holds the reconstruction, and a debug build can read `db.loadTelemetry()`;
 *   · SENTRY BREADCRUMBS — each event is handed to the crash layer, so when a crash IS reported
 *    the report carries the trail of product events that led to it. No DSN → clean no-op, same
 *    seam as `platform/crash`.
 *
 * `flush()` survives as trimming + breadcrumb hand-off so its ~10 "ship before the wipe" call
 * sites keep their meaning: everything recorded so far is delivered as far as delivery exists.
 *
 * Privacy, unchanged: events carry NO athlete id, and `data` stays minimal and non-sensitive
 * (ids, types, booleans, numbers — never raw athlete PII). Breadcrumbs inherit that by carrying
 * the same payloads.
 */

// 

import { db } from '@/data/local/db';
import { deviceContext, newEventId } from '@/platform/deviceContext';

/** The full research-event envelope (durably persisted → athlete_event). */
export interface TelemetryEvent {
  event_id: string;
  type: string;
  client_ts: string; // wall clock
  client_monotonic: number; // ms since app start — ordering immune to wall-clock skew
  seq: number;
  session_id?: string;
  app_version?: string;
  os?: string;
  device_id?: string;
  locale?: string;
  network?: string;
  data?: Record<string, unknown>;
}

let seqCounter = 0;
function monotonic(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
}

const BUFFER_CAP = 1000; // ring journal; oldest dropped — the record is bounded by design

let buffer: TelemetryEvent[] = [];
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  buffer = await db.loadTelemetry<TelemetryEvent>();
  loaded = true;
}

/** Record a research event (durable). Never throws — telemetry must not break the app.
 *  `session_id` is promoted from `data.sessionId` so the durable store stays joinable. */
export async function track(type: string, data?: Record<string, unknown>): Promise<void> {
  try {
    await ensureLoaded();
    const ctx = await deviceContext();
    const sessionId = data && typeof data.sessionId === 'string' ? (data.sessionId as string) : undefined;
    buffer.push({
      event_id: newEventId(),
      type,
      client_ts: new Date().toISOString(),
      client_monotonic: monotonic(),
      seq: seqCounter++,
      session_id: sessionId,
      ...ctx,
      data,
    });
    if (buffer.length > BUFFER_CAP) buffer = buffer.slice(-BUFFER_CAP);
    await db.saveTelemetry(buffer);
    await enqueueForSink(buffer[buffer.length - 1]);
    /*
     * A funnel event ships THE MOMENT IT HAPPENS, not at the next flush. The funnel's whole
     * audience is the athlete who abandons — and she, by definition, never reaches the screens
     * that flush. Funnel events are rare (a handful per install, ever), so this costs a handful
     * of extra POSTs per lifetime against the one cohort the dataset exists to see.
     */
    if (type.startsWith('funnel_')) void shipToSink();
    breadcrumb(type, data);
  } catch {
    // swallow — observability must never crash the app
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SINK — the wire the journal never had (2026-09-01, the audit's finding 01).
 *
 * The taxonomy was always right and the pipe was always missing: 170 call sites wrote a durable
 * ring on the device, and the four numbers a subscription company runs on — funnel completion,
 * D30, conversion, churn — were unanswerable because nothing ever LEFT the phone. This is the
 * pipe, and it is deliberately the smallest honest one:
 *
 *   · `EXPO_PUBLIC_TELEMETRY_URL` names the sink. ABSENT → this whole layer is inert: no outbox
 *     is written, no request is made, the app is exactly what it was. Same build discipline as
 *     the coach and the circle (`aBuildWithoutACoachSaysSo`).
 *   · Delivery is an OUTBOX, not the journal. The journal stays a bounded ring for on-device
 *     reconstruction; the outbox holds only what has not yet reached the sink, and empties on
 *     every 2xx. A failed ship costs nothing — the next flush retries.
 *   · Fire-and-forget, batched, 10s timeout, never throws, never blocks a workout. `flush()` is
 *     already called on foreground and before every wipe, so those are the ship moments.
 *   · PRIVACY IS THE ENVELOPE'S, UNCHANGED: no athlete id, no name, no copy strings — the same
 *     `TelemetryEvent` the journal has always held, install-id–keyed and nothing more.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/*
 * The sink address. Explicit `EXPO_PUBLIC_TELEMETRY_URL` wins; absent, it derives from the
 * identity worker (`/events` lives there — see `server/hush-identity/src/index.ts`), so the builds that already
 * carry `EXPO_PUBLIC_CIRCLE_URL` in EAS env grow a working wire with no new configuration. Read
 * straight off `process.env` rather than through `circleClient`, which imports `track` from here.
 */
let sinkUrl =
  process.env.EXPO_PUBLIC_TELEMETRY_URL ||
  (process.env.EXPO_PUBLIC_CIRCLE_URL ? `${process.env.EXPO_PUBLIC_CIRCLE_URL.replace(/\/$/, '')}/events` : '');

/** Test seam: point the sink at a mock (and back to '' to silence it). */
export function __setSinkUrlForTest(url: string): void {
  sinkUrl = url;
}
// Bounded EXACTLY like the journal — it was 500 against the journal's 1000, which meant a heavy
// offline fortnight silently dropped the OLDEST undelivered events, and the oldest are the funnel
// ones (audit finding 2). Two buffers, one capacity, one truth.
const OUTBOX_CAP = 1000;
const SHIP_BATCH = 100; // one POST per batch — a year of quiet use ships in a handful of calls
let shipping = false; // one ship at a time; a second flush during a ship is a no-op for the wire

/**
 * ════ THE OPT-OUT (2026-09-01, audit finding 4) ════
 *
 * One switch in You → gates the WIRE and only the wire. The journal keeps writing — a device
 * debugging itself is not analytics, and a crash report she consented to still deserves its
 * breadcrumbs — but nothing leaves the phone while this is true. Cached in memory because it is
 * read on every event; re-read from disk at boot via `refreshTelemetryOptOut`.
 */
let optedOut = false;
export async function refreshTelemetryOptOut(): Promise<void> {
  try {
    optedOut = await db.loadTelemetryOptOut();
  } catch {
    /* default: the wire ships */
  }
}
export async function setTelemetryOptOut(on: boolean): Promise<void> {
  optedOut = on;
  try {
    await db.saveTelemetryOptOut(on);
    if (on) await db.saveTelemetryOutbox([]); // she said stop — undelivered events stop existing
  } catch {
    /* the in-memory latch still holds for this run */
  }
}
export function telemetryOptedOut(): boolean {
  return optedOut;
}

async function enqueueForSink(ev: TelemetryEvent | undefined): Promise<void> {
  if (!sinkUrl || !ev || optedOut) return;
  const outbox = await db.loadTelemetryOutbox<TelemetryEvent>();
  outbox.push(ev);
  await db.saveTelemetryOutbox(outbox.length > OUTBOX_CAP ? outbox.slice(-OUTBOX_CAP) : outbox);
}

/** Ship the outbox to the sink. Resolves whether anything was DELIVERED (tests read it). */
export async function shipToSink(): Promise<boolean> {
  if (!sinkUrl || shipping || optedOut) return false;
  shipping = true;
  try {
    let outbox = await db.loadTelemetryOutbox<TelemetryEvent>();
    let delivered = false;
    while (outbox.length > 0) {
      const batch = outbox.slice(0, SHIP_BATCH);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(sinkUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ v: 1, events: batch }),
          signal: controller.signal,
        });
        if (!res.ok) break; // sink unhappy — keep the outbox, try again next flush
      } finally {
        clearTimeout(timer);
      }
      outbox = outbox.slice(batch.length);
      await db.saveTelemetryOutbox(outbox);
      delivered = true;
    }
    return delivered;
  } catch {
    return false; // offline / abort — the outbox stands, the next flush retries
  } finally {
    shipping = false;
  }
}

/** Hand an event to the crash layer, so a crash report carries the product trail that led to it.
 *  Lazy-required and try-wrapped for exactly the reasons `platform/crash` is: no DSN, no native
 *  module, no jest breakage — and telemetry is never allowed to be the thing that crashes. */
function breadcrumb(type: string, data?: Record<string, unknown>): void {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return;
  try {
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    Sentry.addBreadcrumb({ category: 'product', message: type, data, level: 'info' });
  } catch {
    /* no crash layer present — the durable journal above is still the record */
  }
}

/** Fire a named event at most ONCE per install (trust "firsts"). */
export async function trackFirst(name: string, data?: Record<string, unknown>): Promise<void> {
  try {
    if (await db.hasFirst(name)) return;
    await db.markFirst(name);
    await track(name, data);
  } catch {
    /* swallow */
  }
}

/**
 * Deliver everything recorded so far as far as delivery exists: persist the journal, and — when a
 * sink URL is configured — ship the outbox over the wire. The ~10 call sites all mean "make sure
 * everything recorded so far is delivered before X"; since 2026-09-01 that sentence is true over
 * the network again, not only on the device. The ship is awaited but can never throw and never
 * blocks longer than its own timeout.
 */
export async function flush(): Promise<void> {
  try {
    await ensureLoaded();
    if (buffer.length > BUFFER_CAP) buffer = buffer.slice(-BUFFER_CAP);
    await db.saveTelemetry(buffer);
    await shipToSink();
  } catch {
    /* observability must never crash the app */
  }
}

/** Test-only: reset the in-memory buffer/latch (the durable store is cleared separately). */
export function __resetForTest(): void {
  buffer = [];
  loaded = false;
}

/** Global JS error/crash capture → telemetry. Install once at app start. */
export function installCrashHandler(): void {
  // ErrorUtils is a React Native global.
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const eu = g.ErrorUtils;
  if (!eu?.setGlobalHandler) return;
  const prev = eu.getGlobalHandler?.();
  eu.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const err = error as { message?: string; stack?: string } | undefined;
    void track('crash', { message: String(err?.message ?? error), stack: err?.stack, fatal: !!isFatal });
    void flush();
    prev?.(error, isFatal);
  });
}
