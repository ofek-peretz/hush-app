/**
 * THE swap pool. One function, one law, every surface.
 *
 * ── Why this module exists ────────────────────────────────────────────────────────────────────
 * Before 2026-07-12 there were FOUR independent swap pools — the phone's in-workout quick swap,
 * the watch mirror, the program editor's sheet, and the weekly rotation — each with its own idea
 * of what a valid substitute was. Predictably, they drifted: the watch offered the athlete a
 * Barbell Squat at the leg press because it alone forgot to exclude the lifts already in the
 * session, and the program editor's exclusion list was an OPTIONAL prop the caller had to
 * remember to pass. Four pools is not four features; it is three places for the next bug to hide.
 *
 * ── The law (founder, 2026-07-12) ─────────────────────────────────────────────────────────────
 * A swap is a SYNONYM, not a variation.
 *
 * The engine put this exercise in this slot for a reason. If the station is busy, the athlete
 * still needs the training effect the slot was designed to deliver — so we hand them the CLOSEST
 * thing to it, on different equipment. We do not hand them "a fresh stimulus": swapping an
 * occupied Leg Press for a Bulgarian Split Squat is not a substitution, it is a different workout,
 * and it quietly undoes the program the engine spent a week building.
 *
 * That is the whole idea. Everything below is bookkeeping in service of it.
 */
import {
  exerciseById,
  exercisesForMuscle,
  catalogIdFromEngine,
  patternFamily,
  SUPPORT_RANK,
  type Exercise,
} from '@/data/exercises';

/**
 * WHEN the swap verb is offered: before the first set of a lift, and never after.
 *
 * The module header tells the story of four pools disagreeing about WHAT a legal swap is. This is
 * the same law one axis over — WHEN — and it drifted the same way, for the same reason: two
 * surfaces each hard-coded their own answer. The wrist gated on `exerciseSetIndex === 0` (the first
 * set of any lift); the phone's stage gated on `exNo === 1 && setN === 1` (the first set of the
 * FIRST lift only). So an athlete standing at lift 4 saw the swap glyph on her watch and nothing on
 * her phone, in the same instant, for the same lift.
 *
 * The phone's narrower rule was survivable only while the programme-edit screen existed — a lift you
 * wanted rid of could be handled by planning. **S-73 deleted that screen**, and the brief names the
 * consequence: the in-workout swap is now the athlete's main exercise-selection lever, and the stage
 * is the ONLY place the verb is taught.
 *
 * Why set 0 and not later: a swap belongs BEFORE the work. Once a set is logged against a lift, the
 * athlete has trained it — replacing it mid-lift would strand those sets on an exercise that is no
 * longer in the session.
 *
 * Both surfaces ask THIS function. Not "both surfaces happen to agree" — one rule, one place.
 */
export function isSwapMoment(setIndexInExercise: number): boolean {
  return setIndexInExercise === 0;
}

/** The athlete's standing preferences for a lift, if they have set any. */
export interface SwapPrefs {
  /** "Whenever you give me X, give me Y instead." */
  substitutes?: Record<string, string>;
  /** "When X's station is busy, I use Y." */
  backups?: Record<string, string>;
}

export interface SwapContext {
  /**
   * Every exercise already in TODAY'S session — the one being replaced included. NOT optional:
   * making it optional is precisely how the watch ended up offering a lift the athlete had
   * already done. A caller with nothing to exclude passes `[]` and says so out loud.
   */
  sessionExerciseIds: readonly string[];
  prefs?: SwapPrefs;
}

/* ── The score ────────────────────────────────────────────────────────────────────────────────
 * Lower is closer. Every term is a fact about the movement, and the weights encode the law:
 * fidelity to the slot first, availability second.
 * ───────────────────────────────────────────────────────────────────────────────────────────*/

/** A different MOVEMENT is not a substitute at all. It is the heaviest thing we can say. */
const PENALTY_PATTERN = 100;
/** A compound is not replaced by an isolation. This is what stops a busy leg curl resolving to
 *  a DEADLIFT — the single worst suggestion the old pool could make. */
const PENALTY_TIER = 50;
/** Per step of the support ladder (free → guided → supported). This is what ranks the Hack Squat
 *  (guided, 1 step away) above the Front Squat (free, 2 steps) as the answer to a busy Leg Press. */
const PENALTY_SUPPORT_STEP = 10;
/** One limb vs two is a real difference in the demand — but a smaller one than the movement. */
const PENALTY_UNILATERAL = 20;
/** The current lift can be loaded and the candidate cannot. A push-up is a real bench-press
 *  substitute; it is just not the FIRST one, ahead of dumbbells. */
const PENALTY_UNLOADABLE = 30;
/** A regression (the knee push-up) is a scaling of a movement, never a peer of it. */
const PENALTY_REGRESSION = 60;
/** The busy station is the reason we are here at all, so an alternative on the SAME equipment
 *  family is very slightly worse — a tie-break, not a rule (two different machines are two
 *  different stations, so this must never outweigh fidelity). */
const PENALTY_SAME_EQUIPMENT = 5;

/** Can this exercise carry external load? */
const loadable = (e: Exercise): boolean => !e.bodyweight && e.equipment !== 'bodyweight';

/**
 * How far `candidate` is from `current` as a SUBSTITUTE. Pure + exported: this ordering is the
 * product, so it is pinned by tests rather than eyeballed in a screenshot.
 */
export function swapScore(current: Exercise, candidate: Exercise): number {
  let score = 0;
  if (candidate.pattern !== current.pattern) score += PENALTY_PATTERN;
  if (candidate.tier !== current.tier) score += PENALTY_TIER;
  score += Math.abs(SUPPORT_RANK[candidate.support] - SUPPORT_RANK[current.support]) * PENALTY_SUPPORT_STEP;
  if (!!candidate.unilateral !== !!current.unilateral) score += PENALTY_UNILATERAL;
  if (loadable(current) && !loadable(candidate)) score += PENALTY_UNLOADABLE;
  if (candidate.regression) score += PENALTY_REGRESSION;
  if (candidate.equipment === current.equipment) score += PENALTY_SAME_EQUIPMENT;
  return score;
}

/**
 * Is `candidate` allowed to be offered at all? These are GATES, not preferences — no score may
 * overrule them.
 */
function admissible(current: Exercise, candidate: Exercise, excluded: ReadonlySet<string>): boolean {
  if (candidate.id === current.id) return false;
  // Already in today's session. This is the law the watch was breaking.
  if (excluded.has(candidate.id)) return false;
  // The muscle scopes the swap; the capability contract of the engine's slot rides on it.
  if (candidate.muscle !== current.muscle) return false;
  if (candidate.capability !== current.capability) return false;
  // Never cross a functional family: the ADductor machine is not an answer to a busy ABductor
  // machine, however similar the two look on every other axis.
  if (patternFamily(candidate.pattern) !== patternFamily(current.pattern)) return false;
  return true;
}

/**
 * The session's exercises, as CATALOG ids.
 *
 * The plan can carry the engine's bare ids ('back_squat') where the catalog uses the
 * equipment-prefixed form ('bb_back_squat'). An exclusion list compared in the wrong id space
 * silently excludes nothing — and silently offering the athlete the lift they just finished is
 * exactly the bug this pool was written to kill. Normalise both sides, always.
 */
function excludedSet(sessionExerciseIds: readonly string[]): Set<string> {
  return new Set(sessionExerciseIds.map(catalogIdFromEngine));
}

/**
 * Every admissible substitute for `currentId`, CLOSEST FIRST.
 *
 * The athlete's own standing choices lead when they are admissible — the rest follow by fidelity.
 * Ties break on catalog order, so the result is fully deterministic and reproducible in a test.
 *
 * Rev 7, S-70 (the learned-swap re-test): when the currently-offered lift is itself a standing
 * SUBSTITUTE (a learned adoption, S-69, or a manual edit-swap), the blueprint ORIGINAL it replaced is
 * offered FIRST — so a wrong adoption is always cheap to reverse (swap back to the original twice and
 * it is restored). The original is recovered by reverse-lookup of `substitutes`.
 */
export function swapCandidates(currentId: string, ctx: SwapContext): Exercise[] {
  const current = exerciseById(catalogIdFromEngine(currentId));
  if (!current) return [];

  const excluded = excludedSet(ctx.sessionExerciseIds);
  const pool = exercisesForMuscle(current.muscle).filter((e) => admissible(current, e, excluded));

  const scored = pool
    .map((e, i) => ({ e, score: swapScore(current, e), i }))
    .sort((a, b) => a.score - b.score || a.i - b.i);

  // The blueprint ORIGINAL this offered lift replaced (S-70), then the athlete's standing substitute,
  // then their standing backup — each only if still admissible (a preference never resurrects a lift
  // she has already done today).
  const subs = ctx.prefs?.substitutes ?? {};
  const anchorId = Object.keys(subs).find((k) => subs[k] === current.id); // the lift `current` replaced
  const pinnedIds = [anchorId, subs[current.id], ctx.prefs?.backups?.[current.id]].filter(
    (id): id is string => !!id,
  );
  const pinned: Exercise[] = [];
  for (const id of pinnedIds) {
    const ex = exerciseById(catalogIdFromEngine(id));
    if (ex && admissible(current, ex, excluded) && !pinned.some((p) => p.id === ex.id)) pinned.push(ex);
  }

  const pinnedSet = new Set(pinned.map((e) => e.id));
  return [...pinned, ...scored.map((s) => s.e).filter((e) => !pinnedSet.has(e.id))];
}

/** The one best substitute, or undefined when the athlete's muscle offers no admissible peer. */
export function bestSwap(currentId: string, ctx: SwapContext): Exercise | undefined {
  return swapCandidates(currentId, ctx)[0];
}

/**
 * The catalog's standing answer to "what stands in for this lift" — no session, no preferences.
 *
 * Used for reachability (every exercise must have a real alternative — the catalogSync test) and
 * as one rung of the swap ladder. It lives HERE, not in the catalog, because it now obeys the same
 * law as every other swap; leaving it in `data/exercises` would make the catalog import the pool
 * that imports the catalog.
 */
export function defaultBackup(id: string): Exercise | undefined {
  return bestSwap(id, { sessionExerciseIds: [] });
}

/**
 * The one-tap swap LADDER (S4): Hush decides, the athlete never evaluates a list mid-workout.
 * "Try another" walks it; "Undo" restores the original. It is simply the pool — the athlete's own
 * standing choices first, then fidelity — with nothing from today's session in it.
 */
export function swapLadder(currentId: string, ctx: SwapContext): string[] {
  return swapCandidates(currentId, ctx).map((e) => e.id);
}
