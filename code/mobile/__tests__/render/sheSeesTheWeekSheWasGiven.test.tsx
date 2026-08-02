import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { PlanWeek } from '@/components/PlanWeek';
import { initI18n } from '@/i18n';
import type { CoachPlan } from '@/domain/coachPlan';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE SEES THE WEEK SHE WAS GIVEN.
 *
 * ⛔ FOUNDER, ON THE DEVICE, 2026-08-02: *"there's no screen at all that presents the plan nicely
 * […] he gave me the feeling of yet another banal, un-personalised programme."*
 *
 * The screen after the intake was the deterministic era's loading theatre — 2.8 seconds of ticks
 * naming steps of a generator that has been deleted — and it showed her nothing of what the coach
 * actually wrote. A typecheck cannot see that, and neither could 1,665 passing tests: the screen
 * rendered perfectly. It simply rendered the wrong thing.
 *
 * So this file asks what an athlete can SEE, one question per thing she was promised.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** A week with all four shapes in it, because a programme that is only lifts is the old product. */
const PLAN: CoachPlan = {
  v: 2,
  sessions: [
    {
      name: 'אימון 1: כוח וריצה',
      day: 'mon',
      blocks: [
        { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 10], load: 40, say: 'חזרה אחת לפני כישלון.' }] },
        { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'push_up', reps: [8, 12], load: null }] },
        { rounds: 1, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 5000 }] },
        { rounds: 3, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
      ],
    },
    { name: 'אימון 2', blocks: [{ rounds: 4, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [5, 5], load: 32.5 }] }] },
  ],
};

const textIn = (tree: ReactTestRenderer): string =>
  JSON.stringify(tree.toJSON());

let tree: ReactTestRenderer;
beforeAll(async () => {
  await initI18n();
  await act(async () => {
    tree = renderer.create(<PlanWeek plan={PLAN} units="kg" />);
  });
});

describe('the programme the coach wrote is on the screen', () => {
  it('⚠️ names every session', () => {
    const out = textIn(tree);
    for (const s of PLAN.sessions) expect(out).toContain(s.name);
  });

  it('⚠️ names every exercise, resolved from whichever catalogue holds it', () => {
    // A run and a plank are MOVEMENTS, not lifts. A screen that only knew the lift catalogue would
    // show her a blank row for the 5 km — which is exactly the class of hole this product keeps
    // finding: built, wired, and invisible.
    const out = textIn(tree);
    for (const name of ['Barbell Back Squat', 'Push-Up', 'Run', 'Plank', 'Barbell Bench Press']) {
      expect(out).toContain(name);
    }
  });

  it('⚠️ states what each row asks for, in the shape that row actually is', () => {
    const out = textIn(tree);
    expect(out).toContain('3×8–10 · 40'); // reps at a load
    expect(out).toContain('3×8–12'); // bodyweight: a count and NO load, not a zero
    expect(out).toContain('5 km'); // a distance, in her units
    expect(out).toContain('3×45s'); // a hold
    expect(out).toContain('4×5'); // a fixed count reads as one number, not "5–5"
  });

  it('⚠️ carries the coach\'s own instruction, which is the whole difference from a table', () => {
    // `say` is the field the old engine could never fill. A screen that showed the sets and dropped
    // the sentence would be the banal version of exactly the thing being fixed.
    expect(textIn(tree)).toContain('חזרה אחת לפני כישלון.');
  });

  it('shows the day when the programme has one, and does not invent one when it does not', () => {
    /*
     * ⚠️ Matched as a whole TEXT NODE, and the first draft of this was a false positive: `Legend`
     * uppercases its own text, so the node is "MON" — and `toContain('Mon')` passed anyway, off the
     * substring inside the font name `IBMPlexMono-Medium`. A day name is three letters; three
     * letters match almost anything. Anchor them.
     */
    const days = textIn(tree).match(/"(MON|TUE|WED|THU|FRI|SAT|SUN)"/g);
    // The second session carries no `day` — a hypertrophy week does not care which day is which,
    // and a screen that filled one in would be inventing a prescription.
    expect(days).toEqual(['"MON"']);
  });

  it('draws nothing at all when there is no programme', async () => {
    // Not an empty card, not a spinner: the screens that mount this have their own content, and a
    // placeholder for a plan that does not exist is furniture pretending to be information.
    let empty: ReactTestRenderer;
    await act(async () => {
      empty = renderer.create(<PlanWeek plan={null} units="kg" />);
    });
    expect(empty!.toJSON()).toBeNull();
  });
});
