/**
 * Research-event taxonomy for the Apple native surfaces.
 *
 * This is the canonical list of every interaction worth learning from across the
 * four native surfaces (HealthKit, Local Notifications, Live Activity / Dynamic
 * Island, Apple Watch). Each constant is the `type` passed to `track()` — so
 * every one of these flows through the SAME durable, append-only telemetry
 * journal (platform/telemetry.ts) — an on-device record plus Sentry breadcrumbs
 * when a DSN exists; the v4 `athlete_event` backend sink is deleted (2026-08-25).
 * There is no parallel event store: telemetry IS the dataset, which
 * keeps a single source of truth and means no interaction is lost (events are
 * persisted before they ship and survive relaunch).
 *
 * Why a catalog at all: it makes the learnable surface explicit and greppable,
 * and lets new native code reference a name instead of re-typing a string. The
 * envelope (event_id, seq, client_monotonic, device_id, ts) is added by
 * track()/deviceContext — see telemetry.ts — so each event is ordered and
 * reconstructable on its own.
 */

// 


/** HealthKit — convenience-only; NEVER a model input. */
export const HEALTH_EVENTS = {
  /** Permission was requested at the Connect Health step. */
  permissionRequested: 'health_permission_requested',
  /** Read access granted. */
  connected: 'health_connected',
  /** Read access denied — the denied path is fully functional (routes via About You). */
  denied: 'health_denied',
  /** Observed permission state on a later check (reconstructs a revoke-in-Settings;
   *  also captures the 'unavailable' state, so a separate event is not needed). */
  permissionState: 'health_permission_state',
  /** A bodyweight sample was ingested silently into the profile (no UI). */
  bodyweightIngested: 'health_bodyweight_ingested',
  /** Ingestion attempted but failed/empty (diagnostics; never blocks the app). */
  ingestionFailed: 'health_ingestion_failed',
} as const;

/** Local Notifications — local only (no APNs). */
export const NOTIFICATION_EVENTS = {
  /** A notification was scheduled (weekly program ready / quarterly report). */
  scheduled: 'notification_scheduled',
  /** Delivered while the app was foregrounded (the only delivery JS can observe). */
  delivered: 'notification_delivered',
  /** The athlete tapped the notification (routed to its destination screen). */
  opened: 'notification_opened',
  /** A new event replaced an undelivered one sharing its stable id (de-dupe). */
  coalesced: 'notification_coalesced',
  /** Scheduled notifications were canceled (sign-out / revoke). */
  canceled: 'notification_canceled',
  /** OS permission was denied, so nothing will be scheduled/delivered. */
  permissionDenied: 'notification_permission_denied',
} as const;

/** Live Activity / Dynamic Island / Lock Screen — read-only mirror lifecycle. */
export const LIVE_ACTIVITY_EVENTS = {
  started: 'live_activity_started',
  ended: 'live_activity_ended',
  /** start/update/end threw on the native host (diagnostics; never blocks). */
  failed: 'live_activity_failed',
} as const;

/** Apple Watch companion — phone is sole authority; watch is a remote terminal. */
export const WATCH_EVENTS = {
  /** A session mirror began being published to the watch. */
  sessionStarted: 'watch_session_started',
  /** Publishing ended (session complete / torn down). */
  sessionEnded: 'watch_session_ended',
  /** Reachability transitioned to reachable for the first time this session. */
  connected: 'watch_connected',
  /** Reachability lost mid-session. */
  disconnected: 'watch_disconnected',
  /** Reachability regained after a disconnect. */
  reconnected: 'watch_reconnected',
  /** A state envelope was pushed to the watch. */
  statePublished: 'watch_state_published',
  /**
   * The OS refused a state envelope — `updateApplicationContext` throws when the session is not
   * activated and on payload-too-large. It used to be swallowed while `statePublished` fired
   * anyway, so a frame that never left the phone was recorded as a success. A wrist stuck on stale
   * state is invisible in the dataset without this.
   */
  statePublishFailed: 'watch_state_publish_failed',
  /** A watch-originated intent was accepted and mapped to a session event.
   *  Carries `latencyMs` (issuedAt→received) = watch completion latency. */
  actionReceived: 'watch_action_received',
  /** A watch-originated intent was rejected (stale, duplicate, or authority
   *  mismatch) — the phone's truth wins. Carries `reason`. */
  actionIgnored: 'watch_action_ignored',
  /** A watch screen was presented to the athlete (`kind`) — reconstructs the
   *  on-wrist journey + dwell time (from seq/ts). */
  screenPresented: 'watch_screen_presented',
  /** A haptic fired on the wrist (`pattern`, `event`) — the felt-progress dataset. */
  haptic: 'watch_haptic',
  /** The Finish Workout? confirmation was shown. */
  finishPrompted: 'watch_finish_prompted',
  /** The Finish confirmation was answered (`answer`: 'yes' | 'no'). */
  finishResolved: 'watch_finish_resolved',
  /** Exercise Busy (equipment-occupied) was applied from the watch. */
  exerciseDeferred: 'watch_exercise_deferred',
  /** A plan snapshot (standalone execution data) was published to the watch. */
  planPublished: 'watch_plan_published',
  /** A watch-local session record arrived for reconciliation (`outcome`:
   *  'applied' | 'duplicate' | 'rejected'). */
  recordReceived: 'watch_record_received',
  /** A run/walk the WRIST recorded, delivered for reconciliation (founder 2026-07-28). */
  cardioRecordReceived: 'watch_cardio_record_received',
  /**
   * The wrist offered a workout it is RUNNING, so the phone can take it over mid-flight — the live
   * handover (`WatchLocalSession`). `outcome`: 'adopted' | 'duplicate' | 'refused' | 'rejected',
   * with `reason` on the last two.
   *
   * This is the one event that says whether "start on the wrist, open the phone, see the workout"
   * actually worked in the field. A handover that silently fails is invisible otherwise: she just
   * sees Today, which is exactly what she saw before it was built.
   */
  localSessionOffered: 'watch_local_session_offered',
} as const;

/** Subscription / Apple Payments — StoreKit purchases behind the billing seam. */
/**
 * ⛔ THE ACTIVATION FUNNEL (2026-08-23, the world-class pass). Until this block, onboarding emitted
 * ONE event (`health_skipped`) — so the single most important question a subscription product has,
 * *where do people give up before their first workout*, was unanswerable from the dataset. One
 * event per step REACHED; the funnel is the differences between counts. No per-field spying — a
 * step is the granularity a fix can act on, and anything finer is surveillance dressed as product.
 */
/**
 * ════ THE HEARTBEAT (2026-09-01, audit finding 2) ════
 *
 * Until this event existed, DAU/WAU and every retention curve — D1, D7, D30 — were not computable
 * from the dataset: "was she alive today" could only be inferred from whatever product event
 * happened to fire, and a day of quietly reading the programme fired none. One event per open,
 * `{ kind: 'cold' | 'warm' }`, and the whole retention layer becomes arithmetic. Cold is a process
 * launch; warm is a return from background. Nothing finer — an open is the granularity retention
 * is measured at, and anything finer is surveillance dressed as product.
 */
export const LIFECYCLE_EVENTS = {
  appOpen: 'app_open',
} as const;

export const FUNNEL_EVENTS = {
  /** She is past sign-in and standing at the fork. */
  startReached: 'funnel_start_reached',
  /** Which door she took: { door: 'build' | 'bring' }. */
  doorChosen: 'funnel_door_chosen',
  aboutYouReached: 'funnel_about_you_reached',
  healthReached: 'funnel_health_reached',
  /**
   * ⛔ THE STEP WHERE SHE SAYS WHO WRITES THE WEEK (founder 2026-08-29) — the builder, in intake
   * chrome. It replaces `bodyMapReached`: the body map left the intake with the same ruling, and a
   * funnel step that outlives its screen counts nobody while reading as "everyone got here".
   */
  yourWeekReached: 'funnel_your_week_reached',
  /**
   * Which of the three doors she took: `{ door: 'engine' | 'blank' | 'template' }`. The second
   * payload in the taxonomy, and it earns its place for the same reason the fork's does — the three
   * are three different products to fix, and a count that cannot tell them apart cannot say which.
   */
  weekDoorChosen: 'funnel_week_door_chosen',
  buildReached: 'funnel_build_reached',
  /*
   * ════ THE LAST MILE (2026-09-01, audit lever 3) ════
   * The funnel used to END at `buildReached` — so the drop across the reveal wait (5.5–23 s), the
   * AI-fallback apology (a measured 7-of-16), and the pricing screen was invisible: the most
   * decision-dense stretch of the whole intake, unmeasured. Two more steps close it; the first
   * session itself is already `session_started`.
   */
  /** The built week is ON SCREEN — the reveal finished, whatever wrote the week. */
  revealSeen: 'funnel_reveal_seen',
  /** ProgramCreated reached: the promise + price are in front of her, one tap from Home. */
  readyReached: 'funnel_ready_reached',
} as const;

/**
 * ⛔ WHAT THE CATALOGUE DID NOT HAVE (founder 2026-08-29): *"שזה לא ישפיע על ההחלטות שלו באיזשהו
 * אופן, כי אם כן נוסיף עוד תרגילים ככל שנצטרך."*
 *
 * The plan-build call gives the model a free hand and one vocabulary. A vocabulary silently bends
 * what gets said — so the model is asked to NAME the lift it wanted and could not find, and that
 * name lands here. It is the only signal in the product that says which exercise to author next,
 * and without it a missing lift is invisible: it shows up as a week slightly worse than the one the
 * model meant to write, on somebody's phone, for ever.
 *
 * ⚠️ ONE EVENT, NOT A FAMILY. There is one question — *what were we asked for and did not have* —
 * and `{ wanted: string[] }` answers it. A second event counting how often it happens would be the
 * same fact derived twice.
 */
export const BUILD_EVENTS = {
  catalogueGap: 'build_catalogue_gap',
  /**
   * ⛔ THE SAME QUESTION, ASKED BY A LOG SHE BROUGHT (2026-09-01, audit M1).
   *
   * `catalogueGap` learns what the MODEL wanted and could not find. The import learns something
   * strictly better, because it is not a model's preference — it is a list of lifts a real athlete
   * has really been performing, twice a week, for two years, in another app. A name the local
   * matcher cannot place is the single most concrete answer there is to *which exercise do we
   * author next*, and until this line it was counted on screen and thrown away.
   *
   * ⚠️ NAMES, BOUNDED, AND NOTHING ELSE. Ten at most and 40 characters each — the point is the
   * VOCABULARY, and a whole file's worth of strings would be her training record leaving the
   * phone through a research event. No loads, no dates, no counts per name.
   */
  importGap: 'import_catalogue_gap',
  /**
   * ⛔ THE ANSWER STOPPED HALFWAY, AND WE TRIED AGAIN (2026-08-30).
   *
   * Measured at one call in five on the production Worker — a stream that dies mid-sentence, which
   * for as long as the `finishReason` field has existed came back as a SUCCESS carrying half a JSON
   * document. Counted because the rate is the only way anyone learns whether it got better or
   * worse, and because it had been invisible: every one of those calls used to be charged to the
   * model as "it wrote something unreadable".
   */
  truncated: 'build_truncated_retry',
} as const;
/*
 * ⚠️ THE FUNNEL'S FAR EDGES ARE NOT HERE, DELIBERATELY. `onboarding_completed`,
 * `session_started` and `session_completed` already exist in the dataset — the funnel JOINS to
 * them; a `funnel_` duplicate of each would be two names for one fact, and the next analyst
 * would trust whichever diverged less embarrassingly.
 */

export const BILLING_EVENTS = {
  /** The paywall was presented (free-trial limit reached, or opened from Profile). */
  paywallViewed: 'paywall_viewed',
  /** The athlete dismissed the paywall without subscribing. */
  paywallDismissed: 'paywall_dismissed',
  /** A purchase flow was initiated for a product. */
  purchaseStarted: 'purchase_started',
  /** A purchase completed and the entitlement is now active. */
  purchaseSucceeded: 'purchase_succeeded',
  /** The athlete cancelled the StoreKit sheet. */
  purchaseCancelled: 'purchase_cancelled',
  /** The purchase flow failed (store error, network, validation). */
  purchaseFailed: 'purchase_failed',
  /** Restore purchases was initiated. */
  restoreStarted: 'restore_started',
  /** Restore found an active entitlement and reinstated it. */
  restoreSucceeded: 'restore_succeeded',
  /** Restore found nothing to restore. */
  restoreEmpty: 'restore_empty',
  /** The cached/effective entitlement state changed (refreshed from the store). */
  entitlementChanged: 'entitlement_changed',
  /** ⚠️ A production iOS build resolved NO StoreKit module (audit finding 5) — the fail-closed
   *  guard is live and nobody can buy anything. Must never fire on a healthy fleet; alert on any. */
  storeUnavailable: 'billing_store_unavailable',
} as const;

export type HealthEvent = (typeof HEALTH_EVENTS)[keyof typeof HEALTH_EVENTS];
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];
export type LiveActivityEvent = (typeof LIVE_ACTIVITY_EVENTS)[keyof typeof LIVE_ACTIVITY_EVENTS];
export type WatchEvent = (typeof WATCH_EVENTS)[keyof typeof WATCH_EVENTS];
export type BillingEvent = (typeof BILLING_EVENTS)[keyof typeof BILLING_EVENTS];
