/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST TAKES OVER WHEN THE PHONE GOES SILENT — the phone's half. (2026-10-17, the wrist-alone
 * plan, stage 3; approved 2026-10-13, "כן מאשר")
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני רוצה שהאימון בשעון יהיה ברמה הגבוהה ביותר ושיהיה מסונכרן בצורה מושלמת עם הפלאפון."*
 *
 * ⛔ THE GAP: a workout the PHONE runs could not survive the phone. Killed in a pocket (build 79), left
 * in a locker, out of range — the wrist's Complete set asked a phone that did not answer, the honest
 * viewer came up, and the set was logged nowhere. The wrist had an engine that runs a workout by
 * itself and nothing to run it WITH: all it knew of the session was the frame on its glass.
 *
 * Two halves live here, both pure:
 *
 *   1. THE KIT (`takeoverKit`) — on every live frame, what the wrist's engine needs to carry the
 *      workout on from exactly where it stands: the session's plan as the phone holds it NOW (her
 *      weights carried, the bridges she asked for, every rest already resolved), what she has logged,
 *      and where she is. The bridge decides when the heavy part (the steps) rides along (`rev`).
 *
 *   2. THE ONE RULE (`decideTakeover`) — when the wrist offers the workout back under the PHONE's
 *      session id, whose account of the time apart stands. Both accounts share everything up to the
 *      split (the kit the wrist started from), so the question is only who did more after it:
 *
 *        · the wrist did more  → the phone takes the wrist's account, under its own session id;
 *        · otherwise           → the phone keeps its own, and the wrist lets go of its copy.
 *
 *      Logged on BOTH sides after the split is a set she logged twice (the phone showed the set the
 *      wrist had already logged, and she pressed it): the longer account already contains it. Ties
 *      go to the phone, which she is holding when the two meet again.
 */

//

import type { Session, SetLog } from '@/data/local/models';
import type { SessionMachine } from '@/state/machines/sessionState';
import type { Step } from '@/state/stores/sessionStore';
import type { MirrorSuperset } from '@/platform/sessionMirror';
import type { WarmupSet } from '@/domain/warmupRamp';
import type { LastTime } from '@/domain/lastTimeOn';
import { exerciseById, exerciseDisplayName } from '@/data/exercises';
import { rampRungs, wireSetup } from './watchLoad';
import type { WatchPlanStep, WatchRecordItem, WatchRecordSet, WatchSwapChoice, WatchTakeoverKit } from './protocol';

/** What only the session store can answer about its own plan — handed in, so this stays pure. */
export interface TakeoverStepFacts {
  /** The rest after this step, as the phone's clock would run it (`restAfterStep`). */
  restAfter: (st: Step) => number;
  /** Whether that rest is HER measured pace (the mirror's `restIsLearned` rule). */
  restLearned: (st: Step) => boolean;
  /** The superset step `i` is part of, as the stage reads it (`sessionSupersetAt`). */
  superset: (i: number) => MirrorSuperset | null;
  /** The warm-up the phone would offer before step `i` (`warmupOffer`), or null. */
  warmupAt: (i: number) => readonly WarmupSet[] | null;
  /** What she did last time on this lift — the ghosts in the wrist's set row. */
  lastOf: (exerciseId: string) => LastTime | null;
  /** The swaps the phone would offer on the walk to step `i` (stage 4) — asked only at a lift's first step. */
  swapsAt?: (i: number) => WatchSwapChoice[] | undefined;
}

const lastFields = (last: LastTime | null): { lastReps?: number[]; lastLoadKg?: number | null } =>
  last && last.reps.length > 0 ? { lastReps: last.reps, lastLoadKg: last.loadKg } : {};

/**
 * The live plan, in the shape the wrist's engine runs — or null when one step of it is a shape the
 * wrist cannot run (then there is no kit, and a silent phone means "reconnecting", as it always did).
 *
 * ⚠️ IT IS THE PLAN AS IT STANDS, NOT AS IT WAS WRITTEN: a weight she carried forward, a warm-up she
 * inserted, a lift she swapped — every edit the session has made is in it, because every one of them
 * is in `plan`. Each step says its own rest (already resolved — the coach's, hers, the walk), so the
 * wrist computes nothing (no second engine on the wrist).
 */
export function takeoverSteps(plan: readonly Step[], facts: TakeoverStepFacts): WatchPlanStep[] | null {
  const out: WatchPlanStep[] = [];
  for (let i = 0; i < plan.length; i++) {
    const st = plan[i];
    const rest = Math.round(facts.restAfter(st));
    const round = facts.superset(i);
    // The swaps on the walk to a lift — on its first step only, the one a crossing leads into.
    const swaps = i === 0 || plan[i - 1].exerciseId !== st.exerciseId ? facts.swapsAt?.(i) : undefined;
    const placed = {
      restInterS: rest,
      restAfterS: rest,
      ...(st.restAfterS != null ? { restWritten: true } : {}),
      ...(facts.restLearned(st) ? { restIsLearned: true } : {}),
      ...(round ? { superset: { round: round.round, rounds: round.rounds, position: round.position, count: round.count } } : {}),
      ...(st.where ? { at: { block: st.where.block, round: st.where.round, position: st.where.position } } : {}),
      ...(swaps && swaps.length > 0 ? { swaps } : {}),
    };
    if (!st.target) {
      const item = st.item;
      if (!item || (item.kind !== 'time' && item.kind !== 'distance')) return null; // nothing the wrist can draw
      out.push({
        exerciseId: st.exerciseId,
        exerciseName: exerciseDisplayName(st.exerciseId),
        exerciseGroup: exerciseById(st.exerciseId)?.muscle ?? '',
        setIndexInExercise: st.exerciseSetIndex,
        totalSetsInExercise: st.totalSetsInExercise,
        globalIndex: i,
        targetWeight: item.load ?? null,
        targetReps: 0,
        ...(item.kind === 'time' ? { holdSeconds: Math.round(item.seconds) } : { holdMetres: Math.round(item.metres) }),
        ...placed,
      });
      continue;
    }
    const t = st.target;
    const ramp = st.warmup ? null : facts.warmupAt(i);
    const setup = wireSetup(st.exerciseId, t.recommendedWeight);
    out.push({
      exerciseId: st.exerciseId,
      exerciseName: exerciseDisplayName(st.exerciseId),
      exerciseGroup: exerciseById(st.exerciseId)?.muscle ?? '',
      setIndexInExercise: st.exerciseSetIndex,
      totalSetsInExercise: st.totalSetsInExercise,
      globalIndex: i,
      // Last time's WORKING reps are no ghost for a bridge to draw (the mirror's own rule).
      ...(st.warmup ? {} : lastFields(facts.lastOf(st.exerciseId))),
      targetWeight: t.recommendedWeight,
      targetReps: t.recommendedReps,
      ...(t.repBandHi != null && !st.warmup ? { targetRepsHi: t.repBandHi } : {}),
      ...(t.blockId ? { blockId: t.blockId } : {}),
      ...(t.reasonType ? { reasonType: t.reasonType } : {}),
      ...(t.reasonDelta != null ? { reasonDelta: t.reasonDelta } : {}),
      ...(setup ? { loadSetup: setup } : {}),
      ...placed,
      ...(ramp && ramp.length > 0 ? { ramp: rampRungs(st.exerciseId, ramp) } : {}),
      ...(st.warmup ? { warmup: { index: st.warmup.index, count: st.warmup.count } } : {}),
    });
  }
  return out;
}

/** The plan's name — a stable hash of its content, so "is this the plan I hold?" is one comparison. */
export function takeoverRev(steps: readonly WatchPlanStep[]): string {
  const json = JSON.stringify(steps);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return `kit_${(h >>> 0).toString(36)}_${steps.length}`;
}

/** A logged set, as the wrist writes one — so the account it continues reads as its own would. */
export function wristSetOf(s: SetLog, where: Step['where'] | undefined): WatchRecordSet {
  return {
    exerciseId: s.exerciseId,
    setIndex: s.setIndex,
    ...(s.blockId ? { blockId: s.blockId } : {}),
    recommendedWeight: s.recommendedWeight ?? null,
    recommendedReps: s.recommendedReps,
    actualWeight: s.actualWeight ?? null,
    actualReps: s.actualReps,
    completedAt: s.persistedAt,
    ...(s.isWarmup ? { isWarmup: true } : {}),
    ...(where && !s.isWarmup ? { at: { block: where.block, round: where.round, position: where.position } } : {}),
    ...(s.restBeforeS != null ? { restBeforeS: s.restBeforeS } : {}),
  };
}

/** The phone machine's phase, in the wrist's words — a crossing has two names on the phone, one here. */
function wristPhase(p: string | null | undefined): 'active_set' | 'rest_inter' | 'rest_transition' | null {
  if (p === 'SET_PRESENTED') return 'active_set';
  if (p === 'REST_INTER') return 'rest_inter';
  if (p != null && p.startsWith('REST_TRANSITION')) return 'rest_transition';
  return null;
}

export interface TakeoverKitInputs {
  session: Session;
  plan: readonly Step[];
  machine: SessionMachine;
  /** `takeoverSteps(plan, …)` — built by the caller, which also owns when it is rebuilt. */
  steps: WatchPlanStep[];
  /** From the frame this kit rides with: the running rest's absolute end and prescribed length. */
  restEndsAt: string | null;
  restTotalS: number | null;
  /** The running rest's start (the phone's anchor — moved on by every pause already lifted), epoch ms. */
  restStartedAtMs: number | null;
  /** When the phone paused, while it is paused — the wrist moves the rest's start by the pause from HERE. */
  pausedAtMs: number | null;
  /** A paused rest's remainder, in seconds. */
  pausedRestRemainingS: number | null;
  /** A running hold's absolute end (ISO). */
  holdEndsAt: string | null;
  /** A rest she finished and has not logged a set after — the phone's `pendingRestS`. */
  pendingRestS: number | null;
  restInterS: number;
  restTransitionS: number;
}

/**
 * The kit for this frame — or null when there is nothing a wrist could carry on: no live phase (the
 * workout is over or not begun), no plan the wrist can run, or a cursor off the plan.
 */
export function takeoverKit(inp: TakeoverKitInputs): WatchTakeoverKit | null {
  const { session, plan, machine, steps } = inp;
  if (steps.length === 0 || steps.length !== plan.length) return null;
  if (machine.setIndex < 0 || machine.setIndex >= steps.length) return null;
  const paused = machine.phase === 'PAUSED';
  const phase = paused ? 'paused' : wristPhase(machine.phase);
  if (!phase) return null;
  const pausedFrom = paused ? wristPhase(machine.resumePhase ?? 'SET_PRESENTED') : null;
  if (paused && !pausedFrom) return null;
  const resting = phase === 'rest_inter' || phase === 'rest_transition' || pausedFrom === 'rest_inter' || pausedFrom === 'rest_transition';

  /* Where each logged set sat in the day. Read off the set's own canonical row, which the phone writes
     in the same instant as the set (`itemResultOf(current, {}, setLog, setLog.persistedAt)`) — never
     looked up by set number, which restarts in every block a lift appears in. A set with no row (a
     bridge, or an engine-built plan) has no place, and the record says so rather than guess one. */
  const whereOf = (s: SetLog) => {
    const row = (session.items ?? []).find((i) => i.kind === 'reps' && i.ex === s.exerciseId && i.at === s.persistedAt);
    return row ? { block: row.block, round: row.round, position: row.position } : undefined;
  };
  const holds: WatchRecordItem[] = (session.items ?? [])
    .filter((i) => i.kind === 'time' || i.kind === 'distance')
    .map((i) => ({
      exerciseId: i.ex,
      block: i.block,
      round: i.round,
      position: i.position,
      kind: i.kind as 'time' | 'distance',
      // Whole numbers: the wrist decodes `Int`, and one fraction would make the WHOLE kit unreadable.
      ...(i.kind === 'time' ? { seconds: Math.round(i.seconds) } : { metres: Math.round((i as { metres: number }).metres) }),
      ...((i as { load?: number | null }).load != null ? { load: (i as { load: number }).load } : {}),
      completedAt: i.at,
      ...(i.restBeforeS != null ? { restBeforeS: i.restBeforeS } : {}),
    }));

  const at = (ms: number | null) => (ms != null && Number.isFinite(ms) ? new Date(ms).toISOString() : null);
  return {
    sessionId: session.id,
    workoutId: session.programDayId,
    workoutName: session.programDayName ?? '',
    startedAt: session.startedAt,
    rev: takeoverRev(steps),
    // Always built whole; the bridge decides whether this frame carries the steps (`kitToSend`).
    steps,
    cursor: machine.setIndex,
    phase,
    ...(paused ? { pausedFrom } : {}),
    ...(phase !== 'paused' && resting && inp.restEndsAt ? { restEndsAt: inp.restEndsAt } : {}),
    ...(resting && inp.restTotalS != null ? { restTotalS: Math.round(inp.restTotalS) } : {}),
    ...(paused && resting && inp.pausedRestRemainingS != null ? { pausedRestRemainingS: Math.max(0, Math.round(inp.pausedRestRemainingS)) } : {}),
    ...(phase === 'active_set' && inp.holdEndsAt ? { holdEndsAt: inp.holdEndsAt } : {}),
    ...(resting && at(inp.restStartedAtMs) ? { restStartedAt: at(inp.restStartedAtMs)! } : {}),
    ...(paused && at(inp.pausedAtMs) ? { pausedAt: at(inp.pausedAtMs)! } : {}),
    ...(inp.pendingRestS != null ? { pendingRestS: Math.round(inp.pendingRestS) } : {}),
    sets: session.sets.map((s) => wristSetOf(s, whereOf(s))),
    ...(holds.length > 0 ? { items: holds } : {}),
    restInterS: Math.round(inp.restInterS),
    restTransitionS: Math.round(inp.restTransitionS),
  };
}

/**
 * How much an account of the workout holds — counted the way the kit counts its split: every set
 * (a bridge among them) and every hold or carry. The reps rows of `items` are the same sets written a
 * second time, and are not counted twice.
 */
export function sessionWork(session: Pick<Session, 'sets' | 'items'>): number {
  return session.sets.length + (session.items ?? []).filter((i) => i.kind === 'time' || i.kind === 'distance').length;
}

/**
 * ⛔ THE ONE AUTHORITY RULE — a workout the wrist took over, offered back. See the head of this file.
 *
 *   'proceed'    → take the wrist's account, under the phone's own session id.
 *   'superseded' → the phone keeps its account; the wrist is told its offer is held, and lets go.
 *   'duplicate'  → the phone has already SAVED this workout; nothing to move, and the wrist lets go.
 *   'refused'    → a DIFFERENT workout is live on the phone; the wrist keeps running its own.
 */
export function decideTakeover(inp: {
  /** The session the offer continues — the phone's own id. */
  takeoverOf: string;
  /** How much the phone had logged (sets + items) when the wrist took over. */
  splitAt: number;
  /** How much the wrist's account holds now. */
  wristWork: number;
  /** The session live on the phone right now, if any, and how much it holds. */
  live: { id: string; work: number } | null;
  /** Ids already in her saved history. */
  historyIds: readonly string[];
}): 'proceed' | 'superseded' | 'duplicate' | 'refused' {
  if (inp.live && inp.live.id === inp.takeoverOf) {
    const wristSince = inp.wristWork - inp.splitAt;
    const phoneSince = inp.live.work - inp.splitAt;
    return wristSince > phoneSince ? 'proceed' : 'superseded';
  }
  if (inp.live) return 'refused';
  if (inp.historyIds.includes(inp.takeoverOf)) return 'duplicate';
  return 'proceed';
}
