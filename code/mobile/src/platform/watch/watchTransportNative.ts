/**
 * Native WatchConnectivity transport (the swap for `watchTransportStub`).
 *
 * Bridges the JS `WatchSession` (watchBridge.ts) to the phone-side WCSession native
 * module (`modules/hush-watch-connectivity`). The native module is a dumb pipe; this
 * file adapts it to the `WatchTransport` interface the bridge expects and handles
 * (de)serialization at the boundary:
 *  - outbound: the bridge hands us a typed envelope → we serialize to JSON (so the
 *    nested, nullable mirror crosses WCSession as a property-list-safe string).
 *  - inbound: the native module hands us the raw intent JSON string → we parse it to
 *    an object so the bridge's `decideWatchIntent` (which validates everything) can
 *    run. We never trust or interpret it here.
 *
 * `requireOptionalNativeModule` returns null where the module is absent (Expo Go /
 * web / a build without the watch target / jest), so the transport degrades to the
 * stub and the bridge keeps running with a no-op pipe.
 */

// 

import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import { serializeEnvelope, type WatchStateEnvelope } from './protocol';
import { watchTransportStub, type WatchTransport } from './watchBridge';

/** What WCSession knows about the DEVICE (not about the connection) — see `pairingState` in
 *  `HushWatchConnectivityModule.swift`. `activated: false` means "not asked yet", never "no". */
export interface NativeWatchPairing {
  activated: boolean;
  paired: boolean;
  appInstalled: boolean;
}

interface HushWatchConnectivityNativeModule {
  isReachable(): boolean;
  pairingState(): NativeWatchPairing;
  /** Expo AsyncFunction — resolves when the OS accepted the frame, REJECTS when it refused
   *  (not-activated / not-paired / payload-too-large). See sendState below. */
  sendState(json: string): Promise<void>;
  /** Durably acknowledge a reconciled watch-local session record (transferUserInfo). */
  ackRecord(recordId: string): void;
  /** JS is subscribed on both inbound channels — drain everything buffered during boot (W1). */
  flushPending(): void;
  addListener(event: 'onIntent', cb: (e: { intent: string }) => void): EventSubscription;
  addListener(event: 'onReachabilityChange', cb: (e: { reachable: boolean }) => void): EventSubscription;
  addListener(event: 'onSessionRecord', cb: (e: { record: string }) => void): EventSubscription;
  /** Live-channel (sendMessage) refusals — surfaced instead of `errorHandler: nil` (2026-08-26). */
  addListener(event: 'onSendError', cb: (e: { reason: string }) => void): EventSubscription;
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<HushWatchConnectivityNativeModule>('HushWatchConnectivity')
    : null;

/** Parse the watch's raw intent JSON into an object for `decideWatchIntent`. A
 *  malformed payload becomes a value the bridge rejects (never throws here). */
function parseIntent(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * What WCSession knows about the wrist, or null where there is no native module (web / Expo
 * Go / jest / a build without the watch target). NULL AND `activated: false` MEAN THE SAME
 * THING to a caller — we do not know — and neither is ever reported as "no watch".
 *
 * This is the only native read outside the transport, and it lives here so the module handle
 * has exactly one home.
 */
export function nativeWatchPairing(): NativeWatchPairing | null {
  if (!native) return null;
  try {
    const state = native.pairingState();
    // A malformed answer is an unknown one, never a negative.
    if (typeof state?.activated !== 'boolean') return null;
    return { activated: state.activated, paired: !!state.paired, appInstalled: !!state.appInstalled };
  } catch {
    return null;
  }
}

/*
 * ⛔ THE BOOT WINDOW (watch audit 2026-08-23). WCSession activates milliseconds into a cold launch
 * and delivers queued transfers immediately; React subscribes seconds later; an event emitted into
 * that gap was dropped — a pain report permanently, a finished wrist workout until the outbox's
 * next retry. The native module now BUFFERS intents + records until told JS is listening, and this
 * is where it is told: once BOTH inbound channels have a subscriber, everything buffered drains in
 * order. Counted per channel, because flushing on the first (intents) while the second (records)
 * was still unsubscribed would drop the records all over again.
 */
let intentSubs = 0;
let recordSubs = 0;
/** Listeners for LATE (async) OS refusals of sendState — see the sendState note. */
const sendFailureCbs = new Set<(reason: string) => void>();
let sendErrorSubAttached = false;
function maybeFlushPending(): void {
  if (intentSubs > 0 && recordSubs > 0) {
    try {
      native?.flushPending();
    } catch {
      /* an older native binary has no flushPending — it also has no buffer to drain */
    }
  }
}

export const watchTransportNative: WatchTransport | null = native
  ? {
      isReachable() {
        try {
          return native.isReachable();
        } catch {
          return false;
        }
      },
      sendState(env: WatchStateEnvelope): boolean {
        /*
         * ⛔ THE CATCH THAT COULD NEVER CATCH (build-59 wrist silence, 2026-08-26). `sendState` is
         * an Expo AsyncFunction — it returns a PROMISE, and the old synchronous try/catch here met
         * only serialization errors. An OS refusal (`updateApplicationContext` throwing on
         * not-activated / not-paired / payload-too-large) arrived as an unhandled rejection while
         * this function had already answered `true` — so the bridge telemetered a success for
         * every frame the OS discarded, which is exactly the blindness that let the wrist starve
         * unnoticed. Refusals now flow to `onSendFailure`, and the promise is always handled.
         */
        try {
          const r = native.sendState(serializeEnvelope(env)) as unknown;
          if (r && typeof (r as Promise<void>).catch === 'function') {
            (r as Promise<void>).catch((err) => {
              const reason = err instanceof Error ? err.message : String(err);
              for (const cb of sendFailureCbs) cb(reason);
            });
          }
          return true;
        } catch {
          return false; // synchronous refusal (serialization) — the bridge counts it inline
        }
      },
      onSendFailure(cb: (reason: string) => void) {
        // One native listener, attached on first subscriber, feeds the same channel — a
        // sendMessage refusal and a rejected updateApplicationContext are one fact to the bridge.
        if (!sendErrorSubAttached) {
          sendErrorSubAttached = true;
          try {
            native.addListener('onSendError', (e) => {
              for (const f of sendFailureCbs) f(e.reason);
            });
          } catch {
            /* an older native binary has no such event — the promise path still reports */
          }
        }
        sendFailureCbs.add(cb);
        return () => {
          sendFailureCbs.delete(cb);
        };
      },
      onIntent(cb: (raw: unknown) => void) {
        const sub = native.addListener('onIntent', (e) => cb(parseIntent(e.intent)));
        intentSubs += 1;
        maybeFlushPending();
        return () => {
          intentSubs = Math.max(0, intentSubs - 1);
          try {
            sub.remove();
          } catch {
            /* already removed */
          }
        };
      },
      onReachabilityChange(cb: (reachable: boolean) => void) {
        const sub = native.addListener('onReachabilityChange', (e) => cb(e.reachable));
        return () => {
          try {
            sub.remove();
          } catch {
            /* already removed */
          }
        };
      },
      onSessionRecord(cb: (raw: unknown) => void) {
        // Same defensive parse as intents: a malformed record becomes a value the
        // reconciler rejects (never throws here).
        const sub = native.addListener('onSessionRecord', (e) => cb(parseIntent(e.record)));
        recordSubs += 1;
        maybeFlushPending();
        return () => {
          recordSubs = Math.max(0, recordSubs - 1);
          try {
            sub.remove();
          } catch {
            /* already removed */
          }
        };
      },
      ackRecord(recordId: string) {
        try {
          native.ackRecord(recordId);
        } catch {
          /* transport unavailable — the watch re-delivers; reconcile is idempotent */
        }
      },
    }
  : null;

/** Active phone↔watch transport — the single swap point. Native WCSession transport
 *  when the module is present (native iOS build with the watch target); the no-op
 *  stub everywhere else. */
export const watchTransport: WatchTransport = watchTransportNative ?? watchTransportStub;
