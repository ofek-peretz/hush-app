/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK — the coach writes the week, FERROX runs the loads. (2026-09-17)
 *
 * ⛔ FOUNDER, 2026-08-11: *"זה הפתח גם למסלול המאמנים שיוצרים תוכנית עבור המתאמן שלהם."*
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 *
 * The contract is `docs/architecture/COACH_TRACK_V1.md`. This file is every rule of it that can be
 * stated without a network, a store or a screen — pure, and unit-tested to the edge of each bound:
 *
 *   · THE WIRE ........ `weekToWire` / `wireToProgram` / `validateWeekWire` / `validateSessionUpload`
 *   · THE UPLOAD ...... `sessionToUpload` — what one saved workout tells her coach, and nothing more
 *   · THE LANDING ..... `landCoachUpdate` — law 2: a new version never lands under a running session
 *   · THE ROSTER ...... `adherence` / `flags` / `sortRoster` — what the coach's list puts first
 *
 * ── ⛔ THE LINE THE WHOLE TRACK DRAWS (the four rulings) ─────────────────────────────────────────
 * The SHAPE of the week is the coach's: which lifts, on which days, for how many sets, in which
 * band. `authored: 'coach'` makes `engineMayRebuild` refuse it (law 1). The LOADS are ours: Loop 1
 * and Loop 2 run over a coach's week exactly as over an imported one — that is the product the
 * coach is buying for the athlete. The trainee swaps for TODAY only, and the coach sees the swap
 * (law 5). No prose crosses but a 140-character note on a lift (law 7).
 *
 * ⚠️ THE APP VALIDATES INDEPENDENTLY OF THE SERVER. Both sides rebuild the wire field by field; a
 * server that got looser tomorrow must not become a phone that stores whatever it is handed.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { catalogIdFromEngine, exerciseById, muscleOf, type Exercise } from '@/data/exercises';
import type { Program, ProgramDay, Session, Slot } from '@/data/local/models';
import { epley } from '@/engine/loadMath';
import { bandFor, DEFAULT_REP_BAND } from '@/engine/v5/repBand';
import { extractOccurrences } from '@/domain/swapLearning';
import { isEvidenceSet } from '@/domain/setEvidence';
import { sessionDurationMs } from '@/domain/sessionMetrics';
import type { PainEase } from '@/domain/painReport';

/* ─────────────────────────────────────── the wire ─────────────────────────────────────── */

/** Every bound in `COACH_TRACK_V1.md §3`, in one place, so the server's mirror has one thing to match. */
export const COACH_WIRE = {
  titleMax: 60,
  daysMin: 1,
  daysMax: 7,
  dayNameMax: 40,
  liftsMin: 1,
  liftsMax: 14,
  exPattern: /^[a-z0-9_]{1,64}$/,
  setsMin: 1,
  setsMax: 10,
  bandMin: 1,
  bandMax: 50,
  /** ⛔ LAW 7 — a note, not a chat. */
  noteMax: 140,
  uploadIdMax: 64,
  minutesMax: 600,
  uploadSetsMax: 120,
  loadMax: 1000,
  repsMax: 100,
  swapsMax: 14,
  skippedMax: 14,
  painMax: 6,
  painAreaMax: 24,
  /** Sessions (and cardio) per `POST /me/coach/sessions`. */
  batchMax: 20,
} as const;

export interface CoachLiftWire {
  ex: string;
  sets: number;
  band: [number, number];
  note?: string;
  pairNext?: boolean;
}

export interface CoachDayWire {
  name: string;
  lifts: CoachLiftWire[];
}

/** A week as a coach sends it. */
export interface CoachWeekWire {
  v: 1;
  title?: string;
  days: CoachDayWire[];
}

export interface WeekEnvelope {
  version: number;
  sentAt: string;
  coachName: string;
  week: CoachWeekWire;
}

/** One saved workout, as the trainee's phone uploads it. */
export interface SessionUpload {
  id: string;
  at: string;
  day: string;
  weekVersion?: number;
  minutes: number;
  early: boolean;
  sets: Array<{ ex: string; load: number | null; reps: number }>;
  swaps?: Array<{ from: string; to: string }>;
  skipped?: string[];
  pain?: string[];
  bodyweightKg?: number;
}

export interface CardioUpload {
  id: string;
  at: string;
  kind: 'run' | 'walk';
  metres: number;
  seconds: number;
}

export interface Consent {
  bodyweight: boolean;
  cardio: boolean;
}

export type WireVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const isStr = (s: unknown): s is string => typeof s === 'string';
const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

/**
 * ⛔ THE WEEK, REBUILT FIELD BY FIELD — never trusted as a blob.
 *
 * Every field the contract names is copied onto a fresh object after its bound is checked; every
 * field it does not name is simply never read, so an unknown key cannot ride through to disk. A
 * failure REFUSES the whole week with the path that failed: half a coach's week stored as if it
 * were all of it is the silent correction the authored-week rails exist to forbid.
 */
export function validateWeekWire(raw: unknown): WireVerdict<CoachWeekWire> {
  const W = COACH_WIRE;
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'week' };
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return { ok: false, reason: 'v' };
  const out: CoachWeekWire = { v: 1, days: [] };
  if (r.title !== undefined) {
    if (!isStr(r.title) || r.title.length > W.titleMax) return { ok: false, reason: 'title' };
    if (r.title.trim()) out.title = r.title;
  }
  if (!Array.isArray(r.days) || !inRange(r.days.length, W.daysMin, W.daysMax)) return { ok: false, reason: 'days' };
  for (let di = 0; di < r.days.length; di += 1) {
    const d = r.days[di] as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return { ok: false, reason: `days[${di}]` };
    if (!isStr(d.name) || !d.name.trim() || d.name.length > W.dayNameMax) return { ok: false, reason: `days[${di}].name` };
    if (!Array.isArray(d.lifts) || !inRange(d.lifts.length, W.liftsMin, W.liftsMax)) {
      return { ok: false, reason: `days[${di}].lifts` };
    }
    const day: CoachDayWire = { name: d.name, lifts: [] };
    for (let li = 0; li < d.lifts.length; li += 1) {
      const at = `days[${di}].lifts[${li}]`;
      const l = d.lifts[li] as Record<string, unknown> | null;
      if (!l || typeof l !== 'object') return { ok: false, reason: at };
      if (!isStr(l.ex) || !W.exPattern.test(l.ex)) return { ok: false, reason: `${at}.ex` };
      if (!isInt(l.sets) || !inRange(l.sets, W.setsMin, W.setsMax)) return { ok: false, reason: `${at}.sets` };
      const b = l.band;
      if (
        !Array.isArray(b) || b.length !== 2 || !isInt(b[0]) || !isInt(b[1]) ||
        !(W.bandMin <= b[0] && b[0] <= b[1] && b[1] <= W.bandMax)
      ) {
        return { ok: false, reason: `${at}.band` };
      }
      const lift: CoachLiftWire = { ex: l.ex, sets: l.sets, band: [b[0], b[1]] };
      if (l.note !== undefined) {
        if (!isStr(l.note) || l.note.length > W.noteMax) return { ok: false, reason: `${at}.note` };
        if (l.note.trim()) lift.note = l.note;
      }
      if (l.pairNext !== undefined) {
        if (typeof l.pairNext !== 'boolean') return { ok: false, reason: `${at}.pairNext` };
        if (l.pairNext) lift.pairNext = true;
      }
      day.lifts.push(lift);
    }
    out.days.push(day);
  }
  return { ok: true, value: out };
}

/** The envelope around a week — the version is what law 2 and the pull both key on. */
export function validateEnvelope(raw: unknown): WireVerdict<WeekEnvelope> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'envelope' };
  const r = raw as Record<string, unknown>;
  if (!isInt(r.version) || r.version < 1) return { ok: false, reason: 'version' };
  if (!isStr(r.sentAt) || Number.isNaN(Date.parse(r.sentAt))) return { ok: false, reason: 'sentAt' };
  if (!isStr(r.coachName) || r.coachName.length > 60) return { ok: false, reason: 'coachName' };
  const week = validateWeekWire(r.week);
  if (!week.ok) return week;
  return { ok: true, value: { version: r.version, sentAt: r.sentAt, coachName: r.coachName, week: week.value } };
}

/** The phone checks its own upload against the same bounds the server enforces — a queue that
 *  holds an item the server will always refuse is a queue that never drains. */
export function validateSessionUpload(u: SessionUpload): WireVerdict<SessionUpload> {
  const W = COACH_WIRE;
  if (!isStr(u.id) || !u.id || u.id.length > W.uploadIdMax) return { ok: false, reason: 'id' };
  if (!isStr(u.at) || Number.isNaN(Date.parse(u.at))) return { ok: false, reason: 'at' };
  if (!isStr(u.day) || u.day.length > W.dayNameMax) return { ok: false, reason: 'day' };
  if (u.weekVersion !== undefined && (!isInt(u.weekVersion) || u.weekVersion < 1)) return { ok: false, reason: 'weekVersion' };
  if (!isInt(u.minutes) || !inRange(u.minutes, 0, W.minutesMax)) return { ok: false, reason: 'minutes' };
  if (typeof u.early !== 'boolean') return { ok: false, reason: 'early' };
  if (!Array.isArray(u.sets) || u.sets.length > W.uploadSetsMax) return { ok: false, reason: 'sets' };
  for (const s of u.sets) {
    if (!W.exPattern.test(s.ex)) return { ok: false, reason: 'sets.ex' };
    if (s.load !== null && !(typeof s.load === 'number' && inRange(s.load, 0, W.loadMax))) return { ok: false, reason: 'sets.load' };
    if (!isInt(s.reps) || !inRange(s.reps, 0, W.repsMax)) return { ok: false, reason: 'sets.reps' };
  }
  if (u.swaps && (u.swaps.length > W.swapsMax || u.swaps.some((x) => !W.exPattern.test(x.from) || !W.exPattern.test(x.to)))) {
    return { ok: false, reason: 'swaps' };
  }
  if (u.skipped && (u.skipped.length > W.skippedMax || u.skipped.some((x) => !W.exPattern.test(x)))) return { ok: false, reason: 'skipped' };
  if (u.pain && (u.pain.length > W.painMax || u.pain.some((x) => !isStr(x) || x.length > W.painAreaMax))) return { ok: false, reason: 'pain' };
  if (u.bodyweightKg !== undefined && !(typeof u.bodyweightKg === 'number' && inRange(u.bodyweightKg, 20, 400))) {
    return { ok: false, reason: 'bodyweightKg' };
  }
  return { ok: true, value: u };
}

/** The band a seat carries when nobody wrote one — the engine's own default, never a new number. */
function defaultBand(): [number, number] {
  const b = bandFor(DEFAULT_REP_BAND);
  return [b.lo, b.hi];
}

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/**
 * A `Program` as a coach week on the wire — the coach's own editor (the next stage) seals with this.
 * Rest days and empty days are not sent: the wire has no rest day, the calendar is hers.
 */
export function weekToWire(program: Program): CoachWeekWire {
  const W = COACH_WIRE;
  const days = program.days
    .filter((d) => !d.isRest && d.slots.length > 0)
    .slice(0, W.daysMax)
    .map((d): CoachDayWire => ({
      name: d.name.slice(0, W.dayNameMax),
      lifts: d.slots.slice(0, W.liftsMax).map((s, i, arr): CoachLiftWire => {
        const [lo, hi] = s.repBand ?? defaultBand();
        const blo = clampInt(Math.min(lo, hi), W.bandMin, W.bandMax);
        const bhi = clampInt(Math.max(lo, hi), blo, W.bandMax);
        return {
          ex: s.exerciseId,
          sets: clampInt(s.setCount, W.setsMin, W.setsMax),
          band: [blo, bhi],
          ...(s.coachNote?.trim() ? { note: s.coachNote.slice(0, W.noteMax) } : {}),
          ...(s.pairedWithNext && i < arr.length - 1 ? { pairNext: true } : {}),
        };
      }),
    }));
  return {
    v: 1,
    ...(program.title?.trim() ? { title: program.title.slice(0, W.titleMax) } : {}),
    days,
  };
}

/** A lift this build could not run, and the day it was written for. */
export interface DroppedLift {
  ex: string;
  day: string;
}

export interface WireToProgram {
  program: Program;
  /** Exercise ids the catalogue on THIS build does not carry — dropped, and said. */
  dropped: string[];
  /**
   * ⛔ AND WHICH DAY LOST IT (2026-09-18). Law 7 says there is no chat, so the one move she has when
   * her coach sends a lift we do not stock is to tell him HERSELF — and a message that names the
   * lift but not the workout it was meant for makes him go looking. The ids alone stayed in
   * `dropped` because it is written to disk (`PendingCoachUpdate`) and an old phone's stored update
   * has no `droppedAt` to read.
   */
  droppedAt: DroppedLift[];
}

/**
 * ⛔ A COACH'S WEEK AS A PROGRAMME THE APP RUNS — stamped `authored: 'coach'`.
 *
 * The same construction `importedPlan.toProgram` uses, seat for seat: the slot's capability is the
 * LIFT's, read from the catalogue; the set count is COPIED (a coach's six-set block is not ours to
 * clamp); a day whose every lift is unknown is not a day. What the import cannot carry and a coach
 * can — the band, the note, the superset — rides onto the seat it was written for.
 *
 * ⚠️ AN UNKNOWN ID IS DROPPED AND REPORTED, never guessed. A coach on a newer build can write a
 * lift this build does not know; placing "something similar" would change the coach's week on the
 * way in, which is the one thing this whole track promises never to do.
 *
 * ⚠️ A SUPERSET MUST SATISFY THE SEAT CONTRACT (`Slot.pairedWithNext`): adjacent, never chained,
 * both partners on one set count. A pair that the drop broke, or that would chain, is dissolved; a
 * partner's set count follows the first lift's, exactly as `planBuilder.togglePair` does.
 */
export function wireToProgram(
  envelope: WeekEnvelope,
  catalogue: (id: string) => Exercise | undefined = exerciseById,
): WireToProgram {
  const dropped: string[] = [];
  const droppedAt: DroppedLift[] = [];
  const id = `coach-v${envelope.version}`;
  const days: ProgramDay[] = [];
  envelope.week.days.forEach((d, i) => {
    const seats: { slot: Slot; pair: boolean }[] = [];
    for (const l of d.lifts) {
      const ex = catalogue(l.ex);
      if (!ex) {
        if (!dropped.includes(l.ex)) dropped.push(l.ex);
        if (!droppedAt.some((x) => x.ex === l.ex && x.day === d.name)) droppedAt.push({ ex: l.ex, day: d.name });
        // A pair whose partner was dropped is no pair: dissolve the mark on the seat before it.
        const prev = seats[seats.length - 1];
        if (prev) prev.pair = false;
        continue;
      }
      seats.push({
        slot: {
          capability: ex.capability,
          exerciseId: ex.id,
          setCount: l.sets,
          repBand: [l.band[0], l.band[1]],
          supplemental: false,
          ...(l.note ? { coachNote: l.note.slice(0, COACH_WIRE.noteMax) } : {}),
        },
        pair: !!l.pairNext,
      });
    }
    const slots = seats.map((s) => s.slot);
    for (let k = 0; k < seats.length - 1; k += 1) {
      const chained = k > 0 && !!slots[k - 1].pairedWithNext;
      if (seats[k].pair && !chained) {
        slots[k].pairedWithNext = true;
        slots[k + 1].setCount = slots[k].setCount;
      }
    }
    if (slots.length === 0) return;
    days.push({
      id: `${id}-d${i + 1}`,
      name: d.name,
      muscleGroups: [...new Set(slots.map((sl) => muscleOf(sl.exerciseId)).filter(Boolean) as string[])],
      isRest: false,
      slots,
    });
  });
  return {
    program: {
      id,
      frequency: days.length,
      days,
      authored: 'coach',
      coachVersion: envelope.version,
      coachName: envelope.coachName,
      ...(envelope.week.title ? { title: envelope.week.title } : {}),
    },
    dropped,
    droppedAt,
  };
}

/* ─────────────────────────────────────── the upload ─────────────────────────────────────── */

/**
 * The `ProgramDay` a saved session trained, whichever door started it.
 *
 * Two id shapes reach the record: a real `ProgramDay.id`, and `coach_<i>` — the i-th TRAINING day
 * the week presents (`coachWeek.ts`, `coachPlanFromProgram` skips rest days and empty ones). Every
 * workout started from Home or the pre-workout card carries the second.
 */
export function dayForSession(session: Pick<Session, 'programDayId'>, program: Program | null | undefined): ProgramDay | null {
  if (!program) return null;
  const direct = program.days.find((d) => d.id === session.programDayId);
  if (direct) return direct;
  const m = /^coach_(\d+)$/.exec(session.programDayId);
  if (!m) return null;
  return program.days.filter((d) => !d.isRest && d.slots.length > 0)[Number(m[1])] ?? null;
}

const idOf = (raw: string) => catalogIdFromEngine(raw);

/**
 * ⛔ WHAT ONE WORKOUT TELLS HER COACH (ruling 3) — the sets, the swaps, the skips, the pain.
 *
 * ── WHAT IS LEFT OUT, AND WHY ────────────────────────────────────────────────────────────────────
 *   · WARM-UPS AND APPROACH SETS. A bridge at 40% is not a set her coach prescribed; `isEvidenceSet`
 *     is the one predicate every reader of a log asks, and a presumed set (builds 64–71) is not
 *     evidence either.
 *   · BODYWEIGHT unless she switched it on (`consent.bodyweight`). The server drops it too — two
 *     locks, because a field that should not leave the phone should not leave the phone.
 *   · Health, GPS, heart rate: never on this shape at all.
 *
 * ── ⚠️ HOW A SWAP IS KNOWN — there is no swap record ─────────────────────────────────────────────
 * The session never writes "she swapped A for B": a swap re-points the plan (`retargetPlanForSwap`)
 * and the log simply holds the lift she did. So a swap is DERIVED the way the engine's own learner
 * derives it (`swapLearning.extractOccurrences`): per muscle, the one offered lift she did not do
 * against the one lift she did instead. Ambiguous muscles emit nothing — a missed swap costs the
 * coach one line; an invented one tells the coach something that did not happen.
 *
 * ── ⚠️ HOW PAIN IS KNOWN — there is no pain record on the session either ─────────────────────────
 * `PainWhere` → `app.reportPain(muscle, severity)` writes an EASE onto her profile (`painEases`,
 * `fromMs`). A report made between the session's start and its last logged moment is this
 * session's pain; the area is the muscle, as she chose it.
 *
 * Returns null for a session that holds no working set — there is nothing to tell.
 */
export function sessionToUpload(
  session: Session,
  program: Program | null | undefined,
  consent: Consent,
  bodyweightKg?: number | null,
  painEases?: readonly PainEase[] | null,
): SessionUpload | null {
  const W = COACH_WIRE;
  const work = session.sets.filter(isEvidenceSet);
  if (work.length === 0) return null;

  const day = dayForSession(session, program);
  const sets = work.slice(0, W.uploadSetsMax).map((s) => ({
    ex: idOf(s.exerciseId),
    load: s.actualWeight == null ? null : Math.min(W.loadMax, Math.max(0, s.actualWeight)),
    reps: clampInt(s.actualReps, 0, W.repsMax),
  })).filter((s) => W.exPattern.test(s.ex));

  const offered = day ? day.slots.filter((s) => !s.supplemental).map((s) => idOf(s.exerciseId)) : [];
  const performed = [...new Set(sets.map((s) => s.ex))];
  /*
   * ⛔ THE SWAP FOR TODAY IS STATED FIRST (ruling 4, 2026-09-17). A swap made on the pre-workout card
   * of a coach's week is RECORDED on the session (`Session.todaySwaps`), so it reaches the coach even
   * when the replacement is from another muscle and the derivation below could never have seen it.
   * Only a stated swap she actually trained counts; a derived one for the same lift is not repeated.
   */
  const stated = (session.todaySwaps ?? [])
    .map((x) => ({ from: idOf(x.from), to: idOf(x.to) }))
    .filter((x) => x.from !== x.to && W.exPattern.test(x.from) && W.exPattern.test(x.to) && performed.includes(x.to));
  const statedFrom = new Set(stated.map((x) => x.from));
  const swaps = [
    ...stated,
    ...extractOccurrences(offered, performed)
      .filter((o) => o.offered !== o.performed && !statedFrom.has(o.offered))
      .map((o) => ({ from: o.offered, to: o.performed })),
  ].slice(0, W.swapsMax);
  const swappedAway = new Set(swaps.map((s) => s.from));
  const skipped = offered.filter((ex, i) => !performed.includes(ex) && !swappedAway.has(ex) && offered.indexOf(ex) === i).slice(0, W.skippedMax);

  const startMs = Date.parse(session.startedAt);
  const endMs = startMs + sessionDurationMs(session);
  const pain = [
    ...new Set(
      (painEases ?? [])
        .filter((e) => e.fromMs >= startMs && e.fromMs <= Math.max(endMs, startMs) + 60_000)
        .map((e) => e.muscle.slice(0, W.painAreaMax)),
    ),
  ].slice(0, W.painMax);

  const minutes = clampInt(sessionDurationMs(session) / 60_000, 0, W.minutesMax);
  const dayName = (session.programDayName ?? day?.name ?? '').slice(0, W.dayNameMax);
  const out: SessionUpload = {
    id: session.id.slice(0, W.uploadIdMax),
    at: session.startedAt,
    day: dayName,
    ...(program?.authored === 'coach' && program.coachVersion ? { weekVersion: program.coachVersion } : {}),
    minutes,
    early: !!session.earlyFinish,
    sets,
    ...(swaps.length ? { swaps } : {}),
    ...(skipped.length ? { skipped } : {}),
    ...(pain.length ? { pain } : {}),
    ...(consent.bodyweight && bodyweightKg != null && inRange(bodyweightKg, 20, 400) ? { bodyweightKg } : {}),
  };
  return out;
}

/* ─────────────────────────────────────── the landing ─────────────────────────────────────── */

export interface CoachDiffLift {
  day: string;
  ex: string;
}

export interface CoachDiffChange extends CoachDiffLift {
  sets?: [number, number];
  band?: [[number, number], [number, number]];
  note?: boolean;
}

/**
 * ⛔ ORDER IS A CHANGE (2026-09-18). A coach who reorders a day's lifts — or moves a whole day up
 * the week — changes what she does first, second and last, which on a floor with one squat rack is
 * the whole session. `diffWeeks` compared a day's lifts through a Map keyed by exercise id, so a
 * pure reorder produced `added: [] removed: [] changed: []` → `diffCount === 0` → NO CARD AT ALL.
 * Her week changed under her and the app said nothing.
 *
 *   · `lifts` — the order of that day's lifts moved.
 *   · `day`   — that day moved in the week; `to` is its new 1-based place among the training days.
 *
 * ⚠️ AND NOTHING MORE THAN THAT. The minimal set of days is reported (`outOfOrder`, an LCS): a week
 * where one day was pulled to the front says ONE day moved, not "all four moved". A week re-landed
 * unchanged still reports nothing, which is the rule the no-card path depends on.
 */
export interface CoachDiffMove {
  day: string;
  kind: 'lifts' | 'day';
  to?: number;
}

/** What the update card says changed — by day NAME and lift, the words she knows her week by. */
export interface CoachWeekDiff {
  added: CoachDiffLift[];
  removed: CoachDiffLift[];
  changed: CoachDiffChange[];
  moved: CoachDiffMove[];
}

export type CoachLanding =
  /** Not newer than the week she already holds — nothing to do. */
  | { kind: 'stale' }
  /** Nothing this build can run survived the drop — refused, her current week stands. */
  | { kind: 'refused'; reason: 'empty'; dropped: string[] }
  /** ⛔ LAW 2 — a workout is running. Nothing lands until it is saved. */
  | { kind: 'deferred'; reason: 'active_session'; version: number }
  | {
      kind: 'landed';
      program: Program;
      diff: CoachWeekDiff;
      /** The first day that takes the new version, as a local calendar date (YYYY-MM-DD). */
      effectiveDay: string;
      version: number;
      dropped: string[];
      /** The same lifts, each with the day it was written for — the ask she sends her coach. */
      droppedAt: DroppedLift[];
    };

const bandKey = (b?: [number, number]) => (b ? `${b[0]}-${b[1]}` : '');

/**
 * The members of `now` that are NOT in a longest common subsequence with `was` — the minimal set of
 * things that had to move for one order to become the other. Both arrays hold the same items.
 *
 * A plain "index differs" test would call every day after an insertion "moved"; this calls only the
 * ones that actually jumped. At most 7 days and 14 lifts, so the quadratic table is free.
 */
function outOfOrder(was: readonly string[], now: readonly string[]): string[] {
  const n = was.length;
  const m = now.length;
  if (n === 0 || m === 0) return [];
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = was[i] === now[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const kept = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (was[i] === now[j]) {
      kept.add(was[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] > table[i][j + 1]) i += 1;
    /* The tie names the day that came FORWARD, not the one it displaced: two days swapping is read
       by a coach as "Lower is the first workout now", never as "Upper is the second". */
    else j += 1;
  }
  return now.filter((x) => !kept.has(x));
}

export function diffWeeks(before: Program | null | undefined, after: Program): CoachWeekDiff {
  const out: CoachWeekDiff = { added: [], removed: [], changed: [], moved: [] };
  const training = (p: Program | null | undefined) => (p?.days ?? []).filter((d) => !d.isRest && d.slots.length > 0);
  const oldDays = training(before);
  const nowDays = training(after);
  const old = new Map(oldDays.map((d) => [d.name.trim(), d]));
  const now = new Map(nowDays.map((d) => [d.name.trim(), d]));
  for (const [name, d] of now) {
    const was = old.get(name);
    const wasBy = new Map((was?.slots ?? []).map((s) => [s.exerciseId, s]));
    for (const s of d.slots) {
      const w = wasBy.get(s.exerciseId);
      if (!w) {
        out.added.push({ day: name, ex: s.exerciseId });
        continue;
      }
      const c: CoachDiffChange = { day: name, ex: s.exerciseId };
      if (w.setCount !== s.setCount) c.sets = [w.setCount, s.setCount];
      if (bandKey(w.repBand) !== bandKey(s.repBand) && w.repBand && s.repBand) c.band = [w.repBand, s.repBand];
      if ((w.coachNote ?? '') !== (s.coachNote ?? '')) c.note = true;
      if (c.sets || c.band || c.note) out.changed.push(c);
    }
    const nowIds = new Set(d.slots.map((s) => s.exerciseId));
    for (const s of was?.slots ?? []) if (!nowIds.has(s.exerciseId)) out.removed.push({ day: name, ex: s.exerciseId });
    /*
     * ⛔ THE ORDER OF THE DAY. Only the lifts the day KEPT can have been reordered — one that
     * arrived or left is already a line on the card, and counting it twice would turn every
     * ordinary edit into "and the order changed" as well. Two identical sequences of the same
     * multiset are the same order, so inequality is the whole test.
     */
    if (was) {
      const kept = (slots: readonly Slot[], other: Set<string>) =>
        slots.map((s) => s.exerciseId).filter((id, i, arr) => other.has(id) && arr.indexOf(id) === i);
      const wasIds = new Set((was.slots ?? []).map((s) => s.exerciseId));
      const a = kept(was.slots, nowIds);
      const b = kept(d.slots, wasIds);
      if (a.length > 1 && a.join('|') !== b.join('|')) out.moved.push({ day: name, kind: 'lifts' });
    }
  }
  for (const [name, d] of old) {
    if (now.has(name)) continue;
    for (const s of d.slots) out.removed.push({ day: name, ex: s.exerciseId });
  }
  /*
   * ⛔ AND THE ORDER OF THE WEEK. A day that moved is addressed positionally by everything
   * downstream (`coach_<i>` — see law 2's note), so "Lower is now the first workout of the week" is
   * the single most consequential thing a coach can change without touching a lift. Judged over the
   * days BOTH weeks hold, so adding a day at the front does not report the other three as moved.
   */
  const shared = new Set([...now.keys()].filter((n) => old.has(n)));
  if (shared.size > 1) {
    const order = (days: readonly ProgramDay[]) => days.map((d) => d.name.trim()).filter((n) => shared.has(n));
    const seatOf = new Map(nowDays.map((d, i) => [d.name.trim(), i + 1]));
    for (const name of outOfOrder(order(oldDays), order(nowDays))) {
      out.moved.push({ day: name, kind: 'day', ...(seatOf.has(name) ? { to: seatOf.get(name)! } : {}) });
    }
  }
  return out;
}

export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * ⛔ LAW 2 — A NEW VERSION LANDS ON THE FIRST DAY NOT YET STARTED, NEVER UNDER AN ACTIVE SESSION.
 *
 * ── WHY DEFER THE WHOLE WEEK, NOT SPLICE AROUND THE RUNNING DAY ──────────────────────────────────
 * A running workout is addressed POSITIONALLY (`coach_<i>`, the i-th training day). A coach who
 * adds, removes or reorders days moves every position after the change, so splicing the new week
 * around the day she is standing in would re-point her running session — and its "done this week"
 * mark — at whatever day now sits in that seat. There is exactly one safe instant to swap a week
 * addressed by position: when nothing is running. So while a session is ACTIVE the answer is
 * `deferred`, and the store lands it the moment the save completes (or at the next foreground).
 *
 * The days she already trained this week are RECORDS in history, not seats in the week, so no
 * landing can touch them; the first day not yet started is therefore the next workout she opens,
 * which is `effectiveDay` — today, because nothing is running.
 *
 * Pure. `current` is whatever week is on disk (an engine week before the first coach version).
 */
export function landCoachUpdate(
  current: Program | null | undefined,
  incoming: WeekEnvelope,
  activeSession: Pick<Session, 'state'> | null | undefined,
  today: Date,
  catalogue: (id: string) => Exercise | undefined = exerciseById,
): CoachLanding {
  const held = current?.authored === 'coach' ? current.coachVersion ?? 0 : 0;
  if (incoming.version <= held) return { kind: 'stale' };
  if (activeSession && activeSession.state === 'ACTIVE') {
    return { kind: 'deferred', reason: 'active_session', version: incoming.version };
  }
  const { program, dropped, droppedAt } = wireToProgram(incoming, catalogue);
  if (program.days.length === 0) return { kind: 'refused', reason: 'empty', dropped };
  return {
    kind: 'landed',
    program,
    diff: diffWeeks(current?.authored === 'coach' ? current : null, program),
    effectiveDay: localDay(today),
    version: incoming.version,
    dropped,
    droppedAt,
  };
}

/* ─────────────────────────────────────── the roster ─────────────────────────────────────── */

export interface RosterAthlete {
  linkId: string;
  name: string;
  sex?: 'male' | 'female';
  days?: number;
  since: string;
  weekVersion?: number;
  recent: SessionUpload[];
}

const DAY = 86_400_000;
const ms = (x: number | Date | string) => (typeof x === 'number' ? x : typeof x === 'string' ? Date.parse(x) : x.getTime());

/** Workouts done in the week that opens at `weekStart`, against the days she said she trains. */
export function adherence(
  athlete: Pick<RosterAthlete, 'days' | 'recent'>,
  weekStart: number | Date,
): { done: number; planned: number | null; ratio: number | null } {
  const from = ms(weekStart);
  const ids = new Set(
    athlete.recent.filter((s) => {
      const t = Date.parse(s.at);
      return t >= from && t < from + 7 * DAY;
    }).map((s) => s.id),
  );
  const planned = athlete.days && athlete.days > 0 ? athlete.days : null;
  return { done: ids.size, planned, ratio: planned ? Math.min(1, ids.size / planned) : null };
}

export type CoachFlag =
  | { kind: 'pain'; area: string; at: string }
  /**
   * ⛔ THE ROSTER STOPPED BLAMING HER FOR HIS OWN OMISSION (2026-09-18, walked on glass).
   *
   * A trainee who joined sixty days ago and was never sent a week read *"60 days without a
   * workout"* — in clay, in the "needs you" section, beside two athletes who really had gone quiet.
   * She had nothing to train. The one thing that screen had to say about her was the one thing it
   * did not: HE has not written her a week yet. So `noWeek` is its own flag, it outranks silence,
   * and while it stands `inactive` is not raised at all — a person cannot be idle on a programme
   * that does not exist.
   */
  | { kind: 'noWeek' }
  | { kind: 'inactive'; days: number }
  | { kind: 'swaps'; ex: string; count: number }
  | { kind: 'best'; ex: string; e1rm: number; at: string };

/** A flag the coach must act on — the new-best flag is good news and never sorts a row up. */
export const ATTENTION_KINDS: ReadonlySet<CoachFlag['kind']> = new Set(['pain', 'noWeek', 'inactive', 'swaps']);

export const FLAG_WINDOWS = {
  painDays: 7,
  inactiveDays: 6,
  swapsDays: 14,
  swapsCount: 3,
  bestDays: 7,
  /** Epley is honest to about a dozen reps; past that a "best" is endurance, not strength. */
  bestRepsMax: 12,
} as const;

/**
 * What the coach's row says first, in the order it matters: pain (with the area), silence of six
 * days or more, the same lift swapped away three times in two weeks (the week is not working for
 * her there), and a new best — the e1RM through the app's one Epley (`engine/loadMath.epley`).
 */
export function flags(athlete: Pick<RosterAthlete, 'since' | 'recent' | 'weekVersion'>, now: number | Date): CoachFlag[] {
  const t = ms(now);
  const F = FLAG_WINDOWS;
  const recent = [...athlete.recent].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const out: CoachFlag[] = [];

  const painSeen = new Set<string>();
  for (const s of recent) {
    if (t - Date.parse(s.at) > F.painDays * DAY) continue;
    for (const area of s.pain ?? []) {
      if (painSeen.has(area)) continue;
      painSeen.add(area);
      out.push({ kind: 'pain', area, at: s.at });
    }
  }

  /* No week has ever been sent — see the `noWeek` note on `CoachFlag`. His move, not hers. */
  const hasWeek = athlete.weekVersion != null;
  if (!hasWeek) out.push({ kind: 'noWeek' });

  const lastMs = recent.length ? Date.parse(recent[0].at) : Date.parse(athlete.since);
  const idle = Math.floor((t - lastMs) / DAY);
  if (hasWeek && Number.isFinite(idle) && idle >= F.inactiveDays) out.push({ kind: 'inactive', days: idle });

  const swapCount = new Map<string, number>();
  for (const s of recent) {
    if (t - Date.parse(s.at) > F.swapsDays * DAY) continue;
    for (const sw of s.swaps ?? []) swapCount.set(sw.from, (swapCount.get(sw.from) ?? 0) + 1);
  }
  for (const [ex, count] of [...swapCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (count >= F.swapsCount) out.push({ kind: 'swaps', ex, count });
  }

  const bestOf = (s: SessionUpload) => {
    const m = new Map<string, number>();
    for (const x of s.sets) {
      if (x.load == null || x.load <= 0 || x.reps < 1 || x.reps > F.bestRepsMax) continue;
      const e = epley(x.load, x.reps);
      if (e > (m.get(x.ex) ?? 0)) m.set(x.ex, e);
    }
    return m;
  };
  const inWindow = recent.filter((s) => t - Date.parse(s.at) <= F.bestDays * DAY);
  const before = recent.filter((s) => t - Date.parse(s.at) > F.bestDays * DAY);
  const priorBest = new Map<string, number>();
  for (const s of before) for (const [ex, e] of bestOf(s)) priorBest.set(ex, Math.max(priorBest.get(ex) ?? 0, e));
  const newBest = new Map<string, { e1rm: number; at: string }>();
  // Oldest first, so a best beaten again inside the window is judged against the one before it.
  for (const s of [...inWindow].reverse()) {
    for (const [ex, e] of bestOf(s)) {
      const bar = Math.max(priorBest.get(ex) ?? 0, newBest.get(ex)?.e1rm ?? 0);
      if (priorBest.has(ex) && e > bar + 1e-9) newBest.set(ex, { e1rm: Math.round(e * 10) / 10, at: s.at });
      priorBest.set(ex, Math.max(priorBest.get(ex) ?? 0, e));
    }
  }
  for (const [ex, b] of newBest) out.push({ kind: 'best', ex, e1rm: b.e1rm, at: b.at });

  return out;
}

export function needsAttention(fs: readonly CoachFlag[]): boolean {
  return fs.some((f) => ATTENTION_KINDS.has(f.kind));
}

/**
 * The roster, needs-attention first. Among those, the gravest flag leads (pain, then silence, then
 * swaps); everyone else keeps a stable, name-ordered list the coach can find a face in.
 */
export function sortRoster<A extends Pick<RosterAthlete, 'name' | 'since' | 'recent' | 'weekVersion'>>(athletes: readonly A[], now: number | Date): A[] {
  const rank = (a: A) => {
    const fs = flags(a, now);
    if (fs.some((f) => f.kind === 'pain')) return 0;
    /* ⛔ HIS OWN OMISSION OUTRANKS HER SILENCE — the same order `coachDesk.GRAVITY` draws the pill
       in, and the two must agree or the list and the label disagree about what matters. */
    if (fs.some((f) => f.kind === 'noWeek')) return 1;
    if (fs.some((f) => f.kind === 'inactive')) return 2;
    if (fs.some((f) => f.kind === 'swaps')) return 3;
    return 4;
  };
  return athletes
    .map((a) => ({ a, r: rank(a) }))
    .sort((x, y) => x.r - y.r || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a);
}

/* ─────────────────────────────────────── the gates ─────────────────────────────────────── */

/**
 * ⛔ LAW 5 — THE TRAINEE SWAPS BUT NEVER REWRITES. Every door that would change the SHAPE of a
 * coach's week asks this: the pre-workout card's declared swap, the drag, the plan builder's save,
 * the import's adopt, the AI build and the AI review. A swap for TODAY runs inside the session
 * (`retargetPlanForSwap`, never persisted) and reaches the coach on the upload.
 *
 * ⚠️ LOCKED WHILE THE LINK LIVES, NOT FOR EVER. After she leaves (law 6) the week stays on her phone
 * as `authored: 'coach'` — so the ENGINE still may not rebuild it (`engineMayRebuild`, law 1) — but
 * nobody is writing it for her any more, and her own pen is hers again: the builder, the drag, the
 * pen-back. Only the coach changes the week, and only while there is a coach.
 */
export function weekIsLockedToCoach(program: Program | null | undefined, linked: boolean): boolean {
  return program?.authored === 'coach' && linked;
}
