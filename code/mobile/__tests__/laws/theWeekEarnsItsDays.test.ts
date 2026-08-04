import {
  trainingDays,
  MIN_HISTORY_DAYS,
  OCCURRENCES_FOR_A_DAY,
  PATTERN_WINDOW_WEEKS,
} from '@/domain/trainingDays';
import type { Session } from '@/data/local/models';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK EARNS ITS DAYS — NOBODY IS ASKED WHICH ONES THEY ARE.
 *
 * ⛔ FOUNDER, 2026-08-04: *"how does the system know which days she wants to train? You're right
 * that the way I chose is like a to-do list and that wasn't right — but it was my answer to those
 * questions, which is why I did N workouts instead of days."*
 *
 * A schedule is a promise the athlete never made, so every day it can be broken. This makes no
 * promise: it reports the days she has actually trained on, and reports NOTHING until it has enough
 * to be sure. `null` is the important answer, and Home draws his numbered column when it comes back.
 *
 * ── ⚠️ WHAT THESE TESTS ARE REALLY GUARDING ─────────────────────────────────────────────────────
 * The failure that matters is not "wrong day". It is **a day appearing too early** — one Tuesday in
 * her first week becoming a Tuesday printed on her home screen forever, which is the app inventing
 * a routine for her. Every floor below exists for that, and each is asserted from its constant so
 * the law cannot drift from the code.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const DAY = 86_400_000;
/** A Sunday, so weekday arithmetic in the fixtures below reads as it looks. */
/* ⚠️ NOON, not evening. `trainingDays` reads the LOCAL weekday — correct in production, since her
 * Tuesday is her own — so a fixture stamped at 18:00 UTC lands on Monday for a runner in UTC+7 and
 * this file would pass in Tel Aviv and fail in a CI box. Midday is safe across ±11 hours. */
const SUN = Date.UTC(2026, 5, 7, 12, 0, 0); // 2026-06-07 is a Sunday
const NOW = SUN + 28 * DAY; // four weeks later, also a Sunday

function on(offsetDays: number, i = 0): Session {
  return {
    id: `s${offsetDays}_${i}`,
    programDayId: 'd',
    programDayName: 'Day',
    startedAt: new Date(SUN + offsetDays * DAY).toISOString(),
    state: 'SAVED',
    earlyFinish: false,
    trained: true,
    sets: [
      {
        exerciseId: 'bb_bench_press',
        setIndex: 0,
        recommendedWeight: 40,
        recommendedReps: 8,
        actualWeight: 40,
        actualReps: 8,
        edited: false,
        restBeforeS: 90,
        persistedAt: new Date(SUN + offsetDays * DAY).toISOString(),
      },
    ],
  };
}

/** Sun + Wed of week n (n = 0,1,2,3). */
const sunWed = (n: number) => [on(n * 7, n), on(n * 7 + 3, n)];

describe('⛔ it says nothing until it can say something true', () => {
  it('no history at all → no days', () => {
    expect(trainingDays([], 4, NOW)).toBeNull();
  });

  it('⛔ ONE session never names a weekday', () => {
    // The failure this whole file exists to prevent: her first Tuesday becoming a fact about her.
    expect(trainingDays([on(0)], 4, NOW)).toBeNull();
  });

  it('⛔ and neither does a whole first week', () => {
    /*
     * Four sessions across seven days is a full week of training and still not a pattern — the
     * history floor is measured from her FIRST session, so an athlete two weeks old cannot have one
     * however diligent she was. This is the assertion that keeps his numbered column alive for the
     * people who need it.
     */
    const week1 = [on(0), on(2), on(4), on(6)];
    expect(trainingDays(week1, 4, SUN + 7 * DAY)).toBeNull();
  });

  it('and the floor is the constant, not a number retyped here', () => {
    const twice = [...sunWed(0), ...sunWed(1)];
    // One day short of the floor: still silent. One day past it: it speaks.
    expect(trainingDays(twice, 4, SUN + (MIN_HISTORY_DAYS - 1) * DAY)).toBeNull();
    expect(trainingDays(twice, 4, SUN + (MIN_HISTORY_DAYS + 1) * DAY)).not.toBeNull();
  });

  it('⚠️ a session that was never actually trained is not evidence', () => {
    // An abandoned session has a date and no work in it. Counting it would put a weekday on her
    // screen for a workout she walked away from.
    const empty = { ...on(0), sets: [] };
    const draft = { ...on(7), state: 'ACTIVE' as const };
    expect(trainingDays([empty, draft, ...sunWed(1), ...sunWed(2)], 4, NOW)).toEqual(new Set(['sun', 'wed']));
  });
});

describe('the pattern it finds', () => {
  it('two weeks of Sundays and Wednesdays is Sunday and Wednesday', () => {
    const h = [...sunWed(0), ...sunWed(1), ...sunWed(2)];
    expect(trainingDays(h, 4, NOW)).toEqual(new Set(['sun', 'wed']));
  });

  it(`⚠️ a weekday needs ${OCCURRENCES_FOR_A_DAY} appearances — one is an event, not a habit`, () => {
    // She trained on a Friday once, three weeks ago, and never again. Friday is not hers.
    const h = [...sunWed(0), ...sunWed(1), ...sunWed(2), on(5, 9)];
    const days = trainingDays(h, 4, NOW)!;
    expect(days.has('fri')).toBe(false);
    expect(days).toEqual(new Set(['sun', 'wed']));
  });

  it(`⚠️ and it forgets: outside the ${PATTERN_WINDOW_WEEKS}-week window, a day stops being hers`, () => {
    /*
     * ⛔ THIS IS THE FOUNDER'S SECOND QUESTION, AS ARITHMETIC — *"what happens if she didn't train
     * on the day we told her to?"* Nothing happens. She trained Mondays for two weeks, then moved
     * to Thursdays. Four weeks later Monday is simply not on her screen: no "missed", no catch-up,
     * no state anywhere recording a broken promise. **The pattern was wrong, and the pattern is the
     * only thing that changes.**
     */
    const old = [on(-28, 1), on(-21, 2)]; // two Mondays, long past the window
    const now = [on(4, 3), on(11, 4), on(18, 5)]; // three Thursdays, inside it
    const days = trainingDays([...old, ...now], 2, NOW)!;
    expect(days.has('mon')).toBe(false);
    expect(days.has('thu')).toBe(true);
  });

  it('⛔ her own answer is the ceiling — five real days do not overrule a four she gave us', () => {
    // Naming a fifth day would be the app overruling the one number she actually typed. The extra
    // day is real and it is hers; it is not a row on a plan that says four.
    const h: Session[] = [];
    for (let w = 0; w < 3; w += 1) for (const d of [0, 1, 2, 3, 4]) h.push(on(w * 7 + d, w * 10 + d));
    expect(trainingDays(h, 4, NOW)!.size).toBe(4);
    expect(trainingDays(h, undefined, NOW)!.size).toBe(5);
  });

  it('⚠️ a tie is broken by the week, never by which session was logged first', () => {
    /*
     * Two days, both twice, and room for one. Resolved by Map insertion order this would put a
     * different day on her screen depending on the order history came back in — a coin toss wearing
     * a rule's clothes, and the kind of thing that reads as a bug once a month forever.
     */
    // ⚠️ All four INSIDE the three-week window — my first fixture put two of them outside it and
    // the function correctly answered `null`, which read as a tie-break bug and was a test bug.
    const h = [on(9, 1), on(16, 2), on(11, 3), on(18, 4)]; // two Tuesdays, two Thursdays
    const a = trainingDays(h, 1, NOW);
    const b = trainingDays([...h].reverse(), 1, NOW);
    expect(a).toEqual(b);
    expect(a).toEqual(new Set(['tue']));
  });
});
