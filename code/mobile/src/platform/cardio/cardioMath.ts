/**
 * Pure cardio math — the honesty gates and formatters behind the live tracker.
 * Kept free of native imports (expo-location lives in cardioTracker) so the rules
 * that decide whether movement is real stay under plain unit test. These gates are
 * the fix for the Build #22 review finding: a phone sitting on a table displayed
 * 0.11 km · 5:39 /km · 147 bpm, because the tracker was a simulation. With real GPS,
 * distance may only accrue through `segmentCounts` — and a stationary device fails it.
 */
import type { CardioGait } from '@/data/local/models';

/**
 * ══ THE HONESTY GATES, HARDENED (founder 2026-07-12) ═══════════════════════════════════════
 *
 * The founder sat in a chair, indoors, and did not move. The summary showed 0.07 km and a
 * jagged 70-metre route through the room. The gates below existed; they were simply not tight
 * enough for the thing they were built to catch.
 *
 * Indoors, a phone has no satellites. iOS falls back to WiFi/cell trilateration, and that
 * source lies in a specific, well-known way: it reports an OPTIMISTIC horizontal accuracy
 * (routinely 10–30 m, i.e. inside our old 30 m gate), it hops between reference points every
 * few seconds (each hop is a real displacement of 10–40 m), and it hands us a Doppler `speed`
 * that is not Doppler at all — it is differentiated from those hops, so a jump of 15 m in 4 s
 * arrives labelled "3.7 m/s", i.e. a comfortable run.
 *
 * A single-fix test cannot tell that apart from running. What CAN tell them apart is that real
 * running is COHERENT and jitter is not:
 *   • Real movement holds. A runner who is moving now was moving a second ago (MIN_MOVING_RUN).
 *   • Real movement agrees with itself. The distance between two fixes is roughly what the
 *     reported speed says it should be. A WiFi hop's displacement and its speed are computed
 *     from the same noise and drift apart wildly (COHERENCE_LO / COHERENCE_HI).
 *   • Real movement goes somewhere. Jitter orbits its origin; a runner leaves it (MIN_DEPARTURE_M).
 *
 * The point of every one of these is the same: a stationary phone must record 0.00 km and an
 * EMPTY route, and it must do so by construction rather than by luck.
 */

/** A fix must be at least this tight (meters, horizontal) to be used at all. GPS outdoors is
 *  3–10 m; a 20 m cap keeps the WiFi-grade fixes that produced the chair "run" out entirely. */
export const MAX_ACCURACY_M = 20;
/** Doppler speed below this is standing still / indoor jitter — no distance, no pace. */
export const MIN_SPEED_MS = 0.5;
/** Displacement implying faster than this is a GPS teleport — discarded. */
export const MAX_SPEED_MS = 12.5;
/** Ignore sub-meter displacement noise between consecutive fixes. */
export const MIN_SEGMENT_M = 1;
/** A gap longer than this between fixes breaks the segment (no distance credited across it). */
export const MAX_FIX_GAP_S = 15;

/** Consecutive MOVING fixes required before any distance is credited. One fix can be noise;
 *  a run of them is a person. (The first fixes of a real run are credited retroactively.) */
export const MIN_MOVING_RUN = 3;
/**
 * Coherence between the geometry and the Doppler: `segmentM / dtS` must land within this band
 * around the reported speed. Real locomotion sits near 1.0 (a runner's straight-line
 * displacement ≈ their speed). A trilateration hop does not: its displacement is a teleport
 * while its "speed" is a smoothed derivative, so the ratio blows past the band in one direction
 * or collapses in the other.
 */
export const COHERENCE_LO = 0.45;
export const COHERENCE_HI = 2.2;
/** Nothing is credited until the athlete has actually LEFT where they started (meters). Jitter
 *  orbits its origin forever; 25 m is a handful of strides and outside any indoor cloud. */
export const MIN_DEPARTURE_M = 25;

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

/**
 * Whether one GPS segment is PLAUSIBLE movement — the per-fix half of the gate.
 *
 * This answers "could this pair of fixes be a person moving?", not "is it". The second
 * question needs history (a run of moving fixes, a departure from the origin) and lives in
 * `movementCredit` below, because a single segment cannot answer it.
 */
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
  // COHERENCE: the geometry and the Doppler must tell the same story (see the header).
  const geoSpeed = segmentM / dtS;
  const ratio = geoSpeed / dopplerSpeedMs;
  if (ratio < COHERENCE_LO || ratio > COHERENCE_HI) return false;
  return true;
}

/** What the tracker remembers between fixes, so the run-of-movement and departure rules can
 *  be decided by a pure function rather than scattered through the GPS callback. */
export interface MovementState {
  /** Consecutive plausible-movement segments immediately before this one. */
  movingRun: number;
  /** Straight-line distance from where the activity's first good fix landed (meters). */
  departedM: number;
}

export interface MovementCredit {
  /** Credit this segment's distance (and draw it on the route). */
  counts: boolean;
  /** The new consecutive-movement run to carry to the next fix. */
  movingRun: number;
}

/**
 * The FULL gate: a plausible segment is credited only once the movement has proven itself —
 * it has held for MIN_MOVING_RUN consecutive fixes, and the athlete has actually left the
 * place they started.
 *
 * Pure, and exported, because this rule is the product promise ("a phone on a bench records
 * nothing") and it is worth pinning under test with the founder's own chair session.
 */
export function movementCredit(plausible: boolean, state: MovementState): MovementCredit {
  if (!plausible) return { counts: false, movingRun: 0 };
  const movingRun = state.movingRun + 1;
  const proven = movingRun >= MIN_MOVING_RUN && state.departedM >= MIN_DEPARTURE_M;
  return { counts: proven, movingRun };
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
