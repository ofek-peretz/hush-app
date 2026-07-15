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

/**
 * The band T, resolved PER EXERCISE. Per-muscle T (register Part 9): each exercise reads the band of
 * its primary muscle, so an athlete who likes higher-rep shoulder work sets Shoulders → 12-15 and her
 * bench (Chest) is untouched. A single `Band` still works (every exercise resolves to it) — the shape
 * a single-band athlete produces, and the back-compat form the pure-core tests pass. The engine
 * already stores the band per exercise (`ExerciseState.band`); this only feeds it per exercise.
 */
export type BandSource = Band | ((exerciseId: string) => Band);
const resolveBand = (src: BandSource, exerciseId: string): Band =>
  typeof src === 'function' ? src(exerciseId) : src;

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
const empty = (): EngineV5State => ({ exercises: {}, lastFoldedAt: 0, changeLog: [] });
async function load(): Promise<EngineV5State> {
  try { return (await db.loadEngineV5()) ?? empty(); } catch { return empty(); }
}
async function save(s: EngineV5State): Promise<void> {
  try { await db.saveEngineV5(s); } catch { /* offline/test */ }
}
const asStates = (s: EngineV5State) => s.exercises as Record<string, ExerciseState>;

/** Ensure per-exercise state exists for every engine-managed exercise. Idempotent; preserves state.
 *  A band change updates each exercise's band (T is hers; no conversion, S-43). */
export async function ensureExercisesV5(exerciseIds: string[], band: BandSource, history: Session[], seedFor: SeedFor): Promise<EngineV5State> {
  const state = await load();
  const ex = asStates(state);
  for (const id of exerciseIds) {
    const b = resolveBand(band, id); // per-muscle T resolves to this exercise's band
    if (!ex[id]) ex[id] = initExercise(id, b, history, seedFor);
    else if (ex[id].band.lo !== b.lo || ex[id].band.hi !== b.hi) {
      // S-43 (change T — now per muscle): recompute the load from her history at the NEW Tlo — "the
      // load at which she performed ≥ the new T." If she has no history at the new band, keep the
      // current load and set 1 finds it (no conversion formula). Bodyweight has no load to recompute.
      // Only exercises whose muscle's band changed are touched — the rest keep their state.
      const meta = metaWithGrid(id, history);
      const demo = meta.bodyweight ? null : bestDemonstratedLoad(id, b, history);
      const load = demo != null ? snapDown(demo, meta.equipment, meta.observedLoads) : ex[id].load;
      ex[id] = { ...ex[id], band: b, load };
    }
  }
  await save(state);
  return state;
}

// ───────────────────────────── advance (PER WORKOUT) ─────────────────────────────
const CHANGELOG_KEEP = 200; // recent load changes retained for the mirror (~months of training)

/**
 * Advance the engine PER WORKOUT — the register's cadence (L7: a decision is told at the end of the
 * workout, never on a schedule; Loop 2 decides "the next occurrence, not next Saturday"). Every
 * completed session newer than the fold cursor is one OCCURRENCE: for each exercise it contains, run
 * decideExercise and apply IMMEDIATELY, so a lift trained twice in a week builds on itself (S-29,
 * S-5). Saturday decides nothing — it is a mirror (S-45), fed by the timestamped change log.
 * `nowMs`/`bucketOpenMs` kept for signature parity; the decision no longer waits on either.
 */
export async function advanceV5(
  exerciseIds: string[],
  band: BandSource,
  history: Session[],
  seedFor: SeedFor,
  nowMs: number = Date.now(),
  bucketOpenMs?: number,
): Promise<Record<string, 'graduate' | 'rotate'>> {
  void nowMs; void bucketOpenMs; // decisions are per-workout; no weekly boundary (L7)
  const state = await ensureExercisesV5(exerciseIds, band, history, seedFor);
  const ex = asStates(state);
  const managed = new Set(exerciseIds);

  // Completed sessions not yet folded, OLDEST first — each is one occurrence, decided in order so
  // state accumulates (Monday's gain is there for Thursday). `startedAt` strictly after the cursor.
  const lastFolded = state.lastFoldedAt ?? 0;
  const unfolded = history
    .filter((s) => { const t = Date.parse(s.startedAt); return Number.isFinite(t) && t > lastFolded; })
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  if (unfolded.length === 0) { await save(state); return {}; }

  const log = state.changeLog ?? [];
  // Engine-initiated exercise changes wanted from the LATEST fold per lift (S-52 graduate / S-25.2
  // rotate). The integration layer resolves the target and enacts it (writes substitutes). A later
  // progress/hold clears it — she is climbing again, so no change is wanted any more.
  const wantsChange: Record<string, 'graduate' | 'rotate'> = {};
  for (const sess of unfolded) {
    const at = Date.parse(sess.startedAt);
    for (const id of Object.keys(ex)) {
      if (!managed.has(id)) continue; // only exercises in the current programme advance
      const st = ex[id];
      const meta = metaWithGrid(id, history);
      const sets = setPerfs(id, [sess]); // THIS occurrence's working sets
      if (sets.length === 0) continue; // this lift was not trained this workout → holds
      // rotationAvailable = true: decideExercise now rotates ONLY on a REPEATED stall at the same wall
      // (isRepeatedStall) — a first stall still backs off and re-climbs, so S-25's order holds. The
      // integration resolves the rotation target (longest-without); if none exists, the lift just
      // backs off (S-53). GRADUATION (S-52) is surfaced the same way, independent of this flag.
      const out = decideExercise({ state: st, session: sets, meta, rotationAvailable: true });
      if (out.wantsChange) wantsChange[id] = out.wantsChange;
      else delete wantsChange[id]; // a later climb cancels a change wanted earlier this fold-run
      // Record a change only when the load actually MOVED; the mirror copy is chosen by the real
      // delta direction (explainChange), never the decision label. hold/ambiguous/approach say
      // nothing (R7/S-16). Graduation/rotation are RETURNED and enacted by the integration layer.
      if ((out.decision === 'progress' || out.decision === 'stall_backoff') && st.load != null && out.load != null && Math.abs(out.load - st.load) > 1e-6) {
        log.push({ exerciseId: id, decision: out.decision, loadFrom: st.load, loadTo: out.load, setsFrom: st.sets, setsTo: out.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [out.band.lo, out.band.hi], at });
      }
      ex[id] = { ...st, load: out.load, band: out.band, sets: out.sets, history: [{ load: st.load, sets }, ...st.history].slice(0, RECENCY_WINDOW_SESSIONS) };
    }
  }
  state.lastFoldedAt = Date.parse(unfolded[unfolded.length - 1].startedAt);
  state.changeLog = log.slice(-CHANGELOG_KEEP);
  await save(state);
  return wantsChange;
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
function explainChange(c: ChangeEntry): Explanation {
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

type ChangeEntry = NonNullable<EngineV5State['changeLog']>[number];

/** The window of the week that ended at the most recent Saturday roll: [prev week-open, this week-open). */
function closedWeek(nowMs: number): { start: number; end: number } {
  const end = currentWeekOpen(nowMs);
  const start = currentWeekOpen(end - 1);
  return { start, end };
}

/** The changes made during the week that just closed — the Saturday mirror's content (S-45). Since a
 *  lift may move more than once in a week (per-workout), the NET change per exercise is used: its
 *  earliest loadFrom → its latest loadTo, so the mirror reads "back went up" once, not thrice. */
function closedWeekChanges(log: ChangeEntry[], nowMs: number): ChangeEntry[] {
  const { start, end } = closedWeek(nowMs);
  const inWeek = log.filter((c) => c.at >= start && c.at < end).sort((a, b) => a.at - b.at);
  const netByEx = new Map<string, ChangeEntry>();
  for (const c of inWeek) {
    const prior = netByEx.get(c.exerciseId);
    netByEx.set(c.exerciseId, prior ? { ...c, loadFrom: prior.loadFrom, setsFrom: prior.setsFrom, bandFrom: prior.bandFrom } : c);
  }
  // Drop net no-ops (a lift that went up then back down to where it started).
  return [...netByEx.values()].filter((c) => c.loadFrom == null || c.loadTo == null || Math.abs((c.loadTo ?? 0) - (c.loadFrom ?? 0)) > 1e-6);
}

/** The most recent CLOSED week's update (or null when nothing changed that week). Mirrors v4. */
export async function getWeeklyUpdateV5(nowMs: number = Date.now()): Promise<WeeklyUpdate | null> {
  const state = await load();
  const changes = closedWeekChanges(state.changeLog ?? [], nowMs);
  if (changes.length === 0) return null;
  const { end } = closedWeek(nowMs);
  return { weekIndex: 0, at: new Date(end).toISOString(), explanations: changes.map(explainChange), seen: state.seenWeekEnd === end };
}

/** Mark the current closed-week mirror as seen (keyed to its week-end, so a new week reads unseen). */
export async function markWeeklyUpdateSeenV5(nowMs: number = Date.now()): Promise<void> {
  const state = await load();
  state.seenWeekEnd = closedWeek(nowMs).end;
  await save(state);
}

/**
 * The full week — every workout's lifts at their NEW loads, with the NET per-lift from→to for the
 * week that just closed + Why. Same shape as v4 `getWeeklyPlan`, so the screens render unchanged.
 * Read-only.
 */
export async function getWeeklyPlanV5(program: Program, nowMs: number = Date.now()): Promise<WeeklyPlanView | null> {
  const state = await load();
  const ex = asStates(state);
  const changes = closedWeekChanges(state.changeLog ?? [], nowMs);
  const changeByEx = new Map(changes.map((c) => [c.exerciseId, c]));
  const { end } = closedWeek(nowMs);

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
  return { weekIndex: 0, at: new Date(end).toISOString(), changedCount, seen: state.seenWeekEnd === end, workouts };
}
