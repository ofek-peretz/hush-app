/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE TRIAL IS THREE WORKOUTS, THEN APPLE'S FOURTEEN DAYS (founder 2026-09-28: *"מאשר את הכל"* —
 * the pricing model, researched the same day).
 *
 *   · Three workouts free in the app, no card — the engine's own learning phase — capped at ten days.
 *   · The paywall lands on Well Done of the workout that spent them, not days later on a Begin tap.
 *   · It offers Apple's 14-day free trial, annual first, with a timeline (today · reminder · charge)
 *     and a REAL reminder two days before the charge.
 *   · A member from before the change keeps the fourteen workouts / thirty days she was promised.
 *   · One experiment: the paywall after workout one against three (`paywallAfterFirstWorkout`).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n, tg } from '@/i18n';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TRIAL_PRODUCTS = [
  { id: 'hush.pro.annual', period: 'annual', priceLabel: '₪249.90', introTrialLabel: '14 ימים', introTrialDays: 14 },
  { id: 'hush.pro.month', period: 'monthly', priceLabel: '₪49.90', introTrialLabel: '14 ימים', introTrialDays: 14 },
];

jest.mock('@/platform/billing', () => {
  const actual = jest.requireActual('@/platform/billing');
  return { ...actual, billing: { getProducts: async () => TRIAL_PRODUCTS } };
});
jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    modeState: { completedSessions: 3 },
    entitlement: { active: false },
    profile: { units: 'kg' },
    purchaseSubscription: async () => ({ status: 'cancelled' }),
    restorePurchases: async () => ({ status: 'cancelled' }),
  }),
}));
jest.mock('@/platform/telemetry', () => ({ track: async () => {} }));
const mockReminders: unknown[] = [];
jest.mock('@/platform/notifications', () => ({
  ...jest.requireActual('@/platform/notifications'),
  notifier: {
    ...jest.requireActual('@/platform/notifications').notifier,
    syncTrialEnding: async (arg: unknown) => void mockReminders.push(arg),
    syncTrialLast: async () => {},
  },
  ensureNotificationPermission: async () => true,
}));

const entitlement = require('@/domain/entitlement');

beforeAll(async () => {
  await initI18n();
});
afterEach(() => entitlement.__resetTrialForTest());

describe('1 · the free part is three workouts, ten days', () => {
  it('the defaults', () => {
    expect(entitlement.FREE_SESSION_LIMIT).toBe(3);
    expect(entitlement.TRIAL_MAX_DAYS).toBe(10);
    expect(entitlement.TRIAL_NEWS_AT).toBe(1);
    expect(entitlement.isTrainingGated(2, false)).toBe(false);
    expect(entitlement.isTrainingGated(3, false)).toBe(true);
    expect(entitlement.isTrainingGated(3, true)).toBe(false);
  });

  it('⛔ a promise already made is kept: a member from before the change keeps fourteen and thirty', () => {
    entitlement.grandfatherTrial({ memberSince: '2026-09-20T10:00:00.000Z' }); // no stamp: the old intake
    expect(entitlement.FREE_SESSION_LIMIT).toBe(14);
    expect(entitlement.TRIAL_MAX_DAYS).toBe(30);
    // …and no remote word or experiment arm moves her afterwards.
    entitlement.applyTrialLimitOverride(1);
    entitlement.applyTrialMaxDaysOverride(7);
    expect(entitlement.FREE_SESSION_LIMIT).toBe(14);
    expect(entitlement.TRIAL_MAX_DAYS).toBe(30);
  });

  it('a member the new intake enrolled gets the new deal, untouched — and a phone with no one on it too', () => {
    entitlement.grandfatherTrial({ memberSince: '2026-09-28T10:00:00.000Z', trialModel: 'three' });
    expect(entitlement.FREE_SESSION_LIMIT).toBe(3);
    entitlement.grandfatherTrial(null);
    expect(entitlement.FREE_SESSION_LIMIT).toBe(3);
  });

  it('the intake stamps the promise it made, and the boot reads it before anything reads the trial', () => {
    const store = read('src/state/stores/appStore.tsx');
    expect(store).toMatch(/trialModel: 'three',/);
    expect(store).toMatch(/grandfatherTrial\(storedProfile\);/);
  });

  it('the placement experiment: workout one on the new arm, and an explicit server word outranks the coin', () => {
    const cfg = read('src/platform/remoteConfig.ts');
    expect(cfg).toMatch(/if \(typeof lastLimitWord === 'number'\) return;\s*if \(await onNewArm\('paywallAfterFirstWorkout'\)\) applyTrialLimitOverride\(1\);/);
    expect(read('src/platform/experiments.ts')).toMatch(/paywallAfterFirstWorkout: 50/);
  });
});

describe('2 · the paywall lands on the workout that spent them', () => {
  it('Well Done pushes it, over the tabs, when the free workouts just ran out', () => {
    const src = read('src/screens/session/WellDone.tsx');
    expect(src).toMatch(/isTrainingGated\(app\.modeState\?\.completedSessions \?\? 0, false, app\.profile\?\.memberSince\)/);
    expect(src).toMatch(/\{ name: 'Paywall', params: \{ source: 'trial_end' \} \}/);
  });
});

describe("3 · it offers Apple's free trial as a timeline, and keeps the reminder it promises", () => {
  it('the stub simulates the store truthfully: the ratified tiers, a 14-day trial, and a trial purchase', async () => {
    const { billingStub } = require('@/platform/billing/billing');
    const products = await billingStub.getProducts();
    expect(products.map((p) => p.priceLabel)).toEqual(['$79.99', '$14.99']);
    expect(products.every((p) => p.introTrialDays === 14)).toBe(true);
    const bought = await billingStub.purchase('hush.pro.annual');
    expect(bought.entitlement.source).toBe('trial');
    const days = (Date.parse(bought.entitlement.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('StoreKit offers the trial only to a phone that can have it, and marks a purchase that opened one', () => {
    const sk = read('src/platform/billing/storekit.ts');
    expect(sk).toMatch(/iap\.isEligibleForIntroOfferIOS\(group\)/);
    expect(sk).toMatch(/introTrialLabel: eligible \? introTrialLabel\(p\) : null/);
    expect(sk).toMatch(/startedTrial\(purchase\) \? \{ \.\.\.ent, source: 'trial' \} : ent/);
  });

  it('the paywall draws today · day 12 · day 14, and its act starts the trial', async () => {
    const { Paywall } = require('@/screens/subscription/Paywall');
    let r;
    await act(async () => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
          <Paywall navigation={{ goBack: () => {} }} route={{ params: { source: 'trial_end' } }} />
        </SafeAreaProvider>,
      );
    });
    const said = r.root.findAllByType(Text).map((n) => [n.props.children].flat(Infinity).filter((x) => typeof x === 'string').join('')).join(' | ');
    expect(said).toContain(tg('paywall.timelineToday'));
    expect(said).toContain(tg('paywall.timelineDay', { day: 12 }));
    expect(said).toContain(tg('paywall.timelineDay', { day: 14 }));
    expect(said).toContain(tg('paywall.startTrial', { period: '14 ימים' }));
    expect(said).toContain(tg('paywall.trialDone', { count: 3 }).toUpperCase()); // a Legend
    // The renewal terms name the trial and the price in one sentence; the REMINDER is named by the
    // timeline directly above the act since 2026-09-29 (design audit) — said once, where it is seen.
    expect(said).toContain(tg('paywall.legalTrial', { period: '14 ימים', price: '₪249.90', cadence: tg('paywall.perYear') }));
    act(() => r.unmount());
  });

  it('the reminder is armed from the trial end, two days before it, and cancelled when there is none', async () => {
    const calls = mockReminders;
    const { db } = require('@/data/local/db');
    const { armTrialEnding } = require('@/platform/trialCatch');
    await db.clearAll();
    const ends = Date.now() + 14 * 86_400_000;
    const trial = { active: true, productId: 'hush.pro.annual', source: 'trial', expiresAt: new Date(ends).toISOString() };
    await db.saveEntitlement(trial);
    await armTrialEnding(trial);
    expect(calls.at(-1).fireAtMs).toBe(ends - 2 * 86_400_000);
    expect(typeof calls.at(-1).chargeDate).toBe('string');
    // A boot after it re-derives the same note from the stamped end.
    await armTrialEnding();
    expect(calls.at(-1).fireAtMs).toBe(ends - 2 * 86_400_000);
    // No live entitlement → cancelled.
    await db.saveEntitlement({ active: false, productId: null, source: 'none', expiresAt: null });
    await armTrialEnding();
    expect(calls.at(-1)).toBeNull();
  });
});
