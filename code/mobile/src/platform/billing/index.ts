/** Billing seam — Subscription + Apple Payments. Import from '@/platform/billing'. */

// 

export { billing, trackEntitlementChange, type Billing, type CoachPurchaseResult, type PurchaseResult, type PurchaseStatus } from './billing';
export { onEntitlementArrived } from './storekit';
export {
  PRODUCT_IDS,
  PRODUCT_ORDER,
  PRODUCT_PERIOD,
  PRO_TRIAL_DAYS,
  isProductId,
  type ProductId,
  type BillingPeriod,
  type SubscriptionProduct,
  /* the coach track's tiers (ruling 1 — the coach pays) */
  COACH_FREE_SEATS,
  COACH_PLAN_SEATS,
  COACH_PRODUCT_IDS,
  COACH_PRODUCT_ORDER,
  isCoachProductId,
  type CoachPlanProduct,
  type CoachProductId,
} from './products';
