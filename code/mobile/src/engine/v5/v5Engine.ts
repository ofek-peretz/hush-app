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
import { exerciseMeta, type Equipment } from '@/engine/catalog';
import { exerciseDisplayName } from '@/data/exercises';
import { currentWeekOpen } from '@/domain/weekCadence';
import type { WeeklyUpdate, WeeklyPlanView, WeeklyPlanWorkout, WeeklyPlanLift, WeekPlanChange, WeeklyVolumeMove, Explanation, ExplanationLine } from '@/engine/weeklyView';
import { decideExercise } from './loop2';
import { decideVolume } from './loop3';
import { deloadDue, deloadActiveAt, DELOAD_DAYS, DELOAD_FRACTION } from './deload';
import { easeDueFor, runEaseActiveAt, runEaseEndsAt, RUN_EASE_MUSCLES, RUN_EASE_MIN_KM, type RunView } from './runEase';
import { repsPerRung } from './repsPerRung';
import { snapDown, nextRung, prevRung } from './grid';
import { retainedAfterGap, daysSinceLastSession, lastSessionStartMs } from './detraining';
import { muscleOf } from '@/data/exercises';
import type { Band, ExerciseState, ExerciseMeta, SetPerf, SessionRecord } from './types';
import { RECENCY_WINDOW_SESSIONS, SETS_MIN, STARTING_INCREMENT } from './constants';
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
  return { equipment: m.equipment, bodyweight: m.bodyweight, observedLoads: observedLoads(exerciseId, history, m.equipment) };
}

/** The distinct real loads she has performed on an exercise (the learned grid, F-2). De-duped to 0.5.
 *  Exported so the LIVE loop can snap a mid-session correction to a weight that physically exists at her
 *  gym (a 2 kg dumbbell jump, a 5 kg stack), the same grid the between-session prescription already uses. */
export function observedLoads(exerciseId: string, sessions: Session[], equipment?: Equipment): number[] {
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE GRID IS ROUNDED TO THE EQUIPMENT'S GRAIN, NOT TO A FLAT HALF-KILO (2026-08-21).
   *
   * This de-duped to 0.5 for every lift in the catalogue, so a single set logged at 41.5 kg became a
   * permanent RUNG on a barbell whose declared grain is 2.5 — and `observedLoads` reads her WHOLE
   * history, so nothing ever aged it out. The founder produced exactly that with one turn of the old
   * edit wheel, which stepped in halves on everything.
   *
   * ⚠️ THE HISTORY IS NOT TOUCHED, AND THAT IS THE WHOLE POINT. A migration over her saved sets was
   * the obvious answer and the wrong one: it destroys the record of what she actually lifted, and it
   * would be indistinguishable from deleting a real microloaded set for an athlete whose gym stocks
   * fractional plates. This is the DERIVED grid — what the engine believes the room offers — and
   * normalising a derivation is free and reversible. Her set still says 41.5 for ever.
   *
   * It also heals what is already stored: a rung that was never on the grid stops being read as one
   * the next time the engine looks, without anybody running anything.
   *
   * `equipment` is optional so the older callers (and the tests that price a lift in isolation) keep
   * the half-kilo behaviour they were written against.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  const grain = equipment ? STARTING_INCREMENT[equipment] || 0.5 : 0.5;
  const seen = new Set<number>();
  for (const s of sessions) for (const log of s.sets) {
    if (log.exerciseId === exerciseId && !log.isApproach && log.actualWeight != null && log.actualWeight > 0) {
      seen.add(Math.round(log.actualWeight / grain) * grain);
    }
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
export async function ensureExercisesV5(
  exerciseIds: string[],
  band: BandSource,
  history: Session[],
  seedFor: SeedFor,
  /**
   * May an UNPERFORMED lift's seed be re-read? False while she is inside a detraining gap, where
   * `applyDetrainingV5` owns that load — see the note on the branch below. Defaults true, which is
   * every caller that knows nothing about gaps.
   */
  reseedUnperformed = true,
): Promise<EngineV5State> {
  const state = await load();
  const ex = asStates(state);
  for (const id of exerciseIds) {
    const b = resolveBand(band, id); // per-muscle T resolves to this exercise's band
    if (!ex[id]) ex[id] = initExercise(id, b, history, seedFor);
    /*
     * ⛔ A SEED SHE HAS NOT TESTED YET IS RE-READ, NOT FROZEN (2026-08-16).
     *
     * ⚠️ MEASURED, AND THIS IS WHERE THE COLD START ACTUALLY LOSES. State is created for EVERY lift
     * in the programme on the first call, before she has trained once — so a lift she will not meet
     * until Thursday had its load fixed on Monday, from an empty history. Over three athletes and
     * ten weeks, 21 of one athlete's 25 model-seeded cold starts were in week one, missing her band
     * by 6.4 reps, and nothing she did on Monday could reach them.
     *
     * So an UNPERFORMED lift's seed is refreshed each time the engine is ensured. By Thursday her
     * Monday and Tuesday sets exist, `personalScale` has three lifts of evidence, and the seed she
     * meets is the one her own week produced.
     *
     * ⛔ NOTHING WITH EVIDENCE IS TOUCHED, and the guard is the point: `history.length === 0` is the
     * engine's own record of never having decided about this lift, and `bestDemonstratedLoad`
     * returning null is her never having performed it. A lift she has trained keeps every decision
     * Loop 2 made about it (S-29) — this can only ever move a number that was a guess.
     */
    else {
      /*
       * ⛔ THESE TWO ARE INDEPENDENT, AND CHAINING THEM AS `else if` LOST HER BAND (caught in review).
       *
       * The seed re-read below and the S-43 band recompute both fire on an existing entry, and the
       * first version chained them — so for an UNPERFORMED weighted lift the band branch could never
       * run. Measured: a new athlete moves her Chest band 8-10 → 12-15, the cold seed is unchanged
       * (it is rep-target independent until `personalScale` has three lifts), nothing is written, and
       * every chest lift she has not yet performed keeps prescribing 8-10 for ever — while her
       * profile and every other surface say 12-15.
       *
       * The band goes first, because it is a fact she declared and the seed is a guess about her.
       */
      const meta = metaWithGrid(id, history);
      if (ex[id].band.lo !== b.lo || ex[id].band.hi !== b.hi) {
        // S-43 (change T — now per muscle): recompute the load from her history at the NEW Tlo — "the
        // load at which she performed ≥ the new T." If she has no history at the new band, keep the
        // current load and set 1 finds it (no conversion formula). Bodyweight has no load to recompute.
        const demo = meta.bodyweight ? null : bestDemonstratedLoad(id, b, history);
        const load = demo != null ? snapDown(demo, meta.equipment, meta.observedLoads) : ex[id].load;
        ex[id] = { ...ex[id], band: b, load };
      }
      /*
       * ⛔ A SEED SHE HAS NOT TESTED YET IS RE-READ, NOT FROZEN (2026-08-16).
       *
       * ⚠️ MEASURED, AND THIS IS WHERE THE COLD START ACTUALLY LOSES. State is created for EVERY lift
       * in the programme on the first call, before she has trained once — so a lift she will not meet
       * until Thursday had its load fixed on Monday, from an empty history. Over three athletes and
       * ten weeks, 21 of one athlete's 25 model-seeded cold starts were in week one, missing her band
       * by 6.4 reps, and nothing she did on Monday could reach them.
       *
       * ⛔ NOTHING WITH EVIDENCE IS TOUCHED: `history.length === 0` is the engine's own record of
       * never having decided about this lift, and `bestDemonstratedLoad` returning null is her never
       * having performed it. A lift she has trained keeps every decision Loop 2 made about it (S-29).
       *
       * ⛔ AND IT NEVER UNDOES A DETRAINING DECAY. The seed it re-reads is already scaled by the gap
       * she is inside (`foldEngine` wraps `seedFor`), because otherwise these two features fought:
       * detraining wrote a decayed load, the next read restored the undecayed seed, and the decay was
       * gone by the time she saw a screen. That was measured, in review, on the very first build.
       */
      if (reseedUnperformed && ex[id].history.length === 0 && !meta.bodyweight && bestDemonstratedLoad(id, b, history) == null) {
        const fresh = seedFor(id);
        if (fresh != null && ex[id].load !== fresh) ex[id] = { ...ex[id], load: fresh };
      }
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
  /**
   * ⚠️ LAST ON PURPOSE. See `ensureExercisesV5` — false inside a detraining gap, so the seed re-read
   * does not undo the decay. It was first written as the FIFTH parameter and every existing caller's
   * `nowMs` landed on it: eleven suites went red at once, which is the cheapest possible reminder
   * that a positional signature is a contract with every call site at once.
   */
  reseedUnperformed: boolean = true,
): Promise<Record<string, 'graduate' | 'rotate'>> {
  void bucketOpenMs; // decisions are per-workout; no weekly boundary (L7)
  const state = await ensureExercisesV5(exerciseIds, band, history, seedFor, reseedUnperformed);
  const ex = asStates(state);
  const managed = new Set(exerciseIds);

  // Completed sessions not yet folded, OLDEST first — each is one occurrence, decided in order so
  // state accumulates (Monday's gain is there for Thursday). `startedAt` strictly after the cursor.
  const lastFolded = state.lastFoldedAt ?? 0;
  const unfolded = history
    // A FREE-FORM log is a record, never a decision input (models.ts `Session.freeform`): the
    // engine coaches its own programme, and a holiday PR single must not read as a failed floor.
    .filter((s) => !s.freeform)
    .filter((s) => { const t = Date.parse(s.startedAt); return Number.isFinite(t) && t > lastFolded; })
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  const log = state.changeLog ?? [];

  /*
   * ── THE LIGHT WEEK ENDS AT ITS WINDOW, EVEN ON A PURE READ ─────────────────────────────────────
   * (engine/v5/deload — see its header for the whole design.) The restore cannot wait for the next
   * fold: she may open the app eight days later with nothing new to fold, and the prescription she
   * is handed must already be the restored one — the same one-line-either-side placement lesson as
   * `applyDetrainingV5`. Every restored load is stamped, so the mirror says the week ended.
   */
  const endDeload = (atMs: number): void => {
    const open = state.deload;
    if (!open || atMs < open.endsAt) return;
    for (const [id, prevLoad] of Object.entries(open.restore)) {
      const st = ex[id];
      if (!st || prevLoad == null || st.load == null) continue;
      if (Math.abs(prevLoad - st.load) <= 1e-6) continue;
      log.push({ exerciseId: id, decision: 'deload', loadFrom: st.load, loadTo: prevLoad, setsFrom: st.sets, setsTo: st.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [st.band.lo, st.band.hi], at: atMs, kind: 'deload' });
      ex[id] = { ...st, load: prevLoad };
    }
    delete state.deload;
  };

  /*
   * ── THE RUN CARRIED INTO HER LEGS (engine/v5/runEase — the header holds the whole design) ──────
   * Same lifecycle discipline as the deload, scoped to the lower body and to one occurrence.
   * `closeRunEase` restores and stamps; `openRunEase` answers a qualifying run exactly once.
   */
  const cardioRuns: RunView[] = await db
    .loadCardio()
    .then((all) => all.map((c) => ({ gait: c.gait, startedAt: c.startedAt, durationSec: c.durationSec, distanceKm: c.distanceKm })))
    .catch((): RunView[] => []);

  const closeRunEase = (atMs: number): void => {
    const open = state.runEase;
    if (!open) return;
    for (const [id, prevLoad] of Object.entries(open.restore)) {
      const st = ex[id];
      if (!st || prevLoad == null || st.load == null) continue;
      if (Math.abs(prevLoad - st.load) <= 1e-6) continue;
      log.push({ exerciseId: id, decision: 'ease', loadFrom: st.load, loadTo: prevLoad, setsFrom: st.sets, setsTo: st.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [st.band.lo, st.band.hi], at: atMs, kind: 'ease', runKm: open.runKm });
      ex[id] = { ...st, load: prevLoad };
    }
    delete state.runEase;
  };
  const closeRunEaseIfLapsed = (atMs: number): void => {
    if (state.runEase && atMs >= state.runEase.endsAt) closeRunEase(atMs);
  };

  const openRunEase = (atMs: number): void => {
    if (state.deload || state.runEase) return; // one decision speaks at a time (a light week is already the answer)
    const due = easeDueFor(cardioRuns, atMs, state.lastRunEasedForMs ?? null);
    if (!due) return;
    const runAt = Date.parse(due.startedAt);
    // Answered even when nothing can be eased (bodyweight lower body, empty roster) — a run is
    // answered ONCE, whatever the answer turned out to weigh. detrainedAfter's idempotency shape.
    state.lastRunEasedForMs = Math.max(state.lastRunEasedForMs ?? 0, runAt);
    const runKm = due.distanceKm >= RUN_EASE_MIN_KM ? Math.round(due.distanceKm * 10) / 10 : null;
    const restore: Record<string, number | null> = {};
    for (const id of exerciseIds) {
      const st = ex[id];
      if (!st || st.load == null) continue; // bodyweight — no load axis to ease (S-51)
      const muscle = muscleOf(id);
      if (!muscle || !RUN_EASE_MUSCLES.has(muscle)) continue; // the run cost her legs, not her bench
      const meta = exerciseMeta(id);
      const light = prevRung(st.load, meta.equipment); // one honest rung on the room's own ladder
      if (!(light < st.load - 1e-6)) continue; // already at the floor — nothing honest below
      restore[id] = st.load;
      log.push({ exerciseId: id, decision: 'ease', loadFrom: st.load, loadTo: light, setsFrom: st.sets, setsTo: st.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [st.band.lo, st.band.hi], at: atMs, kind: 'ease', runKm });
      ex[id] = { ...st, load: light };
    }
    if (Object.keys(restore).length > 0) {
      state.runEase = { startedAt: atMs, endsAt: runEaseEndsAt(due), runAtMs: runAt, runKm, restore };
      void track('engine_run_ease_opened', { runKm, lifts: Object.keys(restore).length });
    }
  };

  if (unfolded.length === 0) {
    endDeload(nowMs);
    closeRunEaseIfLapsed(nowMs);
    openRunEase(nowMs);
    state.changeLog = log.slice(-CHANGELOG_KEEP);
    await save(state);
    return {};
  }
  // Engine-initiated exercise changes wanted from the LATEST fold per lift (S-52 graduate / S-25.2
  // rotate). The integration layer resolves the target and enacts it (writes substitutes). A later
  // progress/hold clears it — she is climbing again, so no change is wanted any more.
  const wantsChange: Record<string, 'graduate' | 'rotate'> = {};
  const volume = (state.volumeByMuscle ??= {}); // Loop 3 — the learned per-muscle set target
  const streaks = (state.unfinishedByMuscle ??= {}); // S-34 — consecutive-unfinished per muscle
  for (const sess of unfolded) {
    const at = Date.parse(sess.startedAt);
    // The light week: a session past the window first closes it (restored loads are what this
    // session folds against); a session INSIDE it is recorded and never folded — light work is
    // recovery, not evidence about her capability (engine/v5/deload).
    endDeload(at);
    if (deloadActiveAt(state.deload, at)) continue;
    /*
     * ⚠️ AN EASE NEVER OPENS AT A HISTORICAL FOLD TIME — caught in the 2026-08-24 review, first
     * written the other way. A catch-up fold (an offline stretch, a restore) would have "opened"
     * an ease at the moment an old session folded — but that session was TRAINED at the full
     * prescription (a session can only start with the app open, and an open app is a read, so a
     * live ease would already exist in state). Fabricating one retroactively both lied about what
     * she was shown and THREW AWAY the real evidence of a session she really performed. So: the
     * loop only CLOSES a lapsed window; opening happens exclusively at the read moment (below and
     * in the empty-fold branch), where the prescription is actually handed out. A session that
     * folds inside a persisted open window really was the eased session — the skip is honest.
     */
    closeRunEaseIfLapsed(at);
    const easedNow = state.runEase && runEaseActiveAt(state.runEase, at) ? state.runEase : null;
    const advancedThisOcc = new Set<string>(); // lifts that ROSE this occurrence (Loop 3 anyAdvanced)
    // Sets she LOGGED per managed exercise this occurrence. `loggedByEx` is WORKING sets only (approach
    // excluded, S-60) — it decides which lifts were really trained. `performedByEx` is what counts
    // against the PRESCRIPTION, and its two flavours of "not a working set" differ on purpose:
    //   · a LEGACY approach set (isApproach without isWarmup, Build #33) OCCUPIES a prescribed slot
    //     (it was set 0 of the N prescribed, not an extra) — it counts, or an approach occurrence of
    //     (N−1) working + 1 approach reads as unfinished and wrongly trims a muscle (S-38);
    //   · a WARM-UP BRIDGE (isWarmup, 2026-08-24) is an EXTRA step at a negative index — it must NOT
    //     count, or two bridges + half the working sets would read as "completed everything" and
    //     Loop 3 would grow volume on a muscle she half-trained.
    const loggedByEx: Record<string, number> = {};
    const performedByEx: Record<string, number> = {};
    for (const log0 of sess.sets) {
      if (!managed.has(log0.exerciseId)) continue;
      if (!log0.isWarmup) performedByEx[log0.exerciseId] = (performedByEx[log0.exerciseId] ?? 0) + 1;
      if (log0.isApproach) continue;
      loggedByEx[log0.exerciseId] = (loggedByEx[log0.exerciseId] ?? 0) + 1;
    }
    for (const id of Object.keys(ex)) {
      if (!managed.has(id)) continue; // only exercises in the current programme advance
      // An EASED lift's occurrence is a deliberately-cautious start, not capability news — it does
      // not fold (no decision, no history record), exactly as a deload session does not. Every
      // other lift of the same session folds normally; the run cost her legs, not her bench.
      if (easedNow && easedNow.restore[id] !== undefined) continue;
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
      /*
       * ════ WAS THE ROTATION RIGHT? — MEASURED, AT LAST (2026-09-01, audit lever 7) ════
       *
       * `stall_rotate` fired and the outcome was never scored: nothing anywhere said whether the
       * lift rotated IN went on to progress or hit the same wall. This is the measurement half —
       * one event per adoption, at the first decisive verdict the newcomer earns:
       *
       *   engine_rotation_paid    its first 'progress'  → the swap bought motion
       *   engine_rotation_failed  it stalls into a rotation of its own → the wall was never the lift
       *
       * `outcomeAt` (additive, optional — the persisted shape's own convention) marks the entry so
       * each adoption reports exactly once. Modelling on top of this (choosing rotation TARGETS by
       * measured outcomes) is a later, deliberate step; a model built before the measurement exists
       * would be exactly the guessing this engine refuses.
       */
      if (out.decision === 'progress' || out.wantsChange === 'rotate') {
        const adoption = (state.changeLog ?? [])
          .filter((c) => c.toExercise === id && (c.kind === 'swap' || c.kind === 'graduate') && !c.outcomeAt)
          .sort((a, b) => b.at - a.at)[0];
        if (adoption) {
          adoption.outcomeAt = at;
          void track(out.decision === 'progress' ? 'engine_rotation_paid' : 'engine_rotation_failed', {
            exercise: id,
            kind: adoption.kind,
            days: Math.round((at - adoption.at) / 86400000),
          });
        }
      }
      // Record a change only when the load actually MOVED; the mirror copy is chosen by the real
      // delta direction (explainChange), never the decision label. hold/ambiguous say nothing
      // (R7/S-16). Graduation/rotation are RETURNED and enacted by the integration layer.
      if ((out.decision === 'progress' || out.decision === 'stall_backoff') && st.load != null && out.load != null && Math.abs(out.load - st.load) > 1e-6) {
        // The worst set of the occurrence — the number S-22 and S-24 actually read, and the one the
        // letter needs so it can say "the top of its range" only when she was there.
        const spoken = sets.filter((x) => x.reps > 0);
        const worstReps = spoken.length > 0 ? Math.min(...spoken.map((x) => x.reps)) : undefined;
        log.push({ exerciseId: id, decision: out.decision, loadFrom: st.load, loadTo: out.load, setsFrom: st.sets, setsTo: out.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [out.band.lo, out.band.hi], at, ...(worstReps != null ? { worstReps } : {}) });
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

    // The ease is spent the moment an eased lift has been TRAINED inside its window — one cautious
    // occurrence was the whole scope. The loads walk back now, stamped at this fold, so her next
    // session (even tomorrow, still inside the 36 h) is her standing prescription again.
    if (easedNow && state.runEase === easedNow && sess.sets.some((l) => !l.isApproach && easedNow.restore[l.exerciseId] !== undefined)) {
      closeRunEase(at);
    }
  }
  state.lastFoldedAt = Date.parse(unfolded[unfolded.length - 1].startedAt);

  // The read moment itself: a window that lapsed since the last session closes, and a run she
  // recorded after it opens — so the prescription handed out NOW already carries the answer.
  endDeload(nowMs);
  closeRunEaseIfLapsed(nowMs);
  openRunEase(nowMs);

  /*
   * ── IS A LIGHT WEEK DUE? — asked once, after everything above has been folded ──────────────────
   * The trigger is pure evidence (engine/v5/deload): most of her judgeable lifts below their rep
   * floor twice running, with the load not lower. Opened HERE — at the fold, the moment the
   * evidence completes (L7) — so the next prescription she reads is already the light one, told
   * before she meets it. Every lightened load is stamped like any other decision.
   */
  if (!state.deload && !state.runEase) {
    // …and the deload holds its question while an ease is open (one decision at a time; the ease
    // is 36 h at most, so the question waits a day, never a week).
    const foldAt = state.lastFoldedAt;
    const verdict = deloadDue({
      atMs: foldAt,
      exercises: ex,
      managed,
      historySessions: history.length,
      lastDeloadStartedAt: state.lastDeloadStartedAt ?? null,
    });
    if (verdict.due) {
      const restore: Record<string, number | null> = {};
      for (const id of exerciseIds) {
        const st = ex[id];
        if (!st || st.load == null) continue;
        const meta = exerciseMeta(id);
        /*
         * ⚠️ EQUIPMENT INCREMENTS, NOT HER LEARNED GRID. `snapDown` with a sparse grid rounds to a
         * PERFORMED rung — on a [40, 60] grid a 90% deload of 60 would land on 40, a 33% cut
         * wearing a 10% label. The room's own increments are the honest ladder below her range
         * (the same choice `warmupRamp` makes, for the same reason).
         */
        const light = snapDown(st.load * DELOAD_FRACTION, meta.equipment);
        if (!(light < st.load - 1e-6)) continue; // no honest step below (already at the floor)
        restore[id] = st.load;
        log.push({ exerciseId: id, decision: 'deload', loadFrom: st.load, loadTo: light, setsFrom: st.sets, setsTo: st.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [st.band.lo, st.band.hi], at: foldAt, kind: 'deload' });
        ex[id] = { ...st, load: light };
      }
      if (Object.keys(restore).length > 0) {
        state.deload = { startedAt: foldAt, endsAt: foldAt + DELOAD_DAYS * 24 * 60 * 60 * 1000, restore };
        state.lastDeloadStartedAt = foldAt;
        void track('engine_deload_opened', { eligible: verdict.eligible, fatigued: verdict.fatigued, lifts: Object.keys(restore).length });
      }
    }
  }

  state.changeLog = log.slice(-CHANGELOG_KEEP);
  await save(state);
  return wantsChange;
}

/** Is a light week open at `nowMs`? The façade read for targets/surfaces (never decides anything). */
export async function activeDeloadV5(nowMs: number = Date.now()): Promise<boolean> {
  const state = await load();
  return deloadActiveAt(state.deload, nowMs);
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
 * ════ SHE STOPPED, AND THE ENGINE BRINGS HER LOADS DOWN TO MEET HER ════
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16. Measured on an athlete given eight ordinary weeks and then a gap,
 * against a conservative body model (~10% of strength a month away, levelling at 70% of peak):
 *
 *     away  90 days   incline barbell press   asked 30 kg  →  she gets 0 reps
 *                     machine row             asked 32.5   →  she gets 0 reps
 *     away 180 days   dumbbell curl           asked  9 kg  →  she gets 3 reps
 *
 * Four lifts of four, two of them a weight she cannot move once — on the first session of a comeback,
 * the single session in her history where being right matters most. Loop 1 has two corrections to
 * rescue it (S-13) and cannot: it corrects by RUNGS from where it starts, and cannot walk back thirty
 * percent in two moves. F-8's seed exemption — *"what catches a stale seed is Loop 1, from set 1"* —
 * is reasonable and measurably false at this magnitude.
 *
 * ── ⛔ WHY IT LIVES HERE AND NOT IN THE TWO PLACES IT WAS TRIED ─────────────────────────────────
 * Both earlier placements were reverted by laws that are right, and the reason is the same one:
 *
 *   · Inside `currentV5Targets` — S-9/S-29/S-43 say the façade reports the load the engine DECIDED.
 *     Decaying on read made the façade disagree with its own stored state.
 *   · Inside `fixtureModel.sessionTargets` — `everyScreenShowsTheEngineNumber` says *"every load on
 *     the stage is the engine state, not a seed or a last-logged weight"*. A filter there showed her
 *     a number no decision produced: the exact defect class this file spent the day removing.
 *
 * ⚠️ SO IT IS A DECISION, NOT A FILTER. It WRITES `ExerciseState.load` and LOGS the change, which is
 * what makes every one of those laws true rather than bypassed — the number on the stage is a number
 * the engine chose, and the Saturday mirror can say it out loud (S-45/R7).
 *
 * ⚠️ AND IT SNAPS TO HER GRID. An ideal 0.9× is not a weight that exists; `snapDown` lands it on a
 * rung she has actually performed (F-2), and DOWN, so normalisation can never raise an implied load.
 *
 * ⚠️ IT NEVER TOUCHES BODYWEIGHT. There is no load axis to lower, and the honest answer to a
 * detrained push-up is fewer reps, which her own first set supplies.
 *
 * Idempotent per gap via `detrainedAfter` — see the field. Returns how many lifts moved.
 */
export async function applyDetrainingV5(
  history: Session[],
  nowMs: number = Date.now(),
): Promise<number> {
  const state = await load();
  const starts = history.map((s) => Date.parse(s.startedAt));
  const lastSession = lastSessionStartMs(starts);
  if (lastSession <= 0) return 0; // never trained — a beginning, not a return (B-1 owns that load)

  const target = retainedAfterGap(daysSinceLastSession(starts, nowMs));
  /*
   * ⛔⛔ THE GAP IS TOPPED UP AS IT GROWS. IT USED TO BE PAID ONCE, AT WHATEVER LENGTH IT HAPPENED TO
   * BE THE FIRST TIME SHE OPENED THE APP — a review caught it, and it defeated the whole feature.
   *
   * The first version stamped `detrainedAfter = lastSession`, the gap's IDENTITY, which never changes
   * while she stays away. Measured: she peeks on day 11 (a 0.35% decay, one rung), vanishes, and
   * returns on day 200 — and the guard says "already paid", so she is handed her FULL pre-gap loads
   * on the comeback session, the single session this module exists for. My own idempotency test
   * re-read at the same instant, so it could never see a growing gap.
   *
   * So the stamp now carries WHAT WAS APPLIED, not just which gap it belonged to. Each call asks for
   * the fraction the current gap deserves and applies only the difference. Re-reading at the same
   * moment is still a no-op (target === applied), which is the property that matters.
   */
  const applied = state.detrainedAfter === lastSession ? (state.detrainedRetained ?? 1) : 1;
  if (!(target < applied - 1e-9)) {
    // Nothing further owed. Stamp the gap so a later call knows where it stands, but only when this
    // gap is genuinely being tracked — inside the grace window there is nothing to record.
    if (target < 1 && state.detrainedAfter !== lastSession) {
      state.detrainedAfter = lastSession;
      state.detrainedRetained = target;
      await save(state);
    }
    return 0;
  }
  const step = target / applied; // the fraction still owed since the last time this ran

  const ex = asStates(state);
  const log = state.changeLog ?? [];
  let moved = 0;
  for (const id of Object.keys(ex)) {
    const st = ex[id];
    if (st.load == null || !Number.isFinite(st.load) || st.load <= 0) continue; // bodyweight / unusable
    const meta = metaWithGrid(id, history);
    if (meta.bodyweight) continue;
    const next = decayRung(st.load, st.load * step, meta.equipment, meta.observedLoads);
    if (!(next < st.load - 1e-6)) continue; // already at the floor, or the move is under a rung
    log.push({
      exerciseId: id, decision: 'detrain', loadFrom: st.load, loadTo: next,
      setsFrom: st.sets, setsTo: st.sets, bandFrom: [st.band.lo, st.band.hi], bandTo: [st.band.lo, st.band.hi],
      at: nowMs, kind: 'detrain',
    });
    ex[id] = { ...st, load: next };
    moved += 1;
  }
  // ⚠️ STAMPED WHETHER OR NOT ANYTHING MOVED. A gap where every load was already on its floor is a
  // gap that has been answered, and leaving the stamp off would re-ask it on every single open.
  state.detrainedAfter = lastSession;
  state.detrainedRetained = target;
  if (moved > 0) state.changeLog = log.slice(-CHANGELOG_KEEP);
  await save(state);
  return moved;
}

/**
 * The rung a decayed load lands on — NEAREST, never above where she started.
 *
 * ⛔ `snapDown` WAS WRONG HERE, AND A REVIEW MEASURED IT: an eleven-day break asks for 0.35% off a
 * 60 kg bench (59.79 kg ideal), and always-down turned that into **55** on a {50, 55, 60} grid — a
 * five-kilo cut for a week and a half away. Always-down is the right rule for NORMALISING a load she
 * performed (it may never imply she lifted more than she did); a decay is a decision the engine is
 * making, and rounding it away from the truth by a whole rung is not caution, it is a different
 * number. Nearest keeps the ceiling — the result can never exceed the load she came in on — while
 * letting a decay smaller than half a rung round to no change at all, which is the honest answer.
 */
function decayRung(from: number, ideal: number, equipment: ExerciseMeta['equipment'], observed?: number[]): number {
  const down = snapDown(ideal, equipment, observed);
  const up = nextRung(down, equipment, observed);
  const nearest = up <= from + 1e-9 && Math.abs(up - ideal) < Math.abs(down - ideal) ? up : down;
  return Math.min(nearest, from);
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
  // ONE RECORD PER SESSION — not one bag of every set.
  //
  // This used to flatten the whole window into a single `SessionRecord`, which was harmless while
  // the fit treated all points alike and became wrong the moment L3 started refusing pairs from
  // inside one occurrence: with every set stamped as the same occurrence, EVERY pair is refused and
  // the façade returns null for an athlete with a perfectly good history. The occurrence boundary is
  // a fact about her training, and flattening it away destroyed the fact.
  const records = recent
    .map((s) => ({ load: null, sets: setPerfs(exerciseId, [s]) }))
    .filter((r) => r.sets.length > 0);
  return repsPerRung([], records, meta);
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
/**
 * ⚠️ EXPORTED FOR THE LAW THAT READS IT. This is the engine SPEAKING — the sentence the athlete is
 * actually shown — and a claim in it that the decision does not support is the defect class this
 * codebase keeps finding. It is pinned by `theLetterSaysWhatHappened` rather than eyeballed.
 */
export function explainChange(c: ChangeEntry): Explanation {
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
  /*
   * ⛔ SHE WAS AWAY, AND THE MIRROR SAID THE WRONG THING ABOUT IT (B-9, caught in review 2026-08-16).
   *
   * A `detrain` entry has no `toExercise` and is neither `volume` nor `rung`, so it fell through to
   * the ordinary down-move copy — *"matched to demonstrated capability"* — which describes reading a
   * performance. There was no performance; that is the entire point of a layoff. It is the one load
   * change in the engine that comes from her ABSENCE, and it says so.
   */
  if (c.kind === 'detrain') {
    return {
      slotId: c.exerciseId, pattern: '' as never,
      observation: L('detrain.observation', { ex }),
      conclusion: L('detrain.conclusion'),
      action: L('detrain.action', { ex }),
      text: L('detrain.text', { ex }),
    };
  }
  /*
   * THE LIGHT WEEK (engine/v5/deload). Two entries share the kind and the direction tells them
   * apart: DOWN opened it (the evidence called a recovery week — the one sentence no competing
   * engine ever shows), UP closed it (the loads walked back to exactly where they stood). Both
   * carry real from→to loads, so every why-sheet opens with the honest numbers.
   */
  if (c.kind === 'deload') {
    const opening = c.loadFrom != null && c.loadTo != null && c.loadTo < c.loadFrom;
    return opening
      ? {
          slotId: c.exerciseId, pattern: '' as never,
          observation: L('deloadStart.observation'),
          conclusion: L('deloadStart.conclusion'),
          action: L('deloadStart.action', { ex }),
          text: L('deloadStart.text', { ex }),
        }
      : {
          slotId: c.exerciseId, pattern: '' as never,
          observation: L('deloadEnd.observation'),
          conclusion: L('deloadEnd.conclusion'),
          action: L('deloadEnd.action', { ex }),
          text: L('deloadEnd.text', { ex }),
        };
  }
  /*
   * THE RUN CARRIED INTO HER LEGS (engine/v5/runEase). Direction tells the two apart, exactly as
   * the deload: DOWN opened it (the run is the observation — with its distance when it qualified
   * by distance), UP closed it (the standing weight walked back).
   */
  if (c.kind === 'ease') {
    const opening = c.loadFrom != null && c.loadTo != null && c.loadTo < c.loadFrom;
    const km = c.runKm ?? null;
    return opening
      ? {
          slotId: c.exerciseId, pattern: '' as never,
          observation: km != null ? L('easeStart.observationKm', { km }) : L('easeStart.observationLong'),
          conclusion: L('easeStart.conclusion'),
          action: L('easeStart.action', { ex }),
          text: km != null ? L('easeStart.textKm', { ex, km }) : L('easeStart.textLong', { ex }),
        }
      : {
          slotId: c.exerciseId, pattern: '' as never,
          observation: L('easeEnd.observation'),
          conclusion: L('easeEnd.conclusion'),
          action: L('easeEnd.action', { ex }),
          text: L('easeEnd.text', { ex }),
        };
  }
  // A STRUCTURAL change (S-45): the lift changed identity. A graduation says "you outgrew X → Y"; a
  // rotation / adopted learned-swap says "that slot missed the mark → Y". Reuses the existing copy.
  if (c.kind && c.toExercise) {
    const to = exerciseDisplayName(c.toExercise);
    if (c.kind === 'graduate') {
      /*
       * ⛔ THE OBSERVATION HAD TO COVER BOTH TRIGGERS, AND IT ONLY COVERED ONE. S-52 graduates a
       * bodyweight lift on EITHER "every set at Thi" (too easy — she really did outgrow it) OR a rep
       * STALL below Thi (she cannot add reps, and there is no load to add). The copy said *"has sat
       * at the top of its range for weeks"*, which is false for the second and is the harder case to
       * be wrong about: telling someone who plateaued that she outgrew it.
       *
       * ⚠️ THE RICHER SPLIT IS WORTH DOING and needs the TRIGGER carried from `decideBodyweight`
       * through `wantsChange` and `recordStructuralChangeV5`, which is four layers for one sentence.
       * Until then the observation states what is true of both: she has taken the reps as far as
       * they go, and the next step is the movement.
       */
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
  /*
   * progress (load up)
   *
   * ⛔ THE CLAIM MUST MATCH THE REASON. This said *"reached the TOP of its range with room to
   * spare"* for EVERY raise — and S-22 raises the moment every set meets `Tlo`, which is the
   * BOTTOM. Measured: three sets of 8 in an 8-10 band raised 60 → 62.5 kg while the letter told her
   * she had room to spare at the top. It is the sentence this product shows most often.
   *
   * Now it says the strong thing only when `worstReps` says she was there, and otherwise says the
   * thing that is always true of a raise: she met the target on every set. An older entry with no
   * reps recorded falls back to the modest sentence — never to the flattering one.
   */
  const delta = c.loadFrom != null && c.loadTo != null ? round1(c.loadTo - c.loadFrom) : 0;
  const atTop = c.worstReps != null && c.worstReps >= c.bandFrom[1];
  return {
    slotId: c.exerciseId, pattern: '' as never,
    observation: L(atTop ? 'progressLoad.observation' : 'progressLoad.observationMet', { ex }),
    conclusion: L('progressLoad.conclusion'),
    action: L('progressLoad.action', { delta }),
    text: L(atTop ? 'progressLoad.text' : 'progressLoad.textMet', { ex, delta }),
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
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS SESSION CHANGED — and a HOLD IS NOT A CHANGE (founder, 2026-08-12)
 *
 *   *"במסך סיום האימון כתוב 12 שינויים בזמן שהיו רק 6 תרגילים … כל דבר שנמצא ב-HOLD זה לא שינוי!
 *   … ויותר גרוע היא שם שרירים ולא תרגילים והיה כתוב שאין שינוי בהם."*
 *
 * Both faults were here, in one unfiltered line: this returned EVERY changeLog entry stamped at the
 * session's instant and let the screen work out what to do with them.
 *
 *   TWELVE FOR SIX      six lifts and six MUSCLE-keyed `kind: 'volume'` entries. `explainChange`
 *                       narrates those by muscle, so the ledger drew "Chest" as if it were a lift —
 *                       and Loop 3's volume list has been empty on that screen since it was
 *                       rebuilt, so nothing was going to draw them properly either.
 *   HOLDS COUNTED       a lift that held is stamped like any other decision. `getSessionForwardV5`
 *                       twenty lines below has ALWAYS excluded them, with the reason written out —
 *                       *"a hold is not a change (R7)"* — and this one never asked.
 *
 * ⚠️ SO THE PREDICATE IS "DID A NUMBER MOVE", not a list of kinds. A graduation moves the lift, a
 * rotation moves it, a raise moves the load, Loop 3 moves the sets — and S-28's `rung` moves
 * nothing at all, which is exactly the honest, well-narrated hold the founder is objecting to.
 * Reading the kinds would have to be updated every time one is added; reading the NUMBERS cannot
 * drift.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function changeMoved(c: ChangeEntry): boolean {
  if (c.toExercise) return true; // a swap or a graduation — the lift itself moved
  if (c.loadFrom !== c.loadTo) return true;
  if (c.setsFrom !== c.setsTo) return true;
  return c.bandFrom[0] !== c.bandTo[0] || c.bandFrom[1] !== c.bandTo[1];
}

export async function getSessionEarnedV5(sessionStartedAtMs: number): Promise<Explanation[]> {
  const state = await load();
  return (state.changeLog ?? [])
    .filter((c) => c.at === sessionStartedAtMs)
    /*
     * ⛔ MUSCLES ARE NOT LIFTS, and this screen lists lifts. A volume move is real news and it is
     * the WEEK's news, not one workout's — the Saturday letter carries it, keyed by muscle, where a
     * muscle is the subject rather than an impostor in a list of exercises.
     */
    .filter((c) => c.kind !== 'volume')
    .filter(changeMoved)
    .map(explainChange);
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
    if (c.at !== sessionStartedAtMs) continue;
    if (c.kind != null && c.kind !== 'deload' && c.kind !== 'ease') continue;
    /*
     * A deload (or a run's ease) stamped at the SAME fold supersedes the Loop 2 move it overrode —
     * those entries are pushed after the loop's, so last-write-wins is the truthful order. The
     * FROM is kept from the earlier entry when one exists: "60 → 56" is what this session actually
     * bought her, not "62.5 → 56" via a raise she never saw.
     */
    const prev = out[c.exerciseId];
    out[c.exerciseId] =
      (c.kind === 'deload' || c.kind === 'ease') && prev
        ? { loadFrom: prev.loadFrom, loadTo: c.loadTo }
        : { loadFrom: c.loadFrom, loadTo: c.loadTo };
  }
  return out;
}

/** The most recent CLOSED week's update (or null when nothing changed that week). Mirrors v4. */
export async function getWeeklyUpdateV5(nowMs: number = Date.now()): Promise<WeeklyUpdate | null> {
  const state = await load();
  const changes = closedWeekChanges(state.changeLog ?? [], nowMs);
  if (changes.length === 0) return null;
  const { end } = closedWeek(nowMs);
  /*
   * ONE SENTENCE PER LIFT PER MOMENT: a deload stamped at the same fold as a Loop 2 move overrode
   * it before she ever saw it, so the letter narrates the deload alone — never "raised to 62.5"
   * and "set lighter" about the same lift in the same breath.
   */
  const deloadAt = new Set(changes.filter((c) => c.kind === 'deload' || c.kind === 'ease').map((c) => `${c.exerciseId}@${c.at}`));
  const spoken = changes.filter((c) => !(c.kind == null && deloadAt.has(`${c.exerciseId}@${c.at}`)));
  return { weekIndex: 0, at: new Date(end).toISOString(), explanations: spoken.map(explainChange), seen: state.seenWeekEnd === end };
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
  /*
   * ⚠️ `detrain` RIDES WITH THE PLAIN LOAD MOVES (caught in review 2026-08-16). It IS a plain load
   * move — one lift, one weight, down — it simply has a different cause, and `explainChange` tells
   * that cause. Left out, the Saturday LETTER narrated a layoff and the weekly PLAN showed the lift
   * with no change against it: the two surfaces disagreeing about the same fact, which is precisely
   * what `thePillAndTheLetterCountTheSameThing` exists to stop. `deload` (2026-08-24) rides with
   * them for the same reason — one lift, one weight, moved, with its own cause.
   */
  const loadByEx = new Map(changes.filter((c) => c.kind == null || c.kind === 'detrain' || c.kind === 'deload' || c.kind === 'ease').map((c) => [c.exerciseId, c]));
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
