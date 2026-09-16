/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SESSION EARNED — from the coach, now that the engine decides nothing between sessions.
 *
 * `getSessionEarnedV5` read a `changeLog` the between-session fold wrote. The fold is deleted, so
 * that log is never written again and the surface it fed — the last beat of Well Done, "what
 * changed and why" — would come back empty forever. This is where it reads from instead.
 *
 * ── THE SHAPE OF THE ANSWER CHANGED, AND IT IS WORTH SAYING WHY ─────────────────────────────────
 * The engine narrated in i18n KEYS: `{ key: 'engine.raisedAfterClear', params: { load: 42.5 } }`.
 * It had to — it was a machine assembling a sentence, and the app ships in two languages.
 *
 * The coach writes the sentence itself, in her language, because it was asked to. So a line's
 * reason is now either a key (anything the app still says in its own voice) or LITERAL TEXT (what
 * the coach said). Keeping only keys would mean translating the coach's prose into an enum and
 * losing every particular in it — "your last two sessions ended short" becomes `endedShort`, and
 * the reason she is owed becomes a category.
 *
 * ── THE THREE STATES, AND WHY "THINKING" IS ONE OF THEM ─────────────────────────────────────────
 * The engine answered in a millisecond, so a screen could assume the answer existed by the time it
 * drew. The coach takes about fifteen seconds. Pretending otherwise gives her an empty list that
 * means "nothing changed" when the truth is "not yet" — the one confusion this surface cannot
 * afford, because a workout that changed nothing is a real and common answer (a hold).
 *
 * Pure and I/O-free. The caller supplies the update and the log.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import type { CoachDecision } from './coachLog';
import type { CoachUpdate } from '@/platform/coach/afterSession';

/** What the coach did with the session she just finished, as a screen needs to know it. */
export type CoachVerdict =
  /** The call is out and has not landed. Not "nothing changed" — not yet. */
  | { state: 'thinking' }
  /** A programme arrived. `say` is the coach's sentence about it; `lines` are the per-lift reasons. */
  | { state: 'decided'; say: string; lines: CoachEarnedLine[] }
  /** The coach answered and attached no programme, or never answered. Nothing changed. */
  | { state: 'waiting'; say: string | null };

/** One "what changed" line — the lift, and the coach's own sentence for it. */
export interface CoachEarnedLine {
  /** The lift or movement it is about, or null when the note is about the whole programme. */
  ex: string | null;
  say: string;
}

/**
 * The verdict for one finished session.
 *
 * `at` matches on the update's own timestamp rather than on "recent", because two sessions in one
 * day are two decisions and a window would blend them. The decisions written by THIS call carry
 * exactly the instant it settled — `db.recordCoachAnswer` stamps them with it.
 */
export function coachVerdict(
  sessionId: string,
  update: CoachUpdate | null,
  log: CoachDecision[],
  deciding: boolean,
): CoachVerdict {
  // No update for THIS session yet. If a call is out, say so; if not, there is nothing to report.
  if (!update || update.sessionId !== sessionId) {
    return deciding ? { state: 'thinking' } : { state: 'waiting', say: null };
  }
  if (update.outcome !== 'decided') {
    // `spoke` and `waiting` are different faults with different fixes, and they are counted apart —
    // but to her they are one fact: nothing changed. Saying "the coach replied but did not decide"
    // would be true and useless.
    return { state: 'waiting', say: update.say ?? null };
  }
  return {
    state: 'decided',
    say: update.say ?? '',
    lines: log
      .filter((d) => d.at === update.at)
      .map((d) => ({ ex: d.ex ?? null, say: d.say })),
  };
}

/* ──────────────────────────────────────────────────────────── THE WEEK, IN THE COACH'S OWN WORDS */

/**
 * What the coach changed since the week opened, and how many decisions that was.
 *
 * The engine's briefing assembled a sentence out of parts — it sorted the raises by STEP SIZE so
 * "I put 5 kg on your row" led rather than "your squat is still the heaviest thing you do", it
 * counted swaps separately from loads, and it had a phrase for a steady week. All of that was the
 * work of a machine that had numbers and no language.
 *
 * The coach has language. Its decisions arrive already written, so the briefing's whole job
 * collapses to: which of them belong to this week, in the order they were made, and how many. The
 * sorting rule is gone with the assembly — it existed to pick a headline out of a bag of deltas,
 * and a coach that writes its own first sentence does not need one chosen for it.
 *
 * `null` and `[]` are different answers and must stay different: null is "nothing has been decided
 * for this athlete yet" (her first week — a baseline, not a decision), `[]` is "this week, nothing
 * changed", which is a verdict she is owed in words.
 */
export function coachBrief(
  log: CoachDecision[] | null | undefined,
  weekOpenMs: number | null,
): { count: number; lines: CoachEarnedLine[] } | null {
  if (!log) return null;
  // No decision has ever been recorded — the athlete is inside her first week and the coach has
  // given her a starting point rather than a change. The engine drew this distinction too, and it
  // mattered for the same reason: a week with no update and a week where nothing moved read
  // identically as "zero changes", and they are two completely different sentences.
  if (log.length === 0) return null;
  const since = weekOpenMs ?? 0;
  const lines = log
    .filter((d) => {
      const t = Date.parse(d.at);
      return Number.isFinite(t) && t >= since;
    })
    .map((d) => ({ ex: d.ex ?? null, say: d.say }));
  return { count: lines.length, lines };
}
