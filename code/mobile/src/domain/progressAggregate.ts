/**
 * Progress — the ALL-TIME aggregate (v7 3.2 "Progress · Lifts"). Everything the "All time" lens
 * shows above the per-lift chips: the lifetime tonnage, the number of times a lift beat its own best,
 * the workouts-and-weeks line, the lifetime burn and cardio distance, and the weekly-volume series
 * the area graph draws.
 *
 * Pure display arithmetic over the logged history and recorded cardio — it reads NO engine type and
 * makes NO engine decision (the mirror reports what happened). Wall-clock duration (first set-start →
 * last set persisted) feeds the same MET kcal estimate the Complete screen already uses.
 */
import type { Session, CardioActivity } from '@/data/local/models';
import { sessionKcal } from './energy';
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
  raises: number;
  /** Lifetime kcal: strength MET estimate + recorded cardio calories. 0 when nothing is estimable. */
  kcal: number;
  /** Lifetime cardio distance in kilometres. */
  cardioKm: number;
  /** Tonnes moved per training week, oldest → newest — the area graph's series. */
  weeklyTonnes: number[];
}

const sessionTonnageKg = (s: Session): number =>
  (s.sets ?? []).reduce((sum, x) => sum + (x.actualWeight ?? 0) * Math.max(0, x.actualReps), 0);

const sessionDurationMs = (s: Session): number => {
  const start = new Date(s.startedAt).getTime();
  let end = start;
  for (const x of s.sets ?? []) if (x.persistedAt) end = Math.max(end, new Date(x.persistedAt).getTime());
  return Math.max(0, end - start);
};

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
  let raises = 0;
  const best = new Map<string, number>(); // exerciseId → best actual load seen so far

  for (const s of hist) {
    liftedKg += sessionTonnageKg(s);
    if (s.trained !== false) workouts += 1;
    const k = sessionKcal(s, sessionDurationMs(s), weightKg);
    if (k != null) kcal += k;

    // Raises — a lift that, this session, exceeded its own all-time peak load. One per lift per session.
    const peak = new Map<string, number>();
    for (const x of s.sets ?? []) {
      if (x.actualWeight != null && x.actualReps >= 1) {
        const cur = peak.get(x.exerciseId);
        if (cur == null || x.actualWeight > cur) peak.set(x.exerciseId, x.actualWeight);
      }
    }
    for (const [exId, p] of peak) {
      const b = best.get(exId);
      if (b != null && p > b) raises += 1;
      if (b == null || p > b) best.set(exId, p);
    }
  }

  let cardioKm = 0;
  for (const c of cardio ?? []) {
    cardioKm += c.distanceKm || 0;
    if (c.calories) kcal += c.calories;
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
    weeklyTonnes,
  };
}
