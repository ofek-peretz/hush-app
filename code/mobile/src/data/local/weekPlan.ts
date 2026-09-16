/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK SHE IS ON — one read, whoever wrote it.
 *
 * ⛔ FOUNDER, 2026-08-12, naming the third thing that would actually improve her product: the whole
 * surface layer is still shaped around a `CoachPlan`, *"the shape of an AI that no longer writes"*,
 * and every feature pays that tax.
 *
 * ── WHAT THIS CLOSES ──────────────────────────────────────────────────────────────────────────────
 * Nine screens call `db.loadCoachPlan()` directly. That was correct while the coach wrote the
 * programme and stopped being correct the day the engine took it back — `db.recordCoachAnswer` has
 * one caller left and it only runs after a session, so on the engine's path the key is empty and
 * every one of those reads answers `null`.
 *
 * Today was fixed on 2026-08-11 by bridging in place. That fixed ONE screen and created a worse
 * problem: a second screen fixed the same way would be a SECOND bridge, and two bridges drift. The
 * pre-workout card, the share sheet, the Saturday letter, the profile's "you have a programme" flag
 * — each of them was a `null` waiting to be noticed, and the last one of those cost a day.
 *
 * So there is one door. A stored `CoachPlan` wins when one exists; otherwise the engine's `Program`
 * is presented in the same shape (`domain/enginePlan`), with the engine's own loads on it.
 *
 * ── ⚠️ WHY A BRIDGE AND NOT A REWIRING ───────────────────────────────────────────────────────────
 * Rewiring nine surfaces onto `Program` is days of work on code that currently functions, and it
 * would delete the one abstraction that can hold a coach's programme — which is where the product is
 * going, not where it has been. `CoachPlan` is a strictly WIDER vocabulary than `Program`: a run, a
 * plank and an execution note have no home in a `Slot`. The engine speaks the narrow subset; the
 * conversion loses nothing.
 *
 * ⚠️ AND IT IS A DEBT, NAMED AS ONE. The exit is not "rewire the screens" — it is that whatever
 * writes her week next (the coach track, an imported programme) writes a `CoachPlan` directly, and
 * this function quietly stops needing its second branch.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { db } from '@/data/local/db';
import { fixtureModel } from '@/data/api/fixtureModel';
import { coachPlanFromProgram, bandFromChoice } from '@/domain/enginePlan';
import type { CoachPlan } from '@/domain/coachPlan';

/**
 * Her week, from whoever decided it — or `null` when nothing has.
 *
 * ⚠️ NEVER THROWS. Every caller is a screen, and a storage read that rejects is a blank surface with
 * no explanation. A failure here is indistinguishable from "no programme yet", which is a real and
 * ordinary state.
 */
export async function loadWeekPlan(): Promise<CoachPlan | null> {
  const stored = await db.loadCoachPlan().catch(() => null);
  if (stored) return stored;

  const program = await db.loadProgram().catch(() => null);
  if (!program) return null;

  /*
   * The loads are the ENGINE's, read rather than computed — every one was decided at the end of her
   * last workout (L7). `sessionTargets` ignores the day id and answers for the whole programme, so
   * one call covers the week.
   */
  const targets = await fixtureModel
    .sessionTargets({ programDayId: program.days[0]?.id ?? '', completedSessions: 0 })
    .catch(() => []);
  const profile = await db.loadProfile().catch(() => null);
  return coachPlanFromProgram(program, targets, bandFromChoice(profile?.repBand));
}
