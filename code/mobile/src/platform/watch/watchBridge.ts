/**
 * Apple Watch bridge (application layer).
 *
 * Orchestrates the phone side of the companion: publishes the canonical
 * SessionMirror to the watch and turns watch intents into validated session
 * events. The native WatchConnectivity (WCSession) transport is injected via the
 * `WatchTransport` swap point — `watchTransportStub` is the no-op used until the
 * native watchOS target + module exist, and a fake transport drives the unit
 * tests. All authority/validation/telemetry lives here and is therefore exercised
 * without any Apple hardware.
 *
 * Authority model: the phone is the sole authority. This bridge NEVER lets the
 * watch mutate session state directly — every intent passes through
 * `decideWatchIntent` (phone's truth wins) before it is dispatched into the one
 * session machine. The bridge holds no workout database; it keeps only the last
 * published mirror (to validate incoming intents) and a de-dupe set.
 */
import type { SessionEvent } from '@/state/machines/sessionState';
import type { SessionMirror } from '@/platform/sessionMirror';
import { WATCH_EVENTS } from '@/platform/events';
import {
  decideWatchIntent,
  makeStateEnvelope,
  type WatchStateEnvelope,
} from './protocol';

/** Native WatchConnectivity transport — the single swap point. */
export interface WatchTransport {
  /** Whether the paired watch app is reachable right now. */
  isReachable(): boolean;
  /** Push a state envelope to the watch (applicationContext / sendMessage). */
  sendState(env: WatchStateEnvelope): void;
  /** Subscribe to raw inbound intents from the watch. Returns an unsubscribe fn. */
  onIntent(cb: (raw: unknown) => void): () => void;
  /** Subscribe to reachability changes. Returns an unsubscribe fn. */
  onReachabilityChange(cb: (reachable: boolean) => void): () => void;
}

/** v1 no-op transport — there is no watch target yet, so nothing is sent and no
 *  intents ever arrive. Swapped for the real WCSession module on a native build. */
export const watchTransportStub: WatchTransport = {
  isReachable: () => false,
  sendState: () => {},
  onIntent: () => () => {},
  onReachabilityChange: () => () => {},
};

export interface WatchSessionDeps {
  transport: WatchTransport;
  /** Complete the current set with the reported actual reps (omitted = target
   *  reps). The phone logs it and runs its machine transition — exactly as an
   *  on-phone entry would. Weight stays the recommended target (watch reports reps). */
  completeSet: (actualReps?: number) => void;
  /** Dispatch a validated session event into the phone's session machine
   *  (end_rest / pause / resume / finish_early). */
  dispatch: (event: SessionEvent) => void;
  /** Apply an Exercise Busy (equipment-occupied) reorder — a phone session-store
   *  action, not a machine event. */
  markEquipmentOccupied: () => void;
  /** Telemetry sink (track) — every lifecycle/intent event lands in the dataset. */
  track: (type: string, data?: Record<string, unknown>) => void;
  now: () => number;
}

/**
 * Lifecycle owner for one workout's worth of watch mirroring. Construct lazily
 * when a session starts; `end()` tears it down. Safe to use with the stub
 * transport (everything degrades to local telemetry no-ops).
 */
export class WatchSession {
  private readonly d: WatchSessionDeps;
  private authoritySeq = 0;
  private lastMirror: SessionMirror | null = null;
  private readonly seen = new Set<string>();
  private reachable = false;
  private everDisconnected = false;
  private started = false;
  private unsub: Array<() => void> = [];

  constructor(deps: WatchSessionDeps) {
    this.d = deps;
  }

  /** Begin mirroring: subscribe to the transport and emit session-started. */
  begin(): void {
    if (this.started) return;
    this.started = true;
    this.reachable = this.d.transport.isReachable();
    this.d.track(WATCH_EVENTS.sessionStarted, { reachable: this.reachable });
    if (this.reachable) this.d.track(WATCH_EVENTS.connected);
    this.unsub.push(this.d.transport.onIntent((raw) => this.handleIntent(raw)));
    this.unsub.push(
      this.d.transport.onReachabilityChange((r) => this.handleReachability(r)),
    );
  }

  /**
   * Publish the latest mirror. A non-null mirror auto-begins the session; a null
   * (or `complete`) mirror is published once as the teardown frame and ends the
   * session. The same mirror object that feeds the Live Activity is passed here —
   * one projection, two surfaces.
   */
  publish(mirror: SessionMirror | null): void {
    if (mirror && !this.started) this.begin();
    if (!this.started) return;
    this.lastMirror = mirror;
    const env = makeStateEnvelope(mirror, ++this.authoritySeq, this.d.now());
    this.d.transport.sendState(env);
    this.d.track(WATCH_EVENTS.statePublished, {
      phase: mirror ? mirror.phase : 'none',
      seq: this.authoritySeq,
    });
    if (!mirror || mirror.phase === 'complete') this.end();
  }

  /** Tear down: unsubscribe and emit session-ended. Idempotent. */
  end(): void {
    if (!this.started) return;
    this.started = false;
    for (const u of this.unsub) u();
    this.unsub = [];
    this.d.track(WATCH_EVENTS.sessionEnded);
  }

  private handleReachability(r: boolean): void {
    if (r === this.reachable) return;
    this.reachable = r;
    if (!r) {
      this.everDisconnected = true;
      this.d.track(WATCH_EVENTS.disconnected);
    } else {
      // First connect is "connected"; a connect after any prior drop is "reconnected".
      this.d.track(this.everDisconnected ? WATCH_EVENTS.reconnected : WATCH_EVENTS.connected);
    }
  }

  private handleIntent(raw: unknown): void {
    const decision = decideWatchIntent(raw, this.lastMirror, this.d.now(), this.seen);
    if (!decision.accept || !decision.action) {
      this.d.track(WATCH_EVENTS.actionIgnored, {
        reason: decision.reason ?? 'unknown',
        latencyMs: decision.latencyMs,
      });
      return;
    }
    // Record the id BEFORE acting so a synchronous re-delivery can't double-fire.
    const intentId = (raw as { intentId?: string }).intentId;
    if (intentId) this.seen.add(intentId);
    const action = decision.action;
    const label = action.kind === 'session_event' ? action.event.type : action.kind;
    this.d.track(WATCH_EVENTS.actionReceived, {
      action: label,
      // For a set completion, record whether reps were adjusted (a reported miss/
      // overshoot vs the target) — the actual reps themselves land in the set log.
      repsAdjusted: action.kind === 'complete_set' ? action.actualReps != null : undefined,
      latencyMs: decision.latencyMs, // watch completion latency
    });
    switch (action.kind) {
      case 'complete_set':
        this.d.completeSet(action.actualReps);
        break;
      case 'session_event':
        this.d.dispatch(action.event);
        break;
      case 'mark_equipment_occupied':
        this.d.markEquipmentOccupied();
        break;
    }
  }
}
