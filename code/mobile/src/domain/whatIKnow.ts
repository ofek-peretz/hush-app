/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE ENGINE HAS MEASURED ABOUT ONE LIFT — assembled, and never invented.
 *
 * ⛔ FOUNDER, 2026-08-22, authorising the redesign, and this is the asset the review named as the
 * largest one nobody was using.
 *
 * The engine knows more about her than any surface has ever shown her, and every piece of it is
 * measured rather than guessed — that is the whole ledger's claim (Part 6: *"every number that moves
 * iron is measured, declared by the athlete, or listed here"*). Four of those numbers are facts
 * about HER, on THIS lift, and until now they existed only inside decisions:
 *
 *   · **her slope** — how many reps one rung is worth *"On the bench, Sarah loses about 2 reps per
 *     2.5 kg. That is her number."* Theil–Sen through her own like-for-like sets.
 *   · **her rungs** — the loads that physically exist for her on this lift, which she taught the app
 *     by performing them (F-2: *"the equipment grid is a MOVEMENT, not a constant"*).
 *   · **her ceiling** — the rail. One rung above the heaviest weight she has completed at her
 *     target. *"Her own record is the ceiling, and she cannot lie her way over it."* (L11)
 *   · **her rest** — the median she actually takes on this lift, which became the prescription the
 *     moment she had three samples (S-17, F-17).
 *
 * ── ⚠️ WHY THIS IS A REPORT AND NOT A CLAIM ─────────────────────────────────────────────────────
 * Progress's standing rule is that *"the screen reports, it never claims"*. Nothing here is a
 * forecast, a score, a grade or a readiness figure — every field is a statistic the engine already
 * computed to make a decision, read back out. A field it has not earned yet is **absent**, never a
 * placeholder and never a zero: below F-12's four like-for-like pairs there is no slope, below
 * F-17's three samples there is no learned rest, and on a lift with no completed set at her target
 * the rail does not exist at all (L11 — *"inactive on a lift with no completed set inside the
 * window"*), with nothing invented to stand in for it.
 *
 * ⚠️ AND ABSENCE IS THE COMMON CASE EARLY, WHICH IS THE POINT. A portrait that filled itself in with
 * bootstraps would be showing her the engine's assumptions wearing her name — the exact thing the
 * whole ledger exists to keep out of a standing decision.
 *
 * Pure & I/O-free — it asks the engine's own façade rather than deriving anything a second time.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Session } from '@/data/local/models';
import { observedLoads, perRungForV5, railCeilingFor } from '@/engine/v5/v5Engine';
import { learnedInterRestS } from '@/domain/restPrescription';

export interface LiftKnowledge {
  /**
   * Reps per rung — her measured trade between load and reps on this lift, or null until she has
   * enough like-for-like pairs for the estimator to fit one (F-12).
   */
  perRung: number | null;
  /**
   * The distinct loads she has actually performed, ascending. Her grid — the rungs that exist in
   * her gym, learned from her behaviour rather than assumed from the equipment class.
   */
  rungs: number[];
  /**
   * The rail: one rung above the heaviest load she has completed at her target reps. Null on a lift
   * where no completed set inside the recency window has earned one — and there the engine says so
   * by drawing nothing, because the one predicted physical ceiling this engine ever had was deleted
   * as theory and a display is not the place to bring it back.
   */
  ceiling: number | null;
  /** Her median rest between sets of this lift, in seconds — or null while it is still bootstrapped. */
  restS: number | null;
}

/**
 * Everything the engine has measured about `exerciseId`, from her own history.
 *
 * ⚠️ IT ASKS, IT DOES NOT DERIVE. `perRungForV5`, `observedLoads` and `railCeilingFor` are the same
 * functions the loops call to make decisions, and `learnedInterRestS` is the one home for the rest
 * doctrine (Rev 13). A portrait that computed its own slope would eventually show her a number the
 * engine was not using — which is the `bandOf` drift this codebase had to invent a shared ladder to
 * end, one surface over.
 */
export function liftKnowledge(
  exerciseId: string | null | undefined,
  history: readonly Session[],
  bandLo: number,
): LiftKnowledge {
  if (!exerciseId) return { perRung: null, rungs: [], ceiling: null, restS: null };
  const sessions = history as Session[];
  return {
    perRung: perRungForV5(exerciseId, sessions),
    /* ⛔ SORTED HERE, BECAUSE THIS FIELD'S OWN DOC PROMISES "ascending" AND IT WAS NOT (found
       2026-08-31, by the first reader that depended on the order). `observedLoads` returns
       `[...seen]` — a Set in INSERTION order — so a lift performed at 60, then 70, then 65 came
       back as [60, 70, 65]. `LiftDetail` reads only `rungs.length` and never noticed; the stage's
       "your heaviest here" would have printed 65 as her peak on the first day it shipped.
       Sorted at the façade rather than inside the engine: `observedLoads` feeds grid arithmetic
       that has never cared about order, and a comment that lies is fixed by making it true. */
    rungs: [...observedLoads(exerciseId, sessions)].sort((a, b) => a - b),
    ceiling: railCeilingFor(exerciseId, bandLo, sessions),
    restS: learnedInterRestS(sessions, exerciseId),
  };
}

/**
 * Is there anything to show at all?
 *
 * ⚠️ ASKED SEPARATELY SO A SURFACE CAN STAY SILENT RATHER THAN DRAW AN EMPTY FRAME. On a lift she
 * has performed once there is one rung and nothing else, and a panel headed "what I have measured"
 * over a single number is the app performing knowledge it does not have.
 */
export function knowsAnything(k: LiftKnowledge): boolean {
  return k.perRung != null || k.ceiling != null || k.restS != null || k.rungs.length > 1;
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * …AND THE ONE PIECE OF IT WORTH SAYING TO HER MID-WORKOUT (founder, 2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אם המשתמש מרגיש שבאמת התוכנית אישית, מושלמת ובאמת מותאמת ספציפית למטרה ולצרכים של המשתמש
 *   > יהיה לו דרייב לדבוק בה ולהשקיע ברישום כל סט… אם המשתמש מרגיש שזאת סתם תוכנית כללית וגנרית אז
 *   > זה פחות נותן דרייב למתאמן כי זה משהו פחות אישי."*
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────
 *
 * Read against the code, the founder's instinct lands on something precise. Two of the three things
 * authority is made of were already built AND narrated: CONSEQUENCE (`WellDone` draws every engine
 * decision with the reason that earned it; `WeeklyUpdate` mirrors a week of them) and REFUSAL (the
 * earned light week, the time cap, the pain path). The third was computed everywhere and said
 * nowhere — `liftKnowledge` above has existed since 2026-08-22 and is read by exactly ONE screen,
 * `LiftDetail`, a leaf inside Progress that nobody opens mid-workout.
 *
 *   **The app tells her what it DID. It never tells her what it KNOWS.**
 *
 * Consequence without specificity reads as an algorithm adjusting. Consequence AFTER specificity
 * reads as a coach. Same decisions, same screens, different product — and it costs no new engine,
 * because the measuring has been happening all along.
 *
 * ── ⛔ ONE FACT, NOT A PANEL, AND THE ORDER IS THE ARGUMENT ──────────────────────────────────────
 *
 * `liftKnowledge` is a PORTRAIT and belongs on a page. This is the opposite shape: she is walking
 * between stations with a card in her hand, and the stage's standing law is that it holds one
 * thing. So the ranking is by how UNGUESSABLE the fact is — which is exactly what makes it evidence
 * of watching rather than a number anyone could have printed:
 *
 *   1 · HER REST on this lift. The most specific thing in the product: measured per lift, different
 *       from the default, and a number no athlete knows about herself. It is also the number the
 *       timer she is about to watch will actually run — so the claim is checkable within ninety
 *       seconds, which is what makes it authority instead of a boast.
 *   2 · HER EXECUTION on it. The same class, one rung less surprising.
 *   3 · HER HEAVIEST RUNG — the top of the grid she taught it by lifting. She may well remember
 *       this one, so it proves less; on a lift with no rest evidence yet it is the truest thing
 *       available, and it is read off `rungs` rather than derived a second time.
 *   4 · HOW MANY TIMES she has worked it. The weakest, and the one that exists on day two when
 *       nothing else does.
 *
 * ⚠️ AND A LIFT WITH NO HISTORY GETS NOTHING. Day one has no facts about her and must say so by
 * being silent. A product that invents a line to fill the slot is precisely how "personalised"
 * becomes a word the athlete stops believing — and every gate above (F-8, F-12, F-17, L3, L11) is
 * already built to return null rather than flatter.
 *
 * ⚠️ NEVER A COMPLIMENT. "You're doing great" is not knowledge, it is a slogan, and a slogan beside
 * a real number cheapens the number. Every fact here is a quantity with a unit.
 */
export interface KnownFact {
  kind: 'rest' | 'exec' | 'peak' | 'sessions';
  /** Seconds for `rest`/`exec`, kilograms for `peak`, a count for `sessions`. */
  value: number;
}

/**
 * How many separate sessions she has WORKED this lift in.
 *
 * Warm-up bridges and legacy approach sets are not work (`isApproach`, the standing exclusion), and
 * a session in which she logged none of this lift is not a session with it — so "eleven times"
 * means eleven times, not eleven rows in a table.
 */
export function sessionsWithLift(history: readonly Session[], exerciseId: string): number {
  let n = 0;
  for (const s of history) {
    if (s.sets.some((l) => l.exerciseId === exerciseId && !l.isApproach && l.actualReps >= 1)) n += 1;
  }
  return n;
}

/**
 * The one measured thing worth saying about this lift right now, or null when there is nothing true
 * to say. The copy lives in the copy pack — a module that returned Hebrew would be a second copy
 * pack nobody lints — so `kind` picks the sentence and `value` fills it.
 */
export function factForLift(
  history: readonly Session[],
  exerciseId: string | null | undefined,
  /** Her measured execution seconds on this lift (`domain/setDwell.learnedExecSFor`), or null. */
  execS: number | null,
): KnownFact | null {
  if (!exerciseId) return null;
  const k = liftKnowledge(exerciseId, history, 8);
  if (k.restS != null) return { kind: 'rest', value: k.restS };
  /*
   * ⛔ AN ABSURD MEASUREMENT IS NOT A FACT (design review 2026-09-01). The crossing card printed
   * "הסט שלך כאן לוקח בערך 3 שנ׳" with full confidence — three seconds is not a set, it is a
   * mis-measured gap, and a product whose whole claim is "I only state what I measured" cannot
   * afford one absurd sentence. Under 20s or over 5min the module stays silent and falls through
   * to the next true thing, which is this file's own founding rule.
   */
  if (execS != null && execS >= 20 && execS <= 300) return { kind: 'exec', value: Math.round(execS) };
  if (k.rungs.length > 0) {
    const peak = Math.max(...k.rungs); // asked of the values, not of the order — see `rungs` above
    if (peak > 0) return { kind: 'peak', value: peak };
  }
  const n = sessionsWithLift(history, exerciseId);
  /* TWO, not one. "You have done this once" is the app reading its own database back to her, which
     is the failure this whole module is written against. Two is the smallest number that describes
     a habit rather than an entry. */
  if (n >= 2) return { kind: 'sessions', value: n };
  return null;
}
