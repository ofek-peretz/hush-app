/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE HEARS WHAT SHE MEANS, AND SAYS WHAT A PERSON CAN HEAR — the 2026-09-27 audit.
 *
 * Founder: *"תעבור בדיוק על כל המקרים שהאפליקציה מדברת ותוודא … שהשמע עובד גם מבחינת הקלט וגם
 * מבחינת הפלט."* Until that day the ear had never been in a build, so nothing here had ever met a
 * real sentence. These are the sentences a gym actually produces, and the lines the Hebrew voice
 * actually has to read.
 *
 * What this law holds:
 *   1. A denial is never read as the word it denies ("לא מוכן", "לא סיימתי", "עוד שתיים").
 *   2. A unit binds the number beside it — "8 חזרות 60 קילו" is sixty kilos, eight reps.
 *   3. The recognizer's spellings are read: "60 ק״ג", "60kg", "12,5", "שתים", "עשר ושמונה".
 *   4. A sentence that merely contains a number is not an answer — and the app's own lines are not.
 *   5. No Latin letter or digit reaches the Hebrew voice, and counts agree at one and two.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { parseVoiceAnswer } from '@/domain/voiceGrammar';
import { liftsPhrase, minutesPhrase, rangeLine, spokenDistance, spokenName, spokenRest, voiceScript } from '@/domain/voiceScript';
import { initI18n, setLocale } from '@/i18n';

const HE = { locale: 'he', units: 'kg' as const };
const figures = (s: string) => {
  const a = parseVoiceAnswer(s);
  return a?.kind === 'figures' ? a.numbers : a?.kind ?? null;
};

beforeAll(async () => {
  await initI18n();
  await setLocale('he');
});

describe('1 · a denial is a no', () => {
  it.each(['לא מוכן', 'עוד לא מוכן', 'לא סיימתי', 'עוד לא סיימתי', 'עוד שתיים', 'עוד 2', 'two more', 'not ready'])('"%s" → no', (s) => {
    expect(parseVoiceAnswer(s)?.kind).toBe('no');
  });
  it('"מאה אחוז" is an emphatic yes, never a hundred reps', () => {
    expect(parseVoiceAnswer('מאה אחוז')?.kind).toBe('yes');
  });
  it('…and the plain words still mean what they say', () => {
    expect(parseVoiceAnswer('מוכן.')?.kind).toBe('ready');
    expect(parseVoiceAnswer('סיימתי')?.kind).toBe('done');
    expect(parseVoiceAnswer('זהו')?.kind).toBe('done');
    expect(parseVoiceAnswer('כן כן')?.kind).toBe('yes');
    expect(parseVoiceAnswer('סבבה')?.kind).toBe('yes');
    expect(parseVoiceAnswer('קל מדי')?.kind).toBe('harder');
    expect(parseVoiceAnswer('כבד מדי')?.kind).toBe('easier');
  });
});

describe('2 · a unit binds the number beside it — load first, always', () => {
  it('reps said first are still the reps', () => {
    expect(figures('8 חזרות 60 קילו')).toEqual([60, 8]);
    expect(figures('12 חזרות עם 60')).toEqual([60, 12]);
  });
  it('the ordinary order is untouched', () => {
    expect(figures('ארבעים וחמש עשר')).toEqual([45, 10]);
    expect(figures('60 קילו 8 חזרות')).toEqual([60, 8]);
  });
});

describe('3 · the recognizer\'s own spellings', () => {
  it.each([
    ['60 ק״ג', [60]],
    ['60kg', [60]],
    ['12,5 קילו', [12.5]],
    ['עשרים ושתים', [22]],
    ['שמונה ועשר', [8, 10]],
    ['עשר בלחיצה ושמונה במשיכה', [10, 8]],
    ['שנים עשר וחצי', [12.5]],
    ['עשיתי עשר חזרות', [10]],
  ])('"%s" → %j', (s, n) => {
    expect(figures(s)).toEqual(n);
  });
  it.each([
    // The teens as a tired lifter says them — the unit and the ten in different genders (2026-09-27).
    ['אחד עשרה', [11]],
    ['חמש עשר', [15]],
    ['שלוש עשר חזרות', [13]],
    ['שתיים עשר', [12]],
    ['ארבעים וחמש קילו, אחד עשרה', [45, 11]],
  ])('"%s" → %j (a teen is ONE number, never "one kilo, ten reps")', (s, n) => {
    expect(figures(s)).toEqual(n);
  });
  it('⛔ she corrects herself mid-sentence: the number after the correction is the answer (2026-09-27)', () => {
    expect(figures('תשע, לא, עשר')).toEqual([10]);
    expect(figures('תשע לא עשר')).toEqual([10]);
    expect(figures('שמונה בעצם תשע')).toEqual([9]);
    expect(parseVoiceAnswer('תשע, לא, עשר')).toMatchObject({ correction: true });
    // …while "לא, עשר" (a correction of the echo) and "לא מוכן" (a denial) keep their meanings.
    expect(figures('לא, עשר')).toEqual([10]);
    expect(parseVoiceAnswer('לא מוכן')?.kind).toBe('no');
  });
  it('"שמונה או תשע" is not an answer — which one?', () => {
    expect(parseVoiceAnswer('שמונה או תשע')).toBeNull();
  });
  it('"60 ק״ג" is a LOAD — it was once read as sixty reps', () => {
    const a = parseVoiceAnswer('60 ק״ג');
    expect(a?.kind === 'figures' && a.saysKg).toBe(true);
  });
});

describe('4 · not every sentence with a number is an answer', () => {
  it('a sentence that merely contains one is dropped', () => {
    expect(parseVoiceAnswer('נפגשים בשמונה וחצי בערב אצל דני')).toBeNull();
  });
  it('the app\'s own rest line is not "2 reps"', () => {
    expect(parseVoiceAnswer('מנוחה: שתי דקות')).toBeNull();
    expect(parseVoiceAnswer('עוד עשר שניות.')).toBeNull();
  });
});

describe('5 · what the Hebrew voice is given to read', () => {
  it('no Latin letter and no digit in a Hebrew name', () => {
    expect(spokenName('עליון A', HE)).toBe('עליון אלף');
    // The day's letter is Hebrew on the screen now (`i18n/dayTitle`, 2026-09-30) — and said the same way.
    expect(spokenName('עליון א׳', HE)).toBe('עליון אלף');
    expect(spokenName('גוף מלא ג׳', HE)).toBe('גוף מלא גימל');
    expect(spokenName('כפיפת מרפקים במוט EZ', HE)).toBe('כפיפת מרפקים במוט איזי');
    expect(spokenName('כפיפות 21 (7·7·7)', HE)).toBe('כפיפות עשרים ואחת');
    // …while a name wholly in Latin is read as written, never half-translated.
    expect(spokenName('Upper A', HE)).toBe('Upper A');
  });
  it('counts agree at one and two', () => {
    expect(liftsPhrase(1, HE)).toBe('תרגיל אחד');
    expect(liftsPhrase(2, HE)).toBe('שני תרגילים');
    expect(liftsPhrase(6, HE)).toBe('שישה תרגילים');
    expect(minutesPhrase(1, HE)).toBe('דקה');
    expect(minutesPhrase(2, HE)).toBe('שתי דקות');
  });
  it('a rest is said to the quarter minute, never to the second', () => {
    expect(spokenRest(97, HE)).toBe('דקה וחצי');
    expect(spokenRest(105, HE)).toBe('דקה וארבעים וחמש שניות');
    expect(spokenRest(150, HE)).toBe('שתי דקות וחצי');
  });
  it('a distance is metres or kilometres — never "zero seconds"', () => {
    expect(spokenDistance(400, HE)).toBe('ארבע מאות מטר');
    expect(spokenDistance(1500, HE)).toBe('קילומטר וחצי');
    expect(spokenDistance(3000, HE)).toBe('שלושה קילומטר');
    expect(voiceScript.distanceItem('הליכת איכר', 40, HE)).toBe('הליכת איכר, ארבעים מטר.');
  });
  it('one written count is said as that count; a band lift is never "בלי משקל"', () => {
    expect(rangeLine(5, 5, 100, HE)).toBe('חמש חזרות');
    expect(rangeLine(8, 10, 100, HE)).toBe('שמונה עד עשר חזרות');
    expect(rangeLine(8, 10, null, HE)).toBe('שמונה עד עשר חזרות, בלי משקל');
  });
  it('a warm-up names the lift, the ramp step, the load, the COUNT — and asks for "מוכן"', () => {
    const line = voiceScript.warmupStart('bb_bench_press', 20, 8, 1, 2, HE);
    expect(line).toBe('לחיצת חזה במוט. חימום, אחת מתוך שתיים. עשרים קילו: המוט בלבד. שמונה חזרות. כשהמוט טעון, תגיד: מוכן.');
  });
});
