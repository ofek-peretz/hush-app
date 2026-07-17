/**
 * Engine v5 · WHAT ONE WORKOUT EARNED — the law behind the Complete screen's rebuild (2026-07-17).
 *
 * The brief calls Workout Complete "the important one", because v5 reversed v4's central rule:
 *
 *   v4 — "a single workout never builds next week's program; that ritual is the weekly update."
 *   v5 — the decision IS made when the workout ends (register L7: there is no weekly boundary).
 *
 * The screen had been closing with a calendar icon and "What you lifted this week sets next week's
 * loads", which is v4's sentence. It was not being lazy: the engine's fold only ran from
 * `sessionTargets`, i.e. when the athlete opened the NEXT workout, so at the whistle the decision
 * genuinely did not exist yet and Saturday was the only true thing left to point at.
 *
 * `getSessionEarnedV5` is the read that closed the gap. Every changeLog entry is already stamped
 * with `at` = the occurrence's `startedAt`, so "what this workout earned" is just the entries
 * carrying its stamp. These tests pin that, plus the three things the screen depends on:
 *
 *   · a workout that moved a load says what it moved, in Hush's voice, with the reason
 *   · a workout that changed nothing returns [] — a REAL verdict (S-24 hold), never an empty state
 *   · one workout's decisions never leak into another's (the whole point of the stamp)
 */
import { ensureExercisesV5, advanceV5, getSessionEarnedV5, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import type { Session, SetLog } from '@/data/local/models';

const BAND = bandFor('8-10');
const seed = () => 40; // a settled starting load, so the first occurrence is a real decision
const EX = 'barbell_row';

const set = (exerciseId: string, weight: number, reps: number): SetLog => ({
  exerciseId, setIndex: 0, recommendedWeight: weight, recommendedReps: 8,
  actualWeight: weight, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
});
const session = (startedAt: string, sets: SetLog[]): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets,
});

/** Fold `history` and hand back what the occurrence at `startedAt` earned. */
async function earnedFor(history: Session[], startedAt: string) {
  await ensureExercisesV5([EX], BAND, history, seed);
  await advanceV5([EX], () => BAND, history, seed, Date.parse('2026-07-20T10:00:00Z'));
  return getSessionEarnedV5(Date.parse(startedAt));
}

describe('a workout that earned a load change says so — at the whistle, not on Saturday', () => {
  beforeEach(async () => { await resetV5(); });

  it('every set met the target → the load moved, and the sentence carries the reason', async () => {
    // S-22: all sets cleared Tlo (8), so the lift goes up. This is the moment the Complete screen
    // exists to report, and before 2026-07-17 it could not: the decision had not been computed yet.
    const at = '2026-07-16T10:00:00Z';
    const earned = await earnedFor([session(at, [set(EX, 40, 10), set(EX, 40, 10), set(EX, 40, 9)])], at);

    expect(earned).toHaveLength(1);
    // The screen renders `text` — an i18n key in Hush's first person, with the number and the
    // reason arriving together. It must never be a bare decision label.
    expect(earned[0].text.key).toMatch(/^explain\./);
    expect(earned[0].slotId).toBe(EX);
    // The Why triple survives for the surfaces that open it.
    expect(earned[0].observation.key).toMatch(/^explain\./);
    expect(earned[0].conclusion.key).toMatch(/^explain\./);
    expect(earned[0].action.key).toMatch(/^explain\./);
  });

  it('a workout that changed nothing returns [] — that is a verdict, not an empty state', async () => {
    // S-24: not every set met Tlo → hold. R7 says Hush reports what it measured, so the screen
    // says "every lift held" rather than inventing a change or falling back to a pointer.
    const at = '2026-07-16T10:00:00Z';
    const earned = await earnedFor([session(at, [set(EX, 40, 8), set(EX, 40, 5), set(EX, 40, 4)])], at);
    expect(earned).toEqual([]);
  });
});

describe('the stamp keeps two workouts apart', () => {
  beforeEach(async () => { await resetV5(); });

  it("Monday's decision is never reported as Thursday's", async () => {
    // A lift trained twice in a week builds on itself (register L7 — no weekly boundary), so BOTH
    // occurrences decide. Each must own only its own decision: this is exactly what the weekly
    // mirror deliberately NETS together, and what a single workout's close must not.
    //
    // The state has to ACCUMULATE the way it does in life — seeded before any of this was trained,
    // then one occurrence landing at a time. Seeding from a history that already holds both
    // sessions starts the lift at `bestDemonstratedLoad` (Thursday's load), so Monday would then be
    // folded against a state that had already passed it. That is not a thing that can happen to a
    // real athlete, and an earlier draft of this test did exactly that and blamed the engine.
    const mon = '2026-07-13T10:00:00Z';
    const thu = '2026-07-16T10:00:00Z';
    const monday = session(mon, [set(EX, 40, 10), set(EX, 40, 10), set(EX, 40, 10)]);

    await ensureExercisesV5([EX], BAND, [], seed); // day one: nothing trained yet
    await advanceV5([EX], () => BAND, [monday], seed, Date.parse('2026-07-13T12:00:00Z'));

    const afterMonday = await getSessionEarnedV5(Date.parse(mon));
    expect(afterMonday).toHaveLength(1); // Monday earned its move, and said so on Monday

    // Thursday trains the lift at the load Monday bought it, and clears again.
    // The move itself —  carries {ex, delta}; there is no  param, and an
    // earlier draft read one and got undefined on every line.
    const delta = Number(afterMonday[0].text.params?.delta ?? 0);
    expect(delta).toBeGreaterThan(0);
    const raised = 40 + delta; // she trains at the load Monday bought her
    const thursday = session(thu, [set(EX, raised, 10), set(EX, raised, 10), set(EX, raised, 10)]);
    await advanceV5([EX], () => BAND, [monday, thursday], seed, Date.parse('2026-07-16T12:00:00Z'));

    // Each occurrence still owns exactly its own decision — Thursday did not absorb Monday's.
    expect(await getSessionEarnedV5(Date.parse(mon))).toHaveLength(1);
    expect(await getSessionEarnedV5(Date.parse(thu))).toHaveLength(1);
    // And a workout that never happened earned nothing — the read is keyed to the stamp, never a
    // "most recent" guess.
    expect(await getSessionEarnedV5(Date.parse('2026-07-14T10:00:00Z'))).toEqual([]);
  });
});

/**
 * IDEMPOTENCE — the risk the whistle-fold introduced (2026-07-17).
 *
 * Before, `advanceV5` had exactly one caller: `sessionTargets`. Now `sessionEarned` folds at the
 * whistle too, so every occurrence is offered to the fold TWICE — once when the workout ends, once
 * when the next one opens. If the cursor did not hold, each decision would be logged twice, and the
 * Saturday mirror (which reads the same changeLog) would quietly narrate every change double.
 *
 * The guard is `lastFoldedAt` + a strictly-greater filter. This proves it rather than trusting it.
 */
describe('folding twice changes nothing — the whistle-fold cannot double-count', () => {
  beforeEach(async () => { await resetV5(); });

  it('a second fold of the same history logs nothing new', async () => {
    const at = '2026-07-16T10:00:00Z';
    const history = [session(at, [set(EX, 40, 10), set(EX, 40, 10), set(EX, 40, 10)])];

    await ensureExercisesV5([EX], BAND, [], seed);
    await advanceV5([EX], () => BAND, history, seed, Date.parse('2026-07-16T12:00:00Z'));
    const once = await getSessionEarnedV5(Date.parse(at));
    expect(once).toHaveLength(1); // the load moved, and it was recorded

    // The next workout opens and `sessionTargets` folds again, over the same history.
    await advanceV5([EX], () => BAND, history, seed, Date.parse('2026-07-17T12:00:00Z'));
    const twice = await getSessionEarnedV5(Date.parse(at));

    expect(twice).toHaveLength(1); // …and the occurrence still owns exactly ONE decision
    expect(twice).toEqual(once); // identical, not merely the same count
  });

  it('a fold that arrives with nothing new does not disturb the load it already set', async () => {
    // The second fold must be a genuine no-op: not just "logs nothing" but "decides nothing", or
    // the lift would climb a rung every time the athlete opened the app.
    const at = '2026-07-16T10:00:00Z';
    const history = [session(at, [set(EX, 40, 10), set(EX, 40, 10), set(EX, 40, 10)])];

    await ensureExercisesV5([EX], BAND, [], seed);
    await advanceV5([EX], () => BAND, history, seed, Date.parse('2026-07-16T12:00:00Z'));
    const after1 = Number((await getSessionEarnedV5(Date.parse(at)))[0].text.params?.delta);
    expect(after1).toBeGreaterThan(0); // a real move, not an absent field read as undefined

    await advanceV5([EX], () => BAND, history, seed, Date.parse('2026-07-16T13:00:00Z'));
    await advanceV5([EX], () => BAND, history, seed, Date.parse('2026-07-16T14:00:00Z'));
    const after3 = Number((await getSessionEarnedV5(Date.parse(at)))[0].text.params?.delta);

    expect(after3).toBe(after1); // three folds, one decision
  });
});

/**
 * S-43 · A CHANGED REP BAND REACHES HER LOADS — the claim the body-map editor rests on.
 *
 * The editor writes `repBandByMuscle` and does NOT rebuild the programme, on the grounds that "loads
 * and progression re-read it live". That was asserted before it was checked. It holds, and for a
 * better reason than the one first given: `advanceV5`'s first line is
 * `ensureExercisesV5(exerciseIds, band, …)`, which recomputes the load at the NEW Tlo from her own
 * history (S-43 — "the load at which she performed ≥ the new T", never a conversion formula). So the
 * fold applies it, and since 2026-07-17 the fold runs at the whistle.
 *
 * If this ever breaks, a woman who sets her shoulders to 12–15 keeps lifting her 8–10 load forever
 * and nothing anywhere says so.
 */
describe('a changed band is applied by the fold — the editor needs no rebuild', () => {
  beforeEach(async () => { await resetV5(); });

  it('the SAME sets read at a different T reach a different verdict', async () => {
    // 10 reps is the discriminating case, and picking one that discriminates is the whole test: at
    // 8-10 it clears Tlo and the load RISES; at 12-15 it misses Tlo and the load HOLDS. (An earlier
    // draft used 12 reps, which clears both bands' Tlo — it proved nothing and said so by passing.)
    const at = '2026-07-16T10:00:00Z';
    const history = [session(at, [set(EX, 40, 10), set(EX, 40, 10), set(EX, 40, 10)])];

    await ensureExercisesV5([EX], bandFor('8-10'), [], seed);
    await advanceV5([EX], () => bandFor('8-10'), history, seed, Date.parse('2026-07-16T12:00:00Z'));
    const atEight = await getSessionEarnedV5(Date.parse(at));
    expect(atEight).toHaveLength(1); // cleared 8 → the load rose, and Hush said so

    // She moves that muscle to 12-15 in the editor. Nothing rebuilds the programme; the next fold
    // simply arrives carrying the new band, because advanceV5's first line is
    // ensureExercisesV5(ids, band, …) — S-43 recomputes from her own history at the new Tlo.
    await resetV5();
    await ensureExercisesV5([EX], bandFor('12-15'), [], seed);
    await advanceV5([EX], () => bandFor('12-15'), history, seed, Date.parse('2026-07-16T12:00:00Z'));
    const atTwelve = await getSessionEarnedV5(Date.parse(at));

    // Same sets, different T, different answer: 10 reps misses a 12-15 target, so the load holds and
    // there is nothing to report. That is the band reaching the decision.
    expect(atTwelve).toEqual([]);
  });
});
