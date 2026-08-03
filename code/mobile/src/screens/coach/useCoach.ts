/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * useCoach — the wire between the chat screen and the coach.
 *
 * `CoachChat` is a view: turns in, text out. `askCoach` is a transport: bytes out, bytes back.
 * This is the only thing that knows they are the same conversation, and it holds the four decisions
 * that a chat UI gets wrong by default.
 *
 * ── 1. WHAT SHE SAID IS NEVER LOST ──────────────────────────────────────────────────────────────
 * A failed send leaves her words in the thread, marked `failed`. It does not clear the composer's
 * text into nowhere and it does not show a toast that scrolls away. She can see the message that
 * did not arrive, which is the only version of this that lets her decide what to do.
 *
 * ── 2. NOTHING IS RETRIED, AND NOTHING IS DECIDED LOCALLY ───────────────────────────────────────
 * The founder's ruling, and it is absolute: **no connection → nothing is decided; the app says so
 * and the update waits.** There is no second decider here, no cached answer, no "meanwhile". A
 * silent retry would also be a second bill for one message.
 *
 * ── 3. A LATE REPLY TO AN OLD MESSAGE IS DISCARDED ──────────────────────────────────────────────
 * The composer stays usable while the coach is thinking — deliberately, because a text field that
 * locks up mid-thought is the thing everyone hates about chat UIs. That permits two calls in
 * flight, and the network does not promise they come back in order. Each call carries a sequence
 * number and a reply that is not the newest is dropped: an answer to her previous question,
 * arriving after the answer to her latest one, reads as the coach losing the thread.
 *
 * ── 4. THE WHOLE CONVERSATION GOES BACK EVERY TIME ──────────────────────────────────────────────
 * The model holds nothing between calls. Every turn she has said and every turn it has said travels
 * with each request, below the cache breakpoint — see `coachPrompt`. Including the failed ones: she
 * said them, and they never reached anybody.
 *
 * ── 5. AND IT SURVIVES THE APP DYING ────────────────────────────────────────────────────────────
 * The thread is persisted after every change. The intake is a long conversation and losing it means
 * being asked everything again — the single worst thing this screen could do to someone, and the
 * default behaviour of a hook that keeps its state in `useState` and nothing else.
 *
 * The DECISIONS are written separately, to `coachLog`, and that is the return path the founder
 * identified: the reason the coach gave comes back to the coach next time, which is what stops
 * month three contradicting month one. The transcript ages out under a cap; the decisions do not.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { db, type PersistedCoachTurn } from '@/data/local/db';
import { chatRemaining, spendChat } from '@/domain/coachQuota';

import type { CoachFacts } from '@/domain/coachFacts';
import { COACH_DECISION_SCHEMA, COACH_PLAN_SCHEMA, parseCoachPlan, type CoachAnswer, type UnreadableReason } from '@/domain/coachPlan';
import { coachRequest, type CoachSaid } from '@/domain/coachPrompt';
import { askCoach, type CoachFailure } from '@/platform/coach/coachClient';
import type { CoachTurn } from './CoachChat';

/**
 * Why a turn has no answer beside it.
 *
 * Both halves of the picture in one enum: `CoachFailure` is the call not arriving, `UnreadableReason`
 * is it arriving as something we could not read. Counted together, per model, they are the only
 * honest comparison between a cheap model and an expensive one on our own athletes' data.
 */
export type CoachTrouble = CoachFailure | UnreadableReason | 'quota_spent';

/** What a completed call cost, as the provider reported it. Never estimated here. */
export interface CoachCallMeta {
  /** Which model answered — stamped by the Worker, never chosen by the app. */
  model: string;
  /**
   * Token counts, verbatim. On Gemini this carries `thoughtsTokenCount`, which is billed at the
   * OUTPUT rate and is the one number that can make the measured cost diverge from the estimate.
   */
  usage: Record<string, number> | null;
}

export interface UseCoachOptions {
  /** Her sheet. The caller owns it, because the caller is the one that knows when it changed. */
  facts: CoachFacts;
  /** Intake is the first conversation — no record yet, and the coach is told to build when ready. */
  mode: 'intake' | 'chat';
  /**
   * Whether she is paying, for the chat allowance (`domain/coachQuota`).
   *
   * Only CHAT is counted. The intake is never capped — she cannot get a programme without it, so a
   * limit there does not ration a conversation, it says "you cannot finish signing up" — and the
   * post-session call is what she is paying for in the first place.
   */
  entitled?: boolean;
  /**
   * A turn arrived. Fires for EVERY answer, whether or not it carried a programme.
   *
   * The programme half is `answer.plan`, and it is `null` on most turns. Persisting it, appending
   * to the coach's log and putting it in front of her are the caller's job — this hook holds a
   * conversation, it does not own the athlete's programme.
   *
   * `meta` is what the call actually cost, as the provider reported it. Carried rather than dropped
   * because the model was chosen on an ESTIMATE — $2.61 per athlete per year assuming ~1,200 output
   * tokens — and 3.x bills its thinking as output and thinks by default. The first live call spent
   * 83 thinking tokens to answer "reply OK". Nothing here acts on the number; it just refuses to
   * throw away the only evidence that would ever correct that estimate.
   */
  onAnswer?: (answer: CoachAnswer, meta: CoachCallMeta) => void;
  /** Something went wrong, with which kind. For counting; the thread already shows her the state. */
  onTrouble?: (trouble: CoachTrouble) => void;
}

export interface UseCoach {
  turns: CoachTurn[];
  busy: boolean;
  /**
   * Her turn. `images` are already resized and encoded — see `coachImage`.
   *
   * They are NOT stored in the thread: the transcript is text, it is what is replayed to the coach
   * on every later turn, and replaying a photograph on every turn for the rest of her membership
   * would be the most expensive thing in the product. The coach reads the picture once and writes
   * what it took from it into `brief`, which is exactly what that field is for.
   */
  send: (text: string, images?: { mime: string; data: string }[]) => void;
}

/** Ids that are stable within a session and never collide. `Date.now()` alone does, on a fast tap. */
let nextId = 0;
const makeId = () => `t${(nextId += 1)}`;

export function useCoach({ facts, mode, entitled = false, onAnswer, onTrouble }: UseCoachOptions): UseCoach {
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [inFlight, setInFlight] = useState(0);
  /** Hydration has finished. Until it has, nothing may be written — see the effect below. */
  const hydrated = useRef(false);

  /*
   * The sequence number lives in a ref, not in state.
   *
   * It must be readable and writable synchronously inside `send` — two taps in the same tick would
   * both read the same stale value from state and both believe they are newest, which is exactly the
   * race this exists to close.
   */
  const latest = useRef(0);
  /** The thread, readable synchronously. `turns` state is for rendering; this is for the request. */
  const thread = useRef<CoachTurn[]>([]);

  const write = useCallback((next: (prev: CoachTurn[]) => CoachTurn[]) => {
    thread.current = next(thread.current);
    setTurns(thread.current);
    // `pending` is deliberately not stored: it is a phase, and restoring one would show her a
    // message that is for ever about to be sent. `failed` is a fact and does survive.
    void db.saveCoachThread(
      thread.current.map(({ id, by, text, failed }) => ({ id, by, text, ...(failed ? { failed: true as const } : {}) })),
    );
  }, []);

  /*
   * Read the conversation back at mount, once.
   *
   * The guard matters more than it looks. Without it a slow read can land AFTER she has already
   * typed something — the app was responsive, she used it, and the stored thread would overwrite
   * what she just said. So a hydration that arrives late is DISCARDED rather than applied: the
   * live conversation always wins over the stored one.
   */
  useEffect(() => {
    let cancelled = false;
    void db.loadCoachThread().then((stored) => {
      if (cancelled || hydrated.current || thread.current.length > 0) return;
      hydrated.current = true;
      if (!stored?.length) return;
      thread.current = stored.map((s: PersistedCoachTurn) => ({ id: s.id, by: s.by, text: s.text, ...(s.failed ? { failed: true } : {}) }));
      setTurns(thread.current);
      // Ids came from a previous run's counter. Restart above them or the next turn collides with
      // a restored one, and React reuses the wrong row.
      nextId = Math.max(nextId, stored.length);
    });
    return () => { cancelled = true; };
  }, []);

  const send = useCallback(
    async (text: string, images?: { mime: string; data: string }[]) => {
      const said = text.trim();
      if (said.length === 0) return;

      const id = makeId();
      write((prev) => [...prev, { id, by: 'athlete', text: said, pending: true }]);

      const settleTrouble = (trouble: CoachTrouble) => {
        write((prev) => prev.map((tn) => (tn.id === id ? { ...tn, pending: false, failed: true } : tn)));
        onTrouble?.(trouble);
      };

      /*
       * ════ THE ALLOWANCE, SPENT BEFORE THE CALL AND NOT AFTER ════
       *
       * Checked and decremented here rather than on the reply, because a call that goes out has
       * already cost the money whether or not it comes back. Counting successes would let a flaky
       * network be free — and it is the same money either way.
       *
       * Her message STAYS in the thread, marked, exactly as it does when the network fails. She
       * wrote it; it is hers; the app does not get to delete it because it declined to send it.
       */
      if (mode === 'chat') {
        const stored = await db.loadCoachQuota().catch(() => null);
        if (chatRemaining(stored, entitled).remaining <= 0) {
          settleTrouble('quota_spent');
          return;
        }
        void db.saveCoachQuota(spendChat(stored, entitled));
      }

      const seq = (latest.current += 1);
      setInFlight((n) => n + 1);

      // Every turn so far, hers last. Failed ones included — she said them and nobody received them.
      const conversation: CoachSaid[] = thread.current.map((tn) => ({
        from: tn.by === 'athlete' ? ('her' as const) : ('coach' as const),
        text: tn.text,
      }));

      const request = coachRequest({
        facts,
        ask: mode === 'intake' ? { kind: 'intake', turns: conversation } : { kind: 'chat', turns: conversation },
        // Chat caches from day one: several messages minutes apart in one sitting, so every message
        // after the first reads a warm prefix. See the economics in `coachPrompt`.
        cache: true,
      });

      // Her message is marked failed wherever it is in the thread — she may have sent others since.
      const settle = settleTrouble;

      /**
       * ════ THE INTAKE'S ONE RE-ASK ════
       *
       * ⚠️ MEASURED, TWICE, AGAINST THE LIVE MODEL (2026-08-02). Handed a first message containing
       * her goal, her injury, her weight, her days and her minutes, the coach replied *"I'm Hush.
       * I've built you a three-day plan for the half marathon"* — filled `learned` and `brief`
       * perfectly, and attached **no sessions at all**. `finishReason: STOP`: not truncated, simply
       * finished. She would have read that sentence, looked at her week, and found nothing there.
       *
       * The preamble already forbids it in capitals, and the intake ask was rewritten to make it a
       * hard branch. **Both failed.** A programme is fifteen hundred tokens of work and the schema
       * lets it be omitted; acknowledging is the cheaper move and the model takes it.
       *
       * So the fix is not more prose. `COACH_DECISION_SCHEMA` is the same schema with `sessions` in
       * `required` — the one used after a workout, where omitting it stops being something the model
       * can do. This re-asks with it, ONCE.
       *
       * ⛔ AND THE TRIGGER WAS A GUESS THAT MISSED — founder, on the device, 2026-08-02: *"he says
       * 'here is your plan' and in practice nothing is shown."*
       *
       * It used to fire only when the coach reported her `daysPerWeek` on that same turn. Watched
       * failing on a real three-turn conversation: she gives her days on turn 2, the coach announces
       * the programme on turn 3, and `learned` on turn 3 carries her session length instead. **The
       * one turn that needed the re-ask was the one turn that could not have it**, and the guess
       * looked right for as long as the whole intake fitted in a single message.
       *
       * The signal is `next` now — the coach states which of its two moves it made, in a field
       * rather than in prose, so a claim of "built" with nothing attached is caught on any turn and
       * in any language. `daysPerWeek` is kept beside it: an older reply carries no `next` at all,
       * and between them they cover both shapes of the same failure.
       *
       * ── AND THE SECOND CALL IS THE ONE THAT THINKS ──────────────────────────────────────────────
       * `low` on the first: it is a conversational turn, thinking buys nothing, and it comes back in
       * a few seconds instead of ninety-nine (measured, on the turn that built). Full strength on
       * the re-ask, because that one is writing her week and `low` writes a one-exercise week.
       */
      const askOnce = (schema: unknown, think?: 'low') =>
        askCoach(request, schema as Record<string, unknown>, think);

      void askOnce(COACH_PLAN_SCHEMA, 'low')
        .then(async (first) => {
          if (!first.ok) return first;
          const read = parseCoachPlan(first.text, facts);
          if (!read.ok || read.answer.plan) return first;
          /*
           * ⛔ AND THIS IS NO LONGER INTAKE-ONLY — founder, testing his own foundation stones,
           * 2026-08-02. He asked in CHAT to move from the barbell to the machine. The coach reasoned
           * it correctly ("you pressed 40 on the bar, start with 40 on the machine") and attached
           * `sessions: 0`. She would read that she had moved, open her programme, and find the bar.
           *
           * It is the identical defect he caught in the intake — *"he says here is your plan and
           * nothing is shown"* — and chat was excluded from the fix by one clause on this line,
           * which is precisely where an athlete asks for a change.
           *
           * `next` now means the same thing on every occasion (see `howToAnswer`), so the signal is
           * the same everywhere and this guard does not need to know which conversation it is in.
           */
          if (read.answer.next !== 'built' && read.answer.learned?.daysPerWeek == null) return first;
          const retried = await askOnce(COACH_DECISION_SCHEMA);
          /*
           * ⛔ THE RETRY IS ONLY AN IMPROVEMENT IF IT ACTUALLY CARRIES A PROGRAMME.
           *
           * `retried.ok` is about the CALL, not the answer — and those come apart in a way that was
           * watched happening. `COACH_DECISION_SCHEMA` puts `sessions` in `required`, so a coach
           * that would rather keep asking satisfies it with an EMPTY ARRAY: measured, five out of
           * five, when the schema was forced on a turn the coach considered too early.
           *
           * An empty programme fails the parse as `no_sessions` — deliberately, because handing her
           * a week of nothing is worse than saying the update is waiting. But the old line here
           * returned that reply anyway, so the outer `.then` reported the parse failure, her
           * message was marked failed, and **a perfectly good first answer that had already been
           * received was thrown away.** The re-ask could make the turn worse than not re-asking.
           *
           * So it is kept only if it parses into a plan. Her first answer still stands otherwise —
           * it has her sentence in it, and a lost turn is worse than a turn without a programme.
           */
          if (!retried.ok) return first;
          const second = parseCoachPlan(retried.text, facts);
          return second.ok && second.answer.plan ? retried : first;
        })
        .then(async (reply) => {
          // A reply to a message she has already followed with another one. Dropping it is the
          // point: shown, it reads as the coach answering the wrong question.
          if (seq !== latest.current) return;

          if (!reply.ok) return settle(reply.reason);

          const parsed = parseCoachPlan(reply.text, facts);
          if (!parsed.ok) return settle(parsed.reason);

          write((prev) => [
            ...prev.map((tn) => (tn.id === id ? { ...tn, pending: false } : tn)),
            { id: makeId(), by: 'coach', text: parsed.answer.say },
          ]);
          /*
           * THE DECISION LANDS, through the one seam that both callers share (`recordCoachAnswer`).
           * The programme is stored and every reason is written where the NEXT call reads it back
           * as `coachFacts.decided` — the return path.
           *
           * ⛔ AND IT IS AWAITED, WHICH IT WAS NOT. The comment here already claimed the guarantee —
           * *"done before the caller is told, so a caller that navigates away on receipt cannot
           * outrun it"* — and the line under it was `void`. The caller outran it every time.
           *
           * ⚠️ FOUND ON THE DEVICE BY THE FOUNDER, 2026-08-02: *"he moved me straight to the
           * transition screen without showing me the plan."* `ProgramCreated` reads the programme
           * with `db.loadCoachPlan()` on mount, and the write had not finished — so the screen built
           * to show her the week she was just given raced the week and lost.
           *
           * A comment asserting a guarantee is not the guarantee. This is the second time today
           * that exact shape has cost something.
           */
          await db.recordCoachAnswer(parsed.answer, new Date().toISOString());
          onAnswer?.(parsed.answer, { model: reply.model, usage: reply.usage });
        })
        .finally(() => {
          setInFlight((n) => Math.max(0, n - 1));
        });
    },
    [facts, mode, onAnswer, onTrouble, write],
  );

  return { turns, busy: inFlight > 0, send };
}
