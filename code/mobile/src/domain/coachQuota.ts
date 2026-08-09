/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CONVERSATION'S CEILING — a business guard, and it is only that.
 *
 * The founder put it plainly: *"we are a business at the end of the day."* He is right, and the
 * numbers are not hypothetical. Measured on live calls:
 *
 *   a post-session decision   $0.0413      (4,746 in · 452 out · 4,105 THINKING)
 *   a chat turn               ~$0.011
 *
 *   a paying athlete, a year  $6.44 deciding + ~$1.72 chatting  =  8% of $99.99
 *   an athlete chatting 30×/day                                 =  $120 a year, alone
 *
 * The first number is the product and is never capped. The second is the one that can run away.
 *
 * ── WHAT IS AND IS NOT CAPPED, AND WHY ──────────────────────────────────────────────────────────
 * · THE POST-SESSION CALL — never. It is what she pays for. Capping the thing that decides her
 *   training to save four cents would be selling her a coach and then rationing it.
 * · THE INTAKE — never. She cannot get a programme without it, so a limit there does not ration a
 *   conversation, it says "you cannot finish signing up".
 * · A REVISION (pain, a change of days) — never. It is a safety path; a shoulder that hurts is not
 *   a budget line.
 * · CHAT — capped. It is the only one that is open-ended by nature.
 *
 * ── MONTHLY, NOT DAILY, AND THAT IS THE WHOLE DESIGN ────────────────────────────────────────────
 * Chat is BURSTY. She asks eight questions the week she starts and then nothing for a fortnight. A
 * daily cap punishes precisely the normal shape of it — she would hit a wall on the one day she was
 * most engaged and never come back to ask the ninth. A month absorbs the burst, and it is the
 * billing period, which is the only window a limit can be explained in without inventing a reason.
 *
 * ── AND IT IS NOT A SECURITY CONTROL ────────────────────────────────────────────────────────────
 * Anyone who unpacks the app bypasses this in a minute. It exists for the HONEST case — the athlete
 * who chats every day and costs more than she pays — which is the real economic risk. Abuse is the
 * Worker's rate limit, keyed on the install, and neither substitutes for the other.
 *
 * Pure and I/O-free. The caller supplies the counter and persists what comes back.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 


/**
 * A paying athlete's monthly chat allowance.
 *
 * A heavy real user sends about twenty a month. A hundred is a ceiling nobody honest reaches, and
 * at the ceiling the chat costs ~$13 a year against $99.99 — so even the worst case that is not
 * abuse still leaves the margin intact. Chosen to be invisible, not to be felt.
 */
export const CHAT_PER_MONTH = 100;

/**
 * The whole trial's allowance, for the WHOLE trial rather than per month.
 *
 * The trial is fourteen workouts (`FREE_SESSION_LIMIT`) and earns nothing, so its exposure is the
 * one that has to be bounded absolutely rather than per period: the intake plus fourteen decisions
 * is already ~$0.67 before a word of chat. Thirty turns puts a hard $1.00 ceiling on a trial, which
 * is an acquisition cost a business can name.
 */
export const CHAT_PER_TRIAL = 30;

/** What is stored: which window is being counted, and how much of it is gone. */
export interface CoachQuotaState {
  /** `YYYY-MM` for a subscriber, or the literal `trial`. Changing it IS the reset. */
  window: string;
  used: number;
}

/** The window a call belongs to. */
export function quotaWindow(entitled: boolean, nowMs: number = Date.now()): string {
  if (!entitled) return 'trial';
  const d = new Date(nowMs);
  // Local months, not UTC: a limit that resets at 2am on the 1st for an athlete in Tel Aviv is a
  // limit that reset on a day she did not have.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** How many chat turns this window allows. */
export function quotaSize(entitled: boolean): number {
  return entitled ? CHAT_PER_MONTH : CHAT_PER_TRIAL;
}

/**
 * How many chat turns are left, and the state to store.
 *
 * `state` from a DIFFERENT window is not carried forward — a new month is a fresh allowance, and an
 * athlete who subscribes mid-trial gets the month's, which is the generous reading and the correct
 * one: she has started paying.
 */
export function chatRemaining(
  state: CoachQuotaState | null | undefined,
  entitled: boolean,
  nowMs: number = Date.now(),
): { remaining: number; window: string; used: number } {
  const window = quotaWindow(entitled, nowMs);
  const used = state?.window === window ? Math.max(0, state.used) : 0;
  return { remaining: Math.max(0, quotaSize(entitled) - used), window, used };
}

/** The state after one chat turn has been spent. */
export function spendChat(
  state: CoachQuotaState | null | undefined,
  entitled: boolean,
  nowMs: number = Date.now(),
): CoachQuotaState {
  const { window, used } = chatRemaining(state, entitled, nowMs);
  return { window, used: used + 1 };
}
