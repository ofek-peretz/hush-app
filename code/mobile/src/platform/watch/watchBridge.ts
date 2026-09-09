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

// 

import type { SessionEvent } from '@/state/machines/sessionState';
import type { SessionMirror } from '@/platform/sessionMirror';
import { WATCH_EVENTS } from '@/platform/events';
import { watchCopyPack } from './watchCopyPack';
import {
  decideWatchIntent,
  makeStateEnvelope,
  parseWatchLocalSession,
  repairWireStrings,
  type WatchLocalSession,
  type WatchLobby,
  type WatchPlanSnapshot,
  type WatchStateEnvelope,
} from './protocol';

/**
 * How many intent ids the de-dupe remembers. Insertion-ordered, oldest evicted — see the note at
 * the call site. A whole heavy workout is a few hundred intents, so this never forgets one that
 * could still be redelivered inside `WATCH_INTENT_TTL_MS`.
 */
export const WATCH_SEEN_LIMIT = 2_000;

/** Native WatchConnectivity transport — the single swap point. */
export interface WatchTransport {
  /** Whether the paired watch app is reachable right now. */
  isReachable(): boolean;
  /**
   * Push a state envelope to the watch (applicationContext / sendMessage).
   *
   * ⛔ IT REPORTS WHETHER THE OS TOOK IT. The native call is a `try?` that throws when the session
   * is not activated and on payload-too-large, and the throw was swallowed — while the bridge
   * telemetered `statePublished` unconditionally. So the dataset recorded a success for a frame
   * that never left the phone, on the one signal that would have shown this whole class of bug.
   *
   * `false` means "the OS refused it", never "the watch did not see it" — delivery is not
   * knowable from here. The STUB returns true: no watch target is not a failure to send.
   *
   * ⚠️ AND THE OS ANSWERS ASYNCHRONOUSLY (build-59 wrist silence, 2026-08-26): the native call is
   * an Expo AsyncFunction, so a refusal arrives as a PROMISE REJECTION that a synchronous
   * try/catch here can never meet — `sendState` was returning `true` for frames the OS threw
   * away. Late refusals surface on `onSendFailure`; the sync `false` remains for transports that
   * can refuse inline.
   */
  sendState(env: WatchStateEnvelope): boolean;
  /** Late (async) OS refusals of `sendState` — the reason string, for telemetry. Optional: the
   *  stub and test fakes never fail late. Returns an unsubscribe fn. */
  onSendFailure?(cb: (reason: string) => void): () => void;
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
  sendState: () => true,
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
  /**
   * ⛔ THE WRIST IS RUNNING A WORKOUT AND IS OFFERING IT — the live handover (`WatchLocalSession`).
   *
   * Not an intent: nothing here is a proposal and the phone does not get to argue with the facts.
   * It arrives when a wrist that has been running standalone finds the phone again, so the
   * authority can MOVE and she sees her workout the moment she opens the app.
   *
   * Resolves with what happened, for telemetry — 'adopted' | 'duplicate' | 'refused'. The caller
   * (the session store) owns the decision, because whether an adoption is legal depends on facts
   * only it has: is a session already live, is it this one, and has this workout already come home
   * as a finished record?
   *
   * ⚠️ ASYNC ON PURPOSE. That last question is a read of her history, and answering it optimistically
   * so the call could stay synchronous would put a guess in the dataset — on the one event that says
   * whether the handover works in the field.
   *
   * Optional in the type only so a harness may omit it; the app always supplies it.
   */
  adoptLocalSession?: (local: WatchLocalSession) => Promise<'adopted' | 'duplicate' | 'refused'>;
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
  /** This phone process's epoch — see `WatchStateEnvelope.authorityEpoch`. Wall-clock ms taken
   *  once, at construction, so every envelope this bridge ever sends names the same process and a
   *  relaunch is distinguishable from a reordered message. */
  private readonly authorityEpoch: number;
  private lastMirror: SessionMirror | null = null;
  /** The last lobby + plan published, so a reconnect can restate them — see `resync()`. */
  private lastLobby: WatchLobby | null = null;
  private lastPlan: WatchPlanSnapshot | null = null;
  private hasPublished = false;
  /**
   * The wrist handover this phone is currently running, if any — stamped on every envelope so the
   * wrist knows its session is safely held and may let go. Cleared when the session ends, because
   * an id left behind would tell the NEXT workout's wrist that its own session had been adopted.
   */
  private adoptedRecordId: string | null = null;
  private readonly seen = new Set<string>();
  private reachable = false;
  private everDisconnected = false;
  private started = false;
  private subscribed = false;
  private unsub: Array<() => void> = [];

  constructor(deps: WatchSessionDeps) {
    this.d = deps;
    this.authorityEpoch = deps.now();
  }

  /**
   * ⛔ NAME THE HANDOVER BEFORE THE SESSION GOES LIVE — the ordering IS the fix.
   *
   * The stamp used to be set when `adoptLocalSession` RESOLVED. But adopting is what makes the
   * phone's session live, and going live is what triggers the first mirror publish — so the first
   * frame could leave without the ack, and the wrist would keep holding its workout until the next
   * state change. Between sets that is ninety seconds of two devices both believing they are in
   * charge, with the phone already drawing the stage.
   *
   * The store calls this immediately BEFORE it dispatches, so every frame the adoption produces —
   * including the first — carries the id. Idempotent, and safe to call again for a re-offer.
   */
  noteAdopted(recordId: string): void {
    this.adoptedRecordId = recordId;
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
    // Late OS refusals (async — see the interface note). Counted with the REASON, which is the
    // one string that names the layer that died: not-activated, not-paired, payload-too-large.
    if (this.d.transport.onSendFailure) {
      this.unsub.push(
        this.d.transport.onSendFailure((reason) =>
          this.d.track(WATCH_EVENTS.statePublishFailed, { phase: 'os_refused', reason: reason.slice(0, 200) }),
        ),
      );
    }
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
    this.lastLobby = lobby;
    /* A lobby published without a plan does not RETRACT the plan the wrist is holding — the phone
       simply had none to hand this time. Keeping the last one is what lets `resync()` restate a
       standalone-capable lobby rather than downgrading the wrist on a reconnect. */
    if (plan) this.lastPlan = plan;
    this.hasPublished = true;
    /*
     * HER COPY RIDES THE LOBBY, and only the lobby.
     *
     * A mirror is published many times a second during a rest; the pack is a kilobyte that changes
     * when she changes her language, which is to say almost never. The lobby is published on every
     * return to Today — often enough for a language change to reach the wrist before her next
     * workout, and rare enough to cost nothing.
     */
    const env = makeStateEnvelope(
      null,
      ++this.authoritySeq,
      this.d.now(),
      lobby,
      plan,
      watchCopyPack(),
      this.authorityEpoch,
    );
    const okLobby = this.send(env);
    this.d.track(okLobby ? WATCH_EVENTS.statePublished : WATCH_EVENTS.statePublishFailed, {
      phase: 'lobby',
      seq: this.authoritySeq,
    });
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
    this.hasPublished = true;
    const env = makeStateEnvelope(
      mirror,
      ++this.authoritySeq,
      this.d.now(),
      null,
      null,
      null,
      this.authorityEpoch,
      this.adoptedRecordId,
    );
    const ok = this.send(env);
    this.d.track(ok ? WATCH_EVENTS.statePublished : WATCH_EVENTS.statePublishFailed, {
      phase: mirror ? mirror.phase : 'none',
      seq: this.authoritySeq,
    });
    if (!mirror || mirror.phase === 'complete') this.end();
  }

  /**
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ ENDING A WORKOUT STOPS THE MIRRORING. IT MUST NOT STOP THE LISTENING.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   *
   * This used to drop every transport subscription — `onIntent` with them — and `publish()` calls
   * it on the teardown frame of every workout. So between the last set and the next time Home's
   * lobby effect happens to re-run, the phone had NOBODY listening for watch intents.
   *
   * That is survivable for the reachable-only intents (nothing is in flight when no session is
   * running). It is not survivable for `report_pain`, which was deliberately put on the DURABLE
   * channel — `transferUserInfo` — precisely so a report made out of range is delivered later. The
   * OS delivers it once, with no ack and no redelivery. If that delivery lands while this class is
   * unsubscribed, the report is gone, and a pain report is the one message in this product that
   * must never be lost: it is what stops her being handed the lift that hurt her.
   *
   * `subscribe()`'s own docblock already stated the intent — *"Used by both an active session and
   * the pre-session lobby so watch intents are always heard"* — and this method was quietly
   * breaking it. The subscription's lifetime is the APP's, matching the record channel in
   * `sessionStore` (subscribed once, `useEffect(…, [])`, never torn down).
   *
   * ⚠️ SAFE WITH NO SESSION: an intent arriving with `lastMirror === null` is judged by the same
   * pure `decide()` as always, which rejects anything the phase does not allow. `report_pain`
   * bypasses the phase gate by design, which is exactly the message we are keeping alive.
   *
   * `dispose()` is the real teardown, for a caller that is discarding the bridge entirely.
   */
  end(): void {
    if (!this.started) return;
    this.started = false;
    /* The handover belonged to the workout that just ended. Left standing, it would tell the wrist
       that the NEXT session was one it had handed over — and invite it to drop a live local one. */
    this.adoptedRecordId = null;
    this.d.track(WATCH_EVENTS.sessionEnded);
  }

  /** Release the transport subscriptions. The app never calls this — the bridge lives as long as
   *  the JS context does — but a bridge that cannot be released is a leak in any other caller. */
  dispose(): void {
    this.end();
    for (const u of this.unsub) u();
    this.unsub = [];
    this.subscribed = false;
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
      this.resync();
    }
  }

  /**
   * ⛔ A RECONNECT RESTATES THE TRUTH — nothing else did.
   *
   * Convergence rested entirely on `updateApplicationContext` being last-write-wins, which is a
   * fair design until you ask what happens to an envelope that never left. The native send is a
   * `try?` — it throws when the session is not activated and on payload-too-large — and the comment
   * excusing the drop said *"the bridge re-publishes on next change"*. There may BE no next change:
   * a lobby is republished only when Home's effect dependencies happen to change, so a lobby lost
   * that way stayed lost, and the wrist sat on whatever it last managed to receive.
   *
   * Reachability returning is the one moment we know the wrist can hear again, and it costs one
   * envelope. `resync` is stamped on the telemetry so a restatement is never mistaken for a real
   * state change when reading the dataset.
   *
   * ⚠️ ONLY IF THERE IS SOMETHING TO RESTATE. Publishing an empty lobby to a watch that already
   * holds a good one would be a downgrade dressed as a repair.
   */
  private resync(): void {
    if (!this.hasPublished) return;
    const env = this.lastMirror
      ? makeStateEnvelope(
          this.lastMirror,
          ++this.authoritySeq,
          this.d.now(),
          null,
          null,
          null,
          this.authorityEpoch,
          this.adoptedRecordId,
        )
      : makeStateEnvelope(
          null,
          ++this.authoritySeq,
          this.d.now(),
          this.lastLobby,
          this.lastPlan,
          watchCopyPack(),
          this.authorityEpoch,
        );
    const okResync = this.send(env);
    this.d.track(okResync ? WATCH_EVENTS.statePublished : WATCH_EVENTS.statePublishFailed, {
      phase: this.lastMirror ? this.lastMirror.phase : 'lobby',
      seq: this.authoritySeq,
      resync: true,
    });
  }

  /**
   * Every envelope leaves through here. A string holding half a character (an unpaired UTF-16
   * surrogate) makes the ENTIRE frame undecodable on the wrist — Apple's parser refuses the
   * document, not the field (founder 2026-09-08, `wc:badframe:json`) — so it is repaired first,
   * and the place it was found is reported. See `repairWireStrings`. Returns the transport's
   * synchronous verdict, as `sendState` always did.
   */
  private send(env: WatchStateEnvelope): boolean {
    const { value, repaired } = repairWireStrings(env);
    if (repaired.length > 0) {
      this.d.track(WATCH_EVENTS.wireRepaired, {
        paths: repaired.slice(0, 8).join(','),
        seq: env.authoritySeq,
      });
    }
    return this.d.transport.sendState(value) !== false;
  }

  private handleIntent(raw: unknown): void {
    /*
     * ⛔ THE HANDOVER IS CHECKED FIRST, because it is not an intent and `decideWatchIntent` would
     * throw it away as malformed — logging noise for the one message that carries a whole workout.
     *
     * ⚠️ AND IT IS DELIBERATELY NOT DE-DUPED HERE. The store may legitimately REFUSE an offer (a
     * different session is live) and be able to accept the identical one minutes later; a bridge
     * that remembered the id would make the refusal permanent. Adoption is idempotent where it can
     * actually be judged — the store already holds the session id it would be adopting under.
     */
    const offered = parseWatchLocalSession(raw);
    if (offered) {
      if (!this.d.adoptLocalSession) {
        this.d.track(WATCH_EVENTS.localSessionOffered, { outcome: 'rejected', reason: 'unsupported' });
        return;
      }
      const facts = {
        recordId: offered.recordId,
        workoutId: offered.workoutId,
        sets: offered.sets.length,
        phase: offered.phase,
      };
      void this.d
        .adoptLocalSession(offered)
        .then((outcome) => {
          /*
           * ⛔ BOTH ANSWERS MEAN "THE PHONE HAS IT". `duplicate` is what a wrist gets when it
           * re-offers a session already adopted — which is exactly the wrist that missed the first
           * ack and is asking again. Stamping only on `adopted` would leave that one holding a
           * session forever.
           */
          if (outcome === 'adopted' || outcome === 'duplicate') {
            this.adoptedRecordId = offered.recordId;
            /* Say so at once rather than waiting for the session's next state change — she is
               standing there, and the next frame may be ninety seconds of rest away. */
            if (this.lastMirror) this.publish(this.lastMirror);
          }
          this.d.track(WATCH_EVENTS.localSessionOffered, { outcome, ...facts });
        })
        /* An adoption that threw is a workout that did NOT move, and the dataset has to say so —
           a silent failure here looks exactly like the bug this whole path exists to fix. */
        .catch(() => this.d.track(WATCH_EVENTS.localSessionOffered, { outcome: 'rejected', reason: 'threw', ...facts }));
      return;
    }
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
    if (intentId) {
      /*
       * ⛔ THE MEMORY IS BOUNDED. This set was never pruned and the bridge now lives as long as the
       * app does (see `end()`), so an unbounded set is a leak that grows with every tap of a long
       * session — and one that a short test can never notice.
       *
       * Oldest-out, and the cap is far above anything real: a heavy workout is a few hundred
       * intents, so nothing that could still be redelivered inside its TTL is ever forgotten. The
       * de-dupe protects against a redelivery seconds later, not hours.
       */
      if (this.seen.size >= WATCH_SEEN_LIMIT) {
        const oldest = this.seen.values().next();
        if (!oldest.done) this.seen.delete(oldest.value);
      }
      this.seen.add(intentId);
    }
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
