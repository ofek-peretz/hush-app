/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT A GOOD WEEK IS — written down once, and executable.
 *
 * ⛔ FOUNDER, 2026-08-12, after thirteen engine attempts had each fixed one number and broken
 * another: *"תעשה את שלב א'."*
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
 * The engine has never had a definition of its own output. "A good week" lived as roughly forty
 * assertions scattered across audit files, each re-deriving its own vocabulary — one counts weekly
 * sets, another counts lifts, a third counts them per day, and two of them disagreed about whether
 * an emphasised muscle is excluded from a comparison.
 *
 * The cost was not tidiness. It was that **no change could be measured before it shipped.** Every one
 * of the thirteen attempts optimised the number its author was looking at and discovered the
 * collateral damage afterwards, in a different file, sometimes days later. The scoreboard that would
 * have caught them was built by hand three times on 2026-08-12 alone and deleted each time.
 *
 * So this is the definition, in one place, as data. Every rule is a row; every row knows its own
 * threshold, its own subject, and what it measured. The audit files ask THIS rather than each
 * inventing its own reading, and any future change to the engine can be priced in one call.
 *
 * ── ⚠️ WHAT IT IS NOT ────────────────────────────────────────────────────────────────────────────
 * It is not a generator and it holds no opinion about HOW a week should be built. It reads a
 * finished week and says which of the stated rules it breaks. That separation is the point: the
 * thing that decides and the thing that judges must not be the same code, or a bug in the first
 * silently becomes the standard for the second.
 *
 * ⚠️ AND IT NEVER INVENTS A THRESHOLD. Every number here comes from `engine/v5/constants`, where it
 * is declared and tagged against the register (L5). A rule that needed a new number would need a
 * ratified constant first.
 *
 * Pure and I/O-free.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  CANONICAL_MUSCLE_ORDER,
  MUSCLE_VOLUME_SHARE,
  SESSION_MIN,
  SESSION_MAX,
  SETS_MIN,
  SETS_MAX,
  WEEKLY_SETS_FLOOR,
  WEEKLY_SETS_CEILING,
} from '@/engine/v5/constants';
import { regionOf } from '@/engine/v5/assembler';
import { exerciseById, muscleOf } from '@/data/exercises';
import { estimateSessionMinutes, weeklyEffectiveSets } from '@/data/api/fixtureModel';
import type { MuscleStance, Program, ProgramDay } from '@/data/local/models';

/**
 * Every rule the engine's output is held to.
 *
 * ⚠️ THE NAMES ARE THE VOCABULARY. A finding names its rule, and that name is what a report groups
 * by, what a repair pass targets, and what a red test prints — so they are stable strings and not
 * free text.
 */
export type WeekRule =
  /** F-15 · a session is 45–60 minutes, unless the engine has SAID it could not manage that. */
  | 'session_length'
  /** F-1 · a block is three to five sets. */
  | 'set_count'
  /** S-2 · a muscle she switched off never appears. */
  | 'muscle_switched_off'
  /** B-2 · a muscle she trains is at or above the minimum effective dose. */
  | 'under_dose'
  /** B-2 · …and never past the ceiling, which is junk volume she pays the hour for. */
  | 'over_ceiling'
  /** The best-supported number in the literature: a muscle is trained twice a week where days allow. */
  | 'trained_once'
  /** A muscle's lifts are spread across its days, never piled onto one. */
  | 'clumped'
  /** A day never repeats a muscle's movement. */
  | 'repeated_pattern'
  /** The share table's whole purpose: a bigger share never delivers less than a smaller one. */
  | 'share_inversion'
  /** The imbalance a coach names first, where she has not asked for more pushing. */
  | 'push_pull';

export interface WeekFinding {
  rule: WeekRule;
  /** The muscle, or the day, the finding is about — whatever a reader would name it by. */
  subject: string;
  /** What was measured, and what the rule allows. Both, always: a number alone explains nothing. */
  measured: number;
  limit: number;
  /** A second subject when the rule compares two things (share inversions). */
  against?: string;
  /**
   * ⛔ THE RULE IS BROKEN AND NO ARRANGEMENT COULD HAVE KEPT IT — the shortage is in her inputs.
   *
   * ⚠️ THIS DISTINCTION IS THE MOST IMPORTANT THING IN THIS FILE, and the first cut did not have it.
   * The sweep came back with 158 muscles under the effective dose and every single one was a TWO-DAY
   * week: two sessions hold about 49 working sets, nine muscles need 54 to reach the dose, and no
   * dealer, cap or repair can conjure the difference. Counting those as engine defects would send
   * every future reader hunting a bug in the arrangement when the arithmetic is the whole story.
   *
   * It is the same distinction `overBudget` / `shortOfBudget` already make about her hour, and it
   * has the same consequence: an unavoidable finding is not something to FIX, it is something to
   * TELL HER — with the remedy, which is hers (a day more, or a muscle off).
   */
  unavoidable?: true;
}

/** The inputs the week was BUILT from — the rules about her choices cannot be checked without them. */
export interface WeekInputs {
  bodyMap?: Record<string, MuscleStance>;
  daysPerWeek?: number;
  /**
   * ⛔ HOW THIS WEEK IS PRICED — and it belongs here, with her other facts (2026-08-18).
   *
   * `minutesOf` used to be a third ARGUMENT of `weekFindings`, defaulted to the bare
   * `estimateSessionMinutes`. Nothing ever passed it, so the judge priced every day with the
   * day-one bootstrap — the 150-second compound rest — while the assembler priced the same day
   * with her MEASURED rest and set duration (S-17 / B-4). An athlete who rests 90 seconds had her
   * week judged, and then REPAIRED, against a session the engine had already fitted inside her hour.
   *
   * ⚠️ IT IS AN INPUT, NOT A PARAMETER, because `weekRepair` re-judges the board on every candidate
   * move through three call layers — `repairWeek`, `attemptRepair`, `tradeOn`/`dropASet` — and a
   * positional argument forgotten at any one of them silently restores the bootstrap. `inputs`
   * already travels all four; the clock travels with it.
   *
   * ⚠️ AND THE DEFAULT IS A CHOICE, NOT AN ACCIDENT. Where a caller genuinely has no learned data —
   * a cold start, or a pure unit test handed a hand-built week — the bootstrap is the honest price:
   * it is the same estimate the engine itself uses for an athlete who has logged nothing.
   */
  minutesOf?: (d: ProgramDay) => number;
}

const workoutsOf = (p: Program) => p.days.filter((d) => !d.isRest && d.slots.length > 0);

/**
 * Weekly sets per muscle, as the week PRESCRIBES them — the rows she can count on her cards.
 *
 * ⚠️ NOT WHAT SHE RECEIVES, and the old one-liner here said it was. That is `weeklyEffectiveSets`,
 * which adds what every compound lends the muscles it also drives (`indirectMusclesOf`). The two are
 * different questions and both are needed: a switched-off muscle is judged on what she is GIVEN (a
 * row still feeds the biceps she turned off, and that is not the engine disobeying her), while the
 * minimum effective dose is judged on what she RECEIVES. Which reading each rule takes is stated at
 * the rule.
 */
export function weeklySets(p: Program): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of workoutsOf(p))
    for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      if (m) out[m] = (out[m] ?? 0) + s.setCount;
    }
  return out;
}

/** How many DAYS a muscle appears on. */
function daysPerMuscle(p: Program): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of workoutsOf(p))
    for (const m of new Set(d.slots.map((s) => muscleOf(s.exerciseId))))
      if (m) out[m] = (out[m] ?? 0) + 1;
  return out;
}

/** How many LIFTS a muscle has on each day it appears on. */
function liftsPerMusclePerDay(p: Program): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const d of workoutsOf(p)) {
    const n: Record<string, number> = {};
    for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      if (m) n[m] = (n[m] ?? 0) + 1;
    }
    for (const m of Object.keys(n)) (out[m] ??= []).push(n[m]);
  }
  return out;
}

/**
 * Every rule this week breaks, in a stable order.
 *
 * ⚠️ CORE IS EXCLUDED FROM THE VOLUME RULES THROUGHOUT, and that is not an oversight. It is
 * supplemental by construction — `weeklyTargets` deletes it before the week's volume is shared out,
 * and `addWeeklyCore` attaches it afterwards — so measuring it against a dose or a share would be
 * holding it to a standard nothing ever aimed it at.
 */
export function weekFindings(
  program: Program | null | undefined,
  inputs: WeekInputs = {},
): WeekFinding[] {
  if (!program) return [];
  const found: WeekFinding[] = [];
  const days = workoutsOf(program);
  // The bootstrap only where she has given us nothing to price with — see `WeekInputs.minutesOf`.
  const minutesOf = inputs.minutesOf ?? estimateSessionMinutes;
  const sets = weeklySets(program);
  /*
   * ⛔ AND WHAT SHE RECEIVES, FROM THE ENGINE'S OWN FUNCTION (2026-08-18).
   *
   * `weeklyEffectiveSets` is the accounting `raiseToWeeklyFloor` spends her minutes on — the same
   * call, not a reading of the same rule. Before this, the floor pass counted a row as biceps work
   * and this file did not, so the board reported a muscle under the dose that the engine had decided
   * was fed, no regeneration could ever clear it, and HOME printed the complaint every morning.
   */
  const received = weeklyEffectiveSets(days);
  const onDays = daysPerMuscle(program);
  const perDay = liftsPerMusclePerDay(program);
  const stance = (m: string) => inputs.bodyMap?.[m] ?? 'normal';
  const structural = CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Core');

  /* ── the day ───────────────────────────────────────────────────────────────────────────────── */
  for (const d of days) {
    const mins = minutesOf(d);
    /*
     * ⚠️ THE TWO VERDICTS ARE AN EXEMPTION, NOT A LOOSENED THRESHOLD. `overBudget` and
     * `shortOfBudget` are the engine SAYING it could not fit or fill her minutes (S-3), and a day
     * carrying one has already been reported to her in words. Counting it again here would make the
     * scoreboard punish the engine for being honest.
     */
    if (mins > SESSION_MAX && !d.overBudget) found.push({ rule: 'session_length', subject: d.name, measured: Math.round(mins), limit: SESSION_MAX });
    if (mins < SESSION_MIN && !d.shortOfBudget) found.push({ rule: 'session_length', subject: d.name, measured: Math.round(mins), limit: SESSION_MIN });

    for (const s of d.slots) {
      if (s.setCount < SETS_MIN) found.push({ rule: 'set_count', subject: `${d.name}/${s.exerciseId}`, measured: s.setCount, limit: SETS_MIN });
      if (s.setCount > SETS_MAX) found.push({ rule: 'set_count', subject: `${d.name}/${s.exerciseId}`, measured: s.setCount, limit: SETS_MAX });
    }

    // A day never trains one muscle's movement twice — a back squat then a hack squat is the same
    // movement twice while the lunge sits on the other day.
    const seen = new Set<string>();
    for (const s of d.slots) {
      const ex = exerciseById(s.exerciseId);
      if (!ex) continue;
      const key = `${ex.muscle}/${ex.pattern}`;
      if (seen.has(key)) found.push({ rule: 'repeated_pattern', subject: `${d.name}/${key}`, measured: 2, limit: 1 });
      seen.add(key);
    }
  }

  /*
   * ⛔ COULD THE DOSE HAVE BEEN REACHED AT ALL? Derived, not a day threshold.
   *
   * The week delivers a fixed number of working sets — that is what her days and her hour buy. If
   * that total is smaller than `WEEKLY_SETS_FLOOR × the muscles she trains`, then SOME muscle is
   * under the dose in every possible arrangement, and calling it an engine defect is calling
   * arithmetic a bug. Measured: a two-day week delivers ~49 sets and nine muscles need 54.
   *
   * ⚠️ IT IS COMPUTED FROM WHAT THE WEEK ACTUALLY DELIVERS, not from a formula about capacity — so
   * it stays true if the hour, the set range or the lift limit ever change.
   *
   * ⛔ AND IT IS COUNTED IN PRESCRIBED SETS WHILE THE DOSE ITSELF IS JUDGED ON RECEIVED ONES. That
   * looks like the very split this file just closed and it is the opposite of it — it is deliberate,
   * and it is about which quantity is CONSERVED (2026-08-18).
   *
   * The only moves anything downstream can make are "move a set" and "drop a set". A set moved
   * between two lifts is exactly one prescribed set either way, so the prescribed total is a
   * conservation law and a bound built on it cannot lie. Effective volume is NOT conserved by the
   * same move: carry a set off a compound onto an isolation and half a set of indirect work simply
   * ceases to exist. A bound built on it would claim an arrangement exists that no move can reach.
   *
   * So this stays a SUFFICIENT test for impossibility, never a necessary one. A muscle that is short
   * because the compounds feeding it sit on the wrong day is still reported as a defect — and it
   * should be, because that one IS arrangement, and arrangement is the engine's job.
   */
  const trainedMuscles = structural.filter((m) => (sets[m] ?? 0) > 0);
  const totalSets = trainedMuscles.reduce((n, m) => n + (sets[m] ?? 0), 0);
  const doseImpossible = totalSets < WEEKLY_SETS_FLOOR * trainedMuscles.length;

  /* ── the muscle ────────────────────────────────────────────────────────────────────────────── */
  for (const m of CANONICAL_MUSCLE_ORDER) {
    const got = sets[m] ?? 0;
    /*
     * ⚠️ SWITCHED OFF IS ASKED OF WHAT SHE IS GIVEN, NEVER OF WHAT SHE RECEIVES. S-2 is a rule about
     * the engine's obedience: it must not PRESCRIBE a muscle she turned off. Her rows go on feeding
     * the biceps she switched off — that is simply true, `theVolumeAMuscleActuallyReceives` says so
     * out loud, and reading it here would flag every single week for a promise nobody broke.
     */
    if (stance(m) === 'off') {
      if (got > 0) found.push({ rule: 'muscle_switched_off', subject: m, measured: got, limit: 0 });
      continue;
    }
    if (m === 'Core' || got === 0) continue;
    /*
     * ⛔ THE DOSE IS ASKED OF WHAT SHE RECEIVES — the engine's own number (2026-08-18).
     *
     * `raiseToWeeklyFloor` decides a muscle is fed at direct sets PLUS half a set from every compound
     * that also drives it, and it will not spend another minute of her hour on a muscle that clears
     * that. This rule asked the same question of direct sets alone, so it reported a shortfall the
     * engine had already refused to act on: Biceps at 4 direct and 7.5 received read as under MEV,
     * `weekRepair` was sent hunting a set for it, and `weekNotice` printed the complaint on HOME
     * every morning of a week that was never going to change.
     *
     * ⚠️ THE CEILING BELOW STAYS ON PRESCRIBED SETS, AND THAT IS NOT AN INCONSISTENCY. Past the
     * ceiling is junk volume she PAYS THE HOUR FOR, and she pays for the sets she is told to
     * perform — indirect work costs no extra minute, so charging it against a ceiling about her time
     * would flag a week for volume it never asked her to do.
     */
    if ((received[m] ?? 0) < WEEKLY_SETS_FLOOR)
      found.push({ rule: 'under_dose', subject: m, measured: received[m] ?? 0, limit: WEEKLY_SETS_FLOOR, ...(doseImpossible ? { unavoidable: true } : {}) });
    if (got > WEEKLY_SETS_CEILING) found.push({ rule: 'over_ceiling', subject: m, measured: got, limit: WEEKLY_SETS_CEILING });
    /*
     * Twice a week grows roughly 63% more at equal volume, which is why a low-frequency week is
     * full-body rather than split. It is only ASKED where the week has the days for it — at two days
     * a nine-muscle body physically cannot reach it, and the engine's answer there is the full-body
     * shape, not a violation.
     */
    if ((inputs.daysPerWeek ?? days.length) >= 3 && (onDays[m] ?? 0) < 2)
      found.push({ rule: 'trained_once', subject: m, measured: onDays[m] ?? 0, limit: 2 });

    const counts = perDay[m] ?? [];
    if (counts.length >= 2) {
      const spread = Math.max(...counts) - Math.min(...counts);
      if (spread > 1) found.push({ rule: 'clumped', subject: m, measured: spread, limit: 1 });
    }
  }

  /* ── the week's proportions ────────────────────────────────────────────────────────────────── */
  /*
   * ⚠️ A MARKED MUSCLE IS EXCLUDED FROM BOTH SIDES, AND IT IS EXCLUDED BY HER STANCE — not by the
   * "delivered more than its target" proxy two of the audit files used. That proxy was wrong in both
   * directions: a mark whose volume the clock ate reads as unmarked, and an ordinary muscle that
   * happens to land above target reads as marked. A mark is a fact about her map.
   */
  const comparable = structural.filter((m) => stance(m) === 'normal' && (sets[m] ?? 0) > 0);
  for (const big of comparable)
    for (const small of comparable) {
      // Compared only where the gap is CLEAR, so ordinary rounding between neighbours (Chest 1.3 vs
      // Hamstrings 1.2) is not read as the table being thrown away.
      if ((MUSCLE_VOLUME_SHARE[big] ?? 1) - (MUSCLE_VOLUME_SHARE[small] ?? 1) < 0.3) continue;
      /*
       * ⛔ AND BY MORE THAN ONE SET, WHICH IS THE ENGINE'S OWN RESOLUTION.
       *
       * ⚠️ Added after the first sweep, and it is materiality rather than leniency. F-1 prescribes a
       * block at three to five sets, so ONE set is finer than any decision the engine is able to
       * make — "Glutes 3, Triceps 4" at two days is not the share table being overruled, it is two
       * muscles that each got one block. Of 177 raw inversions, most were exactly one set, and
       * treating them as defects would send a reader looking for a cause that does not exist.
       *
       * A two-set gap cannot be a rounding artefact: it is at least a whole block of difference.
       */
      if ((sets[small] ?? 0) - (sets[big] ?? 0) < 2) continue;
      found.push({ rule: 'share_inversion', subject: big, against: small, measured: sets[small] ?? 0, limit: sets[big] ?? 0 });
    }

  /*
   * ⚠️ PUSH:PULL IS MEASURED BY CAPABILITY, so each set is counted exactly once. Adding indirect
   * volume to both sides double-counts — a bench press set becomes 1 for Chest and 0.5 for Triceps
   * and BOTH sit on the push side — which made the defect look almost solved when it was not.
   *
   * ⚠️ And it is not asked where she ASKED for more pushing: a mark on Chest or Shoulders is the
   * athlete overriding the balance on purpose (S-4), and that is the mark working.
   */
  /*
   * ⛔ AND SWITCHING OFF A PULLING MUSCLE IS THE SAME REQUEST, FROM THE OTHER SIDE.
   *
   * ⚠️ Added after the first sweep, which found five breaches and every one of them carried
   * `Biceps: 'off'`. Turning the biceps off removes pulling volume by her own instruction, and then
   * flagging the week for having too little pulling is the app arguing with a choice she made — the
   * exact asymmetry the existing emphasis exclusion exists to avoid. A rule that excuses "she asked
   * for more push" and not "she asked for less pull" is not a rule about balance, it is half of one.
   */
  const askedForPush =
    ['Chest', 'Shoulders', 'Triceps'].some((m) => stance(m) === 'emphasis') ||
    ['Back', 'Biceps'].some((m) => stance(m) === 'off');
  const pullOn = ['Back', 'Biceps'].some((m) => (sets[m] ?? 0) > 0);
  if (!askedForPush && pullOn && days.length >= 3) {
    const push = ['Chest', 'Shoulders', 'Triceps'].reduce((n, m) => n + (sets[m] ?? 0), 0);
    const pull = ['Back', 'Biceps'].reduce((n, m) => n + (sets[m] ?? 0), 0);
    const ratio = push / Math.max(1, pull);
    if (ratio > PUSH_PULL_CEILING)
      found.push({ rule: 'push_pull', subject: 'week', measured: Number(ratio.toFixed(2)), limit: PUSH_PULL_CEILING });
  }

  return found;
}

/**
 * ⛔ THE ONE THRESHOLD THIS FILE OWNS, and it is a ratio rather than a count so it has no home in
 * `constants` (which holds the register's declared numbers). Above 2.0 the week reads as a push
 * programme with pulling on the side — the single most common criticism of a machine-written
 * hypertrophy plan, and the reason it is a rule at all. The share table itself asks for about 1.2.
 */
export const PUSH_PULL_CEILING = 2.0;

/** A finding, as one line a human reads. */
export function describeFinding(f: WeekFinding): string {
  switch (f.rule) {
    case 'share_inversion':
      return `${f.subject} (${f.limit} sets) under ${f.against} (${f.measured})`;
    case 'session_length':
      return `${f.subject}: ~${f.measured} min against ${f.limit}`;
    case 'push_pull':
      return `push:pull ${f.measured} against ${f.limit}`;
    default:
      return `${f.subject}: ${f.measured} against ${f.limit}`;
  }
}

/**
 * ⛔ HOW FAR THIS FINDING IS FROM THE RULE — and why a COUNT was not enough.
 *
 * ⚠️ ADDED AFTER THE FIRST REPAIR RUN, WHICH MADE TWO REPAIRS IN 270 WEEKS. The repair pass accepted
 * a move only if the number of broken rules FELL, and almost no single move can do that: a share
 * inversion of Back 9 against Hamstrings 14 is five sets deep, so moving one set leaves Back 10
 * against 13 — still broken, still counted, and the move was thrown away. The pass could see the
 * summit and not the slope.
 *
 * Distance makes the slope visible. One set moved closes a five-set gap to three, which is progress
 * a count cannot express, and the same move is still refused if it makes any other distance grow.
 */
export function severityOf(f: WeekFinding): number {
  switch (f.rule) {
    // How many sets the smaller share is ahead by.
    case 'share_inversion':
      return Math.max(0, f.measured - f.limit);
    // How far past the ceiling, or short of the dose.
    case 'over_ceiling':
      return Math.max(0, f.measured - f.limit);
    case 'under_dose':
      return Math.max(0, f.limit - f.measured);
    // Minutes outside her hour, either way.
    case 'session_length':
      return Math.abs(f.measured - f.limit);
    // Sets outside F-1, either way.
    case 'set_count':
      return Math.abs(f.measured - f.limit);
    /*
     * ⚠️ THE REST ARE STRUCTURAL AND CARRY A FLAT, HEAVY WEIGHT. A muscle she switched off appearing
     * at all, a day repeating a movement, a muscle trained once — these are not "a bit off", they
     * are wrong, and expressing them as a distance would let a repair trade one of them for a
     * couple of sets of proportion. Ten is larger than any set-level distance the board produces.
     */
    default:
      return 10;
  }
}

/** The whole board as one number — what a repair has to move DOWN. */
export function severity(findings: readonly WeekFinding[]): number {
  return findings.reduce((n, f) => n + severityOf(f), 0);
}

/** Only what the engine could have done better — the unavoidable is her arithmetic, not its work. */
export function defects(findings: readonly WeekFinding[]): WeekFinding[] {
  return findings.filter((f) => !f.unavoidable);
}

/** What no arrangement could have kept — the list she is owed a sentence about. */
export function unavoidable(findings: readonly WeekFinding[]): WeekFinding[] {
  return findings.filter((f) => f.unavoidable);
}

/** Findings grouped by rule — what a scoreboard prints. */
export function weekScore(findings: readonly WeekFinding[]): Record<WeekRule, number> {
  const out = {} as Record<WeekRule, number>;
  for (const f of findings) out[f.rule] = (out[f.rule] ?? 0) + 1;
  return out;
}

/** Add one week's score into a running total, so a sweep reads as one table. */
export function addScore(into: Partial<Record<WeekRule, number>>, findings: readonly WeekFinding[]): void {
  for (const f of findings) into[f.rule] = (into[f.rule] ?? 0) + 1;
}
