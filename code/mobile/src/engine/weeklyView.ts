/**
 * Hush engine — the Weekly Update / plan VIEW contract (engine-agnostic). The shapes the Home briefing
 * and the Weekly Update screen render, produced by whichever engine owns the cohort. Re-homed out of
 * `engine/v4/` (the v4 burial, S-58) so the screens and the v5 engine no longer import from v4.
 *
 * A structural copy: the v4 engine's own definitions are byte-identical, so the dispatcher
 * (`domain/weeklyUpdate`) returns these types whether the value came from v4 or v5 until v4 is deleted.
 */
import type { Pattern } from './catalog';

export interface ExplanationLine {
  key: string;
  params?: Record<string, string | number>;
}

/** The Why triple (observation → conclusion → action) + the one-line text, all as i18n keys. */
export interface Explanation {
  slotId: string;
  pattern: Pattern;
  observation: ExplanationLine;
  conclusion: ExplanationLine;
  action: ExplanationLine;
  text: ExplanationLine;
}

export interface WeeklyUpdate {
  weekIndex: number;
  at: string;
  explanations: Explanation[];
  seen: boolean;
}

/** A per-changed-slot from→to snapshot, captured at advance time (decreases included). */
export interface WeekPlanChange {
  slotId: string;
  exerciseId: string;
  loadFrom: number | null;
  loadTo: number | null;
  setsFrom: number;
  setsTo: number;
  rangeFrom: [number, number];
  rangeTo: [number, number];
  swapped: boolean;
}

export interface WeeklyPlanLift {
  exerciseId: string;
  name: string;
  loadKg: number | null; // current (new) prescribed load; null = bodyweight / unmanaged
  sets: number;
  repRange: [number, number] | null;
  /** Present only when Hush changed this slot this week (carries the Why triple). */
  change: { snapshot: WeekPlanChange; explanation: Explanation } | null;
}

export interface WeeklyPlanWorkout {
  dayId: string;
  name: string;
  groups: string[];
  lifts: WeeklyPlanLift[];
}

export interface WeeklyPlanView {
  weekIndex: number;
  at: string; // ISO of the advance
  changedCount: number;
  seen: boolean;
  workouts: WeeklyPlanWorkout[];
}
