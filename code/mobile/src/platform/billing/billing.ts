/**
 * Billing seam — Subscription + Apple Payments (Launch Roadmap item 1).
 *
 * NATIVE STATUS: real StoreKit purchasing requires a native In-App Purchase
 * module (e.g. `react-native-iap` / Expo IAP) plus the auto-renewable products
 * configured in App Store Connect — neither of which is wired into this build yet.
 * Until they land this is a LOCAL STUB (mirroring platform/auth + platform/
 * notifications): it resolves entirely on-device so the whole flow — paywall →
 * choose plan → "purchase" → entitlement unlock → Profile status → restore —
 * runs in dev / web / TestFlight QA without any Apple infrastructure.
 *
 * The seam is the contract. When StoreKit is wired, replace `billingStub` with a
 * `billingStoreKit` that implements the SAME `Billing` interface (products from
 * `getProducts`, current entitlements from `getEntitlement`, a real purchase /
 * restore) and flip the `billing` export. Nothing else in the app changes —
 * callers only ever see `Billing`.
 *
 * Entitlement is the source of truth StoreKit owns (it survives reinstall /
 * device-change via the Apple ID). The stub persists a simulated entitlement to
 * its own AsyncStorage namespace so a "purchase" survives relaunch during QA, and
 * so it is NOT wiped by an app-account sign-out / delete (an Apple subscription
 * outlives the local Hush account, exactly as in production).
 */
// @ts-nocheck

// 

import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '@/platform/telemetry';
import { BILLING_EVENTS } from '@/platform/events';
import {
  PRODUCT_IDS,
  PRODUCT_ORDER,
  PRODUCT_PERIOD,
  type ProductId,
  type SubscriptionProduct,
} from './products';
import { NO_ENTITLEMENT, type Entitlement } from '@/domain/entitlement';

export type PurchaseStatus = 'purchased' | 'restored' | 'cancelled' | 'pending' | 'failed';

export interface PurchaseResult {
  status: PurchaseStatus;
  /** The entitlement AFTER the attempt (unchanged on cancel/fail). */
  entitlement: Entitlement;
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
}

/* ============================================================================
 * Local stub implementation.
 * ==========================================================================*/

const STUB_KEY = 'hush.billing.stub.entitlement';

/** Placeholder prices for the stub ONLY — the real StoreKit impl returns the
 *  store's localized strings. Marked clearly so they are never mistaken for live
 *  pricing (which lives in App Store Connect). */
const STUB_PRICE: Record<ProductId, string> = {
  [PRODUCT_IDS.monthly]: '$9.99',
  [PRODUCT_IDS.annual]: '$59.99',
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
      introTrialLabel: null,
    }));
  },

  async getEntitlement() {
    return readStubEntitlement();
  },

  async purchase(productId) {
    // Simulate a successful StoreKit purchase so QA can exercise the unlock path.
    const entitlement: Entitlement = {
      active: true,
      productId,
      source: 'subscription',
      expiresAt: null, // unknown in the stub; the real impl carries the period end
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
};

/**
 * Active billing implementation. Local stub until StoreKit is wired (see header).
 * Every call is safe in any environment (no native module required).
 */
export const billing: Billing = billingStub;

/** Telemetry helper — record an entitlement transition once, fire-and-forget. */
export function trackEntitlementChange(prev: Entitlement, next: Entitlement): void {
  if (prev.active === next.active && prev.productId === next.productId && prev.source === next.source) return;
  void track(BILLING_EVENTS.entitlementChanged, {
    active: next.active,
    productId: next.productId,
    source: next.source,
  });
}
