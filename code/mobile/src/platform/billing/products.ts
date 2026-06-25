/**
 * Subscription product catalog (StoreKit / App Store Connect).
 *
 * Two auto-renewing products (founder-ratified 2026-06-24): a monthly and an
 * annual plan. PRICES ARE NOT HARDCODED — they are configured in App Store
 * Connect and fetched, localized, at runtime via the billing seam. This module
 * only declares the stable product identifiers and their billing period, which is
 * all the rest of the app needs to reason about plans.
 */

export const PRODUCT_IDS = {
  monthly: 'hush.pro.monthly',
  annual: 'hush.pro.annual',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export type BillingPeriod = 'monthly' | 'annual';

/** Stable period for each product (used for layout + the "best value" badge). */
export const PRODUCT_PERIOD: Record<ProductId, BillingPeriod> = {
  [PRODUCT_IDS.monthly]: 'monthly',
  [PRODUCT_IDS.annual]: 'annual',
};

/** Display order on the paywall — annual first (the better-value plan leads). */
export const PRODUCT_ORDER: ProductId[] = [PRODUCT_IDS.annual, PRODUCT_IDS.monthly];

/**
 * A purchasable plan as resolved from the store. `priceLabel` is the store's
 * own localized, currency-correct string (e.g. "$9.99", "£89.99/yr") — never
 * assembled by us. `introTrialLabel` reflects a StoreKit introductory free-trial
 * offer, if the product carries one (e.g. "7 days"), else null.
 */
export interface SubscriptionProduct {
  id: ProductId;
  period: BillingPeriod;
  priceLabel: string;
  introTrialLabel: string | null;
}

export function isProductId(value: string): value is ProductId {
  return value === PRODUCT_IDS.monthly || value === PRODUCT_IDS.annual;
}
