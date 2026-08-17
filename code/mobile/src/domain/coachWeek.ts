/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH WEEK — what the surfaces read once the coach owns the programme.
 *
 * The coach decides, `db.saveCoachPlan` stores it whole, and this is how a screen asks what is in
 * it. It is the counterpart to `homePlan`, which does the same job for the engine's `ProgramDay`.
 *
 * ── WHY A SECOND READ MODEL AND NOT A CONVERSION ────────────────────────────────────────────────
 * The cheap move is to translate a `CoachPlan` into `Program`/`ProgramDay`/`Slot` and let every
 * existing surface carry on unchanged. It cannot be done honestly. A `Slot` is
 * `{ capability, exerciseId, setCount }` — a 5 km run has no home in it, a 45-second plank has no
 * home in it, and `say` (the coach's execution instruction, the one thing the app could never carry
 * before this layer) is dropped on the floor. A conversion would silently delete three of the four
 * shapes, quietly, in a function that looked like plumbing.
 *
 * So the plan stays whole and the READ widens. `CoachRow` can describe any of the four shapes,
 * which is the entire point of having had four.
 *
 * ── WHAT IS NOT ESTIMATED HERE ──────────────────────────────────────────────────────────────────
 * A session's minutes are counted only from work whose duration is KNOWN — reps and held time. A
 * distance cannot be turned into minutes without a pace, and this app does not guess: inventing a
 * pace to fill a number would be the engine forming an opinion, which is exactly what the AI layer
 * removed. So `minutes` reports what is countable and `hasUncountedWork` says the rest exists.
 * A screen can then say "45 min, plus the run" instead of a confident lie.
 *
 * Pure and I/O-free. Knows nothing about storage, the model, or any screen.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { REST_TRANSITION_S, perSetSeconds } from './restPrescription';
import { exerciseDisplayName, exerciseById } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';
import type { CoachPlan, PlannedItem, PlannedSession, Weekday } from './coachPlan';

/**
 * ════ WHAT ONE SET COSTS, BESIDES ITS REST ════
 *
 * ⛔ FOUNDER, ON BUILD 41: *"the home screen still shows about 35 minutes for a longer workout."*
 *
 * It was 40 seconds, described as "seconds a single rep-set takes to PERFORM". That is roughly right
 * for the lifting and roughly half of what the set actually costs her: she walks to the rack, loads
 * it or sets the pin, does the reps, racks it, and writes it down. None of that is rest, and none of
 * it was counted — so a six-exercise session came out at three quarters of its real length.
 *
 * 70 seconds is the set CYCLE minus its rest. It is still a constant and still a guess, but it is a
 * guess about the right thing.
 *
 * ⏸️ IT SHOULD BE MEASURED, AND IT CAN BE. Every `SetLog` carries `persistedAt`, so the gap between
 * consecutive sets minus the rest she actually took IS this number, per athlete — the same shape as
 * `restPrescription`, which already learns her median rest instead of assuming one. Left as a
 * constant because a new athlete has no history and would need one anyway; worth learning the day
 * the estimate matters more than it does now.
 */
const EXEC_S = 70;
/** Rest between rounds when the coach did not prescribe one. */
const DEFAULT_REST_S = 90;
/**
 * ⛔ WHAT IT COSTS TO GET FROM ONE EXERCISE TO THE NEXT (founder 2026-08-03):
 *
 *   > *"He gave a programme with 6 exercises — 4 sets on the first two and 3 on the rest — and says
 *   > the estimated time is about 35 minutes. Obviously that is never realistic."*
 *
 * He was right, and the number is OURS rather than the coach's — this function computes it. It
 * counted the work and the rest BETWEEN ROUNDS, and charged **zero** for the gap between one
 * exercise and the next: finding the rack, changing the plates, waiting for the machine, walking
 * across the floor. On his six-exercise session that is five transitions billed at nothing.
 *
 * `REST_TRANSITION_S` is the app's own answer to that question everywhere else — the tier the
 * session machine rests her for when she crosses from one lift to another, and the median it learns
 * from her actual sessions. Using anything else here would be a second opinion about the same gap.
 */

/** One workout in the coach's week, as a chip on Today would need it. */
export interface CoachWorkout {
  /**
   * Stable within a plan. Position-based, because the coach does not issue ids and two sessions may
   * legitimately share a name — "Upper" twice in a six-day week is a real programme, and matching
   * on the name would light both when one is chosen.
   */
  id: string;
  name: string;
  /** Present on programmes where the day matters (a long run belongs on Sunday); absent otherwise. */
  day?: Weekday;
  /** How many things she does, counting every round. What a chip's meta line says. */
  items: number;
  /** Minutes of work whose duration is known. See the header — never a guess. */
  minutes: number;
  /** There is work here that cannot be timed (a distance). `minutes` is a floor, not the total. */
  hasUncountedWork: boolean;
}

/** One line under a workout's name. Wide enough for all four shapes — that is why they exist. */
export interface CoachRow {
  ex: string;
  /** The lift's or movement's display name, resolved from whichever catalogue holds it. */
  name: string;
  kind: PlannedItem['kind'];
  /** How many times this item is done in its block. A set count, a lap count, a round count. */
  rounds: number;
  /** `reps` only — her band, `[lo, hi]`. */
  band?: [number, number];
  /** kg, or null for bodyweight. Absent when the shape carries no load at all. */
  load?: number | null;
  /** `time` only. */
  seconds?: number;
  /** `distance` only, in metres. */
  metres?: number;
  /** The coach's instruction for this item, in its own words. Never generated, never edited. */
  say?: string;
}

const movementName = new Map(MOVEMENTS.map((m) => [m.id, m.name]));

/** Whichever catalogue holds it. An id that resolves in neither cannot reach here — the parse refuses it. */
function nameOf(ex: string): string {
  return movementName.get(ex) ?? exerciseDisplayName(ex);
}

/** A session's id. Position-based; see `CoachWorkout.id`. */
export function coachWorkoutId(index: number): string {
  return `coach_${index}`;
}

/**
 * Minutes of countable work, and whether anything was left out.
 *
 * Counted per ROUND, because that is what she actually does: a block of two items done four times
 * is eight pieces of work and four rests, not two and one.
 */
/** The tier the day-one bootstrap prices by — the same question `fixtureModel` asks of a slot. */
function isCompound(exerciseId: string): boolean {
  return exerciseById(exerciseId)?.tier === 'compound';
}

function timeOf(session: PlannedSession, enginePriced = false): { minutes: number; hasUncountedWork: boolean } {
  let seconds = 0;
  let uncounted = false;
  for (const block of session.blocks) {
    /*
     * ⛔ A BLOCK THAT PRESCRIBES NO REST IS PRICED THE WAY THE ENGINE PRICES IT (2026-08-11).
     *
     * The engine's week arrives here with `restS` absent on every block — deliberately, because
     * `restAfterStep` reads that field as a PRESCRIPTION and the engine has never prescribed rest.
     * Priced at the flat `EXEC_S + DEFAULT_REST_S` below, Today announced sessions the engine had
     * capped at sixty minutes as sixty-six, because `enforceTimeCap` prices a set at the day-one
     * bootstrap (`COMPOUND_SET_MIN` / `ISOLATION_SET_MIN`) and this priced it at 160 seconds flat.
     *
     * Two answers to "how long is this session", and she could see both. So when nobody has said
     * what the rest is, this asks the one module that owns the number.
     *
     * ⚠️ AND THE BOOTSTRAP BUNDLES THE WALK, so a bootstrapped block is not charged a transition on
     * top — see the note on those constants. A block whose rest the COACH did state keeps the
     * arithmetic it has always had, unchanged, including the transition.
     */
    const bootstrap = enginePriced && block.restS == null;
    const rest = block.restS ?? DEFAULT_REST_S;
    for (const item of block.items) {
      if (item.kind === 'reps') {
        /*
         * ⛔ ONE ANSWER, NOT TWO — and this line is why the law exists twice over. `perSetSeconds`
         * is the engine's own arithmetic, so a change to what a set costs cannot reach the cap and
         * miss the screen. It did exactly that when the engine learned a one-sided set is performed
         * twice: `enforceTimeCap` charged for both legs, this did not, and Today disagreed with the
         * engine on eighteen sessions.
         *
         * The non-bootstrap branch keeps the coach's own stated rest, which is charged below.
         */
        seconds += bootstrap
          ? perSetSeconds(item.ex, { compound: isCompound(item.ex), restS: null, execS: null }) * block.rounds
          : EXEC_S * block.rounds;
      } else if (item.kind === 'time') seconds += item.seconds * block.rounds;
      // `distance` needs a pace we do not have, and `open` has no number by definition.
      else if (item.kind === 'distance') uncounted = true;
    }
    // Rest sits BETWEEN rounds, so a block of one round has none — the same rule `planRun` runs by.
    // A bootstrapped rep block has already paid for its rest inside the per-set figure above.
    const repsOnly = block.items.every((i) => i.kind === 'reps');
    if (!(bootstrap && repsOnly)) seconds += rest * Math.max(0, block.rounds - 1);
    /*
     * ⚠️ AND BETWEEN BLOCKS. `restAfterS` is what the COACH asked for after this block — usually
     * absent, and absent used to mean free. It is not free: she has to get to the next exercise.
     * The last block has nothing after it, so it is not charged.
     */
    const last = block === session.blocks[session.blocks.length - 1];
    seconds += block.restAfterS ?? (last || (bootstrap && repsOnly) ? 0 : REST_TRANSITION_S);
  }
  return { minutes: Math.round(seconds / 60), hasUncountedWork: uncounted };
}

/** The week, as chips. Order is the coach's own — a programme has a shape and this does not sort it. */
export function coachWeek(plan: CoachPlan | null | undefined): CoachWorkout[] {
  return (plan?.sessions ?? []).map((s, i) => ({
    id: coachWorkoutId(i),
    name: s.name,
    ...(s.day ? { day: s.day } : {}),
    items: s.blocks.reduce((n, b) => n + b.items.length * b.rounds, 0),
    ...timeOf(s, plan?.pricing === 'engine'),
  }));
}

/**
 * ════ THE WORKOUT THIS DAY IS FOR ════
 *
 * ⚠️ `day` WAS PARSED, STORED, SENT BACK TO THE COACH AND USED BY NOBODY. The schema has always let
 * a session name its weekday, the parse has always read it and the sheet has always returned it —
 * and every screen in the app treated the week as an unordered bucket of N. So a marathon plan that
 * says the long run belongs on Sunday was written, stored, and then handed to her on a Wednesday
 * because Wednesday was next in the list.
 *
 * A hypertrophy week genuinely does not care, which is why this went unnoticed: four sessions in
 * any order is the same week. An endurance plan is the opposite — the long run is on Sunday because
 * everything else is arranged around it, and moving it moves the plan.
 *
 * So: if any workout she has not done names TODAY, that is the one. Otherwise the next undone, which
 * is exactly what the app has always done. Nothing is ever withheld — a plan for Sunday can still be
 * trained on Friday by tapping its chip; this decides only what Today OFFERS.
 */
const WEEKDAY_OF: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function queuedWorkout(
  workouts: CoachWorkout[],
  doneIds: readonly string[],
  nowMs: number = Date.now(),
): CoachWorkout | null {
  const undone = workouts.filter((w) => !doneIds.includes(w.id));
  const today = WEEKDAY_OF[new Date(nowMs).getDay()];
  return undone.find((w) => w.day === today) ?? undone[0] ?? null;
}

/**
 * The rows under one workout's name.
 *
 * Every row is known SYNCHRONOUSLY. That is the difference from `homePlan`, whose loads are an
 * engine read in flight and whose rows had to carry a `pending` flag to stop Today collapsing on
 * every chip tap (founder A.12). Here the coach already decided the load and it is in the stored
 * plan — there is nothing to wait for, so there is no pending state to get wrong.
 */
export function coachRows(plan: CoachPlan | null | undefined, workoutId: string): CoachRow[] | null {
  const index = (plan?.sessions ?? []).findIndex((_, i) => coachWorkoutId(i) === workoutId);
  if (index < 0) return null;
  const session = plan!.sessions[index];

  const rows: CoachRow[] = [];
  for (const block of session.blocks) {
    for (const item of block.items) {
      rows.push({
        ex: item.ex,
        name: nameOf(item.ex),
        kind: item.kind,
        rounds: block.rounds,
        ...(item.kind === 'reps' ? { band: item.reps, load: item.load } : {}),
        ...(item.kind === 'time' ? { seconds: item.seconds, ...(item.load != null ? { load: item.load } : {}) } : {}),
        ...(item.kind === 'distance' ? { metres: item.metres, ...(item.load != null ? { load: item.load } : {}) } : {}),
        ...(item.say ? { say: item.say } : {}),
      });
    }
  }
  return rows;
}

/** The session itself, for the machine that runs it (`buildPlanFromCoach`). */
export function coachSession(plan: CoachPlan | null | undefined, workoutId: string): PlannedSession | null {
  const index = (plan?.sessions ?? []).findIndex((_, i) => coachWorkoutId(i) === workoutId);
  return index < 0 ? null : plan!.sessions[index];
}

/**
 * The coach's rows in the shape Today already prints.
 *
 * `HomePlanLift` was written for the engine's one shape — reps at a load — and its figure assembles
 * itself from `load` / `band` / `sets`. Three of the coach's four shapes cannot be said that way at
 * all, and forcing them through would print "0 · 4×0–0" on a 400 m repeat. So those arrive with
 * their figure ALREADY WRITTEN, in `detail`, and the row prints it verbatim.
 *
 * `reps` is not given a `detail` on purpose: it is exactly what the existing assembly is for, so it
 * keeps the load emphasis, the unit, and the moss/blue tone that says which way the coach moved it.
 * Two ways of printing the same thing is how two screens end up disagreeing about a number.
 *
 * ⚠️ `say` IS DELIBERATELY NOT SHOWN HERE. It is an execution instruction — "at a pace where you
 * could hold a conversation" — and it belongs where she reads it while doing the work, on the
 * stage. Printing it on an overview would put a paragraph on every row of Today.
 */
export function coachPlanRows(
  rows: CoachRow[] | null,
  units: 'kg' | 'lb',
): { exerciseId: string; name: string; load: number | null; sets: number; band: [number, number]; detail?: string }[] | null {
  if (!rows) return null;
  return rows.map((r) => {
    const base = { exerciseId: r.ex, name: r.name, sets: r.rounds, band: [0, 0] as [number, number] };
    switch (r.kind) {
      case 'reps':
        // The one shape the existing assembly already says correctly.
        return { ...base, load: r.load ?? null, band: r.band ?? [0, 0] };
      case 'time':
        return { ...base, load: null, detail: `${r.rounds}×${formatSeconds(r.seconds ?? 0)}` };
      case 'distance':
        return { ...base, load: null, detail: `${r.rounds}×${formatDistance(r.metres ?? 0, units)}` };
      case 'open':
        // No number worth stating — the founder's law: a control that says nothing says nothing.
        return { ...base, load: null, detail: '' };
    }
  });
}

/** "45s" under a minute, "2:30" above it — the way a stopwatch reads, not a spreadsheet. */
function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Metres below a kilometre; kilometres above it, or MILES for an athlete who reads in pounds.
 *
 * ⚠️ SHORT DISTANCES STAY IN METRES IN BOTH SYSTEMS, and that is not an oversight. A 400 m repeat
 * is 400 m on every track on earth, including American ones — converting it to "437 yd" replaces a
 * number she recognises with one nobody has ever run. The unit question only arises at the long
 * end, where 5 km and 3.1 mi are genuinely two different ways of saying it.
 *
 * The record is always metres. This is display, and display follows the athlete.
 */
function formatDistance(metres: number, units: 'kg' | 'lb'): string {
  if (metres < 1000) return `${metres} m`;
  return units === 'lb'
    ? `${Number((metres / 1609.344).toFixed(2))} mi`
    : `${Number((metres / 1000).toFixed(2))} km`;
}

/* ─────────────────────────────────────────────────────────────────────── WHICH WAY A LOAD MOVED */

/**
 * The direction each lift's load moved between two programmes.
 *
 * ⚠️ THIS IS DERIVED, NOT REPORTED, AND THAT DISTINCTION IS THE POINT. The engine could state a
 * direction because it computed a delta. The coach states a PROGRAMME — what she lifts next, not
 * which way it moved — so the direction is not in the answer and never will be.
 *
 * It is still a fact rather than a guess: it is the difference between two programmes the app
 * holds, both written by the same coach. Asking the coach to also state a direction would invite it
 * to state one that disagreed with its own numbers, and the founder's law
 * (`direction is a colour`) is precisely about surfaces not disagreeing.
 *
 * Only LIFTS, and only where both sides carry a load: a run has no direction, and a lift that was
 * not in the previous week has not moved — it has arrived, which is a different thing and is why
 * a new lift is absent here rather than marked as a raise.
 */
export function coachLoadDirections(
  now: CoachPlan | null | undefined,
  before: CoachPlan | null | undefined,
): Record<string, 'up' | 'down' | 'hold'> {
  if (!now || !before) return {};

  /** Every lift's load in a plan, first occurrence wins — a lift on two days is one prescription. */
  const loads = (plan: CoachPlan): Map<string, number> => {
    const out = new Map<string, number>();
    for (const session of plan.sessions) {
      for (const block of session.blocks) {
        for (const item of block.items) {
          if (item.kind !== 'reps' || item.load == null) continue;
          if (!out.has(item.ex)) out.set(item.ex, item.load);
        }
      }
    }
    return out;
  };

  const then = loads(before);
  const out: Record<string, 'up' | 'down' | 'hold'> = {};
  for (const [ex, load] of loads(now)) {
    const was = then.get(ex);
    if (was == null) continue; // arrived rather than moved
    // A float comparison, because loads are halves and quarters of a kilogram.
    out[ex] = Math.abs(load - was) < 1e-6 ? 'hold' : load > was ? 'up' : 'down';
  }
  return out;
}

/**
 * The case behind a lift the coach moved — what Today opens when she taps a lit load.
 *
 * The engine's version (`changedLiftCase`) assembled a three-part argument out of a stamped weekly
 * snapshot: the load it came from, the delta, the band, and the two sessions that made it. Most of
 * that is not the coach's to state — it writes a programme, not a delta — so the case is built from
 * what IS known: the two loads (the current plan and the one before it, which is where the direction
 * comes from too), her band, and the coach's own sentence.
 *
 * ⚠️ THE SESSIONS ARE LEFT EMPTY, and that is a real narrowing rather than an oversight. The engine
 * could name the two sessions that made a decision because it made the decision FROM them, by a rule
 * this app owned. The coach reads her whole record and answers in a sentence; picking two sessions
 * out of it afterwards and captioning them "these are why" would be this file inventing the argument
 * and attributing it. The sentence is the argument now.
 */
export function coachChangedCase(
  exerciseId: string,
  now: CoachPlan | null | undefined,
  before: CoachPlan | null | undefined,
  /**
   * The coach's own sentence about this lift, when it wrote one.
   *
   * ⛔ IT USED TO BE REQUIRED, AND THAT CLOSED THE SHEET ENTIRELY. `Home` skipped any lift with no
   * note, so a load that visibly MOVED could be tapped and nothing would open — she saw a number in
   * moss and had no way to find out why, which is the exact question the sheet exists to answer.
   *
   * The direction and the two loads are MEASURED — they come from comparing the coach's two
   * programmes, and they are true whether or not it also wrote prose. Only the closing line is the
   * coach's, so only the closing line is absent when it did not write one.
   */
  say: string | undefined,
  units: 'kg' | 'lb',
): {
  exerciseId: string;
  verdict: 'up' | 'down' | 'hold';
  from: string | null;
  to: string;
  unit: string;
  delta: string | null;
  band: [number, number];
  /** The coach's closing sentence. Empty when it decided without writing one — see `say` above. */
  line: { text: string };
  sessions: never[];
} | null {
  const find = (plan: CoachPlan | null | undefined) => {
    for (const session of plan?.sessions ?? []) {
      for (const block of session.blocks) {
        for (const item of block.items) {
          if (item.kind === 'reps' && item.ex === exerciseId) return item;
        }
      }
    }
    return null;
  };
  const item = find(now);
  if (!item) return null;

  const was = find(before)?.load ?? null;
  const load = item.load;
  const show = (kg: number | null) => (kg == null ? null : String(+(units === 'lb' ? kg * 2.2046226 : kg).toFixed(2)));
  const verdict: 'up' | 'down' | 'hold' =
    load == null || was == null || Math.abs(load - was) < 1e-6 ? 'hold' : load > was ? 'up' : 'down';

  return {
    exerciseId,
    verdict,
    // Nothing to strike through on a hold or on a lift that has just arrived.
    from: verdict === 'hold' ? null : show(was),
    to: show(load) ?? '',
    unit: units,
    delta:
      verdict === 'hold' || load == null || was == null
        ? null
        // A REAL minus sign, not a hyphen — the same character every other figure in the app uses.
        : `${load > was ? '+' : '−'}${+Math.abs(load - was).toFixed(2)}`,
    band: item.reps,
    line: { text: say ?? '' },
    sessions: [],
  };
}

/* ────────────────────────────────────────────────── WHAT ACTUALLY CHANGED, AS A MEASURED DIFF */

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A CHANGE IS A DIFFERENCE BETWEEN TWO PROGRAMMES — NOT A SENTENCE THE COACH WROTE.
 *
 * ⛔ FOUNDER, 2026-08-05:
 *
 *   > *"After the workout it says 6 changes, but when you go in and check you see there is no
 *   > change — it just decided to continue with the same weight. A change is only if there is a
 *   > drop or a raise or added sets or anything else. And now it suddenly jumped from 6 changes to
 *   > 10 for some reason."*
 *
 * Both halves of that are one bug. The pill counted `coachBrief().count`, which is **how many
 * things the coach wrote a note about** — and a coach that holds a lift and explains why has
 * written a note without making a change. The jump from six to ten is the same arithmetic: a second
 * session added four more notes.
 *
 * ── WHY THIS CANNOT BE ASKED OF THE COACH ───────────────────────────────────────────────────────
 * The obvious fix is a `changed: true` field on each note. **Rejected**, for the reason
 * `coachLoadDirections` already gives: the coach states a PROGRAMME, and any field where it also
 * states what it did to the programme is a field that can disagree with the programme. The app
 * holds both weeks. It can subtract them, and a subtraction cannot be wrong about itself.
 *
 * ── WHAT COUNTS ─────────────────────────────────────────────────────────────────────────────────
 * A load that moved, a set count that moved, a lift that arrived, a lift that left. Four kinds,
 * all of them things she would notice standing in the gym. **A hold is not among them**, which is
 * the founder's sentence turned into code.
 *
 * ⚠️ FIRST-EVER PLAN IS `null`, NEVER ZERO. There is nothing to subtract from, and "0 changes" on
 * the week a programme arrives would be the app reporting on itself before it had done anything.
 * The same distinction `coachBrief` draws, for the same reason.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export type CoachChangeKind = 'load' | 'sets' | 'added' | 'dropped';

export interface CoachChange {
  ex: string;
  kind: CoachChangeKind;
  /** Which way it went. A lift that arrived or left has no direction — it is not a move. */
  direction?: 'up' | 'down';
  from?: number;
  to?: number;
}

/** Every lift's load and set count in a plan; first occurrence wins, as `coachLoadDirections` does. */
function liftShape(plan: CoachPlan): Map<string, { load: number | null; sets: number }> {
  const out = new Map<string, { load: number | null; sets: number }>();
  for (const session of plan.sessions) {
    for (const block of session.blocks) {
      for (const item of block.items) {
        if (item.kind !== 'reps') continue;
        const prev = out.get(item.ex);
        // A lift split across two blocks is ONE prescription with the rounds added up — the same
        // reading `currentBlockSets` had to learn on the set screen, for the same reason.
        if (prev) prev.sets += block.rounds;
        else out.set(item.ex, { load: item.load, sets: block.rounds });
      }
    }
  }
  return out;
}

export function coachChanges(
  now: CoachPlan | null | undefined,
  before: CoachPlan | null | undefined,
): CoachChange[] | null {
  if (!now) return null;
  if (!before) return null; // the first programme is a starting point, not a set of changes
  const then = liftShape(before);
  const next = liftShape(now);
  const out: CoachChange[] = [];

  for (const [ex, cur] of next) {
    const was = then.get(ex);
    if (!was) {
      out.push({ ex, kind: 'added' });
      continue;
    }
    if (cur.load != null && was.load != null && Math.abs(cur.load - was.load) >= 1e-6) {
      out.push({ ex, kind: 'load', direction: cur.load > was.load ? 'up' : 'down', from: was.load, to: cur.load });
    }
    if (cur.sets !== was.sets) {
      out.push({ ex, kind: 'sets', direction: cur.sets > was.sets ? 'up' : 'down', from: was.sets, to: cur.sets });
    }
  }
  for (const ex of then.keys()) if (!next.has(ex)) out.push({ ex, kind: 'dropped' });
  return out;
}
