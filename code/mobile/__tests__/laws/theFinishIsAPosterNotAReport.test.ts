// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { sessionPoster, posterLifts } from '@/domain/sessionPoster';
import type { Session, SetLog } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NOBODY PHOTOGRAPHS A REPORT.
 *
 * ⛔ FOUNDER, 2026-08-04: *"this is the moment the athlete finishes a workout and wants to photograph
 * it for social — and right now our finish screen looks like a list of decisions and conclusions. It
 * doesn't invite anyone to be proud and put it on their story."*
 *
 * And the ruling that shapes it as much as the layout does:
 *
 *   > *"Instead of SHARE we can put DONE. SHARE makes us look like we want publicity — they can
 *   > screenshot it and post it. Let's have some class."*
 *
 * So the screen is worth a screenshot and asks for nothing. These tests hold both halves: the facts
 * the poster carries, and the absence of the button.
 *
 * ── ⚠️ WHAT THEY ARE REALLY GUARDING ────────────────────────────────────────────────────────────
 * A poster is the one screen an athlete will show other people, which makes a wrong figure on it
 * far more expensive than a wrong figure anywhere else in the app. Every test below is about a
 * number being TRUE, or about a number the screen must refuse to invent.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const set = (ex: string, w: number | null, reps: number, i = 0): SetLog =>
  ({ exerciseId: ex, setIndex: i, recommendedWeight: w, recommendedReps: 8, actualWeight: w,
     actualReps: reps, edited: false, persistedAt: '2026-08-04T10:00:00.000Z' } as SetLog);

const session = (id: string, day: string, sets: SetLog[]): Session =>
  ({ id, programDayId: 'd', programDayName: 'Lower A', startedAt: `2026-08-${day}T10:00:00.000Z`,
     state: 'SAVED', earlyFinish: false, trained: true, sets } as Session);

const HOUR = 3_600_000;

describe('the largest figure on the poster', () => {
  it('⛔ a RECORD takes it — a personal best is the one thing more postable than a total', () => {
    const past = session('a', '01', [set('bb_back_squat', 57.5, 8)]);
    const now = session('b', '04', [set('bb_back_squat', 60, 8)]);
    const p = sessionPoster({ session: now, history: [now, past], units: 'kg', durationMs: HOUR, kcal: 412 });
    expect(p.hero).toMatchObject({ kind: 'record', exerciseId: 'bb_back_squat', value: 60, reps: 8, delta: 2.5 });
  });

  it('otherwise the TONNES she moved — the number nobody else states', () => {
    // Same lift at a weight she has hit before: no record, so the total leads.
    const past = session('a', '01', [set('bb_back_squat', 60, 8)]);
    const now = session('b', '04', [set('bb_back_squat', 60, 8), set('bb_back_squat', 60, 8, 1)]);
    const p = sessionPoster({ session: now, history: [now, past], units: 'kg', durationMs: HOUR, kcal: 412 });
    expect(p.hero).toEqual({ kind: 'tonnes', value: 1 }); // 60×8×2 = 960 kg → 1.0 t
  });

  it('⛔ and a BODYWEIGHT session never leads with "0.0 t"', () => {
    /*
     * The one screen meant to make her proud, opening on a report of nothing. A session with no load
     * in it still has sets, and the set count is a true fact about it.
     */
    const now = session('b', '04', [set('pull_up', null, 8), set('pull_up', null, 7, 1), set('plank', null, 1, 2)]);
    const p = sessionPoster({ session: now, history: [now], units: 'kg', durationMs: HOUR, kcal: 300 });
    expect(p.hero).toEqual({ kind: 'sets', value: 3 });
    expect(p.tonnes).toBe(0);
  });

  it('⚠️ the record is ASKED FOR, not re-derived here', () => {
    // `domain/shareCard` owns what an all-time best is. A second definition would eventually
    // disagree with the card it is named after, on the one screen she shows other people.
    expect(read('src/domain/sessionPoster.ts')).toContain("from '@/domain/shareCard'");
    expect(read('src/domain/sessionPoster.ts')).toContain('recordCardFromHistory(opts.history, opts.units)');
  });
});

describe('the receipt — what makes a screenshot credible', () => {
  it('one row per lift, in the order she did them, with every set’s reps', () => {
    const s = session('b', '04', [
      set('bb_back_squat', 60, 8), set('bb_back_squat', 60, 7, 1),
      set('leg_press', 120, 11), set('leg_press', 120, 10, 1),
    ]);
    expect(posterLifts(s, 'kg')).toEqual([
      { exerciseId: 'bb_back_squat', load: 60, unit: 'kg', reps: [8, 7] },
      { exerciseId: 'leg_press', load: 120, unit: 'kg', reps: [11, 10] },
    ]);
  });

  it('⚠️ the load is the one she FINISHED on — Loop 1 moves it mid-exercise', () => {
    /*
     * The same rule `lastTimeOn` and `coachFacts` use. Three surfaces reading the same fact three
     * different ways is how a receipt ends up disagreeing with the coach that produced it.
     */
    const s = session('b', '04', [set('x', 40, 11), set('x', 42.5, 9, 1), set('x', 42.5, 8, 2)]);
    expect(posterLifts(s, 'kg')[0]).toMatchObject({ load: 42.5, reps: [11, 9, 8] });
  });

  it('a bodyweight lift carries NO load and no unit — never a zero', () => {
    // "0 kg × 8" on a pull-up would be a lie printed on the thing she posts.
    expect(posterLifts(session('b', '04', [set('pull_up', null, 8)]), 'kg')[0])
      .toEqual({ exerciseId: 'pull_up', load: null, unit: '', reps: [8] });
  });

  it('an empty session produces an empty receipt rather than throwing', () => {
    expect(posterLifts(null, 'kg')).toEqual([]);
    expect(posterLifts(session('b', '04', []), 'kg')).toEqual([]);
  });
});

describe('⛔ and it asks for nothing', () => {
  const flow = () => read('src/screens/session/WellDone.tsx');

  it('there is no share control on the finish screen', () => {
    /*
     * ⛔ FOUNDER: *"SHARE makes us look like we want publicity — they can screenshot it and post it.
     * Let's have some class."* The card module still exists and still makes a real record card; what
     * is refused is the ASK.
     */
    expect(flow()).not.toMatch(/complete\.share|onShare|ShareCardModal/);
  });

  it('⚠️ and it ends on DONE, with exactly one quiet door beside it', () => {
    // Three controls on a closing beat is three decisions where there should be one.
    expect(flow()).toContain("label={t('complete.done')}");
    expect(flow()).toContain("t('complete.viewRecord')");
  });

  it('⛔ the decisions are NOT deleted — they are below the poster', () => {
    /*
     * *"I'm not saying we shouldn't give access to the decisions if they want them."* Putting them
     * behind a tap would have been a third control; scrolling is access, and it costs nothing.
     * The ledger is unchanged — only what stands above it is new.
     */
    expect(flow()).toContain('THE DECISIONS —');
    expect(flow()).toContain('styles.earned');
  });
});
