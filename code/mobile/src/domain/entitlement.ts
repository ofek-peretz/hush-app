/**
 * Entitlement + the free-trial gate (Launch Roadmap: Subscription + Apple Payments).
 *
 * Gating model (founder-ratified 2026-06-24): the app is fully usable for a free
 * trial measured in COMPLETED SESSIONS, then a paywall blocks starting further
 * sessions until a Hush membership is active. The trial length is the full
 * calibration arc through the Portrait unlock — the athlete experiences the whole
 * "aha" (calibration → Portrait) before any payment is asked.
 *
 * This module is PURE (no platform deps) so the gate is unit-tested in isolation
 * and shared between the app store, Home (start gate), and Profile (status row).
 * The Entitlement TYPE lives here too — it is the contract the StoreKit seam
 * (platform/billing) resolves and the app store caches for instant offline gating.
 */
// @ts-nocheck

// 


/** Where an active entitlement comes from. `trial` = a StoreKit intro free-trial
 *  period (still a paid subscription, just in its grace window); `subscription` =
 *  a normally-billed period; `none` = no active entitlement. */
export type EntitlementSource = 'none' | 'trial' | 'subscription';

export interface Entitlement {
  /** Whether training is unlocked by a purchase (subscription or its intro trial). */
  active: boolean;
  /** The product backing the entitlement, or null when inactive. */
  productId: string | null;
  source: EntitlementSource;
  /** ISO expiry of the current period, or null when unknown (stub) / inactive. */
  expiresAt: string | null;
}

export const NO_ENTITLEMENT: Entitlement = {
  active: false,
  productId: null,
  source: 'none',
  expiresAt: null,
};

/** Free completed sessions before the paywall (founder 2026-07-24: 14, the v7 "14
 *  workouts free" headline on the Ready screen). The calibration arc still ends at the
 *  Portrait unlock; the trial now runs the full fourteen the design promises — I LEARN
 *  YOU (1–4) then I KNOW YOU (5–14) — before the paywall. Kept as its own constant so the
 *  trial length can be tuned without moving the calibration boundary. */
export const FREE_SESSION_LIMIT = 14;

/**
 * The launch gate: is the athlete blocked from STARTING another session?
 * True only once the free sessions are spent AND no purchase is active. An active
 * entitlement (subscription or its intro trial) always unlocks.
 */
export function isTrainingGated(completedSessions: number, entitled: boolean): boolean {
  if (entitled) return false;
  return completedSessions >= FREE_SESSION_LIMIT;
}

/** Free sessions still available before the paywall (0 once spent). */
export function freeSessionsRemaining(completedSessions: number): number {
  return Math.max(0, FREE_SESSION_LIMIT - completedSessions);
}
