// @ts-nocheck
// 
import { preamble } from '@/domain/coachPrompt';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROMPT STATES RULES. IT DEMONSTRATES NOTHING.
 *
 * ⛔ FOUNDER, 2026-08-03 — and he called this his most critical note:
 *
 *   > *"I think in the prompts you gave it examples, and that is what drives its decisions and
 *   > causes all these bugs. You must go over the prompt and cancel every example, because it locks
 *   > his choice."*
 *
 * ── HE IS RIGHT, AND IT IS PROVEN, NOT ARGUED ───────────────────────────────────────────────────
 * The prompt's worked shape read `"reps":[8,12]`. The coach wrote five-wide windows because that is
 * what it was shown — and Loop 1 only speaks when her reps fall OUTSIDE the window, so at [8,12] she
 * had to reach thirteen before the app said anything. **The correction screen, the single most
 * distinctive moment in this product, went quiet because of two numbers in an example.** Nobody
 * decided that. See `theCorrectionSurvivedTheCoach`, which measures both windows.
 *
 * ── AND THE EXAMPLES WERE BUYING NOTHING ────────────────────────────────────────────────────────
 * Every call sends `responseSchema`. The shape is not a thing the model has to be shown — it is a
 * constraint it cannot answer outside. So a worked JSON example was pure anchor: all of the cost,
 * none of the guarantee.
 *
 * ── WHAT IS NOT AN EXAMPLE ──────────────────────────────────────────────────────────────────────
 * VOCABULARY stays. The four shape names, the field names, the verb list, and both id catalogues are
 * the allowed SET — the coach cannot answer at all without knowing what it may choose from. The
 * distinction this law draws: naming what is permitted is a rule; showing one filled in is a demo.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const text = () => preamble();

describe('nothing in the prompt is a worked example', () => {
  it('⛔ carries no filled-in item — the thing the founder caught', () => {
    // A `kind` with a value beside it is a demonstration. The names alone are the vocabulary.
    expect(text()).not.toMatch(/"kind"\s*:\s*"(reps|time|distance|open)"/);
  });

  it('⛔ names no rep window at all', () => {
    /*
     * `[8,12]` is the exact string that cost the correction. This matches ANY two-number window, so
     * the next person cannot fix it by demonstrating a narrower one — the rule says "two or three
     * apart" and that sentence is what has to do the work.
     */
    expect(text()).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*\]/);
    expect(text()).toMatch(/two or three apart/);
  });

  it('⛔ states no load, no duration and no distance', () => {
    // Any number attached to a prescription is an anchor: it becomes the value the model drifts to.
    expect(text()).not.toMatch(/"load"\s*:\s*[\d.]+/);
    expect(text()).not.toMatch(/"seconds"\s*:\s*\d+/);
    expect(text()).not.toMatch(/"metres"\s*:\s*\d+/);
    expect(text()).not.toMatch(/"n"\s*:\s*\d+/);
  });

  it('⛔ writes no sentence FOR it — not a `say`, not a `brief` line', () => {
    /*
     * These were four quoted `say` lines and four quoted `brief` lines. They are the most dangerous
     * kind of example, because they anchor the coach's VOICE — the one thing the founder's "let him
     * be him" ruling says is his.
     *
     * Matched as: a quoted string ending in a full stop, long enough to be prose rather than a
     * field name or a label.
     */
    const prose = [...text().matchAll(/"([^"\n]{18,})"/g)].map((m) => m[1]).filter((q) => /[.!?]$/.test(q));
    expect(prose).toEqual([]);
  });

  it('and keeps the VOCABULARY, which is not an example', () => {
    // The other half of the law. Stripping the names too would leave a coach that cannot answer.
    /* ⛔ `today` LEFT THE VOCABULARY WITH THE FIELD (2026-08-26) — the coach may no longer ask to
       change the session she is standing in, because nothing ever carried out the request. */
    for (const word of ['reps', 'time', 'distance', 'open', 'say', 'notes', 'brief', 'sessions']) {
      expect({ word, named: text().includes(word) }).toEqual({ word, named: true });
    }
    // …and both id catalogues, which ARE the allowed set rather than a demonstration of one.
    expect(text()).toContain('bb_bench_press');
    expect(text()).toContain('run_outdoor');
    /* ⛔ AND THE SIX LIVE-EDIT VERBS ARE NO LONGER IN THE PROMPT (2026-08-26). They were the whole
       `today` block — `{"do":"drop","ex":"…"}` and five siblings — sixteen lines instructing the
       coach in a vocabulary the app could not act on. `LiveEdit` still exists and the pain path
       still applies a `drop`; what went is the coach's ability to ASK for one. */
    expect(text()).not.toContain('"do":"drop"');
  });
});
