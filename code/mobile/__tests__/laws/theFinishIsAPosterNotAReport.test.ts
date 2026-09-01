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
    /*
     * ⚠️ WORD-BOUNDED, AFTER IT FIRED ON `earnedReasonShared` (2026-08-22) — a style for the ledger's
     * grouped sentence, which contains the letters `onShare` between "…Reas" and "d" and has nothing
     * to do with sharing anything.
     *
     * **A law that fires on a substring inside an unrelated identifier is a law somebody eventually
     * deletes**, and the thing it protects here is a founder ruling worth keeping: *"SHARE makes us
     * look like we want publicity — they can screenshot it and post it. Let's have some class."* So
     * the pattern asks for the NAME, not for the letters: a prop, a handler or a route by that name.
     */
    /*
     * ⛔⛔ THE LAW WAS DEAD AND NOBODY KNEW (found 2026-08-23, by contradiction). The 2026-08-22
     * "word-bounded" fix wrote RAW BACKSPACE CHARACTERS (0x08) into this regex instead of the two
     * source characters backslash-b — so the pattern could only ever match a literal backspace,
     * matched nothing, and the assertion passed vacuously from the day it was "fixed". It was
     * caught only because a change that SHOULD have failed it, did not. A law is a claim; a claim
     * that cannot fail protects nothing.
     *
     * ⛔ AND THE RULING IT GUARDS WAS REVERSED THE SAME DAY, BY THE FOUNDER, BY NAME: *"המסך שאותו
     * אנשים ירצו לשתף ולהעלות לסטורי … מקור הגאווה שלהם + האפשרות לפרסום שלנו בזכות חשיפה ויראלית.
     * אנו חייבים לעמוד במשימה הזאת."* The 2026-08-02 half that SURVIVES is about the POSTER —
     * *"let's have some class"* — so the poster half of the screen still carries no share chrome;
     * the door lives in the FOOTER, quiet, in the record link's own dress, and opens the proudest
     * TRUE card (the record when one was set, the session story otherwise).
     */
    const src = flow();
    const posterHalf = src.slice(0, src.indexOf('styles.footer'));
    expect(posterHalf).not.toMatch(/\bonShareStory\b|\bShareCardModal\b/);
  });

  it('⚠️ and it ends on DONE with ONE quiet door — the story (founder, build-58 QA 2026-08-24)', () => {
    /*
     * RE-LITIGATED: the footer he photographed carried FOUR rows and buried the decisions box —
     * *"באג חריף שמסתיר את הכרטיסייה של ההחלטות"*. The record link went (the Log owns the table)
     * and the together door went (a partner workout gets its OWN screen; an ordinary finish never
     * asks). One act, one quiet door — and the box breathes again.
     */
    const src = flow();
    expect(src).toContain("t('complete.shareStory')");
    const footer = src.slice(src.indexOf('styles.footer'));
    expect(footer).not.toContain("t('complete.viewRecord')");
    expect(footer).not.toContain("t('complete.togetherDoor')");
    // The story door stays a QUIET line — never a second primary.
    expect(src).toMatch(/onPress=\{onShareStory\}[\s\S]{0,220}styles\.recordLink/);
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

describe('⛔ the story door shares the WORKOUT (founder, device QA 2026-08-23)', () => {
  /*
   * *"אני רוצה לשתף את האימון מאיפה הגיע הדדליפט הזה."* The first cut had the record card OUTRANK the
   * session at this door ("prouder truth wins"), and on his own device the door opened a deadlift
   * figure instead of the workout with her body on it. The record rides the session card as a
   * line now (`ShareSessionCard.record`, attached inside `sessionCardFromHistory`); no card may
   * outrank the workout at its own door again.
   */
  const welldone = () => read('src/screens/session/WellDone.tsx');

  it('the door builds the SESSION card, and never the record card', () => {
    const at = welldone().indexOf('onShareStory={');
    expect(at).toBeGreaterThan(-1);
    // A fixed window is enough: the door's whole builder sits within it, and the next use of
    // either builder name is many hundreds of lines away.
    const door = welldone().slice(at, at + 2400);
    expect(door).toContain('sessionCardFromHistory(');
    expect(door).not.toContain('recordCardFromHistory(');
  });

  it('…and the record is attached INSIDE the session card, so the pride is not lost', () => {
    const domain = read('src/domain/shareCard.ts');
    const at = domain.indexOf('export function sessionCardFromHistory');
    const body = domain.slice(at, domain.indexOf('export type ShareCard'));
    expect(body).toContain('recordCardFromHistory(history, units)');
  });

  it('⛔ and her BODY stands on the finish screen itself, not only behind the door', () => {
    // *"אמרת שיופיע כאן הדמויות. אין פה שום דבר שקשור לזה."* The pair was built for the share card
    // and drawn only there; the screen he photographs is this one.
    const earnedAt = welldone().indexOf('export function SessionEarned');
    expect(earnedAt).toBeGreaterThan(-1);
    const poster = welldone().slice(earnedAt, welldone().indexOf('styles.footer', earnedAt));
    expect(poster).toContain('<MiniBody face="front"');
    expect(poster).toContain('<MiniBody face="back"');
  });
});
