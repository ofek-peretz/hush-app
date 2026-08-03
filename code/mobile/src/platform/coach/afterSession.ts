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
import { health } from '@/platform/health';
import { currentLocale } from '@/i18n';
import { coachFacts } from '@/domain/coachFacts';
import { COACH_DECISION_SCHEMA, COACH_PLAN_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import type { LiveEdit } from '@/domain/liveRevision';
import { applyLearned } from '@/domain/coachLearned';
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
  /**
   * ⛔ CHANGES TO THE WORKOUT SHE IS STANDING IN (founder 2026-08-02).
   *
   * Carried back rather than applied here, and that is deliberate: this module has no session — it
   * runs after one has ENDED, and on a cold start it may run with no screen mounted at all. Only
   * the live session can apply an edit to itself, and only it knows whether the lift is still
   * ahead of her. See `SessionCoach`, which is the caller that has one.
   */
  today?: LiveEdit[];
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

/**
 * ⛔ SHE SAID SOMETHING WHILE THE WORKOUT IS RUNNING (founder 2026-08-02).
 *
 * The only call that can come back with `today` — changes to the session she is standing in. Kept
 * apart from `askCoachToRevise` because that one requires a whole programme in reply, and answering
 * *"the rack is taken"* with a rewritten month is the failure `COACH_PLAN_SCHEMA` exists to prevent.
 */
export async function askCoachInSession(
  why: string,
  images?: { mime: string; data: string }[],
): Promise<CoachUpdate> {
  return runCoachCall({ kind: 'in_session', why, ...(images?.length ? { images } : {}) });
}

/**
 * ════ SHE IS AT THE RACK AND SOMETHING HURTS ════
 *
 * ⛔ FOUNDER, ON BUILD 39: *"On the injury screen you told me explicitly that marking an injury
 * routes to an AI screen where it talks, and what actually appears is the screen that was there
 * before."*
 *
 * `reportPain` already calls `askCoachToRevise` — the PROGRAMME is rebuilt around the rest window.
 * But that answer is for next time, and nothing put a word in front of her now, so `PainResponse`
 * filled the gap with a substitute lift it picked itself out of `swapPool`. That was the last live
 * engine call in any screen in this app.
 *
 * This is the same occasion, asked so that the SENTENCE comes back to the screen. It resolves to
 * the coach's own words, or an empty string if it could not be reached — and an empty string draws
 * nothing at all, because the one thing that must never happen here is the app inventing advice
 * about an injury and letting it read as the coach's.
 */
export async function askCoachAboutPain(
  muscle: string,
  severity: string,
  lift: string | null,
): Promise<string> {
  const update = await askCoachToRevise(
    `She has just reported her ${muscle} hurting (${severity})` +
      (lift ? `, mid-session, on ${lift}` : '') +
      '. The muscle is already resting and her programme has been rebuilt around it. ' +
      'Tell HER, in a sentence or two, what to do about the rest of today.',
  );
  return update.say ?? '';
}

export async function askAfterSession(justFinished: Session): Promise<CoachUpdate> {
  return runCoachCall({ kind: 'after_session', justFinished });
}

/** Failures that could go the other way on a later day. A refusal or an unreadable reply will not. */
const WORTH_ANOTHER_TRY: readonly string[] = ['offline', 'timed_out', 'upstream', 'rate_limited'];

/**
 * ════ THE UPDATE THAT NEVER ARRIVED, ASKED FOR AGAIN WHEN SHE COMES BACK ════
 *
 * ⚠️ WATCHED HAPPEN, 2026-08-02. Gemini was unreachable for two hours — 503s, then 524s at two
 * minutes — and every post-session call in that window died. The app behaved exactly as ruled: it
 * decided nothing, and said the update was waiting. **And nothing ever tried again.** She finishes a
 * workout inside a bad hour, and her next week simply never arrives: no error, no retry, no screen
 * that looks wrong. She would have to open the chat and ask for it.
 *
 * `CoachUpdate.sessionId` has carried a comment since the day it was written — *"so a retry sends
 * the right one, not the newest one"* — and the retry was never built.
 *
 * ── WHY HERE AND NOT INSIDE THE CALL ────────────────────────────────────────────────────────────
 * The ruling `never retries — one workout is one call, and one bill` is about not hammering a model
 * that just failed, and it stands: this does not retry inside the call, and it does not loop. It
 * asks ONCE MORE, on the next occasion she opens the app, which recovers from an outage of any
 * length rather than of twenty seconds — and spends nothing at all on an athlete who never returns.
 *
 * Resolves to null when there is nothing waiting, which is almost always.
 */
export async function retryWaitingUpdate(): Promise<CoachUpdate | null> {
  const last = await db.loadCoachUpdate().catch(() => null);
  if (!last || last.outcome !== 'waiting') return null;
  // `not_configured` means she has no profile yet; a refusal or an unreadable answer will be refused
  // and unreadable again. Only the kinds of nothing that are about the moment are worth re-asking.
  if (!last.trouble || !WORTH_ANOTHER_TRY.includes(last.trouble)) return null;
  const history = await db.loadHistory().catch(() => []);
  const session = history.find((s) => s.id === last.sessionId);
  // The session it was about is gone (a wipe, a very old update). There is nothing to decide from,
  // and deciding from the NEWEST session instead would answer a question nobody asked.
  if (!session) return null;
  return runCoachCall({ kind: 'after_session', justFinished: session });
}

type Occasion =
  | { kind: 'after_session'; justFinished: Session }
  | { kind: 'revise'; why: string }
  | { kind: 'in_session'; why: string; images?: { mime: string; data: string }[] };

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
    const [profile, plan, history, decided, prefs, cardio, brief, external] = await Promise.all([
      db.loadProfile(),
      // The programme the coach wrote LAST time. It is being asked to revise it, so it has to see
      // it — this used to hand over the engine's `Program`, which for a coach-led athlete is empty.
      db.loadCoachPlan(),
      db.loadHistory(),
      db.loadCoachLog(),
      db.loadPreferences(),
      db.loadCardio(),
      // ⚠️ WHO SHE IS. This call sends no conversation at all — only her record — so without the
      // brief her goal, her history and everything she has ever asked for are simply not in the
      // message that decides what she trains next.
      db.loadCoachBrief(),
      /*
       * ⚠️ WHAT ELSE SHE DID THIS WEEK, from her watch — the football, the spin class, the swim.
       * Without it the coach believes a footballer who played on Tuesday rested on Tuesday, and
       * writes him a heavy leg day for Wednesday. Fourteen days is the window a coach actually
       * reasons over; anything older is history, not context. Never throws: an athlete with no
       * Health connection returns an empty list, which is the honest answer.
       */
      health.recentWorkouts(Date.now() - 14 * 86_400_000).catch(() => []),
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
      // The runs she does on her own. Without them the coach writes her a 5 km Tuesday knowing
      // nothing about the 10 km she ran on Sunday.
      cardio,
      ...(external.length ? { external } : {}),
      ...(brief?.length ? { brief } : {}),
      language: currentLocale(),
    });

    const reply = await askCoach(
      coachRequest({
        facts,
        ask:
          occasion.kind === 'after_session'
            ? { kind: 'after_session' }
            : occasion.kind === 'in_session'
              ? { kind: 'in_session', why: occasion.why }
              : { kind: 'revise', why: occasion.why },
      }),
      /*
       * The DECISION schema, not the plan schema: on these calls `sessions` is required, so omitting
       * it is not something the model can do. Prose asked for it first and prose lost — see
       * `COACH_DECISION_SCHEMA`.
       *
       * ⚠️ EXCEPT MID-SESSION. She asked one question from inside a workout; requiring a whole
       * programme back would answer "my shoulder is tight" with a rewritten month and bill for it.
       */
      (occasion.kind === 'in_session' ? COACH_PLAN_SCHEMA : COACH_DECISION_SCHEMA) as unknown as Record<string, unknown>,
    );
    if (!reply.ok) return settle({ at, outcome: 'waiting', sessionId, trouble: reply.reason });

    const parsed = parseCoachPlan(reply.text, facts);
    if (!parsed.ok) return settle({ at, outcome: 'waiting', sessionId, trouble: parsed.reason });

    // The same seam the chat uses. Two callers, one order of writes — see `db.recordCoachAnswer`.
    await db.recordCoachAnswer(parsed.answer, at);

    /*
     * ⚠️ AND WHAT IT LEARNED ABOUT HER, WHICH THIS PATH WAS DROPPING ON THE FLOOR.
     *
     * The chat applies `learned`; this call did not — and it is the call that produces one on every
     * single reply, because a plan's own `sessions.length` IS how many days a week she trains. So a
     * coach that decided she should drop to three days wrote three sessions, the profile kept
     * saying four, and the next sheet told it four again under a bound reading "write exactly that
     * many sessions". **The coach could not change her training frequency.**
     *
     * Written straight to the record because this runs with no React around it — she has finished
     * and left. The screens re-read on focus (`refreshProfile`).
     */
    if (parsed.answer.learned && profile) {
      const applied = applyLearned(profile, parsed.answer.learned);
      if (applied) await db.saveProfile(applied.profile);
    }
    return settle({
      at,
      outcome: parsed.answer.plan ? 'decided' : 'spoke',
      sessionId,
      say: parsed.answer.say,
      ...(parsed.answer.today?.length ? { today: parsed.answer.today } : {}),
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
