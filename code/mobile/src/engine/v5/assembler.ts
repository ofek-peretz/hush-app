/**
 * Hush Engine v5 — the assembler core (Stage 4). The programme is GENERATED from her body map, days,
 * and volume — never chosen from a demographic shelf (MEN_SPLITS/WOMEN_SPLITS are deleted).
 *
 * This module owns the volume→structure decision: how many weekly sets each muscle gets (from the
 * map), and how those sets shape the week's days by region. Session STRUCTURE is an output of volume
 * allocation, never an input — mark Glutes+Quads and a 3-day week yields two lower days, because the
 * volume has to go somewhere (register Part 3). Exercise selection / ordering / station clustering /
 * the time cap remain the integration layer's job (reused from the existing generator).
 *
 * Pure. Deterministic.
 */

import { STARTING_WEEKLY_SETS, MUSCLE_REGION } from './constants';
import { stanceOf, trainableMuscles, emphasisMuscles, type BodyMap } from './bodyMap';

/** Region of a muscle (upper/lower); unknown → upper (safe default, never its own day). */
export function regionOf(muscle: string): 'upper' | 'lower' {
  return MUSCLE_REGION[muscle] ?? 'upper';
}

/**
 * Starting weekly set target per trainable muscle (B-2). Off muscles are absent; emphasised muscles
 * start with the bonus (their first claim on volume, S-4). Earned/cut volume (Loop 3) overwrites
 * these within a few weeks — this is only the day-one shape.
 */
export function weeklyTargets(map: BodyMap | undefined, allMuscles: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of trainableMuscles(map, allMuscles)) {
    out[m] = STARTING_WEEKLY_SETS.base + (stanceOf(map, m) === 'emphasis' ? STARTING_WEEKLY_SETS.emphasisBonus : 0);
  }
  return out;
}

/**
 * Total weekly sets per region, from the per-muscle targets. Core is EXCLUDED — it is a supplemental
 * finisher trained across days (never its own session), so it does not shape the upper/lower split.
 */
export function regionVolume(targets: Record<string, number>): { upper: number; lower: number } {
  let upper = 0;
  let lower = 0;
  for (const [m, sets] of Object.entries(targets)) {
    if (m === 'Core') continue;
    if (regionOf(m) === 'lower') lower += sets;
    else upper += sets;
  }
  return { upper, lower };
}

/**
 * How the week's `days` split into upper/lower sessions — proportional to region volume, so the
 * SHAPE follows the map. Each side gets at least one day when it has any volume; the remainder is
 * apportioned by volume, ties to upper (the canonical lead). This is what makes "emphasise glutes +
 * quads on 3 days → two lower days" fall out automatically, with no split chosen from a shelf.
 */
export function assignRegionDays(targets: Record<string, number>, days: number): ('upper' | 'lower')[] {
  const { upper, lower } = regionVolume(targets);
  if (days <= 0) return [];
  if (upper === 0) return Array(days).fill('lower');
  if (lower === 0) return Array(days).fill('upper');

  // Largest-remainder apportionment of `days` between upper and lower by volume, each ≥ 1.
  const total = upper + lower;
  let lowerDays = Math.round((lower / total) * days);
  lowerDays = Math.max(1, Math.min(days - 1, lowerDays)); // both sides get at least one day
  const upperDays = days - lowerDays;

  // Interleave so sessions alternate where possible (upper leads — the canonical order).
  const out: ('upper' | 'lower')[] = [];
  let u = upperDays;
  let l = lowerDays;
  while (u + l > 0) {
    if (u >= l && u > 0) { out.push('upper'); u--; }
    else if (l > 0) { out.push('lower'); l--; }
    else if (u > 0) { out.push('upper'); u--; }
  }
  return out;
}

/** True when she has emphasised any muscle — the map is doing real work (for tests / narration). */
export function hasEmphasis(map: BodyMap | undefined, allMuscles: readonly string[]): boolean {
  return emphasisMuscles(map, allMuscles).length > 0;
}
