// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

import { parseCoachPlan } from '@/domain/coachPlan';

/**
 * ════ NOTHING IN THIS APP DECIDES A LOAD THE COACH WROTE ════
 *
 * Founder, 2026-08-01:
 *
 *   > *"Why did you decide the AI must compute the weights from sex × bodyweight? What if it thinks
 *   > it is better by sex × bodyweight × other facts the athlete tells it × experience? Why are you
 *   > limiting it — what did I put an AI in for?"*
 *
 * He was reacting to an instruction I had put in the intake prompt telling the coach it *needed*
 * her bodyweight before it could build. No code enforced it, but that is not the point: an
 * instruction that names what a coach must know decides, in advance, what counts as enough. It is
 * gone.
 *
 * This file is the mechanical half of the answer, because "I checked and nothing clamps it" is
 * worth exactly as much as the day someone stops checking. `B-1` — the register's *cold start = sex
 * × bodyweight* — is an ENGINE rule from v5. It belongs to the local model that no longer composes
 * a programme (`appStore`: "THE PROGRAMME IS NOT GENERATED HERE ANY MORE") and to the milestone
 * ladders. It has never applied to the coach, and this is what keeps it that way.
 */

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

/** The one load in a one-item plan, straight off the parse. */
function loadOf(parsed: ReturnType<typeof parseCoachPlan>): number | null | undefined {
  if (!parsed.ok) return undefined;
  const item = parsed.answer.plan!.sessions[0].blocks[0].items[0];
  return 'load' in item ? item.load : undefined;
}

describe('the coach owns the number', () => {
  it('⚠️ imports no load model into any coach module', () => {
    /*
     * `startingLoad` holds `startingWeight`, `FEMALE_UPPER_FACTOR`, `canLoad` — the engine's whole
     * opinion about what a PERSON can lift. A coach module reaching for any of it would be the
     * engine deciding through the coach's mouth, which is the thing the founder ruled out when he
     * made the coach the only decider.
     */
    const modules = fs.readdirSync(path.join(SRC, 'domain')).filter((f) => /^coach/.test(f));
    expect(modules.length).toBeGreaterThan(4);
    const offenders = modules.filter((f) =>
      /startingWeight|FEMALE_UPPER_FACTOR|canLoad/.test(
        // The prose above a rule may discuss the rule. Only code counts.
        read(`domain/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('⚠️ never tells the coach HOW to choose an opening load', () => {
    /*
     * The prompt may say what the app cannot ask her. It may not say what a good coach needs to
     * know, or how to reason from it — that is the judgement being bought.
     */
    const prompt = read('domain/coachPrompt.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/[^\n]*$/gm, '');
    expect(prompt).not.toMatch(/sex ?[\u00d7x*] ?bodyweight/i);
    expect(prompt).not.toMatch(/before you can build/i);
    // …and it says so positively: the decision is named as the coach's.
    expect(prompt).toMatch(/you decide the opening loads/i);
  });

  it('stores an unusual load exactly as written', () => {
    /*
     * A dumbbell press at 13 kg — a number no cold-start model in this app would produce, and one
     * that sits between the rungs a generic increment would offer. It arrives on the row a screen
     * draws, unchanged. If any physiological model touched the plan, this is where it would show.
     */
    const parsed = parseCoachPlan(
      JSON.stringify({
        v: 2,
        say: 'Start here.',
        sessions: [{ name: 'Day 1', blocks: [{ rounds: 1, items: [{ ex: 'db_bench_press', kind: 'reps', reps: [8, 8], load: 13 }] }] }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapped).toBe(0);
    expect(loadOf(parsed)).toBe(13);
  });
});

describe('⚠️ the two things that DO touch the number, and neither is physiology', () => {
  /*
   * Honesty about the exception, because "nothing touches it" would be a claim that is almost true —
   * and almost true is how a surprise gets built.
   *
   *   1. THE EQUIPMENT'S GRAIN. A machine whose pins move in fives cannot be set to 32.4. The coach
   *      is told each equipment's grain in the sheet, so a well-behaved plan is identical in and out
   *      and `snapped` stays 0. It is a typist, not an editor.
   *
   *   2. THE FLOOR OF WHAT PHYSICALLY EXISTS (S-55) — the empty bar, the lightest dumbbell, the
   *      first pin. This one is worth the founder's eye: a barbell load below `BAR_KG` is RAISED to
   *      the bar, so a coach that prescribes 15 kg on a barbell bench for a beginner gets 20. That
   *      is a claim about her gym, not about her.
   */
  it('rounds to the equipment grain, and counts it when it does', () => {
    const parsed = parseCoachPlan(
      JSON.stringify({
        v: 2,
        say: 'Start here.',
        sessions: [{ name: 'Day 1', blocks: [{ rounds: 1, items: [{ ex: 'leg_press', kind: 'reps', reps: [10, 10], load: 82.3 }] }] }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // It moved — and the count is what makes it visible in telemetry rather than silent.
    expect(parsed.snapped).toBeGreaterThan(0);
  });

  it('will not put a barbell below the empty bar — and that is a claim about her GYM', () => {
    /*
     * Stated as a law so the trade-off is visible rather than discovered. If a 15 kg bar or a
     * dumbbell substitution should be possible, this is the test that has to change, and the change
     * is a product decision rather than a bug fix.
     */
    const parsed = parseCoachPlan(
      JSON.stringify({
        v: 2,
        say: 'Start here.',
        sessions: [{ name: 'Day 1', blocks: [{ rounds: 1, items: [{ ex: 'bb_bench_press', kind: 'reps', reps: [8, 8], load: 12 }] }] }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Raised to the bar, not kept and not refused.
    expect(loadOf(parsed)).toBeGreaterThan(12);
  });
});
