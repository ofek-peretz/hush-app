/**
 * Billing seam — Subscription + Apple Payments (Launch Roadmap item 1).
 *
 * NATIVE STATUS: WIRED (2026-08-24). `billingStoreKit` (./storekit, via `expo-iap` /
 * StoreKit 2) is the live implementation on any iOS build that carries the native
 * `ExpoIap` module. The LOCAL STUB below remains the implementation everywhere the
 * native module is absent — jest, web, Expo Go, and builds older than 2026-08-24 —
 * so the whole flow (paywall → choose plan → purchase → entitlement unlock →
 * Profile status → restore) still runs without Apple infrastructure. The selection
 * is a runtime probe of the binary, never a guess.
 *
 * Two auto-renewable products must exist in App Store Connect under the ids in
 * ./products (`hush.pro.month`, `hush.pro.annual`) for the paywall to show real
 * plans; an empty store answer renders the paywall's store-unavailable state.
 *
 * Entitlement is the source of truth StoreKit owns (it survives reinstall /
 * device-change via the Apple ID). The stub persists a simulated entitlement to
 * its own AsyncStorage namespace so a "purchase" survives relaunch during QA, and
 * so it is NOT wiped by an app-account sign-out / delete (an Apple subscription
 * outlives the local Hush account, exactly as in production).
 */

// 

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { track } from '@/platform/telemetry';
import { BILLING_EVENTS } from '@/platform/events';
import { tg } from '@/i18n';
import {
  PRODUCT_IDS,
  PRODUCT_ORDER,
  PRODUCT_PERIOD,
  PRO_TRIAL_DAYS,
  type CoachPlanProduct,
  type CoachProductId,
  type ProductId,
  type SubscriptionProduct,
} from './products';
import { NO_COACH_PLAN, NO_ENTITLEMENT, type CoachPlan, type Entitlement } from '@/domain/entitlement';
// storekit.ts imports only TYPES from this module, so the cycle is erased at runtime.
import { billingStoreKit, storeKitAvailable } from './storekit';

export type PurchaseStatus = 'purchased' | 'restored' | 'cancelled' | 'pending' | 'failed';

export interface PurchaseResult {
  status: PurchaseStatus;
  /** The entitlement AFTER the attempt (unchanged on cancel/fail). */
  entitlement: Entitlement;
}

/** The outcome of a COACH tier purchase — the coach plan after the attempt (the coach track). */
export interface CoachPurchaseResult {
  status: PurchaseStatus;
  plan: CoachPlan;
  /** Apple's `originalTransactionId` for the purchase, when StoreKit reported one. This is the
   *  ONLY thing that can raise a seat limit, and it raises it on the WORKER after the worker has
   *  checked it with Apple — see `coachTrackClient.coachClaimPlan`. Null off-device. */
  transactionId: string | null;
}

export interface Billing {
  /** The purchasable plans, with the store's localized prices. Empty if the store
   *  is unavailable / no products are configured. */
  getProducts(): Promise<SubscriptionProduct[]>;
  /** The current entitlement (active subscription / intro trial, or none). */
  getEntitlement(): Promise<Entitlement>;
  /** Begin the purchase flow for a product. Resolves with the outcome + the
   *  resulting entitlement. Never throws — a store/validation error resolves as
   *  `failed`, a user cancel as `cancelled`. */
  purchase(productId: ProductId): Promise<PurchaseResult>;
  /** Restore prior purchases (re-reads the Apple ID's entitlements). Resolves
   *  `restored` when an active entitlement is found, else `failed`. */
  restore(): Promise<PurchaseResult>;

  /* ── the coach track's tiers (ruling 1 — the coach pays) ──────────────────────────────────────
   * Deliberately three METHODS OF THEIR OWN rather than a widened `ProductId`: a coach tier is not
   * an athlete's plan, and the moment the two share a call the Pro entitlement can be set by a
   * coach transaction. `withCoachPlan` (domain/entitlement) is the ONE place a coach's plan becomes
   * his own Pro, and it is an overlay a law can read. */

  /** The purchasable coach tiers, with the store's localized prices. `[]` when the products are
   *  not configured in App Store Connect — which is TODAY (see ./products). */
  getCoachPlans(): Promise<CoachPlanProduct[]>;
  /** The coach subscription this Apple ID holds, or `NO_COACH_PLAN`. Never throws. */
  getCoachPlan(): Promise<CoachPlan>;
  /** Begin the purchase flow for a coach tier. Never throws; same status vocabulary as `purchase`. */
  purchaseCoachPlan(productId: CoachProductId): Promise<CoachPurchaseResult>;
}

/* ============================================================================
 * Local stub implementation.
 * ==========================================================================*/

const STUB_KEY = 'hush.billing.stub.entitlement';

/** Placeholder prices for the stub ONLY — the real StoreKit impl returns the
 *  store's localized strings. Marked clearly so they are never mistaken for live
 *  pricing (which lives in App Store Connect). */
const STUB_PRICE: Record<ProductId, string> = {
  /* The ratified tiers (founder 2026-09-28): $14.99 / $79.99 — ₪49.90 / ₪249.90 in Israel. */
  [PRODUCT_IDS.monthly]: '$14.99',
  [PRODUCT_IDS.annual]: '$79.99',
};

async function readStubEntitlement(): Promise<Entitlement> {
  try {
    const raw = await AsyncStorage.getItem(STUB_KEY);
    if (!raw) return NO_ENTITLEMENT;
    const parsed = JSON.parse(raw) as Entitlement;
    return parsed.active ? parsed : NO_ENTITLEMENT;
  } catch {
    return NO_ENTITLEMENT;
  }
}

async function writeStubEntitlement(e: Entitlement): Promise<void> {
  try {
    await AsyncStorage.setItem(STUB_KEY, JSON.stringify(e));
  } catch {
    /* best-effort — the in-memory result still unlocks this session */
  }
}

export const billingStub: Billing = {
  async getProducts() {
    return PRODUCT_ORDER.map((id) => ({
      id,
      period: PRODUCT_PERIOD[id],
      priceLabel: STUB_PRICE[id],
      // The store's 14-day free trial, simulated — App Store Connect carries it on both plans.
      introTrialLabel: tg('paywall.trialPeriod.day', { count: PRO_TRIAL_DAYS }),
      introTrialDays: PRO_TRIAL_DAYS,
    }));
  },

  async getEntitlement() {
    return readStubEntitlement();
  },

  async purchase(productId) {
    // Simulate a successful StoreKit purchase so QA can exercise the unlock path.
    // The stub starts the store's free trial, as a first purchase in App Store Connect would.
    const entitlement: Entitlement = {
      active: true,
      productId,
      source: 'trial',
      expiresAt: new Date(Date.now() + PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
    await writeStubEntitlement(entitlement);
    return { status: 'purchased', entitlement };
  },

  async restore() {
    const entitlement = await readStubEntitlement();
    return entitlement.active
      ? { status: 'restored', entitlement }
      : { status: 'failed', entitlement: NO_ENTITLEMENT };
  },

  /*
   * ⛔ THE STUB SIMULATES APP STORE CONNECT, AND APP STORE CONNECT HAS NO COACH PRODUCTS.
   *
   * The Pro stub above prints placeholder prices because `hush.pro.month` and `hush.pro.annual` are
   * REAL — the stub is standing in for a store that would answer. The three coach ids are not
   * created yet, so a stub that answered them with `$19.99` would be the one thing this product
   * never does: invent a price. `[]` here is what an honest store answer looks like today, on
   * every surface the stub serves (jest, web, Expo Go) — and it is what the screen draws its
   * "not open yet" line from. The day the founder creates them, this becomes a real fetch and
   * NOTHING ELSE in the app changes.
   */
  async getCoachPlans() {
    return [];
  },

  async getCoachPlan() {
    return NO_COACH_PLAN;
  },

  async purchaseCoachPlan() {
    return { status: 'failed' as const, plan: NO_COACH_PLAN, transactionId: null };
  },
};

/*
 * ════ A PRODUCTION iOS BUILD WITHOUT STOREKIT FAILS CLOSED (2026-09-01, audit finding 5) ════
 *
 * The stub exists for jest, web and Expo Go — and until today it was ALSO what a shipped iOS
 * binary fell back to if the native `ExpoIap` module failed to resolve. The stub's `purchase()`
 * returns `purchased` unconditionally and persists a permanent entitlement: one silent packaging
 * regression and the entire product is free, with nothing anywhere to notice.
 *
 * The guard refuses instead. `getEntitlement` THROWS — deliberately, because the boot reconcile's
 * catch keeps the cached value on a throw, so a paying athlete on a broken build keeps her access
 * while a stranger gains nothing. Purchases and restores fail plainly, the paywall renders its
 * store-unavailable state, and the event below is the alarm the regression never had.
 */
const brokenProductionBuild = !__DEV__ && Platform.OS === 'ios' && !storeKitAvailable();

const billingGuard: Billing = {
  async getProducts() {
    return [];
  },
  async getEntitlement(): Promise<Entitlement> {
    throw new Error('storekit_missing_in_production');
  },
  async purchase() {
    return { status: 'failed' as const, entitlement: NO_ENTITLEMENT };
  },
  async restore() {
    return { status: 'failed' as const, entitlement: NO_ENTITLEMENT };
  },
  async getCoachPlans() {
    return [];
  },
  async getCoachPlan() {
    return NO_COACH_PLAN;
  },
  async purchaseCoachPlan() {
    return { status: 'failed' as const, plan: NO_COACH_PLAN, transactionId: null };
  },
};

if (brokenProductionBuild) {
  // Loud, once, at module load — the one event that must never fire on a healthy fleet.
  void track(BILLING_EVENTS.storeUnavailable, { reason: 'native_module_missing_in_production' });
}

/**
 * Active billing implementation: real StoreKit when this binary carries the native
 * module; a FAIL-CLOSED guard on a production iOS build that lost it; the local
 * stub everywhere else (jest, web, Expo Go). Every call is safe in any
 * environment — the probe itself never throws.
 */
export const billing: Billing = storeKitAvailable()
  ? billingStoreKit
  : brokenProductionBuild
    ? billingGuard
    : billingStub;

/** Telemetry helper — record an entitlement transition once, fire-and-forget. */
export function trackEntitlementChange(prev: Entitlement, next: Entitlement): void {
  if (prev.active === next.active && prev.productId === next.productId && prev.source === next.source) return;
  void track(BILLING_EVENTS.entitlementChanged, {
    active: next.active,
    productId: next.productId,
    source: next.source,
  });
}
