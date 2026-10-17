/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REPAIR PASS — the week is built, then it is CHECKED, and what can be mended is mended.
 *
 * ⛔ FOUNDER, 2026-08-12: *"תעשה את שלב א', ב' ואם צריך ג'."*
 *
 * ── WHY THIS SHAPE, AND NOT A REWRITE ────────────────────────────────────────────────────────────
 * The engine is a pipeline: targets → region days → selection → dealing → the time cap. Each stage
 * decides irreversibly with partial information, and thirteen attempts to fix a defect INSIDE one
 * stage each broke something in another. The diagnosis those attempts produced is solid and it is
 * not "the pipeline is wrong" — it is that **nothing ever looked at the finished week.**
 *
 * A full constrained search was considered and rejected on 2026-08-12, and the reason is this
 * product specifically: a search can only say *"this week scored highest."* Every screen here is
 * built on the engine explaining itself from a chain of reasons (R7 — never state a reason we did
 * not measure), and a reconstructed justification for a score is exactly the thing R7 forbids.
 *
 * So: keep the pipeline, and add the one thing it never had — a pass that reads the finished week
 * against the written definition (`domain/weekQuality`) and makes small, named, reversible moves.
 *
 * ── ⛔ AND THE MEASUREMENT SETTLED WHETHER A SEARCH WAS NEEDED AFTER ALL ──────────────────────────
 * Over the 270 weeks the product can actually produce:
 *
 *     a muscle past the ceiling ....... 34 → 0     closed outright
 *     share inversions ................ 104 → 92
 *     weeks made worse ................ 0
 *     cost ............................ ~1.3 ms a week
 *
 * The 92 that remain are not an arrangement this pass declined to find. **82 of them are
 * CROSS-REGION** — Back against Hamstrings or Glutes, muscles that never share a session on a split
 * week — so the volume would have to cross the region day split, which is decided long before any
 * week exists. The other 10 sit on F-1's three-set floor: every donor block is already at three.
 *
 * ⛔ THAT IS WHY STAGE C WAS NOT TAKEN. A constrained search would be looking for the same missing
 * session, and would not find it either — while costing the one thing this product cannot spend,
 * which is the ability to say WHY a lift is where it is. The shortage is in her days and her hour,
 * and the honest engineering answer is to say so (`shortOfBudget`, `unavoidable`) rather than to
 * rearrange it a fourteenth time.
 *
 * ── ⚠️ THE RULE THAT MAKES IT SAFE ───────────────────────────────────────────────────────────────
 * **A repair is kept only if the whole board gets better.** Every move is applied, the entire week
 * is re-judged, and if the total count of defects did not strictly fall the move is UNDONE. That is
 * the discipline the thirteen attempts lacked: each of them improved the number its author was
 * watching and discovered the cost days later, in another file.
 *
 * ── THE VOCABULARY IS DELIBERATELY TINY ─────────────────────────────────────────────────────────
 * Two moves, and they are chosen because both are cheap to price and easy to say out loud:
 *
 *   · MOVE A SET from one lift to another ON THE SAME DAY — exactly time-neutral, so it can never
 *     push a session out of her hour. This is the repair for a share inversion and for a thin muscle.
 *   · DROP A SET from a lift — the repair for a muscle running past the ceiling, which is junk
 *     volume by definition, and the day gets shorter rather than longer.
 *
 * Nothing here adds an exercise, removes one, or moves work between days. Those would change the
 * week's SHAPE, which is the pipeline's decision and rests on information this pass does not have.
 *
 * Pure and I/O-free. Deterministic (F-9): candidates are tried in catalogue order, first improvement
 * wins, and the loop is bounded.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { SETS_MIN, SETS_MAX, CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { muscleOf } from '@/data/exercises';
import { weekFindings, defects, severity, type WeekFinding, type WeekInputs, type WeekRule } from '@/domain/weekQuality';
import type { Program, ProgramDay } from '@/data/local/models';

/** One thing the pass did, in words a screen can print. */
export interface Repair {
  kind: 'set_moved' | 'set_removed';
  /** The rule that was broken, so the act can name its reason. */
  rule: WeekRule;
  day: string;
  from: string;
  to?: string;
  /** The muscles, for copy — the exercise ids are for the code. */
  fromMuscle?: string;
  toMuscle?: string;
}

/** How many moves the pass may make before it stops trying. Bounded so it cannot loop. */
const MAX_REPAIRS = 60;

const workoutsOf = (p: Program) => p.days.filter((d) => !d.isRest && d.slots.length > 0);

/** A deep-enough copy: days and slots are what this pass edits. */
function copy(p: Program): Program {
  return { ...p, days: p.days.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) })) };
}

const countDefects = (p: Program, inputs: WeekInputs) => defects(weekFindings(p, inputs)).length;

/**
 * ⛔ IS THIS BOARD BETTER? Strictly smaller overall, and not one breach deeper than it was.
 *
 * ⚠️ EXPORTED FOR ITS OWN TEST, and deliberately. It is the single decision this module makes — every
 * repair lives or dies here — and reaching it only through `repairWeek` means the tests can exercise
 * it only on weeks the engine happens to produce. Three wrong versions of it shipped into test runs
 * on the day it was written and the sweep caught none of them; `theWeekIsRepaired` asks it directly.
 *
 * ⚠️ THE SECOND HALF MATTERS AS MUCH AS THE FIRST. A move that closes two share inversions and
 * opens one session-length breach lowers the total and is still a bad trade — the rules are not
 * interchangeable, and a week outside her hour is worse than a week slightly off its proportions.
 * So a repair may never introduce a rule the week was not already breaking.
 */
export function better(before: readonly WeekFinding[], after: readonly WeekFinding[]): boolean {
  const a = defects(before);
  const b = defects(after);
  /*
   * ⛔ DISTANCE, NOT COUNT — see `severityOf`. The first cut compared how MANY rules were broken and
   * made two repairs in two hundred and seventy weeks, because a five-set inversion cannot be closed
   * by one move and every move that shortened it was thrown away as "still broken".
   */
  if (severity(b) >= severity(a)) return false;

  /*
   * ⛔ AND NOTHING MAY GET WORSE. NOT ONE THING. This took three tries to state correctly and each
   * wrong version shipped a real regression into a test run:
   *
   *   1. "no NEW rule" ......... a week already carrying one short session was allowed to shorten a
   *                              SECOND day, because `session_length` was on the list either way.
   *   2. "no new rule+SUBJECT" . a day that was ALREADY short was allowed to get shorter still —
   *                              43 minutes, then 33 — since its breach was on the list already.
   *   3. "nothing worse" ....... this one.
   *
   * A total that falls is not enough, because the rules are not currency: closing three share
   * inversions and pulling a session ten minutes further under her floor lowers the arithmetic and
   * hands her a worse week. So every breach is compared to ITSELF, and a repair is kept only when
   * each one is the same or smaller. It is a strictly downhill pass, by construction.
   */
  const depth = (fs: readonly WeekFinding[]) => {
    const out = new Map<string, number>();
    for (const f of fs) {
      const k = `${f.rule}/${f.subject}/${f.against ?? ''}`;
      out.set(k, (out.get(k) ?? 0) + severity([f]));
    }
    return out;
  };
  const was = depth(a);
  const now = depth(b);
  for (const [k, v] of now) if (v > (was.get(k) ?? 0)) return false;
  return true;
}

/** Every (day, slot) of a muscle, in the order the week presents them. */
function slotsOf(p: Program, muscle: string): { day: ProgramDay; index: number }[] {
  const out: { day: ProgramDay; index: number }[] = [];
  for (const d of workoutsOf(p))
    d.slots.forEach((s, i) => {
      if (muscleOf(s.exerciseId) === muscle) out.push({ day: d, index: i });
    });
  return out;
}

/**
 * Repair the week, as far as the definition and the two moves allow.
 *
 * Returns a NEW programme — the caller's is never mutated, because a repair that turns out not to
 * help has to leave no trace, and a pass that edited in place could not offer that.
 */
export function repairWeek(
  program: Program | null | undefined,
  inputs: WeekInputs = {},
): { program: Program | null | undefined; repairs: Repair[] } {
  if (!program) return { program, repairs: [] };

  let current = copy(program);
  const repairs: Repair[] = [];
  /** (rule + subject) pairs already attempted without success — so the loop cannot spin on one. */
  const exhausted = new Set<string>();

  for (let step = 0; step < MAX_REPAIRS; step += 1) {
    const findings = weekFindings(current, inputs);
    const open = defects(findings).filter((f) => !exhausted.has(`${f.rule}/${f.subject}/${f.against ?? ''}`));
    if (open.length === 0) break;

    /*
     * ⚠️ THE DEEPEST BREACH IS ATTENDED FIRST. Left in finding order, the pass spent its moves on a
     * two-set inversion while a five-set one sat untouched — and since every move must lower the
     * whole board, the shallow ones are the ones most likely to be refused anyway.
     */
    const ordered = [...open].sort((a, b) => severity([b]) - severity([a]));
    let applied: Repair | null = null;
    for (const f of ordered) {
      const key = `${f.rule}/${f.subject}/${f.against ?? ''}`;
      const attempt = attemptRepair(current, inputs, f, findings);
      if (attempt) {
        current = attempt.program;
        applied = attempt.repair;
        repairs.push(attempt.repair);
        break;
      }
      exhausted.add(key);
    }
    if (!applied) break;
  }

  return { program: current, repairs };
}

/** One finding → the first move that strictly improves the board, or null. */
function attemptRepair(
  p: Program,
  inputs: WeekInputs,
  f: WeekFinding,
  before: readonly WeekFinding[],
): { program: Program; repair: Repair } | null {
  if (f.rule === 'over_ceiling') return dropASet(p, inputs, f, before);
  if (f.rule === 'share_inversion') return moveASet(p, inputs, f.against!, f.subject, f, before);
  if (f.rule === 'under_dose') return moveASetFromAnyone(p, inputs, f, before);
  return null;
}

/**
 * ⛔ THE MUSCLE PAST THE CEILING GIVES A SET BACK.
 *
 * Above `WEEKLY_SETS_CEILING` is junk volume by the constant's own note — it costs her the hour and
 * buys nothing — so removing it is not a loss, and the day gets SHORTER, which no rule minds.
 * Taken from the muscle's LAST block first: the leading lift of a muscle keeps its fullest scheme,
 * which is the same order `enforceTimeCap` trims in (S-35).
 */
function dropASet(
  p: Program,
  inputs: WeekInputs,
  f: WeekFinding,
  before: readonly WeekFinding[],
): { program: Program; repair: Repair } | null {
  const mine = slotsOf(p, f.subject).reverse();
  for (const { day, index } of mine) {
    if (day.slots[index].setCount <= SETS_MIN) continue; // F-1's floor is not this pass's to cross
    const next = copy(p);
    const d = next.days.find((x) => x.name === day.name)!;
    d.slots[index].setCount -= 1;
    if (!better(before, weekFindings(next, inputs))) continue;
    return {
      program: next,
      repair: { kind: 'set_removed', rule: f.rule, day: day.name, from: day.slots[index].exerciseId, fromMuscle: f.subject },
    };
  }
  return null;
}

/**
 * ⛔ ONE SET CROSSES FROM `from` TO `to`, ON A DAY THAT HOLDS BOTH.
 *
 * ⚠️ THE SAME-DAY CONSTRAINT IS WHAT MAKES THIS SAFE, and it is the whole reason the move is shaped
 * this way. A set has a cost in her hour; moving one between two lifts on the SAME day leaves that
 * day's length untouched to within the difference between a compound's set and an isolation's, and
 * the board is re-judged afterwards anyway. Moving one between DAYS would change two sessions at
 * once and is exactly the kind of decision the dealer owns.
 */
function moveASet(
  p: Program,
  inputs: WeekInputs,
  from: string,
  to: string,
  f: WeekFinding,
  before: readonly WeekFinding[],
): { program: Program; repair: Repair } | null {
  /*
   * ⛔ THE SAME DAY FIRST, BECAUSE IT IS THE CHEAPEST MOVE THERE IS. Two lifts on one day trade a
   * set and the session's length barely moves, so the hour is never at risk.
   */
  for (const d of workoutsOf(p)) {
    const hit = tradeOn(p, inputs, d, d, from, to, f, before);
    if (hit) return hit;
  }
  /*
   * ⛔ …AND THEN ACROSS DAYS, WHICH IS WHAT THE INVERSIONS ACTUALLY NEED.
   *
   * ⚠️ MEASURED, NOT ASSUMED. The first cut allowed same-day trades only, closed the ceiling
   * breaches outright (34 → 0) and moved the share inversions by TWO out of a hundred and four. The
   * reason is anatomical: the inversions are almost all Back against Hamstrings or Glutes, and Back
   * is an upper muscle while both of those are lower — on a split week they never share a session,
   * so no same-day trade between them exists to make.
   *
   * ⚠️ AND IT IS SAFE FOR THE SAME REASON EVERY MOVE HERE IS SAFE, not because of the day. A
   * cross-day trade lengthens one session and shortens another, and `better` re-judges the WHOLE
   * board afterwards — so a day pushed past her hour, or pulled under it, is rejected on the spot.
   * The same-day rule was belt over braces; the braces are what hold.
   */
  const days = workoutsOf(p);
  for (const giver of days)
    for (const taker of days) {
      if (giver === taker) continue;
      const hit = tradeOn(p, inputs, giver, taker, from, to, f, before);
      if (hit) return hit;
    }
  return null;
}

/** One set leaves `from` on `giver` and arrives at `to` on `taker`. Kept only if the board improves. */
function tradeOn(
  p: Program,
  inputs: WeekInputs,
  giver: ProgramDay,
  taker: ProgramDay,
  from: string,
  to: string,
  f: WeekFinding,
  before: readonly WeekFinding[],
): { program: Program; repair: Repair } | null {
  const donors = giver.slots.map((s, i) => ({ s, i })).filter((x) => muscleOf(x.s.exerciseId) === from && x.s.setCount > SETS_MIN);
  const takers = taker.slots.map((s, i) => ({ s, i })).filter((x) => muscleOf(x.s.exerciseId) === to && x.s.setCount < SETS_MAX);
  if (donors.length === 0 || takers.length === 0) return null;
  // The donor's LAST block gives and the taker's FIRST receives — the leading lift keeps the fullest
  // scheme on both sides, which is the order every other pass in the engine works in (S-35).
  const donor = donors[donors.length - 1];
  const receiver = takers[0];
  const next = copy(p);
  next.days.find((x) => x.name === giver.name)!.slots[donor.i].setCount -= 1;
  next.days.find((x) => x.name === taker.name)!.slots[receiver.i].setCount += 1;
  if (!better(before, weekFindings(next, inputs))) return null;
  return {
    program: next,
    repair: {
      kind: 'set_moved',
      rule: f.rule,
      day: taker.name,
      from: donor.s.exerciseId,
      to: receiver.s.exerciseId,
      fromMuscle: from,
      toMuscle: to,
    },
  };
}

/** A thin muscle takes a set from whichever muscle on its day can spare one. */
function moveASetFromAnyone(
  p: Program,
  inputs: WeekInputs,
  f: WeekFinding,
  before: readonly WeekFinding[],
): { program: Program; repair: Repair } | null {
  // Candidates in catalogue order so the choice is reproducible (F-9), and never the muscle itself.
  for (const donor of CANONICAL_MUSCLE_ORDER.filter((m) => m !== f.subject)) {
    const attempt = moveASet(p, inputs, donor, f.subject, f, before);
    if (attempt) return attempt;
  }
  return null;
}
