/** Billing seam — Subscription + Apple Payments. Import from '@/platform/billing'. */

// 

export { billing, trackEntitlementChange, type Billing, type PurchaseResult, type PurchaseStatus } from './billing';
export { onEntitlementArrived } from './storekit';
export {
  PRODUCT_IDS,
  PRODUCT_ORDER,
  PRODUCT_PERIOD,
  isProductId,
  type ProductId,
  type BillingPeriod,
  type SubscriptionProduct,
} from './products';
