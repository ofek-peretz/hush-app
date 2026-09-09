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
export let FREE_SESSION_LIMIT = 14;

/**
 * ════ THE TRIAL LENGTH LEFT THE BINARY (2026-09-01, the audit's finding 03) ═════════════════════
 *
 * Fourteen stays the DEFAULT — the founder-ratified arc, the number every test asserts, and what
 * every build does with no remote word. What changed is only who may say otherwise: the remote
 * config (`platform/remoteConfig`) may retune it at boot, because a trial length that costs a
 * binary and an Apple review per experiment is a trial length nobody will ever experiment on.
 *
 * ⚠️ A LIVE BINDING, NOT A GETTER, on purpose: every one of the ~12 call sites — the gate, the
 * paywall, Home's counter, the Ready screen's promise — reads the SAME binding, so the promise and
 * the gate can never drift apart, exactly as `ProgramCreated`'s note demands. Babel's ESM→CJS
 * lowering reads the export at each use, so an applied override reaches them all.
 *
 * ⚠️ CLAMPED HARD. A config server that says 0 (or 10,000) is a config server that is wrong, and
 * the clamp is what keeps a bad deploy from gating the first workout or ungating the product.
 */
export function applyTrialLimitOverride(n: unknown): void {
  if (typeof n !== 'number' || !Number.isInteger(n)) return;
  FREE_SESSION_LIMIT = Math.max(1, Math.min(60, n));
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHEN THE TRIAL IS WORTH SAYING OUT LOUD ON THE SCREEN SHE OPENS EVERY DAY.
 *
 * The counter sat under Home's one act, so the last thing she read before training — every session,
 * from the first — was how few she had left. That is a countdown to a paywall printed on the daily
 * screen of a product whose whole argument is that it is a coach rather than a funnel, and no app
 * this one is measured against does it: the trial state lives in the account, and the daily screen
 * is for training.
 *
 * ⚠️ IT IS NOT DELETED, BECAUSE RUNNING OUT WITHOUT WARNING IS WORSE THAN THE COUNTDOWN. It becomes
 * NEWS — the same rule `theLoadCarriesItsOwnNews` already holds for a load: say nothing until there
 * is something to say. Inside the last three she is told, plainly, on the screen she is on. Before
 * that the fact is a tap away in You, where the membership row states it with a bar.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const TRIAL_NEWS_AT = 3;

/**
 * ════ THE TRIAL'S TIME CAP — ARMED AT THIRTY DAYS (2026-09-09, the formula report) ══════════════
 *
 * "14 completed sessions" with no clock means an athlete training once a week gets fourteen FREE
 * WEEKS. The cap closes that — sessions OR days, whichever runs out first. It was built on
 * 2026-09-01 and shipped DISARMED (`null`) pending a founder word; the report armed it: thirty
 * days is a month of honest trying at any cadence, and every promise on the Ready screen now
 * says both halves ("14 workouts, within 30 days"). Remote config (`trialMaxDays`) can still move
 * it, and `0` disarms it — a KV word, never a silent code change.
 */
export const TRIAL_MAX_DAYS_DEFAULT = 30;
export let TRIAL_MAX_DAYS: number | null = TRIAL_MAX_DAYS_DEFAULT;

/** Remote-config apply (clamped 7..365; `0` disarms; garbage restores the default). */
export function applyTrialMaxDaysOverride(n: unknown): void {
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    TRIAL_MAX_DAYS = TRIAL_MAX_DAYS_DEFAULT;
    return;
  }
  if (n === 0) {
    TRIAL_MAX_DAYS = null;
    return;
  }
  TRIAL_MAX_DAYS = Math.max(7, Math.min(365, n));
}

/** Has the (armed) time cap run out? Pure; false while the cap is disarmed or the start unknown. */
export function trialTimeSpent(memberSince: string | undefined, nowMs: number): boolean {
  if (TRIAL_MAX_DAYS == null || !memberSince) return false;
  const start = Date.parse(memberSince);
  if (!Number.isFinite(start)) return false;
  return nowMs - start >= TRIAL_MAX_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * ════ AN EXPIRED CACHE STOPS SAYING "ACTIVE" (2026-09-01, audit finding 5) ════
 *
 * The cached entitlement carried `expiresAt` and NOTHING ever compared it to the clock — it was
 * formatted for display and read nowhere else, so a device that stopped reaching StoreKit after a
 * lapse trained free indefinitely on a stale `active: true`. This normalises an entitlement at
 * the moment it enters app state (both reducer entry points), so every gate downstream inherits
 * the truth without learning about clocks.
 *
 * THE GRACE IS THREE DAYS, and it is for the athlete, not for us: a renewal happens on Apple's
 * servers, and a phone that is offline over the boundary cannot see it. Three days covers a
 * weekend off the grid without letting "offline" become a plan. StoreKit remains the authority —
 * the next successful reconcile overwrites whatever this decided.
 */
const EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export function entitlementNow(e: Entitlement, nowMs: number = Date.now()): Entitlement {
  if (!e.active || !e.expiresAt) return e;
  const ends = Date.parse(e.expiresAt);
  if (!Number.isFinite(ends)) return e;
  if (nowMs <= ends + EXPIRY_GRACE_MS) return e;
  return { ...e, active: false };
}

/**
 * The launch gate: is the athlete blocked from STARTING another session?
 * True only once the free sessions are spent AND no purchase is active. An active
 * entitlement (subscription or its intro trial) always unlocks.
 *
 * `memberSince`/`nowMs` feed the (default-disarmed) time cap above — callers that do not pass
 * them get the sessions-only gate they always had.
 */
export function isTrainingGated(
  completedSessions: number,
  entitled: boolean,
  memberSince?: string,
  nowMs: number = Date.now(),
): boolean {
  if (entitled) return false;
  return completedSessions >= FREE_SESSION_LIMIT || trialTimeSpent(memberSince, nowMs);
}

/** Free sessions still available before the paywall (0 once spent). */
export function freeSessionsRemaining(completedSessions: number): number {
  return Math.max(0, FREE_SESSION_LIMIT - completedSessions);
}
