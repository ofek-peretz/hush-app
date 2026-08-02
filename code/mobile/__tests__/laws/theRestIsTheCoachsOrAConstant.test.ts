/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REST IS THE COACH'S — AND WHEN THE COACH IS SILENT IT IS A CONSTANT, NEVER A MEDIAN.
 *
 * Founder, 2026-08-02, correcting me a second time on the same class of thing:
 *
 *   > *"The AI makes every decision about the athlete. The engine just passes all the information
 *   > along at the end of the session, and corrects if she goes outside the rep range the coach set
 *   > for her. Simple."*
 *
 * S-17 — *"her median rest becomes the prescription"* — was written when the ENGINE composed
 * programmes, and it survived the rewrite as the fallback under the coach's own number. That is a
 * second decider: an athlete who rushes her rests teaches the app to prescribe short rests, quietly,
 * against a coach that never agreed to it and is never told.
 *
 * It is not deleted — his instruction was *"make it the dumb constant, in case something goes
 * wrong"* — it is demoted out of the decision. A constant decides nothing: it is the same number for
 * everyone, the coach is told what it is, and any coach that cares states its own.
 *
 * ── WHY A LAW AND NOT A COMMENT ─────────────────────────────────────────────────────────────────
 * Because the median is still in the codebase, still correct, still exported, and re-attaching it
 * here would look like a bug fix ("the rest should follow the athlete"). It would also be invisible:
 * every screen would keep working and the timer would simply run a number nobody chose.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { restAfterStep, type Step } from '@/state/stores/sessionStore';
import { REST_UNSTATED_S, refreshLearnedRests, restInterSecondsFor } from '@/domain/restPrescription';
import { preamble } from '@/domain/coachPrompt';
import type { Session, SetLog } from '@/data/local/models';

const step = (over: Partial<Step> = {}): Step => ({
  exerciseId: 'bb_bench_press',
  globalIndex: 0,
  exerciseSetIndex: 1,
  totalSetsInExercise: 4,
  lastSetOfExercise: false,
  lastSetOfSession: false,
  ...over,
});

/** A history in which she rests 40 seconds on the bench, every time. */
function sheRushes(): Session[] {
  const sets: SetLog[] = [1, 2, 3, 4, 5].map((i) => ({
    exerciseId: 'bb_bench_press', setIndex: i, recommendedWeight: 40, recommendedReps: 8,
    actualWeight: 40, actualReps: 8, edited: false, restBeforeS: 40,
    persistedAt: '2026-08-01T10:00:00.000Z',
  }));
  return [{ id: 's', programDayId: 'd', startedAt: '2026-08-01T10:00:00.000Z', state: 'SAVED', earlyFinish: false, sets }];
}

describe('what the clock runs', () => {
  it('runs the number the coach wrote', () => {
    expect(restAfterStep(step({ restAfterS: 180 }))).toBe(180);
  });

  it('runs ZERO when the coach wrote zero — that is a superset, not a missing field', () => {
    expect(restAfterStep(step({ restAfterS: 0 }))).toBe(0);
  });

  it('⚠️ runs the CONSTANT when the coach said nothing — never what she has been doing', () => {
    refreshLearnedRests(sheRushes());
    // The median is real, and it is 40. The engine would have prescribed it.
    expect(restInterSecondsFor('bb_bench_press')).toBe(40);
    // The workout runs the constant anyway. Her habit is a fact about her, not a prescription —
    // and nothing between sessions may decide for the coach.
    expect(restAfterStep(step())).toBe(REST_UNSTATED_S);
    refreshLearnedRests([]);
  });

  it('is the same answer for a crossing as for a set — the tier table decides nothing either', () => {
    // The old fallback asked a different question at the end of a lift (transition) than between
    // its sets (inter). Two questions is two chances to disagree with the coach.
    expect(restAfterStep(step({ lastSetOfExercise: true }))).toBe(restAfterStep(step()));
  });

  it('is stated to the coach, so silence is a choice it can make knowingly', () => {
    // A default the answerer does not know about is a default it cannot decide against.
    expect(preamble()).toContain(String(REST_UNSTATED_S));
  });
});
