/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REST IS THE COACH'S — AND WHEN THE COACH IS SILENT IT IS HERS.
 *
 * ⛔ FOUNDER, 2026-08-16:
 *
 *   > *"אני רוצה שהמנוע ידע את זמני המנוחה של המתאמן עבור כל תרגיל בנפרד וידע להתאים את זמני
 *   > המנוחה ספציפית למתאמן. גם בתוספת של זמן המנוחה וגם בקיצור של זמן המנוחה."*
 *
 * ── WHAT THIS FILE USED TO SAY, AND WHY IT CHANGED ──────────────────────────────────────────────
 * It was `theRestIsTheCoachsOrAConstant`, and it pinned `restAfterStep` to a flat 90 s whenever the
 * coach said nothing. That came from a real founder ruling on 2026-08-02 — *"make it the dumb
 * constant, in case something goes wrong"* — resting on a premise it stated openly: *"The AI makes
 * every decision about the athlete. The engine just passes all the information along."*
 *
 * **That premise stopped being true on 2026-08-11**, when the engine took the week back
 * (`domain/enginePlan`): onboarding calls `generateProgram`, nothing writes a `CoachPlan` for the
 * week any more, and NOTHING writes `restAfterS` on an engine-composed session. So the "fallback"
 * became the only branch that ever ran, and every rest on every lift on every engine week was 90 s.
 *
 * ⚠️ AND THE APP DID NOT BEHAVE AS IF THAT WERE THE RULE. It kept measuring her (`restBeforeS` on
 * every set), kept recomputing her median, showed her a **REST · LEARNED** beat reading "NEXT TIME
 * 0:52" with 1:30 struck through, and printed **"your pace"** on the wrist. Three surfaces claiming
 * a number that no timer would ever run. The 2026-08-02 ruling is not what shipped; what shipped was
 * a constant wearing the learning's clothes.
 *
 * ── WHAT SURVIVES OF THAT RULING, EXACTLY ───────────────────────────────────────────────────────
 * Its fear was specific and it is still honoured: *"an athlete who rushes her rests teaches the app
 * to prescribe short rests, quietly, against a coach that never agreed to it and is never told."*
 * The coach's number still wins outright, zero included. Her median only ever fills a SILENCE — and
 * on the engine's own week there is no coach to overrule, which is the case that ruling never had to
 * consider. Two tiers, in one order, on every surface.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { restAfterStep, type Step } from '@/state/stores/sessionStore';
import {
  REST_UNSTATED_S,
  REST_COMPOUND_S,
  REST_ISOLATION_S,
  REST_TRANSITION_S,
  refreshLearnedRests,
  restInterSecondsFor,
  restIsLearnedFor,
  restTransitionSeconds,
  learnedInterRestS,
} from '@/domain/restPrescription';
import { MIN_REST_SAMPLES, RECENCY_WINDOW_SESSIONS } from '@/engine/v5/constants';
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

/** One session in which she rested `restS` before each of `n` working sets of `ex`. */
function sess(id: string, ex: string, restS: number, n = 4, startedAt = '2026-08-01T10:00:00.000Z'): Session {
  const sets: SetLog[] = Array.from({ length: n }, (_, i) => ({
    exerciseId: ex, setIndex: i, recommendedWeight: 40, recommendedReps: 8,
    actualWeight: 40, actualReps: 8, edited: false,
    // setIndex 0 is the TRANSITION and must never enter the inter median.
    ...(i === 0 ? {} : { restBeforeS: restS }),
    persistedAt: startedAt,
  }));
  return { id, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets };
}

afterEach(() => refreshLearnedRests([]));

describe('what the clock runs', () => {
  it('runs the number the coach wrote', () => {
    expect(restAfterStep(step({ restAfterS: 180 }))).toBe(180);
  });

  it('runs ZERO when the coach wrote zero — that is a superset, not a missing field', () => {
    expect(restAfterStep(step({ restAfterS: 0 }))).toBe(0);
  });

  it("⛔ and the coach still wins over her own median — that half of the 2026-08-02 ruling stands", () => {
    refreshLearnedRests([sess('s', 'bb_bench_press', 40)]);
    expect(restInterSecondsFor('bb_bench_press')).toBe(40); // hers really is 40
    expect(restAfterStep(step({ restAfterS: 180 }))).toBe(180); // …and it does not get a vote here
  });

  it('⛔ runs HER median on the lift when the coach said nothing', () => {
    refreshLearnedRests([sess('s', 'bb_bench_press', 40)]);
    expect(restAfterStep(step())).toBe(40);
    expect(restAfterStep(step())).not.toBe(REST_UNSTATED_S);
  });

  it('⛔ SHORTENS and LENGTHENS — the founder asked for both directions by name', () => {
    refreshLearnedRests([sess('s', 'bb_bench_press', 45)]);
    expect(restAfterStep(step())).toBe(45); // below the 150 s compound bootstrap
    refreshLearnedRests([sess('s', 'bb_bench_press', 210)]);
    expect(restAfterStep(step())).toBe(210); // and above it
  });

  it('is a DIFFERENT number per lift — the whole of the founder\'s "for each exercise separately"', () => {
    refreshLearnedRests([sess('a', 'bb_bench_press', 200), sess('b', 'bb_curl', 35)]);
    expect(restAfterStep(step({ exerciseId: 'bb_bench_press' }))).toBe(200);
    expect(restAfterStep(step({ exerciseId: 'bb_curl' }))).toBe(35);
  });

  it('falls back to the TIER bootstrap on a lift she has never rested through', () => {
    refreshLearnedRests([]);
    expect(restAfterStep(step({ exerciseId: 'bb_bench_press' }))).toBe(REST_COMPOUND_S);
    expect(restAfterStep(step({ exerciseId: 'bb_curl' }))).toBe(REST_ISOLATION_S);
  });

  it('⚠️ asks a different question at a CROSSING than between sets — they are different rests', () => {
    /*
     * The old law required these to be equal, because a constant cannot tell them apart. They are
     * not the same thing: the rest after a lift's LAST set is the walk to the next station, and it
     * is pooled across lifts (a fact about her gym), while the rest between sets is recovery on that
     * one lift. `setIndex` already knows which is which.
     */
    refreshLearnedRests([sess('s', 'bb_bench_press', 40)]);
    expect(restAfterStep(step({ lastSetOfExercise: true }))).toBe(restTransitionSeconds());
    expect(restAfterStep(step({ lastSetOfExercise: false }))).toBe(40);
  });

  it('the crossing uses the tier bootstrap until she has a pooled transition of her own', () => {
    refreshLearnedRests([]);
    expect(restAfterStep(step({ lastSetOfExercise: true }))).toBe(REST_TRANSITION_S);
  });

  it('is stated to the coach, so silence is a choice it can make knowingly', () => {
    expect(preamble()).toContain(String(REST_UNSTATED_S));
  });
});

describe('⛔ F-17 · the median is not allowed to be one sample wearing a median\'s clothes', () => {
  it(`fewer than ${MIN_REST_SAMPLES} samples is not a prescription`, () => {
    const one = sess('s', 'bb_bench_press', 12, 2); // 2 sets → exactly ONE inter rest
    expect(learnedInterRestS([one], 'bb_bench_press')).toBeNull();
    refreshLearnedRests([one]);
    expect(restIsLearnedFor('bb_bench_press')).toBe(false);
    // …so one rest cut short does not become her standing prescription.
    expect(restAfterStep(step())).toBe(REST_COMPOUND_S);
  });

  it('…and at the gate it speaks', () => {
    const s = sess('s', 'bb_bench_press', 55, MIN_REST_SAMPLES + 1); // n-1 inter rests
    expect(learnedInterRestS([s], 'bb_bench_press')).toBe(55);
    refreshLearnedRests([s]);
    expect(restIsLearnedFor('bb_bench_press')).toBe(true);
  });

  it('⚠️ one wild rest cannot move a settled median — which is why a median was chosen', () => {
    const settled = [1, 2, 3].map((i) => sess(`s${i}`, 'bb_bench_press', 60, 4, `2026-08-0${i}T10:00:00.000Z`));
    const bathroom = sess('x', 'bb_bench_press', 900, 2, '2026-08-04T10:00:00.000Z');
    refreshLearnedRests([bathroom, ...settled]);
    expect(restInterSecondsFor('bb_bench_press')).toBe(60);
  });
});

describe('⛔ F-8 · her rest median is her rest TODAY, not her rest ever', () => {
  it('a lift she has re-paced is not outvoted by a year of the old pace', () => {
    /*
     * The register names the rest median among the statistics F-8 scopes — *"reps-per-rung, N, the
     * rest median (S-17), and the rail"* — and it was the one that read her whole life. A median
     * does not decay, so an old habit outvoted a new one for ever.
     */
    const old = Array.from({ length: 40 }, (_, i) => sess(`o${i}`, 'bb_bench_press', 150, 4, `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`));
    const recent = Array.from({ length: RECENCY_WINDOW_SESSIONS }, (_, i) => sess(`n${i}`, 'bb_bench_press', 60, 4, `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`));
    refreshLearnedRests([...recent, ...old]); // newest first, as db.loadHistory returns it
    expect(restInterSecondsFor('bb_bench_press')).toBe(60);
  });

  it('…and the window is a COUNT, so a rarely-trained lift still gets its real history', () => {
    // Three occurrences, far apart. A calendar window would have deactivated the statistic; F-8's
    // count keeps it, which is the register's stated reason for choosing a count.
    const rare = [1, 2, 3].map((i) => sess(`r${i}`, 'bb_bench_press', 75, 4, `2026-0${i}-01T10:00:00.000Z`));
    refreshLearnedRests(rare);
    expect(restInterSecondsFor('bb_bench_press')).toBe(75);
  });
});
