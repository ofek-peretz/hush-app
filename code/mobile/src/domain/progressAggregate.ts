/**
 * Progress — the ALL-TIME aggregate (v7 3.2 "Progress · Lifts"). Everything the "All time" lens
 * shows above the per-lift chips: the lifetime tonnage, the number of times a lift beat its own best,
 * the workouts-and-weeks line, the lifetime burn and cardio distance, and the weekly-volume series
 * the area graph draws.
 *
 * Pure display arithmetic over the logged history and recorded cardio — it reads NO engine type and
 * makes NO engine decision (the mirror reports what happened).
 *
 * ⚠️ EVERY PER-SESSION FACT COMES FROM `domain/sessionMetrics` — duration, tonnage, "was that a
 * workout", the kcal that hangs off the duration, and the personal-best walk. This file used to
 * derive all five itself, and its duration read only `sets`: the description "first set-start →
 * last set persisted" was accurate and that was the bug. A session of intervals persists no set,
 * so it contributed nothing to the lifetime hours or the lifetime burn. The span is now the start
 * to the last stamp in EITHER record.
 */

// 

import type { Session, CardioActivity } from '@/data/local/models';
import {
  sessionCountsAsWorkout,
  sessionDurationMs,
  sessionEnergyKcal,
  sessionTonnageKg,
  totalRaises,
} from './sessionMetrics';
import { currentWeekOpen, trainingWeekNumber } from './weekCadence';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProgressAggregate {
  /** Lifetime volume in kilograms (Σ weight × reps over every logged set). */
  liftedKg: number;
  /** Whole workouts trained (a partial session never ticks this). */
  workouts: number;
  /** Training weeks elapsed since the account was created ("N weeks"). */
  weeks: number;
  /**
   * Times a lift beat its own all-time best load — **her personal bests, not "the engine's raises".**
   *
   * The distinction is not pedantry, and this comment used to get it wrong. The engine's raises are
   * stamped in `changeLog`; this counts peaks in her logged history, and the two differ in both
   * directions: a weight SHE reached for is counted here though Hush did not decide it, and a real
   * engine raise that re-climbs toward an old peak is not counted here though Hush did. Reading the
   * changeLog instead would be exact but bounded — it keeps ~200 entries — and this is the ALL-TIME
   * lens, so a veteran's count would silently stop growing. A peak is the right unbounded fact for
   * this surface; the claim about who caused it is the part that has to stay honest.
   */
  /**
   * ⚠️ RENAMED IN THE COPY, NOT IN THE MATHS (founder C.17).
   *
   * He read "+0 raises" on the same day several of his lifts had been raised, and called it a
   * contradiction. It was not a counting bug — the figure is right and always was. It counts times a
   * lift beat its own ALL-TIME BEST LOAD: her personal bests, things she did.
   *
   * The word was the lie. "Raises" is what the app does TO her programme, and there had just been
   * several — so a screen showing zero of them was, in the only sense that matters, wrong. It says
   * "personal bests" now, which is what the number has always been.
   *
   * The two really are different and both are worth having: a raise that re-climbs toward an old
   * peak is a decision and not a best, and a best set on a lift nobody touched is hers and not a
   * decision. The prescription's direction lives on Today, in colour, next to the lift.
   */
  raises: number;
  /** Lifetime kcal: strength MET estimate + recorded cardio calories. 0 when nothing is estimable. */
  kcal: number;
  /** Lifetime cardio distance in kilometres. */
  cardioKm: number;
  /**
   * ⛔ LIFETIME MINUTES UNDER THE BAR AND ON THE ROAD (founder, 2026-08-12: *"כמה זמן בשעות הוא עשה
   * מבחינת אימונים בסך הכל"*).
   *
   * `sessionDurationMs` was already computed on every session — the kcal estimate has needed it
   * since the day it was written — and thrown away. **The one fact she can never get back is the
   * only one this screen was not keeping.**
   *
   * ⚠️ MINUTES, NOT HOURS, AND ROUNDED AT THE EDGE. Storing hours would round every session to the
   * nearest one and lose a third of a short workout each time; the screen divides.
   */
  minutes: number;
  /** Tonnes moved per training week, oldest → newest — the area graph's series. */
  weeklyTonnes: number[];
}

/*
 * ⛔ THE TONNAGE, THE DURATION AND THE WORKOUT COUNT USED TO BE DERIVED HERE. They are
 * `domain/sessionMetrics` now — the same three facts were being worked out in five other places
 * and disagreeing. This screen's copy of the duration read only `sets`, so every interval session
 * added 0 minutes and 0 kcal to the lifetime figures the founder asked for by name.
 */

export function progressAggregate(
  sessions: Session[],
  cardio: CardioActivity[],
  memberSince: string | null | undefined,
  weightKg: number | null | undefined,
  nowMs: number,
): ProgressAggregate {
  const hist = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  let liftedKg = 0;
  let workouts = 0;
  let kcal = 0;
  let ms = 0;

  for (const s of hist) {
    liftedKg += sessionTonnageKg(s);
    if (sessionCountsAsWorkout(s)) workouts += 1;
    ms += sessionDurationMs(s);
    const k = sessionEnergyKcal(s, weightKg);
    if (k != null) kcal += k;
  }

  // Raises — a lift that, this session, exceeded its own all-time peak load. One per lift per
  // session, one walk, shared with the Log's "3 up" so the two lenses can never disagree again.
  const raises = totalRaises(hist);

  let cardioKm = 0;
  for (const c of cardio ?? []) {
    cardioKm += c.distanceKm || 0;
    if (c.calories) kcal += c.calories;
    // A run is time she trained. Counting only the lifting would say a marathon week was 0 hours.
    if (c.durationSec) ms += c.durationSec * 1000;
  }

  // Weekly-volume series: tonnage bucketed by the Saturday-20:30 training week, from the account's
  // first week through the current one. A week with no session is an honest zero (effort can dip).
  const anchor = currentWeekOpen(memberSince ? Date.parse(memberSince) : nowMs);
  const curOpen = currentWeekOpen(nowMs);
  const nWeeks = Math.max(1, Math.round((curOpen - anchor) / WEEK_MS) + 1);
  const buckets = new Array<number>(nWeeks).fill(0);
  for (const s of hist) {
    const idx = Math.round((currentWeekOpen(Date.parse(s.startedAt)) - anchor) / WEEK_MS);
    if (idx >= 0 && idx < nWeeks) buckets[idx] += sessionTonnageKg(s);
  }
  const weeklyTonnes = buckets.map((kg) => +(kg / 1000).toFixed(1));

  return {
    liftedKg,
    workouts,
    weeks: trainingWeekNumber(memberSince, nowMs),
    raises,
    kcal,
    cardioKm: +cardioKm.toFixed(1),
    minutes: Math.round(ms / 60_000),
    weeklyTonnes,
  };
}
