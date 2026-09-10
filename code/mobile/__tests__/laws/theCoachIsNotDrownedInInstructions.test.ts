// @ts-nocheck
// 
import { preamble, COACH_PROMPT_VERSION } from '@/domain/coachPrompt';
import { coachCatalogue, coachMovements } from '@/domain/coachFacts';
import { EXERCISES } from '@/data/exercises';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE MORE WE EXPLAINED, THE LESS THE COACH DID.
 *
 * ⛔ MEASURED 2026-08-02 on ONE post-session call, the same athlete, the same record, the same ask —
 * an ask which says, in capitals, "attach the whole programme even where nothing changed":
 *
 *     preamble 34,878 chars, answer rules 7,039     ONE lift, ONE session      115 output tokens
 *     preamble 10,697 chars, answer rules  ~350     TEN lifts, THREE sessions  890 output tokens
 *     no preamble at all                            TEN lifts, THREE sessions  885 output tokens
 *
 * Nothing about the ask changed between those rows. **The explaining was suppressing the answer.**
 * Handed a long enough list of rules, each with the incident that motivated it, the model returns
 * the smallest reply that violates none of them — and a one-exercise week violates nothing.
 *
 * The prompt had been written in this repo's own voice: every rule followed by the bug it came from,
 * because that is how the code around it is written and it reads beautifully. It is the wrong form
 * for an instruction. **Rules go in the prompt; reasons go in the comments.**
 *
 * That is the app's own copy law arriving somewhere nobody thought to look — *a label that explains
 * a control steals its job; delete, don't shorten.* It turns out to be true of readers that are not
 * people.
 *
 * ── AND IT IS NOT ONLY A QUALITY PROBLEM ────────────────────────────────────────────────────────
 * A Worker's outbound call dies at 125 seconds, and the model emits nothing while it is thinking, so
 * thinking is dead air the ceiling counts. At the old size the call thought straight past it: three
 * runs, 125.18s / 125.15s / 125.11s, never an answer. **The one call this product sells could not
 * complete.** At v15 it is 15.7s — and one run still hit the ceiling, which is how little margin
 * there was and how little there is to spend.
 *
 * ── WHAT THIS LAW HOLDS ─────────────────────────────────────────────────────────────────────────
 * A budget, in characters, on the thing that is sent on every single call. It is a blunt instrument
 * and it is the right one: the failure was gradual, nobody added 24,000 characters in one sitting,
 * and every individual paragraph was worth reading. Only the total was fatal.
 *
 * If this goes red: do not raise the ceiling. Move the reason into a comment.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Room to work in, and no more.
 *
 * v15 measures 16,330. The headroom is for the catalogue growing — 123 lifts today, and adding one
 * costs about 45 characters here, so this budget absorbs roughly 80 more before anyone has to think
 * about it again. It does NOT absorb another essay.
 */
const PREAMBLE_BUDGET = 20_000;

describe('the prompt is instructions, not documentation', () => {
  it('⚠️ the preamble stays inside its budget', () => {
    const size = preamble().length;
    // Named in the failure so the next person sees the number, not just a boolean.
    expect({ size, budget: PREAMBLE_BUDGET }).toEqual({ size: expect.any(Number), budget: PREAMBLE_BUDGET });
    expect(size).toBeLessThan(PREAMBLE_BUDGET);
  });

  it('⚠️ the catalogue is one line per lift, not a JSON document', () => {
    /*
     * The catalogue was `JSON.stringify` of 123 objects with seven keys each — 14,700 characters, of
     * which about 9,000 were the key names, repeated 123 times. The model never needed them: it
     * picked ten valid ids from the compact form on the first attempt.
     *
     * This is checked structurally rather than by size so that the CHEAP encoding is what survives,
     * not merely a smaller number.
     */
    const text = preamble();
    expect(text).not.toContain('[{"id":');
    // Every lift is present, one per line, id first.
    for (const e of EXERCISES) expect(text).toContain(`\n${e.id}|`);
    // And the row really is compact: id, muscle, capability, equipment, and sometimes `bw`.
    const row = text.split('\n').find((l) => l.startsWith(`${EXERCISES[0].id}|`))!;
    expect(row.split('|').length).toBeLessThanOrEqual(5);
  });

  it('every id the coach may prescribe still reaches it — the saving is encoding, not omission', () => {
    // The whole risk of compacting is quietly dropping something she could have been given. A lift
    // that is not in the preamble cannot be prescribed, and nothing else would ever say so.
    const text = preamble();
    for (const e of coachCatalogue()) expect(text).toContain(e.id);
    for (const m of coachMovements()) expect(text).toContain(m.id);
  });

  it('the answer rules state each rule once, with nothing after it', () => {
    /*
     * The specific rules the long version carried, all of which still have to be there — this is the
     * half that guards against "shorten it" turning into "lose it". Kept as short distinctive
     * fragments rather than whole sentences, so that rewording the prompt does not break the law.
     */
    const text = preamble();
    for (const rule of [
      'Never describe a change without attaching it', // the change is attached or it did not happen
      'no "sets" field', // rounds is the only multiplier
      'rest BETWEEN ROUNDS', // restS is not between items
      '0 means she goes straight on', // how a superset is written
      'Indoors', // time, because the phone measures nothing there
      'always metres', // distance has one unit and it is not the athlete's
      '"notes"', // the "Why?" sheet, and next call's "decided"
      '"brief"', // the coach's only memory
      '"learned"', // the only way her sentences reach the app
    ]) {
      expect(text).toContain(rule);
    }
  });

  it('the version was bumped, because a changed preamble is a cold cache for everyone', () => {
    // Prompt caching matches on an exact prefix. Rewriting the preamble without bumping this would
    // silently pay full price on every call while believing otherwise.
    expect(COACH_PROMPT_VERSION).toBeGreaterThanOrEqual(15);
  });
});
