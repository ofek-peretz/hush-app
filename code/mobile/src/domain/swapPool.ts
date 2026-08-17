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
 *
 * ── Where this sits relative to the ENGINE contract (2026-07-21) ──────────────────────────────
 * The v5 register governs what the ENGINE decides. It says two things about a swap, and both are
 * enforced below as GATES: a swap is offered only **before the first set** (`isSwapMoment`, Part 9
 * §B), and the pool is **same-muscle synonyms only** — "a swap can NEVER change which muscle is
 * trained. The body map's volume is inviolate" (`admissible`). Those are law.
 *
 * The SCORE is not. Which admissible synonym leads the list is a product judgement about fidelity,
 * it sets no load, moves no volume, and appears nowhere in the register — so its weights are not
 * ledger constants (Part 6) and must never be read as engine law. They order a menu; the athlete
 * chooses, and whatever she performs is the fact the loops read (F-2/S-14).
 */
// @ts-nocheck

// 

import {
  exerciseById,
  exercisesForMuscle,
  catalogIdFromEngine,
  patternFamily,
  SUPPORT_RANK,
  type Exercise,
} from '@/data/exercises';

/**
 * ════ WHEN THE SWAP VERB IS OFFERED ON THE STAGE ════
 *
 * ⛔ FOUNDER, 2026-08-12: *"צריך להחזיר את כפתור הSWAP ליד הוידאו רק בסט הראשון בתרגיל הראשון של
 * האימון, ולגבי הSWAP של שאר התרגילים — זה מופיע במסכי הTRANSITION REST, כי אלו המקרים היחידים
 * שבהם המכשיר כנראה תפוס."*
 *
 * **The first set of the FIRST lift, and nowhere else on the stage.** His reasoning is better than
 * the rule it replaces, and it is worth stating because it is a product argument, not a tidy-up:
 *
 *   · A swap answers ONE question — *the machine is taken.* She discovers that by walking to it.
 *   · She walks to a station at exactly two moments: when the session starts, and on the crossing
 *     between two lifts. The first is this gate; the second is the TRANSITION REST, which already
 *     carries its own swap (`swapNextExercise`) aimed at the lift she is about to walk to.
 *   · Every other "first set" happens when she is ALREADY standing at the bar she just walked to —
 *     she has known whether it was free for thirty seconds. Offering the verb there answered a
 *     question that had already been answered.
 *
 * ── ⛔ WHAT THIS REVERSES, AND THE HALF OF IT THAT WAS RIGHT ─────────────────────────────────────
 * The rule was `setIndexInExercise === 0` — the first set of ANY lift — and it was widened to that
 * from `exNo === 1 && setN === 1` because the two surfaces disagreed: the wrist gated on the first
 * set of any lift, the phone on the first set of the first lift, so an athlete at lift 4 saw the
 * glyph on her watch and nothing on her phone.
 *
 * **That finding stands and is the reason this function exists at all.** What was wrong was the
 * direction the disagreement got resolved in: the phone was widened to match the wrist, when the
 * phone was right. One rule, one place, still — the answer it gives is now his.
 *
 * ⚠️ AND `exerciseIndexInSession` DEFAULTS TO 0 so a caller that only knows the set index gets the
 * old answer for the first lift. That is deliberate for the wrist bridge, which reasons in
 * `exerciseSetIndex` alone; if it ever needs the full gate it must pass the second argument rather
 * than re-deriving the rule, which is how the two surfaces drifted the first time.
 *
 * Why set 0 and not later: a swap belongs BEFORE the work. Once a set is logged against a lift, the
 * athlete has trained it — replacing it mid-lift would strand those sets on an exercise that is no
 * longer in the session.
 */
export function isSwapMoment(setIndexInExercise: number, exerciseIndexInSession = 0): boolean {
  return setIndexInExercise === 0 && exerciseIndexInSession === 0;
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

/**
 * ════ WHAT SHE IS OFFERED WHEN SHE TAPS SWAP — AT MOST THREE, AND NEVER PADDED ════
 *
 * ⛔ FOUNDER, 2026-08-16: *"שלחיצת swap לא ישר מעביר לתרגיל דומה אלא מציג 3 אופציות לבחירה"* — and,
 * in the same breath, the bar that matters: *"רק תוודא שאכן החלופות הגיוניות ושזה לא יציע סתם
 * אופציות."*
 *
 * ⚠️ A FIXED THREE WOULD HAVE BEEN PADDING, AND IT IS MEASURABLE. Across the 111 generatable lifts:
 *
 *     3 or more TRUE synonyms (same movement pattern) ....... 62 lifts
 *     exactly two ........................................... 25
 *     exactly one ........................................... 18
 *     none at all ...........................................  6   (leg extension, ab wheel, …)
 *
 * So "always show three" would fill 49 of 111 menus with a DIFFERENT MOVEMENT — and this module's
 * own header is explicit that *"a swap is a SYNONYM, not a variation"*. The worst case measured: the
 * third option for a cable kickback was a HIP THRUST, a full 170 points away — a different pattern
 * and a different tier. Nobody asking for another kickback wants that offered as a peer.
 *
 * So the menu is capped at three but never stretched to three. `sameMovement` marks each one, and
 * the caller must show the difference: a true synonym is "the cable is busy, do the dumbbell
 * version"; anything else is "there is no other kickback — this trains the muscle a different way",
 * which is a real answer when the station is taken and a lie if it is presented as the same lift.
 *
 * ⚠️ THE LAST RUNG IS KEPT ON PURPOSE. Six lifts have no synonym at all, and offering her nothing
 * when the rack is occupied is worse than offering her something honestly labelled (S-20).
 */
export interface SwapChoice {
  exercise: Exercise;
  /** True when it trains the same movement pattern — a substitute rather than a replacement. */
  sameMovement: boolean;
}

/** How many the menu shows at most. Three is the founder's number; the cap is not the target. */
export const SWAP_CHOICES = 3;

export function swapChoices(currentId: string, ctx: SwapContext, limit: number = SWAP_CHOICES): SwapChoice[] {
  const current = exerciseById(catalogIdFromEngine(currentId));
  if (!current) return [];
  const ranked = swapCandidates(currentId, ctx);

  /*
   * ⛔ HER OWN STANDING CHOICES LEAD, WHATEVER PATTERN THEY CARRY (2026-08-16, caught in review).
   *
   * `swapCandidates` deliberately puts three things at the head of the list: the blueprint ORIGINAL a
   * learned adoption replaced (S-70), her standing SUBSTITUTE (S-69) and her BACKUP. The first build
   * of this function then re-partitioned the whole list by exact `pattern` — and any pinned lift
   * whose pattern differed fell out of the menu entirely.
   *
   * That silently broke S-70's promise that a wrong adoption is cheap to reverse: *"the original is
   * offered FIRST ever after, so swap back twice and it is restored."* On the phone it was not
   * offered at all. `admissible` gates on `patternFamily`, which is far wider than `pattern`, so a
   * cross-pattern standing choice is perfectly legal — it just is not a SYNONYM, and the row says so.
   */
  const pinnedCount = pinnedLeadCount(ranked, current, ctx);
  const pinned = ranked.slice(0, pinnedCount);
  const rest = ranked.slice(pinnedCount);

  const out: SwapChoice[] = pinned
    .slice(0, limit)
    .map((e) => ({ exercise: e, sameMovement: e.pattern === current.pattern }));

  const synonyms = rest.filter((e) => e.pattern === current.pattern);
  const others = rest.filter((e) => e.pattern !== current.pattern);
  for (const e of synonyms) {
    if (out.length >= limit) break;
    out.push({ exercise: e, sameMovement: true });
  }
  /*
   * ⚠️ AND A DIFFERENT MOVEMENT ONLY WHEN HER OWN CANNOT FILL THE MENU AT ALL — never to round it up
   * to three. `swapPool`'s measurement: 49 of 111 lifts have no third true synonym, and the third
   * option for a cable kickback is a hip thrust, 170 points away.
   */
  if (out.length === 0) {
    for (const e of others) {
      if (out.length >= 1) break;
      out.push({ exercise: e, sameMovement: false });
    }
  }
  return out;
}

/**
 * How many of `ranked`'s leading entries are HER standing choices rather than the fidelity score's.
 *
 * `swapCandidates` builds them in one place and prepends them; this reads the same three sources so
 * the two cannot disagree about which rows are hers.
 */
function pinnedLeadCount(ranked: readonly Exercise[], current: Exercise, ctx: SwapContext): number {
  const subs = ctx.prefs?.substitutes ?? {};
  const anchorId = Object.keys(subs).find((k) => subs[k] === current.id);
  const ids = new Set(
    [anchorId, subs[current.id], ctx.prefs?.backups?.[current.id]]
      .filter((id): id is string => !!id)
      .map((id) => catalogIdFromEngine(id)),
  );
  if (ids.size === 0) return 0;
  let n = 0;
  while (n < ranked.length && ids.has(ranked[n].id)) n += 1;
  return n;
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
