/**
 * The Weekly Update source of truth. The v5 engine owns every athlete's load, progression and
 * narration, so this is a thin pass-through to v5 — kept as the single import point for Home and the
 * WeeklyUpdate screen (they never import an engine directly, so the surfaces can never disagree).
 */

// 

import type { Program } from '@/data/local/models';
import type { WeeklyUpdate, WeeklyPlanView } from '@/engine/weeklyView';
import { getWeeklyUpdateV5, getWeeklyPlanV5, markWeeklyUpdateSeenV5, type ClosedWindow } from '@/engine/v5/v5Engine';
import { db } from '@/data/local/db';

export type { WeeklyUpdate, WeeklyPlanView, WeeklyPlanLift, WeeklyVolumeMove } from '@/engine/weeklyView';

/**
 * ════ THE LETTER IS ABOUT THE CYCLE SHE CLOSED (the rotation, founder 2026-09-28) ════
 *
 * The letter was the Saturday mirror: what the engine decided between the last two Saturdays. Her
 * week closes when she finishes it now (`cycleRoll`), so the letter reads that window — the opening
 * of the cycle she just closed to the opening of the one she is in. Before her first cycle closes
 * there is no such window, and the calendar week stands in, as it always did.
 */
async function closedCycle(): Promise<ClosedWindow | null> {
  const [start, end] = await Promise.all([db.loadWeekPrevOpen().catch(() => null), db.loadWeekOpen().catch(() => null)]);
  return start != null && end != null && end > start ? { start, end } : null;
}

export async function getWeeklyUpdate(): Promise<WeeklyUpdate | null> {
  return getWeeklyUpdateV5(Date.now(), await closedCycle());
}

export async function getWeeklyPlan(program: Program): Promise<WeeklyPlanView | null> {
  return getWeeklyPlanV5(program, Date.now(), await closedCycle());
}

export async function markWeeklyUpdateSeen(): Promise<void> {
  return markWeeklyUpdateSeenV5(Date.now(), await closedCycle());
}
