/** Billing seam — Subscription + Apple Payments. Import from '@/platform/billing'. */
// @ts-nocheck

// 

export { billing, trackEntitlementChange, type Billing, type PurchaseResult, type PurchaseStatus } from './billing';
export {
  PRODUCT_IDS,
  PRODUCT_ORDER,
  PRODUCT_PERIOD,
  isProductId,
  type ProductId,
  type BillingPeriod,
  type SubscriptionProduct,
} from './products';
