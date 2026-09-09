/**
 * Hush Engine v5 — the declared constants (the Part 6 ledger, in code).
 *
 * There are exactly two kinds of number here, and NOTHING else:
 *   • BOOTSTRAPS (B-*) — starting values, each overwritten by her own data within the first
 *     sessions. They are theory-laden by nature and acceptable ONLY because a fact of hers replaces
 *     them fast (L2). None survives into a standing decision.
 *   • FORM CONSTANTS (F-*) — they shape a set count, a filter, a tie-break, or an estimator's
 *     algorithm. None SETS a working load.
 *
 * If a number is not one of these, it does not belong in the engine. See
 * docs/canonical/ENGINE_V5_SITUATION_REGISTER.md Part 6. Retired constants (F-3/F-5/F-6/F-7/F-10,
 * B-7) are gone — the features they served were cut in Rev 6.
 */

import type { Equipment } from '@/engine/catalog';

// ── Form constants (F-*) ──────────────────────────────────────────────────

/** F-1 — sets per exercise stay in [3, 5]. */
export const SETS_MIN = 3;
export const SETS_MAX = 5;
/*
 * ⛔ NARROWING F-1 TO [3, 4] WAS MEASURED AND REJECTED (founder 2026-08-11): *"if we lower sets per
 * exercise to 3–4, does it help — other things would free up, right?"* The instinct is reasonable
 * and the measurement says no, twice over.
 *
 * ── IT CHANGES NOTHING FOR A NORMAL PROGRAMME, BECAUSE THE CEILING IS NEVER REACHED ────────────
 * Set counts across the plain weeks at every frequency and both sexes:
 *
 *     SETS_MAX = 5  →  { 3: 130, 4: 106 }      not one exercise at five sets
 *     SETS_MAX = 4  →  { 3: 130, 4: 106 }      byte for byte the same
 *
 * Average session 59.0 minutes, 6.56 lifts, and the same exercise count for every muscle under both.
 *
 * ── AND NOTHING IS "FREED", BECAUSE THE DAY IS TIME-BOUND, NOT SET-BOUND ───────────────────────
 * `enforceTimeCap` fills the session to her minutes whatever the per-exercise ceiling is: 22.5 sets
 * a session under both settings. A lower ceiling only spreads the same sets over marginally more
 * lifts, and each extra lift costs a TRANSITION rest — so it buys walking, not training.
 *
 * ── WHAT IT DOES COST IS THE EMPHASIS MARK ────────────────────────────────────────────────────
 * The fifth set is what a mark BUYS on a muscle whose lifts cannot multiply — a calf, a biceps, any
 * muscle whose region has no room for another exercise. Take it away and the mark has nowhere to go:
 *
 *     inert emphasis marks over the sweep .......... 129 → 199
 *     ratified laws broken ......................... 3
 *
 * So F-1 stays [3, 5]. The ceiling is not a target and is rarely used; it is the headroom that makes
 * "lead with this muscle" mean something when the clock has no room for another lift.
 */

/** F-4 — the athlete may place at most this many emphasis marks on the body map. */
export const EMPHASIS_BUDGET = 2;

/**
 * F-8 — the recency window. A measured statistic (reps-per-rung, N, the rest median, the rail)
 * reads only the athlete's most recent sessions of a lift; older history is not "her number today."
 * A raw completed load used only to SEED a prescription (S-9) is exempt — a weight she lifted is a
 * fact whatever its age; what catches a stale seed is Loop 1, from set 1 (S-38, Rev 8).
 */
export const RECENCY_WINDOW_SESSIONS = 12;

/**
 * F-11 — the rest-band width (seconds). Two sets are "like-for-like" for the reps-per-rung fit only
 * when their `restBeforeS` differ by no more than this (L3). A set whose rest is unknown, or which
 * sits outside the band relative to the set it would be compared with, is excluded from the fit.
 */
export const REST_BAND_WIDTH_S = 45;

/**
 * F-12 — the minimum number of like-for-like (load, reps) pairs at DISTINCT loads before the fitted
 * reps-per-rung slope (F-13) replaces the cautious single-rung bootstrap (B-5).
 */
export const MIN_PAIRS_FOR_SLOPE = 4;

/** F-13 — N's percentile: nearest-rank at this fraction (one named method, stable on small n). */
export const N_PERCENTILE = 0.75;

/**
 * F-14 (Revision 7) — K, the learned-swap adoption threshold (register Part 9). The number of
 * CONSECUTIVE same-target in-workout swaps before a standing replacement is adopted (S-69). An
 * evidence gate (the F-12 / N family), not a load mover. Deliberately small: the engine reacts fast,
 * and the original is offered first ever after (S-70), so a wrong adoption is cheap to undo.
 */
export const ADOPT_THRESHOLD = 2;

/**
 * F-9 — the canonical muscle order: the final tie-break for a contested set (S-32 #3) and, reversed,
 * for the donor (S-37). It repeatedly allocates real volume, so it is a declared form constant.
 * Mirrors the v4 `PATTERNS` enum order (push → pull → legs), extended to every muscle group. Never
 * reordered — determinism depends on it (I-24).
 */
export const CANONICAL_MUSCLE_ORDER: readonly string[] = [
  'Chest',
  'Shoulders',
  'Triceps',
  'Back',
  'Biceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
] as const;

// B-4 (day-one per-set cost) lives where assembly prices a day — `domain/restPrescription`'s
// COMPOUND_SET_MIN / ISOLATION_SET_MIN + SET_EXEC_SECONDS (moved there 2026-08-11) — replaced by her measured rest (S-17)
// and set durations (learnedExecS) the moment she has them. A second copy of those numbers used to
// sit HERE (`STARTING_SET_SECONDS`, unwired, and disagreeing with the live ones): one declared
// constant, one home — it is gone.

/**
 * B-2 — the LEGACY starting weekly sets per muscle, read only on the days-unknown path
 * (`assembler.weeklyTargets` with `days == null`). The live rule is `startingWeeklySets(days)`
 * below, and an emphasis mark is a TRANSFER of `DAY_ONE_EX_DIVISOR` blocks (assembler), not a
 * bonus: `emphasisBonus` is read by nothing and kept only so the shape of an old state decodes.
 */
export const STARTING_WEEKLY_SETS = { base: 10, emphasisBonus: 6 } as const;

/**
 * â•â•â•â• B-2, MADE FREQUENCY-AWARE (founder 2026-08-08) â•â•â•â•
 *
 * `base` above is a FLAT 10 sets per muscle per week, whatever the athlete's frequency, and that one
 * constant is why `everyProgramme`'s two guards have been skipped since build 36: *"weekly volume
 * never consults frequency, so six days a week is the same pot of work sliced into 24- and 12-minute
 * days"* (QA_BUILD_36_FOUNDER P0.3/P0.4). The audit prints it plainly — male 4×, 5× and 6× all came
 * out at ~156 minutes a week, and the 6× week ended on a two-lift, 18-minute session.
 *
 * The arithmetic that produced it: 10 sets → `exerciseCountFor` → 2 exercises per muscle → 10 upper
 * exercises dealt round-robin across three upper days → three lifts a day. Training more days bought
 * nothing; it only sliced the same pot thinner.
 *
 * Volume now scales with the days she actually trains: frequency is what BUYS recoverable volume, so
 * it is what sets it. The TARGET is 5 × days, and it is deliberately generous — read the note on
 * WEEKLY_SETS_CEILING. What the athlete actually performs is the target after `enforceTimeCap` cuts
 * the day to her minutes, and THAT is the number to judge: ~11 sets a muscle a week at four days and
 * ~16 at six, both inside the 12–20 the evidence calls optimal, and ~5 at two days, which is honestly
 * below the effective dose because two sessions cannot hold more.
 *
 * The audit reads monotonic now — 120 / 174 / 240 / 294 / 360 minutes a week at 2…6 days — where
 * before it was 120 / 150 / 156 / 156 / 156 and the extra days bought nothing.
 *
 * ⛔ This is the DAY-ONE shape only. Loop 3 still earns and cuts from her facts within weeks (S-32 /
 * S-34), and it may take a muscle past this number — that is measured, and this is a guess.
 */
/* B-2 (frequency-aware) - the three numbers below are one bootstrap; Loop 3 overwrites it. */
export const WEEKLY_SETS_PER_DAY = 5;
export const WEEKLY_SETS_FLOOR = 6; // MEV — below this a muscle is maintained, not grown
/* B-2 - a SHAPE input, not a prescription. Deliberately above the ~20 weekly sets the evidence
 * calls the point of diminishing returns, because the day-one target is what FILLS a day before
 * enforceTimeCap trims it to her minutes - the clock is the real allocator. Realized: ~11 sets a
 * muscle at four days, ~16 at six, inside the 12-20 band. Never read as 'she will do 30 sets'. */
export const WEEKLY_SETS_CEILING = 30;

/**
 * ⛔ THE SESSION IS ONE LENGTH FOR EVERYONE (founder 2026-08-10): *"למה לא פשוט להגדיר שעה אימון
 * קבוע — בין 45 ל-60 דקות טווח קבוע?"*
 *
 * He is right, and the product had already been doing it without saying so. `workoutMinutes` sat on
 * `Profile` as a number, and NOTHING WROTE IT: onboarding stopped asking on 2026-08-05 (*"the athlete
 * cannot answer how long she wants to be in a gym before her first session"*), and no settings
 * control was ever built. Every athlete carried the same 60.
 *
 * ⚠️ A VARIABLE NOBODY SETS IS WORSE THAN A CONSTANT, and it cost three things:
 *   · a whole dimension of the engine's state space to test and maintain, with no user behind it;
 *   · WEAKER GUARANTEES — a family of bounds proved instead of one. One bound is stronger;
 *   · two "defects" I reported to the founder that no athlete could reach, because I swept the space
 *     the TYPE allowed rather than the space the PRODUCT produces.
 *
 * The floor is his too: *"just make it at least 45 minutes, because less than that is too light."*
 */
/* F-15 — the session's fixed length. Both ends are the founder's, 2026-06-23 and 2026-08-05. */
export const SESSION_MIN = 45;
export const SESSION_MAX = 60;

/**
 * B-2 — the muscle count a full body map trains (every group but Core, which is supplemental).
 * Turning muscles OFF does not shorten her hour, so the work has to redistribute over what is left.
 */
export const FULL_BODY_MUSCLE_COUNT = 9;

/**
 * B-2 — at or below this many training days, every session trains the WHOLE body.
 *
 * Splitting upper from lower divides the week's sessions between the halves, so at two days each
 * muscle is trained once a week and at three the entire lower body is. Twice a week grows roughly
 * 63% more than once at equal volume, and that is the single best-supported number in the whole
 * hypertrophy literature — a split that costs it is a split that is not worth having yet. Four days
 * is where upper/lower first gives BOTH halves two sessions, so that is where the split begins.
 */
export const FULL_BODY_UNTIL_DAYS = 3;

/**
 * ════ B-2 — A MUSCLE'S SHARE OF THE WEEK'S WORK (founder 2026-08-09) ════
 *
 * ⛔ Founder: *"אני רוצה גם שתסתכל על תוכניות האימון עצמם ותגיד לי האם הן טובות ברמה בינלאומית."*
 *
 * Read as a coach would read it, the answer was no, and one number was the reason: every muscle drew
 * the SAME weekly target. The printed male 4× week came out —
 *
 *     Quads 15 · Calves 12 · Hamstrings 11 · Triceps 10 · Shoulders 10 · Biceps 9 · Chest 8 · Back 8
 *
 * — and no coach in the world signs a programme where the CALVES are trained harder than the BACK,
 * or where the biceps (a small muscle already worked by every pull) gets more direct volume than the
 * largest muscle group in the body. The engine simply had no concept of muscle size.
 *
 * These are SHARES of a fixed weekly pot, not multipliers on a fixed per-muscle number, so the total
 * work in a week does not move when the shares are tuned — only its distribution. The pot itself is
 * `WEEKLY_SETS_PER_DAY × days`, and the time cap still has the last word on what fits.
 *
 * The ordering follows the standing evidence — roughly 12–16 weekly sets for the large groups and
 * 8–12 for the small ones — and the small ones sit at the bottom of their band on purpose, because
 * every number here counts DIRECT sets only: the biceps also work on every row and pulldown, and the
 * triceps on every press, and none of that indirect work is counted anywhere.
 */
export const MUSCLE_VOLUME_SHARE: Record<string, number> = {
  Back: 1.5, // the largest group, and the one the old flat target starved worst
  Chest: 1.3,
  Quads: 1.3,
  Hamstrings: 1.2,
  Shoulders: 1.2, // three heads, and the lateral/rear ones get nothing indirectly
  Glutes: 1.1,
  Biceps: 0.7, // worked by every pull already
  Triceps: 0.7, // worked by every press already
  Calves: 0.6,
};

export function startingWeeklySets(
  days: number,
  trainableCount: number = FULL_BODY_MUSCLE_COUNT,
  /** The muscle whose share to apply. Omitted → the flat, size-blind figure (older callers). */
  muscle?: string,
  /** The trainable muscles, so the pot divides by the shares actually on the map. */
  trainable?: readonly string[],
): number {
  /*
   * ⛔ AN `off` MUSCLE MUST NOT SHORTEN HER SESSION.
   *
   * She asked not to train a muscle, not for a shorter workout — the hour is the same hour. So the
   * pot is fixed at `WEEKLY_SETS_PER_DAY × days × FULL_BODY_MUSCLE_COUNT` and divided by the shares
   * that remain: turning off four leg muscles hands the whole week to the five upper ones. Before
   * this, the sweep counted 335 sessions under 45 minutes, nearly all on maps with something off.
   */
  const pot = WEEKLY_SETS_PER_DAY * days * FULL_BODY_MUSCLE_COUNT;
  const share = muscle ? (MUSCLE_VOLUME_SHARE[muscle] ?? 1) : 1;
  const totalShares = trainable?.length
    ? trainable.reduce((n, m) => n + (MUSCLE_VOLUME_SHARE[m] ?? 1), 0)
    : Math.max(1, trainableCount);
  const scaled = (pot * share) / totalShares;
  /*
   * ⛔ THE CEILING BOUNDS THE WEEK — IT MAY NOT FLATTEN ITS SHAPE (founder 2026-08-11).
   *
   * `Math.min(CEILING, …)` was applied to each muscle on its own, which means every muscle whose
   * share carried it past 30 came out at EXACTLY 30 — and the share table, the thing that knows a
   * back is not a chest, was erased for precisely the muscles it matters most for:
   *
   *     5 days   Back 35 → 30   ·  Chest 30      the 1.5 and the 1.3 become the same number
   *     6 days   Back 42 → 30   ·  Chest 37 → 30   …and SIX muscles all land on 30 together
   *
   * That is why push:pull failed at five and six days and nowhere else. Below five nothing clamps,
   * the shares hold, and the delivered week comes out at 1.44–1.47. At five and six the targets go
   * flat, and from there the DEALER decides — by canonical order, which puts Back fourth and Biceps
   * fifth. Three fixes aimed at the dealer were written and reverted (see `theWeekIsBalanced`); the
   * dealer was never the problem. It was being handed a week with no shape left in it.
   *
   * So the ceiling is applied to the LARGEST muscle and everything is squeezed with it. The biggest
   * target still lands exactly on `WEEKLY_SETS_CEILING` — the bound the register asks for is kept to
   * the set — and the ratios between muscles survive it, which is the whole reason the table exists.
   *
   * ⚠️ THE FLOOR IS STILL APPLIED AFTER, so squeezing can never take a muscle under MEV.
   * ⚠️ AND IT NEEDS `trainable` to know who the largest is. Callers that do not pass it (older tests,
   * the size-blind path) keep the per-muscle clamp exactly as before.
   */
  const maxShare = trainable?.length
    ? Math.max(...trainable.map((m) => MUSCLE_VOLUME_SHARE[m] ?? 1))
    : share;
  const maxScaled = (pot * maxShare) / totalShares;
  const squeeze = maxScaled > WEEKLY_SETS_CEILING ? WEEKLY_SETS_CEILING / maxScaled : 1;
  return Math.min(WEEKLY_SETS_CEILING, Math.max(WEEKLY_SETS_FLOOR, Math.round(scaled * squeeze)));
}

/**
 * ⛔ EMPHASIS IS A PROPORTIONAL CLAIM, NOT A FIXED NUMBER OF SETS.
 *
 * `emphasisBonus` is a flat +6, which was +60% of the old flat base of 10. Once the base scales with
 * frequency the same +6 quietly shrinks to +40% at three days and +20% at six — and emphasis stops
 * shaping the week. `structure follows volume` caught it immediately: two emphasised lower muscles
 * at 3 days stopped pulling a second lower day, because 72 lower sets against 75 upper rounds to one
 * day, where 52 against 50 rounded to two.
 *
 * The mark has to keep the same WEIGHT at every frequency, so it is a fraction of the base.
 */
/* B-2 - the emphasis mark's share of the base. */
export const EMPHASIS_FRACTION = 0.6;

export function emphasisBonusFor(base: number): number {
  return Math.round(base * EMPHASIS_FRACTION);
}

/** Which region a muscle group belongs to — drives session shape (the assembler groups by region so
 *  a day is a coherent session). Structure is an OUTPUT of volume, never an input (register Part 3). */
export const MUSCLE_REGION: Record<string, 'upper' | 'lower'> = {
  Chest: 'upper',
  Shoulders: 'upper',
  Triceps: 'upper',
  Back: 'upper',
  Biceps: 'upper',
  Core: 'upper', // trained across upper days (assembler-preferred), never its own day
  Quads: 'lower',
  Hamstrings: 'lower',
  Glutes: 'lower',
  Calves: 'lower',
};

// ── Bootstraps (B-*) ──────────────────────────────────────────────────────

/**
 * B-6 — the starting loadable increment per equipment class, assumed before she has touched the
 * equipment so day-one loads are real. Her performed loads (`observedLoads`) refine this into the
 * real grid (F-2); this is only the fallback when no grid is known yet. Mirrors v4's LOAD_INCREMENT.
 */
export const STARTING_INCREMENT: Record<Equipment, number> = {
  barbell: 2.5,
  fixed_barbell: 2.5, // fixed-bar sets step in 2.5s (10 · 12.5 · 15 …); her grid refines as ever
  dumbbell: 1.0,
  machine: 2.5,
  cable: 2.5,
  bodyweight: 0,
};

/**
 * S-55 / F-2 — **THE EMPTY BAR.** The floor under every barbell load, because it is a fact of the
 * room, not a statistic: "a prescription may never fall to or below zero, or below the lightest
 * weight that physically exists (the empty bar, the smallest dumbbell, the first pin)."
 *
 * It lives HERE, beside B-6, because it is the same kind of thing — what the equipment physically
 * offers — and because it must have exactly ONE home. It previously sat in `engine/loadMath`, which
 * `engine/v5/grid` then imported while `loadMath` imported the grid back: a cycle, and worse, an
 * invitation for the two to hold different numbers. `loadMath` re-exports it for its consumers.
 */
export const BAR_KG = 20;

/**
 * F-19 — **THE LIGHTEST FIXED BAR.** The floor under every `fixed_barbell` load, the same kind of
 * room-fact as `BAR_KG` above: curls, reverse curls and skullcrushers are performed on pre-weighted
 * fixed bars whose commercial sets start at 10 kg. Before this family existed those lifts wore the
 * Olympic bar's 20 kg floor, which the founder hit in the gym on 2026-08-25 (finding #11: the
 * editor refused to go under 20 on a barbell curl, and the engine could never prescribe the 15 or
 * the 10 the rack actually holds).
 */
export const FIXED_BAR_KG = 10;

/**
 * F-20 — **LOOP 1'S SECOND WITNESS.** The founder's gym finding #3 (2026-08-25): his first set
 * landed ONE rep under the band, Loop 1 ordered a drop, he ignored it, and his second set landed
 * inside the band — the correction was noise. A single set one rep outside the band is the
 * smallest miss the instrument can register and sits within an honest lift's set-to-set wobble,
 * so it no longer moves the load by itself: it waits for the NEXT set to confirm the direction.
 * A miss of this many reps or more is evidence on its own — a set two reps short is a grinding
 * set, and waiting would cost her another one — so it corrects immediately, exactly as before.
 * The in-session authority Loop 1 keeps is the emergency; the steady hand is Loop 2, between
 * sessions, reading the whole occurrence (finding #6).
 */
export const LOOP1_CONFIRM_MISS = 2;

/**
 * B-3 — attempts-to-clear before she has a history on the lift. The most conservative value: assume
 * she clears each load first try, so a single missed occurrence does not read as a stall. Replaced
 * by her own statistic (S-25) as soon as she has cleared a load or two.
 */
export const ATTEMPTS_TO_CLEAR_SEED = 1;

/**
 * B-5 — the move of last resort: ONE rung, when nothing at all prices the step (a load of zero, an
 * equipment class with no rung). Not a guessed slope — a cautious single step, tested by the next
 * set (L2).
 *
 * ⛔ IT USED TO BE THE WHOLE OF B-5, AND THAT IS WHAT THE FOUNDER CAUGHT (2026-08-16):
 *
 *   > *"אני יודע שאם מתאמן ביצע למשל 20 חזרות או 12 אנחנו מעלים לו אותו דבר."*
 *
 * He is right, and it was measurable in one line. On an 8-10 band at 10 kg, before her slope is
 * fitted:
 *
 *     did 12 reps → 11 kg          did 7 reps → 9 kg
 *     did 20 reps → 11 kg          did 3 reps → 9 kg
 *                                  did 1 rep  → 9 kg
 *
 * A flat rung is only "cautious" in ONE direction. Being one rung light after a 20-rep set is not
 * caution, it is a wasted exercise; being one rung heavy after a 1-rep set leaves her under a weight
 * she cannot move, with `MAX_CORRECTIONS = 2` to escape it.
 *
 * ⚠️ SO THE BOOTSTRAP IS NOW DERIVED, NOT DECLARED. `repsPerRung.bootstrapPerRung` prices one rep of
 * headroom from the SAME e1RM model the app already displays (`loadMath.epley` / `loadForReps`) —
 * no new number, and it scales itself per equipment because it is a proportion of her load. This
 * constant survives only as the floor under a case the model cannot price at all.
 */
export const BOOTSTRAP_RUNGS_PER_MOVE = 1;

/**
 * ════ F-21 · A RAISE NEEDS ONE REP OF HEADROOM ON THE WORST SET (S-22b, 2026-09-10, measured) ════
 *
 * S-22 raised the load whenever every set met Tlo — including when the worst set landed EXACTLY on
 * it. Traced on the virtual athletes, that is the oscillation the accuracy board had been printing
 * for a month: set 4 reaches 8 → raise → set 4 falls to 6–7 → hold → stall → back off → set 4
 * reaches 8 → raise… A clear at the edge is not headroom; it is the edge. With one rep of margin
 * required before the load moves, the board (band 8–12, seed one rung light — the two rules that
 * shipped with this one):
 *
 *     in band  38.5% → 63.5%     mean miss 1.47 → 0.82 reps     set 1  32.8% → 73.5%
 *     2nd occurrence in band  29.6% → 47.6%     6th+  42.6% → 67.8%
 *
 * Alone, on the old 8–10 band with the old seed, the margin is worth 38.5% → ~44%. One rep, not two:
 * two would hold a lift that is genuinely ready on most equipment grids.
 */
export const RAISE_HEADROOM_REPS = 1;

/**
 * ════ B-10 · THE FIRST GUESS ERRS ONE RUNG LIGHT (B-1c, 2026-09-10, measured) ════
 *
 * B-1 models a working load from sex and bodyweight, and the model is, by construction, the load she
 * makes Tlo on FRESH. Set 1 at Tlo means sets 2–4 under it — every second occurrence opened heavy
 * (66.8% of second-occurrence sets under the band on the board). One rung lighter opens set 1 a rep
 * or two over the floor and the last set on it, and Loop 2 climbs from evidence: second occurrence
 * 38.1% → 47.6% in band, cold start 60% in band. It is also the sentence the product already says
 * about the first number — "a careful first guess" — made true.
 */
export const SEED_RUNGS_LIGHT = 1;

/**
 * F-16 — where the load–rep continuum ends, for the purpose of reading headroom.
 *
 * Epley's RATIO between two rep counts holds well across roughly 3–20 reps (a 20-rep set is ~60% of
 * 1RM, a 10-rep set ~75%, and the model lands on both). Past twenty, reps stop pricing the load at
 * all — the set is limited by endurance, not by the weight — so a headroom read beyond this edge is
 * not evidence about iron, and a mis-keyed rep count is indistinguishable from a real one.
 *
 * ⚠️ It is a bound on the READING, never a guard against a bad number: L11 (the rail) is what stops
 * an implausible set from moving a load it has no business moving, and where the rail is inactive
 * the register is explicit that the athlete's own eyes are the guard (S-49). This only refuses to
 * treat rep 21 and rep 60 as different facts.
 */
export const EPLEY_VALID_REPS = 20;

/**
 * F-17 — the evidence gate under her learned REST (S-17), in samples.
 *
 * The rest median is the one measured statistic that had NO gate: `learnedRestS` returned a median
 * of whatever it was given, down to a single sample. That is not a median, it is a sample wearing
 * one — and it decides a timer. One rest cut short (a phone call, a queue for the rack, a
 * mis-tapped skip) would have become her standing prescription on that lift.
 *
 * ⚠️ THREE IS DERIVED, NOT PICKED. A median is chosen over a mean precisely because one bad value
 * must not move it, and that property does not exist below three: at n=1 the outlier IS the median,
 * at n=2 it is half of it. Three is the smallest sample where the estimator does the job it was
 * chosen for. It is the F-12 family — an evidence gate, never a number that sets a load.
 *
 * ⚠️ AND IT IS CHEAP TO CLEAR: one occurrence of a three-set lift yields two inter-set rests, so a
 * lift she has trained twice is already speaking for itself.
 */
export const MIN_REST_SAMPLES = 3;

/**
 * F-18 — the evidence gate under a PER-SET load (`engine/v5/perSetShape`), in SAMPLES.
 *
 * The shape has one degree of freedom — the fraction of her capacity a set costs — and every
 * (occurrence, position) pair is one sample of it, so a four-set occurrence contributes three. Six
 * is two ordinary occurrences of an ordinary lift: enough for a median to be a median (F-17's
 * argument, one rung further in), and cheap enough that a lift starts being shaped in its second
 * week rather than its second month.
 *
 * ⚠️ IT COUNTS SAMPLES, NOT OCCURRENCES, AND THAT IS THE WHOLE LESSON OF THE FOURTH ATTEMPT. Fitting
 * one e1RM per POSITION gave the shape four free parameters, each with a single sample per session;
 * reps carry about ±0.8 of ordinary noise and a factor is a RATIO of two such estimates, so the
 * fitted ramp reached 19% where her true decay was 6%. Pooling into one rate is what makes the
 * estimate stand up, and this constant counts what the pool actually holds.
 *
 * ⚠️ IT IS NOT THE ONLY GUARD: every position is capped at one rung above Loop 2's settled
 * prescription (which has already been through L11), no position may be fitted heavier than the one
 * before it, and the ramp's MEAN is `base`, so a wrong shape redistributes the exercise without
 * changing how much work it is.
 */
export const MIN_PER_SET_SAMPLES = 6;




/**
 * ════ B-9 · WHAT SHE KEPT WHILE SHE WAS AWAY ════
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16. Measured before either number was chosen, on an athlete given eight
 * ordinary weeks and then a gap:
 *
 *     away  90 days   incline barbell press   asked 30 kg  →  she gets 0 reps
 *                     machine row             asked 32.5   →  she gets 0 reps
 *     away 180 days   dumbbell curl           asked  9 kg  →  she gets 3 reps
 *
 * Loop 1 has two corrections to rescue that (S-13) and cannot: it moves by RUNGS from where it
 * starts, so it cannot walk back thirty percent inside one session.
 *
 * ⚠️ A BOOTSTRAP, AND THE ONE THE LEDGER'S OWN TEST FITS BEST. Detraining is the single thing about
 * her the engine genuinely cannot measure — there is no data during a gap, by definition — and Part 6
 * has exactly one category for a number like that: *"theory-laden by nature and acceptable ONLY
 * because a fact of hers replaces them fast (L2)"*. This one is replaced by her very FIRST SET BACK,
 * which is faster than any other B-constant in the ledger.
 *
 * ⚠️ AND IT IS THE SAFE END OF THE EVIDENCE, NOT ITS MIDPOINT. The literature spreads either side of
 * ten percent a month; the errors are not symmetric. Too light costs her one under-loaded session,
 * which Loop 1 raises from inside. Too heavy costs her the comeback — the one session in her whole
 * history where the app most has to be right.
 *
 * The floor is what stops a long absence prescribing nothing: strength does not decay to zero, and a
 * two-year gap is a beginner again, which is B-1's job and not this one's.
 */
export const DETRAIN_RETAINED_PER_MONTH = 0.9;
export const DETRAIN_FLOOR = 0.7;
