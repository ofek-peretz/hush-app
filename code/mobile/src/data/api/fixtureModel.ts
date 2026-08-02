/**
 * Local fixture model — the runnable program engine for the app today (every signed-in
 * user runs on this until a backend session/token exchange exists; see selectModel).
 *
 * It builds the athlete's programme and personalized cold-start loads:
 *  - generateProgram: the programme is ASSEMBLED from her body map (engine v5, register Part 3) —
 *    `assembleV5DayLists` turns the map (off / normal / emphasis per muscle) + days into the week's
 *    day-lists, and the shared generator (dayFromBlueprint → orderForFlow / set counts / the time cap)
 *    builds each day. The demographic split (MEN_SPLITS / WOMEN_SPLITS) is DELETED (register Part 5);
 *    structure is an OUTPUT of volume, never a shelf chosen by sex × days.
 *  - sessionTargets: the v5 engine (exercise-keyed, facts only) owns load, progression and the band;
 *    a cold-start seed (HER SEX + BODYWEIGHT only, register B-1) opens a never-performed lift, and
 *    Loop 1 corrects it from her very first set (Rev 8 — there is no approach set).
 *
 * One goal: hypertrophy (register Part 9 §A) — goal and experience are no longer engine inputs.
 */
import type {
  Capability,
  MuscleStance,
  PortraitSnapshot,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
} from '@/data/local/models';
import { EXERCISES, exerciseById, exercisesForMuscle, isSwapOnly, patternFamily, type Exercise, type MuscleGroup } from '@/data/exercises';
import { swapScore } from '@/domain/swapPool';
import { startingWeight } from '@/domain/startingLoad';
import { computePortrait } from '@/data/progression';
import { bandFor } from '@/engine/v5/repBand';
import { chooseDonor, type VolumeCandidate } from '@/engine/v5/volumeAllocation';
import type { Explanation } from '@/engine/weeklyView';
import { learnedRestS, learnedExecS, type ExecSample } from '@/engine/v5/timeBudget';
import { learnedTransitionRestS, REST_TRANSITION_S } from '@/domain/restPrescription';
import { CANONICAL_MUSCLE_ORDER, SETS_MIN as V5_SETS_MIN, SETS_MAX as V5_SETS_MAX } from '@/engine/v5/constants';
import { resolveEngineEnactments } from '@/domain/engineChanges';
import { enginePattern, type Pattern, type Equipment } from '@/engine/catalog';
import { epley, normalizeLoad } from '@/engine/loadMath';
import { db, EMPTY_PREFERENCES, type OwnedPreferences } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { track } from '@/platform/telemetry';
import type { ActualSet, ModelClient } from './modelClient';




// ───────────────────────────── supplemental core (founder rules 2026-06-23) ─────────────────────────────
// Core is supplemental, NOT a primary progression target. Exactly ONE core exercise per
// week, 3 sets, placed LAST, preferring an upper-body session over a lower one. Rotated by
// frequency so every core movement is reachable through generation (not just via swaps).
// Generation pool = accessible core only (cable/machine crunch). The advanced movements
// (hanging leg raise, ab wheel) are swap-only: a first-week athlete is never assigned a
// movement that requires strength they don't have yet; anyone can swap into them.
const CORE_POOL = EXERCISES.filter((e) => e.muscle === 'Core' && !isSwapOnly(e.id)).map((e) => e.id);
const CORE_SETS = 3;

/** The session a weekly core block attaches to: upper-preferred, then full-body, then first. */
function coreHostIndex(days: ProgramDay[]): number {
  const upper = days.findIndex((d) => /^(Upper|Push|Pull)/.test(d.name));
  if (upper >= 0) return upper;
  const full = days.findIndex((d) => /^Full Body/.test(d.name));
  return full >= 0 ? full : 0;
}

// ── Session duration cap (founder rule 2026-06-23: the prescribed work must fit ≤ 1 hour) ──
// Prescribed WORK SETS only — warm-ups, walks and setup are the athlete's, never counted.
// Per-set minutes ≈ rest + execution; compounds rest longer than isolation. These are the DAY-ONE
// bootstrap, used until she has rest data — then her MEASURED rest replaces the rest portion (S-64).
const COMPOUND_SET_MIN = 3;
const ISOLATION_SET_MIN = 2;
const MAX_SESSION_MIN = 60;
// B-4, the WORK half — the active seconds of a set before she has performed any. B-4 names BOTH
// facts that replace this bootstrap: "her measured rest (built, Stage 0) AND HER SET DURATIONS
// (timestamps)". Both are wired now (`learnedRestS` / `learnedExecS`); this is only what stands in
// until each exists. Tuned so exec + a typical rest ≈ COMPOUND/ISOLATION_SET_MIN above, keeping the
// transition smooth (rest ~135s compound / ~90s isolation reproduces 3 / 2 minutes).
const SET_EXEC_SECONDS = { compound: 45, isolation: 30 } as const;

function isCompound(exerciseId: string): boolean {
  return exerciseById(exerciseId)?.tier === 'compound';
}

/**
 * Per-set MINUTES for a slot — **both halves of the cost, each measured when she has it** (B-4/S-64):
 * her set DURATION (`execSecFor`, from set timestamps) plus her REST (`restSecFor`, the median of her
 * recorded `restBeforeS`, S-17). Either one absent falls back to the day-one bootstrap for that half,
 * so a lift she has never performed still prices honestly and a lift she has prices from facts.
 */
function perSetMinutes(
  exerciseId: string,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
): number {
  const compound = isCompound(exerciseId);
  const rest = restSecFor?.(exerciseId) ?? null;
  const exec = execSecFor?.(exerciseId) ?? null;
  // No rest fact at all → the whole-set bootstrap (it already bundles work + rest).
  if (rest == null) return compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN;
  return ((exec ?? SET_EXEC_SECONDS[compound ? 'compound' : 'isolation']) + rest) / 60;
}

/** Estimated prescribed-work minutes for a day (work sets only) — her measured set duration + her
 *  measured rest (S-64 from FACTS, not v4's rest-blind fixed estimate).
 *
 *  `transitionSec` — the between-exercises rest (her pooled median, else the declared 120 s). The
 *  FIRST set of every lift follows the TRANSITION, not the inter-set rest, so each slot's cost is
 *  adjusted by (transition − inter) once. Only applied when the lift HAS a measured inter rest —
 *  the day-one bootstrap (COMPOUND/ISOLATION_SET_MIN) already bundles the whole walk. Omitted →
 *  the old pricing, unchanged (every existing caller and test). This keeps the budget pricing the
 *  SAME seconds the timers actually run (S-17/S-64 — one answer, both surfaces). */
export function estimateSessionMinutes(
  day: ProgramDay,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
  transitionSec?: number | null,
): number {
  return day.slots.reduce((m, s) => {
    let mins = s.setCount * perSetMinutes(s.exerciseId, restSecFor, execSecFor);
    const rest = restSecFor?.(s.exerciseId) ?? null;
    if (rest != null && transitionSec != null) mins += (transitionSec - rest) / 60;
    return m + mins;
  }, 0);
}

/**
 * Keep a day's prescribed work at or under MAX_SESSION_MIN. Quality-preserving and ordered —
 * compound work is NEVER sacrificed before isolation work (founder, 2026-07-06):
 *   1) trim isolation bonus sets back to the 3-set minimum (high-volume weeks), last backward;
 *   2) then drop a trailing NON-core isolation slot, never going below 4 slots and never
 *      dropping calves/core (coverage guarantees hold);
 *   3) only then trim the bonus set off compounds (4→3) from the LAST compound backward —
 *      never the first (the day's main lift keeps its full scheme), never below 3;
 *   4) LAST RESORT (S-35): still over budget with only compounds to give → drop the trailing
 *      compound whose muscle keeps ANOTHER exercise — never a muscle's ONLY lift, so a normal /
 *      emphasis muscle is never silently stopped. If none qualifies, the day genuinely cannot fit
 *      her minutes (S-3) and is left as-is rather than starving a muscle.
 */






// ───────────────────────────── cold-start starting weights ─────────────────────────────
// `startingWeight` now lives in domain/startingLoad — unchanged, but no longer private to the
// model: the milestone ladders anchor on the very load Hush prescribed on day one, and there must
// be exactly ONE opinion in this product about how strong an athlete probably is (founder
// 2026-07-13). The engine's use of it is untouched.

/**
 * Best demonstrated e1RM across the athlete's history for a given engine PATTERN, plus the baseKg
 * of the lift that produced it — the substrate for the smart swap seed. Weighted lifts only.
 */
function bestPatternE1rm(pattern: Pattern, history: Session[]): { e1rm: number; baseKg: number } {
  let e1rm = 0;
  let baseKg = 0;
  for (const s of history) {
    for (const log of s.sets) {
      if (log.actualWeight == null || log.actualReps <= 0) continue;
      const ex = exerciseById(log.exerciseId);
      if (!ex || ex.baseKg == null || enginePattern(log.exerciseId) !== pattern) continue;
      const e = epley(log.actualWeight, log.actualReps);
      if (e > e1rm) {
        e1rm = e;
        baseKg = ex.baseKg;
      }
    }
  }
  return { e1rm, baseKg };
}

/** The e1RM→working-load conversion's DEFAULT rep count — the default band's Tlo. Callers that know
 *  her declared band pass its real Tlo instead, so a 12-15 athlete's transfer is priced at 12 reps,
 *  not at a number she never chose ("the band she has IS the target", register Part 1). */
const DEFAULT_SEED_REP_TARGET = 8;

/**
 * Smart starting load for a lift (founder 2026-07-09, B-1/S-9): a swap / new exercise must ADAPT to
 * the athlete's PROVEN strength, not restart from a beginner cold-start (a year-trained bencher
 * moving to the chest-press machine must not begin at ~half their real pushing load). Priority:
 *   1. the lift's OWN demonstrated e1RM (already trained it) → working load at HER Tlo;
 *   2. else the athlete's best e1RM on the SAME engine pattern, scaled by the two lifts' baseKg
 *      ratio (relative difficulty) → a strength transfer onto the new lift;
 *   3. else the conservative cold-start seed (a genuinely new pattern / the first program).
 * Bodyweight lifts have no external load. The seed is a suggestion she can see and edit (F-2), and
 * Loop 1 corrects it from her very first working set (Rev 8 — there is no approach set).
 */
export function smartSeed(
  id: string,
  profile: Pick<Profile, 'sex' | 'weightKg'>,
  history: Session[],
  /** Her Tlo for this lift's muscle — what a "working load" means to HER (default: the 8-10 band's). */
  repTarget: number = DEFAULT_SEED_REP_TARGET,
): number | null {
  const ex = exerciseById(id);
  if (!ex) return null;
  if (ex.bodyweight || ex.baseKg == null) return startingWeight(ex, profile); // null for bodyweight
  const toWorking = (e1rm: number) => normalizeLoad(e1rm / (1 + repTarget / 30), ex.equipment as Equipment);
  // 1. the lift's own demonstrated capability.
  let own = 0;
  for (const s of history)
    for (const log of s.sets)
      if (log.exerciseId === id && log.actualWeight != null && log.actualReps > 0) own = Math.max(own, epley(log.actualWeight, log.actualReps));
  if (own > 0) return toWorking(own);
  // 2. transfer from the best SAME-PATTERN lift, scaled by relative difficulty (baseKg ratio).
  const pattern = enginePattern(id);
  if (pattern) {
    const best = bestPatternE1rm(pattern, history);
    if (best.e1rm > 0 && best.baseKg > 0) return toWorking(best.e1rm * (ex.baseKg / best.baseKg));
  }
  // 3. conservative cold-start.
  return startingWeight(ex, profile);
}

type Tier = Exercise['tier'];

/**
 * DAY-ONE sets per exercise — the sibling of B-8, and the last number this layer owns.
 *
 * The register hands the integration layer exactly one granularity decision: *"the register fixes
 * the CONSTRAINTS (Part 3), but not the sets→exercises granularity"* (B-8). B-8 turns a muscle's
 * starting weekly target into an exercise COUNT; this turns it into a per-exercise SET count, until
 * Loop 3 has learned the muscle's real volume and `distributeMuscleSets` takes over. It is bounded
 * by F-1 ([3, 5]) and by nothing else.
 *
 * **Three v4 inputs were removed (2026-07-21), because none of them is in the register:**
 *   · **`goal`** — Part 5 deletes the goal fork outright: *"there is one goal: hypertrophy."*
 *   · **`age`** — a −1 set penalty at 65+. Nowhere in the register; the same guess S-42 refuses.
 *   · **`volume`** (`low`/`moderate`/`high`) — an athlete-declared volume LEVER, ±1 set on every
 *     exercise. It contradicts the whole of Loop 3: in v5 volume is **earned** from facts (S-32) and
 *     **cut** from facts (S-34), starting from B-2. A dial that sets it by declaration is v4.
 */
function setsFor(tier: Tier): number {
  // Compounds lead a day and carry the fuller scheme (Part 3 #4); both sit inside F-1.
  return tier === 'compound' ? 4 : V5_SETS_MIN;
}

// `goal` and `experience` are NOT read here: Part 5 deletes the goal fork ("there is one goal:
// hypertrophy") and Part 9 §A deletes `experience` from the decision path. `age` survives only for
// the age-based rep guidance outside the engine, never for a load or a set count.
async function loadProfileSafe(): Promise<Pick<Profile, 'sex' | 'weightKg' | 'age' | 'memberSince' | 'repBand' | 'repBandByMuscle'>> {
  try {
    const p = await db.loadProfile();
    if (p) return p;
  } catch {
    /* offline/test — fall through to a sensible default */
  }
  return { sex: 'male', weightKg: 75 };
}

/** Completed-session history (newest first), the substrate for real progression. Never throws
 *  — an empty history yields cold-start (seed) prescriptions. */
async function loadHistorySafe(): Promise<Session[]> {
  try {
    return await db.loadHistory();
  } catch {
    return [];
  }
}

async function loadPreferencesSafe(): Promise<OwnedPreferences> {
  try {
    return await db.loadPreferences();
  } catch {
    return { ...EMPTY_PREFERENCES };
  }
}

/** Mutate the saved preferences atomically (load → edit → save). */
async function editPreferences(edit: (p: OwnedPreferences) => void): Promise<void> {
  const prefs = await loadPreferencesSafe();
  edit(prefs);
  try {
    await db.savePreferences(prefs);
  } catch {
    /* offline/test — the in-memory edit already applied for this session */
  }
}


export const fixtureModel: ModelClient = {
  async getProfile() {
    return {};
  },

  async recordConsent() {},

  async eraseAccount() {},

  async sessionsCompleted() {
    return null;
  },

  /*
   * ⛔ `generateProgram` AND `setWeeklyFrequency` WERE HERE, and about 300 lines of assembly with
   * them — the body-map read, the region split, the capability slots, the time-cap trimming.
   *
   * Nothing composes a week now. The coach writes the programme in the intake conversation and
   * re-writes it after every session, from what she actually did rather than from a body map filled
   * in on the day she signed up.
   */
  /*
   * ⛔ `sessionTargets` WAS HERE, and about 100 lines of seeding and per-set target assembly.
   *
   * It resolved a load for every set of a workout out of the engine's own state, and it was also
   * where the between-session fold was triggered from. The coach decides every load now and writes
   * it into the programme, so a load is READ FROM THE PLAN — `coachRows` for the screens,
   * `buildPlanFromCoach` for the machine — and there is nothing left to ask.
   */
  async recordSession(_args: { programDayId: string; sets: ActualSet[]; earlyFinish: boolean }) {
    // The completed session is persisted to local history by the session flow (db.append
    // CompletedSession); progression reads that history on the next sessionTargets call.
  },

  async replaceBlock(_args: { blockId: string; fromExercise: string; toExercise?: string }) {},

  async portraitSnapshot({ completedSessions }): Promise<PortraitSnapshot> {
    void completedSessions; // confidence now derives from per-capability DATA, not a raw count
    const profile = await loadProfileSafe();
    const history = await loadHistorySafe();
    // REAL portrait: relative strength per capability from the athlete's best logged e1RM vs a
    // sex/bodyweight-scaled benchmark; confidence rises with sessions of real data per capability.
    return { timestamp: new Date().toISOString(), ...computePortrait(history, profile) };
  },

  // The programme-edit swap (setExercisePreference / restoreExercisePreference, S-31) and the slot
  // lock (setSlotLock, S-30) are DELETED (Rev 7, S-73). Selection is learned from the in-workout swap
  // (S-69), the body map (S-56), and the learned leave-it against a rotation (S-71).
  async setSubstitute({ primaryExercise, substituteExercise, remove }: { primaryExercise: string; substituteExercise?: string; remove?: boolean }) {
    await editPreferences((p) => {
      if (remove || !substituteExercise) delete p.substitutes[primaryExercise];
      else p.substitutes[primaryExercise] = substituteExercise;
    });
  },
  async setBackup({ primaryExercise, backupExercise, remove }: { primaryExercise: string; backupExercise?: string; remove?: boolean }) {
    await editPreferences((p) => {
      if (remove || !backupExercise) delete p.backups[primaryExercise];
      else p.backups[primaryExercise] = backupExercise;
    });
  },
  async setOrder({ scope, order, workoutKey }: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability; workoutKey?: string }) {
    // Both scopes are durable across regen: workout order by day key, exercise order keyed by the
    // day's stable key (so a fresh week re-applies the athlete's within-workout sequence).
    await editPreferences((p) => {
      if (scope === 'workout') p.workoutOrder = order;
      else if (workoutKey) p.exerciseOrderByWorkout[workoutKey] = order;
    });
  },
  async markEquipmentOccupied(_args: { blockId: string }) {},
};
