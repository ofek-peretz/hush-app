/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SET THAT RAN LONG IS ASKED ABOUT — founder, 2026-08-30/31.
 *
 *   > *"אני לפעמים שוכח להזין את תוצאות הסט וכבר ממתין לסט הבא ואז כשרואה שזה לא הגיוני שהמנוחה
 *   > עדיין לא הסתיימה אני מבין ששכחתי להזין בכלל את סיום הסט."*
 *   > *"כעבור זמן מסוים שכבר הייתי אמור לסיים את הסט צריך להשלח התראה של להזין את התוצאה."*
 *
 * ── THE RULING THIS HOLDS ───────────────────────────────────────────────────────────────────────
 * The app cannot see the last rep, so it must not pretend to. An earlier proposal credited the
 * excess dwell against her rest — inferring, silently, that four minutes on a set screen was three
 * minutes of recovery. The founder replaced it with a question, and the difference is the law:
 *
 *   1 · IT ASKS, IT NEVER INFERS — nothing is written, credited or learned from a long dwell;
 *   2 · IT ASKS OFF THE PRESCRIPTION — setup + reps × this lift's rep time + ten seconds, and
 *       NOTHING that varies from set to set (founder, 2026-08-31: *"סתם סיבכת את זה… זה צריך
 *       להיות פשוט"*). It was twice her measured `learnedExecS` for one day, and his objection is
 *       the one that settles it: her set time is exactly the quantity this is trying to detect a
 *       deviation in, so a statistic built out of it moves with the noise;
 *   3 · IT ASKS ONCE, and never about a step it cannot possibly be right about;
 *   4 · IT REACHES A POCKET — the failure happens with the phone away, so the OS carries it, and
 *       the two halves (screen and pocket) never both speak.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { nudgeAfterS, nudgeApplies, learnedExecSFor, BUFFER_S } from '@/domain/setDwell';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const BENCH = 'bb_bench_press';
const step = (over: Record<string, unknown> = {}) => ({
  exerciseId: BENCH,
  exerciseSetIndex: 0,
  target: { exerciseId: BENCH, setIndex: 0, recommendedWeight: 60, recommendedReps: 8 },
  ...over,
});

describe('2 · it asks off the PRESCRIPTION — arithmetic, not a measurement', () => {
  /* Bench is a compound (60 s of setup) and its rig runs the canonical 4.0 s rep. */
  it('setup + reps × the rep time + ten seconds', () => {
    expect(nudgeAfterS(BENCH, 8)).toBe(60 + 8 * 4 + BUFFER_S); // 102
    expect(nudgeAfterS(BENCH, 5)).toBe(60 + 5 * 4 + BUFFER_S); // 90
    expect(nudgeAfterS(BENCH, 12)).toBe(60 + 12 * 4 + BUFFER_S); // 118
  });

  it('an isolation lift is given less setup — there is no bar to load', () => {
    expect(nudgeAfterS('db_curl', 10)).toBeLessThan(nudgeAfterS(BENCH, 10));
  });

  it("⛔ IT IS BOUNDED BY CONSTRUCTION — no floor, no ceiling, nothing to clamp", () => {
    /*
     * The measured version needed `NUDGE_FLOOR_S` (90) so a fast athlete was not interrupted under
     * the bar, and `NUDGE_CEILING_S` (300) so one freak sample could not push the ask past the
     * point of being useful. Both are DELETED, and this is why: the arithmetic cannot leave that
     * window on any prescription the coach can actually write.
     *
     * ⚠️ THE FLOOR IS ASSERTED AT 50, NOT 60, AND THE GAP IS NAMED. The formula's true minimum is a
     * ONE-rep isolation set — 40 + 4 + 10 = 54 — a prescription that does not exist in this
     * catalogue (a single-rep lateral raise is not a thing). At every rep count a coach does write,
     * three and up, the answer is 62 or more. Asserting 60 would be asserting a bound the formula
     * does not have and would break the first time somebody wrote a triple.
     */
    for (const reps of [1, 3, 5, 8, 12, 15, 20, 30]) {
      for (const id of [BENCH, 'db_curl', 'bb_back_squat', 'lat_pulldown']) {
        const s = nudgeAfterS(id, reps);
        expect(s).toBeGreaterThanOrEqual(50); // never inside a first heavy set
        expect(s).toBeLessThanOrEqual(300); // never an obituary
      }
    }
    for (const id of [BENCH, 'db_curl']) expect(nudgeAfterS(id, 3)).toBeGreaterThanOrEqual(62);
  });

  it('a nonsense rep count falls back rather than propagating', () => {
    const eight = nudgeAfterS(BENCH, 8);
    expect(nudgeAfterS(BENCH, 0)).toBe(eight);
    expect(nudgeAfterS(BENCH, -5)).toBe(eight);
    expect(nudgeAfterS(BENCH, Number.NaN)).toBe(eight);
  });

  it('⛔ AND IT READS NO HISTORY AT ALL — the same set, the same answer, on day 1 and day 300', () => {
    const src = read('src/domain/setDwell.ts');
    const fn = src.slice(src.indexOf('export function nudgeAfterS'), src.indexOf('export function nudgeApplies'));
    expect(fn).not.toContain('learnedExec');
    expect(fn).not.toContain('history');
  });
});

describe('3 · and never about a step it cannot be right about', () => {
  it('a set of a real lift, yes', () => {
    expect(nudgeApplies(step())).toBe(true);
  });

  it('⛔ NOT A HOLD, A DISTANCE OR AN OPEN ITEM — those take as long as they take', () => {
    expect(nudgeApplies(step({ item: { kind: 'time' } }))).toBe(false);
    expect(nudgeApplies(step({ item: { kind: 'distance' } }))).toBe(false);
    expect(nudgeApplies(step({ item: { kind: 'open' } }))).toBe(false);
    // …but a `reps` item IS a set, and is indistinguishable from one the old builder made.
    expect(nudgeApplies(step({ item: { kind: 'reps' } }))).toBe(true);
  });

  it('⛔ NOT A WARM-UP BRIDGE — the shortest thing in the session is not where this belongs', () => {
    expect(nudgeApplies(step({ warmup: { index: 0, count: 2 }, exerciseSetIndex: -2 }))).toBe(false);
  });

  it('not a step with no prescription, and not a movement outside the catalogue', () => {
    expect(nudgeApplies(step({ target: undefined }))).toBe(false);
    expect(nudgeApplies(step({ exerciseId: 'run_5k' }))).toBe(false);
  });
});

/*
 * ⚠️ `learnedExecSFor` OUTLIVED THE FEATURE THAT COMMISSIONED IT, and stays under test. The nudge
 * no longer calls it, but the time budget (`fixtureModel`) and *what the app knows about you*
 * (`whatIKnow`) both do, and both genuinely want a measurement. The clause it protects is that
 * there is exactly ONE walk over the logs.
 */
describe('the measurement is ONE implementation, and it refuses what it cannot know', () => {
  const log = (id: string, atMs: number, restBeforeS?: number) => ({
    exerciseId: id,
    setIndex: 0,
    recommendedWeight: 60,
    recommendedReps: 8,
    actualWeight: 60,
    actualReps: 8,
    edited: false,
    persistedAt: new Date(atMs).toISOString(),
    ...(restBeforeS != null ? { restBeforeS } : {}),
  });
  const sess = (sets: unknown[]) => ({ id: 's1', programDayId: 'd', startedAt: '2026-08-30T10:00:00Z', sets });

  it('execution is the gap MINUS the rest — the work, not the wait', () => {
    // Three sets 160 s apart, each after a 100 s rest → 60 s of execution.
    const t = Date.parse('2026-08-30T10:00:00Z');
    const h = [sess([log(BENCH, t), log(BENCH, t + 160_000, 100), log(BENCH, t + 320_000, 100)])];
    expect(learnedExecSFor(h, BENCH)).toBe(60);
  });

  it('⛔ A GAP WITH NO KNOWN REST IN IT IS NOT EVIDENCE (L3) — it is dropped, never read as zero', () => {
    const t = Date.parse('2026-08-30T10:00:00Z');
    const h = [sess([log(BENCH, t), log(BENCH, t + 240_000)])]; // rest unknown: was it work or waiting?
    expect(learnedExecSFor(h, BENCH)).toBeNull();
  });

  it('a warm-up bridge is never a sample — the standing exclusion holds here too', () => {
    const t = Date.parse('2026-08-30T10:00:00Z');
    const h = [
      sess([
        { ...log(BENCH, t), isApproach: true, isWarmup: true, setIndex: -1 },
        { ...log(BENCH, t + 60_000, 45), isApproach: true, isWarmup: true, setIndex: -1 },
      ]),
    ];
    expect(learnedExecSFor(h, BENCH)).toBeNull();
  });

  it('⛔ AND THERE IS ONLY ONE WALK OVER THE LOGS — the budget and the nudge read the same number', () => {
    /*
     * `fixtureModel`'s own header records what happens otherwise: *"THERE WERE THREE, AND THEY DID
     * NOT AGREE"*. The exec walk was hand-rolled there and was about to be copied here.
     */
    const src = read('src/data/api/fixtureModel.ts');
    expect(src).toContain('learnedExecSFor(history, id)');
    expect(src).not.toMatch(/samples\.push\(\{ exerciseId: l\.exerciseId/);
  });
});

describe('4 · it reaches a pocket, and the two halves never both speak', () => {
  const nudgeSrc = read('src/platform/setNudge.ts');
  const notifSrc = read('src/platform/notifications.ts');
  const storeSrc = read('src/state/stores/sessionStore.tsx');

  it('the ask is scheduled with the OS, so a locked phone still lights up', () => {
    // A JS timer alone is suspended the moment the phone is pocketed — which IS the founder's case.
    expect(nudgeSrc).toContain('SchedulableTriggerInputTypes.TIME_INTERVAL');
    expect(nudgeSrc).toContain("interruptionLevel: 'timeSensitive'");
  });

  it('⛔ AND IT IS SILENT ON SCREEN — the stage draws the line, so the banner stands down', () => {
    expect(notifSrc).toMatch(/kind === 'set_nudge'[\s\S]{0,200}shouldShowBanner: false/);
    // …and it never lands in the notification LIST either: an hour-old "log your set" is worse
    // than nothing, for a set logged fifty-nine minutes ago.
    expect(notifSrc).toMatch(/kind === 'set_nudge'[\s\S]{0,200}shouldShowList: false/);
  });

  it('it never raises a permission dialog at a loaded bar', () => {
    expect(nudgeSrc).toContain('hasNotificationPermission');
    expect(nudgeSrc).not.toContain('ensureNotificationPermission');
  });

  it('⛔ ONE ID, `repeats: false` — a coach asks once', () => {
    expect(nudgeSrc).toContain("const NUDGE_ID = 'hush.set_nudge'");
    expect(nudgeSrc).toContain('repeats: false');
    expect(nudgeSrc).toMatch(/async arm\([\s\S]{0,200}await cancel\(\)/); // a re-arm replaces
  });

  it('every exit from the set disarms it — nothing is left pending about a set already logged', () => {
    expect(storeSrc).toContain('void setNudge.disarm()');
    // The off-the-set branch, the not-applicable branch, and the unmount: three disarms, and the
    // in-app timer is cleared beside each of them.
    expect(storeSrc.match(/void setNudge\.disarm\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(storeSrc).toContain('clearNudgeTimer()');
  });
});

describe('1 · it asks — it never infers', () => {
  it('⛔ NOTHING IS CREDITED, LEARNED OR WRITTEN FROM A LONG DWELL', () => {
    /*
     * The rejected design. The dwell may travel to TELEMETRY (`dwellS` on `set_completed`, which is
     * how we find out whether the nudge works) and it may raise a question on screen. It may not
     * reach the rest that follows, and it may not reach the engine.
     */
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('dwellS:'); // measured…
    // …and never spent: the rest banked for the next set is what the REST screen measured, gated by
    // the rest floor, with no dwell term anywhere in it.
    // (2026-09-09: the clock no longer starts rests of its own — every rest is hers — and still no
    // dwell term. See `noSetIsWrittenByTime`.)
    expect(store).toMatch(/pendingRestSRef\.current = isRestSample\(tookS\) \? tookS : null/);
    expect(store).not.toMatch(/pendingRestSRef\.current = [^;]*dwell/i);
    expect(store).not.toMatch(/restStartedAtRef\.current = [^;]*presentedAt/i);
  });

  it('the line is a question in her language, not an order', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    for (const pack of [en, he]) {
      expect(pack.workout.setRunningLong).toBeTruthy();
      expect(pack.notifications.setNudgeTitle).toBeTruthy();
      expect(pack.notifications.setNudgeBody).toBeTruthy();
    }
    /* ⚠️ AND THE HEBREW CONJUGATES FOR NOBODY. A second-person imperative ("אל תשכח") would need a
       `_female` twin — and would be the nagging voice this feature is defined against. Every one of
       these lines is written about the SET, which has no gender. */
    for (const line of [he.workout.setRunningLong, he.notifications.setNudgeTitle, he.notifications.setNudgeBody]) {
      expect(line).not.toMatch(/תשכח|הזן|רשום/);
    }
  });
});
