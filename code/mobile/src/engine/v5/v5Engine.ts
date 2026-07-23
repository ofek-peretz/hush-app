/**
 * Hush Engine v5 — the live integration façade (mirrors v4Engine.ts, but EXERCISE-keyed).
 *
 * Bridges the app's Session history + Profile to the pure v5 core and persists per-exercise state
 * (db.engineV5). Cadence: `advanceV5` folds each completed session into ONE decision per exercise the
 * moment it lands — PER WORKOUT, never on a schedule (L7: a decision is told at the end of the
 * workout; Loop 2 decides "the next occurrence, not next Saturday"). A lift trained twice in a week
 * builds on itself (S-29). Saturday decides nothing — it is only a mirror (S-45). The prescription the
 * athlete sees comes from the durable ExerciseState. History is the substrate; there is no migration
 * from v4 (S-58).
 *
 * The pure core (loop2/loop1/grid/repsPerRung) is unchanged — this only marshals data in and out.
 */

import type { Session, Program } from '@/data/local/models';
import { db, type EngineV5State } from '@/data/local/db';
import { exerciseMeta } from '@/engine/catalog';
import { exerciseDisplayName } from '@/data/exercises';
import { currentWeekOpen } from '@/domain/weekCadence';
import type { WeeklyUpdate, WeeklyPlanView, WeeklyPlanWorkout, WeeklyPlanLift, WeekPlanChange, WeeklyVolumeMove, Explanation, ExplanationLine } from '@/engine/weeklyView';
import { decideExercise } from './loop2';
import { decideVolume } from './loop3';
import { repsPerRung } from './repsPerRung';
import { snapDown, nextRung } from './grid';
import { muscleOf } from '@/data/exercises';
import type { Band, ExerciseState, ExerciseMeta, SetPerf, SessionRecord } from './types';
import { RECENCY_WINDOW_SESSIONS, SETS_MIN } from './constants';
import { track } from '@/platform/telemetry';

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

/** The distinct real loads she has performed on an exercise (the learned grid, F-2). De-duped to 0.5.
 *  Exported so the LIVE loop can snap a mid-session correction to a weight that physically exists at her
 *  gym (a 2 kg dumbbell jump, a 5 kg stack), the same grid the between-session prescription already uses. */
export function observedLoads(exerciseId: string, sessions: Session[]): number[] {
  const seen = new Set<number>();
  for (const s of sessions) for (const log of s.sets) {
    if (log.exerciseId === exerciseId && !log.isApproach && log.actualWeight != null && log.actualWeight > 0) seen.add(Math.round(log.actualWeight * 2) / 2);
  }
  return [...seen];
}

/**
 * L11 — THE RAIL, for the LIVE loop: one rung above the heaviest load she has completed at ≥ `Tlo`
 * reps on this lift, across her settled history AND this session so far. `null` when she has no such
 * completed set — the rail is inactive there by definition, and the athlete's own eyes are the guard
 * (S-49). Legacy approach sets are excluded, exactly as everywhere else (S-60).
 *
 * The between-session loop has always clamped to this (`applyRail`, loop2). Loop 1 did not, though
 * S-11 says a raise is "always inside the rail" and S-14 calls the rail absolute — so a single
 * implausible rep count could push a mid-session prescription to a load she has never approached.
 * Computed at the façade because the rail is a fact about her HISTORY, which the pure loop-1 core
 * (deliberately) cannot see.
 */
export function railCeilingFor(exerciseId: string, bandLo: number, sessions: Session[]): number | null {
  const meta = metaWithGrid(exerciseId, sessions);
  if (meta.bodyweight) return null; // no load axis, no rail (S-51)
  // F-8: the rail is a MEASURED statistic, so it reads only the recency window — her most recent
  // sessions of THIS lift. An unsorted `startedAt` is treated as oldest (it cannot win the window).
  const recent = sessions
    .filter((s) => s.sets.some((l) => l.exerciseId === exerciseId && !l.isApproach && l.actualWeight != null))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, RECENCY_WINDOW_SESSIONS);
  let best: number | null = null;
  for (const s of recent) for (const log of s.sets) {
    if (log.exerciseId !== exerciseId || log.isApproach) continue;
    if (log.actualWeight == null || log.actualReps < bandLo) continue;
    if (best == null || log.actualWeight > best) best = log.actualWeight;
  }
  return best == null ? null : nextRung(best, meta.equipment, meta.observedLoads);
}

/** Best load she completed at ≥ Tlo reps across history (the established-load read for init). */
function bestDemonstratedLoad(exerciseId: string, band: Band, sessions: Session[]): number | null {
  let best: number | null = null;
  for (const s of sessions) for (const log of s.sets) {
    if (log.exerciseId === exerciseId && !log.isApproach && log.actualWeight != null && log.actualReps >= band.lo && (best == null || log.actualWeight > best)) best = log.actualWeight;
  }
  return best;
}

/** Working SetPerfs for an exercise from a set of sessions. Legacy Build-#33 approach sets are
 *  excluded from the fold (Rev 8 deleted the mechanism; the mark survives only on old logs). */
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
      : seedFor(exerciseId); // no history → the seed; Loop 1 corrects it from her first set (Rev 8)
  return { exerciseId, load, band, sets: Math.max(SETS_MIN, 4), history: [] };
}

// ───────────────────────────── state io ─────────────────────────────
const empty = (): EngineV5State => ({ exercises: {}, lastFoldedAt: 0, changeLog: [] });

/**
 * S-47 — engine state fails to load: **telemetry fires, a safe prescription is served, and it is
 * never a silent reset.** A corrupt blob and a first-run absence both surface as `null`, so until
 * now the corrupt case rebuilt every exercise from history and overwrote the stored state without a
 * word — the recovery is right (her real history IS the safe prescription), but the silence was
 * exactly what this situation forbids. `db.engineV5ReadFailed()` distinguishes the two, and a failed
 * read is reported every time it happens.
 */
async function load(): Promise<EngineV5State> {
  let stored: EngineV5State | null = null;
  try { stored = await db.loadEngineV5(); } catch { stored = null; }
  if (db.engineV5ReadFailed()) {
    void track('engine_error', {
      op: 'loadEngineV5',
      message: 'engine state unreadable — rebuilding from session history (S-47)',
    });
  }
  return stored ?? empty();
}
async function save(s: EngineV5State): Promise<void> {
  try { await db.saveEngineV5(s); } catch (e) { void track('engine_error', { op: 'saveEngineV5', message: String(e) }); }
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
  /**
   * The current programme's prescribed set count for an exercise (0 = not in the programme). Loop 3
   * (the Muscle loop) needs it to know whether she COMPLETED a muscle's sets this occurrence.
   * Absent (tests / legacy) → Loop 3 no-ops, so an occurrence advances load exactly as before.
   */
  prescribedSets: (exerciseId: string) => number = () => 0,
  /**
   * The muscle's WHOLE-WEEK prescribed set total — Σ setCount over ALL its slots across every day (a
   * muscle is often trained on more than one day, e.g. chest on two upper days). The learned volume is
   * a WEEKLY figure, so it must seed and cap against the week, never a single occurrence — else a
   * multi-day muscle would be silently halved at the next regeneration. Falls back to this occurrence's
   * prescription only when unknown (a single-day muscle, or tests that omit it).
   */
  weeklyByMuscle: Record<string, number> = {},
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
  const volume = (state.volumeByMuscle ??= {}); // Loop 3 — the learned per-muscle set target
  const streaks = (state.unfinishedByMuscle ??= {}); // S-34 — consecutive-unfinished per muscle
  for (const sess of unfolded) {
    const at = Date.parse(sess.startedAt);
    const advancedThisOcc = new Set<string>(); // lifts that ROSE this occurrence (Loop 3 anyAdvanced)
    // Sets she LOGGED per managed exercise this occurrence. `loggedByEx` is WORKING sets only (approach
    // excluded, S-60) — it decides which lifts were really trained. `performedByEx` is ALL logged sets
    // INCLUDING the approach set, because the approach set OCCUPIES a prescribed slot (it is set 0 of the
    // N prescribed, not an extra) and she really performed it. The completion check must use this, or an
    // approach occurrence — (N−1) working + 1 approach — reads as (N−1) < N "unfinished", which would
    // both block S-32 growth and, on a layoff return (S-38), wrongly TRIM a muscle. The approach set is
    // excluded from volume EARNING (it never advances), never a penalty against it (S-60).
    const loggedByEx: Record<string, number> = {};
    const performedByEx: Record<string, number> = {};
    for (const log0 of sess.sets) {
      if (!managed.has(log0.exerciseId)) continue;
      performedByEx[log0.exerciseId] = (performedByEx[log0.exerciseId] ?? 0) + 1;
      if (log0.isApproach) continue;
      loggedByEx[log0.exerciseId] = (loggedByEx[log0.exerciseId] ?? 0) + 1;
    }
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
      if (out.decision === 'progress') advancedThisOcc.add(id); // a lift of this muscle rose (S-32)
      // Record a change only when the load actually MOVED; the mirror copy is chosen by the real
      // delta direction (explainChange), never the decision label. hold/ambiguous say nothing
      // (R7/S-16). Graduation/rotation are RETURNED and enacted by the integration layer.
      if ((out.decision === 'progress' || out.decision === 'stall_backoff') && st.load != null && out.load != null && Math.abs(out.load - st.load) > 1e-6) {
        log.push({ exerciseId: id, decision: out.decision, loadFrom: st.load, loadTo: out.load, setsFrom: st.sets, setsTo: out.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [out.band.lo, out.band.hi], at });
      }
      // S-28 · the ONE hold the engine must narrate. Every other hold says nothing (R7/S-16) because
      // nothing happened; this one is a decision — she cleared every set and the load still did not
      // move, and the register requires the engine to "say the truth and offer the only honest axis
      // left." Logged with equal from/to loads, so the mirror's net-no-op filter must let it through
      // on `kind`, not on a load delta.
      if (out.decision === 'rung_out_of_reach' && out.load != null) {
        log.push({ exerciseId: id, decision: out.decision, loadFrom: out.load, loadTo: out.load, setsFrom: st.sets, setsTo: out.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [out.band.lo, out.band.hi], at, kind: 'rung' });
      }
      ex[id] = { ...st, load: out.load, band: out.band, sets: out.sets, history: [{ load: st.load, sets }, ...st.history].slice(0, RECENCY_WINDOW_SESSIONS) };
    }

    // ── Loop 3 · the Muscle loop (register Part 4 §E) — one volume decision per muscle per occurrence.
    // Group the exercises she trained this occurrence by muscle, then decide +1 / hold / −1 sets from
    // FACTS ONLY: did she complete every prescribed set for the muscle (and not end the session early),
    // and did any of its lifts advance? The learned target is a WEEKLY total (a muscle is often trained
    // on more than one day), seeded from her whole-week prescription and capped at one set beyond it —
    // already time-trimmed (S-64) — so it can never spiral past her minutes, and a multi-day muscle is
    // never halved. An athlete on the day-one shape stays on it until she earns more.
    const trainedByMuscle: Record<string, string[]> = {};
    for (const id of Object.keys(loggedByEx)) {
      const m = muscleOf(id);
      if (m) (trainedByMuscle[m] ??= []).push(id);
    }
    for (const [m, ids] of Object.entries(trainedByMuscle)) {
      const prescribedTotal = ids.reduce((s, id) => s + Math.max(0, prescribedSets(id)), 0);
      if (prescribedTotal <= 0) continue; // nothing prescribed for this muscle → nothing to reason on
      const weekly = weeklyByMuscle[m] ?? prescribedTotal; // the muscle's WHOLE-WEEK prescription
      const completedAll = !sess.earlyFinish && ids.every((id) => (performedByEx[id] ?? 0) >= prescribedSets(id));
      const anyAdvanced = ids.some((id) => advancedThisOcc.has(id));
      const streak = completedAll ? 0 : (streaks[m] ?? 0) + 1;
      streaks[m] = streak;
      const current = volume[m] ?? weekly; // seed from her real (time-trimmed) WEEKLY prescription
      const res = decideVolume({
        sets: current,
        minSets: SETS_MIN, // one exercise at the floor; a further cut drops an exercise (S-35, assembly)
        maxSets: weekly + 1, // earn at most one weekly set beyond what already fit her minutes (S-64)
        completedAll,
        anyAdvanced,
        unfinishedStreak: streak,
      });
      volume[m] = res.sets;
      // S-45: narrate a real volume MOVE so the Saturday mirror says what it did ("I added a set to your
      // chest work"). Measured against what she was ACTUALLY prescribed (current), so the very first
      // earned set — grown from the seed in the same fold — is narrated too; a pure seed (no move) says
      // nothing. Muscle-keyed; the load fields stay null.
      if (res.sets !== current) {
        log.push({ exerciseId: m, decision: res.decision, loadFrom: null, loadTo: null, setsFrom: current, setsTo: res.sets, bandFrom: [0, 0], bandTo: [0, 0], at, kind: 'volume', muscle: m });
      }
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
}

/**
 * The current per-exercise prescription: the working load, at her band, from the very first set.
 *
 * There is NO approach / warm-up / measurement set (founder ruling, 2026-07-16 — Build #33 QA). It was
 * removed entirely: every set, including set 1, is the real working weight, and Loop 1 responds to what
 * she performs from the first set onward (as v4 did). `nowMs` kept for signature parity.
 */
export async function currentV5Targets(history: Session[], nowMs: number = Date.now()): Promise<Record<string, V5Target>> {
  void history; void nowMs; // no time-window decision remains (the approach set was the only reader)
  const state = await load();
  const ex = asStates(state);
  const out: Record<string, V5Target> = {};
  for (const id of Object.keys(ex)) {
    const st = ex[id];
    out[id] = { weight: st.load, reps: st.band.lo, bandHi: st.band.hi, sets: st.sets };
  }
  return out;
}

/**
 * Record a STRUCTURAL change for the Saturday mirror (S-45): the exercise itself changed identity — a
 * bodyweight graduation (S-52), a stall rotation (S-25.3), or a learned in-workout swap adopted as
 * standing (S-69). These write `prefs.substitutes`, not the load changeLog, so without this the mirror
 * (which reflects the week's decisions) would never mention them. Idempotent per (from, to, week): a
 * regeneration that re-enacts the same standing substitute the same week does not log it twice.
 */
export async function recordStructuralChangeV5(
  fromExercise: string,
  toExercise: string,
  kind: 'graduate' | 'swap',
  atMs: number = Date.now(),
): Promise<void> {
  if (!fromExercise || !toExercise || fromExercise === toExercise) return;
  const state = await load();
  const log = state.changeLog ?? [];
  // Idempotent within a week: a regeneration re-enacting the same standing substitute must not log it
  // again. The mirror groups by calendar week, so a 7-day guard keeps one entry per adoption per week.
  const WEEK_MS = 7 * 86400000;
  const dup = log.some((c) => c.kind === kind && c.exerciseId === fromExercise && c.toExercise === toExercise && Math.abs(c.at - atMs) < WEEK_MS);
  if (dup) return;
  log.push({ exerciseId: fromExercise, decision: kind, loadFrom: null, loadTo: null, setsFrom: 0, setsTo: 0, bandFrom: [0, 0], bandTo: [0, 0], at: atMs, kind, toExercise });
  state.changeLog = log.slice(-CHANGELOG_KEEP);
  await save(state);
}

/** The learned per-muscle per-occurrence set target (Loop 3). Regeneration distributes each across
 *  that muscle's exercises (distributeMuscleSets). A muscle absent here is still on its day-one shape. */
export async function getVolumeTargetsV5(): Promise<Record<string, number>> {
  const state = await load();
  return { ...(state.volumeByMuscle ?? {}) };
}

/**
 * Her fitted reps-per-rung for a lift (F-13), from history — the number Loop 1 uses to size an
 * in-session correction (how many rungs a rep miss is worth). null until she has enough like-for-like
 * pairs (F-12) → Loop 1 falls back to one cautious rung (B-5). Bodyweight has no load axis → null.
 * Computed at the façade because it needs her learned grid (observedLoads) + rest-filtered history.
 */
export function perRungForV5(exerciseId: string, history: Session[]): number | null {
  const meta = metaWithGrid(exerciseId, history);
  if (meta.bodyweight) return null;
  // F-8: a measured statistic reads only the recency window — the most recent sessions of THIS lift,
  // not all-time. (The pure core windows on `state.history`; the façade must window the raw history it
  // flattens, or an old form/gym years ago would still weigh on today's slope.)
  const recent = history
    .filter((s) => s.sets.some((l) => l.exerciseId === exerciseId && !l.isApproach && l.actualWeight != null))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, RECENCY_WINDOW_SESSIONS);
  const sets = setPerfs(exerciseId, recent); // her recent performed working sets (load, reps, rest)
  return repsPerRung([], [{ load: null, sets }], meta);
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
 *  are surfaced; hold/ambiguous are not "changes" (R7). */
function explainChange(c: ChangeEntry): Explanation {
  const ex = exerciseDisplayName(c.exerciseId);
  // A VOLUME change (S-45 / S-32 / S-34): Loop 3 grew or trimmed a muscle's weekly sets. Muscle-keyed,
  // narrated by direction ("I added a set to your chest work" / "I trimmed a set").
  if (c.kind === 'volume' && c.muscle) {
    const muscle = c.muscle; // raw muscle name — consistent with the English lift names in this copy
    const up = c.setsTo > c.setsFrom;
    return {
      slotId: c.exerciseId, pattern: '' as never,
      observation: L(up ? 'volumeUp.observation' : 'volumeDown.observation', { muscle }),
      conclusion: L(up ? 'volumeUp.conclusion' : 'volumeDown.conclusion'),
      action: L(up ? 'volumeUp.action' : 'volumeDown.action', { muscle }),
      text: L(up ? 'volumeUp.text' : 'volumeDown.text', { muscle }),
    };
  }
  // S-28 · the rung is out of reach. She cleared every set, and the load still held — because the
  // only weight her gym offers next is a step her own reps say she cannot take yet. The engine names
  // the obstacle and the axis that IS open: reps at this load, until the rung is within reach.
  if (c.kind === 'rung') {
    return {
      slotId: c.exerciseId, pattern: '' as never,
      observation: L('rungOutOfReach.observation', { ex }),
      conclusion: L('rungOutOfReach.conclusion'),
      action: L('rungOutOfReach.action'),
      text: L('rungOutOfReach.text', { ex }),
    };
  }
  // A STRUCTURAL change (S-45): the lift changed identity. A graduation says "you outgrew X → Y"; a
  // rotation / adopted learned-swap says "that slot missed the mark → Y". Reuses the existing copy.
  if (c.kind && c.toExercise) {
    const to = exerciseDisplayName(c.toExercise);
    if (c.kind === 'graduate') {
      return {
        slotId: c.exerciseId, pattern: '' as never,
        observation: L('graduate.observation', { from: ex }),
        conclusion: L('graduate.conclusion'),
        action: L('graduate.action', { ex: to }),
        text: L('graduate.text', { from: ex, ex: to }),
      };
    }
    return {
      slotId: c.exerciseId, pattern: '' as never,
      observation: L('swap.observation'),
      conclusion: L('swap.conclusion'),
      action: L('swap.action', { ex: to }),
      text: L('swap.text', { ex: to }),
    };
  }
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
    // Structural changes (S-45) are keyed apart from load changes so a graduation and a load move on
    // the same lift in one week both survive — they are two different things Hush did.
    const key = `${c.exerciseId}|${c.kind ?? 'load'}`;
    const prior = netByEx.get(key);
    netByEx.set(key, prior ? { ...c, loadFrom: prior.loadFrom, setsFrom: prior.setsFrom, bandFrom: prior.bandFrom } : c);
  }
  // Drop net no-ops: a load move up-then-back to where it started, and a volume grow-then-trim that
  // nets to the same set count. Graduation/rotation/swap (no set delta to net) always survive.
  return [...netByEx.values()].filter((c) => {
    if (c.kind === 'volume') return c.setsFrom !== c.setsTo;
    if (c.kind != null) return true; // graduate / swap / rung (S-28 holds the load — no delta to net)
    return c.loadFrom == null || c.loadTo == null || Math.abs((c.loadTo ?? 0) - (c.loadFrom ?? 0)) > 1e-6;
  });
}

/**
 * WHAT ONE WORKOUT EARNED — the per-occurrence twin of `closedWeekChanges`, and the thing that
 * lets the Complete screen stop lying.
 *
 * v5 decides at the END OF EVERY OCCURRENCE (register L7 — there is no weekly boundary). Every
 * entry in the changeLog is already stamped with `at` = that occurrence's `startedAt`, so the
 * decisions one workout produced are simply the entries carrying its timestamp. Nothing here is
 * computed: the fold made these calls, this only reads them back.
 *
 * No netting, unlike the weekly mirror: a week may move one lift three times and must say so once,
 * but a single occurrence decides a lift exactly once. Order is the order the fold reached them,
 * which is the order the athlete trained them.
 *
 * Returns [] when the workout changed nothing — which is a real and common answer (hold, S-24), and
 * the screen must say so rather than invent a change (R7 / S-16).
 */
export async function getSessionEarnedV5(sessionStartedAtMs: number): Promise<Explanation[]> {
  const state = await load();
  return (state.changeLog ?? []).filter((c) => c.at === sessionStartedAtMs).map(explainChange);
}

/**
 * WHAT ONE WORKOUT SET AS THE NEXT LOAD — the per-lift forward numbers a single occurrence decided.
 *
 * Read-only twin of `getSessionEarnedV5`. Where that returns the *narrated* changes (the delta and
 * its reason), the Record screen (v7 3.3b) needs the ABSOLUTE next load per lift — "NEXT: 41" — to
 * stamp beside each exercise. Both read the very same stamped changeLog; nothing is recomputed here.
 *
 * Only plain load moves (`kind == null`) carry a forward number; a graduation/rotation/volume move is
 * a different kind of news and has no per-lift "next weight". A lift that HELD has no entry at all —
 * a hold is not a change (R7) — so the caller reads a missing exercise as "holds at what she lifted".
 */
export async function getSessionForwardV5(
  sessionStartedAtMs: number,
): Promise<Record<string, { loadFrom: number | null; loadTo: number | null }>> {
  const state = await load();
  const out: Record<string, { loadFrom: number | null; loadTo: number | null }> = {};
  for (const c of state.changeLog ?? []) {
    if (c.at !== sessionStartedAtMs || c.kind != null) continue;
    out[c.exerciseId] = { loadFrom: c.loadFrom, loadTo: c.loadTo };
  }
  return out;
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
  const { end } = closedWeek(nowMs);

  // The change log carries FOUR kinds of news, and only one of them is keyed by a lift that is
  // still in the programme. Attaching everything by `c.exerciseId` — as this function used to —
  // silently dropped the other three from every SCREEN: a structural change is keyed by the lift
  // that LEFT (`from`), so after the very regeneration that enacts it no slot matches; a volume
  // move is keyed by a MUSCLE, which no slot ever matches. The mirror's data layer named them
  // (getWeeklyUpdateV5, proven in stage 7) while the letter the athlete actually reads — and Home's
  // briefing, and the rotation-UNDO that keys off `swapped` — could never show one. "Built but
  // unconnected", the exact Part-7 failure, one seam further out.
  const loadByEx = new Map(changes.filter((c) => c.kind == null).map((c) => [c.exerciseId, c]));
  const rungByEx = new Map(changes.filter((c) => c.kind === 'rung').map((c) => [c.exerciseId, c]));
  // A structural change attaches to the lift that ARRIVED (`toExercise`) — the one she can see.
  const structByTo = new Map(
    changes.filter((c) => (c.kind === 'graduate' || c.kind === 'swap') && c.toExercise).map((c) => [c.toExercise!, c]),
  );
  const volumeMoves: WeeklyVolumeMove[] = changes
    .filter((c) => c.kind === 'volume' && c.muscle)
    .map((c) => ({ muscle: c.muscle!, setsFrom: c.setsFrom, setsTo: c.setsTo, explanation: explainChange(c) }));

  const workouts: WeeklyPlanWorkout[] = [];
  for (const day of program.days) {
    if (day.isRest) continue;
    const lifts: WeeklyPlanLift[] = day.slots.map((slot) => {
      const st = ex[slot.exerciseId];
      // A lift that is ITSELF the product of a change (graduation / rotation / adopted swap) is the
      // bigger news than a load move on it; one row carries one story, structural first.
      const structural = structByTo.get(slot.exerciseId);
      const c = structural ?? loadByEx.get(slot.exerciseId) ?? rungByEx.get(slot.exerciseId);
      const change = c
        ? {
            snapshot: {
              slotId: slot.exerciseId, exerciseId: slot.exerciseId,
              // A structural row shows the NEW lift at its own current number (it enters at S-8/S-9,
              // never at the old lift's load) — `swapped` is what the screens key the badge, the
              // briefing's swap sentence, and the rotation-undo off.
              loadFrom: structural ? null : c.loadFrom,
              loadTo: structural ? (st ? st.load : null) : c.loadTo,
              setsFrom: structural ? slot.setCount : c.setsFrom,
              setsTo: structural ? slot.setCount : c.setsTo,
              rangeFrom: structural && st ? [st.band.lo, st.band.hi] : c.bandFrom,
              rangeTo: structural && st ? [st.band.lo, st.band.hi] : c.bandTo,
              swapped: !!structural,
            } as WeekPlanChange,
            explanation: explainChange(c),
          }
        : null;
      return {
        exerciseId: slot.exerciseId,
        name: exerciseDisplayName(slot.exerciseId),
        loadKg: st ? st.load : null,
        // The set count is the PROGRAMME's (Loop 3 distributes volume into slot.setCount + the time
        // cap trims it); ExerciseState.sets is vestigial (always the day-one 4), so it must not be the
        // source here or the weekly plan would show 4 sets regardless of the real workout.
        sets: slot.setCount,
        repRange: st ? [st.band.lo, st.band.hi] : null,
        change,
      };
    });
    workouts.push({ dayId: day.id, name: day.name, groups: day.muscleGroups, lifts });
  }
  // Every piece of news counts — a week whose only decision was a volume move must not read as "a
  // steady week" on the letter while the update note on Home says the programme was updated.
  const changedCount = workouts.reduce((n, w) => n + w.lifts.filter((l) => l.change).length, 0) + volumeMoves.length;
  return { weekIndex: 0, at: new Date(end).toISOString(), changedCount, seen: state.seenWeekEnd === end, workouts, volume: volumeMoves };
}
