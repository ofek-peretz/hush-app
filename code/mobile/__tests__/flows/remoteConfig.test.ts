/**
 * Remote config — the tuning channel (2026-09-01, audit finding 03).
 *
 * The contract under test, in order of importance:
 *   1. No URL → nothing fetches, the compiled defaults stand. A build without a config server is
 *      exactly the app we ship today.
 *   2. A server word retunes the trial limit through the live binding every call site reads.
 *   3. The clamp holds — a wrong server cannot gate the first workout or ungate the product.
 *   4. Offline applies the cached word; a corrupt cache is just no cache.
 */
// @ts-nocheck

//

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRemoteConfig, __setConfigUrlForTest } from '@/platform/remoteConfig';
import * as entitlement from '@/domain/entitlement';

const CACHE_KEY = 'hush.config.cache';

beforeEach(async () => {
  await AsyncStorage.clear();
  __setConfigUrlForTest('');
  entitlement.applyTrialLimitOverride(14); // restore the default between tests
});

describe('remote config — the tuning channel', () => {
  it('no URL → no fetch, defaults stand', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    await loadRemoteConfig();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(entitlement.FREE_SESSION_LIMIT).toBe(14);
  });

  it('a server word retunes the trial limit, and the gate reads it live', async () => {
    __setConfigUrlForTest('https://cfg.example/config');
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ trialSessionLimit: 21 }) }));
    await loadRemoteConfig();
    expect(entitlement.FREE_SESSION_LIMIT).toBe(21);
    // The pure gate reads the same binding — the promise and the gate cannot drift apart.
    expect(entitlement.isTrainingGated(20, false)).toBe(false);
    expect(entitlement.isTrainingGated(21, false)).toBe(true);
    expect(entitlement.freeSessionsRemaining(20)).toBe(1);
  });

  it('the clamp holds — a wrong server cannot gate workout one or ungate the product', async () => {
    __setConfigUrlForTest('https://cfg.example/config');
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ trialSessionLimit: 0 }) }));
    await loadRemoteConfig();
    expect(entitlement.FREE_SESSION_LIMIT).toBe(1); // floor, never 0

    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ trialSessionLimit: 10_000 }) }));
    await loadRemoteConfig();
    expect(entitlement.FREE_SESSION_LIMIT).toBe(60); // ceiling

    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ trialSessionLimit: 'free' }) }));
    await loadRemoteConfig();
    expect(entitlement.FREE_SESSION_LIMIT).toBe(60); // a non-number changes nothing
  });

  it('offline applies the cached word; a corrupt cache is just no cache', async () => {
    __setConfigUrlForTest('https://cfg.example/config');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ trialSessionLimit: 18 }));
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    await loadRemoteConfig();
    expect(entitlement.FREE_SESSION_LIMIT).toBe(18); // the cache carried the word

    entitlement.applyTrialLimitOverride(14);
    await AsyncStorage.setItem(CACHE_KEY, '{not json');
    await expect(loadRemoteConfig()).resolves.toBeUndefined(); // never throws
    expect(entitlement.FREE_SESSION_LIMIT).toBe(14);
  });

  it('unknown keys are dropped — config is a tuning channel, never a code channel', async () => {
    __setConfigUrlForTest('https://cfg.example/config');
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ trialSessionLimit: 12, evalMe: 'require("fs")', paywallCopy: 'BUY NOW!!' }),
    }));
    await loadRemoteConfig();
    const cached = JSON.parse(await AsyncStorage.getItem(CACHE_KEY));
    expect(Object.keys(cached)).toEqual(['trialSessionLimit']); // the allow-list is the whole of it
  });
});

describe('the trial time cap — armed at thirty days (2026-09-09)', () => {
  it('armed by default: a once-a-week athlete meets the gate on day 30, not after fourteen weeks', () => {
    const start = '2026-01-01T00:00:00.000Z';
    const monthsLater = Date.parse('2026-06-01T00:00:00.000Z');
    const day10 = Date.parse('2026-01-11T00:00:00.000Z');
    expect(entitlement.TRIAL_MAX_DAYS).toBe(30);
    expect(entitlement.trialTimeSpent(start, monthsLater)).toBe(true);
    expect(entitlement.isTrainingGated(3, false, start, monthsLater)).toBe(true);
    expect(entitlement.isTrainingGated(3, false, start, day10)).toBe(false);
  });

  it('the config word 0 disarms it — sessions alone gate, the 2026-09-01 arc', () => {
    entitlement.applyTrialMaxDaysOverride(0);
    const start = '2026-01-01T00:00:00.000Z';
    const monthsLater = Date.parse('2026-06-01T00:00:00.000Z');
    expect(entitlement.trialTimeSpent(start, monthsLater)).toBe(false);
    expect(entitlement.isTrainingGated(3, false, start, monthsLater)).toBe(false);
    entitlement.applyTrialMaxDaysOverride(undefined); // back to the default for the suites that follow
    expect(entitlement.TRIAL_MAX_DAYS).toBe(30);
  });

  it('armed by the config word: sessions OR days, whichever runs out first', async () => {
    __setConfigUrlForTest('https://cfg.example/config');
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ trialMaxDays: 30 }) }));
    await loadRemoteConfig();
    const start = '2026-01-01T00:00:00.000Z';
    const day31 = Date.parse('2026-02-01T00:00:00.000Z');
    const day10 = Date.parse('2026-01-11T00:00:00.000Z');
    expect(entitlement.isTrainingGated(3, false, start, day31)).toBe(true); // time spent
    expect(entitlement.isTrainingGated(3, false, start, day10)).toBe(false); // neither spent
    expect(entitlement.isTrainingGated(3, true, start, day31)).toBe(false); // a purchase always unlocks
  });

  it('the clamp holds on the cap too', () => {
    entitlement.applyTrialMaxDaysOverride(1);
    expect(entitlement.TRIAL_MAX_DAYS).toBe(7); // floor — a one-day trial is a bad deploy, not a plan
    entitlement.applyTrialMaxDaysOverride(10_000);
    expect(entitlement.TRIAL_MAX_DAYS).toBe(365);
    entitlement.applyTrialMaxDaysOverride('forever');
    expect(entitlement.TRIAL_MAX_DAYS).toBe(30); // garbage restores the default rather than guessing
  });
});
