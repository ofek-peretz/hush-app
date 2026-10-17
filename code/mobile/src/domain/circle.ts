/**
 * ════ THE CIRCLE — what may travel between people who train together (2026-08-24) ════
 *
 * The competitive review's retention finding, in Hush's language: belonging works (Ladder's whole
 * business is it), feeds do not belong here. A circle is up to six PARTNERS — not an audience —
 * and the only thing that crosses the wire is this file's allow-list:
 *
 *   · a FIRST name (her own word for herself, first word only, bounded),
 *   · workouts DONE of PLANNED this week,
 *   · nothing else. No loads, no tonnage, no history, no bodyweight, no body map — the exact law
 *     `planShare` already keeps for links, pointed at the weekly fact instead of the plan.
 *
 * Pure and I/O-free: the payload builder is a function of her record, so the law can read the
 * whole surface of what leaves the phone in one place. The wire itself is `platform/circleClient`;
 * the server rebuilds this same allow-list field-by-field on arrival (`server/hush-identity/src/index.ts`), so a
 * tampered client still cannot store more than these three facts about anyone.
 */

//

import type { Session } from '@/data/local/models';
import { sessionCountsAsWorkout } from '@/domain/sessionMetrics';

/**
 * The ONLY fields that leave the phone. A key added here is a decision, with this header to answer to.
 *
 * ⛔ TWO WERE ADDED ON 2026-09-29, BY DECISION (the circle tab — founder: *"תשאיר את זה כך שיהיה
 * רצף"*, and the prototype he walked): `week`, the local date her calendar week opened on, which is
 * the only way a server can line up everyone's weeks into ONE shared streak; and `last`, when her
 * last workout started (the server floors it to the hour), which is what "trained today" and "last
 * trained on Friday" are made of. Neither is a load, a set, a body or a history — a day, and a week.
 */
export const CIRCLE_PAYLOAD_KEYS = ['name', 'done', 'planned', 'week', 'last'] as const;

export interface CircleWeekPayload {
  name: string;
  done: number;
  planned: number;
  /** The local date her calendar week opened on, `YYYY-MM-DD`. */
  week: string;
  /** When her last whole workout started (ms), or null before her first. */
  last: number | null;
}

/** One partner's week, as the server answers it (`at` = when they last reported). */
export interface CircleMember {
  name: string;
  done: number;
  planned: number;
  at: number;
  /** The circle's handle for this member — what a cheer is addressed to (never the account). */
  id?: string;
  /** This row is hers. */
  me?: boolean;
  /** When this member last trained, to the hour. */
  last?: number;
  /** She already cheered this friend today. */
  cheered?: boolean;
}

export interface CircleState {
  code: string;
  members: CircleMember[];
  /** Weeks in a row everyone closed — ONE number for the whole circle (the server counts it). */
  streak?: number;
  /** Cheers she received in the last three days, newest last. */
  cheers?: { from: string; at: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Her calendar week's key — the local date it opened on. Every phone in the circle keys alike. */
export function circleWeekKey(weekOpenMs: number): string {
  const d = new Date(weekOpenMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole calendar days between two moments, in her own time zone — 0 = the same day. */
function calendarDaysBetween(thenMs: number, nowMs: number): number {
  const a = new Date(thenMs);
  const b = new Date(nowMs);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.max(0, Math.round((db - da) / DAY_MS));
}

/** One friend, as the circle tab draws them. */
export interface CircleMemberView {
  id: string | null;
  name: string;
  done: number;
  planned: number;
  /** Calendar days since their last workout — 0 = today; null when they have not said. */
  lastDays: number | null;
  me: boolean;
  cheered: boolean;
}

/**
 * The server's answer, read for THIS week on THIS phone. A row reported before the week opened
 * counts zero done — last week's numbers are last week's. `me` falls back to her first name for a
 * worker that predates the flag. The order is the server's, untouched: this file never orders
 * people (see `circleWeekTotal`).
 */
export function circleMembersView(
  state: CircleState,
  inputs: { nowMs: number; weekOpenMs: number; myName?: string | null },
): CircleMemberView[] {
  const flagged = state.members.some((m) => m.me === true);
  const myFirst = (inputs.myName ?? '').trim().split(/\s+/)[0] ?? '';
  let claimed = false;
  return state.members.map((m) => {
    let me = m.me === true;
    if (!flagged && !claimed && myFirst && m.name === myFirst) {
      me = true;
      claimed = true;
    }
    return {
      id: m.id ?? null,
      name: m.name,
      done: m.at >= inputs.weekOpenMs ? Math.max(0, m.done) : 0,
      planned: Math.max(0, m.planned),
      lastDays: typeof m.last === 'number' ? calendarDaysBetween(m.last, inputs.nowMs) : null,
      me,
      cheered: m.cheered === true,
    };
  });
}

/** The newest cheer she received, or null. */
export function latestCheer(state: CircleState | null): { from: string; at: number } | null {
  const list = state?.cheers ?? [];
  let best: { from: string; at: number } | null = null;
  for (const c of list) if (!best || c.at > best.at) best = c;
  return best;
}

/**
 * ⛔ THE CIRCLE'S INVITE LINK (2026-09-29) — on the brand's domain, like the coach's `/c/`. The
 * landing page (`brand/landing/worker.js`) answers `/k/CODE` for a phone without the app, and the
 * association file hands the path to the app on a phone with it.
 */
export function circleInviteLink(code: string): string {
  return `https://getferrox.com/k/${encodeURIComponent(code)}`;
}

/**
 * Which links are a circle invite: `hush://circle?c=CODE` (the landing page's own button) and
 * `https://…/k/CODE` or `https://…/k?c=CODE`. `/k/` and `/k?` only, never a bare `/k` prefix.
 */
export function circleCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let raw: string | null = null;
  const scheme = /^hush:\/\/circle\/?\?(?:.*&)?c=([^&#]+)/i.exec(url);
  if (scheme) raw = scheme[1];
  else {
    const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/i.exec(url);
    if (!m) return null;
    const path = m[1] ?? '';
    const seg = /^\/k\/([^/]+)\/?$/.exec(path);
    if (seg) raw = seg[1];
    else if (path === '/k' || path === '/k/') raw = /[?&]c=([^&]+)/.exec(m[2] ?? '')?.[1] ?? null;
  }
  if (!raw) return null;
  let code = '';
  try {
    code = decodeURIComponent(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch {
    return null;
  }
  return code.length === 6 ? code : null;
}

/**
 * ════ ⛔ THE WEEK, BETWEEN THEM — ONE NUMBER, AND DELIBERATELY NOT A TABLE (founder, 2026-08-31) ═
 *
 * He asked for *"ליגה מקומית בין חברים של כמה משקל הורם"*, and this is the version I will stand
 * behind. Two arguments decided it, and the second is the stronger one:
 *
 *  1 · §11.2's own design law is *"never side-by-side to rank"*, and the competitive finding this
 *      whole surface came from reads *"belonging works; feeds do not belong here."* A table of
 *      names in order is a feed with a scoreboard on it.
 *
 *  2 · ⛔ AND TONNAGE IS A MEASURE THAT FIGHTS THE ENGINE. It rewards bodyweight, big lifts, and
 *      loading more than you can carry — while Loop 1 exists to take weight OFF the bar when the
 *      reps do not arrive. A leaderboard would pay an athlete to disobey the coach, on the one
 *      screen built to make her feel part of something.
 *
 * So the fact is a SUM: everyone on one side of the number. It also costs nothing to carry, which
 * is not a coincidence — `done` already crosses the wire (`CIRCLE_PAYLOAD_KEYS`), so this needed no
 * new field, no allow-list decision, and no load leaving anybody's phone.
 *
 * ⚠️ HER OWN ROW IS ALREADY IN `members` — the worker answers `/circle` with every member's week,
 * hers included, so this must not add her a second time.
 */
export function circleWeekTotal(members: readonly CircleMember[]): { done: number; people: number } {
  return {
    done: members.reduce((n, m) => n + Math.max(0, m.done), 0),
    people: members.length,
  };
}

/**
 * How many workouts she has actually done WITH somebody, and who — read from her own record.
 *
 * ⛔ NOTHING CROSSES A WIRE FOR THIS. `Session.partners` is stamped at the start of a shared
 * session on both phones (`state/stores/pairStore`, `screens/home/Home`), so the count is a fact
 * about her own history — which is why it works with no circle, no signal and no account.
 *
 * Names are de-duplicated in first-appearance order: the answer to "who" is a short list of people,
 * not a tally of how often each of them showed up, which would be the ranking this file refuses.
 */
export function togetherCount(
  sessions: readonly Session[],
  sinceMs: number,
): { count: number; names: string[] } {
  const names: string[] = [];
  let count = 0;
  for (const s of sessions) {
    const at = Date.parse(s.startedAt);
    if (!Number.isFinite(at) || at < sinceMs) continue;
    const partners = s.partners ?? [];
    if (partners.length === 0) continue;
    count += 1;
    for (const p of partners) {
      const clean = p.trim().slice(0, 20);
      if (clean && !names.includes(clean)) names.push(clean);
    }
  }
  return { count, names };
}

/**
 * Her week, as the circle may see it. `firstName` deliberately takes the first word only — a
 * circle of friends does not need a surname, and the payload never carries more than she would
 * shout across a gym floor.
 */
export function circleWeekPayload(inputs: {
  name: string | null | undefined;
  sessions: readonly Session[];
  plannedPerWeek: number;
  weekOpenMs: number;
}): CircleWeekPayload | null {
  const first = (inputs.name ?? '').trim().split(/\s+/)[0]?.slice(0, 20) ?? '';
  if (!first) return null; // a nameless row tells the circle nothing — nothing is sent
  const weekEnd = inputs.weekOpenMs + WEEK_MS;
  let done = 0;
  let last: number | null = null;
  for (const s of inputs.sessions) {
    const at = Date.parse(s.startedAt);
    if (!Number.isFinite(at) || !sessionCountsAsWorkout(s)) continue;
    if (at >= inputs.weekOpenMs && at < weekEnd) done += 1;
    if (last == null || at > last) last = at;
  }
  return {
    name: first,
    done: Math.min(14, done),
    planned: Math.max(0, Math.min(14, inputs.plannedPerWeek)),
    week: circleWeekKey(inputs.weekOpenMs),
    last,
  };
}
