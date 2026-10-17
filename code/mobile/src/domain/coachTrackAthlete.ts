/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK, AS THE TRAINEE MEETS IT — the pure rules under her three screens. (2026-09-17)
 *
 * `domain/coachTrack` is the contract (the wire, the upload, the landing). This file is what the
 * TRAINEE's screens decide without a store or a network, so each decision is a tested fact rather
 * than a line inside a component:
 *
 *   · THE DOOR ........ `inviteCodeFromUrl` / `normalizeInviteCode` — which links are an invite
 *   · THE SWAP ........ `swapForToday` — ruling 4: today's session changes, the week does not
 *   · THE CARD ........ `updateCardLines` / `diffCount` — what the update card on Today says
 *   · THE LINK ........ `coachWeekNumber` / `joinErrorKey` — MyCoach's facts, a refusal in words
 *
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { PlannedSession } from '@/domain/coachPlan';
import type { CoachWeekDiff } from '@/domain/coachTrack';

/* ─────────────────────────────────────── the door ─────────────────────────────────────── */

/** The pair alphabet (`server/hush-identity` `CODE_ALPHABET`) — no 0/O, no 1/I/L. Six characters. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 6;

/**
 * What she typed, as the server reads it: upper-cased, filtered to the alphabet, six at most.
 * The server is case-insensitive on join too; the phone agrees so the field shows what is sent.
 */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => INVITE_ALPHABET.includes(c))
    .join('')
    .slice(0, INVITE_LENGTH);
}

export function isInviteCode(code: string): boolean {
  return code.length === INVITE_LENGTH && normalizeInviteCode(code) === code;
}

/**
 * ⛔ WHICH LINKS ARE A COACH'S INVITE (COACH_TRACK_V1 §4, §6 "Universal links").
 *
 *   hush://coach?c=CODE             the landing page's own button, and older builds
 *   https://getferrox.com/c/CODE    what `/coach/invite` mints
 *   https://<identity>/c/CODE       the identity origin answers the same path
 *   https://…/c?c=CODE              the hand-typed spelling
 *
 * ⚠️ `/c/` and `/c?` — NEVER a bare `/c` prefix, for the same reason the association claims `/c/*`
 * and `/c` only: `/circle`, `/config` and every `/coach/…` API path start with `/c`. `hush://pair?c=`
 * is the PAIR's link and carries the same `c` param; it is not an invite. Null for anything else.
 */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let raw: string | null = null;
  const scheme = /^hush:\/\/coach\/?\?(?:.*&)?c=([^&#]+)/i.exec(url);
  if (scheme) raw = scheme[1];
  else {
    const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/i.exec(url);
    if (!m) return null;
    const path = m[1] ?? '';
    const query = m[2] ?? '';
    const seg = /^\/c\/([^/]+)\/?$/.exec(path);
    if (seg) raw = seg[1];
    else if (path === '/c' || path === '/c/') raw = /[?&]c=([^&]+)/.exec(query)?.[1] ?? null;
  }
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const code = normalizeInviteCode(decoded);
  // A link whose code does not survive the alphabet is not an invite — never a "close enough".
  return code.length === INVITE_LENGTH && decoded.trim().length === INVITE_LENGTH ? code : null;
}

/* ─────────────────────────────────────── the swap ─────────────────────────────────────── */

export interface TodaySwap {
  from: string;
  to: string;
}

/**
 * ⛔ RULING 4 — THE TRAINEE MAY SWAP A LIFT FOR TODAY ONLY, AND THE COACH SEES IT.
 *
 * Returns a NEW session with each `from` lift replaced by its `to` — the stored programme is never
 * read or written here, so there is nothing for this to rewrite. What changes on the item, and why:
 *
 *   · `ex` — the lift she will do.
 *   · `load` → null. The load on the item was decided for the OTHER lift; a bench load carried onto
 *     a machine pin is the defect `retargetPlanForSwap` exists to prevent. Null is the honest
 *     rendering of a lift with no load decided yet, and her first set decides it.
 *   · `coachNote` and `say` are dropped — the coach wrote them about the lift she is not doing.
 *
 * The block shape (sets, band, supersets) is untouched: the coach prescribed the SEAT.
 * A swap to a lift already in the session, or of a lift not in it, is ignored.
 */
export function swapForToday(planned: PlannedSession, swaps: readonly TodaySwap[]): PlannedSession {
  const present = new Set(planned.blocks.flatMap((b) => b.items.map((i) => i.ex)));
  const map = new Map<string, string>();
  for (const s of swaps) {
    if (s.from === s.to || !present.has(s.from) || present.has(s.to)) continue;
    if ([...map.values()].includes(s.to)) continue;
    map.set(s.from, s.to);
  }
  if (map.size === 0) return planned;
  return {
    ...planned,
    blocks: planned.blocks.map((b) => ({
      ...b,
      items: b.items.map((item) => {
        const to = map.get(item.ex);
        if (!to) return item;
        const { coachNote: _note, say: _say, ...rest } = item;
        return item.kind === 'reps' ? { ...rest, kind: 'reps' as const, reps: item.reps, ex: to, load: null } : { ...rest, ex: to };
      }),
    })),
  };
}

/** The swaps that actually landed on the session — what `startCoach` records for the upload. */
export function appliedSwaps(before: PlannedSession, after: PlannedSession, swaps: readonly TodaySwap[]): TodaySwap[] {
  const had = new Set(before.blocks.flatMap((b) => b.items.map((i) => i.ex)));
  const has = new Set(after.blocks.flatMap((b) => b.items.map((i) => i.ex)));
  return swaps.filter((s) => had.has(s.from) && !has.has(s.from) && has.has(s.to));
}

/* ─────────────────────────────────────── the card ─────────────────────────────────────── */

/**
 * How many changes the card counts — one per lift added, removed or re-prescribed, and one per
 * order that moved (a day's lifts, or the day itself in the week).
 *
 * ⚠️ `moved` COUNTS, and it has to: this figure is the whole gate on whether Home draws the card at
 * all, so an order-only update with a count of 0 is exactly the silence [[the moved kind]] was
 * added to end. A week re-landed identical still counts 0 and still draws nothing.
 */
export function diffCount(diff: CoachWeekDiff): number {
  return diff.added.length + diff.removed.length + diff.changed.length + (diff.moved?.length ?? 0);
}

export interface UpdateLine {
  /** `⇅` is an ORDER line: it carries no lift, and `order` says which order moved. */
  sign: '+' | '−' | '~' | '⇅';
  /** The catalogue id. Empty on an order line — there is no one lift it is about. */
  ex: string;
  /** An order line: the day's lifts were reordered, or the day itself moved to seat `to`. */
  order?: 'lifts' | 'day';
  /** The day's new 1-based place among the training days (order lines of kind `day` only). */
  to?: number;
  /**
   * ⛔ WHAT `~` MEANS, IN FIGURES (2026-09-18). A re-prescribed lift printed a tilde and its name
   * and stopped — the one line on the card that exists to say WHAT changed said only THAT something
   * had. `CoachDiffChange` has carried `sets` and `band` as [was, now] pairs since the day it was
   * written and the card threw both away.
   *
   * Pure figures (`3→4`, `6–8→8–10`, `3×6–8→4×8–10`) — no words, so it is the mono voice's own
   * material and it needs no translation. Absent when only the coach's NOTE moved: there is nothing
   * numeric to show, and the note itself is drawn on the lift, where it is read.
   */
  detail?: string;
}

const bandStr = (b: [number, number]) => (b[1] > b[0] ? `${b[0]}–${b[1]}` : `${b[0]}`);

/** `3→4` · `6–8→8–10` · `3×6–8→4×8–10` — whichever of the two the coach actually moved. */
function changeDetail(c: CoachWeekDiff['changed'][number]): string | undefined {
  if (c.sets && c.band) return `${c.sets[0]}×${bandStr(c.band[0])}→${c.sets[1]}×${bandStr(c.band[1])}`;
  if (c.sets) return `${c.sets[0]}→${c.sets[1]}`;
  if (c.band) return `${bandStr(c.band[0])}→${bandStr(c.band[1])}`;
  return undefined;
}

/** One day of the card: the day's name, and the lines that happened inside it. */
export interface UpdateGroup {
  /** The day NAME the coach wrote — already human text, never a key. */
  day: string;
  lines: UpdateLine[];
}

/**
 * The card's lines for ONE day, in the order a reader needs them: what left, what arrived, what was
 * re-prescribed, and last the order, which is a statement about the day as a whole.
 */
function linesForDay(diff: CoachWeekDiff, day: string): UpdateLine[] {
  const here = <T extends { day: string }>(xs: readonly T[]) => xs.filter((x) => x.day === day);
  const out: UpdateLine[] = [
    ...here(diff.removed).map((d) => ({ sign: '−' as const, ex: d.ex })),
    ...here(diff.added).map((d) => ({ sign: '+' as const, ex: d.ex })),
    ...here(diff.changed).map((d) => {
      const detail = changeDetail(d);
      return { sign: '~' as const, ex: d.ex, ...(detail ? { detail } : {}) };
    }),
    ...here(diff.moved ?? []).map((m) => ({
      sign: '⇅' as const,
      ex: '',
      order: m.kind,
      ...(m.to != null ? { to: m.to } : {}),
    })),
  ];
  const seen = new Set<string>();
  return out.filter((l) => {
    const k = `${l.sign}${l.ex}${l.order ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * ⛔ THE CARD IS GROUPED BY DAY, AND THE DAY IS THE POINT (2026-09-18).
 *
 * `CoachDiffLift.day` was carried from `diffWeeks` all the way to the card and then thrown away, so
 * on a four-day week *"− לחיצה צבאית"* could not be placed: she reads that her coach removed the
 * military press and cannot tell which workout lost it, which is most of what she needed to know.
 *
 * ── WHY GROUPED AND NOT A DAY ON EVERY LINE ──────────────────────────────────────────────────────
 * Measured at the three lengths the card actually meets:
 *   · ONE change — a group is a short muted day name over one line. It reads as a caption, and the
 *     alternative (the day inline) makes the single most important line on the card longer than the
 *     lift name it is about.
 *   · THREE changes on one day — inline would print the same day three times; the group prints it
 *     once and the three lines read as a list, which is what they are.
 *   · TWELVE across four days — the day is the axis the week is organised by, so the reader's
 *     question ("what happened to Wednesday?") is answered by the structure rather than by scanning
 *     a suffix on every row. Inline at twelve is twelve repetitions of four words.
 * And the ORDER lines settle it: "the exercise order changed" is a statement about a DAY and has no
 * lift to hang on. Grouped, it is one short line under the name it belongs to.
 *
 * `max` caps the LINES, not the groups — a day header is not one of her changes and never spends
 * the budget. Days appear in the week's own order (`diff` walks `now` first), and a day that only
 * lost lifts (so appears in `removed` alone) still gets its group.
 */
export function updateCardGroups(diff: CoachWeekDiff, max = 4): UpdateGroup[] {
  /* Days in the same order the lines inside them are: what left, what arrived, what was
     re-prescribed, what moved. Within each of those, `diffWeeks` already walks the week in order. */
  const days: string[] = [];
  for (const x of [...diff.removed, ...diff.added, ...diff.changed, ...(diff.moved ?? [])]) {
    if (!days.includes(x.day)) days.push(x.day);
  }
  const out: UpdateGroup[] = [];
  let left = max;
  for (const day of days) {
    if (left <= 0) break;
    const lines = linesForDay(diff, day).slice(0, left);
    if (lines.length === 0) continue;
    left -= lines.length;
    out.push({ day, lines });
  }
  return out;
}

/** Every line the groups hold — the figure the card compares against the total. */
export function groupedLineCount(groups: readonly UpdateGroup[]): number {
  return groups.reduce((n, g) => n + g.lines.length, 0);
}

/** The weekday (0 = Sunday) of a local `YYYY-MM-DD`, or null when the string is not one. */
export function weekdayOfLocalDay(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

/* ─────────────────────────────────────── the link ─────────────────────────────────────── */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "Week 3" on MyCoach — the week of the link she is in, counted from the day she joined. */
export function coachWeekNumber(since: string, nowMs: number): number | null {
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return null;
  return Math.max(1, Math.floor((nowMs - t) / WEEK_MS) + 1);
}

/**
 * ⛔ A REFUSAL IN WORDS — every error a trainee can meet on the join, the consent or the leave.
 * Each has its own sentence; `network` is "you are offline", `unavailable` / `coach_not_configured`
 * are "it is us", and neither is ever said as the other.
 */
export function joinErrorKey(error: string): string {
  switch (error) {
    case 'bad_code':
      return 'coachTrack.athlete.errBadCode';
    case 'seats_full':
      return 'coachTrack.athlete.errSeatsFull';
    case 'already_linked':
      return 'coachTrack.athlete.errAlreadyLinked';
    case 'self':
      return 'coachTrack.athlete.errSelf';
    case 'coach_not_configured':
    case 'unavailable':
      return 'coachTrack.athlete.errUnavailable';
    case 'signed_out':
      return 'coachTrack.athlete.errSignedOut';
    case 'too_many_invites':
      return 'coachTrack.athlete.errTooMany';
    case 'not_found':
    case 'forbidden':
      return 'coachTrack.athlete.errNotLinked';
    case 'invalid':
      return 'coachTrack.athlete.errInvalid';
    case 'network':
    default:
      return 'coachTrack.athlete.errNetwork';
  }
}
