/**
 * Hush v4 engine — Phase 1: the OBSERVATION layer (Frozen Spec §5.2–5.4, Handoff Artifact 2.3).
 *
 * Pure reads over COMPLETED work. The prescription is a hypothesis; the completed sets are the
 * truth (Handoff §1.1.2). Capability is READ, never inferred: `best_e1rm = max(load×(1+reps/30))`.
 * There is no variance read, no rep-decay read, no fatigue/recovery inference anywhere here
 * (invariants I-31/I-32).
 *
 * Two spec-silent cases, handled per the recommendations approved in HUSH_V4_MIGRATION_PLAN.md:
 *   • Bodyweight lifts (load == null): e1RM/reprice/rail are inactive; hit/room/missed are read
 *     from REPS only. The range-top action (variation vs +load) lives in Phase 2 (reactive).
 *   • Load normalization: round DOWN to the equipment increment (barbell 2.5 / dumbbell 1.0 from
 *     Handoff 6b; machine/cable 2.5 — fine + safe). Round-down can never raise implied e1RM.
 */
import type { Equipment, EngineGoal, TrainingAge, SetRecord, WeekRecord } from './types';
import { DEFAULTS } from './constants';

/** Epley one-rep-max estimate. The single capability read (Frozen Spec §5.2/§5.4). */
export function epley(load: number, reps: number): number {
  return load * (1 + reps / 30);
}

// ───────────────────────────── demonstrated() (§5.4) ─────────────────────────────
export interface Demonstrated {
  /** Best estimated 1RM over completed sets; null for bodyweight or an empty week. */
  best_e1rm: number | null;
  /** best_e1rm / (1 + rep_target/30); null for bodyweight or empty. */
  demonstrated_load_at_target: number | null;
  best_reps: number;
  hit: boolean;
  room: boolean;
  missed: boolean;
  /** C4-2: every set 0 reps / no completed work → demonstrated undefined (caller does load×0.90). */
  empty: boolean;
  bodyweight: boolean;
}

/**
 * Read demonstrated capability from a completed week's sets against the prescribed rep_target.
 *   best_e1rm  = max(load×(1+reps/30))            (weighted only)
 *   missed     = best set failed OR best reps < target
 *   hit        = best reps ≥ target AND best set not a failure
 *   room       = best reps ≥ target+1 AND best set not a failure
 * "best set" = the completed set achieving the most reps; "not a failure" = at least one set at
 * that rep count had failed=false (so a trailing burnout failure never masks a clean top set —
 * matches Handoff U-demonstrated).
 */
export function demonstrated(sets: SetRecord[], rep_target: number): Demonstrated {
  const bodyweight = sets.length > 0 && sets.every((s) => s.load == null);
  const best_reps = sets.reduce((m, s) => Math.max(m, s.reps), 0);
  const empty = sets.length === 0 || best_reps === 0;

  if (empty) {
    return {
      best_e1rm: null,
      demonstrated_load_at_target: null,
      best_reps: 0,
      hit: false,
      room: false,
      missed: false,
      empty: true,
      bodyweight,
    };
  }

  const topSetClean = sets.some((s) => s.reps === best_reps && !s.failed);
  const missed = !topSetClean || best_reps < rep_target;
  const hit = best_reps >= rep_target && topSetClean;
  const room = best_reps >= rep_target + 1 && topSetClean;

  if (bodyweight) {
    return { best_e1rm: null, demonstrated_load_at_target: null, best_reps, hit, room, missed, empty: false, bodyweight: true };
  }

  let best_e1rm = 0;
  for (const s of sets) {
    if (s.load == null || s.reps <= 0) continue;
    best_e1rm = Math.max(best_e1rm, epley(s.load, s.reps));
  }
  const demonstrated_load_at_target = best_e1rm > 0 ? best_e1rm / (1 + rep_target / 30) : null;
  return {
    best_e1rm: best_e1rm > 0 ? best_e1rm : null,
    demonstrated_load_at_target,
    best_reps,
    hit,
    room,
    missed,
    empty: false,
    bodyweight: false,
  };
}

// ───────────────────────────── progress metric + trend (§5.2/§5.3) ─────────────────────────────
/** Sum of load×reps over completed sets (bodyweight contributes reps with unit load). */
export function volumeLoad(sets: SetRecord[]): number {
  return sets.reduce((v, s) => v + (s.load ?? 1) * s.reps, 0);
}

/**
 * The goal-specific scalar a trend is classified on (Frozen Spec §5.2):
 *   strength        → e1RM
 *   hypertrophy     → volume_load (e1RM secondary)
 *   general_fitness → e1RM uptrend
 * Satisfaction is NOT a term (removed — RA-2).
 */
export function progressMetric(week: WeekRecord, goal: EngineGoal): number {
  if (goal === 'hypertrophy') return week.volume_load;
  return week.e1rm_week;
}

export type Trend = 'UP' | 'FLAT' | 'DOWN';

/**
 * Classify a trend against the mean of the previous up-to-2 weeks (Frozen Spec §5.3).
 *   delta = (now − baseline)/baseline ; UP > +0.02 ; FLAT within ±0.02 ; DOWN < −0.02.
 * With no baseline (single-week history) → FLAT. The STALL_WINDOW gate (acting on FLAT only after
 * N flat weeks) is applied by the reactive layer via flat_weeks — not here.
 */
export function classifyTrend(now: number, priorMetrics: number[], _ta: TrainingAge): Trend {
  const prior = priorMetrics.slice(0, 2);
  if (prior.length === 0) return 'FLAT';
  const baseline = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (baseline === 0) return 'FLAT';
  const delta = (now - baseline) / baseline;
  if (delta > DEFAULTS.TREND_BAND) return 'UP';
  if (delta < -DEFAULTS.TREND_BAND) return 'DOWN';
  return 'FLAT';
}

// ───────────────────────────── STEP + normalization (§7 / Handoff 6, 6b) ─────────────────────────────
export type BodyRegion = 'upper' | 'lower' | 'core';
export type Tier = 'compound' | 'isolation';

/**
 * Fixed load STEP (Frozen Spec §7; no aggression dial — I-17/I-35):
 *   upper: max(2.5, 0.025×load) ; lower: max(5, 0.05×load) ; isolation: half, min 1 kg.
 * The result is the raw step; the new load is normalized DOWN afterward (normalizeLoad).
 */
export function step(load: number, region: BodyRegion, tier: Tier): number {
  const base = region === 'lower' ? Math.max(5, 0.05 * load) : Math.max(2.5, 0.025 * load);
  if (tier === 'isolation') return Math.max(1, base / 2);
  return base;
}

/** Smallest loadable increment per equipment (Handoff 6b: barbell 2.5, dumbbell 1.0; machine/cable
 *  2.5 — spec-silent, chosen fine + safe). Bodyweight has no external load. */
export const LOAD_INCREMENT: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 1.0,
  machine: 2.5,
  cable: 2.5,
  bodyweight: 0,
};

/** Round a load DOWN to the equipment's valid loadable increment (Handoff 6b / C4-3). Never rounds
 *  up — so normalization can never push implied e1RM above the rail. */
export function normalizeLoad(load: number, equipment: Equipment): number {
  const inc = LOAD_INCREMENT[equipment];
  if (inc <= 0) return load;
  return Math.floor(load / inc) * inc;
}
