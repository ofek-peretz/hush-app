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

/**
 * A fix must be at least this tight (meters, horizontal) to be used at all.
 *
 * This stays at 30, NOT the 20 the first cut of this fix used. A tight cap looks like the obvious
 * answer to the chair, and it is the wrong one: a real run down a street of tall buildings, or
 * under heavy tree cover, reports 20–35 m routinely, and a 20 m cap silently records that run as
 * 0.00 km. Zeroing a real 10 km is a far worse failure than over-counting a chair, and the chair
 * is caught properly below — by asking the athlete to move FURTHER THAN THEIR OWN ERROR BAR,
 * which is the physics rather than a guess.
 */
export const MAX_ACCURACY_M = 30;
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
/**
 * Nothing is credited until the athlete has actually LEFT where they started — and "left" is
 * measured against THEIR OWN UNCERTAINTY, not a fixed number.
 *
 * A fix that reports ±30 m of accuracy can land 30 m from where the phone really is while the
 * phone has not moved at all. Asking such a session for a flat 25 m departure asks it for less
 * than its own error bar, which is asking for nothing. So the requirement is the LARGER of a
 * floor (a handful of strides) and a multiple of the reported accuracy: to be believed, you must
 * have gone further than the instrument could be wrong by.
 *
 * A real runner clears this in seconds (a 6 m fix needs 25 m; even a 30 m city-canyon fix needs
 * 60 m, which is fifteen seconds of jogging). A phone on a bench never clears it at all — its
 * "departure" is bounded by the noise, and the noise is exactly what it is being measured against.
 */
export const MIN_DEPARTURE_M = 25;
export const DEPARTURE_ACCURACY_FACTOR = 2;

export function requiredDepartureM(accuracyM: number | null): number {
  const acc = accuracyM ?? MAX_ACCURACY_M;
  return Math.max(MIN_DEPARTURE_M, DEPARTURE_ACCURACY_FACTOR * acc);
}

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

/** What the tracker remembers between fixes, so the proof rules can be decided by a pure
 *  function rather than scattered through the GPS callback. */
export interface MovementState {
  /** Consecutive plausible-movement segments immediately before this one. */
  movingRun: number;
  /** Straight-line distance from where the activity's first good fix landed (meters). */
  departedM: number;
  /** Horizontal accuracy of the fix being judged — the athlete's own error bar. */
  accuracyM: number | null;
  /**
   * Has this ACTIVITY already proven itself? Sticky, and deliberately so.
   *
   * The proof is expensive because it has to be: a run of movement that holds, from a phone that
   * has gone further than its own uncertainty. But it is a proof about the ACTIVITY — this person
   * is outdoors and running — and once it is made, it does not need remaking. Re-demanding it
   * after every traffic light would drop three fixes each time the athlete stops, which over a
   * 10 km run through a city is a hundred metres of real distance thrown away to guard against a
   * chair the athlete demonstrably is not sitting in.
   */
  proven: boolean;
}

export interface MovementCredit {
  /** Credit this segment's distance (and draw it on the route). */
  counts: boolean;
  /** The new consecutive-movement run to carry to the next fix. */
  movingRun: number;
  /** Whether the activity has now proven itself (carried forward for the rest of it). */
  proven: boolean;
}

/**
 * The FULL gate. A plausible segment is credited once the ACTIVITY has proven itself:
 *   • the movement HELD — MIN_MOVING_RUN consecutive plausible fixes, so one noisy fix is not a run;
 *   • and the athlete WENT somewhere — further from where they started than the fix could be
 *     wrong by (requiredDepartureM).
 * After that, any plausible segment counts; a stop at a light is a stop, not a re-trial.
 *
 * Pure, and exported, because this rule IS the product promise ("a phone on a bench records
 * nothing, a real run records all of itself") and both halves are pinned under test.
 */
export function movementCredit(plausible: boolean, state: MovementState): MovementCredit {
  if (!plausible) return { counts: false, movingRun: 0, proven: state.proven };
  const movingRun = state.movingRun + 1;
  const proven =
    state.proven ||
    (movingRun >= MIN_MOVING_RUN && state.departedM >= requiredDepartureM(state.accuracyM));
  return { counts: proven, movingRun, proven };
}

/** Distance-based calorie estimate; 0 when bodyweight is unknown (never guessed). */
export function kcalForKm(km: number, gait: CardioGait, weightKg: number | null | undefined): number {
  if (!weightKg || weightKg <= 0) return 0;
  return km * KCAL_PER_KG_KM[gait] * weightKg;
}

/**
 * ════ NOBODY IS ASKED WHETHER THEY ARE RUNNING — THE PACE ALREADY SAID ════
 *
 * ⛔ FOUNDER, 2026-08-04: *"about cardio — does she have to define a run or a walk? Or can we just
 * derive the calories / heart rate from the GPS distance?"*
 *
 * She never was asked (v7 opens straight into tracking) and the app has been billing every activity
 * at the RUNNING rate ever since: 1.03 kcal/kg/km against a walk's 0.55, so an hour's walk was
 * reported at nearly twice its true cost. The picker was removed and the constant it used to set was
 * left frozen on one value.
 *
 * ── ⚠️ WHY A THRESHOLD IS THE WRONG SHAPE, AND WHAT REPLACES IT ─────────────────────────────────
 * "Slower than X is a walk" has to be wrong somewhere, and it is wrong by 87% at the boundary: a
 * slow jogger one second the wrong side of it loses half her calories.
 *
 * The physiology says not to draw the line at all. ACSM's walking equation gives a NET cost of
 * ~0.5 kcal/kg/km and holds to 6.4 km/h; the running equation gives ~1.0 and holds from 8 km/h.
 * Between them neither applies, because between them the two gaits genuinely cost different amounts
 * and pace alone cannot say which one is happening. So that span is INTERPOLATED — the estimate
 * moves continuously through the region where the truth is unknown, instead of jumping.
 *
 * The result has no cliff anywhere, needs no question, and — because it is applied per segment —
 * counts a run with walking breaks correctly without anyone doing anything.
 */
/** Where ACSM's walking equation stops being valid: 6.4 km/h. */
const WALK_PACE_S = 3600 / 6.4;
/** …and where its running equation starts: 8 km/h. */
const RUN_PACE_S = 3600 / 8;

/** Net kcal per kg per km at this pace (sec/km). Continuous — see the header. */
export function kcalPerKgKm(paceSecPerKm: number): number {
  const run = KCAL_PER_KG_KM.run;
  const walk = KCAL_PER_KG_KM.walk;
  // A pace of zero is "not moving", which credits no distance anywhere — the rate is irrelevant, and
  // the running constant is the safe answer for a caller that asks anyway.
  if (!isFinite(paceSecPerKm) || paceSecPerKm <= 0) return run;
  if (paceSecPerKm <= RUN_PACE_S) return run;
  if (paceSecPerKm >= WALK_PACE_S) return walk;
  const t = (paceSecPerKm - RUN_PACE_S) / (WALK_PACE_S - RUN_PACE_S);
  return run + (walk - run) * t;
}

/**
 * The label for a finished kilometre, from its own pace. DISPLAY ONLY — the calories never round
 * through it, because rounding a continuous estimate into two buckets would put back the cliff the
 * function above exists to remove.
 */
export function gaitFromPace(paceSecPerKm: number): CardioGait {
  return paceSecPerKm > (RUN_PACE_S + WALK_PACE_S) / 2 ? 'walk' : 'run';
}

/** The calories a single credited segment is worth, billed at its own pace. */
export function kcalForSegment(km: number, paceSecPerKm: number, weightKg: number | null | undefined): number {
  if (!weightKg || weightKg <= 0) return 0;
  return km * kcalPerKgKm(paceSecPerKm) * weightKg;
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
