// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { applyLoop1 } from '@/engine/v5/liveSession';
import { runSteps } from '@/domain/planRun';
import type { PlannedSession } from '@/domain/coachPlan';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CORRECTION — the set she just did moves the next one, and she is TOLD.
 *
 * ⛔ FOUNDER, 2026-08-03, on build 40: *"THE CORRECTION screen isn't there any more, for some
 * reason."*
 *
 * ── NOBODY DELETED IT. THE PROMPT TURNED IT OFF. ────────────────────────────────────────────────
 * Loop 1 fires when her reps fall OUTSIDE the prescribed window. The deterministic engine wrote a
 * window three wide (`8-10`), so clearing it took 11 reps. The prompt's own worked example handed
 * the coach `"reps":[8,12]` — five wide — and the coach wrote what it was shown. At [8,12] she has
 * to reach THIRTEEN before anything happens.
 *
 * So the most distinctive moment in the product went quiet, and no decision anywhere caused it. One
 * example in a prompt did.
 *
 * ⚠️ THIS IS THE SHAPE OF THE FOUNDER'S LARGER COMPLAINT — that the AI move made the product feel
 * generic. It did not replace the instrument's signature; it made it rare, silently, as a side
 * effect of an example. That is worth more attention than any single screen.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const sessionWith = (reps: [number, number]): PlannedSession => ({
  name: 'Upper A',
  blocks: [{ rounds: 3, restS: 120, items: [{ kind: 'reps', ex: 'bb_bench_press', reps, load: 40 }] }],
});

/** She clears the ceiling by one: 11 reps on a band that tops out at 10. */
const fire = (reps: [number, number], did: number) => {
  const steps = runSteps(sessionWith(reps)).map((s, i) => ({
    globalIndex: i,
    exerciseId: s.item.ex,
    ...(s.item.kind === 'reps'
      ? { target: { exerciseId: s.item.ex, setIndex: s.round - 1, recommendedWeight: s.item.load,
                    recommendedReps: s.item.reps[0], repBandLo: s.item.reps[0], repBandHi: s.item.reps[1] } }
      : {}),
  }));
  // F-20: a lone 1-rep miss waits for a second witness; this law is about the WINDOW deciding,
  // so the witness is supplied (a previous set that missed the same way) and the window stays
  // the only variable under test.
  return applyLoop1(steps as never, 0, 40, did, 0, undefined, null, did);
};

describe('the window the coach writes decides whether the product speaks', () => {
  it('⛔ a THREE-wide window corrects at 11 reps — the moment the product is built around', () => {
    const r = fire([8, 10], 11);
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('up');
  });

  it('⚠️ a FIVE-wide window says nothing at the same 11 reps', () => {
    // The regression, stated as a fact rather than a worry: identical athlete, identical set, and
    // the difference is two numbers in a prompt.
    expect(fire([8, 12], 11).corrected).toBe(false);
  });

  it('corrects DOWNWARD when she falls under the floor', () => {
    const r = fire([8, 10], 5);
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('down');
  });

  it('says nothing when she lands inside the window — which is most sets', () => {
    expect(fire([8, 10], 9).corrected).toBe(false);
  });
});

describe('the prompt teaches the window, rather than demonstrating a wide one', () => {
  const prompt = () => read('src/domain/coachPrompt.ts');

  it('⛔ demonstrates NO window at all — not a wide one, and not a narrow one either', () => {
    /*
     * The first version of this assertion required `"reps":[8,10]` — a NARROWER example in place of
     * the wide one. The founder then made the general point, hours later:
     *
     *   > *"You gave it examples, and that is what drives its decisions. Cancel every example,
     *   > because it locks his choice."*
     *
     * He is right, and this test was an instance of the mistake: replacing a bad demonstration with
     * a good one still anchors the model on two specific numbers. The RULE has to carry it.
     * `thePromptShowsNoExamples` holds the general case.
     */
    expect(prompt()).not.toMatch(/"reps"\s*:\s*\[\s*\d+\s*,\s*\d+\s*\]/);
  });

  it('and says what the window IS, which is what has to do the work now', () => {
    // Matched on the mechanism it describes, not on phrasing — and `[\s\S]` because the prompt is
    // hard-wrapped, so a rule can straddle a line break.
    expect(prompt()).toMatch(/two or three apart/);
    /*
     * ⛔ AND IT SAYS *WHEN* THE WINDOW IS READ, WHICH CHANGED UNDER IT (2026-08-26).
     *
     * This pinned *"clear the ceiling … and it puts weight on the bar"* — the LIVE correction. That
     * was true until the founder's logger ruling took Loop 1 out of the session on the same day this
     * file's own subject changed (*"בזמן האימון המתאמן רק רושם ומתעד"*): nothing moves the bar
     * between her sets any more except `carryWeightForward`, which follows HER hand.
     *
     * ⚠️ THE LAW'S SUBJECT IS THE WINDOW DOING THE WORK, NOT WHEN. So it still pins the mechanism —
     * ceiling adds, floor takes off, and the coach is told why it matters — and it now pins the
     * timing too, because a coach that thinks the bar moves mid-workout will size its windows for a
     * loop that is not running.
     */
    expect(prompt()).toMatch(/Nothing moves during the workout/);
    expect(prompt()).toMatch(/clear the ceiling[\s\S]{0,30}it adds weight for next time/i);
    expect(prompt()).toMatch(/fall under the floor and it takes weight off/i);
  });
});

describe('and the live session no longer wires it (founder, 2026-08-26)', () => {
  /* The window mathematics above still matter — Loop 2 corrects on the same band between
     sessions — but the LIVE surface retired: mid-workout she is a logger, and the reveal died
     with the correction it revealed. */
  it('the stage carries no correction reveal', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).not.toContain('setBeatCorrection');
    expect(flow).not.toContain('<CorrectionBeat');
  });

  it('and the session store logs the set and only the set — carry, never a correction', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).not.toContain('applyLoop1(');
    expect(store).toContain('LOOP 1 NO LONGER TOUCHES THE IRON');
  });
});
