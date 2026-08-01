/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * AFTER THE SESSION — the call the whole product is built around.
 *
 * The founder described it in one sentence and it has not changed since:
 *
 *   > *"It is exactly like me going to train now and sending you all the data from the workout and
 *   > saying — now decide what happens from here. That's it."*
 *
 * So: a workout ends, everything measured about it goes to the coach, and the coach decides the
 * next programme. There is no second decider and no local fallback. That is a ruling, not a
 * default — **no connection → nothing is decided; the app says so and the update waits.**
 *
 * ── IT MUST NEVER BLOCK ANYTHING ────────────────────────────────────────────────────────────────
 * She has finished and left. This runs after the session is saved, off to one side, and it cannot
 * throw, cannot delay Well Done, and cannot fail a workout. A finished workout is finished whatever
 * happens here — the session is already in history before this is called, and nothing below can
 * take it back out.
 *
 * ── AND IT MUST LEAVE A HONEST TRACE ────────────────────────────────────────────────────────────
 * The one thing worse than the update not arriving is the app not knowing that. If this fails,
 * `hush.coach.pending` records WHICH session was never processed, so a surface can say the update
 * is waiting in words and offer to try again. It does NOT retry by itself: a post-session call that
 * quietly retries three times is three bills for one workout, and nobody is waiting on it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { db } from '@/data/local/db';
import { coachFacts } from '@/domain/coachFacts';
import { COACH_DECISION_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { coachRequest } from '@/domain/coachPrompt';
import type { Session } from '@/data/local/models';
import { askCoach } from './coachClient';
import type { CoachFailure } from './coachClient';
import type { UnreadableReason } from '@/domain/coachPlan';

/** Why there is no new programme, or that there is one. Countable, per model, on real data. */
export type CoachUpdateOutcome =
  /** A programme arrived and is stored. */
  | 'decided'
  /**
   * The coach answered and attached NO programme, on the one call where one is required.
   *
   * Kept as its own outcome rather than folded into `waiting` because it is a different fault with
   * a different fix: the network was fine and the model ignored an instruction. It was the first
   * thing the first live post-session call did — replying *"I have increased your bench press load
   * to 32.5 kg"* with no `sessions`, which is a promise the app cannot keep. **A surface must treat
   * this exactly like `waiting`: nothing changed.** Counting it separately is how we find out if a
   * model does it often enough to matter.
   */
  | 'spoke'
  /** No answer. Nothing is decided and the previous programme stands. */
  | 'waiting';

export interface CoachUpdate {
  /** When the attempt finished. */
  at: string;
  outcome: CoachUpdateOutcome;
  /** The session this was about — so a retry sends the right one, not the newest one. */
  sessionId: string;
  /** Present only on `waiting`. Which kind of nothing happened. */
  trouble?: CoachFailure | UnreadableReason;
  /** What the coach said, when it said anything. Shown to her; never invented here. */
  say?: string;
}

/**
 * Ask the coach what happens next, and land whatever comes back.
 *
 * Returns the outcome for whoever wants to react to it. It never rejects — every failure is a
 * `waiting` result, because a rejected promise inside a finished workout is a crash report about
 * something that does not affect the workout at all.
 */
export async function askAfterSession(justFinished: Session): Promise<CoachUpdate> {
  const at = new Date().toISOString();
  const settle = async (update: CoachUpdate): Promise<CoachUpdate> => {
    await db.saveCoachUpdate(update).catch(() => {});
    return update;
  };

  try {
    const [profile, program, history, decided] = await Promise.all([
      db.loadProfile(),
      db.loadProgram(),
      db.loadHistory(),
      db.loadCoachLog(),
    ]);
    // No profile is not a coach failure — it is an athlete who has not finished onboarding, and
    // there is nothing to decide about.
    if (!profile) return settle({ at, outcome: 'waiting', sessionId: justFinished.id, trouble: 'not_configured' });

    const facts = coachFacts({
      profile,
      program: program ?? { id: 'none', frequency: profile.daysPerWeek ?? 0, days: [] },
      history,
      justFinished,
      decided,
    });

    const reply = await askCoach(
      coachRequest({ facts, ask: { kind: 'after_session' } }),
      // The DECISION schema, not the plan schema: on this call `sessions` is required, so omitting
      // it is not something the model can do. Prose asked for it first and prose lost — see
      // `COACH_DECISION_SCHEMA`.
      COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
    );
    if (!reply.ok) return settle({ at, outcome: 'waiting', sessionId: justFinished.id, trouble: reply.reason });

    const parsed = parseCoachPlan(reply.text, facts);
    if (!parsed.ok) return settle({ at, outcome: 'waiting', sessionId: justFinished.id, trouble: parsed.reason });

    // The same seam the chat uses. Two callers, one order of writes — see `db.recordCoachAnswer`.
    await db.recordCoachAnswer(parsed.answer, at);
    return settle({
      at,
      outcome: parsed.answer.plan ? 'decided' : 'spoke',
      sessionId: justFinished.id,
      say: parsed.answer.say,
    });
  } catch {
    /*
     * A read failed, storage is full, something threw where nothing should. It still resolves to
     * `waiting` — the difference between "the coach did not answer" and "our own code fell over" is
     * a distinction for the log, and she is owed the same sentence either way.
     */
    return settle({ at, outcome: 'waiting', sessionId: justFinished.id, trouble: 'upstream' });
  }
}
