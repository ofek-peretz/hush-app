/**
 * billingStoreKit — the REAL StoreKit 2 implementation of the `Billing` seam, via `expo-iap`
 * (the maintained successor of react-native-iap; StoreKit 2 under the hood, so transactions
 * are signed and verified by Apple on-device — no receipt server needed, exactly the no-server
 * posture the rest of the product holds).
 *
 * SELECTION CONTRACT (billing.ts): this implementation is chosen only when the native `ExpoIap`
 * module is actually present — an iOS build made after 2026-08-24. Everywhere else (jest, web,
 * Expo Go, and any OLDER installed build) `requireOptionalNativeModule('ExpoIap')` resolves null
 * and the local stub keeps the whole flow alive, the same graceful degradation the cloud and
 * widget seams use. Nothing here may throw at import time.
 *
 * Error posture, per the `Billing` contract:
 *   - `purchase` / `restore` NEVER throw — a store failure resolves `failed`, a user cancel
 *     resolves `cancelled`, Ask-to-Buy resolves `pending`.
 *   - `getProducts` resolves `[]` when the store is unreachable / products are not configured.
 *   - `getEntitlement` DOES throw on a store failure — deliberately. The appStore catches and
 *     keeps the cached entitlement, so a network blip can never read as "her subscription ended".
 *     (StoreKit 2 answers current entitlements from its local transaction cache, so offline with
 *     an intact cache still resolves honestly.)
 */

//

import { Platform } from 'react-native';
import { tg } from '@/i18n';
import { NO_ENTITLEMENT, type Entitlement } from '@/domain/entitlement';
import {
  PRODUCT_ORDER,
  PRODUCT_PERIOD,
  isProductId,
  type SubscriptionProduct,
} from './products';
import type { Billing, PurchaseResult } from './billing';
import type * as ExpoIap from 'expo-iap';
import type { ProductSubscription, Purchase } from 'expo-iap';

type Iap = typeof ExpoIap;

/* ============================================================================
 * Native availability + lazy module load. `iapModule` is resolved once; the
 * expo-iap JS is only ever required AFTER the native module is known to exist,
 * so an old build / jest / web never even parses it.
 * ==========================================================================*/

let resolved: Iap | null | undefined; // undefined = not probed yet

function loadIap(): Iap | null {
  if (resolved !== undefined) return resolved;
  resolved = null;
  if (Platform.OS === 'ios') {
    try {
      const core = require('expo-modules-core') as {
        requireOptionalNativeModule?: (name: string) => unknown;
      };
      if (core.requireOptionalNativeModule?.('ExpoIap') != null) {
        resolved = require('expo-iap') as Iap;
      }
    } catch {
      resolved = null;
    }
  }
  return resolved;
}

/** True when the native StoreKit bridge exists in THIS binary (billing.ts keys on this). */
export function storeKitAvailable(): boolean {
  return loadIap() != null;
}

/* ============================================================================
 * Connection — opened once, kept open for the app's lifetime. A persistent
 * updated-listener finishes any transaction that arrives OUTSIDE an in-flight
 * purchase (renewals, Ask-to-Buy approvals landing later), so nothing piles up
 * unacknowledged in the queue.
 * ==========================================================================*/

let connection: Promise<boolean> | null = null;
let purchaseInFlight = false;

/*
 * ════ THE APPROVAL THAT USED TO UNLOCK NOTHING (2026-09-01, audit finding 5) ════
 *
 * When an Ask-to-Buy approval (or a renewal) lands OUTSIDE an in-flight purchase, the persistent
 * listener below finishes the transaction — and until today did nothing else, so a parent-approved
 * teen stayed locked out until the next cold boot's reconcile. The store registers a callback here
 * (appStore → refreshEntitlement) and the listener rings it the moment such a transaction is
 * finished; the entitlement re-reads and the app unlocks while she is still holding it.
 */
let entitlementArrived: (() => void) | null = null;
export function onEntitlementArrived(cb: () => void): void {
  entitlementArrived = cb;
}

function connect(iap: Iap): Promise<boolean> {
  if (!connection) {
    connection = (async () => {
      try {
        const ok = await iap.initConnection();
        if (ok) {
          iap.purchaseUpdatedListener((purchase) => {
            if (purchaseInFlight) return; // the in-flight purchase() owns this one
            if (purchase.purchaseState !== 'purchased') return;
            void iap
              .finishTransaction({ purchase })
              .catch(() => {
                /* re-delivered on next launch; finishing is idempotent */
              })
              .finally(() => {
                entitlementArrived?.(); // see the seam above — the unlock must not wait for a boot
              });
          });
        } else {
          connection = null; // a refused open may be retried on the next call, same as a throw
        }
        return ok;
      } catch {
        connection = null; // a failed open may be retried on the next call
        return false;
      }
    })();
  }
  return connection;
}

/* ============================================================================
 * Mapping store shapes → the seam's domain shapes.
 * ==========================================================================*/

function entitlementFrom(productId: string, expiresAtMs: number | null | undefined): Entitlement {
  return {
    active: true,
    productId,
    source: 'subscription',
    expiresAt: typeof expiresAtMs === 'number' && expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null,
  };
}

/** The intro free-trial length as a localized phrase ("7 days" / "שבוע"), or null when the
 *  product carries no free-trial offer. Built from StoreKit's structured period — the store has
 *  no localized string for the period itself. */
function introTrialLabel(p: ProductSubscription): string | null {
  if (p.platform !== 'ios') return null;
  if (p.introductoryPricePaymentModeIOS !== 'free-trial') return null;
  const unit = p.introductoryPriceSubscriptionPeriodIOS;
  if (!unit || unit === 'empty') return null;
  const count = Math.max(1, Number(p.introductoryPriceNumberOfPeriodsIOS ?? '1') || 1);
  return tg(`paywall.trialPeriod.${unit}`, { count });
}

async function currentEntitlement(iap: Iap): Promise<Entitlement> {
  // Throws on store failure — see the header's error posture.
  const subs = await iap.getActiveSubscriptions([...PRODUCT_ORDER]);
  const live = subs.find((s) => s.isActive && isProductId(s.productId));
  if (!live) return NO_ENTITLEMENT;
  return entitlementFrom(live.productId, live.expirationDateIOS);
}

/** Post-purchase entitlement: ask StoreKit for the authoritative state; if that read fails right
 *  after a successful purchase, derive it from the purchase itself rather than failing the unlock. */
async function entitlementAfterPurchase(iap: Iap, purchase: Purchase): Promise<Entitlement> {
  try {
    const ent = await currentEntitlement(iap);
    if (ent.active) return ent;
  } catch {
    /* fall through to the purchase-derived entitlement */
  }
  return entitlementFrom(purchase.productId, null);
}

/* ============================================================================
 * The implementation.
 * ==========================================================================*/

export const billingStoreKit: Billing = {
  async getProducts(): Promise<SubscriptionProduct[]> {
    const iap = loadIap();
    if (!iap || !(await connect(iap))) return [];
    try {
      const fetched = await iap.fetchProducts({ skus: [...PRODUCT_ORDER], type: 'subs' });
      const list = (fetched ?? []) as ProductSubscription[];
      // Preserve the paywall's display order; a product missing in App Store Connect is simply absent.
      return PRODUCT_ORDER.flatMap((id) => {
        const p = list.find((x) => x.id === id);
        if (!p) return [];
        return [{ id, period: PRODUCT_PERIOD[id], priceLabel: p.displayPrice, introTrialLabel: introTrialLabel(p) }];
      });
    } catch {
      return [];
    }
  },

  async getEntitlement(): Promise<Entitlement> {
    const iap = loadIap();
    if (!iap) return NO_ENTITLEMENT;
    if (!(await connect(iap))) throw new Error('store_unavailable');
    return currentEntitlement(iap);
  },

  async purchase(productId): Promise<PurchaseResult> {
    const iap = loadIap();
    if (!iap || !(await connect(iap))) return { status: 'failed', entitlement: NO_ENTITLEMENT };

    purchaseInFlight = true;
    try {
      return await new Promise<PurchaseResult>((resolve) => {
        let settled = false;
        const settle = (r: PurchaseResult) => {
          if (settled) return;
          settled = true;
          updated.remove();
          failed.remove();
          resolve(r);
        };

        const updated = iap.purchaseUpdatedListener((purchase) => {
          void (async () => {
            if (purchase.purchaseState === 'purchased') {
              try {
                await iap.finishTransaction({ purchase });
              } catch {
                /* unfinished transactions are re-delivered on next launch */
              }
              settle({ status: 'purchased', entitlement: await entitlementAfterPurchase(iap, purchase) });
            } else {
              // Ask to Buy / deferred — the approval will arrive via the persistent listener.
              settle({ status: 'pending', entitlement: NO_ENTITLEMENT });
            }
          })();
        });

        const failed = iap.purchaseErrorListener((e) => {
          settle({
            status: e.code === 'user-cancelled' ? 'cancelled' : 'failed',
            entitlement: NO_ENTITLEMENT,
          });
        });

        iap
          .requestPurchase({ request: { apple: { sku: productId } }, type: 'subs' })
          .catch((e: unknown) => {
            /*
             * The error listener normally carries the outcome — but a rejection with no listener
             * event would leave the paywall on "One moment" for ever, and a hung purchase is worse
             * than a mislabelled one. The listener gets one tick to speak first (settle() is
             * idempotent, so whichever answer lands first wins).
             */
            const code = (e as { code?: string } | null)?.code;
            setTimeout(() => {
              settle({ status: code === 'user-cancelled' ? 'cancelled' : 'failed', entitlement: NO_ENTITLEMENT });
            }, 250);
          });
      });
    } finally {
      purchaseInFlight = false;
    }
  },

  async restore(): Promise<PurchaseResult> {
    const iap = loadIap();
    if (!iap || !(await connect(iap))) return { status: 'failed', entitlement: NO_ENTITLEMENT };
    try {
      await iap.restorePurchases();
    } catch {
      /* a failed sync still leaves the local transaction cache readable below */
    }
    try {
      const entitlement = await currentEntitlement(iap);
      return entitlement.active
        ? { status: 'restored', entitlement }
        : { status: 'failed', entitlement: NO_ENTITLEMENT };
    } catch {
      return { status: 'failed', entitlement: NO_ENTITLEMENT };
    }
  },
};
