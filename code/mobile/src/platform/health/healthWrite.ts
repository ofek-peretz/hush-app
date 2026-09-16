/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER WORKOUT REACHES HER RINGS — the one write Hush makes to Apple Health.
 *
 * ⛔ FOUNDER, 2026-08-23 (the world-class mandate): *"קח את כל מה שיש להם ועובד אצלם טוב ותכניס אותו
 * אצלנו."* Every serious competitor writes the finished workout to Health, and the reason is not a
 * checkbox: **an hour under a bar that does not close her Move ring is an hour Apple's own daily
 * habit loop counts against this app.** She trained; her watch says she did nothing; the resentment
 * lands on Hush.
 *
 * ── ⚠️ AND THE APP HAS CLAIMED THIS IN WRITING SINCE THE PLIST WAS AUTHORED ─────────────────────
 * `NSHealthUpdateUsageDescription` has said *"Hush saves your completed strength workouts to Apple
 * Health"* on every build — a sentence iOS shows HER in Settings — while the gate's contract said
 * *"never write to Health (no `toShare`)"*. One of the two had to stop being true, and under the
 * mandate it is the read-only contract that yields: it was ratified before the plist promise
 * shipped, and the ingestion layer has anticipated this write in writing all along (*"OUR OWN RUNS
 * COME BACK THROUGH HERE TOO once the cardio stage writes to Health"*).
 *
 * ── WHAT THIS FILE REFUSES TO DO, WHICH IS MOST THINGS ──────────────────────────────────────────
 *   · It never BLOCKS a save. The session is on disk before this is called, fire-and-forget; a
 *     Health failure costs the ring, never the record.
 *   · It never PROMPTS. Writing rides the permission she granted at Connect Health; if sharing was
 *     never authorized the save throws inside the guard and nothing happens. The one prompt stays
 *     where it has always been.
 *   · It never invents a figure. `kcal` is passed only when her bodyweight priced one (the same
 *     honesty gate every calorie in this product already keeps: no body, no number) — a workout
 *     with no energy figure is written WITHOUT one, never with a guess.
 *   · It is iOS-only and lazy, like the gate beside it: the native module never loads on web /
 *     Expo Go / jest, and every path degrades to a silent no-op.
 *
 * ── THE DOUBLE-COUNT, CLOSED AT THE READER ──────────────────────────────────────────────────────
 * What we write, `queryWorkoutSamples` reads back — so `coachFacts.externalFrom` now excludes
 * anything that overlaps HER OWN record (runs AND strength sessions, same ±5-minute rule). The gate
 * stays opinion-free, exactly as its header demands; the caller that holds her record is the one
 * that can tell.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { Platform } from 'react-native';

/** What a finished strength session hands over. Times are ISO; kcal only when honestly priced. */
export interface StrengthWorkoutWrite {
  startedAt: string;
  endedAt: string;
  kcal?: number | null;
}

/** What a finished run/walk hands over. */
export interface CardioWorkoutWrite {
  gait: 'run' | 'walk';
  startedAt: string;
  endedAt: string;
  km?: number | null;
  kcal?: number | null;
}

export interface HealthWriter {
  /** Write the finished strength session. Resolves true iff Health accepted it. Never throws. */
  strength(w: StrengthWorkoutWrite): Promise<boolean>;
  /** Write the finished run/walk. Resolves true iff Health accepted it. Never throws. */
  cardio(w: CardioWorkoutWrite): Promise<boolean>;
}

/** The no-op used everywhere the native module cannot exist. */
export const healthWriteStub: HealthWriter = {
  async strength() {
    return false;
  },
  async cardio() {
    return false;
  },
};

/*
 * HKWorkoutActivityType raw values — Apple's own, stable since iOS 8, mirrored by the generated
 * enum in `@kingstinct/react-native-healthkit`. Named here so the call sites read as sentences.
 */
const ACTIVITY_STRENGTH = 50; // traditionalStrengthTraining
const ACTIVITY_RUNNING = 37;
const ACTIVITY_WALKING = 52;

function span(startedAt: string, endedAt: string): { start: Date; end: Date } | null {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  // A workout that ended before it began, or in under a minute, is a record defect — Health would
  // accept it and her history would carry a nonsense entry she cannot delete from our side.
  if (end.getTime() - start.getTime() < 60_000) return null;
  return { start, end };
}

const healthWriteNative: HealthWriter = {
  async strength(w) {
    try {
      const at = span(w.startedAt, w.endedAt);
      if (!at) return false;
      const hk = await import('@kingstinct/react-native-healthkit');
      if (!(await hk.isHealthDataAvailableAsync())) return false;
      /*
       * ⚠️ TOTALS, NOT SAMPLES. The energy figure is the session's one derived number (the declared
       * S-76 estimate); writing it as the workout's total is exactly what it is. Per-set samples
       * would be manufacturing measurements Hush never took.
       */
      await hk.saveWorkoutSample(
        ACTIVITY_STRENGTH,
        [],
        at.start,
        at.end,
        w.kcal != null && w.kcal > 0 ? { energyBurned: Math.round(w.kcal) } : {},
      );
      return true;
    } catch {
      return false; // not authorized / no module / Health error — the record is already safe on disk
    }
  },

  async cardio(w) {
    try {
      const at = span(w.startedAt, w.endedAt);
      if (!at) return false;
      const hk = await import('@kingstinct/react-native-healthkit');
      if (!(await hk.isHealthDataAvailableAsync())) return false;
      await hk.saveWorkoutSample(w.gait === 'run' ? ACTIVITY_RUNNING : ACTIVITY_WALKING, [], at.start, at.end, {
        ...(w.km != null && w.km > 0 ? { distance: w.km * 1000 } : {}),
        ...(w.kcal != null && w.kcal > 0 ? { energyBurned: Math.round(w.kcal) } : {}),
      });
      return true;
    } catch {
      return false;
    }
  },
};

/** iOS gets the writer; everything else gets the stub — the same split the gate makes. */
export const healthWrite: HealthWriter = Platform.OS === 'ios' ? healthWriteNative : healthWriteStub;
