/**
 * Research-event taxonomy for the Apple native surfaces.
 *
 * This is the canonical list of every interaction worth learning from across the
 * four native surfaces (HealthKit, Local Notifications, Live Activity / Dynamic
 * Island, Apple Watch). Each constant is the `type` passed to `track()` — so
 * every one of these flows through the SAME durable, append-only telemetry
 * pipeline (platform/telemetry.ts) to the backend `athlete_event` research
 * dataset. There is no parallel event store: telemetry IS the dataset, which
 * keeps a single source of truth and means no interaction is lost (events are
 * persisted before they ship and survive relaunch).
 *
 * Why a catalog at all: it makes the learnable surface explicit and greppable,
 * and lets new native code reference a name instead of re-typing a string. The
 * envelope (event_id, seq, client_monotonic, device_id, ts) is added by
 * track()/deviceContext — see telemetry.ts — so each event is ordered and
 * reconstructable on its own.
 */

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
} as const;

/** Subscription / Apple Payments — StoreKit purchases behind the billing seam. */
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
} as const;

export type HealthEvent = (typeof HEALTH_EVENTS)[keyof typeof HEALTH_EVENTS];
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];
export type LiveActivityEvent = (typeof LIVE_ACTIVITY_EVENTS)[keyof typeof LIVE_ACTIVITY_EVENTS];
export type WatchEvent = (typeof WATCH_EVENTS)[keyof typeof WATCH_EVENTS];
export type BillingEvent = (typeof BILLING_EVENTS)[keyof typeof BILLING_EVENTS];
