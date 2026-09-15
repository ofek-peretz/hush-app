/**
 * ════ THE WARM-UP IS A BRIDGE, NOT A MEASUREMENT (founder ruling, 2026-08-24) ════
 *
 * Rev 8 (2026-07-16) deleted the APPROACH SET — a light *measurement* that replaced the working
 * prescription and made the product look broken ("a lift showing 15 kg then jumping to 34 kg").
 * That ruling stands untouched: the working load is decided before the session, it is the headline
 * from set 1, and Loop 1 corrects from what she actually performs.
 *
 * What the founder approved today is a different object: a RAMP — one or two clearly-labelled
 * bridge sets that carry a cold muscle up to a heavy working weight. Every serious strength
 * programme has them; a first working squat at 100 kg with no bridge is the competitive gap and
 * the safety gap in one. The differences from the dead approach set, and they are the contract:
 *
 *   · the ramp NEVER touches the working prescription — same sets, same load, same band, with or
 *     without it. It is presentation of the road TO the number, not a rival number.
 *   · it exists only where it earns its place: COMPOUND lifts with a real external load. An
 *     isolation curl or a bodyweight row gets none — that is the "nonsense that hurts UX" half of
 *     the original ruling, kept.
 *   · a warm-up set is excluded from EVERY engine decision by construction: its log carries
 *     `isApproach` (the standing wholesale-exclusion mark every fold reader already filters) plus
 *     `isWarmup` (so surfaces can label it honestly), and a NEGATIVE `setIndex` so no positional
 *     read of working sets ("set 0 is the transition", "never after the last set") can collide.
 *   · it costs one tap, like any set, and its rest is a short fixed breath — never her learned
 *     working rest, and never fed back into learning it.
 *
 * ── ⛔ AND IT IS OFFERED, NOT PRESCRIBED (founder, 2026-08-30) ──────────────────────────────────
 *
 *   > *"אני חושב שרק בתרגילי הקומפאונד צריך להופיע האפשרות לפקד חימום ובשאר לא. לא לקבוע מראש
 *   > לאף אחד חימום ומי שרוצה שילחץ על הפקד."*
 *
 * Every clause above survives; one clause is added over all of them. A ramp is no longer written
 * into anybody's plan — the session is built as the coach wrote it, and the athlete inserts bridges
 * at the station with the warm-up disc. This module is unchanged in what it PRODUCES; what changed
 * is that its caller is now a press instead of a builder (`warmupOffer` / `insertWarmup` in
 * `sessionStore` own when the press is legal and what it inserts).
 *
 * ⚠️ THE HOUR STOPPED PAYING FOR IT, and that is the half with teeth: `enforceTimeCap`'s first cut
 * used to be a warm-up minute, which meant a tight day could trade a WORKING SET for a bridge
 * nobody had asked for. Nothing is charged in advance for a request that has not been made.
 *
 * Deterministic and pure: same working load in, same ramp out.
 */

//

import { snapDown } from '@/engine/v5/grid';
import { BAR_KG } from '@/engine/v5/constants';
import type { Exercise } from '@/data/exercises';

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

/** Rest after a warm-up set (s) — a breath and a plate change, not a recovery. Fixed, never
 *  learned, never sampled into her rest medians. */
export const WARMUP_REST_S = 45;

/** Estimated execution seconds for one warm-up set — light load, low reps, no grinding.
 *
 *  ⚠️ NOT CHARGED TO THE PROMISED HOUR, and since 2026-08-30 that is settled rather than balanced.
 *  It was left out (2026-08-24), then charged (2026-08-25, when the founder's own session showed
 *  he rests the full prescribed time so there is no slack to hide it in), and it is out again for
 *  a reason neither round had: the ramp is OPTIONAL now, so there is no bridge to price until an
 *  athlete asks for one at the rack. Kept as the named cost so the next person who prices a
 *  proposal — a live "this adds two minutes" line, say — uses the real number. */
export const WARMUP_EXEC_S = 25;

/** The ramp for the day's FIRST compound: two bridges, far apart. */
const RAMP_FIRST: ReadonlyArray<{ fraction: number; reps: number }> = [
  { fraction: 0.5, reps: 5 },
  { fraction: 0.75, reps: 3 },
];

/** Later compounds are already half-warm — one bridge. */
const RAMP_LATER: ReadonlyArray<{ fraction: number; reps: number }> = [{ fraction: 0.7, reps: 3 }];

/**
 * How many warm-up sets this exercise WOULD be offered — structural (exercise + position only), so
 * the question can be asked without knowing loads. The realized ramp (below) may come out shorter
 * when the working load is too light for a distinct bridge.
 *
 * ⛔ IT NO LONGER PRICES ANYTHING (founder 2026-08-30). Its two callers were `estimateSessionMinutes`
 * and `coachWeek`, charging the hour for bridges every loaded compound was going to be handed; the
 * ruling that made the ramp opt-in took the charge with it, because a day that must trim a working
 * set to fund an unrequested warm-up has its priorities inverted. What is left is the structural
 * half of the offer, which `warmupRamp` still asks.
 *
 * ⚠️ AND THE `lean` PARAMETER IS GONE, not defaulted. F-15 existed to trim a cost; there is no cost.
 */
export function warmupCountFor(
  exercise: Pick<Exercise, 'tier' | 'equipment'>,
  firstCompoundOfDay: boolean,
): number {
  if (exercise.tier !== 'compound') return 0;
  if (exercise.equipment === 'bodyweight') return 0;
  return firstCompoundOfDay ? RAMP_FIRST.length : RAMP_LATER.length;
}

/**
 * The realized ramp for one exercise, from its decided working load.
 *
 * Weights snap DOWN to the equipment's own increments (`snapDown` with no grid — a warm-up sits
 * below her performed range, where the room's increments are the only honest rungs; a barbell
 * never goes below the empty bar). A step that lands on (or above) the working weight, or on a
 * previous step's weight, is DROPPED — an empty-bar squat gets no "warm-up" at the same 20 kg.
 */
export function warmupRamp(
  exercise: Pick<Exercise, 'tier' | 'equipment'>,
  workingKg: number | null,
  firstCompoundOfDay: boolean,
): WarmupSet[] {
  if (workingKg == null || workingKg <= 0) return []; // bodyweight / no load axis (S-51)
  if (warmupCountFor(exercise, firstCompoundOfDay) === 0) return [];
  const ramp = firstCompoundOfDay ? RAMP_FIRST : RAMP_LATER;
  const out: WarmupSet[] = [];
  for (const step of ramp) {
    const kg = snapDown(workingKg * step.fraction, exercise.equipment);
    if (kg <= 0) continue;
    if (kg >= workingKg - 1e-9) continue; // no distinct bridge exists below this working load
    if (exercise.equipment === 'barbell' && workingKg <= BAR_KG + 1e-9) continue; // empty-bar work
    if (out.length > 0 && Math.abs(out[out.length - 1].weightKg - kg) < 1e-9) continue; // collapsed rungs
    out.push({ weightKg: kg, reps: step.reps });
  }
  return out;
}
