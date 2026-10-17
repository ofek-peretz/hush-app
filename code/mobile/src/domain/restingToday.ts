/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE REST SHE WAS PROMISED HOLDS ON A WEEK NOBODY REBUILDS (2026-10-17)
 *
 * When she reports pain the app answers her in plain words — *"העבודה על ה{{muscle}} נחה ל־{{days}}
 * ימים — ואז היא חוזרת מעצמה"* — and for the workout she is standing in it keeps the promise at once
 * (`PainWhere` → `liftsForbiddenNow` → `reviseToday`). Every LATER workout was protected by one thing
 * only: `reportPain` rebuilding the programme without the forbidden movements. And that rebuild is
 * refused for any week she or a coach or the model wrote (`engineMayRebuild` — a week she brought is
 * not ours to rewrite), which since 2026-09-28 is every athlete's week. So the next shoulder day
 * opened on the press she had just said hurt.
 *
 * The answer is not to rewrite her week — the week stays exactly as it was written, and returns whole
 * the day the window closes. It is to leave the resting movements out of the WORKOUT she starts while
 * the window is open, by the same table that decides it for the workout she is in (`painReport`), so
 * today and every day until the window ends forbid exactly the same lifts.
 *
 * ⚠️ NEVER THE WHOLE DAY. A day whose every lift rests is not emptied out from under her: it is left as
 * written, the same refusal `applyLiveEdit` makes for a drop that would leave nothing in front of her.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseById } from '@/data/exercises';
import type { PlannedSession } from '@/domain/coachPlan';
import { liftsForbiddenNow, type PainEase } from '@/domain/painReport';

/** The lifts of a day that rest right now — empty when none do, or when every one would. */
export function restingLifts(
  exerciseIds: readonly string[],
  eases: readonly PainEase[] | null | undefined,
  nowMs: number,
): Set<string> {
  const unique = [...new Set(exerciseIds)];
  const gone = liftsForbiddenNow(unique, eases ?? undefined, nowMs, (id) => exerciseById(id)?.pattern);
  if (gone.length === 0 || gone.length >= unique.length) return new Set();
  return new Set(gone);
}

/** The workout she starts, without its resting lifts. The same object when nothing rests. */
export function sessionWithoutResting(
  session: PlannedSession,
  eases: readonly PainEase[] | null | undefined,
  nowMs: number,
): PlannedSession {
  const resting = restingLifts(
    session.blocks.flatMap((b) => b.items.map((i) => i.ex)),
    eases,
    nowMs,
  );
  if (resting.size === 0) return session;
  // A superset that loses one lift is a straight set of the other — the block carries the coupling.
  const blocks = session.blocks
    .map((b) => ({ ...b, items: b.items.filter((i) => !resting.has(i.ex)) }))
    .filter((b) => b.items.length > 0);
  return { ...session, blocks };
}

/** A whole week as Today shows it — each workout without its resting lifts. The same object when nothing rests. */
export function planWithoutResting<P extends { sessions: PlannedSession[] }>(
  plan: P | null | undefined,
  eases: readonly PainEase[] | null | undefined,
  nowMs: number,
): P | null | undefined {
  if (!plan) return plan;
  const sessions = plan.sessions.map((s) => sessionWithoutResting(s, eases, nowMs));
  return sessions.every((s, i) => s === plan.sessions[i]) ? plan : { ...plan, sessions };
}
