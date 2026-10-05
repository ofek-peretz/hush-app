/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE SAYS WHAT THE SPEC SAYS.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md is the founder's signed contract for every line the
 * coach speaks (2026-09-08: *"תוודא שהכל ברור וכתוב נכון ומדויק ובשפה תיקנית"*). This law holds
 * the builders (`domain/voiceScript`), the number words (`domain/hebrewNumbers`) and the closed
 * grammar (`domain/voiceGrammar`) to that document, line by line: the load line's total-then-each-
 * side rule, the range never a lone number, gender by profile, a grammar that returns null for
 * anything outside its vocabulary — and, since 2026-10-05, how SHORT every line is (his verdict after
 * training with the first script: *"משפטים ארוכים… אי אפשר להתאמן ככה"*).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { initI18n, setLocale } from '@/i18n';
import { setGender, resetGender } from '@/i18n/gender';
import { hebrewDuration, hebrewKilos, hebrewNumber, hebrewReps, hebrewWhole } from '@/domain/hebrewNumbers';
import { numbersIn, parseVoiceAnswer } from '@/domain/voiceGrammar';
import { deltaLine, figuresLine, loadLine, rangeLine, voiceScript } from '@/domain/voiceScript';
import { voiceAskAfterS, nudgeAfterS } from '@/domain/setDwell';

const HE = { locale: 'he', units: 'kg' as const };
const EN = { locale: 'en', units: 'kg' as const };
const BENCH = 'bb_bench_press';
const DB = 'db_bench_press';
const CABLE = 'cable_row';

beforeAll(async () => {
  await initI18n();
  await setLocale('he');
});
afterEach(() => resetGender());

describe('⛔ numbers as words — Hebrew agrees with its noun', () => {
  it('kilos are masculine, reps feminine, fractions in the spoken feminine', () => {
    expect(hebrewKilos(40)).toBe('ארבעים קילו');
    expect(hebrewKilos(1)).toBe('קילו אחד');
    expect(hebrewKilos(2)).toBe('שני קילו');
    expect(hebrewKilos(3)).toBe('שלושה קילו');
    expect(hebrewKilos(42.5)).toBe('ארבעים ושתיים וחצי קילו');
    // One and a fraction is said the way a gym says it (2026-09-27): "קילו ורבע", never "אחת ורבע קילו".
    expect(hebrewKilos(1.25)).toBe('קילו ורבע');
    expect(hebrewKilos(1.5)).toBe('קילו וחצי');
    expect(hebrewKilos(2.5)).toBe('שתיים וחצי קילו');
    expect(hebrewKilos(0.5)).toBe('חצי קילו');
    expect(hebrewKilos(12.5)).toBe('שתים עשרה וחצי קילו');
    expect(hebrewKilos(100)).toBe('מאה קילו');
    expect(hebrewKilos(120)).toBe('מאה ועשרים קילו');
    expect(hebrewReps(8)).toBe('שמונה חזרות');
    expect(hebrewReps(1)).toBe('חזרה אחת');
    expect(hebrewReps(2)).toBe('שתי חזרות');
    expect(hebrewReps(12)).toBe('שתים עשרה חזרות');
    expect(hebrewWhole(21, 'm')).toBe('עשרים ואחד');
    expect(hebrewWhole(21, 'f')).toBe('עשרים ואחת');
    expect(hebrewNumber(0.5, 'm')).toBe('חצי');
  });

  it('a rest is said the way a coach says it', () => {
    expect(hebrewDuration(90)).toBe('דקה וחצי');
    expect(hebrewDuration(60)).toBe('דקה');
    expect(hebrewDuration(120)).toBe('שתי דקות');
    expect(hebrewDuration(150)).toBe('שתי דקות וחצי');
    expect(hebrewDuration(180)).toBe('שלוש דקות');
    expect(hebrewDuration(45)).toBe('ארבעים וחמש שניות');
    expect(hebrewDuration(75)).toBe('דקה ורבע');
    expect(hebrewDuration(70)).toBe('דקה ועשר שניות');
  });
});

describe('⛔ the load line — a bar by what goes on each side (spec §2)', () => {
  // Founder, 2026-10-05: *"אני לא בטוח שצריך להגיד את סך המשקל הכולל. אלא רק כמה בכל צד."*
  it('a barbell: what goes on each side — never the total, the bar\'s own weight or the plates one by one', () => {
    expect(loadLine(BENCH, 40, HE)).toBe('עשרה קילו בכל צד');
    // Standard Hebrew: kilos take the masculine ("ארבעים וחמישה קילו"); a fraction is said in the
    // spoken feminine ("שתיים וחצי קילו") — the founder's condition was correct language, not slang.
    expect(loadLine(BENCH, 45, HE)).toBe('שתים עשרה וחצי קילו בכל צד');
    expect(loadLine(BENCH, 20, HE)).toBe('המוט בלבד');
  });
  it('dumbbells say "in each hand", a machine says its total once, bodyweight says no weight', () => {
    expect(loadLine(DB, 12.5, HE)).toBe('שתים עשרה וחצי קילו בכל יד');
    expect(loadLine(CABLE, 40, HE)).toBe('ארבעים קילו');
    expect(loadLine(BENCH, null, HE)).toBe('בלי משקל');
  });
  it('⛔ a band is said as a band — no kilograms, and not "no weight" either (2026-09-10)', () => {
    expect(loadLine('band_curl', null, HE)).toBe('עם הגומייה');
    expect(deltaLine('band_curl', 0, 0, HE)).toBe('');
    // …while a bodyweight lift keeps its own line.
    expect(loadLine('push_up', null, HE)).toBe('בלי משקל');
  });
  it('⛔ a lift with NO load is never given a "starting weight" — there is none (2026-09-10)', () => {
    for (const id of ['push_up', 'band_curl']) {
      for (const line of [voiceScript.loadFirstTime(id, null, 8, 12, HE), voiceScript.loadCalibrated(id, null, 8, 12, HE)]) {
        expect({ id, line, offersWeight: line.includes('משקל פתיחה') || line.includes('משקל אחר') }).toEqual({ id, line, offersWeight: false });
      }
    }
    expect(voiceScript.loadCalibrated('band_curl', null, 8, 12, HE)).toContain('עם הגומייה');
    // the body's range already says "no weight" — once, not twice
    expect(voiceScript.loadCalibrated('push_up', null, 8, 12, HE).split('בלי משקל').length - 1).toBe(1);
    // …and a loaded lift met for the first time names its load for what it is
    expect(voiceScript.loadFirstTime(BENCH, 40, 8, 12, HE)).toContain('משקל פתיחה');
  });
  it('the range is always a range, and never a lone number', () => {
    expect(rangeLine(8, 10, 40, HE)).toBe('שמונה עד עשר חזרות');
    expect(rangeLine(8, 10, null, HE)).toBe('שמונה עד עשר חזרות, בלי משקל');
  });
  it('a change on a bar is what to move; on anything else the new total is the instruction', () => {
    expect(deltaLine(BENCH, 40, 42.5, HE)).toBe('תוסיף קילו ורבע בכל צד');
    expect(deltaLine(BENCH, 40, 37.5, HE)).toBe('תוריד קילו ורבע מכל צד');
    // ⛔ 2026-10-05: "עולים לחמישה עשר קילו: קח חמישה עשר קילו בכל יד" said one number twice.
    expect(deltaLine(DB, 12.5, 15, HE)).toBe('');
    expect(deltaLine(CABLE, 40, 45, HE)).toBe('');
    expect(voiceScript.verdictUp(DB, 12.5, 15, HE)).toBe('עולים לחמישה עשר קילו בכל יד.');
    expect(voiceScript.verdictUp(CABLE, 40, 45, HE)).toBe('עולים לארבעים וחמישה קילו.');
    expect(voiceScript.verdictDown(CABLE, 45, 40, HE)).toBe('יורדים לארבעים קילו.');
  });
  it('English keeps digits and the same shape', async () => {
    await setLocale('en');
    try {
      expect(loadLine(BENCH, 40, EN)).toBe('10 kilos on each side');
      expect(loadLine(DB, 12.5, EN)).toBe('12.5 kilos in each hand');
      expect(loadLine('band_row', null, EN)).toBe('with the band');
      expect(rangeLine(8, 10, 40, EN)).toBe('8 to 10 reps');
      expect(voiceScript.askDone()).toBe('How many reps?');
      expect(voiceScript.setStart(2, 4, false, EN)).toBe('Set 2 of 4.');
      expect(voiceScript.verdictUp(BENCH, 40, 42.5, EN)).toBe('Add 1.25 kilos on each side.');
      expect(voiceScript.verdictUp(CABLE, 40, 45, EN)).toBe('Up to 45 kilos.');
    } finally {
      await setLocale('he');
    }
  });
});

describe('⛔ the lines, word for word (spec §3)', () => {
  it('the first workout teaches the dialogue ONCE — in her gender', () => {
    expect(voiceScript.openFirstSession()).toBe('אני המאמנת שלך. לפני כל סט, תגיד: מוכן. אחרי הסט, תגיד כמה חזרות. אם המשקל לא מתאים, תגיד משקל אחר.');
    expect(voiceScript.openSession('חזה וגב', 6, 50, HE)).toBe('חזה וגב. שישה תרגילים, בערך חמישים דקות.');
    setGender('female');
    expect(voiceScript.openFirstSession()).toBe('אני המאמנת שלך. לפני כל סט, תגידי: מוכנה. אחרי הסט, תגידי כמה חזרות. אם המשקל לא מתאים, תגידי משקל אחר.');
    expect(voiceScript.readyPrompt()).toBe('מוכנה?');
  });
  it('the loading dialogue, calibrated and first time: the lift, its load, its range', () => {
    expect(voiceScript.loadCalibrated(BENCH, 40, 8, 10, HE)).toBe('לחיצת חזה במוט. עשרה קילו בכל צד. שמונה עד עשר חזרות.');
    expect(voiceScript.loadFirstTime(BENCH, 40, 8, 10, HE)).toBe('לחיצת חזה במוט. משקל פתיחה: עשרה קילו בכל צד. שמונה עד עשר חזרות.');
    expect(voiceScript.loadCalibrated(CABLE, 40, 10, 12, HE)).toBe('חתירה בפולי בישיבה. ארבעים קילו. עשר עד שתים עשרה חזרות.');
  });
  it('the set after a load moved names the set and what the equipment should now hold', () => {
    expect(voiceScript.loadChanged(BENCH, 42.5, 2, 4, false, HE)).toBe('סט שני מתוך ארבעה. אחת עשרה ורבע קילו בכל צד.');
    expect(voiceScript.loadChanged(CABLE, 45, 2, 4, false, HE)).toBe('סט שני מתוך ארבעה. ארבעים וחמישה קילו.');
    // The last working set of a lift is named as such (2026-09-27).
    expect(voiceScript.loadChanged(BENCH, 42.5, 4, 4, false, HE)).toBe('סט אחרון. אחת עשרה ורבע קילו בכל צד.');
  });
  it('⛔ a load SHE named is said back both ways on a bar — the one place the total is spoken', () => {
    // Her number may be the bar's total or one side of it; only both figures show which was understood.
    expect(voiceScript.loadEcho(BENCH, 50, HE)).toBe('חמישים קילו, חמישה עשר קילו בכל צד.');
    expect(voiceScript.loadEcho(BENCH, 20, HE)).toBe('עשרים קילו, המוט בלבד.');
    expect(voiceScript.loadEcho(CABLE, 45, HE)).toBe('ארבעים וחמישה קילו.');
    expect(voiceScript.loadEcho(DB, 15, HE)).toBe('חמישה עשר קילו בכל יד.');
  });
  it('the calibration start, the go, the fallback', () => {
    expect(voiceScript.calibrationStart(BENCH, 30, HE)).toBe('נתחיל קל: חמישה קילו בכל צד. תעשה כמה חזרות שנוח לך.');
    expect(voiceScript.go()).toBe('קדימה.');
    // ⛔ 2026-09-27: the loading window running out is never a dead end — the question still comes.
    expect(voiceScript.readyFallback()).toBe('תלחץ על מוכן במסך הנעילה.');
    expect(voiceScript.readyNotHeard()).toBe('לא שמעתי מוכן. אשאל בסוף הסט.');
  });
  it('the done question is two words; the echo says her reps and "נרשם" — and the load only when it is news', () => {
    expect(voiceScript.askDone()).toBe('כמה חזרות?');
    expect(voiceScript.askDoneLast()).toBe('כמה חזרות?');
    expect(voiceScript.askReps()).toBe('כמה חזרות?');
    // ⛔ 2026-10-05: at the plan's load the set is said back by its reps alone…
    expect(voiceScript.echo(40, 10, HE, 40)).toBe('עשר חזרות. נרשם.');
    // …a load she changed is said, and so is a set with no plan to compare it to.
    expect(voiceScript.echo(42.5, 10, HE, 40)).toBe('ארבעים ושתיים וחצי קילו, עשר חזרות. נרשם.');
    expect(voiceScript.echo(40, 10, HE)).toBe('ארבעים קילו, עשר חזרות. נרשם.');
    expect(voiceScript.echo(null, 10, HE)).toBe('עשר חזרות. נרשם.');
    expect(figuresLine(40, 8, HE)).toBe('ארבעים קילו, שמונה חזרות');
    // Two silences write NOTHING (founder, 2026-09-09): the set stays open, and she is told where "done" lives.
    expect(voiceScript.notHeard()).toBe('לא שמעתי. כמה חזרות? אפשר גם לסמן במסך הנעילה או בשעון.');
    // ⛔ 2026-09-27: silence after this question writes NOTHING — it is a question, and ends as one.
    expect(voiceScript.confirmHeard(40, 12, HE)).toBe('שמעתי ארבעים קילו, שתים עשרה חזרות. נכון?');
    expect(voiceScript.confirmHeard(40, 12, HE, 40)).toBe('שמעתי שתים עשרה חזרות. נכון?');
  });
  it('the verdict is the move; the rest, the set, the crossing and the end', () => {
    // ⛔ 2026-10-05: no "מעולה, יותר מהטווח" — she knows what she did; the line is where the load goes.
    // On a bar the move is what to move; the direction is in the verb.
    expect(voiceScript.verdictUp(BENCH, 40, 42.5, HE)).toBe('תוסיף קילו ורבע בכל צד.');
    expect(voiceScript.verdictDown(BENCH, 40, 37.5, HE)).toBe('תוריד קילו ורבע מכל צד.');
    expect(voiceScript.verdictHold()).toBe('אותו משקל.');
    expect(voiceScript.verdictCalibrated(BENCH, 30, 35, HE)).toBe('תוסיף שתיים וחצי קילו בכל צד.');
    expect(voiceScript.rest(90, HE)).toBe('מנוחה: דקה וחצי.');
    expect(voiceScript.tenSeconds()).toBe('עוד עשר שניות.');
    // A set at the same load is its number — the load is on the bar, the range was said at the opening.
    expect(voiceScript.setStart(2, 4, false, HE)).toBe('סט שני מתוך ארבעה.');
    expect(voiceScript.setStart(4, 4, false, HE)).toBe('סט אחרון.');
    // The crossing names the next lift AND its load — she fetches it during this rest (2026-09-27).
    expect(voiceScript.liftDone(CABLE, 45, false, 120, HE)).toBe('התרגיל הבא: חתירה בפולי בישיבה, ארבעים וחמישה קילו. מנוחה: שתי דקות.');
    expect(voiceScript.liftDone(DB, 20, true, 90, HE)).toBe('התרגיל האחרון: לחיצת חזה במשקולות יד, עשרים קילו בכל יד. מנוחה: דקה וחצי.');
    expect(voiceScript.liftDone('pull_up', null, false, 60, HE)).toBe('התרגיל הבא: מתח באחיזה רחבה. מנוחה: דקה.');
    expect(voiceScript.liftDone(BENCH, 40, false, 120, HE)).toBe('התרגיל הבא: לחיצת חזה במוט, עשרה קילו בכל צד. מנוחה: שתי דקות.');
    expect(voiceScript.sessionDone(5, 42, 0, HE)).toBe('כל הכבוד. חמישה תרגילים, ארבעים ושתיים דקות.');
    expect(voiceScript.sessionDone(5, 42, 1, HE)).toBe('כל הכבוד. חמישה תרגילים, ארבעים ושתיים דקות, ושיא אישי חדש.');
    expect(voiceScript.sessionDone(5, 42, 3, HE)).toBe('כל הכבוד. חמישה תרגילים, ארבעים ושתיים דקות, ושלושה שיאים אישיים חדשים.');
    // ⛔ No promise about next time (2026-09-27), and no line at the end of a first lift at all (2026-10-05).
    expect((voiceScript as Record<string, unknown>).nextTimeStart).toBeUndefined();
    expect((voiceScript as Record<string, unknown>).learnedLift).toBeUndefined();
    expect(voiceScript.record()).toBe('שיא אישי חדש.');
    setGender('female');
    expect(voiceScript.askDoneWarmup()).toBe('סִיַּמְתְּ את החימום?');
  });
  it('⛔ a set is masculine and counted as one — an ordinal, and the total in its gender (2026-10-05)', () => {
    expect(voiceScript.setStart(1, 3, false, HE)).toBe('סט ראשון מתוך שלושה.');
    expect(voiceScript.setStart(3, 5, false, HE)).toBe('סט שלישי מתוך חמישה.');
    expect(voiceScript.setStart(1, 1, false, HE)).toBe('סט אחד.');
    expect(voiceScript.setStart(1, 2, true, HE)).toBe('חימום ראשון מתוך שניים.');
    expect(voiceScript.setStart(1, 1, true, HE)).toBe('סט חימום.');
    // …and never the feminine counting it used to be.
    for (let n = 1; n <= 6; n++) for (let m = n; m <= 6; m++) expect(voiceScript.setStart(n, m, false, HE)).not.toMatch(/שתיים|שלוש(\.| )|ארבע(\.| )|חמש(\.| )/);
  });
  it('⛔ a hold is counted aloud and ended by her word (2026-09-27)', () => {
    expect(voiceScript.holdLoading('פלאנק', 45, HE)).toBe('פלאנק, ארבעים וחמש שניות.');
    expect(voiceScript.askDoneHold()).toBe('זהו. סיימת?');
    expect(voiceScript.askDoneHoldAgain()).toBe('סיימת?');
    expect(voiceScript.holdEcho(30, HE)).toBe('שלושים שניות. נרשם.');
    expect(voiceScript.holdNotHeard()).toBe('לא שמעתי. תגיד סיימתי, או תסמן במסך הנעילה.');
    setGender('female');
    expect(voiceScript.holdNotHeard()).toBe('לא שמעתי. תגידי סיימתי, או תסמני במסך הנעילה.');
  });
  it('⛔ no technique line, on any set (founder, 2026-09-27: "לא צריך בכלל")', () => {
    expect((voiceScript as Record<string, unknown>).formCue).toBeUndefined();
  });
  it('⛔ a superset is loaded as one sentence per lift, each named once; its echo is the reps (2026-09-27)', () => {
    const steps = [
      { exerciseId: 'triceps_pushdown', kg: 25, lo: 12, hi: 15 },
      { exerciseId: 'ez_bar_curl', kg: 25, lo: 10, hi: 12 },
    ];
    const line = voiceScript.roundLoading(steps, HE);
    expect(line).toMatch(/^סופר סט\. פשיטת מרפקים בפולי עליון: .+\. ואז כפיפת מרפקים במוט איזי: .+ חזרות\.$/);
    expect(line.split('פשיטת מרפקים בפולי עליון').length - 1).toBe(1);
    expect(voiceScript.echoRound([{ exerciseId: 'triceps_pushdown', kg: 25, reps: 15 }, { exerciseId: 'ez_bar_curl', kg: 25, reps: 12 }], HE)).toBe(
      'פשיטת מרפקים בפולי עליון: חמש עשרה חזרות. כפיפת מרפקים במוט איזי: שתים עשרה חזרות. נרשם.',
    );
  });
});

/*
 * ════ ⛔ SHORT (founder, 2026-10-05, after the first workout with the voice) ════
 *   > *"היא מדברת משפטים ארוכים וזה הכי גרוע כי זה צריך להיות כמה שפחות חיכוך. אי אפשר להתאמן ככה."*
 * The first script opened a lift with 131 characters — fourteen seconds of speech — and read the load
 * and the range again before every set. These hold the lengths, and the one rule that made them long:
 * the dialogue is taught in the first workout's opening and by no other line.
 */
describe('⛔ short — a line says what changed and what to do, once (founder, 2026-10-05)', () => {
  const steps = [
    { exerciseId: 'triceps_pushdown', kg: 25, lo: 12, hi: 15 },
    { exerciseId: 'ez_bar_curl', kg: 25, lo: 10, hi: 12 },
  ];
  const everyLine = () => [
    voiceScript.openSession('חזה וגב', 6, 50, HE),
    voiceScript.loadCalibrated(BENCH, 40, 8, 10, HE),
    voiceScript.loadFirstTime(BENCH, 40, 8, 10, HE),
    voiceScript.loadCalibrated('push_up', null, 8, 12, HE),
    voiceScript.warmupStart(BENCH, 20, 8, 1, 2, HE),
    voiceScript.loadChanged(BENCH, 42.5, 2, 4, false, HE),
    voiceScript.liftDone(BENCH, 40, false, 120, HE),
    voiceScript.loadEcho(BENCH, 50, HE),
    voiceScript.calibrationStart(BENCH, 30, HE),
    voiceScript.skippedLift(CABLE, 40, 10, 12, HE),
    voiceScript.holdLoading('פלאנק', 45, HE),
    voiceScript.roundLoading(steps, HE),
    voiceScript.setStart(2, 4, false, HE),
    voiceScript.roundStart(2, 3, HE),
    voiceScript.askDone(),
    voiceScript.askDoneSuperset(BENCH, CABLE),
    voiceScript.echo(40, 10, HE, 40),
    voiceScript.confirmHeard(40, 10, HE, 40),
    voiceScript.verdictUp(BENCH, 40, 42.5, HE),
    voiceScript.verdictHold(),
    voiceScript.rest(90, HE),
    voiceScript.liftDone(CABLE, 45, false, 120, HE),
    voiceScript.sessionDone(5, 42, 1, HE),
  ];
  it('only the first workout\'s opening tells her what to say — no other line teaches the dialogue', () => {
    for (const gender of ['male', 'female'] as const) {
      setGender(gender);
      for (const line of everyLine()) {
        expect({ line, teaches: /תגיד|תגידי|משקל אחר|כשהמוט|כשאת|כשהכל/.test(line) }).toEqual({ line, teaches: false });
      }
    }
  });
  it('a lift is opened in a breath, a set at the same load is only its number', () => {
    expect(voiceScript.loadCalibrated(BENCH, 40, 8, 10, HE).length).toBeLessThanOrEqual(55); // was 131
    expect(voiceScript.loadFirstTime(BENCH, 40, 8, 10, HE).length).toBeLessThanOrEqual(70); // was 187
    expect(voiceScript.setStart(2, 4, false, HE).length).toBeLessThanOrEqual(20); // was 50
    expect(voiceScript.askDone().length).toBeLessThanOrEqual(12); // was 29
    expect(voiceScript.echo(40, 10, HE, 40).length).toBeLessThanOrEqual(20); // was 29
    // One set, end to end — its number, the question, the echo, the verdict, the rest — against 150 before.
    const oneSet = [voiceScript.setStart(2, 4, false, HE), voiceScript.askDone(), voiceScript.echo(40, 10, HE, 40), voiceScript.verdictHold(), voiceScript.rest(90, HE)];
    expect(oneSet.join(' ').length).toBeLessThanOrEqual(75);
  });
  it('⛔ a bar is never said by its total — only what goes on each side (her own echo excepted)', () => {
    const total = 'ארבעים';
    for (const line of [
      voiceScript.loadCalibrated(BENCH, 40, 8, 10, HE),
      voiceScript.loadFirstTime(BENCH, 40, 8, 10, HE),
      voiceScript.warmupStart(BENCH, 40, 5, 1, 2, HE),
      voiceScript.loadChanged(BENCH, 40, 2, 4, false, HE),
      voiceScript.calibrationStart(BENCH, 40, HE),
      voiceScript.skippedLift(BENCH, 40, 8, 10, HE),
      voiceScript.verdictUp(BENCH, 37.5, 40, HE),
      voiceScript.verdictDown(BENCH, 42.5, 40, HE),
      voiceScript.liftDone(BENCH, 40, false, 120, HE),
    ]) {
      expect({ line, saysTotal: line.includes(total) }).toEqual({ line, saysTotal: false });
      expect(line).toMatch(/בכל צד|מכל צד/);
    }
  });
  it('the load is never said twice in one line', () => {
    for (const line of everyLine()) {
      for (const figure of ['ארבעים קילו', 'ארבעים וחמישה קילו', 'ארבעים ושתיים וחצי קילו', 'חמישים קילו']) {
        expect({ line, figure, times: line.split(figure).length - 1 > 1 }).toEqual({ line, figure, times: false });
      }
    }
  });
});

describe('⛔ the closed grammar — the vocabulary, and nothing else', () => {
  it('reads Hebrew and English numbers, with halves and quarters', () => {
    expect(numbersIn('ארבעים וחמש')).toEqual([45]);
    expect(numbersIn('שתים עשרה וחצי')).toEqual([12.5]);
    expect(numbersIn('ארבעים ושתיים וחצי קילו עשר חזרות')).toEqual([42.5, 10]);
    expect(numbersIn('45 10')).toEqual([45, 10]);
    expect(numbersIn('מאה ועשרים')).toEqual([120]);
    expect(numbersIn('forty two and a half')).toEqual([42.5]);
    expect(numbersIn('אחת ורבע')).toEqual([1.25]);
    // A Hebrew compound carries the ו: "שישים, שמונה" is 60 then 8 (a load, then reps) — never 68.
    expect(numbersIn('שישים, שמונה')).toEqual([60, 8]);
    expect(numbersIn('מאה שמונה')).toEqual([100, 8]);
    expect(numbersIn('שתיים עשרה')).toEqual([12]);
  });
  it('the words of the spec, each to its answer', () => {
    expect(parseVoiceAnswer('מוכן')).toEqual({ kind: 'ready' });
    expect(parseVoiceAnswer('יאללה')).toEqual({ kind: 'ready' });
    expect(parseVoiceAnswer('ready')).toEqual({ kind: 'ready' });
    expect(parseVoiceAnswer('כן')).toEqual({ kind: 'yes' });
    expect(parseVoiceAnswer('לא')).toEqual({ kind: 'no' });
    expect(parseVoiceAnswer('עוד רגע')).toEqual({ kind: 'no' });
    expect(parseVoiceAnswer('סיימתי')).toEqual({ kind: 'done' });
    expect(parseVoiceAnswer('כמו שכתוב')).toEqual({ kind: 'as_written' });
    expect(parseVoiceAnswer('קל יותר')).toEqual({ kind: 'easier' });
    expect(parseVoiceAnswer('יותר כבד')).toEqual({ kind: 'harder' });
    expect(parseVoiceAnswer('לא יודע')).toEqual({ kind: 'dont_know' });
    expect(parseVoiceAnswer('אין לי מושג')).toEqual({ kind: 'dont_know' });
    expect(parseVoiceAnswer('דלג')).toEqual({ kind: 'skip' });
    expect(parseVoiceAnswer('תפוס')).toEqual({ kind: 'skip' });
    expect(parseVoiceAnswer('עצור')).toEqual({ kind: 'pause' });
    expect(parseVoiceAnswer('המשך')).toEqual({ kind: 'resume' });
    expect(parseVoiceAnswer('סיים אימון')).toEqual({ kind: 'finish' });
  });
  it('figures carry their numbers in order, their unit words, and whether they open as a correction', () => {
    expect(parseVoiceAnswer('עשר')).toEqual({ kind: 'figures', numbers: [10], saysKg: false, saysReps: false, correction: false, lb: false });
    expect(parseVoiceAnswer('ארבעים וחמש קילו')).toMatchObject({ kind: 'figures', numbers: [45], saysKg: true });
    expect(parseVoiceAnswer('ארבעים וחמש, עשר')).toMatchObject({ kind: 'figures', numbers: [45, 10] });
    expect(parseVoiceAnswer('לא, עשר')).toMatchObject({ kind: 'figures', numbers: [10], correction: true });
    expect(parseVoiceAnswer('תקן: ארבעים וחמש, עשר')).toMatchObject({ kind: 'figures', numbers: [45, 10], correction: true });
    expect(parseVoiceAnswer('100 pounds 8 reps')).toMatchObject({ kind: 'figures', numbers: [100, 8], lb: true, saysReps: true });
    // ⛔ 2026-10-05: the coach says a bar by its sides, so that is how she answers it.
    expect(parseVoiceAnswer('חמש עשרה בכל צד')).toEqual({ kind: 'figures', numbers: [15], saysKg: false, saysReps: false, correction: false, lb: false, perSide: true });
    expect(parseVoiceAnswer('עשרים קילו לכל צד')).toMatchObject({ kind: 'figures', numbers: [20], saysKg: true, perSide: true });
    expect(parseVoiceAnswer('שתים עשרה וחצי מכל צד')).toMatchObject({ kind: 'figures', numbers: [12.5], perSide: true });
    expect(parseVoiceAnswer('ten a side')).toMatchObject({ kind: 'figures', numbers: [10], perSide: true });
    expect(parseVoiceAnswer('25 per side')).toMatchObject({ kind: 'figures', numbers: [25], perSide: true });
  });
  it('⛔ anything outside the vocabulary is null — a gym is the loudest room the app is ever in', () => {
    for (const noise of ['היה קשה', 'מה קורה אחי', 'תעביר לי את המשקולת', 'this song is great', '', '   ', 'אולי']) {
      expect(parseVoiceAnswer(noise)).toBeNull();
    }
  });
});

describe("the voice asks earlier than the pocket's ask — the start is known", () => {
  it('floor reps × rep time + 15, with no setup priced in', () => {
    const voice = voiceAskAfterS(BENCH, 8);
    const clock = nudgeAfterS(BENCH, 8);
    expect(voice).toBeLessThan(clock);
    expect(clock - voice).toBe(60 - 5); // the compound setup (60) less the five seconds of extra margin
  });
});
