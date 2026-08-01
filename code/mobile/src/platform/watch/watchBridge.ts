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
import { watchCopyPack } from './watchCopyPack';
import {
  decideWatchIntent,
  makeStateEnvelope,
  type WatchLobby,
  type WatchPlanSnapshot,
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
  /** Subscribe to watch-local session records (durable userInfo transfers) for
   *  reconciliation. Returns an unsubscribe fn. */
  onSessionRecord(cb: (raw: unknown) => void): () => void;
  /** Durably acknowledge a reconciled record so the watch clears its outbox. */
  ackRecord(recordId: string): void;
}

/** v1 no-op transport — there is no watch target yet, so nothing is sent and no
 *  intents ever arrive. Swapped for the real WCSession module on a native build. */
export const watchTransportStub: WatchTransport = {
  isReachable: () => false,
  sendState: () => {},
  onIntent: () => () => {},
  onReachabilityChange: () => () => {},
  onSessionRecord: () => () => {},
  ackRecord: () => {},
};

export interface WatchSessionDeps {
  transport: WatchTransport;
  /** Complete the current set with the reported actual reps + weight (each omitted =
   *  prescribed target; weight null = bodyweight). The phone logs it and runs its
   *  machine transition — exactly as an on-phone Edit Result + Complete set would. */
  completeSet: (actualReps?: number, actualWeight?: number | null) => void;
  /** Dispatch a validated session event into the phone's session machine
   *  (end_rest / pause / resume / finish_early). */
  dispatch: (event: SessionEvent) => void;
  /** Apply an Exercise Busy (equipment-occupied) reorder — a phone session-store
   *  action, not a machine event. */
  markEquipmentOccupied: () => void;
  /** Queue the workout the Start screen picked (lobby proposal). Optional — the
   *  phone owns the program; absent = the proposal is accepted but no-op. */
  selectWorkout?: (workoutId?: string) => void;
  /** Start the queued workout from the Start screen (lobby proposal). Optional —
   *  the phone (sole authority over the session lifecycle) performs the start. */
  startWorkout?: (workoutId?: string) => void;
  /** Swap the current/next exercise to the chosen one (the phone recalibrates the
   *  load). Optional — absent = the proposal is accepted but no-op (documented seam). */
  swapExercise?: (exerciseId?: string) => void;
  /** Extend the running rest by N seconds (Rest screen "+15 sec"). Optional seam. */
  addRest?: (seconds: number) => void;
  /** Record a muscle the wrist flagged as hurting, with the severity SHE chose (WT14 → WT14b).
   *  The phone owns what a pain flag DOES to the model — this only delivers her two answers.
   *  Optional in the type only so a harness may omit it; `everyWristIntentLandsSomewhere` proves
   *  the app itself always supplies it. */
  reportPain?: (area: string, severity: string) => void;
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
  private subscribed = false;
  private unsub: Array<() => void> = [];

  constructor(deps: WatchSessionDeps) {
    this.d = deps;
  }

  /** Subscribe to the transport once (idempotent). Used by both an active session
   *  and the pre-session lobby so watch intents are always heard. */
  private subscribe(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    this.unsub.push(this.d.transport.onIntent((raw) => this.handleIntent(raw)));
    this.unsub.push(
      this.d.transport.onReachabilityChange((r) => this.handleReachability(r)),
    );
  }

  /** Begin mirroring: subscribe to the transport and emit session-started. */
  begin(): void {
    if (this.started) return;
    this.started = true;
    this.reachable = this.d.transport.isReachable();
    this.d.track(WATCH_EVENTS.sessionStarted, { reachable: this.reachable });
    if (this.reachable) this.d.track(WATCH_EVENTS.connected);
    this.subscribe();
  }

  /**
   * Publish the pre-session lobby (the Start screen). No active session — the
   * envelope carries a null mirror + the lobby. Keeps the transport subscribed so
   * the Start screen's select/start proposals are received and routed to the phone.
   *
   * `plan` (when provided) is the standalone plan snapshot — the fully prescribed
   * remaining workouts the watch stores durably so it can EXECUTE one with the
   * phone absent. It rides the lobby envelope (applicationContext survives
   * unreachable watches), never the live mirror frames.
   */
  publishLobby(lobby: WatchLobby | null, plan: WatchPlanSnapshot | null = null): void {
    this.subscribe();
    this.lastMirror = null;
    /*
     * HER COPY RIDES THE LOBBY, and only the lobby.
     *
     * A mirror is published many times a second during a rest; the pack is a kilobyte that changes
     * when she changes her language, which is to say almost never. The lobby is published on every
     * return to Today — often enough for a language change to reach the wrist before her next
     * workout, and rare enough to cost nothing.
     */
    const env = makeStateEnvelope(null, ++this.authoritySeq, this.d.now(), lobby, plan, watchCopyPack());
    this.d.transport.sendState(env);
    this.d.track(WATCH_EVENTS.statePublished, { phase: 'lobby', seq: this.authoritySeq });
    if (plan) {
      this.d.track(WATCH_EVENTS.planPublished, {
        planId: plan.planId,
        workouts: plan.workouts.length,
      });
    }
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
    this.subscribed = false;
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
      // For a set completion, record whether weight/reps were adjusted vs the target
      // (the actual values themselves land in the set log).
      adjusted: action.kind === 'complete_set'
        ? action.actualReps != null || action.actualWeight !== undefined
        : undefined,
      latencyMs: decision.latencyMs, // watch completion latency
    });
    switch (action.kind) {
      case 'complete_set':
        this.d.completeSet(action.actualReps, action.actualWeight);
        break;
      case 'session_event':
        this.d.dispatch(action.event);
        break;
      case 'mark_equipment_occupied':
        this.d.markEquipmentOccupied();
        break;
      case 'select_workout':
        this.d.selectWorkout?.(action.workoutId);
        break;
      case 'start_workout':
        this.d.startWorkout?.(action.workoutId);
        break;
      case 'swap_exercise':
        this.d.swapExercise?.(action.exerciseId);
        break;
      case 'add_rest':
        this.d.addRest?.(action.seconds);
        break;
      case 'report_pain':
        this.d.reportPain?.(action.area, action.severity);
        break;
    }
  }
}
