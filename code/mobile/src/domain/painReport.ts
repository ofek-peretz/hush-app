/**
 * WHEN SOMETHING HURTS (v7 §13) — "say it once, the plan bends around you".
 *
 * "Pain isn't a failure to log — it's information… The engine responds in real time: it drops the
 * load, or swaps in a safer movement that trains the same muscle. No doctor cosplay, no alarm."
 *
 * ════ THIS ADDS NO NEW MECHANISM, AND TOUCHES NO ENGINE ════
 * That is the whole design, and it is the handoff's own words: "Pain isn't a new system: the muscle
 * just goes off for a limited window", and "Same swap you already have — nothing new to learn,
 * nothing permanent." So a pain report is composed entirely of two things Hush already does:
 *
 *   1. THE MUSCLE GOES OFF — the same `off` her body map has always had, except this one carries an
 *      expiry and lifts itself. Stored beside the map, never inside it: her map is HERS, and a
 *      tender shoulder must not quietly rewrite a decision she made.
 *   2. THE LIFT IS SWAPPED — through `domain/swapPool`, the same pool every other swap uses. The
 *      new lift's load is then whatever the ENGINE prescribes for it; nothing here sets a load.
 *      That is why the response screen can say "30, was 42.5" without having decided anything: 42.5
 *      was the old lift's number and 30 is the new lift's own, both read back.
 *
 * Pure and I/O-free. No severity here maps to a diagnosis, a tissue, or a recovery time — the coach
 * never asks the athlete to diagnose, and it does not diagnose either. Severity buys ONE thing: how
 * long the muscle rests.
 */
// @ts-nocheck

// 

import type { MuscleStance } from '@/data/local/models';
import type { BodyMap } from '@/engine/v5/bodyMap';

/**
 * How sharp it is, in the athlete's words — not a scale, not a score.
 *
 * Three, because three is what a person can answer honestly while standing at a rack, and because
 * the only thing the answer decides is the length of the rest.
 */
export type PainSeverity = 'twinge' | 'pain' | 'sharp';

export const PAIN_SEVERITIES: readonly PainSeverity[] = ['twinge', 'pain', 'sharp'] as const;

/**
 * How long the muscle rests, per severity.
 *
 * The middle rung is the handoff's own figure — "Shoulders eased in your map for 7 days — then they
 * return on their own." The other two bracket it: a warning is a short step back, and something that
 * bites on every rep earns a fortnight. These are REST WINDOWS, not healing estimates; Hush has no
 * opinion about tissue and states none.
 */
export const EASE_DAYS: Record<PainSeverity, number> = {
  twinge: 3,
  pain: 7,
  sharp: 14,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** One muscle, rested because she said it hurt. */
export interface PainEase {
  /** A muscle from CANONICAL_MUSCLE_ORDER — the same names the map and the assembler use. */
  muscle: string;
  severity: PainSeverity;
  /** When she reported it (ms). */
  fromMs: number;
  /** When the muscle returns ON ITS OWN (ms). Nothing has to be remembered or undone. */
  untilMs: number;
}

/** The ease a report opens. Pure — the caller persists it. */
export function easeFor(muscle: string, severity: PainSeverity, nowMs: number): PainEase {
  return {
    muscle,
    severity,
    fromMs: nowMs,
    untilMs: nowMs + EASE_DAYS[severity] * DAY_MS,
  };
}

/**
 * The eases still standing at `nowMs`.
 *
 * A lapsed ease is simply not returned — it is never "cleared", because nothing has to happen for a
 * muscle to come back. That is what makes the promise ("then they return on their own") true by
 * construction rather than by a job that has to run.
 */
export function activeEases(eases: readonly PainEase[] | undefined, nowMs: number): PainEase[] {
  return (eases ?? []).filter((e) => e.untilMs > nowMs);
}

/** The ease standing on one muscle, if any. */
export function easeOn(eases: readonly PainEase[] | undefined, muscle: string, nowMs: number): PainEase | null {
  // Newest wins: reporting the same muscle again extends the rest rather than shortening it.
  return activeEases(eases, nowMs)
    .filter((e) => e.muscle === muscle)
    .sort((a, b) => b.untilMs - a.untilMs)[0] ?? null;
}

/** Whole days left on an ease, rounded UP — "3 days left" while any part of the third remains. */
export function daysLeft(ease: PainEase, nowMs: number): number {
  return Math.max(0, Math.ceil((ease.untilMs - nowMs) / DAY_MS));
}

/**
 * THE MAP THE ENGINE IS HANDED — her map, with every rested muscle switched off.
 *
 * Composed at the moment the programme is built, never written back. Her `bodyMap` stays exactly as
 * she drew it, so when the window lapses the muscle returns to the stance SHE chose (normal, or the
 * lead she gave it) rather than to whatever a pain report happened to overwrite it with.
 *
 * A muscle she had already turned off stays off; an ease cannot make anything MORE trained.
 */
export function effectiveBodyMap(
  map: BodyMap | undefined,
  eases: readonly PainEase[] | undefined,
  nowMs: number,
): BodyMap {
  const live = activeEases(eases, nowMs);
  if (live.length === 0) return { ...(map ?? {}) };
  const next: Record<string, MuscleStance> = { ...(map ?? {}) };
  for (const e of live) next[e.muscle] = 'off';
  return next;
}

/**
 * ════ WT14 · THE WRIST NAMES A MUSCLE, THE SAME ONE THE MAP KNOWS ════
 *
 * A 41 mm case has no room for the body map, so the canonical design puts the areas on the wrist
 * **in words** — and the words are the MAP'S OWN (founder 2026-07-28: "use the table, but write the
 * muscle names instead of the joint names"). That is the whole reason this resolves cleanly: the
 * wrist and the engine now speak one vocabulary, so a report needs no interpretation on the way in.
 * Nothing here decides a cause, and the only consequence is the same one every pain report has —
 * that muscle rests for a window and its lifts are swapped (S-2 `off`, `domain/swapPool`).
 *
 * The JOINT words the first cut of the wrist shipped are kept as ALIASES, and they are not
 * decoration: a watch is updated separately from its phone, so an older wrist build will keep
 * sending "Knee" long after the phone stops offering it. An alias makes that report land instead of
 * vanishing — the exact failure this whole seam was fixed for. An area with no entry rests NOTHING
 * and says so, rather than guessing at a muscle she did not name.
 */
const WRIST_AREA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Shoulder: ['Shoulders'],
  'Lower back': ['Hamstrings', 'Glutes'], // the hinge — the pattern that loads it
  Knee: ['Quads'],
  Elbow: ['Triceps', 'Biceps'],
  Wrist: ['Biceps', 'Triceps'],
  Hip: ['Glutes'],
};

/** The muscles the wrist may name — the body map's own, in the canonical order the app uses
 *  everywhere else. This IS the WT14 list; the watch renders it verbatim. */
export const WRIST_PAIN_MUSCLES: readonly string[] = [
  'Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core',
];

/** The muscles a wrist-reported area rests: itself when she named a muscle, the alias's muscles
 *  when an older wrist build named a joint, and `[]` when it is neither. */
export function musclesForWristArea(area: string): readonly string[] {
  if (WRIST_PAIN_MUSCLES.includes(area)) return [area];
  return WRIST_AREA_ALIASES[area] ?? [];
}

/**
 * The severity a wrist report carries — HERS, never a default.
 *
 * The first cut of this seam picked the mildest window for her, because WT14 was six words and no
 * follow-up. The founder's ruling (2026-07-28) is that the wrist asks the SAME three the phone asks
 * (WT14b), so there is nothing left to assume: a report arrives with her answer or it does not
 * arrive at all. This only re-types the wire's string, and an unrecognised value is `null` — the
 * caller then records nothing, which is the one honest response to a half-finished flow.
 */
export function asPainSeverity(raw: string | null | undefined): PainSeverity | null {
  return PAIN_SEVERITIES.includes(raw as PainSeverity) ? (raw as PainSeverity) : null;
}
