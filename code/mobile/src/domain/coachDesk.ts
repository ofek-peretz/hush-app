/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH'S DESK — what the coach-side screens of the track read, and nothing they draw. (2026-09-17)
 *
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 *
 * `domain/coachTrack` owns the wire, the landing and the flags. This file is the next ring out: the
 * decisions the coach's four screens make about what the wire carried — pure, so each one is
 * unit-tested rather than eyeballed:
 *
 *   · THE ROSTER ....... `rosterSections` — "needs you" over "this week", one row fact each
 *   · THE TREND ........ `liftTrends` — which lifts earn a sparkline, and the series under each
 *   · THE LOG .......... `sessionLines` / `setsFigure` — a workout set by set, a swap said as a fact
 *   · THE PEN .......... `weekProblems` / `sendableWeek` / `setLiftNote` / `setCoachBand` /
 *                        `draftFromWire` — the builder's for-mode, bounded before anything is sent
 *
 * ── ⛔ BOUNDS ARE REFUSED, NEVER TRIMMED (COACH_TRACK_V1 §6) ──────────────────────────────────────
 * `weekToWire` slices a week to fit the wire, which is right for a week already on a phone and wrong
 * for a week a coach is about to send: the server refuses a 41-character day name, and a phone that
 * quietly cut it to forty would send a week the coach never wrote. So the pen asks `weekProblems`
 * first, and every problem is a thing the screen can say in words and the coach can fix.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Program, ProgramDay, Slot } from '@/data/local/models';
import { bidi } from '@/i18n/bidi';
import { musclesForWristArea } from '@/domain/painReport';
import { epley } from '@/engine/loadMath';
import { bandFor, DEFAULT_REP_BAND } from '@/engine/v5/repBand';
import { E1RM_MAX_REPS } from '@/domain/liftDetail';
import {
  ATTENTION_KINDS,
  COACH_WIRE,
  adherence,
  flags,
  sortRoster,
  validateWeekWire,
  weekToWire,
  wireToProgram,
  type CoachFlag,
  type CoachWeekWire,
  type RosterAthlete,
  type SessionUpload,
} from '@/domain/coachTrack';

const DAY_MS = 86_400_000;

/* ─────────────────────────────────────── the roster ─────────────────────────────────────── */

export interface RosterRow {
  linkId: string;
  name: string;
  sex?: 'male' | 'female';
  /** The one flag the row prints — the gravest attention flag, else a new best, else none. */
  flag: CoachFlag | null;
  /** Workouts done in the current training week, of the days she said she trains. */
  done: number;
  planned: number | null;
}

export interface RosterSections {
  /** "צריכים אותך" — pain, silence, repeated swaps; gravest first. */
  attention: RosterRow[];
  /** "השבוע" — everyone else, name-ordered so a coach can find a face. */
  week: RosterRow[];
}

/* Pain first; then the week he never wrote (nothing else about her can be judged until it exists);
   then silence, then a lift she keeps refusing. A new best is good news and always sorts last. */
const GRAVITY: Record<CoachFlag['kind'], number> = { pain: 0, noWeek: 1, inactive: 2, swaps: 3, best: 4 };

/** The flag a row leads with. Attention flags by gravity; a new best only when nothing is wrong. */
export function leadingFlag(fs: readonly CoachFlag[]): CoachFlag | null {
  if (fs.length === 0) return null;
  return [...fs].sort((a, b) => GRAVITY[a.kind] - GRAVITY[b.kind])[0];
}

/**
 * The roster, cut into the two sections the tab draws. Order inside "needs you" is `sortRoster`'s
 * (pain, then silence, then swaps); a new best is good news and never lifts a row into it.
 */
export function rosterSections(athletes: readonly RosterAthlete[], nowMs: number, weekStartMs: number): RosterSections {
  const out: RosterSections = { attention: [], week: [] };
  for (const a of sortRoster(athletes, nowMs)) {
    const fs = flags(a, nowMs);
    const { done, planned } = adherence(a, weekStartMs);
    const row: RosterRow = {
      linkId: a.linkId,
      name: a.name,
      ...(a.sex ? { sex: a.sex } : {}),
      flag: leadingFlag(fs),
      done,
      planned,
    };
    if (fs.some((f) => ATTENTION_KINDS.has(f.kind))) out.attention.push(row);
    else out.week.push(row);
  }
  return out;
}

/**
 * ⛔ WHEN A LIST BECOMES SOMETHING YOU SEARCH (2026-09-18).
 *
 * Under a dozen athletes the roster is a page: every name is on the glass or one flick away, and a
 * search field over it is a control asking to be used for nothing. Past a dozen it is a corpus —
 * finding Noa means scrolling past twenty faces — and the field earns its line. Twelve is where a
 * phone stops holding the list; it is not a preference, it is roughly two screens of rows at the
 * type floor. The field simply does not exist below it.
 */
export const ROSTER_SEARCH_MIN = 12;

/** Everyone on the roster, across both sections — what the search threshold is measured against. */
export function rosterCount(s: RosterSections): number {
  return s.attention.length + s.week.length;
}

/**
 * The roster narrowed to a query, SECTION BY SECTION — "needs you" stays pinned above "this week"
 * and never dissolves into one flat list of hits. A coach filtering for "dan" while Dana is in pain
 * must still be told that first; a search that reorders his roster by relevance would be the one
 * thing this screen must not become (the founder's line: not a feed).
 *
 * An empty or blank query is every row, untouched. The match is a case-folded substring of the
 * name — no fuzz, no ranking: a name the coach typed either is in the list or is not.
 */
export function filterRosterSections(sections: RosterSections, query: string): RosterSections {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  const hit = (r: RosterRow) => r.name.trim().toLowerCase().includes(q);
  return { attention: sections.attention.filter(hit), week: sections.week.filter(hit) };
}

/** "02.09" — a date as two figures, the same in every language (no month name to translate). */
export function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

/* ─────────────────────────────────────── the trend ─────────────────────────────────────── */

export interface LiftTrend {
  ex: string;
  /** Best e1RM per session, oldest first — the sparkline's series. */
  series: number[];
  /** The last point: where the lift stands now. */
  current: number;
  /** current − first point, kg, rounded to 0.5. */
  delta: number;
  /** Whole weeks between the first and the last point (0 when they share a week). */
  weeks: number;
}

export const TREND_POINTS_MAX = 12;
export const TREND_LIFTS_MAX = 3;

/** One session's best Epley per lift — the app's one estimator, honest to ten reps. */
function bestPerLift(s: SessionUpload): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of s.sets) {
    if (x.load == null || !(x.load > 0) || x.reps < 1 || x.reps > E1RM_MAX_REPS) continue;
    const e = Math.round(epley(x.load, x.reps) * 2) / 2;
    if (e > (m.get(x.ex) ?? 0)) m.set(x.ex, e);
  }
  return m;
}

/**
 * ⛔ WHICH LIFTS EARN A SPARKLINE — the ones the coach can read a trend in.
 *
 * A lift needs at least two sessions to be a line at all. Among those, a lift the coach PUT IN THE
 * WEEK outranks one she did on her own (`prefer`), then the lift trained most often, then the
 * heavier. Three at most: this card is a glance, and the log below it holds the rest.
 */
export function liftTrends(
  sessions: readonly SessionUpload[],
  opts: { prefer?: readonly string[]; max?: number } = {},
): LiftTrend[] {
  const max = opts.max ?? TREND_LIFTS_MAX;
  const prefer = new Set(opts.prefer ?? []);
  const chrono = [...sessions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const points = new Map<string, { at: number; e: number }[]>();
  for (const s of chrono) {
    const at = Date.parse(s.at);
    if (!Number.isFinite(at)) continue;
    for (const [ex, e] of bestPerLift(s)) {
      const list = points.get(ex) ?? [];
      list.push({ at, e });
      points.set(ex, list);
    }
  }
  const ranked = [...points]
    .filter(([, ps]) => ps.length >= 2)
    .sort((a, b) =>
      Number(prefer.has(b[0])) - Number(prefer.has(a[0])) ||
      b[1].length - a[1].length ||
      Math.max(...b[1].map((p) => p.e)) - Math.max(...a[1].map((p) => p.e)) ||
      a[0].localeCompare(b[0]),
    )
    .slice(0, max);
  return ranked.map(([ex, ps]) => {
    const tail = ps.slice(-TREND_POINTS_MAX);
    const first = tail[0];
    const last = tail[tail.length - 1];
    return {
      ex,
      series: tail.map((p) => p.e),
      current: last.e,
      delta: Math.round((last.e - first.e) * 2) / 2,
      weeks: Math.max(0, Math.floor((last.at - first.at) / (7 * DAY_MS))),
    };
  });
}

/* ─────────────────────────────────────── the log ─────────────────────────────────────── */

const kg = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A lift's sets as one figure: `42.5 × 8 · 8 · 7` while the load holds, a new `load ×` where it
 * moves, reps alone for a bodyweight set. Figures only — no unit word — so it is mono-safe.
 *
 * ⛔ AND IT IS ISOLATED — NOT FOR THE FAULT I EXPECTED (2026-09-18, measured on glass first).
 *
 * I went looking for a reversal: every character here is bidi-NEUTRAL or numeric (digits, `×`,
 * `·`, `.`), and a neutral run takes the direction of its paragraph, so inside a Hebrew line
 * `42.5 × 8 · 8 · 7` looked like it had to come out as `7 · 8 · 8 × 42.5`. **It does not.** Shot
 * before and after on the real screen, the run is byte-for-byte the same picture: the digits are
 * strong-LTR (BiDi class EN), the separators between two of them resolve with them, and the whole
 * figure lays out left-to-right exactly as it reads. The elevation pass's rule held again — the
 * capture impression did not survive the measurement, so the claim is not in this file.
 *
 * The isolate STAYS, because of the other half of [[the-LTR-island-lesson]]: RN native flips
 * `textAlign` globally off `I18nManager` while react-native-web ignores a declared `direction`
 * outright, so the one thing a neutral run is NOT guaranteed is that both platforms agree about it.
 * A First-Strong Isolate with no strong character inside resolves LTR by the algorithm itself, on
 * both. This makes the order a property of the VALUE rather than of whichever renderer draws it.
 *
 * ⚠️ Isolated HERE rather than at the `<Text>`, so the wrist, a share card or any future reader of
 * `sessionLines` inherits it instead of re-deciding it. Never feed the result to a comparison or to
 * telemetry — it carries the control characters (`i18n/bidi`'s own warning).
 */
export function setsFigure(sets: readonly { load: number | null; reps: number }[]): string {
  const parts: string[] = [];
  let prev: number | null | undefined;
  for (const s of sets) {
    if (s.load !== prev) {
      parts.push(s.load == null ? String(s.reps) : `${kg(s.load)} × ${s.reps}`);
      prev = s.load;
    } else {
      parts.push(String(s.reps));
    }
  }
  return bidi(parts.join(' · '));
}

/**
 * ⛔ A BODY AREA IS SAID IN HER LANGUAGE, OR NOT AT ALL (2026-09-18, walked on glass).
 *
 * The log read `דיווח כאב: רגליים · Lower back` — a raw English token dropped into a Hebrew
 * sentence, in clay, on the coach's screen. `t('muscle.X', { defaultValue: X })` was the whole
 * translation, and the wire permits ANY string of 24 characters (`COACH_TRACK_V1 §3`): an older
 * watch build still names joints (`Lower back`, `Knee`, `Elbow` — `domain/painReport`'s wrist
 * aliases), and the server stores what it is given.
 *
 * Three steps, in order: the app's own muscle word; else the muscles that joint resolves to, said
 * in her language; else the token itself, ISOLATED, so at least it cannot reorder the Hebrew
 * around it. Pure, so the roster's pill and the detail's log say exactly the same thing.
 */
export function painAreaWords(areas: readonly string[], t: (k: string, p?: Record<string, unknown>) => string): string {
  const said: string[] = [];
  for (const a of areas) {
    const direct = t(`muscle.${a}`, { defaultValue: '' });
    if (direct) {
      said.push(direct);
      continue;
    }
    const resolved = musclesForWristArea(a)
      .map((m) => t(`muscle.${m}`, { defaultValue: '' }))
      .filter(Boolean);
    said.push(resolved.length > 0 ? resolved.join(' · ') : bidi(a));
  }
  // The same area can arrive twice under two names (a joint and the muscle it resolves to).
  return [...new Set(said)].join(' · ');
}

export interface SessionLine {
  ex: string;
  figure: string;
  /** The lift the week put in this seat, when she swapped it for today (law 5) — a fact, not a verdict. */
  swappedFrom?: string;
}

export interface SessionRead {
  lines: SessionLine[];
  skipped: string[];
  pain: string[];
  early: boolean;
}

/** One uploaded workout, set by set, in the order she did the lifts. */
export function sessionLines(u: SessionUpload): SessionRead {
  const order: string[] = [];
  const by = new Map<string, { load: number | null; reps: number }[]>();
  for (const s of u.sets) {
    if (!by.has(s.ex)) {
      by.set(s.ex, []);
      order.push(s.ex);
    }
    by.get(s.ex)!.push({ load: s.load, reps: s.reps });
  }
  const from = new Map((u.swaps ?? []).map((s) => [s.to, s.from]));
  return {
    lines: order.map((ex) => ({
      ex,
      figure: setsFigure(by.get(ex)!),
      ...(from.has(ex) ? { swappedFrom: from.get(ex)! } : {}),
    })),
    skipped: [...(u.skipped ?? [])],
    pain: [...(u.pain ?? [])],
    early: u.early,
  };
}

/* ─────────────────────────────────────── the pen ─────────────────────────────────────── */

/** A reason the coach's week cannot be sent yet — each one a sentence the screen can say. */
export type WeekProblem =
  | { kind: 'no_days' }
  | { kind: 'too_many_days'; n: number }
  | { kind: 'empty_day'; day: string }
  | { kind: 'too_many_lifts'; day: string; n: number }
  | { kind: 'day_name'; day: string }
  | { kind: 'title_long' }
  | { kind: 'note_long'; day: string; ex: string }
  | { kind: 'bad_lift'; day: string; ex: string };

const trainingDays = (p: Program): ProgramDay[] => p.days.filter((d) => !d.isRest);

/**
 * ⛔ EVERY BOUND OF §3, ASKED BEFORE A SEND — with the day and the lift it is about.
 *
 * Empty days are problems, not silently dropped: a coach who added "Day C" and left it blank has
 * either forgotten a day or wants it gone, and only the coach knows which.
 */
export function weekProblems(p: Program): WeekProblem[] {
  const W = COACH_WIRE;
  const out: WeekProblem[] = [];
  const days = trainingDays(p);
  if (days.length === 0) out.push({ kind: 'no_days' });
  if (days.length > W.daysMax) out.push({ kind: 'too_many_days', n: days.length });
  if ((p.title ?? '').length > W.titleMax) out.push({ kind: 'title_long' });
  for (const d of days) {
    const day = d.name.trim() || '—';
    if (!d.name.trim() || d.name.length > W.dayNameMax) out.push({ kind: 'day_name', day });
    if (d.slots.length === 0) out.push({ kind: 'empty_day', day });
    if (d.slots.length > W.liftsMax) out.push({ kind: 'too_many_lifts', day, n: d.slots.length });
    for (const s of d.slots) {
      const band = s.repBand;
      const badBand = !!band && !(Number.isInteger(band[0]) && Number.isInteger(band[1]) && W.bandMin <= band[0] && band[0] <= band[1] && band[1] <= W.bandMax);
      const badSets = !(Number.isInteger(s.setCount) && s.setCount >= W.setsMin && s.setCount <= W.setsMax);
      if (!W.exPattern.test(s.exerciseId) || badBand || badSets) out.push({ kind: 'bad_lift', day, ex: s.exerciseId });
      if ((s.coachNote ?? '').length > W.noteMax) out.push({ kind: 'note_long', day, ex: s.exerciseId });
    }
  }
  return out;
}

/**
 * The week on the wire, only when nothing needs fixing — and validated by the same reader the
 * client runs before it sends, so a week this returns is a week the server will take.
 */
export function sendableWeek(p: Program): { ok: true; week: CoachWeekWire } | { ok: false; problems: WeekProblem[] } {
  const problems = weekProblems(p);
  if (problems.length) return { ok: false, problems };
  const v = validateWeekWire(weekToWire(p));
  if (!v.ok) return { ok: false, problems: [{ kind: 'no_days' }] };
  return { ok: true, week: v.value };
}

const cloneProgram = (p: Program): Program => ({
  ...p,
  days: p.days.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })), muscleGroups: [...d.muscleGroups] })),
});

function seat(p: Program, dayIdx: number, slotIdx: number): Slot | null {
  return p.days[dayIdx]?.slots[slotIdx] ?? null;
}

/** ⛔ LAW 7 — the note on one lift. Empty clears it; past 140 characters is refused, not cut. */
export function setLiftNote(p: Program, dayIdx: number, slotIdx: number, note: string): Program {
  if (!seat(p, dayIdx, slotIdx)) return p;
  if (note.length > COACH_WIRE.noteMax) return p;
  const out = cloneProgram(p);
  const s = out.days[dayIdx].slots[slotIdx];
  if (note.trim()) s.coachNote = note;
  else delete s.coachNote;
  return out;
}

/**
 * A coach's rep band on one lift — the WIRE's bounds (1..50), not the self-built week's (2..30): a
 * coach prescribing heavy singles is prescribing, and the engine already runs whatever
 * `wireToProgram` hands it.
 */
export function setCoachBand(p: Program, dayIdx: number, slotIdx: number, band: [number, number]): Program {
  if (!seat(p, dayIdx, slotIdx)) return p;
  const [lo, hi] = band;
  const W = COACH_WIRE;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < W.bandMin || hi > W.bandMax || lo > hi) return p;
  const out = cloneProgram(p);
  out.days[dayIdx].slots[slotIdx].repBand = [lo, hi];
  return out;
}

/** The band a seat shows when the coach has not written one — the engine's own default. */
export function bandShown(s: Pick<Slot, 'repBand'>): [number, number] {
  if (s.repBand) return s.repBand;
  const b = bandFor(DEFAULT_REP_BAND);
  return [b.lo, b.hi];
}

/** Retitle the week; refused past the wire's sixty characters. */
export function setWeekTitle(p: Program, title: string): Program {
  if (title.length > COACH_WIRE.titleMax) return p;
  const out = cloneProgram(p);
  if (title.trim()) out.title = title;
  else delete out.title;
  return out;
}

/**
 * A week off the wire (a sent version, or a template) as a DRAFT on the coach's desk.
 *
 * ⚠️ THE PASSPORT IS STRIPPED. `wireToProgram` stamps `authored: 'coach'`, `coachVersion` and
 * `coachName`, which is right for a week that lands on a trainee's phone and meaningless on a page
 * the coach is still writing — and a draft carrying them would look, to every gate that reads a
 * programme, like a week somebody is training.
 */
export function draftFromWire(week: CoachWeekWire, id: string): { draft: Program; dropped: string[] } {
  const { program, dropped } = wireToProgram({ version: 1, sentAt: new Date(0).toISOString(), coachName: '', week });
  const { authored: _a, coachVersion: _v, coachName: _n, ...rest } = program;
  void _a; void _v; void _n;
  return { draft: { ...rest, id }, dropped };
}

/** A programme from any other door (a photograph, the model) made into a draft the same way. */
export function draftWithoutPassport(p: Program, id: string): Program {
  const { authored: _a, coachVersion: _v, coachName: _n, ...rest } = cloneProgram(p);
  void _a; void _v; void _n;
  return { ...rest, id, days: rest.days.filter((d) => !d.isRest) };
}
