/**
 * WHICH UNIT SHE THINKS IN — read off the phone, never asked (founder P0b.1).
 *
 * "Detect the athlete's region and choose lb vs kg from it, so the units SETTING can disappear
 * entirely."
 *
 * Onboarding wrote `units: 'kg'` for everybody, so every American athlete began by being told her
 * bodyweight in kilos and then had to go find a switch. The phone already knows the answer and has
 * known it since she set the device up.
 *
 * ════ WHY MEASUREMENT SYSTEM FIRST, AND REGION ONLY AS A FALLBACK ════
 *
 * `measurementSystem` is not a guess about where she lives — it is the setting SHE chose in
 * Settings › General › Language & Region. An American living in Berlin who has switched her phone
 * to metric is telling us something a region code cannot, and she should not have to tell us twice.
 * That is also what makes the disappearing setting honest rather than a removal: the control does
 * not vanish, it moves to the one place iOS already keeps it, where it is already set correctly.
 *
 * The region is the fallback for a platform that does not report a system (older iOS, Android, the
 * web harness). `uk` resolves to KILOS on purpose: Britain weighs people in stones and its gyms in
 * kilograms, and this is a gym.
 *
 * Unknown → kg. Kilos are the unit of the barbell everywhere including the United States, and they
 * are what the whole engine stores; defaulting to them keeps a phone we cannot read behaving
 * exactly as the app did before this existed.
 */
// @ts-nocheck

// 

export type Units = 'kg' | 'lb';

/** What the platform can tell us. Both fields are `null` where the platform does not answer. */
export interface DeviceLocale {
  measurementSystem?: 'metric' | 'us' | 'uk' | null;
  regionCode?: string | null;
}

/**
 * The only regions that weigh a barbell in pounds. Liberia and Myanmar are the other two countries
 * that never adopted the metric system, and both are here for completeness rather than for traffic.
 */
const POUND_REGIONS = new Set(['US', 'LR', 'MM']);

export function unitsForDevice(locale: DeviceLocale | null | undefined): Units {
  if (!locale) return 'kg';
  // Her own choice, where the platform reports it.
  if (locale.measurementSystem === 'us') return 'lb';
  if (locale.measurementSystem === 'metric' || locale.measurementSystem === 'uk') return 'kg';
  // Otherwise, where the phone says it is.
  const region = (locale.regionCode ?? '').toUpperCase();
  return POUND_REGIONS.has(region) ? 'lb' : 'kg';
}
