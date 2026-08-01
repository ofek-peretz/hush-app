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
import { currentLocale } from '@/i18n';
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

/*
 * ════ WHO IS LISTENING, AND WHY THERE HAS TO BE SOMEBODY ════
 *
 * This call is fired and not awaited — she has finished and left, and nothing may block on it. But
 * Well Done opens IMMEDIATELY, and the thing it exists to show is what this call decides. The old
 * engine had the answer before the screen drew, because the answer was computed locally in a
 * millisecond. The coach takes fifteen seconds.
 *
 * So the screen has three honest states — thinking, decided, waiting — and this is how it learns
 * which one it is in. A module-level listener rather than a store: exactly one call can be in
 * flight (one workout just ended), and a whole store for one boolean and one sentence is furniture.
 */
export type CoachUpdateListener = (update: CoachUpdate | null) => void;
const listeners = new Set<CoachUpdateListener>();
/** True from the moment a post-session call starts until it settles. Drives "I am deciding". */
let inFlight = false;

export function coachIsDeciding(): boolean {
  return inFlight;
}

/** Subscribe to the post-session outcome. Returns the unsubscribe. */
export function onCoachUpdate(fn: CoachUpdateListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Ask the coach what happens next, and land whatever comes back.
 *
 * Returns the outcome for whoever wants to react to it. It never rejects — every failure is a
 * `waiting` result, because a rejected promise inside a finished workout is a crash report about
 * something that does not affect the workout at all.
 */
/**
 * Ask the coach to revise the programme because something about HER changed.
 *
 * Three things used to rebuild the week locally and instantly: a pain report, a change to how many
 * days she trains, and undoing an engine rotation. The third went with Loop 2 — nothing rotates any
 * more. The first two are real and still need answering, and the answer is not ours: her sheet
 * already carries the ease and the frequency, so the coach is told what happened and re-decides.
 *
 * ⚠️ IT MATTERS THAT THIS IS IMMEDIATE, NOT DEFERRED TO THE NEXT SESSION. A shoulder that hurts
 * today must not be programmed tomorrow because the next post-session call has not happened yet.
 * The engine's instant reshape was protective, and dropping it in favour of "the coach will see it
 * eventually" would have traded a real safeguard for an architectural tidiness.
 *
 * `why` is stated in her own terms and reaches the coach as a turn: "her shoulder hurts", "she
 * changed to five days a week". No schema of reasons — the sheet carries the facts, this carries
 * what just happened to them.
 */
export async function askCoachToRevise(why: string): Promise<CoachUpdate> {
  return runCoachCall({ kind: 'revise', why });
}

export async function askAfterSession(justFinished: Session): Promise<CoachUpdate> {
  return runCoachCall({ kind: 'after_session', justFinished });
}

type Occasion =
  | { kind: 'after_session'; justFinished: Session }
  | { kind: 'revise'; why: string };

async function runCoachCall(occasion: Occasion): Promise<CoachUpdate> {
  const justFinished = occasion.kind === 'after_session' ? occasion.justFinished : null;
  const at = new Date().toISOString();
  inFlight = true;
  const sessionId = justFinished?.id ?? `revise_${at}`;
  const settle = async (update: CoachUpdate): Promise<CoachUpdate> => {
    await db.saveCoachUpdate(update).catch(() => {});
    inFlight = false;
    // The listeners are a screen that is already open and waiting. A throwing one must not turn a
    // successful decision into the catch below, which would report `waiting` on a landed programme.
    for (const fn of [...listeners]) {
      try {
        fn(update);
      } catch {
        /* a listener's problem is not this call's problem */
      }
    }
    return update;
  };

  try {
    const [profile, plan, history, decided, prefs] = await Promise.all([
      db.loadProfile(),
      // The programme the coach wrote LAST time. It is being asked to revise it, so it has to see
      // it — this used to hand over the engine's `Program`, which for a coach-led athlete is empty.
      db.loadCoachPlan(),
      db.loadHistory(),
      db.loadCoachLog(),
      db.loadPreferences(),
    ]);
    // No profile is not a coach failure — it is an athlete who has not finished onboarding, and
    // there is nothing to decide about.
    if (!profile) return settle({ at, outcome: 'waiting', sessionId, trouble: 'not_configured' });

    const facts = coachFacts({
      profile,
      plan,
      history,
      ...(justFinished ? { justFinished } : {}),
      decided,
      // What she has swapped by hand, and what she has asked to keep. Without these the coach keeps
      // prescribing the lift she silently swaps out every session.
      preferences: { substitutes: prefs.substitutes, keep: prefs.leaveItsByMuscle },
      language: currentLocale(),
    });

    const reply = await askCoach(
      coachRequest({
        facts,
        ask:
          occasion.kind === 'after_session'
            ? { kind: 'after_session' }
            : { kind: 'revise', why: occasion.why },
      }),
      // The DECISION schema, not the plan schema: on this call `sessions` is required, so omitting
      // it is not something the model can do. Prose asked for it first and prose lost — see
      // `COACH_DECISION_SCHEMA`.
      COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
    );
    if (!reply.ok) return settle({ at, outcome: 'waiting', sessionId, trouble: reply.reason });

    const parsed = parseCoachPlan(reply.text, facts);
    if (!parsed.ok) return settle({ at, outcome: 'waiting', sessionId, trouble: parsed.reason });

    // The same seam the chat uses. Two callers, one order of writes — see `db.recordCoachAnswer`.
    await db.recordCoachAnswer(parsed.answer, at);
    return settle({
      at,
      outcome: parsed.answer.plan ? 'decided' : 'spoke',
      sessionId,
      say: parsed.answer.say,
    });
  } catch {
    /*
     * A read failed, storage is full, something threw where nothing should. It still resolves to
     * `waiting` — the difference between "the coach did not answer" and "our own code fell over" is
     * a distinction for the log, and she is owed the same sentence either way.
     */
    return settle({ at, outcome: 'waiting', sessionId, trouble: 'upstream' });
  }
}
