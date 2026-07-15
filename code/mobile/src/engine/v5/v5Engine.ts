/**
 * Hush Engine v5 — the live integration façade (mirrors v4Engine.ts, but EXERCISE-keyed).
 *
 * Bridges the app's Session history + Profile to the pure v5 core and persists per-exercise state
 * (db.engineV5). Cadence: `advanceV5` folds the week's completed sets into ONE decision per exercise
 * (S-29 — one progression fed by both sessions) at the Sat-20:30 calendar roll. The prescription the
 * athlete sees comes from the durable ExerciseState. History is the substrate; there is no migration
 * from v4 (S-58).
 *
 * The pure core (loop2/loop1/grid/repsPerRung) is unchanged — this only marshals data in and out.
 */

import type { Session, Program } from '@/data/local/models';
import { db, type EngineV5State } from '@/data/local/db';
import { exerciseMeta } from '@/engine/v4/catalogAdapter';
import { exerciseDisplayName } from '@/data/exercises';
import { currentWeekOpen } from '@/domain/weekCadence';
import type { WeeklyUpdate, WeeklyPlanView, WeeklyPlanWorkout, WeeklyPlanLift, WeekPlanChange } from '@/engine/v4/v4Engine';
import type { Explanation, ExplanationLine } from '@/engine/v4/types';
import { decideExercise } from './loop2';
import { snapDown } from './grid';
import type { Band, ExerciseState, ExerciseMeta, SetPerf, SessionRecord } from './types';
import { RECENCY_WINDOW_SESSIONS, RECENCY_WINDOW_DAYS, SETS_MIN } from './constants';

export type SeedFor = (exerciseId: string) => number | null;

// ───────────────────────────── meta + history reads ─────────────────────────────
function metaWithGrid(exerciseId: string, history: Session[]): ExerciseMeta {
  const m = exerciseMeta(exerciseId);
  return { equipment: m.equipment, bodyweight: m.bodyweight, observedLoads: observedLoads(exerciseId, history) };
}

/** The distinct real loads she has performed on an exercise (the learned grid, F-2). De-duped to 0.5. */
function observedLoads(exerciseId: string, sessions: Session[]): number[] {
  const seen = new Set<number>();
  for (const s of sessions) for (const log of s.sets) {
    if (log.exerciseId === exerciseId && !log.isApproach && log.actualWeight != null && log.actualWeight > 0) seen.add(Math.round(log.actualWeight * 2) / 2);
  }
  return [...seen];
}

/** Best load she completed at ≥ Tlo reps across history (the established-load read for init). */
function bestDemonstratedLoad(exerciseId: string, band: Band, sessions: Session[]): number | null {
  let best: number | null = null;
  for (const s of sessions) for (const log of s.sets) {
    if (log.exerciseId === exerciseId && !log.isApproach && log.actualWeight != null && log.actualReps >= band.lo && (best == null || log.actualWeight > best)) best = log.actualWeight;
  }
  return best;
}

/** Working SetPerfs for an exercise from a set of sessions. Approach sets (S-60) are a measurement,
 *  not work — excluded from the fold (they still carry their mark through for completeness). */
function setPerfs(exerciseId: string, sessions: Session[]): SetPerf[] {
  const out: SetPerf[] = [];
  for (const s of sessions) for (const log of s.sets) {
    if (log.exerciseId !== exerciseId || log.isApproach) continue;
    out.push({ load: log.actualWeight, reps: log.actualReps, restBeforeS: log.restBeforeS });
  }
  return out;
}

// ───────────────────────────── init ─────────────────────────────
function initExercise(exerciseId: string, band: Band, history: Session[], seedFor: SeedFor): ExerciseState {
  const meta = metaWithGrid(exerciseId, history);
  const demonstrated = meta.bodyweight ? null : bestDemonstratedLoad(exerciseId, band, history);
  const load = meta.bodyweight
    ? null
    : demonstrated != null
      ? snapDown(demonstrated, meta.equipment, meta.observedLoads)
      : seedFor(exerciseId); // no history → the seed (an approach set measures it, S-60)
  return { exerciseId, load, band, sets: Math.max(SETS_MIN, 4), history: [] };
}

// ───────────────────────────── state io ─────────────────────────────
const empty = (): EngineV5State => ({ exercises: {}, lastAdvanceWeekOpen: undefined, weeksProcessed: 0 });
async function load(): Promise<EngineV5State> {
  try { return (await db.loadEngineV5()) ?? empty(); } catch { return empty(); }
}
async function save(s: EngineV5State): Promise<void> {
  try { await db.saveEngineV5(s); } catch { /* offline/test */ }
}
const asStates = (s: EngineV5State) => s.exercises as Record<string, ExerciseState>;

/** Ensure per-exercise state exists for every engine-managed exercise. Idempotent; preserves state.
 *  A band change updates each exercise's band (T is hers; no conversion, S-43). */
export async function ensureExercisesV5(exerciseIds: string[], band: Band, history: Session[], seedFor: SeedFor): Promise<EngineV5State> {
  const state = await load();
  const ex = asStates(state);
  for (const id of exerciseIds) {
    if (!ex[id]) ex[id] = initExercise(id, band, history, seedFor);
    else if (ex[id].band.lo !== band.lo || ex[id].band.hi !== band.hi) {
      // S-43 (change T): recompute the load from her history at the NEW Tlo — "the load at which she
      // performed ≥ the new T." If she has no history at the new band, keep the current load and set
      // 1 finds it (no conversion formula). Bodyweight has no load to recompute.
      const meta = metaWithGrid(id, history);
      const demo = meta.bodyweight ? null : bestDemonstratedLoad(id, band, history);
      const load = demo != null ? snapDown(demo, meta.equipment, meta.observedLoads) : ex[id].load;
      ex[id] = { ...ex[id], band, load };
    }
  }
  await save(state);
  return state;
}

// ───────────────────────────── advance (week rollover) ─────────────────────────────
/**
 * Fold the week's completed sessions into one decision per exercise at the Sat-20:30 roll. Sessions
 * since the last advance are grouped per exercise into ONE occurrence (S-29), run through
 * decideExercise, and persisted with a fresh history record. `nowMs`/`bucketOpenMs` injectable.
 */
export async function advanceV5(
  exerciseIds: string[],
  band: Band,
  history: Session[],
  seedFor: SeedFor,
  nowMs: number = Date.now(),
  bucketOpenMs?: number,
): Promise<void> {
  const state = await ensureExercisesV5(exerciseIds, band, history, seedFor);
  const ex = asStates(state);

  const weekOpen = currentWeekOpen(nowMs);
  const rolled = state.lastAdvanceWeekOpen != null && weekOpen > state.lastAdvanceWeekOpen;

  if (rolled) {
    // The week that just CLOSED = sessions in [previous anchor, this week-open). The upper bound is
    // essential: sessions on/after `weekOpen` belong to the CURRENT (in-progress) week and are folded
    // at the NEXT roll — without it, any session after the boundary would be folded now AND again next
    // roll (a double-count), and two calendar weeks could collapse into one decision.
    const since = state.lastAdvanceWeekOpen!;
    const week = history.filter((s) => {
      const t = Date.parse(s.startedAt);
      return t >= since && t < weekOpen;
    });
    const weekIndex = state.weeksProcessed ?? 0;
    const changes: NonNullable<EngineV5State['lastUpdate']>['changes'] = [];
    for (const id of exerciseIds) {
      const st = ex[id];
      if (!st) continue;
      const meta = metaWithGrid(id, history);
      const sets = setPerfs(id, week);
      if (sets.length === 0) continue; // untrained this week → holds
      const out = decideExercise({ state: st, session: sets, meta });
      // Capture the from→to for the Weekly Update — but ONLY when the load actually moved. A
      // progress decision that the rail capped to no change (or, in the rare over-load edge, DOWN)
      // must not narrate a phantom "+0 kg". The narration direction is chosen from the real delta
      // (explainChange), not the decision label. hold/ambiguous/approach say nothing (R7/S-16).
      const loadMoved =
        (out.decision === 'progress' || out.decision === 'stall_backoff') &&
        st.load != null && out.load != null && Math.abs(out.load - st.load) > 1e-6;
      if (loadMoved) {
        changes.push({
          exerciseId: id,
          decision: out.decision,
          loadFrom: st.load,
          loadTo: out.load,
          setsFrom: st.sets,
          setsTo: out.sets,
          bandFrom: [st.band.lo, st.band.hi],
          bandTo: [out.band.lo, out.band.hi],
        });
      }
      const rec: SessionRecord = { load: st.load, sets };
      ex[id] = {
        ...st,
        load: out.load,
        band: out.band,
        sets: out.sets,
        history: [rec, ...st.history].slice(0, RECENCY_WINDOW_SESSIONS),
      };
    }
    state.weeksProcessed = weekIndex + 1;
    state.lastUpdate = { weekIndex, at: new Date(nowMs).toISOString(), seen: false, changes };
  }

  state.lastAdvanceWeekOpen = Math.max(weekOpen, bucketOpenMs ?? weekOpen);
  await save(state);
}

// ───────────────────────────── prescription read ─────────────────────────────
export interface V5Target {
  weight: number | null;
  reps: number; // Tlo
  bandHi: number; // Thi
  sets: number;
  /** True when this exercise has no recent completed set → the first set is an approach measurement (S-60). */
  isApproach: boolean;
}

/** The newest ms-epoch at which a NON-approach working set of an exercise was performed, or null. */
function lastPerformedMs(exerciseId: string, sessions: Session[]): number | null {
  let newest: number | null = null;
  for (const s of sessions) {
    if (!s.sets.some((l) => l.exerciseId === exerciseId && !l.isApproach && l.actualWeight != null)) continue;
    const t = Date.parse(s.startedAt);
    if (Number.isFinite(t) && (newest == null || t > newest)) newest = t;
  }
  return newest;
}

/**
 * The current per-exercise prescription. A loaded lift with no completed set inside the recency
 * window (F-8, TIME) is an approach set (S-60): never performed (S-8) OR aged out by a long layoff
 * (S-38). Time-based so a gap actually pushes her last set out of the window — a count window never
 * could. `nowMs` injectable for tests.
 */
export async function currentV5Targets(history: Session[], nowMs: number = Date.now()): Promise<Record<string, V5Target>> {
  const state = await load();
  const ex = asStates(state);
  const out: Record<string, V5Target> = {};
  const windowMs = RECENCY_WINDOW_DAYS * 86400000;
  for (const id of Object.keys(ex)) {
    const st = ex[id];
    const meta = exerciseMeta(id);
    const last = lastPerformedMs(id, history);
    const withinWindow = last != null && nowMs - last <= windowMs;
    out[id] = {
      weight: st.load,
      reps: st.band.lo,
      bandHi: st.band.hi,
      sets: st.sets,
      isApproach: !meta.bodyweight && !withinWindow,
    };
  }
  return out;
}

/** Reset all v5 engine state (account wipe / tests). */
export async function resetV5(): Promise<void> {
  await save(empty());
}

// ───────────────────────────── Weekly Update (parity with v4's surfaces) ─────────────────────────────
const L = (key: string, params?: ExplanationLine['params']): ExplanationLine => ({ key: `explain.${key}`, params });
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A v5 change → the same {observation, conclusion, action, text} i18n lines the Weekly Update
 *  screen renders, reusing the existing `explain.*` copy (no new keys). Only the change decisions
 *  are surfaced; hold/ambiguous/approach are not "changes" (R7). */
function explainChange(c: NonNullable<EngineV5State['lastUpdate']>['changes'][number]): Explanation {
  const ex = exerciseDisplayName(c.exerciseId);
  // Choose the copy by the REAL direction of the load move, not the decision label — a stall back-off
  // and a rail-capped progress both come DOWN (reprice copy: "matched to demonstrated capability"),
  // and a plain progress goes UP (progressLoad copy). This keeps the narration honest at the edges.
  const wentDown = c.loadFrom != null && c.loadTo != null && c.loadTo < c.loadFrom;
  if (c.decision === 'stall_backoff' || wentDown) {
    const load = c.loadTo != null ? round1(c.loadTo) : null;
    return {
      slotId: c.exerciseId, pattern: '' as never,
      observation: L('reprice.observation', { ex }),
      conclusion: L('reprice.conclusion'),
      action: load != null ? L('reprice.action', { load }) : L('reprice.actionBw'),
      text: load != null ? L('reprice.text', { ex, load }) : L('reprice.textBw', { ex }),
    };
  }
  // progress (load up)
  const delta = c.loadFrom != null && c.loadTo != null ? round1(c.loadTo - c.loadFrom) : 0;
  return {
    slotId: c.exerciseId, pattern: '' as never,
    observation: L('progressLoad.observation', { ex }),
    conclusion: L('progressLoad.conclusion'),
    action: L('progressLoad.action', { delta }),
    text: L('progressLoad.text', { ex, delta }),
  };
}

/** The most recent week's update (or null). Mirrors v4 `getWeeklyUpdate`. */
export async function getWeeklyUpdateV5(): Promise<WeeklyUpdate | null> {
  const state = await load();
  const u = state.lastUpdate;
  if (!u) return null;
  return { weekIndex: u.weekIndex, at: u.at, explanations: u.changes.map(explainChange), seen: !!u.seen };
}

/** Mark the latest v5 Weekly Update as seen. */
export async function markWeeklyUpdateSeenV5(): Promise<void> {
  const state = await load();
  if (state.lastUpdate) { state.lastUpdate.seen = true; await save(state); }
}

/**
 * The full week — every workout's lifts at their NEW loads, with the per-change from→to snapshot +
 * Why. Same shape as v4 `getWeeklyPlan`, so the screens render unchanged. Read-only.
 */
export async function getWeeklyPlanV5(program: Program): Promise<WeeklyPlanView | null> {
  const state = await load();
  const ex = asStates(state);
  const u = state.lastUpdate;
  const changeByEx = new Map((u?.changes ?? []).map((c) => [c.exerciseId, c]));

  const workouts: WeeklyPlanWorkout[] = [];
  for (const day of program.days) {
    if (day.isRest) continue;
    const lifts: WeeklyPlanLift[] = day.slots.map((slot) => {
      const st = ex[slot.exerciseId];
      const c = changeByEx.get(slot.exerciseId);
      const change = c
        ? {
            snapshot: {
              slotId: slot.exerciseId, exerciseId: slot.exerciseId,
              loadFrom: c.loadFrom, loadTo: c.loadTo, setsFrom: c.setsFrom, setsTo: c.setsTo,
              rangeFrom: c.bandFrom, rangeTo: c.bandTo, swapped: false,
            } as WeekPlanChange,
            explanation: explainChange(c),
          }
        : null;
      return {
        exerciseId: slot.exerciseId,
        name: exerciseDisplayName(slot.exerciseId),
        loadKg: st ? st.load : null,
        sets: st ? st.sets : slot.setCount,
        repRange: st ? [st.band.lo, st.band.hi] : null,
        change,
      };
    });
    workouts.push({ dayId: day.id, name: day.name, groups: day.muscleGroups, lifts });
  }
  const changedCount = workouts.reduce((n, w) => n + w.lifts.filter((l) => l.change).length, 0);
  return { weekIndex: u?.weekIndex ?? 0, at: u?.at ?? new Date().toISOString(), changedCount, seen: !!u?.seen, workouts };
}
