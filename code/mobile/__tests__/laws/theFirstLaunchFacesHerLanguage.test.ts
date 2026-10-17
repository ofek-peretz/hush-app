/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FIRST LAUNCH FACES HER LANGUAGE — and the first launch is the one the intake runs in.
 *
 * ⛔ FOUNDER, BUILD 75 (2026-10-01): the build screen of a fresh install drew its legend, its label
 * and her own quoted sentence on the LEFT edge of a Hebrew screen. An hour later the same phone's
 * Program tab was right — because by then the app had been relaunched.
 *
 * `I18nManager.isRTL` is a CONSTANT in RN 0.81, read once at launch, and `forceRTL` only writes the
 * NEXT launch's direction. Three places believed otherwise: `bidi.relatchDirection` re-read the
 * constant, Root's `direction` style called it "render-time truth", and nothing restarted a first
 * launch that came up facing the wrong way. So every new athlete on a Hebrew phone did the whole
 * intake mirrored, and nobody who already had the app could ever see it.
 *
 * The law: the LANGUAGE decides the direction; a launch facing the other way restarts exactly ONCE
 * per direction; and Root lays out by the decided direction, so even a host without a restart is
 * right.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DevSettings, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { decideDirection, launchedFacingWrongWay, relatchDirection } from '@/i18n/bidi';
import * as bidi from '@/i18n/bidi';
import { relaunchIntoDirection } from '@/app/reload';

const KEY = 'hush.direction.relaunch';

describe('the language decides the direction, not the launch constant', () => {
  it('⛔ a Hebrew decision on a launch that came up LTR is seen as facing the wrong way', () => {
    expect(I18nManager.isRTL).toBe(false); // the jest host launches LTR, like a fresh install
    decideDirection(true);
    expect(launchedFacingWrongWay()).toBe(true);
    relatchDirection();
    expect(bidi.rtl).toBe(true); // the latch follows the decision, not `I18nManager.isRTL`
    decideDirection(false);
    relatchDirection();
    expect(launchedFacingWrongWay()).toBe(false);
    expect(bidi.rtl).toBe(false);
  });
});

describe('a wrong-way first launch restarts once, and never loops', () => {
  let reload: jest.SpyInstance;
  beforeEach(async () => {
    await AsyncStorage.clear();
    reload = jest.spyOn(DevSettings, 'reload').mockImplementation(() => {});
  });
  afterEach(() => {
    reload.mockRestore();
    decideDirection(false);
    relatchDirection();
  });

  it('⛔ restarts the first time, writing down the direction it restarted FOR', async () => {
    decideDirection(true);
    relatchDirection();
    await expect(relaunchIntoDirection()).resolves.toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(KEY)).toBe('rtl');
  });

  it('⚠️ …and a second launch STILL facing the wrong way renders instead of restarting again', async () => {
    decideDirection(true);
    relatchDirection();
    await AsyncStorage.setItem(KEY, 'rtl');
    await expect(relaunchIntoDirection()).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a launch facing the right way restarts nothing and clears the note for the next language change', async () => {
    decideDirection(false);
    relatchDirection();
    await AsyncStorage.setItem(KEY, 'rtl');
    await expect(relaunchIntoDirection()).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});

describe('the seams read the decision', () => {
  const src = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

  it("⛔ Root lays out by `bidi.rtl`, never by the launch constant", () => {
    const root = src('src/app/Root.tsx');
    expect(root).toMatch(/direction:\s*rtl\s*\?\s*'rtl'\s*:\s*'ltr'/);
    expect(root).not.toMatch(/direction:\s*I18nManager\.isRTL/);
  });

  it('⛔ boot asks for the relaunch before it renders anything', () => {
    const app = src('App.tsx');
    expect(app).toMatch(/initI18n\(\)\s*\.then\(\(\)\s*=>\s*relaunchIntoDirection\(\)\)/);
  });

  it('both doors that choose a language tell the latch what they chose', () => {
    const i18n = src('src/i18n/index.ts');
    expect((i18n.match(/decideDirection\(rtl\)/g) ?? []).length).toBe(2); // initI18n + setLocale
  });
});
