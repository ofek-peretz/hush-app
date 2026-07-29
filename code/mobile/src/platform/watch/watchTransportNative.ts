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
  sendState(json: string): void;
  /** Durably acknowledge a reconciled watch-local session record (transferUserInfo). */
  ackRecord(recordId: string): void;
  addListener(event: 'onIntent', cb: (e: { intent: string }) => void): EventSubscription;
  addListener(event: 'onReachabilityChange', cb: (e: { reachable: boolean }) => void): EventSubscription;
  addListener(event: 'onSessionRecord', cb: (e: { record: string }) => void): EventSubscription;
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

export const watchTransportNative: WatchTransport | null = native
  ? {
      isReachable() {
        try {
          return native.isReachable();
        } catch {
          return false;
        }
      },
      sendState(env: WatchStateEnvelope) {
        try {
          native.sendState(serializeEnvelope(env));
        } catch {
          /* transport unavailable — drop; the bridge re-publishes on next change */
        }
      },
      onIntent(cb: (raw: unknown) => void) {
        const sub = native.addListener('onIntent', (e) => cb(parseIntent(e.intent)));
        return () => {
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
        return () => {
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
