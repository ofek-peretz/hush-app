/**
 * WHICH UNIT SHE THINKS IN, READ OFF THE PHONE — founder P0b.1.
 *
 * "Detect the athlete's region and choose lb vs kg from it, so the units SETTING can disappear
 * entirely."
 *
 * Onboarding wrote `units: 'kg'` for everybody, so every American athlete began by being told her
 * bodyweight in kilos and then had to go and find a switch for a fact her phone has known since
 * she set it up.
 *
 * The order matters more than the table does, and it is what these pin: her own MEASUREMENT SYSTEM
 * first, the region only as a fallback. An American living in Berlin whose phone is set to metric
 * has already answered this question, and a region code would overrule her.
 */
// @ts-nocheck

// 

import { unitsForDevice } from '@/domain/unitsForDevice';

describe('the measurement system she chose wins', () => {
  it('a phone set to US customary weighs in pounds', () => {
    expect(unitsForDevice({ measurementSystem: 'us', regionCode: 'US' })).toBe('lb');
  });

  it('a phone set to metric weighs in kilos — wherever it is', () => {
    expect(unitsForDevice({ measurementSystem: 'metric', regionCode: 'US' })).toBe('kg');
    expect(unitsForDevice({ measurementSystem: 'metric', regionCode: 'IL' })).toBe('kg');
  });

  /**
   * `uk` is the one that has to be decided rather than mapped. Britain weighs PEOPLE in stones and
   * its gyms in kilograms, and this is a gym: a British athlete who loads a barbell is loading
   * 20 kg plates, whatever her bathroom scale says.
   */
  it('a UK phone weighs a barbell in kilos, because a British gym does', () => {
    expect(unitsForDevice({ measurementSystem: 'uk', regionCode: 'GB' })).toBe('kg');
  });
});

describe('the region is the fallback, not the answer', () => {
  it('reads the region when the platform reports no system', () => {
    expect(unitsForDevice({ measurementSystem: null, regionCode: 'US' })).toBe('lb');
    expect(unitsForDevice({ measurementSystem: null, regionCode: 'DE' })).toBe('kg');
    expect(unitsForDevice({ regionCode: 'us' })).toBe('lb'); // case is not the caller's problem
  });

  it('the three non-metric countries, and nobody else', () => {
    for (const r of ['US', 'LR', 'MM']) expect(unitsForDevice({ regionCode: r })).toBe('lb');
    for (const r of ['GB', 'CA', 'AU', 'IL', 'DE', 'JP', 'BR']) expect(unitsForDevice({ regionCode: r })).toBe('kg');
  });
});

describe('a phone that will not say', () => {
  /**
   * Kilos, always. They are the unit of the barbell everywhere including the United States, they
   * are what the whole engine stores, and defaulting to them leaves a phone we cannot read behaving
   * exactly as the app did before this function existed — which is the only safe kind of default.
   */
  it('falls back to kilos, and never throws on the way', () => {
    expect(unitsForDevice(null)).toBe('kg');
    expect(unitsForDevice(undefined)).toBe('kg');
    expect(unitsForDevice({})).toBe('kg');
    expect(unitsForDevice({ measurementSystem: null, regionCode: null })).toBe('kg');
  });
});
