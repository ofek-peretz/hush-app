/**
 * Standalone plan snapshot builder (phone side).
 *
 * The phone owns the MODEL; the watch owns nothing but execution. This module
 * precomputes the model's output — every remaining workout of the week, fully
 * prescribed and name-resolved per set — into a `WatchPlanSnapshot` the watch
 * stores durably and can execute with the phone absent. The watch never
 * recomputes targets: what is prescribed here is what it runs.
 *
 * Pure over its inputs (days + targets + clock) so it is unit-testable anywhere;
 * catalog/name/equipment resolution reuses the same sources the live mirror uses
 * (exerciseById + loadSetup), keeping the wrist presentation identical whether a
 * set is mirrored live or executed locally.
 */
// @ts-nocheck

// 

import type { ProgramDay, SetTarget, Session } from '@/data/local/models';
import { lastTimeOn, type LastTime } from '@/domain/lastTimeOn';
import { exerciseById } from '@/data/exercises';
import type { PlannedItem } from '@/domain/coachPlan';
import { loadSetup } from '@/domain/loadPresentation';
import {
  WATCH_PLAN_SCHEMA_VERSION,
  type WatchPlanSnapshot,
  type WatchPlanStep,
  type WatchPlanWorkout,
} from './protocol';

/** Stable content hash (djb2 over the canonical JSON) — cheap, deterministic,
 *  and only used to detect "the plan changed" / name the executed plan. */
function contentHash(workouts: WatchPlanWorkout[]): string {
  const json = JSON.stringify(workouts);
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  }
  return `plan_${(h >>> 0).toString(36)}`;
}

/**
 * ⛔ WHAT SHE DID LAST TIME, FOR THE PLAN (founder 2026-08-04): *"send the history for a standalone
 * workout too."*
 *
 * ⚠️ MEMOISED PER LIFT. `lastTimeOn` walks her whole history, and a step-by-step call would walk it
 * once per SET — twenty-four times for a six-lift week, on the main thread, every time the snapshot
 * is rebuilt on focus. Six is the honest number.
 */
/** The two history fields a step carries, or nothing at all when there is no history to carry. */
function lastFields(last: LastTime | null | undefined): { lastReps?: number[]; lastLoadKg?: number | null } {
  if (!last || last.reps.length === 0) return {};
  return { lastReps: last.reps, lastLoadKg: last.loadKg };
}

function lastTimeLookup(history: Session[] | undefined): (exerciseId: string) => LastTime | null {
  const seen = new Map<string, LastTime | null>();
  return (exerciseId: string) => {
    if (!history || history.length === 0) return null;
    if (!seen.has(exerciseId)) seen.set(exerciseId, lastTimeOn(exerciseId, history));
    return seen.get(exerciseId) ?? null;
  };
}

function buildSteps(
  day: ProgramDay,
  targets: SetTarget[],
  restInterSFor?: (exerciseId: string) => number,
  lastOf?: (exerciseId: string) => LastTime | null,
): WatchPlanStep[] {
  const find = (exerciseId: string, setIndex: number): SetTarget =>
    targets.find((t) => t.exerciseId === exerciseId && t.setIndex === setIndex) ?? {
      exerciseId,
      setIndex,
      recommendedWeight: null,
      recommendedReps: 8, // data gap (§7.9): a neutral target, never a blank set
    };
  const steps: WatchPlanStep[] = [];
  let global = 0;
  for (const slot of day.slots) {
    const ex = exerciseById(slot.exerciseId);
    for (let s = 0; s < slot.setCount; s++) {
      const target = find(slot.exerciseId, s);
      const setup = loadSetup(slot.exerciseId, target.recommendedWeight, 'kg');
      steps.push({
        exerciseId: slot.exerciseId,
        exerciseName: ex?.name ?? slot.exerciseId,
        exerciseGroup: ex?.muscle ?? '',
        setIndexInExercise: s,
        totalSetsInExercise: slot.setCount,
        globalIndex: global,
        ...lastFields(lastOf?.(slot.exerciseId)),
        targetWeight: target.recommendedWeight,
        targetReps: target.recommendedReps,
        // Her band's ceiling, so the wrist can draw the same ruler standalone that it draws mirrored.
        targetRepsHi: target.repBandHi,
        blockId: target.blockId,
        reasonType: target.reasonType,
        reasonDelta: target.reasonDelta,
        restInterS: restInterSFor ? restInterSFor(slot.exerciseId) : undefined,
        loadSetup: setup
          ? {
              style: setup.style,
              perSide: setup.perSide,
              plates: setup.plates,
              barKg: setup.barKg,
              perHand: setup.perHand,
              pin: setup.pin,
              fixedBar: setup.fixedBar,
            }
          : null,
      });
      global += 1;
    }
  }
  return steps;
}

export interface WatchPlanInputs {
  /** The week's days; rest + completed days are excluded from the snapshot. */
  days: ProgramDay[];
  /** Model targets per day id. A day with no entry is skipped (a partial snapshot
   *  is still useful — the watch just can't start THAT workout offline). */
  targetsByDay: Record<string, SetTarget[]>;
  nowMs: number;
  /** Hush-owned rest lengths (s) — passed in so this module stays constant-free.
   *  restInterS is the plan-level FALLBACK (stale watch builds); restInterSFor supplies
   *  the per-exercise (tier-based) rest each step actually carries. */
  restInterS: number;
  restTransitionS: number;
  restInterSFor?: (exerciseId: string) => number;
  /**
   * Her saved sessions — so a STANDALONE workout draws last time's reps in the set row exactly as a
   * mirrored one does. Absent ⇒ the steps carry no history and the wrist draws dashes, which is the
   * same state as a lift she has never done.
   */
  history?: Session[];
}

/** Build the snapshot, or null when nothing remains to execute (all done / no
 *  targets available) — the watch keeps its previous plan in that case. */
export function buildWatchPlanSnapshot(inp: WatchPlanInputs): WatchPlanSnapshot | null {
  const workouts: WatchPlanWorkout[] = [];
  const lastOf = lastTimeLookup(inp.history);
  for (const day of inp.days) {
    if (day.isRest || day.completed) continue;
    const targets = inp.targetsByDay[day.id];
    if (!targets) continue;
    const steps = buildSteps(day, targets, inp.restInterSFor, lastOf);
    if (steps.length === 0) continue;
    workouts.push({
      id: day.id,
      name: day.name,
      muscles: day.muscleGroups.join(' · '),
      steps,
    });
  }
  if (workouts.length === 0) return null;
  return {
    schema: WATCH_PLAN_SCHEMA_VERSION,
    planId: contentHash(workouts),
    generatedAt: new Date(inp.nowMs).toISOString(),
    restInterS: inp.restInterS,
    restTransitionS: inp.restTransitionS,
    workouts,
  };
}

/* ────────────────────────────────────────────────────── THE COACH'S WEEK, AS FAR AS THE WRIST GOES */

/**
 * ════ THE WATCH OFFERS ONLY WHAT IT CAN HONESTLY EXECUTE ════
 *
 * The wrist's protocol is reps-at-a-load and nothing else: `targetWeight`, `targetReps`,
 * `setIndexInExercise`. Three of the coach's four shapes have no field in it — a 400 m repeat, a
 * 45-second plank, and open work all have nowhere to go.
 *
 * So a session containing any of them is NOT OFFERED standalone. The alternative was to send the
 * lifts and drop the rest, and that is the one thing this layer exists to prevent: she would start
 * "Intervals & Core" on her wrist, do the squats, and never see the running — a different workout
 * from the one the coach wrote, with nothing anywhere saying so.
 *
 * Not offering it is a true statement about what the watch can do today. Widening the protocol is
 * native work (Swift, a schema bump, and a watch binary that ships asynchronously from the phone),
 * and until that lands "you cannot start this one from your wrist" is the honest answer.
 *
 * ⚠️ IT RETURNS null RATHER THAN AN EMPTY LOBBY when nothing qualifies, which is the same answer
 * `buildWatchPlanSnapshot` gives: an empty plan on the wrist reads as "you have no workouts", and
 * she has a week — just not one this device can run by itself.
 */
export function buildCoachWatchPlan(inp: {
  sessions: { id: string; name: string; blocks: { rounds: number; restS?: number; items: PlannedItem[] }[] }[];
  nowMs: number;
  restInterS: number;
  restTransitionS: number;
  /** Her saved sessions — the standalone set row's ghosts. See `WatchPlanInputs.history`. */
  history?: Session[];
  /**
   * S-17 — her learned between-sets rest for a lift, asked the same way the phone asks it
   * (`restInterSecondsFor`). Absent → the snapshot-level fallback, exactly as before.
   *
   * ⛔ THE WRIST WAS RUNNING A FLAT 90 AND CALLING IT HER PACE. This builder had no way to be told
   * her rest at all — only its uncalled twin `buildWatchPlanSnapshot` did — so a step carried
   * `restInterS` only when the COACH had written one. The watch then lit "your pace" off
   * `cur.restInterS != nil` (`LocalWorkoutEngine.swift`), i.e. precisely when the number was the
   * coach's and never when it was hers.
   *
   * ⛔ AND THE BADGE IS EXACT NOW (2026-08-16). This note used to end *"still imprecise, and
   * deliberately left so… a schema bump plus a matching Swift decode that cannot be exercised from
   * here"*, leaving one wrong direction standing: a rest the COACH wrote still read as her pace.
   *
   * It turned out not to need a schema bump at all — `restIsLearned` rides as an OPTIONAL key, the
   * same way `lastReps` did, so an older watch ignores it and a newer watch reading an older plan
   * decodes `nil` and draws what it always drew. What could not be exercised from here is the Swift
   * decode, and that is answered by `theWristSaysYourPaceOnlyWhenItIsHers`, which reads both sides
   * as text and holds them to each other — the same instrument `watchCopyPack` already uses to keep
   * a Swift constant honest without compiling Swift.
   */
  restInterSFor?: (exerciseId: string) => number | null;
}): WatchPlanSnapshot | null {
  const workouts: WatchPlanWorkout[] = [];
  const lastOf = lastTimeLookup(inp.history);

  for (const session of inp.sessions) {
    const everyItemIsALift = session.blocks.every((b) => b.items.every((i) => i.kind === 'reps'));
    if (!everyItemIsALift) continue;

    const steps: WatchPlanStep[] = [];
    let global = 0;
    for (const block of session.blocks) {
      for (const item of block.items) {
        if (item.kind !== 'reps') continue; // unreachable given the guard; the narrowing is for TS
        const ex = exerciseById(item.ex);
        const setup = loadSetup(item.ex, item.load, 'kg');
        for (let r = 0; r < block.rounds; r++) {
          steps.push({
            exerciseId: item.ex,
            exerciseName: ex?.name ?? item.ex,
            exerciseGroup: ex?.muscle ?? '',
            setIndexInExercise: r,
            totalSetsInExercise: block.rounds,
            globalIndex: global,
            ...lastFields(lastOf(item.ex)),
            targetWeight: item.load,
            targetReps: item.reps[0],
            // Her band's ceiling, so the wrist draws the same ruler standalone that it draws mirrored.
            targetRepsHi: item.reps[1],
            /*
             * The coach's own rest for this block, else HER learned rest on this lift — the same two
             * tiers, in the same order, that `restAfterStep` runs on the phone (S-17/S-48).
             *
             * ⛔ AND THE WRIST IS NOW TOLD WHICH OF THE TWO IT GOT. `restIsLearned` is set on the
             * second branch ONLY: `Home` passes `restInterSFor` as "her median, or null if she has
             * not earned one yet", so reaching that branch at all is the proof. The first branch is
             * a number the COACH wrote, and it must never wear her name.
             */
            ...(block.restS != null
              ? { restInterS: block.restS }
              : inp.restInterSFor?.(item.ex) != null
                ? { restInterS: inp.restInterSFor(item.ex) as number, restIsLearned: true }
                : {}),
            ...(setup
              ? { loadSetup: { style: setup.style, perSide: setup.perSide, plates: setup.plates ?? undefined } }
              : {}),
          });
          global += 1;
        }
      }
    }
    if (steps.length === 0) continue;
    workouts.push({
      id: session.id,
      name: session.name,
      // The coach names its own sessions, so there is no muscle line to derive — and inventing one
      // would be a claim about a week nobody made.
      muscles: '',
      steps,
    });
  }

  if (workouts.length === 0) return null;
  return {
    schema: WATCH_PLAN_SCHEMA_VERSION,
    planId: contentHash(workouts),
    generatedAt: new Date(inp.nowMs).toISOString(),
    restInterS: inp.restInterS,
    restTransitionS: inp.restTransitionS,
    workouts,
  };
}
