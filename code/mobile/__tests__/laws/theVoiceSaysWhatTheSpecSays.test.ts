/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE SAYS WHAT THE SPEC SAYS.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md is the founder's signed contract for every line the
 * coach speaks (2026-09-08: *"תוודא שהכל ברור וכתוב נכון ומדויק ובשפה תיקנית"*). This law holds
 * the builders (`domain/voiceScript`), the number words (`domain/hebrewNumbers`) and the closed
 * grammar (`domain/voiceGrammar`) to that document, line by line: the total-then-how-to-build-it
 * rule of the load line, the range never a lone number, gender by profile, and a grammar that
 * returns null for anything outside its vocabulary.
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
    expect(hebrewKilos(1.25)).toBe('אחת ורבע קילו');
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

describe('⛔ the load line — the total, then how to build it (spec §2)', () => {
  it('a barbell: the bar, then each side; plates named when there is more than one', () => {
    expect(loadLine(BENCH, 40, HE)).toBe('ארבעים קילו: המוט עשרים קילו, ועשרה קילו בכל צד');
    // Standard Hebrew: kilos take the masculine ("ארבעים וחמישה קילו"); a fraction is said in the
    // spoken feminine ("שתיים וחצי קילו") — the founder's condition was correct language, not slang.
    expect(loadLine(BENCH, 45, HE)).toBe('ארבעים וחמישה קילו: המוט עשרים קילו, ושתים עשרה וחצי קילו בכל צד — עשרה קילו ושתיים וחצי קילו');
    expect(loadLine(BENCH, 20, HE)).toBe('עשרים קילו: המוט בלבד');
  });
  it('dumbbells say "in each hand", a cable says where the pin goes, bodyweight says no weight', () => {
    expect(loadLine(DB, 12.5, HE)).toBe('שתים עשרה וחצי קילו בכל יד');
    expect(loadLine(CABLE, 40, HE)).toBe('ארבעים קילו: תשים את הפין על ארבעים');
    expect(loadLine(BENCH, null, HE)).toBe('בלי משקל');
  });
  it('the range is always a range, and never a lone number', () => {
    expect(rangeLine(8, 10, 40, HE)).toBe('שמונה עד עשר חזרות');
    expect(rangeLine(8, 10, null, HE)).toBe('שמונה עד עשר חזרות, בלי משקל');
  });
  it('a change is an instruction in the equipment\'s own terms', () => {
    expect(deltaLine(BENCH, 40, 42.5, HE)).toBe('תוסיף אחת ורבע קילו בכל צד');
    expect(deltaLine(BENCH, 40, 37.5, HE)).toBe('תוריד אחת ורבע קילו מכל צד');
    expect(deltaLine(DB, 12.5, 15, HE)).toBe('קח חמישה עשר קילו בכל יד');
    // A bare number (the pin's mark) is abstract counting — feminine, as in "תשים את הפין על ארבעים וחמש".
    expect(deltaLine(CABLE, 40, 45, HE)).toBe('תעביר את הפין לארבעים וחמש');
  });
  it('English keeps digits and the same shape', async () => {
    await setLocale('en');
    try {
      expect(loadLine(BENCH, 40, EN)).toBe('40 kilos: the bar is 20, plus 10 on each side');
      expect(loadLine(DB, 12.5, EN)).toBe('12.5 kilos in each hand');
      expect(rangeLine(8, 10, 40, EN)).toBe('8 to 10 reps');
      expect(voiceScript.askDone()).toBe('Finished the set? How many reps did you do?');
    } finally {
      await setLocale('he');
    }
  });
});

describe('⛔ the lines, word for word (spec §3)', () => {
  it('the loading dialogue, calibrated and first time, in the athlete\'s gender', () => {
    expect(voiceScript.loadCalibrated(BENCH, 40, 8, 10, HE)).toBe(
      'לחיצת חזה במוט. ארבעים קילו: המוט עשרים קילו, ועשרה קילו בכל צד. שמונה עד עשר חזרות. כשהמוט טעון, תגיד: מוכן. אם אתה רוצה משקל אחר, תגיד אותו.',
    );
    expect(voiceScript.loadFirstTime(BENCH, 40, 8, 10, HE)).toBe(
      'לחיצת חזה במוט. זו הפעם הראשונה שלך בתרגיל הזה, אז המשקל הוא הצעה: ארבעים קילו: המוט עשרים קילו, ועשרה קילו בכל צד. אם זה נראה לך קל מדי או כבד מדי, תגיד משקל אחר. שמונה עד עשר חזרות. כשהמוט טעון, תגיד: מוכן.',
    );
    setGender('female');
    expect(voiceScript.loadCalibrated(BENCH, 40, 8, 10, HE)).toContain('כשהמוט טעון, תגידי: מוכן. אם את רוצה משקל אחר, תגידי אותו.');
    expect(voiceScript.readyPrompt()).toBe('מוכנה?');
  });
  it('a changed load names the set, the direction, the new total and the plates to move', () => {
    expect(voiceScript.loadChanged(BENCH, 40, 42.5, 2, 4, false, HE)).toBe(
      'סט שתיים מתוך ארבע. עולים לארבעים ושתיים וחצי קילו: תוסיף אחת ורבע קילו בכל צד. כשהמוט טעון, תגיד: מוכן.',
    );
  });
  it('the calibration start, the go, the fallback', () => {
    expect(voiceScript.calibrationStart(BENCH, 30, HE)).toBe(
      'אין בעיה, נתחיל קל. שלושים קילו: המוט עשרים קילו, וחמישה קילו בכל צד. תעשה כמה חזרות שיוצא בנוח, ותגיד לי כמה. כשהמוט טעון, תגיד: מוכן.',
    );
    expect(voiceScript.go()).toBe('קדימה.');
    expect(voiceScript.readyFallback()).toBe('כשתהיה מוכן, תלחץ על מוכן בשעון או במסך הנעילה.');
  });
  it('the done question asks for a number; the echo says the figures and "נרשם"', () => {
    expect(voiceScript.askDone()).toBe('סיימת את הסט? כמה חזרות עשית?');
    expect(voiceScript.askDoneLast()).toBe('סיימת את הסט? זה הסט האחרון היום. כמה חזרות עשית?');
    expect(voiceScript.askReps()).toBe('כמה חזרות?');
    expect(voiceScript.echo(40, 10, HE)).toBe('ארבעים קילו, עשר חזרות. נרשם.');
    expect(voiceScript.echo(null, 10, HE)).toBe('עשר חזרות. נרשם.');
    expect(figuresLine(40, 8, HE)).toBe('ארבעים קילו, שמונה חזרות');
    // Two silences write NOTHING (founder, 2026-09-09): the set stays open, and she is told where "done" lives.
    expect(voiceScript.notHeard()).toBe('לא שמעתי תשובה. הסט נשאר פתוח: תגיד לי כמה חזרות כשתסיים, או תלחץ סיום במסך הנעילה או בשעון.');
    expect(voiceScript.confirmHeard(40, 12, HE)).toBe('ארבעים קילו, שתים עשרה חזרות, נכון?');
  });
  it('the verdict, the rest, the set start, the crossing and the end', () => {
    expect(voiceScript.verdictUp(BENCH, 40, 42.5, HE)).toBe('יותר מהטווח. בסט הבא נעלה לארבעים ושתיים וחצי קילו: תוסיף אחת ורבע קילו בכל צד.');
    expect(voiceScript.verdictDown(BENCH, 40, 37.5, HE)).toBe('פחות מהטווח. בסט הבא נוריד לשלושים ושבע וחצי קילו: תוריד אחת ורבע קילו מכל צד.');
    expect(voiceScript.verdictHold()).toBe('בתוך הטווח. הסט הבא באותו משקל.');
    expect(voiceScript.rest(90, HE)).toBe('מנוחה: דקה וחצי.');
    expect(voiceScript.tenSeconds()).toBe('עוד עשר שניות.');
    expect(voiceScript.setStart(BENCH, 40, 8, 10, 2, 4, false, HE)).toBe('סט שתיים מתוך ארבע. ארבעים קילו: המוט עשרים קילו, ועשרה קילו בכל צד. שמונה עד עשר חזרות.');
    expect(voiceScript.liftDone(BENCH, CABLE, 120, HE)).toBe('סיימת לחיצת חזה במוט. התרגיל הבא: חתירה בפולי בישיבה. מנוחה: שתי דקות.');
    expect(voiceScript.sessionDone(5, 42, HE)).toBe('סיימת את האימון. חמישה תרגילים, ארבעים ושתיים דקות. הסיכום מחכה בטלפון.');
    expect(voiceScript.nextTimeLearned(42.5, HE)).toBe('למדתי. בפעם הבאה נתחיל בארבעים ושתיים וחצי קילו.');
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
