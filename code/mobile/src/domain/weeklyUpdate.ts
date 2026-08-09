/**
 * The Weekly Update source of truth. The v5 engine owns every athlete's load, progression and
 * narration, so this is a thin pass-through to v5 — kept as the single import point for Home and the
 * WeeklyUpdate screen (they never import an engine directly, so the surfaces can never disagree).
 */
// @ts-nocheck

// 

import type { Program } from '@/data/local/models';
import type { WeeklyUpdate, WeeklyPlanView } from '@/engine/weeklyView';
import { getWeeklyUpdateV5, getWeeklyPlanV5, markWeeklyUpdateSeenV5 } from '@/engine/v5/v5Engine';

export type { WeeklyUpdate, WeeklyPlanView, WeeklyPlanLift, WeeklyVolumeMove } from '@/engine/weeklyView';

export async function getWeeklyUpdate(): Promise<WeeklyUpdate | null> {
  return getWeeklyUpdateV5();
}

export async function getWeeklyPlan(program: Program): Promise<WeeklyPlanView | null> {
  return getWeeklyPlanV5(program);
}

export async function markWeeklyUpdateSeen(): Promise<void> {
  return markWeeklyUpdateSeenV5();
}
