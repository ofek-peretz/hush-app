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
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useRef, useState } from 'react';

import type { CoachFacts } from '@/domain/coachFacts';
import { COACH_PLAN_SCHEMA, parseCoachPlan, type CoachAnswer, type UnreadableReason } from '@/domain/coachPlan';
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
export type CoachTrouble = CoachFailure | UnreadableReason;

export interface UseCoachOptions {
  /** Her sheet. The caller owns it, because the caller is the one that knows when it changed. */
  facts: CoachFacts;
  /** Intake is the first conversation — no record yet, and the coach is told to build when ready. */
  mode: 'intake' | 'chat';
  /**
   * A turn arrived. Fires for EVERY answer, whether or not it carried a programme.
   *
   * The programme half is `answer.plan`, and it is `null` on most turns. Persisting it, appending
   * to the coach's log and putting it in front of her are the caller's job — this hook holds a
   * conversation, it does not own the athlete's programme.
   */
  onAnswer?: (answer: CoachAnswer) => void;
  /** Something went wrong, with which kind. For counting; the thread already shows her the state. */
  onTrouble?: (trouble: CoachTrouble) => void;
}

export interface UseCoach {
  turns: CoachTurn[];
  busy: boolean;
  send: (text: string) => void;
}

/** Ids that are stable within a session and never collide. `Date.now()` alone does, on a fast tap. */
let nextId = 0;
const makeId = () => `t${(nextId += 1)}`;

export function useCoach({ facts, mode, onAnswer, onTrouble }: UseCoachOptions): UseCoach {
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [inFlight, setInFlight] = useState(0);

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
  }, []);

  const send = useCallback(
    (text: string) => {
      const said = text.trim();
      if (said.length === 0) return;

      const id = makeId();
      write((prev) => [...prev, { id, by: 'athlete', text: said, pending: true }]);

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

      const settle = (trouble: CoachTrouble) => {
        // Her message is marked failed wherever it is in the thread — she may have sent others since.
        write((prev) => prev.map((tn) => (tn.id === id ? { ...tn, pending: false, failed: true } : tn)));
        onTrouble?.(trouble);
      };

      void askCoach(request, COACH_PLAN_SCHEMA as unknown as Record<string, unknown>)
        .then((reply) => {
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
          onAnswer?.(parsed.answer);
        })
        .finally(() => {
          setInFlight((n) => Math.max(0, n - 1));
        });
    },
    [facts, mode, onAnswer, onTrouble, write],
  );

  return { turns, busy: inFlight > 0, send };
}
