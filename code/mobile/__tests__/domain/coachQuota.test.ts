/**
 * ════ THE CONVERSATION'S CEILING ════
 *
 * The founder's framing, and it is the right one: *"this is not the point of the app — we put the
 * AI in the corner and it does not shout AI. These are just safety mechanisms so people cannot
 * exploit it and we lose money. We are a business at the end of the day."*
 *
 * Measured, so the numbers are not a guess:
 *
 *   a post-session decision   $0.0413      (4,746 in · 452 out · 4,105 THINKING)
 *   a chat turn               ~$0.011
 *   a paying athlete, a year  ~$8.20       — 8% of $99.99
 *   chatting 30 times a day   ~$120/year   — more than the subscription, alone
 *
 * So: the thing she pays for is never rationed, and the thing that is open-ended is.
 */
// @ts-nocheck

// 

import {
  CHAT_PER_MONTH,
  CHAT_PER_TRIAL,
  chatRemaining,
  quotaWindow,
  spendChat,
} from '@/domain/coachQuota';

const AUG = Date.parse('2026-08-14T10:00:00');
const SEP = Date.parse('2026-09-01T10:00:00');

describe('what the window is', () => {
  it('is the calendar month for a subscriber — the period she is billed in', () => {
    // Any other window needs a reason invented for it. This one she already understands.
    expect(quotaWindow(true, AUG)).toBe('2026-08');
    expect(quotaWindow(true, SEP)).toBe('2026-09');
  });

  it('is the WHOLE trial for someone who is not paying', () => {
    /*
     * The trial earns nothing and runs fourteen workouts, so its exposure has to be bounded
     * absolutely rather than per period — a monthly allowance on a trial is an allowance that
     * refills for someone who has never paid.
     */
    expect(quotaWindow(false, AUG)).toBe('trial');
    expect(quotaWindow(false, SEP)).toBe('trial');
  });

  it('reads LOCAL months, not UTC', () => {
    // A limit that resets at 2am on the 1st for an athlete in Tel Aviv is a limit that reset on a
    // day she did not have.
    const lateOnTheLast = new Date(2026, 7, 31, 23, 30).getTime();
    expect(quotaWindow(true, lateOnTheLast)).toBe('2026-08');
  });
});

describe('what is left', () => {
  it('gives a subscriber the month, and a trial the trial', () => {
    expect(chatRemaining(null, true, AUG).remaining).toBe(CHAT_PER_MONTH);
    expect(chatRemaining(null, false, AUG).remaining).toBe(CHAT_PER_TRIAL);
  });

  it('counts down as she spends, and never below zero', () => {
    let q = spendChat(null, true, AUG);
    for (let i = 0; i < CHAT_PER_MONTH + 5; i++) q = spendChat(q, true, AUG);
    expect(chatRemaining(q, true, AUG).remaining).toBe(0);
  });

  it('refills on a new month, without carrying the old count forward', () => {
    const spent = { window: '2026-08', used: CHAT_PER_MONTH };
    expect(chatRemaining(spent, true, SEP).remaining).toBe(CHAT_PER_MONTH);
  });

  it('hands a mid-trial subscriber the whole month, not the trial’s remainder', () => {
    /*
     * The generous reading, and the correct one: she has started paying. Carrying a spent trial
     * into the first month she pays for would meter the moment she became a customer.
     */
    const trialSpent = { window: 'trial', used: CHAT_PER_TRIAL };
    expect(chatRemaining(trialSpent, true, AUG).remaining).toBe(CHAT_PER_MONTH);
  });

  it('does not refill a TRIAL when the month turns', () => {
    // The one window that must not be a period. A trial that refills monthly is a free tier.
    const spent = { window: 'trial', used: CHAT_PER_TRIAL };
    expect(chatRemaining(spent, false, SEP).remaining).toBe(0);
  });
});

describe('the ceiling is set to be invisible', () => {
  it('is far above what a real athlete sends', () => {
    /*
     * A heavy real user sends about twenty a month. These are not budgets she is meant to feel —
     * they are the point past which something is looping rather than training.
     */
    expect(CHAT_PER_MONTH).toBeGreaterThanOrEqual(100);
    expect(CHAT_PER_TRIAL).toBeGreaterThanOrEqual(30);
  });

  it('keeps the worst honest case inside the margin', () => {
    // ~$0.011 a turn. At the monthly ceiling every month for a year, chat costs ~$13 against
    // $99.99 — so even the worst case that is not abuse leaves the business intact.
    expect(CHAT_PER_MONTH * 12 * 0.011).toBeLessThan(20);
    // And a whole trial, chat included, stays inside a dollar.
    expect(CHAT_PER_TRIAL * 0.011).toBeLessThan(0.5);
  });
});
