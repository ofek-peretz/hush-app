/**
 * THE RUN ITSELF — one accumulator, module-level, fed by whichever GPS path is alive.
 *
 * ════ WHY THIS IS NOT A REACT REF ANY MORE (founder 2026-07-29) ════
 *
 * A run happens with the phone in a pocket. Until now the accumulator lived inside
 * `useCardioTracker`'s ref and the fixes arrived through `watchPositionAsync`, which iOS suspends
 * the moment the app leaves the screen — so an athlete who pocketed her phone and ran 10 km came
 * back to **0.00 km**. Not an under-count: nothing at all.
 *
 * Real background location on iOS arrives through a TaskManager task, and a task is NOT a
 * component: it can be woken with the whole React tree torn down. So the state it writes cannot
 * live in a hook. It lives here, and BOTH paths — the foreground watch and the background task —
 * call the same `ingestFix`. One set of honesty gates, one distance, one set of splits, whichever
 * way the fix arrived.
 *
 * Everything that DECIDES anything is still in `cardioMath` (pure, native-free, unit-tested); this
 * file only holds the running totals and the order the gates are applied in. It was lifted out of
 * the hook verbatim, deliberately: the gates are the product of a founder-reported defect (a chair,
 * indoors, recording 0.07 km) and they are not the place to be clever while moving code.
 */

// 

import type { CardioPoint, CardioSplit } from '@/data/local/models';
import {
  MAX_ACCURACY_M,
  MIN_SPEED_MS,
  fmtPace,
  haversineM,
  kcalForSegment,
  gaitFromPace,
  movementCredit,
  segmentCounts,
} from './cardioMath';
import { notifier } from '@/platform/notifications';
import { cardioLiveActivity } from '@/platform/liveActivity';
import { averageHeartRate } from '@/domain/heartRate';
import { db } from '@/data/local/db';

/**
 * ⛔ NOBODY COVERS A KILOMETRE FASTER THAN THIS. 120 s/km is 30 km/h — quicker than the world
 * record for 100 m, held for a kilometre. A figure under it is never the athlete; it is the SOURCE
 * talking (a flush whose window we misread, a fix pair with a broken timestamp), and "0:02 /km" on
 * the stage is the same lie as a pace on a table. It is clamped rather than drawn.
 */
const FASTEST_PACE_S = 120;

/**
 * How long an interrupted run stays resumable — see `restoreRun`. Deliberately far shorter than the
 * gym session's three hours (`state/sessionRecovery`): a workout is a visit and a run is a run, and
 * the failure this window guards against is not losing kilometres but INVENTING them.
 */
export const CARDIO_RESUME_WINDOW_MS = 20 * 60 * 1000;

/** At most one write per this many ms — see `persist`. A closed kilometre always writes. */
const PERSIST_EVERY_MS = 10_000;

/**
 * ════ ⛔ THE LIVE ACTIVITY IS FED FROM THE EVENT PATH (founder, device QA 2026-08-23:
 * "בדקת גם שזה מתעדכן ב-Dynamic Island ו-Live Activity? הכל?") ════
 *
 * It was not, and his question found it. The island's update lived ONLY in the screen's effect,
 * keyed off a one-second `setInterval` — and React Native timers are driven by the display link,
 * which stops the moment the screen locks. So even with the background task fixed and every metre
 * being credited, the LOCK SCREEN — the one surface she can actually see mid-run — froze its
 * distance at whatever it read last. (The clock kept ticking: `Text(timerInterval:)` is native and
 * drift-proof by design. That contrast — a moving clock over frozen metres — is exactly what a
 * athlete reads as "it paused".)
 *
 * GPS deliveries are EVENTS, not timers: the task wakes JS for every fix, in the pocket too — it
 * is the same path the per-kilometre notification already rides. So the activity is published from
 * here, where the metre is credited: throttled, and FORCED on a closed kilometre (the beat the
 * lock screen exists to show). The screen's own once-a-second update continues in the foreground
 * and simply outruns this one there; the native side ignores an update with no live activity, so
 * publishing before the screen has started one costs nothing.
 */
const LA_PUBLISH_EVERY_MS = 15_000;
let laPublishedAtMs = 0;

function publishLiveActivity(force: boolean): void {
  if (!s.active) return;
  const now = Date.now();
  if (!force && now - laPublishedAtMs < LA_PUBLISH_EVERY_MS) return;
  laPublishedAtMs = now;
  const elapsed = elapsedSec();
  const last = s.splits[s.splits.length - 1];
  const fastest = s.splits.length ? Math.min(...s.splits.map((x) => x.paceSec)) : Infinity;
  void cardioLiveActivity
    .update({
      kind: 'cardio',
      // The lobby has no gait picker (v7): the screen publishes the same constant. Cosmetic only —
      // the widget spends it on a legend word.
      gait: 'run',
      paused: s.paused,
      // The same re-anchor the screen makes: the native clock ticks from `now − elapsed`, so a
      // background stretch never accumulates drift.
      startedAtMs: now - elapsed * 1000,
      elapsedSec: elapsed,
      distanceKm: Math.round((s.distM / 1000) * 100) / 100,
      paceSec: Math.round(s.paceSec),
      hr: s.hr != null ? Math.round(s.hr) : 0,
      calories: Math.round(s.cal),
      lastSplit: last ? { km: last.km, paceSec: Math.round(last.paceSec), fastest: last.paceSec <= fastest } : null,
    })
    .catch(() => {});
}

export type GpsState = 'idle' | 'acquiring' | 'ready' | 'denied' | 'unavailable';

export interface CardioSample {
  elapsedSec: number;
  distanceKm: number;
  /** Live pace over recent movement, sec/km; 0 (⇒ "--:--") when not moving or no lock. */
  paceSec: number;
  /**
   * bpm, from the athlete's watch by way of HealthKit — and ONLY while the reading is still
   * fresh (see `domain/heartRate`). Null is the dash, and it is the honest answer far more often
   * than not: no watch, no grant, or a watch that has not written for a minute and a half.
   */
  hr: number | null;
  /**
   * The mean of every LIVE reading this activity has collected — the figure the saved record and
   * the summary card carry. It is on the SAMPLE rather than read at save time on purpose: the run
   * is torn down the instant the activity ends, and the summary is drawn after that, so the last
   * published snapshot has to already hold it. `undefined` = no reading was ever live, and the
   * record then carries no average at all (never a 0).
   */
  avgHr: number | undefined;
  calories: number; // kcal, distance-based; 0 until real distance exists
  splits: CardioSplit[];
  gps: GpsState;
  /**
   * The path actually travelled (founder 2026-07-12) — every counted fix, in order, so the
   * summary can draw the route the athlete ran. Only fixes that PASSED the accuracy + movement
   * gates are kept, so the trace is the same honest data the distance is: a stationary session
   * records no path at all, rather than a jitter cloud around a bench.
   */
  route: CardioPoint[];
}

/** One accepted GPS fix, in the shape both paths hand over. */
export interface Fix {
  lat: number;
  lon: number;
  tsMs: number;
  /** Horizontal accuracy in metres; null/absent = unusable. */
  accuracyM: number | null;
  /** Doppler speed in m/s; null when the platform did not report one. */
  speedMs: number | null;
}

interface Prev {
  lat: number;
  lon: number;
  tsMs: number;
}

const EMPTY = () => ({
  active: false,
  paused: true,
  /** Which run this is. Only ever compared — a snapshot read that lands after the run it was asked
   *  for has ended must not pour an old run into a new one (see `restoreRun`). */
  runId: 0,
  weightKg: null as number | null | undefined,
  activeMs: 0, // accumulated while running
  resumedAtMs: 0, // wall-clock instant of the last resume (0 = not running)
  distM: 0,
  cal: 0,
  paceSec: 0,
  splits: [] as CardioSplit[],
  lastKm: 0,
  splitStartSec: 0,
  lastFix: null as Prev | null,
  // The instant of the newest fix EVER accepted — see the monotonic guard in `ingestFix`. It
  // deliberately survives a pause and a bad fix, both of which clear `lastFix`.
  lastTsMs: 0,
  gps: 'idle' as GpsState,
  // The last LIVE reading (already through the freshness gate), and every one this activity has
  // seen — the average on the saved record is built from these and nothing else.
  hr: null as number | null,
  hrReadings: [] as number[],
  route: [] as CardioPoint[],
  // The movement proof (see cardioMath): where the activity started, how far the athlete has
  // actually got from it, how many consecutive fixes have looked like real movement — and
  // whether the activity has already proven itself (once proven, it stays proven).
  origin: null as Prev | null,
  departedM: 0,
  movingRun: 0,
  proven: false,
  /*
   * ⛔ INDOORS — no satellite, and no route (founder, 2026-08-12). The distance arrives as a
   * CUMULATIVE reading from Core Motion by way of HealthKit rather than as positions, so there is
   * nothing to draw a line between and none of the GPS gates apply: they exist to reject a phone on
   * a table, and Core Motion already refuses to invent steps for one.
   */
  indoor: false,
  /** The last cumulative kilometres read. The DELTA is what gets credited — see `ingestStride`. */
  strideKm: 0,
  strideTsMs: 0,
  /**
   * ⛔ THE INSTANT THE LAST STRIDE DISTANCE WAS CREDITED — which is NOT the last poll.
   *
   * Health flushes `DistanceWalkingRunning` in batches minutes apart against a five-second poll, so
   * the interval a flushed segment was covered in is the time since the last one that carried
   * anything, never the gap between two reads. See `ingestStride`.
   */
  strideCreditTsMs: 0,
  /** Wall-clock of the last resume write — the throttle in `persist`. */
  persistedAtMs: 0,
});

let s = EMPTY();
/** Monotonic across runs; stamped onto `s.runId` so an in-flight storage read can tell whether the
 *  run it was reading for is still the run that is happening. */
let runSeq = 0;

export const ZERO: CardioSample = {
  elapsedSec: 0,
  distanceKm: 0,
  paceSec: 0,
  hr: null,
  avgHr: undefined,
  calories: 0,
  splits: [],
  gps: 'idle',
  route: [],
};

/** Wall-clock elapsed, accumulated across pause/resume — never an interval tick count. */
export function elapsedSec(): number {
  const runMs = s.resumedAtMs > 0 ? Date.now() - s.resumedAtMs : 0;
  return Math.round((s.activeMs + runMs) / 1000);
}

/**
 * A fresh activity. Everything the previous one accumulated is gone — except what an INTERRUPTED
 * one wrote down, which `restoreRun` folds back in behind this call.
 *
 * ⚠️ THE GAIT ARGUMENT IS GONE (2026-08-18). It was set here, stored, and read by nothing: the
 * picker was deleted in v7 and the energy has been billed per segment at the pace it was covered at
 * ever since (see the note at `ingestFix`). A parameter nobody reads is a question the product is
 * still pretending to ask.
 */
export function beginRun(weightKg?: number | null, indoor = false): void {
  s = EMPTY();
  s.active = true;
  s.runId = ++runSeq;
  s.weightKg = weightKg;
  s.indoor = indoor;
  /*
   * ⚠️ AN INDOOR RUN IS NEVER "acquiring". That word names a satellite it is not waiting for, and
   * the stage draws a spinner for it — so a treadmill session would sit under "acquiring GPS"
   * forever. `ready` is the truth: the source is the phone's own motion, and it is available now.
   */
  s.gps = indoor ? 'ready' : 'acquiring';
  void restoreRun(s.runId, indoor);
}

export function isIndoor(): boolean {
  return s.indoor;
}

export function endRun(): void {
  s = EMPTY();
  /*
   * The run is over, so there is nothing left to resume — and a snapshot that outlives its run is
   * exactly how a finished run comes back to haunt the next one.
   */
  void db.clearCardioResume().catch(() => {});
}

export function isRunning(): boolean {
  return s.active;
}

/**
 * A heart-rate reading, already judged live by `domain/heartRate`. `null` means the gate refused
 * it — the row goes back to a dash rather than holding the last number it liked, which would be
 * the stale-pulse lie with extra steps.
 */
export function setHeartRate(bpm: number | null): void {
  if (!s.active) return;
  s.hr = bpm;
  if (bpm != null) s.hrReadings.push(bpm);
}

/** Every live reading this activity collected — the source of the saved average. */
export function heartRateReadings(): readonly number[] {
  return s.hrReadings;
}

/*
 * ⛔ `setGait` IS DELETED (2026-08-18), with the field it wrote to. The run/walk picker went in v7
 * and nothing has read the declared gait since: `kcalForSegment` prices every credited stretch at
 * the pace it was actually covered at, and `gaitFromPace` labels each finished kilometre from its
 * own split. A setter for a fact nobody reads is worse than no setter — it reads, to the next
 * person, as though the declaration still decides something.
 */

export function setWeight(weightKg?: number | null): void {
  s.weightKg = weightKg;
}

export function setGps(state: GpsState): void {
  s.gps = state;
}

/**
 * Pause / resume. A pause BREAKS the GPS segment — no distance is credited across it, and the
 * movement has to prove itself again on resume (a paused athlete is a still one).
 */
export function setPaused(paused: boolean): void {
  if (paused === s.paused) return;
  if (paused) {
    if (s.resumedAtMs > 0) s.activeMs += Date.now() - s.resumedAtMs;
    s.resumedAtMs = 0;
    s.lastFix = null;
    s.movingRun = 0;
    s.paceSec = 0;
  } else {
    s.resumedAtMs = Date.now();
  }
  s.paused = paused;
}

export function snapshot(): CardioSample {
  return {
    elapsedSec: elapsedSec(),
    distanceKm: s.distM / 1000,
    paceSec: s.paceSec,
    hr: s.hr,
    avgHr: averageHeartRate(s.hrReadings),
    calories: s.cal,
    splits: s.splits,
    gps: s.gps,
    route: s.route,
  };
}

/**
 * ONE FIX, THROUGH THE GATES. Lifted verbatim out of the hook's `watchPositionAsync` callback —
 * the order of the tests IS the design (see `cardioMath`). Called from the foreground watcher and
 * from the background task alike; neither knows which one it is.
 */
export function ingestFix(fix: Fix): void {
  if (!s.active) return;
  const { lat: latitude, lon: longitude, tsMs, accuracyM: accuracy, speedMs: speed } = fix;
  /**
   * ════ TIME ONLY GOES FORWARD (and this is why the two paths are safe) ════
   *
   * The foreground watcher and the background task BOTH deliver, at the same time, whenever the
   * app is on screen — iOS does not stop the task just because the athlete is looking. So the same
   * fix arrives twice, and a background delivery arrives BATCHED: three fixes at once, after the
   * foreground has already moved past them.
   *
   * A duplicate is harmless on its own (`dtS <= 0` fails `segmentCounts`, so nothing is credited).
   * What is NOT harmless is that it would still overwrite `lastFix` — rewinding the chain to a
   * point already travelled, so the NEXT fix re-measures a segment the run has already counted and
   * adds it a second time. A 10 km run could report 15.
   *
   * So an older-or-equal fix is not new information and is dropped before it can touch anything.
   * `lastTsMs` is separate from `lastFix` on purpose: a pause and a poor fix both clear the chain,
   * and neither of them makes the past interesting again.
   */
  if (tsMs <= s.lastTsMs) return;
  s.lastTsMs = tsMs;
  const goodFix = accuracy != null && accuracy <= MAX_ACCURACY_M;
  if (goodFix && s.gps !== 'ready') s.gps = 'ready';
  if (s.paused || !goodFix) {
    if (!goodFix) {
      s.lastFix = null; // a poor fix breaks the segment
      s.movingRun = 0; // …and the movement has to prove itself again
    }
    return;
  }
  const prev = s.lastFix;
  s.lastFix = { lat: latitude, lon: longitude, tsMs };
  // The origin is the first fix good enough to trust. Everything the athlete has to beat — the
  // departure test — is measured from here.
  if (!s.origin) s.origin = { lat: latitude, lon: longitude, tsMs };
  s.departedM = haversineM(s.origin.lat, s.origin.lon, latitude, longitude);
  if (!prev) return;

  const dtS = (tsMs - prev.tsMs) / 1000;
  const segM = haversineM(prev.lat, prev.lon, latitude, longitude);
  const plausible = segmentCounts({ accuracyM: accuracy, dopplerSpeedMs: speed, segmentM: segM, dtS });
  // A plausible segment still has to PROVE itself: movement that holds across consecutive fixes,
  // from a phone that has gone further than its own error bar. This is what a chair cannot fake
  // (founder 2026-07-12 — see cardioMath). The proof is made once per activity, not once per stride.
  const credit = movementCredit(plausible, {
    movingRun: s.movingRun,
    departedM: s.departedM,
    accuracyM: accuracy,
    proven: s.proven,
  });
  s.movingRun = credit.movingRun;
  s.proven = credit.proven;

  // Pace shows recent MOVEMENT, never elapsed/position artifacts: a light EMA over Doppler speed
  // while moving; blank the moment movement stops. It follows the same proof as the distance — a
  // pace with no credited distance behind it is the exact "5:39 /km on a table" lie this whole
  // module exists to prevent.
  if (credit.counts && speed != null && speed >= MIN_SPEED_MS) {
    const inst = 1000 / speed; // sec/km
    s.paceSec = s.paceSec > 0 ? Math.round(s.paceSec * 0.7 + inst * 0.3) : Math.round(inst);
  } else if (!plausible) {
    s.paceSec = 0;
  }
  if (!credit.counts) return;

  /*
   * ⛔ THE GAIT IS MEASURED, NOT DECLARED (founder 2026-08-04). The declared gait was a frozen
   * 'run' — the picker was deleted in v7 and the constant it used to set stayed behind, so a walk
   * was billed at the running rate: nearly double. The pace is right here and already smoothed; it
   * is the answer to the question nobody is being asked. (The field itself is gone as of
   * 2026-08-18; see the note where `setGait` used to stand.)
   */
  const rate = s.paceSec;
  // The trace records only fixes that COUNTED — the same gate as the distance, so the drawn route
  // can never disagree with the kilometres beside it. The first point of a segment is seeded too,
  // so a resumed leg starts where the athlete stands.
  //
  // PUSHED, not re-spread: an hour's run is ~3,600 fixes, and rebuilding the array on every one is
  // quadratic. The array identity is deliberately stable — nothing renders the route live, so a
  // new reference each second would only churn.
  if (s.route.length === 0) s.route.push({ lat: prev.lat, lon: prev.lon });
  s.route.push({ lat: latitude, lon: longitude });
  // The segment's OWN span — the fix gap, which outdoors is about a second. It is what a kilometre
  // closing inside this segment is timed against (see `creditDistance`).
  creditDistance(segM, rate, dtS);
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A RUN THAT LIVES ONLY IN MEMORY IS A RUN iOS CAN TAKE (2026-08-18)
 *
 * Everything above this line lived in one module singleton and reached storage NOWHERE until
 * `CardioComplete` mounted. So an eviction mid-run — the precise case the background task exists
 * for — took the distance, the splits, the route and the calories with it, and the athlete came
 * back to nothing at all. The strength side has had `saveActiveSession`, a resume snapshot and a
 * salvage since S3; the cardio side had none of the three.
 *
 * The earned totals are written down AS THEY ARE EARNED. This is what `snapshot()` publishes plus
 * what the accumulator needs to carry on: the clock it had already run, the split cursor, and the
 * readings the average is built from.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT HERE IS THE SOURCE CURSOR (`strideKm`). The indoor poll asks Health
 * for the distance since THIS mount, so a resumed run opens a new window; restoring an old
 * cumulative cursor would credit the gap between them twice.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface CardioResume {
  schema: 1;
  /** Epoch ms of this write — the resume window is measured from it. */
  savedAt: number;
  indoor: boolean;
  activeMs: number;
  distM: number;
  cal: number;
  lastKm: number;
  splitStartSec: number;
  splits: CardioSplit[];
  hrReadings: number[];
  route: CardioPoint[];
}

/**
 * Write the run down. Called from the one place the totals can change, and THROTTLED — except at a
 * closed kilometre, which always lands.
 *
 * ⚠️ A GPS run credits about once a second and carries its whole trace with it; serialising 3,600
 * points every second would spend the run's battery on storage. Ten seconds is the most an eviction
 * can cost her, and the kilometre — the thing she would notice missing — is never delayed at all.
 */
function persist(atKilometre: boolean): void {
  const now = Date.now();
  if (!atKilometre && now - s.persistedAtMs < PERSIST_EVERY_MS) return;
  s.persistedAtMs = now;
  const runMs = s.resumedAtMs > 0 ? now - s.resumedAtMs : 0;
  const snap: CardioResume = {
    schema: 1,
    savedAt: now,
    indoor: s.indoor,
    activeMs: s.activeMs + runMs,
    distM: s.distM,
    cal: s.cal,
    lastKm: s.lastKm,
    splitStartSec: s.splitStartSec,
    splits: s.splits,
    hrReadings: s.hrReadings,
    route: s.route,
  };
  void db.saveCardioResume(snap).catch(() => {});
}

/**
 * ⛔ AND IT IS READ BACK ONCE, INTO A RUN THAT HAS EARNED NOTHING YET.
 *
 * Folded into the next `beginRun` of the same KIND, inside the resume window, and only while the
 * new run is still empty — a storage read is a round trip and a fix can land first.
 *
 * ⚠️ THE WINDOW IS SHORT ON PURPOSE (`CARDIO_RESUME_WINDOW_MS`). A run that ends normally clears
 * the snapshot as it ends, so the only one that can survive is a run the app never got to finish.
 * Twenty minutes is an interruption she came back from; two hours is a different run, and pouring
 * this morning's five kilometres into this evening's would be the one thing worse than losing them.
 */
async function restoreRun(id: number, indoor: boolean): Promise<void> {
  try {
    const snap = await db.loadCardioResume();
    if (!snap || snap.schema !== 1) return;
    if (!s.active || s.runId !== id) return; // the run ended, or another began, while we read
    if (!!snap.indoor !== !!indoor) {
      // A belt's metres are not a street's, and neither is the trace. Nothing to fold in.
      void db.clearCardioResume().catch(() => {});
      return;
    }
    if (Date.now() - snap.savedAt > CARDIO_RESUME_WINDOW_MS) {
      void db.clearCardioResume().catch(() => {});
      return;
    }
    if (s.distM > 0 || s.splits.length > 0) return; // this run has already earned something of its own
    s.activeMs += Math.max(0, snap.activeMs || 0);
    s.distM = snap.distM || 0;
    s.cal = snap.cal || 0;
    s.lastKm = snap.lastKm || 0;
    s.splitStartSec = snap.splitStartSec || 0;
    s.splits = snap.splits ?? [];
    s.hrReadings = [...(snap.hrReadings ?? [])];
    s.route = [...(snap.route ?? [])];
  } catch {
    /* a storage hiccup costs the resume, never the run — it carries on from zero, as it always did */
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE CREDITED TAIL, SHARED BY BOTH SOURCES (2026-08-12)
 *
 * Everything that happens once a stretch of ground has been EARNED: the metres, the calories at the
 * pace they were covered at, the kilometre split, and the notification.
 *
 * ⚠️ IT IS EXTRACTED RATHER THAN COPIED, and that is the point. The indoor path credits the same
 * facts from a different sensor, and two copies of "add the metres, bill the calories, cut the
 * split" would eventually disagree about a kilometre — which is the shape of nearly every defect
 * this module's own header records.
 *
 * What is NOT here is the route: a treadmill has no positions, and the trace is written by the
 * caller that has them.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function creditDistance(segM: number, paceSecPerKm: number, segSec: number): void {
  const fromM = s.distM;
  s.distM += segM;
  s.cal += kcalForSegment(segM / 1000, paceSecPerKm, s.weightKg);
  const kmDone = Math.floor(s.distM / 1000);
  if (kmDone <= s.lastKm) {
    persist(false);
    publishLiveActivity(false); // the lock screen breathes with the metres — see the publisher
    return;
  }
  /*
   * ⛔ ONE SEGMENT CAN CLOSE MORE THAN ONE KILOMETRE (2026-08-18)
   *
   * This used to cut AT MOST ONE split per credited stretch — true of the satellite, which arrives
   * a second at a time, and false of the treadmill, which arrives in a batch Health flushed minutes
   * later. A batch that crossed three boundaries wrote one row, and the athlete's list of
   * kilometres OPENED AT "km 3": the first two never existed, and the one row that did claimed the
   * whole batch's time for itself.
   *
   * ⚠️ THE TIME IS APPORTIONED BY DISTANCE, because distance is the only thing we know about the
   * inside of the segment. It is an estimate and it is a bounded one — the alternatives are a
   * kilometre with no time at all, or one kilometre wearing the time of three.
   */
  const endSec = elapsedSec();
  const startSec = Math.max(s.splitStartSec, endSec - Math.max(0, Math.round(segSec)));
  for (let km = s.lastKm + 1; km <= kmDone; km++) {
    const at = segM > 0 ? startSec + ((km * 1000 - fromM) / segM) * (endSec - startSec) : endSec;
    const closedSec = Math.min(endSec, Math.max(s.splitStartSec, Math.round(at)));
    const sec = closedSec - s.splitStartSec;
    s.splitStartSec = closedSec;
    const kmKcal = kcalForSegment(1, sec, s.weightKg);
    s.splits = [...s.splits, { km, durationSec: sec, paceSec: sec, gait: gaitFromPace(sec), ...(kmKcal > 0 ? { kcal: Math.round(kmKcal) } : {}) }];
    /**
     * …and it is ANNOUNCED (founder 2026-07-29: "in cardio, a notification for every kilometre").
     * Delivered now, not scheduled: the split has already happened. The on-screen moment (3.4b)
     * and the haptic still carry it when she is looking; this is the path for a phone in a pocket,
     * which is where a phone is during a run — and it is the reason the background task exists.
     *
     * ⚠️ EVERY kilometre the batch closed is announced, not just the last. Each one is a real
     * kilometre she really ran, and one of them arriving is exactly how she learns the other two
     * were dropped.
     */
    void notifier.kilometre(km, fmtPace(sec));
  }
  s.lastKm = kmDone;
  persist(true);
  publishLiveActivity(true); // a closed kilometre is the beat the lock screen exists to show
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ ONE CUMULATIVE DISTANCE READING — THE TREADMILL'S FIX (founder, 2026-08-12)
 *
 * `HKQuantityTypeIdentifierDistanceWalkingRunning` since the run began, in kilometres. Core Motion
 * derives it from step cadence and a stride-length model calibrated on her outdoor GPS work, so it
 * is the same measurement Apple's own indoor workouts report — **and it needs no watch**: the
 * coprocessor is in the phone.
 *
 * ⚠️ CUMULATIVE, SO THE DELTA IS WHAT IS CREDITED. Reading the total and adding it would double the
 * run every poll. It is also monotonic by construction; a reading that went backwards would be a
 * source resetting under us, and it is dropped rather than credited as negative distance.
 *
 * ⚠️ AND THE PACE IS DERIVED FROM THE SEGMENT, not asked for. That is what lets `kcalPerKgKm`
 * interpolate a walk and a run correctly on a treadmill exactly as it already does outdoors —
 * nobody is asked which one this is, indoors or out.
 *
 * ⚠️ NOTHING IS CREDITED WHILE PAUSED, and the cursor still advances. Otherwise the distance she
 * covered walking to the water fountain would arrive in one lump on resume.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ingestStride(cumulativeKm: number, tsMs: number = Date.now()): void {
  if (!s.active || !s.indoor) return;
  if (!Number.isFinite(cumulativeKm) || cumulativeKm < 0) return;
  if (tsMs <= s.strideTsMs) return;
  const prevKm = s.strideKm;
  const prevTs = s.strideTsMs;
  const sinceCreditMs = s.strideCreditTsMs;
  s.strideKm = cumulativeKm;
  s.strideTsMs = tsMs;
  if (prevTs === 0) {
    s.strideCreditTsMs = tsMs; // the first reading only sets the cursor — there is no interval yet
    return;
  }
  if (s.paused) {
    // The cursor advances through a pause and so does the interval's start: the distance she covered
    // walking to the fountain is not credited, and the seconds it took are not charged to the
    // segment that follows it either.
    s.strideCreditTsMs = tsMs;
    return;
  }
  const segKm = cumulativeKm - prevKm;
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE INTERVAL IS THE TIME THE DISTANCE TOOK, NOT THE GAP BETWEEN TWO POLLS (2026-08-18)
   *
   * This read `(tsMs - prevTs) / 1000` — the fixed five-second `STRIDE_POLL_MS`. But Health flushes
   * `DistanceWalkingRunning` in BATCHES minutes apart, so poll after poll returns the same
   * cumulative figure and then one poll returns half a kilometre. Divided by five seconds that is
   * **0:10 /km on a treadmill**, and it was worse than a wrong figure on a stage: `kcalForSegment`
   * bills at the pace it is handed, so the whole batch was priced at the RUN constant (1.03) even
   * when she walked every metre of it — an 87% over-count, the exact defect the founder ruled out
   * on 2026-08-04 when he had the gait picker removed.
   *
   * A cumulative source cannot tell us when inside the drought she covered it, but it CAN tell us
   * the window: everything since the last reading that carried distance. That is the interval.
   * ════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const dtS = (tsMs - sinceCreditMs) / 1000;
  if (segKm <= 0 || dtS <= 0) {
    // Standing still on a moving belt is still standing still. No distance, and the pace blanks
    // rather than holding the last number it liked.
    s.paceSec = 0;
    return;
  }
  s.strideCreditTsMs = tsMs;
  // …and a figure faster than any human is the source, not the athlete — see `FASTEST_PACE_S`.
  const inst = Math.max(FASTEST_PACE_S, Math.round(dtS / segKm)); // sec/km over this segment
  s.paceSec = s.paceSec > 0 ? Math.round(s.paceSec * 0.7 + inst * 0.3) : inst;
  creditDistance(segKm * 1000, s.paceSec, dtS);
}
