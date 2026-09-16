/**
 * Subscription + Apple Payments (Launch Roadmap item 1).
 *
 * Covers the two pieces that carry the product logic: the PURE free-trial gate
 * (domain/entitlement) and the billing seam's stub (products catalog, purchase →
 * entitlement unlock, persistence across calls, restore). The StoreKit native
 * impl will satisfy the same `Billing` contract, so these tests pin the contract.
 */
// @ts-nocheck

// 

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

describe('the StoreKit seam (selection contract, wired 2026-08-24)', () => {
  it('this jest runtime selects the stub — the native ExpoIap probe answers null here', () => {
    const { storeKitAvailable } = require('@/platform/billing/storekit');
    const { billingStub } = require('@/platform/billing/billing');
    expect(storeKitAvailable()).toBe(false);
    expect(billing).toBe(billingStub);
  });

  it('the real implementation keys on the native module, never on a guess — and a production build that LOST the module fails closed (2026-09-01, audit finding 5)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'platform', 'billing', 'storekit.ts'), 'utf8');
    expect(src).toContain("requireOptionalNativeModule?.('ExpoIap')");
    const sel = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'platform', 'billing', 'billing.ts'), 'utf8');
    // Three-way, in this order: real StoreKit → the fail-closed guard → the QA stub. The middle
    // arm is the fix for the day a packaging regression drops the native module from a shipped
    // binary — the stub would have granted the whole product for free, silently.
    expect(sel).toMatch(/storeKitAvailable\(\)\s*\? billingStoreKit\s*: brokenProductionBuild\s*\? billingGuard\s*: billingStub/);
    expect(sel).toContain("!__DEV__ && Platform.OS === 'ios' && !storeKitAvailable()");
    // The guard's getEntitlement THROWS so the boot reconcile keeps a paying athlete's cache.
    expect(sel).toContain("throw new Error('storekit_missing_in_production')");
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
