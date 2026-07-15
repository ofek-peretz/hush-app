/**
 * The Weekly Update source of truth — dispatches to v5 for the declared-band cohort, v4 otherwise.
 *
 * The prescription swap (fixtureModel.sessionTargets) is gated on a declared rep band; the Weekly
 * Update must follow the SAME gate, so what the athlete reads on Saturday matches the engine that
 * actually set her loads. Home and the WeeklyUpdate screen import from here, not from either engine
 * directly, so the two surfaces can never disagree about which engine is authoritative.
 */
import { db } from '@/data/local/db';
import type { Program } from '@/data/local/models';
import {
  getWeeklyUpdate as getWeeklyUpdateV4,
  getWeeklyPlan as getWeeklyPlanV4,
  markWeeklyUpdateSeen as markWeeklyUpdateSeenV4,
  type WeeklyUpdate,
  type WeeklyPlanView,
} from '@/engine/v4/v4Engine';
import { getWeeklyUpdateV5, getWeeklyPlanV5, markWeeklyUpdateSeenV5 } from '@/engine/v5/v5Engine';

export type { WeeklyUpdate, WeeklyPlanView, WeeklyPlanLift } from '@/engine/v4/v4Engine';

/** Is this athlete on the v5 engine? (She declared a rep band during v5 onboarding.) */
async function onV5(): Promise<boolean> {
  try {
    return !!(await db.loadProfile())?.repBand;
  } catch {
    return false;
  }
}

export async function getWeeklyUpdate(): Promise<WeeklyUpdate | null> {
  return (await onV5()) ? getWeeklyUpdateV5() : getWeeklyUpdateV4();
}

export async function getWeeklyPlan(program: Program): Promise<WeeklyPlanView | null> {
  return (await onV5()) ? getWeeklyPlanV5(program) : getWeeklyPlanV4(program);
}

export async function markWeeklyUpdateSeen(): Promise<void> {
  return (await onV5()) ? markWeeklyUpdateSeenV5() : markWeeklyUpdateSeenV4();
}
