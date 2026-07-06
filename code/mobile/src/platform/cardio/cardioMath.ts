/**
 * Pure cardio math — the honesty gates and formatters behind the live tracker.
 * Kept free of native imports (expo-location lives in cardioTracker) so the rules
 * that decide whether movement is real stay under plain unit test. These gates are
 * the fix for the Build #22 review finding: a phone sitting on a table displayed
 * 0.11 km · 5:39 /km · 147 bpm, because the tracker was a simulation. With real GPS,
 * distance may only accrue through `segmentCounts` — and a stationary device fails it.
 */
import type { CardioGait } from '@/data/local/models';

/** A fix must be at least this tight (meters, horizontal) to be used at all. */
export const MAX_ACCURACY_M = 30;
/** Doppler speed below this is standing still / indoor jitter — no distance, no pace. */
export const MIN_SPEED_MS = 0.5;
/** Displacement implying faster than this is a GPS teleport — discarded. */
export const MAX_SPEED_MS = 12.5;
/** Ignore sub-meter displacement noise between consecutive fixes. */
export const MIN_SEGMENT_M = 1;
/** A gap longer than this between fixes breaks the segment (no distance credited across it). */
export const MAX_FIX_GAP_S = 15;

/** Net energy cost per km per kg of bodyweight (run ≈ level running, walk ≈ brisk). */
export const KCAL_PER_KG_KM: Record<CardioGait, number> = { run: 1.03, walk: 0.55 };

/** Great-circle distance in meters. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Whether one GPS segment counts toward distance. */
export function segmentCounts(args: {
  accuracyM: number | null;
  dopplerSpeedMs: number | null;
  segmentM: number;
  dtS: number;
}): boolean {
  const { accuracyM, dopplerSpeedMs, segmentM, dtS } = args;
  if (accuracyM == null || accuracyM > MAX_ACCURACY_M) return false;
  if (dtS <= 0 || dtS > MAX_FIX_GAP_S) return false;
  if (segmentM < MIN_SEGMENT_M) return false;
  if (segmentM / dtS > MAX_SPEED_MS) return false; // teleport
  // Doppler speed is the stationary detector: without real movement it sits ~0
  // even while position jitters by meters. Negative = invalid on iOS.
  if (dopplerSpeedMs == null || dopplerSpeedMs < MIN_SPEED_MS) return false;
  return true;
}

/** Distance-based calorie estimate; 0 when bodyweight is unknown (never guessed). */
export function kcalForKm(km: number, gait: CardioGait, weightKg: number | null | undefined): number {
  if (!weightKg || weightKg <= 0) return 0;
  return km * KCAL_PER_KG_KM[gait] * weightKg;
}

/** mm:ss (or h:mm:ss past an hour). */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return (h ? `${h}:` : '') + `${mm}:${String(r).padStart(2, '0')}`;
}

/** m:ss per km (— : — when undefined). */
export function fmtPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const r = Math.round(secPerKm % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Heart-rate zone label (Z1–Z5) for the live + detail readouts. */
export function hrZone(hr: number): string {
  if (hr < 132) return 'Z1';
  if (hr < 146) return 'Z2';
  if (hr < 162) return 'Z3';
  if (hr < 174) return 'Z4';
  return 'Z5';
}
