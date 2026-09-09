/**
 * ONE LIFT'S STORY — the data behind the lift-detail card (v7 3.2b).
 *
 * "The long always-open history is gone. The climb now carries tappable points, and the story sits
 * behind two tabs — Milestones (the few that mattered) opens by default; All changes holds the full
 * engine log."
 *
 * Three readings, all of them read-back:
 *   · `liftClimb`   — the climb itself, one point per training DAY, carrying its date so a point can
 *                     be tapped and answer "which day was this?".
 *   · `liftMoments` — the few that mattered: where she stands, the club marks this lift crossed, and
 *                     where she began.
 *   · `liftChanges` — every decision the engine stamped for this lift, newest first.
 *
 * PURE AND I/O-FREE, and it computes NO decision. The changes come in as the engine's already-stamped
 * `changeLog` (the caller reads it off the persisted state); nothing here re-derives a load, a band
 * or a verdict — the engine decided those at the end of each occurrence and this only reads them
 * back, exactly as the Record screen (3.3b) reads `sessionForward` back.
 */

// 

import type { EngineV5State } from '@/data/local/db';
import { isEvidenceSet } from '@/domain/setEvidence';
import type { CoachDecision } from './coachLog';
import type { Session } from '@/data/local/models';
import { earnedMilestones, type EarnedMilestone, type MilestoneProfile } from '@/domain/milestones';

/** A lift with no loaded set anywhere climbs by REPS instead (founder 2026-07-10). */
export type LiftMode = 'load' | 'reps';

/** One training day on the climb. */
export interface ClimbPoint {
  /** The session that produced it (ms) — what a tapped point names. */
  atMs: number;
  /** The running max up to and including this day — the staircase the graph draws. */
  value: number;
  /** This day's OWN best. Below `value` on a day she lifted under her peak; the callout says so. */
  dayBest: number;
  sessionId: string;
}

export interface LiftClimb {
  points: ClimbPoint[];
  mode: LiftMode;
  /** The first day this lift was ever trained (ms), or null when it never was. */
  firstAtMs: number | null;
  /** Her latest day's own best — where she is, not where she peaked. */
  current: number;
  /** The all-time peak. */
  best: number;
}

/** Local-midnight key, so two sessions on one calendar day are one point on the climb. */
const dayKey = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * The climb: her best per training day, oldest → newest, as a RUNNING MAX.
 *
 * Running max for the same reason the all-time report uses one — a peak never falls, so the line
 * only ever holds or rises and never draws a dip it does not mean. `dayBest` keeps the honest raw
 * reading beside it, because a tapped point must be able to say what actually happened that day.
 */
export function liftClimb(sessions: Session[], exerciseId: string): LiftClimb {
  // day → { best, sessionId, atMs }. Weighted sets decide the mode: any load at all and the lift
  // climbs by load, because that is the stronger signal.
  const byDay = new Map<number, { best: number; sessionId: string; atMs: number }>();
  let anyWeighted = false;
  for (const s of sessions) {
    for (const log of s.sets) {
      if (log.exerciseId !== exerciseId) continue;
      if (log.actualWeight != null) anyWeighted = true;
    }
  }
  const mode: LiftMode = anyWeighted ? 'load' : 'reps';

  for (const s of sessions) {
    for (const log of s.sets) {
      if (log.exerciseId !== exerciseId) continue;
      if (!isEvidenceSet(log)) continue; // a warm-up bridge is not a climb point, and a presumed set is the prescription — neither draws
      const atMs = Date.parse(log.persistedAt || s.startedAt);
      if (!Number.isFinite(atMs)) continue;
      const value = mode === 'load' ? log.actualWeight : log.actualReps;
      if (value == null || !(value > 0)) continue;
      const key = dayKey(atMs);
      const prior = byDay.get(key);
      // The day's timestamp is its EARLIEST set — the day is named by when she started it.
      if (!prior) byDay.set(key, { best: value, sessionId: s.id, atMs });
      else byDay.set(key, { best: Math.max(prior.best, value), sessionId: prior.sessionId, atMs: Math.min(prior.atMs, atMs) });
    }
  }

  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  let running = 0;
  const points: ClimbPoint[] = days.map(([, d]) => {
    running = Math.max(running, d.best);
    return { atMs: d.atMs, value: running, dayBest: d.best, sessionId: d.sessionId };
  });

  return {
    points,
    mode,
    firstAtMs: points[0]?.atMs ?? null,
    current: points[points.length - 1]?.dayBest ?? 0,
    best: running,
  };
}

/** The few that mattered, for one lift. */
export type LiftMomentKind = 'best' | 'club' | 'origin';

export interface LiftMoment {
  kind: LiftMomentKind;
  /** kg (or reps, on a bodyweight lift). */
  value: number;
  atMs: number;
  /** Present on 'club' — the earned mark, so the caller can reuse `milestoneCopy` verbatim. */
  milestone?: EarnedMilestone;
}

/**
 * THE MILESTONES TAB — newest first: where she stands now, every club mark this lift crossed, and
 * the day she began. Nothing is invented: the peak and the origin are readings off the climb, and
 * the clubs come straight from `earnedMilestones` (the same ladder every other surface uses).
 *
 * A lift trained exactly once yields ONE row — the origin. Standing and beginning are the same day
 * then, and printing both would be the screen talking to itself.
 */
export function liftMoments(
  sessions: Session[],
  profile: MilestoneProfile | null | undefined,
  exerciseId: string,
  climb?: LiftClimb,
): LiftMoment[] {
  const c = climb ?? liftClimb(sessions, exerciseId);
  if (c.points.length === 0) return [];

  const first = c.points[0];
  const peak = [...c.points].reverse().find((p) => p.dayBest === c.best) ?? c.points[c.points.length - 1];

  const clubs: LiftMoment[] = earnedMilestones(sessions, profile)
    .filter((m) => m.family === 'club' && m.exerciseId === exerciseId && m.value != null)
    .map((m) => ({ kind: 'club' as const, value: m.value!, atMs: Date.parse(m.earnedAt), milestone: m }))
    .filter((m) => Number.isFinite(m.atMs));

  const origin: LiftMoment = { kind: 'origin', value: first.dayBest, atMs: first.atMs };
  if (c.points.length === 1) return [origin];

  const best: LiftMoment = { kind: 'best', value: c.best, atMs: peak.atMs };
  // A club crossed ON the peak day at the peak load is the same fact twice — the peak row keeps it.
  const distinct = clubs.filter((m) => !(m.value === best.value && dayKey(m.atMs) === dayKey(best.atMs)));
  return [best, ...distinct.sort((a, b) => b.atMs - a.atMs), origin];
}

/** One stamped engine decision, as the ledger prints it. */
export interface LiftChange {
  atMs: number;
  loadFrom: number | null;
  loadTo: number | null;
  /**
   * WHY. It was an engine decision CODE — `progress`, `stall_backoff` — that the screen turned into
   * a sentence through the copy layer. It is the coach's own sentence now, already written, in her
   * language. Same field, and the screen prints it either way; what changed is that the reason is
   * no longer a category the app expands but the thing the coach actually said.
   */
  decision: string;
  /** Structural / volume moves (S-45); absent on an ordinary load change. */
  /** `detrain` joined when B-9 landed — the engine stamps it, and this union simply predated it. */
  kind?: 'graduate' | 'swap' | 'volume' | 'rung' | 'detrain' | 'deload' | 'ease';
  toExercise?: string;
  /**
   * ⛔ IS `decision` A SENTENCE, OR A CODE? The two producers disagree, and the screen had no way
   * to ask. `liftChanges` (the engine) stamps a CODE — `progress`, `stall_backoff` — which the copy
   * layer expands; `liftChangesFromCoach` stamps the coach's own written line. Printing the engine's
   * value raw would put `stall_backoff` on her screen, and dropping the coach's threw away the only
   * thing that row had to say. One flag, set by the producer that knows.
   */
  spoken?: boolean;
}

type ChangeEntry = NonNullable<EngineV5State['changeLog']>[number];

/**
 * THE ALL-CHANGES TAB — every entry the engine stamped for this lift, newest first.
 *
 * Read-back only. The log is capped by the engine (CHANGELOG_KEEP), so this is "every change still
 * on record", which is the honest thing the screen can claim and the only thing it does claim.
 */
export function liftChanges(log: ChangeEntry[] | undefined, exerciseId: string): LiftChange[] {
  return (log ?? [])
    // A graduation/swap stamps the FROM lift in `exerciseId` and the new one in `toExercise` — both
    // sides of the move belong to this lift's story, so both match.
    .filter((c) => c.exerciseId === exerciseId || c.toExercise === exerciseId)
    .map((c) => ({
      atMs: c.at,
      loadFrom: c.loadFrom,
      loadTo: c.loadTo,
      decision: c.decision,
      ...(c.kind ? { kind: c.kind } : {}),
      ...(c.toExercise ? { toExercise: c.toExercise } : {}),
    }))
    .sort((a, b) => b.atMs - a.atMs);
}

/** Which way a stamped load change moved — the one word the ledger row wears. */
export type ChangeDirection = 'up' | 'down' | 'hold';

export function changeDirection(c: LiftChange): ChangeDirection {
  if (c.loadFrom == null || c.loadTo == null) return 'hold';
  if (c.loadTo > c.loadFrom) return 'up';
  if (c.loadTo < c.loadFrom) return 'down';
  return 'hold';
}

/**
 * The climb point a stamped change belongs to — the training day it was decided at the end of. Used
 * to light the graph's markers, and to answer a tapped point with that day's decision.
 * Returns -1 when the change predates (or outlives) the days still on the climb.
 */
export function pointIndexAt(points: ClimbPoint[], atMs: number): number {
  const key = dayKey(atMs);
  return points.findIndex((p) => dayKey(p.atMs) === key);
}

/**
 * ════ THE ALL-CHANGES TAB, FROM THE COACH — NOW THE FALLBACK, NOT THE SOURCE ════
 *
 * ⛔ THE PREMISE UNDER THIS FUNCTION EXPIRED AND NOBODY TOLD IT (2026-08-19). It was written
 * because *"nothing writes the engine's changeLog any more — the between-session fold is deleted"*,
 * which was true of the v4 fold and has been false since v5 landed: `foldEngine` writes
 * `state.changeLog` on every workout, `getWeeklyPlanV5` reads it back, and stage 7's tests pin it.
 *
 * ⚠️ AND THE COST WAS THE WHOLE TAB. This mapper hardcodes `loadFrom: null, loadTo: null` and no
 * `kind`, so `changeDirection` returned `'hold'` for every row — a lift the engine had RAISED five
 * times drew five identical grey rows reading "held · I held it where it was", on the one screen
 * that exists to answer *why did this lift move?*
 *
 * It stays as the fallback for an athlete whose history is the coach era, where these really are
 * the only decisions on record.
 *
 * The coach's log answers it better than the engine's ever did: the engine stamped a decision CODE
 * that the copy layer expanded into a sentence, and the coach wrote the sentence.
 *
 * ⚠️ NO from→to FIGURES, and that is honest rather than lossy. The coach states a programme, never a
 * delta — see `coachLoadDirections` for why a direction has to be derived from two plans. A row here
 * carries WHEN and WHY, and the load it set is on Today next to the lift. Inventing a `loadFrom` by
 * looking backwards through her history would be this file forming an opinion about a decision it
 * did not make.
 */
export function liftChangesFromCoach(log: CoachDecision[] | undefined, exerciseId: string): LiftChange[] {
  return (log ?? [])
    .filter((d) => d.ex === exerciseId)
    .map((d) => ({
      atMs: Date.parse(d.at),
      loadFrom: null,
      loadTo: null,
      decision: d.say,
      // The coach wrote this one; the screen may print it as it stands. See `spoken`.
      spoken: true,
    }))
    .filter((c) => Number.isFinite(c.atMs))
    .sort((a, b) => b.atMs - a.atMs);
}
