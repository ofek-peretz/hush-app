/**
 * ════ THE LIVE INDOOR DISTANCE — `modules/hush-pedometer` (founder, 2026-09-15) ════
 *
 * Core Motion's pedometer, read as "kilometres since this instant". It is the LIVE half of the
 * indoor source: Health's `DistanceWalkingRunning` arrives from the iPhone in batches minutes apart,
 * the pedometer answers within a second. Health stays the other half — it carries the Apple Watch's
 * strides, which is the only measurement there is when the phone sits on the console.
 *
 * Degrades like every native seam here: no module (Android, web, Expo Go, an older build) or any
 * failure reads `null`, which the tracker treats as "not measured" and never as zero.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface PedometerModule {
  isDistanceAvailable(): boolean;
  authorizationStatus(): 'granted' | 'denied' | 'unknown';
  distanceSince(fromMs: number): Promise<number | null>;
}

const native: PedometerModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<PedometerModule>('HushPedometer') : null;

export const pedometer = {
  /** A pedometer with a distance estimate exists and has not been refused. */
  usable(): boolean {
    try {
      return !!native?.isDistanceAvailable() && native.authorizationStatus() !== 'denied';
    } catch {
      return false;
    }
  },
  /** Kilometres walked or run since `fromMs`, or `null` when nothing was measured. */
  async kmSince(fromMs: number): Promise<number | null> {
    if (!native) return null;
    try {
      const metres = await native.distanceSince(fromMs);
      return typeof metres === 'number' && Number.isFinite(metres) && metres >= 0 ? metres / 1000 : null;
    } catch {
      return null;
    }
  },
};

/**
 * ONE WALK, TWO MEASUREMENTS OF IT — the reading the run is credited from.
 *
 * The pedometer (this phone, live) and Health (this phone in batches, plus the watch) each measure
 * the same strides since the run began, so the answer is the one that has measured the most so far —
 * never their sum. Both are cumulative, so their maximum is cumulative too, and `ingestStride`'s
 * cursor never sees it go backwards. `null` only when neither source has measured anything.
 */
export function indoorReadingKm(pedometerKm: number | null, healthKm: number | null): number | null {
  const readings = [pedometerKm, healthKm].filter((k): k is number => typeof k === 'number' && Number.isFinite(k) && k >= 0);
  return readings.length ? Math.max(...readings) : null;
}
