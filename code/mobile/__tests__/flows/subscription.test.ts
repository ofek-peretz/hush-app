/**
 * Subscription + Apple Payments (Launch Roadmap item 1).
 *
 * Covers the two pieces that carry the product logic: the PURE free-trial gate
 * (domain/entitlement) and the billing seam's stub (products catalog, purchase →
 * entitlement unlock, persistence across calls, restore). The StoreKit native
 * impl will satisfy the same `Billing` contract, so these tests pin the contract.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FREE_SESSION_LIMIT,
  isTrainingGated,
  freeSessionsRemaining,
  NO_ENTITLEMENT,
} from '@/domain/entitlement';
import { billing, PRODUCT_IDS, PRODUCT_ORDER } from '@/platform/billing';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('free-trial gate (pure)', () => {
  it('does not gate while free sessions remain', () => {
    for (let n = 0; n < FREE_SESSION_LIMIT; n++) {
      expect(isTrainingGated(n, false)).toBe(false);
      expect(freeSessionsRemaining(n)).toBe(FREE_SESSION_LIMIT - n);
    }
  });

  it('gates exactly once the free sessions are spent', () => {
    expect(isTrainingGated(FREE_SESSION_LIMIT, false)).toBe(true);
    expect(isTrainingGated(FREE_SESSION_LIMIT + 5, false)).toBe(true);
    expect(freeSessionsRemaining(FREE_SESSION_LIMIT)).toBe(0);
    expect(freeSessionsRemaining(FREE_SESSION_LIMIT + 5)).toBe(0);
  });

  it('an active entitlement always unlocks, regardless of session count', () => {
    expect(isTrainingGated(0, true)).toBe(false);
    expect(isTrainingGated(FREE_SESSION_LIMIT, true)).toBe(false);
    expect(isTrainingGated(999, true)).toBe(false);
  });
});

describe('billing stub (seam contract)', () => {
  it('offers both plans with the annual plan first (the better-value lead)', async () => {
    const products = await billing.getProducts();
    expect(products.map((p) => p.id)).toEqual(PRODUCT_ORDER);
    expect(products.find((p) => p.id === PRODUCT_IDS.annual)?.period).toBe('annual');
    expect(products.find((p) => p.id === PRODUCT_IDS.monthly)?.period).toBe('monthly');
    expect(products.every((p) => p.priceLabel.length > 0)).toBe(true);
  });

  it('starts with no entitlement', async () => {
    expect(await billing.getEntitlement()).toEqual(NO_ENTITLEMENT);
  });

  it('a purchase activates the entitlement and persists across calls', async () => {
    const result = await billing.purchase(PRODUCT_IDS.annual);
    expect(result.status).toBe('purchased');
    expect(result.entitlement.active).toBe(true);
    expect(result.entitlement.productId).toBe(PRODUCT_IDS.annual);
    // Persisted — a later read (e.g. next boot) still reports active.
    expect(await billing.getEntitlement()).toEqual(result.entitlement);
  });

  it('restore reinstates a prior purchase, and reports failure when there is nothing to restore', async () => {
    expect((await billing.restore()).status).toBe('failed');
    await billing.purchase(PRODUCT_IDS.monthly);
    const restored = await billing.restore();
    expect(restored.status).toBe('restored');
    expect(restored.entitlement.active).toBe(true);
    expect(restored.entitlement.productId).toBe(PRODUCT_IDS.monthly);
  });
});
