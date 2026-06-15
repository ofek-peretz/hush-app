/**
 * Client telemetry pipeline (alpha hardening / observability).
 *
 * Captures structured events that the backend cannot otherwise see — trust/
 * journey events, UI-level decision context, overrides, errors, and crashes —
 * and ships them to the backend telemetry sink so athlete journeys can be
 * reconstructed and failures diagnosed. Events are buffered DURABLY (survives
 * relaunch) and flushed best-effort; offline never loses them.
 *
 * Privacy: events carry NO athlete id — the backend stamps identity from the
 * bearer token on the authed /telemetry endpoint. Keep `data` minimal and
 * non-sensitive (ids, types, booleans, numbers — never raw athlete PII).
 *
 * NOTE: a crash-reporting SaaS (e.g. Sentry) is the production upgrade layer
 * (needs a DSN + native build); this pipeline is the durable foundation and is
 * sufficient for a controlled alpha.
 */
import { db } from '@/data/local/db';
import { getBaseUrl, getToken } from '@/data/api/config';
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

const BUFFER_CAP = 1000; // ring buffer; oldest dropped if the sink is long-unreachable
const FLUSH_BATCH = 100;
const FLUSH_DEBOUNCE_MS = 3000;
const FLUSH_TIMEOUT_MS = 8000;

let buffer: TelemetryEvent[] = [];
let loaded = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

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
    scheduleFlush();
  } catch {
    // swallow — observability must never crash the app
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

function scheduleFlush(): void {
  if (flushTimer) return;
  if (process.env.JEST_WORKER_ID) return; // no real timers under test
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

/** Ship buffered events to the backend sink. Best-effort; keeps the buffer on failure. */
export async function flush(): Promise<void> {
  try {
    await ensureLoaded();
    if (buffer.length === 0) return;
    const base = getBaseUrl();
    const token = await getToken();
    if (!base || !token) return; // not enrolled / no sink yet — keep buffering

    const batch = buffer.slice(0, FLUSH_BATCH);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
    let ok = false;
    try {
      const res = await fetch(`${base}/telemetry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ events: batch }),
        signal: controller.signal,
      });
      ok = res.ok;
    } finally {
      clearTimeout(timer);
    }
    if (ok) {
      buffer = buffer.slice(batch.length);
      await db.saveTelemetry(buffer);
      if (buffer.length > 0) scheduleFlush(); // drain the rest
    }
  } catch {
    /* offline / sink down — keep the buffer for the next attempt */
  }
}

/** Test-only: reset the in-memory buffer/latch (the durable store is cleared separately). */
export function __resetForTest(): void {
  buffer = [];
  loaded = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
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
