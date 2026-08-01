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
/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ `advanceV5` WAS HERE, AND IT IS NOT COMING BACK.
 *
 * It was the fold that ran between sessions: Loop 2 decided the next load and whether a lift had
 * graduated or should rotate, Loop 3 decided how many sets a muscle earned. Roughly 140 lines here
 * plus `loop2.ts`, `loop3.ts` and `volumeAllocation.ts`, all deleted with it.
 *
 * The founder ruled it out in one sentence, and had to say it twice before I heard it:
 *
 *   > *"The engine decides DURING the workout only, on the basis of what it sees, and that is it.
 *   > Everything outside the workout is the AI's decision."*
 *
 * ── WHAT SURVIVES, AND WHY IT IS NOT THE SAME THING ─────────────────────────────────────────────
 * Loop 1 stays. It corrects a load WITHIN a set when her reps fall outside the band the coach set —
 * it acts on what it is watching, inside the workout, against a prescription somebody else wrote.
 * That is not a second opinion about her training; it is the execution of the first one.
 *
 * ── WHY THIS IS A COMMENT AND NOT A CLEAN DELETION ──────────────────────────────────────────────
 * Because the failure mode is somebody adding it back. It reads as an obvious gap: no connection
 * means no new programme, and a deterministic floor looks like a kindness. It was proposed once
 * and overruled — **a second decider is precisely what was removed**, and one that only runs when
 * the real one is unreachable is the worst version of it, because it appears exactly when she has
 * no way to tell them apart.
 *
 * `theEngineDecidesNothingBetweenSessions` is the law. This is the reason behind it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface V5Target {
  weight: number | null;
  reps: number; // Tlo
  bandHi: number; // Thi
  sets: number;
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

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ ELEVEN EXPORTS WERE DELETED FROM THIS FILE, AND WHAT IS LEFT IS THE POINT.
 *
 * Gone: `ensureExercisesV5`, `currentV5Targets`, `recordStructuralChangeV5`, `getVolumeTargetsV5`,
 * `perRungForV5`, `resetV5`, `getSessionEarnedV5`, `getSessionForwardV5`, `getWeeklyUpdateV5`,
 * `markWeeklyUpdateSeenV5`, `getWeeklyPlanV5` — the stamped state, the narration read back off it,
 * and the weekly view assembled from it. Every one of them served the between-session decision, and
 * there is no between-session decision.
 *
 * WHAT SURVIVES READS HER HISTORY AND DECIDES NOTHING:
 *
 *   · `observedLoads`  — every load she has actually put on this lift. Loop 1 snaps a live
 *                        correction onto a rung she has really used rather than a generic step.
 *   · `railCeilingFor` — one rung past her own best. Loop 1 may correct UP inside a set; it may not
 *                        invent a personal record while she is standing under the bar.
 *
 * Both are measurements of what happened, consulted mid-set. That is the whole of what the engine
 * is now, and `theEngineDecidesNothingBetweenSessions` is the law that keeps it that way.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
