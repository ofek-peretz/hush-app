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
    // Fourteen since 2026-10-11 (was ten): a cycle and its first repeat is eight days with no day
    // missed, and ten left two days of slack before the calendar cut the workout the allowance is for.
    expect(entitlement.TRIAL_MAX_DAYS).toBe(14);
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
    // ⛔ OFF BY DEFAULT since 2026-10-11 — see the next block. The arm and its switch remain.
    expect(read('src/platform/experiments.ts')).toMatch(/paywallAfterFirstWorkout: 0,/);
  });
});

/*
 * ════ ⛔ THE FREE WORKOUTS RUN THROUGH THE FIRST REPEAT (founder, 2026-10-11) ════
 *
 * Walked as a man who trains five days a week: the wall fell at the start of workout four —
 * Wednesday of week one — before any workout had come round again, so before he had seen the app
 * move one weight from what he did. That is the thing the paywall sells. Three is the floor she
 * was always promised; the allowance is her own cycle and its first repeat.
 */
describe('1b · the allowance is her cycle and the first workout of the next', () => {
  it('two days → three (the floor); five days → six; the count is one past her cycle', () => {
    expect([1, 2, 3, 4, 5, 6].map((d) => entitlement.freeSessionsForCycle(d))).toEqual([3, 3, 4, 5, 6, 7]);
    // Nothing known about her week yet, or nonsense: the floor, never fewer and never a crash.
    for (const unknown of [0, -1, 2.5, Number.NaN, null, undefined]) {
      expect(entitlement.freeSessionsForCycle(unknown as never)).toBe(entitlement.FREE_SESSION_FLOOR);
    }
    expect(entitlement.FREE_SESSION_FLOOR).toBe(3);
  });

  it('⛔ a five-day athlete trains her whole week and its first repeat before the wall', () => {
    entitlement.applyCycleTrial({ trialSessions: entitlement.freeSessionsForCycle(5) });
    // Workouts 1–5 are her week; workout 6 is the first one she has done before — the first screen
    // that shows what the app decided. The gate is asked BEFORE a workout, with the count done so far.
    for (let done = 0; done <= 5; done += 1) expect(entitlement.isTrainingGated(done, false)).toBe(false);
    expect(entitlement.isTrainingGated(6, false)).toBe(true);
    expect(entitlement.freeSessionsRemaining(5)).toBe(1);
  });

  it('the stamp wins over the days she trains now — editing the week does not move the wall', () => {
    entitlement.applyCycleTrial({ trialSessions: 4, daysPerWeek: 6 });
    expect(entitlement.FREE_SESSION_LIMIT).toBe(4);
    entitlement.__resetTrialForTest();
    // A 2026-09-28 profile: the model's stamp, no count — read from the days it trains.
    entitlement.applyCycleTrial({ daysPerWeek: 5 });
    expect(entitlement.FREE_SESSION_LIMIT).toBe(6);
    entitlement.__resetTrialForTest();
    // The Ready screen, before any profile: the week's own days.
    entitlement.applyCycleTrial(4);
    expect(entitlement.FREE_SESSION_LIMIT).toBe(5);
  });

  it('⛔ it never takes a promise back and never overrides the server', () => {
    entitlement.grandfatherTrial({ memberSince: '2026-09-20T10:00:00.000Z' });
    entitlement.applyCycleTrial({ trialSessions: 4 });
    expect(entitlement.FREE_SESSION_LIMIT).toBe(14); // the fourteen she was promised stand
    entitlement.__resetTrialForTest();
    entitlement.applyTrialLimitOverride(2); // the server's word (or an arm's)
    entitlement.applyCycleTrial({ trialSessions: 6 });
    expect(entitlement.FREE_SESSION_LIMIT).toBe(2);
    entitlement.__resetTrialForTest();
    entitlement.applyCycleTrial(null);
    expect(entitlement.FREE_SESSION_LIMIT).toBe(3); // a phone with no one on it: the floor
  });

  it('it is stamped when her week is written, read at boot, and counted on the Ready screen', () => {
    const store = read('src/state/stores/appStore.tsx');
    expect(store).toContain('trialSessions: freeSessionsForCycle(inputs.daysPerWeek),');
    expect(store).toMatch(/grandfatherTrial\(storedProfile\);[\s\S]{0,160}applyCycleTrial\(storedProfile\);/);
    // …and it holds in the run of the app that enrolled her, not only from the next boot.
    expect(store).toMatch(/applyCycleTrial\(profile\);\s*dispatch\(\{ type: 'ONBOARDED'/);
    const ready = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(ready).toMatch(/if \(!app\.profile\) applyCycleTrial\(inputs\.daysPerWeek\);\s*const freeLeft = freeSessionsRemaining/);
    // The day count that reaches both is the week that was WRITTEN, not the wheel she turned.
    expect(read('src/screens/onboarding/BuildingProgramme.tsx')).toContain('inputs: authoredDays.current ? { ...inputs, daysPerWeek: authoredDays.current } : inputs,');
  });

  it('every screen that states the allowance reads the one live number', () => {
    for (const f of ['src/screens/home/Home.tsx', 'src/screens/onboarding/ProgramCreated.tsx', 'src/screens/profile/ProfileSheet.tsx']) {
      expect(read(f)).toContain('freeSessionsRemaining(');
    }
    // No string in either language says "three" or "3" about the free workouts.
    const he = read('src/i18n/locales/he.json');
    const en = read('src/i18n/locales/en.json');
    expect(he).not.toMatch(/"(?:3|שלושה|שלושת) (?:ה)?אימונים (?:ה)?ראשונים/);
    expect(en).not.toMatch(/first (?:3|three) workouts|(?:3|three) free workouts/i);
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
    // She trained her three workouts HERE — the count and the history agree, as they do for anyone
    // who reached this screen by training (the other case is the law below).
    const { db } = require('@/data/local/db');
    await db.clearAll();
    await db.appendCompletedSession({ id: 's1', programDayId: 'coach_0', startedAt: new Date(Date.now() - 86_400_000).toISOString(), state: 'SAVED', earlyFinish: false, sets: [] });
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

  /*
   * ⛔ THE FOUNDER'S FIRST START ON A PHONE THAT HAD TRAINED BEFORE (2026-10-05). The trial's count
   * outlives a reinstall (`domain/trialLedger` — his own 2026-08-23 ruling against the free loop), so
   * a fresh intake on such a phone has the free workouts spent and nothing in its history. The Ready
   * screen promised him "3 first workouts FREE", and the paywall that met his first Start said "3
   * workouts behind you… now I know you". Neither was true of that install.
   */
  it('⛔ a phone whose free workouts were spent before this install is told THAT — never "now I know you"', async () => {
    const { Paywall } = require('@/screens/subscription/Paywall');
    const { db } = require('@/data/local/db');
    await db.clearAll(); // the count says three (the ledger), the history says nothing
    let r;
    await act(async () => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
          <Paywall navigation={{ goBack: () => {} }} route={{ params: { source: 'gate' } }} />
        </SafeAreaProvider>,
      );
    });
    const said = r.root.findAllByType(Text).map((n) => [n.props.children].flat(Infinity).filter((x) => typeof x === 'string').join('')).join(' | ');
    expect(said).toContain(tg('paywall.trialUsed').toUpperCase());
    expect(said).toContain(tg('paywall.title'));
    expect(said).not.toContain(tg('paywall.trialDone', { count: 3 }).toUpperCase());
    expect(said).not.toContain(tg('paywall.titleSpent', { count: 3 }));
    act(() => r.unmount());
  });

  it('⛔ the Ready screen promises only the free workouts this device still has', () => {
    const src = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(src).toMatch(/const freeLeft = freeSessionsRemaining\(app\.modeState\.completedSessions\);/);
    expect(src).toMatch(/\{member \? null : freeLeft > 0 \? \(/); // a member is promised nothing here
    expect(src).toMatch(/t\('ob\.readyWorkouts', \{ count: freeLeft \}\)/);
    expect(src).toMatch(/t\('ob\.readySpent'\)/);
    // The limit itself is never printed there as a promise again.
    expect(src).not.toMatch(/readyWorkouts', \{ count: FREE_SESSION_LIMIT \}/);
    const { freeSessionsRemaining } = entitlement;
    expect(freeSessionsRemaining(0)).toBe(3);
    expect(freeSessionsRemaining(2)).toBe(1);
    expect(freeSessionsRemaining(14)).toBe(0);
  });

  /*
   * ⛔ THE DECISION THE FOUNDER HANDED OVER (2026-10-05: *"קח אותה בעצמך… את ההחלטה הטובה ביותר מבין כל
   * האופציות"*). A phone with no free workout left is told on the Ready screen, keeps its programme
   * either way, and is shown the offer ONCE as it lands — not first on a Start pressed in the gym
   * (`app/intakeHandoff` lists the options and why this one).
   */
  it('⛔ a phone with no free workout left is shown the offer once as the intake ends — never first on Start', () => {
    const ready = read('src/screens/onboarding/ProgramCreated.tsx');
    // Owed only when nothing is left AND she is not a member, and before the profile is written.
    expect(ready).toMatch(/if \(!member && freeLeft === 0\) intakeHandoff\.owePaywall\(\);\s+await app\.completeOnboarding\(/);
    const home = read('src/screens/home/Home.tsx');
    expect(home).toMatch(/if \(intakeHandoff\.takePaywall\(\)\) navigation\.navigate\('Paywall', \{ source: 'intake' \}\);/);
    // The gate on Start is exactly what it was.
    expect(home).toMatch(/if \(gated \|\| isTrainingGated\(app\.modeState\.completedSessions, app\.entitlement\.active, app\.profile\?\.memberSince\)\) \{\s+navigation\.navigate\('Paywall', \{ source: 'gate' \}\);/);
    const { intakeHandoff } = require('@/app/intakeHandoff');
    expect(intakeHandoff.takePaywall()).toBe(false); // nothing owed by default
    intakeHandoff.owePaywall();
    expect(intakeHandoff.takePaywall()).toBe(true);
    expect(intakeHandoff.takePaywall()).toBe(false); // once
    // The sentence that announces it says both halves: what is next, and that her programme is hers.
    const he = JSON.parse(read('src/i18n/locales/he.json')).ob.readySpent;
    const en = JSON.parse(read('src/i18n/locales/en.json')).ob.readySpent;
    expect(he).toMatch(/מנוי/);
    expect(he).toMatch(/התוכנית שלך נשמרת/);
    expect(en).toMatch(/membership/);
    expect(en).toMatch(/programme is kept/);
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
