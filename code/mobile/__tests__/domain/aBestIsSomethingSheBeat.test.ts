/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A BEST IS SOMETHING SHE BEAT — AND THE TWO SCREENS THAT SAID SO DISAGREED.
 *
 * ⛔ FOUNDER'S SCREENSHOTS, 2026-08-18. His FIRST EVER workout closed on
 *
 *     NEW BEST · Deadlift · 60 kg
 *
 * and one tap away, on Progress, the lifetime band read
 *
 *     PERSONAL BESTS   0
 *
 * Both were behaving as written, which is what made it worth a law rather than a patch:
 *
 *   · `shareCard.recordCardFromHistory` counts a first-ever load as a record — deliberately, with a
 *     test of its own. For a SHARE CARD that is right: it is a picture of ONE lift, made on purpose,
 *     and the first time you pull 60 kg is a thing worth posting.
 *   · `progressAggregate.raises` counts times a lift beat its own previous peak, so a first log sets
 *     the baseline and counts nothing. Its own copy says why: *"Nothing has moved yet. The first
 *     mark is what the rest is measured against."*
 *
 * ⚠️ AND ON DAY ONE THE PILL COULD NOT FAIL TO FIRE. Every lift in a first session clears a previous
 * best of nothing, so "NEW BEST" appeared for every athlete on every first workout, naming whichever
 * lift happened to be heaviest. A celebration that is guaranteed is decoration — and this one was
 * decoration standing beside a zero that called it wrong.
 *
 * The session poster asks for a record that ROSE. The share card is untouched.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { sessionPoster } from '@/domain/sessionPoster';
import { recordCardFromHistory } from '@/domain/shareCard';
import { progressAggregate } from '@/domain/progressAggregate';
import type { Session } from '@/data/local/models';

const T0 = Date.parse('2026-03-02T09:00:00.000Z');
const DAY = 86_400_000;

/** The canonical fixtures, same shape `shareCard.test.ts` uses — a set is a `SetLog`, not a sketch. */
let seq = 0;
const log = (exerciseId: string, weight: number, reps = 8) => ({
  exerciseId,
  setIndex: 0,
  recommendedWeight: weight,
  recommendedReps: 8,
  actualWeight: weight,
  actualReps: reps,
  edited: false,
  persistedAt: new Date(T0).toISOString(),
});

const session = (atMs: number, sets: { ex: string; kg: number; reps?: number }[]): Session =>
  ({
    id: `s${++seq}`,
    programDayId: 'd',
    startedAt: new Date(atMs).toISOString(),
    state: 'SAVED',
    earlyFinish: false,
    sets: sets.map((x) => ({ ...log(x.ex, x.kg, x.reps ?? 8), persistedAt: new Date(atMs + 30 * 60_000).toISOString() })),
  }) as unknown as Session;

beforeEach(() => {
  seq = 0;
});

const poster = (history: Session[]) =>
  sessionPoster({
    session: history[history.length - 1],
    history,
    units: 'kg',
    durationMs: 45 * 60_000,
    kcal: 250,
  });

const lifetime = (history: Session[]) =>
  progressAggregate(history, [], new Date(T0).toISOString(), 78, T0 + 30 * DAY);

describe('⛔ the first-ever session does not claim a record', () => {
  const first = [session(T0, [{ ex: 'bb_deadlift', kg: 60, reps: 8 }, { ex: 'bb_bench_press', kg: 37.5, reps: 8 }])];

  it('the poster falls to the session’s tonnage — a fact she earned, not one she cannot avoid', () => {
    expect(poster(first).hero.kind).toBe('tonnes');
  });

  it('⚠️ …and the SHARE card still calls it a record, because that is a different job', () => {
    // A poster she chooses to make about one lift. Nothing beside it to contradict, and the first
    // time you pull 60 kg is a real thing. `shareCard.test.ts` owns this rule; asserted here so the
    // fix above cannot quietly take it with it.
    const card = recordCardFromHistory(first, 'kg');
    expect(card).not.toBeNull();
    expect(card!.exerciseId).toBe('bb_deadlift');
    expect(card!.delta).toBeNull();
  });

  it('⛔ …and it agrees with the lifetime count, which is the whole point', () => {
    expect(lifetime(first).raises).toBe(0);
    expect(poster(first).hero.kind).not.toBe('record');
  });
});

describe('⛔ a load that actually rose still takes the poster', () => {
  const climbed = [
    session(T0, [{ ex: 'bb_deadlift', kg: 60, reps: 8 }]),
    session(T0 + 3 * DAY, [{ ex: 'bb_deadlift', kg: 65, reps: 8 }]),
  ];

  it('the hero is the record, with its step', () => {
    const h = poster(climbed).hero;
    expect(h.kind).toBe('record');
    expect(h.value).toBe(65);
    expect(h.delta).toBe(5);
  });

  it('⚠️ …and the lifetime count sees the same one best', () => {
    expect(lifetime(climbed).raises).toBe(1);
  });

  it('a session that beat nothing gets no pill either', () => {
    // Third session, lighter than the peak. Nothing rose, so nothing is claimed.
    const flat = [...climbed, session(T0 + 6 * DAY, [{ ex: 'bb_deadlift', kg: 60, reps: 8 }])];
    expect(poster(flat).hero.kind).not.toBe('record');
  });
});
