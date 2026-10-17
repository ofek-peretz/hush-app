/**
 * Subscription product catalog (StoreKit / App Store Connect).
 *
 * Two auto-renewing products (founder-ratified 2026-06-24): a monthly and an
 * annual plan. PRICES ARE NOT HARDCODED — they are configured in App Store
 * Connect and fetched, localized, at runtime via the billing seam. This module
 * only declares the stable product identifiers and their billing period, which is
 * all the rest of the app needs to reason about plans.
 */

// 


export const PRODUCT_IDS = {
  /*
   * ⚠️ `hush.pro.month`, NOT `.monthly` (2026-08-26). The first monthly product in App Store
   * Connect was created with a mis-clicked price tier and deleted — and ASC burns a deleted
   * product id FOREVER, so `.monthly` can never be registered again. The live products:
   *   hush.pro.month  · Apple ID 6805347288 · $9.99 / 1 month
   *   hush.pro.annual · Apple ID 6805340117 · $59.99 / 1 year
   * Both in subscription group "Hush Pro" (22335842), all territories, en + he localizations.
   */
  monthly: 'hush.pro.month',
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
  /** The same free trial in days — what the paywall's timeline counts (the charge day, the reminder
   *  two days before it). Absent/null when there is no trial she is eligible for (2026-09-28). */
  introTrialDays?: number | null;
}

/**
 * ⛔ THE PRO TRIAL IS FOURTEEN DAYS (founder 2026-09-28, the pricing model): three workouts free in
 * the app, then Apple's 14-day introductory free trial on both plans — set in App Store Connect,
 * which is the authority; this constant only lets the stub simulate the store truthfully.
 */
export const PRO_TRIAL_DAYS = 14;

/** A StoreKit subscription period, counted in days — for the timeline, not for billing. */
export function trialDaysOf(unit: string | null | undefined, count: number): number | null {
  const per: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
  const d = unit ? per[unit] : undefined;
  return d ? d * Math.max(1, count) : null;
}

export function isProductId(value: string): value is ProductId {
  return value === PRODUCT_IDS.monthly || value === PRODUCT_IDS.annual;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK'S PRODUCTS (ruling 1, founder 2026-09-17: *the coach pays*).
 *
 * A second subscription group — "FERROX Coach" — sold to the COACH, not to the athlete. Free up to
 * `COACH_FREE_SEATS` (2) linked trainees; beyond that one of three monthly tiers, each a seat count.
 *
 * ⛔ THESE IDS DO NOT EXIST IN APP STORE CONNECT YET. That is a founder op (below), and until it is
 * done `billing.getCoachPlans()` answers `[]` on every surface — including the stub, which exists to
 * SIMULATE App Store Connect and must therefore simulate the truth about it. The screen then draws
 * its unavailable state in words. There is never a dead button and never a price we invented; the
 * only price this app has ever printed is the store's own localized label.
 *
 * ⚠️ THE ID IS BURNED THE DAY IT IS DELETED. `hush.pro.monthly` is the scar (see above): App Store
 * Connect never re-issues a deleted product identifier. So these three are created ONCE, with the
 * right price tier, in group "FERROX Coach", all territories, en + he.
 *
 * ⛔ AND THE SEAT COUNT IS NOT THE CLIENT'S TO GRANT. `COACH_PLAN_SEATS` is what the tier is CALLED,
 * for the card's own line — the enforced number is `coaches.seat_limit` on the worker, raised only
 * after the server has verified the transaction with Apple. See `coachTrackClient.coachClaimPlan`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

export const COACH_PRODUCT_IDS = {
  coach10: 'hush.coach.10.month',
  coach30: 'hush.coach.30.month',
  coach100: 'hush.coach.100.month',
} as const;

export type CoachProductId = (typeof COACH_PRODUCT_IDS)[keyof typeof COACH_PRODUCT_IDS];

/** The free tier the worker grants with no purchase at all (`wrangler.toml` COACH_FREE_SEATS). */
export const COACH_FREE_SEATS = 2;

/** How many trainees each tier is sold as. The server enforces it; this is the card's own line. */
export const COACH_PLAN_SEATS: Record<CoachProductId, number> = {
  [COACH_PRODUCT_IDS.coach10]: 10,
  [COACH_PRODUCT_IDS.coach30]: 30,
  [COACH_PRODUCT_IDS.coach100]: 100,
};

/** Display order — smallest first, because a coach arrives here from a full roster of two. */
export const COACH_PRODUCT_ORDER: CoachProductId[] = [
  COACH_PRODUCT_IDS.coach10,
  COACH_PRODUCT_IDS.coach30,
  COACH_PRODUCT_IDS.coach100,
];

/** A coach tier as resolved from the store. `priceLabel` is the store's own localized string. */
export interface CoachPlanProduct {
  id: CoachProductId;
  seats: number;
  priceLabel: string;
}

export function isCoachProductId(value: string): value is CoachProductId {
  return (
    value === COACH_PRODUCT_IDS.coach10 ||
    value === COACH_PRODUCT_IDS.coach30 ||
    value === COACH_PRODUCT_IDS.coach100
  );
}
