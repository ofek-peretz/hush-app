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
 *
 * ⛔ THE WARM-UP IS OFFERED HERE AS IT IS ON THE PHONE — NEVER WRITTEN IN (2026-10-17, stage 2).
 * A standalone plan carries WORKING sets only, and still does: a watch build that predates the
 * `isWarmup` flag would render a half-weight bridge as "Set 1 of 5" — the looks-broken defect Rev 8
 * was about — and since the founder's ruling of 2026-08-30 nobody's plan contains a warm-up anyway.
 * What a step carries now is the OFFER (`WatchPlanStep.ramp`): the bridges the phone's own
 * `warmupOffer` would insert before it, so the wrist alone can offer "+ Warm-up" exactly where the
 * phone's stage offers its disc, and insert them on her press without computing a thing.
 */

// 

import type { ProgramDay, SetTarget, Session } from '@/data/local/models';
import { lastTimeOn, type LastTime } from '@/domain/lastTimeOn';
import { exerciseById, exerciseDisplayName, muscleGroupsLabel } from '@/data/exercises';
import type { PlannedItem, PlannedSession } from '@/domain/coachPlan';
import { loadSetup } from '@/domain/loadPresentation';
import { restAfterRun, restInterSecondsFor } from '@/domain/restPrescription';
import { runSteps } from '@/domain/planRun';
import { supersetAt } from '@/domain/supersetView';
import { REST_SKIP_THRESHOLD_S } from '@/state/machines/sessionState';
import { buildPlanFromCoach, retargetPlanForSwap, warmupOffer } from '@/state/stores/sessionStore';
import type { EquipmentFamily } from '@/data/exercises';
import { rampRungs, swapChoicesFor, wireSetup } from './watchLoad';
import {
  WATCH_PLAN_SCHEMA_VERSION,
  type WatchPlanSnapshot,
  type WatchPlanStep,
  type WatchPlanWorkout,
  type WatchWarmupRung,
} from './protocol';

/**
 * The warm-up the PHONE would offer before step `at` of its own plan of the day, in the shape the
 * wrist inserts — each bridge with the bar it is loaded on, because the wrist does no plate maths.
 * `undefined` where the phone offers none: not a compound, not the start of its run, inside a
 * superset's round, a lift the day revisits, or a load with no distinct rung below it.
 */
export function rampOffered(plan: Parameters<typeof warmupOffer>[0], at: number): WatchWarmupRung[] | undefined {
  const offer = warmupOffer(plan, at);
  return offer ? rampRungs(plan[at].exerciseId, offer.ramp) : undefined;
}

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
        // B-11 — her median when the supplier has one, else the phone's own band-shaped bootstrap,
        // so a standalone strength seat rests like a strength seat (see the coach-plan builder).
        restInterS: restInterSFor?.(slot.exerciseId) ?? restInterSecondsFor(slot.exerciseId, target.repBandLo),
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
      // ⛔ THE SAME RAW JOIN, AND THIS ONE LEFT THE PHONE. `watchCopyPack` exists precisely so the
      // wrist speaks her language; this line shipped `Chest · Back` past it, so the watch showed
      // English muscle names beside Hebrew everything-else.
      muscles: muscleGroupsLabel(day.muscleGroups),
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
 * ════ THE WATCH OFFERS ONLY WHAT IT CAN HONESTLY EXECUTE — WHOLE ════
 *
 * Until 2026-10-13 the wrist's protocol was reps-at-a-load and nothing else, so a session with a
 * 400 m repeat or a 45-second plank in it was NOT OFFERED standalone. The alternative was to send
 * the lifts and drop the rest, and that is the one thing this layer exists to prevent: she would
 * start "Intervals & Core" on her wrist, do the squats, and never see the running — a different
 * workout from the one the coach wrote, with nothing anywhere saying so.
 *
 * The wrist's engine now runs a hold on its own clock and a carry in metres (stage 1b), so such a
 * day is sent — whole, in the phone's own order — in `moreWorkouts`, where a watch one build behind
 * never looks. What is still not sent is a shape the wrist cannot draw at all (`theWristOffersOnly
 * WhatItCanRun`): "you cannot start this one from your wrist" stays the honest answer there.
 *
 * ⚠️ IT RETURNS null RATHER THAN AN EMPTY LOBBY when nothing qualifies, which is the same answer
 * `buildWatchPlanSnapshot` gives: an empty plan on the wrist reads as "you have no workouts", and
 * she has a week — just not one this device can run by itself.
 */
export function buildCoachWatchPlan(inp: {
  sessions: { id: string; name: string; blocks: { rounds: number; restS?: number; restAfterS?: number; items: PlannedItem[] }[] }[];
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
  /** Her equipment — the swaps the wrist offers alone are chosen against it, as the live mirror's are. */
  equipment?: readonly EquipmentFamily[];
}): WatchPlanSnapshot | null {
  const workouts: WatchPlanWorkout[] = [];
  /** The days with a hold or a carry in them — see `WatchPlanSnapshot.moreWorkouts`. */
  const more: WatchPlanWorkout[] = [];
  const lastOf = lastTimeLookup(inp.history);

  for (const session of inp.sessions) {
    /*
     * ⛔ A DAY WITH A HOLD IN IT IS SENT NOW (2026-10-13, stage 1b). This guard was "every item is a
     * lift, or the day is not sent" — so a week with one plank in it had a workout she could not
     * start with her phone in a locker, and the wrist's Start screen offered another day in its
     * place. A hold and a carry are steps the wrist has known how to DRAW since 2026-09-17; its own
     * engine runs them now (`LocalWorkoutEngine` — the hold's clock, Done, the item in the record).
     * What is still not sent is a shape the wrist cannot draw at all.
     */
    const kinds = session.blocks.flatMap((b) => b.items.map((i) => i.kind));
    if (!kinds.every((k) => k === 'reps' || k === 'time' || k === 'distance')) continue;
    const everyItemIsALift = kinds.every((k) => k === 'reps');

    /*
     * ⛔ THE PHONE'S OWN RUN OF THE DAY, NOT A SECOND FLATTENING OF IT (2026-10-13, stage 1).
     *
     * This loop used to walk block → item → round, so a couple of two lifts for three rounds went to
     * the wrist as A, A, A, B, B, B — and the engine there ran it that way, with a full rest after
     * every set. `planRun` is the one place that knows what a round is (it is what the phone's own
     * session is built from), so the wrist is sent ITS order: A, B, A, B, A, B.
     *
     * And each step is told the two things only the whole run can say: how long she rests after it
     * (`restAfterRun` — the same rule the live session asks, zero inside a round included), and
     * which round of which superset it is (`supersetAt` — the same reading every screen draws from).
     * `theWristRunsWhatThePhoneRuns` plays the result on the watch's real engine against the phone.
     */
    const run = runSteps({ name: session.name, blocks: session.blocks } as PlannedSession);
    // The phone's own plan of this day — one step per step of the run, in the same order — asked
    // only what it alone can answer: where a warm-up would be offered, and what it would be.
    const own = buildPlanFromCoach({ name: session.name, blocks: session.blocks } as PlannedSession);
    /*
     * …and the swaps it would offer on the walk to each lift (stage 4, 2026-10-17): the same options
     * its live mirror sends (`wristSwapOptions`, against this day's lifts), each with what the wrist
     * needs to show it once chosen. Asked on the FIRST step of each lift's run — the only step a
     * crossing leads into — and never anywhere else, because every byte here rides one message.
     */
    const lifts = [...new Set(own.map((st) => st.exerciseId))];
    const swapFacts = {
      liftsAfter: (at: number, id: string) => [...new Set(retargetPlanForSwap(own, [], at, id).map((st) => st.exerciseId))],
      warmupAfter: (at: number, id: string) => warmupOffer(retargetPlanForSwap(own, [], at, id), at)?.ramp ?? null,
      lastOf,
      equipment: inp.equipment,
    };
    const swapsAt = (at: number, kg: number | null) =>
      at === 0 || run[at - 1].item.ex !== run[at].item.ex ? swapChoicesFor(run[at].item.ex, lifts, at, kg, swapFacts) : undefined;
    const lastOfLift = (i: number) => i === run.length - 1 || run[i + 1].item.ex !== run[i].item.ex;
    // What the plan itself says after each step. The session's closing zero is a fact about the
    // POSITION, not the step (`laws/aSupersetIsOnlyEverWritten`) — the last step keeps its block's own.
    const said = run.map((st) => (st.last ? session.blocks[st.block - 1]?.restAfterS : st.restAfterS));
    const restAfter = run.map((st, i) =>
      restAfterRun({ said: said[i], lastSetOfExercise: lastOfLift(i), exerciseId: st.item.ex, bandLo: st.item.kind === 'reps' ? st.item.reps[0] : null }),
    );
    const shape = run.map((st) => ({ exerciseId: st.item.ex }));
    const straightOn = (i: number) => restAfter[i] <= REST_SKIP_THRESHOLD_S && !run[i].last;
    const steps: WatchPlanStep[] = [];
    let global = 0;
    run.forEach((st, at) => {
      const item = st.item;
      const block = session.blocks[st.block - 1];
      const round = supersetAt(shape, at, (s) => straightOn(shape.indexOf(s)));
      /** What only the whole run can say about a step — the same for a set and for a hold. */
      const placed = {
        // After this step — see the note at the head of this loop.
        restAfterS: Math.round(restAfter[at]), // an integer on the wire: the wrist decodes `Int`, and a fraction refuses the whole plan
        ...(said[at] != null ? { restWritten: true } : {}),
        ...(round ? { superset: { round: round.round, rounds: round.rounds, position: round.position, count: round.exerciseIds.length } } : {}),
        at: { block: st.block, round: st.round, position: st.position },
      };
      if (item.kind === 'time' || item.kind === 'distance') {
        // A hold or a carry: its seconds or its metres, what she carries if anything, and no reps.
        const holdSwaps = swapsAt(at, item.load ?? null);
        steps.push({
          exerciseId: item.ex,
          exerciseName: exerciseDisplayName(item.ex),
          exerciseGroup: '',
          setIndexInExercise: st.round - 1,
          totalSetsInExercise: block.rounds,
          globalIndex: global,
          targetWeight: item.load ?? null,
          targetReps: 0,
          ...(item.kind === 'time' ? { holdSeconds: Math.round(item.seconds) } : { holdMetres: Math.round(item.metres) }),
          ...placed,
          ...(holdSwaps ? { swaps: holdSwaps } : {}),
        });
        global += 1;
        return;
      }
      if (item.kind !== 'reps') return; // unreachable given the guard; the narrowing is for TS
      const ex = exerciseById(item.ex);
      const setup = wireSetup(item.ex, item.load);
      const ramp = own[at] && own[at].exerciseId === item.ex ? rampOffered(own, at) : undefined;
      const liftSwaps = swapsAt(at, item.load);
      const r = st.round - 1;
      steps.push({
        exerciseId: item.ex,
        // Her language's name — the same one the phone's mirror carries (`buildMirrorSteps`),
        // so a workout begun on the wrist reads as it would have from the phone.
        exerciseName: exerciseDisplayName(item.ex),
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
        /*
         * ⛔ AND WITH NEITHER, THE WRIST NOW GETS THE PHONE'S OWN BOOTSTRAP (B-11, 2026-09-10).
         * It used to send nothing and let the standalone wrist fall back to one flat 90 seconds
         * for every lift in the week — so an athlete training away from her phone rested the
         * same before a heavy triple and a set of fifteen. `restInterSecondsFor` with the seat's
         * floor is exactly what `restAfterStep` would answer on the phone, and it is deliberately
         * NOT marked `restIsLearned`: it is a prescription, not her measured median.
         */
        ...(block.restS != null
          ? { restInterS: block.restS }
          : inp.restInterSFor?.(item.ex) != null
            ? { restInterS: inp.restInterSFor(item.ex) as number, restIsLearned: true }
            : { restInterS: restInterSecondsFor(item.ex, item.reps[0]) }),
        ...(setup ? { loadSetup: setup } : {}),
        // The warm-up the phone would offer before this set, when it would (stage 2, 2026-10-17).
        ...(ramp ? { ramp } : {}),
        ...placed,
        // The lifts she may swap it for on the walk to it (stage 4).
        ...(liftSwaps ? { swaps: liftSwaps } : {}),
      });
      global += 1;
    });
    if (steps.length === 0) continue;
    // A watch one build behind knows only sets: a day with a hold goes where it does not look.
    (everyItemIsALift ? workouts : more).push({
      id: session.id,
      name: session.name,
      // The coach names its own sessions, so there is no muscle line to derive — and inventing one
      // would be a claim about a week nobody made.
      muscles: '',
      steps,
      seat: inp.sessions.indexOf(session),
    });
  }

  if (workouts.length === 0 && more.length === 0) return null;
  return {
    schema: WATCH_PLAN_SCHEMA_VERSION,
    planId: contentHash([...workouts, ...more]),
    generatedAt: new Date(inp.nowMs).toISOString(),
    restInterS: inp.restInterS,
    restTransitionS: inp.restTransitionS,
    workouts,
    ...(more.length > 0 ? { moreWorkouts: more } : {}),
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * "THERE IS NOTHING LEFT FOR YOU TO RUN" — the sentence the phone could not say.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE BUG, AS THE FOUNDER MET IT: a workout finished on one device, and the OTHER device still
 * offering to start that same workout.
 *
 * The wrist prunes finished workouts with `doneWorkoutIds`, and that set only ever holds workouts
 * **this watch finished itself**. A workout completed on the PHONE leaves her wrist by exactly one
 * mechanism: the phone publishing a new snapshot without it. And when the last one is done the
 * builders above return `null` — which the wrist reads as *nothing to store*
 * (`if let plan = envelope.plan { store.savePlan(plan) }`), so it keeps the previous plan. She walks
 * away from her phone, and the Start screen offers the workout she has just finished. Starting it
 * writes a second record for one workout.
 *
 * ── WHY THE NULL IS RIGHT, AND STILL HAD TO BE ANSWERED ─────────────────────────────────────────
 * `null` conflates two facts, and only one of them is safe to act on:
 *
 *   · "there is nothing the wrist can run"  → she must stop being offered stale work
 *   · "I do not know yet"                   → `coachPlan` is null until an async read returns, so
 *                                             EVERY cold start passes through this state. Sending an
 *                                             empty plan there would wipe a good snapshot off her
 *                                             wrist on every launch and break standalone training —
 *                                             a worse bug than the one being fixed.
 *
 * The builders cannot tell those apart: they are handed sessions and asked what is runnable. Only
 * the caller knows whether the week has actually been READ. So the builders keep their contract
 * untouched, and the caller answers the second question by reaching for this.
 *
 * ⚠️ AN EMPTY `workouts` IS ENOUGH, AND NO SWIFT HAD TO CHANGE — read off the wrist to be sure:
 * `WatchStore.savePlan` has no emptiness guard, and both `offlineLobby()` and `startLocalWorkout()`
 * derive `remaining` from `stored.plan.allWorkouts` (`workouts` + `moreWorkouts`). This snapshot
 * carries neither, so the offline Start screen returns nil and a local start is a no-op. Which is
 * precisely "nothing left", said in the vocabulary the watch already speaks.
 */
export function emptyWatchPlan(inp: {
  nowMs: number;
  restInterS: number;
  restTransitionS: number;
}): WatchPlanSnapshot {
  return {
    schema: WATCH_PLAN_SCHEMA_VERSION,
    planId: contentHash([]),
    generatedAt: new Date(inp.nowMs).toISOString(),
    restInterS: inp.restInterS,
    restTransitionS: inp.restTransitionS,
    workouts: [],
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT TO PUBLISH TO THE WRIST — the rule, in one testable place.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The builders answer *what can the watch run?* and say `null` for "none". The wrist reads a null
 * plan as *no news* and keeps whatever it stored last. Between those two truthful statements sat
 * the founder's bug: a workout finished on the phone stayed on the wrist's Start screen, and
 * starting it there wrote a second record for one workout.
 *
 * The missing question is *do we KNOW?*, and only the caller can answer it:
 *
 *   builder said a plan   → publish it
 *   builder said null, week KNOWN    → publish an EMPTY plan: "there is nothing left to run"
 *   builder said null, week UNKNOWN  → publish nothing, and leave her wrist exactly as it is
 *
 * ⚠️ THE THIRD LINE IS THE ONE THAT MAKES THIS SAFE. `coachPlan` is null until an async read
 * returns, so every cold start passes through "unknown". Publishing an empty plan there would clear
 * the snapshot off her wrist on every launch and break training with the phone in a locker — a
 * worse failure than the one being fixed, and the reason this rule is a function and not an
 * `?? empty` at the call site.
 */
export function watchPlanToPublish(inp: {
  /** Whatever `buildCoachWatchPlan` / `buildWatchPlanSnapshot` returned. */
  built: WatchPlanSnapshot | null;
  /** True once the week has actually been read — NOT merely "the read was attempted". */
  weekLoaded: boolean;
  nowMs: number;
  restInterS: number;
  restTransitionS: number;
}): WatchPlanSnapshot | null {
  if (inp.built) return fitPlanToWire(inp.built);
  if (!inp.weekLoaded) return null;
  return emptyWatchPlan({
    nowMs: inp.nowMs,
    restInterS: inp.restInterS,
    restTransitionS: inp.restTransitionS,
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PLAN MUST FIT THE WIRE (2026-10-17, the wrist-alone plan, stage 4)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The whole week travels to the wrist in ONE message — the application context the lobby rides —
 * and WatchConnectivity refuses a payload over its limit outright (`payloadTooLarge`, code 7009).
 * Apple publishes no figure; ~64 KB is the number developers meet. A refused context is not a
 * smaller plan, it is NO plan: her wrist keeps last week's.
 *
 * Measured on a heavy four-day week (81 steps): 28 KB, ~350 bytes a step before her history and her
 * language's names. A six-day week was already within reach of the limit before the wrist learned
 * the warm-up (stage 2) and the swaps (stage 4). So the plan is held to a budget, with room left for
 * the lobby and her copy beside it in the same message, and what does not fit is given up in the
 * order it matters least — never a set of a workout:
 *
 *   1 · the options offered for a lift once it is swapped in   (a second swap shows fewer)
 *   2 · the swaps themselves                                   (no Swap alone; the phone still offers it)
 *   3 · the warm-up offers                                     (no "+ Warm-up" alone)
 *   4 · last time's reps                                       (dashes in the set row, as for a new lift)
 *   5 · the days furthest ahead, one at a time                 (they are sent the next time she is on Today)
 */
export const WATCH_PLAN_BYTE_BUDGET = 40_000;

function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function planBytes(plan: WatchPlanSnapshot): number {
  return utf8Bytes(JSON.stringify(plan));
}

export function fitPlanToWire(plan: WatchPlanSnapshot, budget = WATCH_PLAN_BYTE_BUDGET): WatchPlanSnapshot {
  if (planBytes(plan) <= budget) return plan;
  const withSteps = (p: WatchPlanSnapshot, f: (s: WatchPlanStep) => WatchPlanStep): WatchPlanSnapshot => {
    const map = (ws: WatchPlanWorkout[]) => ws.map((w) => ({ ...w, steps: w.steps.map(f) }));
    return { ...p, workouts: map(p.workouts), ...(p.moreWorkouts ? { moreWorkouts: map(p.moreWorkouts) } : {}) };
  };
  const rename = (p: WatchPlanSnapshot): WatchPlanSnapshot => ({ ...p, planId: contentHash([...p.workouts, ...(p.moreWorkouts ?? [])]) });
  const cuts: ((s: WatchPlanStep) => WatchPlanStep)[] = [
    (s) => (s.swaps ? { ...s, swaps: s.swaps.map(({ swaps: _next, ...c }) => c) } : s),
    ({ swaps: _swaps, ...s }) => s,
    ({ ramp: _ramp, ...s }) => s,
    ({ lastReps: _reps, lastLoadKg: _load, ...s }) => s,
  ];
  let p = plan;
  for (const cut of cuts) {
    p = rename(withSteps(p, cut));
    if (planBytes(p) <= budget) return p;
  }
  // The days furthest ahead go last, one at a time — by her week's order, never the next one.
  const all = [...p.workouts.map((w) => ({ w, more: false })), ...(p.moreWorkouts ?? []).map((w) => ({ w, more: true }))]
    .sort((a, b) => (a.w.seat ?? 0) - (b.w.seat ?? 0));
  while (all.length > 1) {
    all.pop();
    const kept = all.map((x) => x.w.id);
    p = rename({
      ...p,
      workouts: p.workouts.filter((w) => kept.includes(w.id)),
      ...(p.moreWorkouts ? { moreWorkouts: p.moreWorkouts.filter((w) => kept.includes(w.id)) } : {}),
    });
    if (planBytes(p) <= budget) return p;
  }
  return p;
}
