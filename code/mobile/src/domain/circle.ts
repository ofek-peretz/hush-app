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

/** The ONLY fields that leave the phone. A key added here is a decision, with this header to answer to. */
export const CIRCLE_PAYLOAD_KEYS = ['name', 'done', 'planned'] as const;

export interface CircleWeekPayload {
  name: string;
  done: number;
  planned: number;
}

/** One partner's week, as the server answers it (`at` = when they last reported). */
export interface CircleMember {
  name: string;
  done: number;
  planned: number;
  at: number;
}

export interface CircleState {
  code: string;
  members: CircleMember[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  const done = inputs.sessions.filter((s) => {
    const at = Date.parse(s.startedAt);
    return Number.isFinite(at) && at >= inputs.weekOpenMs && at < weekEnd && sessionCountsAsWorkout(s);
  }).length;
  return { name: first, done: Math.min(14, done), planned: Math.max(0, Math.min(14, inputs.plannedPerWeek)) };
}
