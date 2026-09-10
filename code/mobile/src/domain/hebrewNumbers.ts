/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * NUMBERS AS WORDS, FOR A VOICE THAT READS THEM ALOUD.
 *
 * The voice coach (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md, §2 and §4) says every figure as
 * words: Apple's Hebrew voice reads "42.5" badly and "8-10" worse, and a load an athlete cannot
 * parse by ear is a load she will not put on the bar. Hebrew numbers agree with their noun in
 * gender — kilos are masculine ("שלושה קילו"), reps, minutes and seconds are feminine ("שלוש
 * חזרות", "שתי דקות") — and a fraction is said in the abstract feminine the way everyone says it
 * ("ארבעים ושתיים וחצי קילו"). English keeps digits: "42.5 kilos" is what an English voice reads
 * cleanly, and "eight to ten reps" is spelled out only where the range would otherwise be a dash.
 *
 * Pure. Covers 0–999 and the quarters (.25 / .5 / .75); anything else falls back to digits.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type NumberGender = 'm' | 'f';

const HE_M = ['אפס', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה', 'עשרה'];
const HE_F = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר'];
const HE_TEENS_M = ['', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר', 'חמישה עשר', 'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר'];
const HE_TEENS_F = ['', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה'];
const HE_TENS = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
const HE_HUNDREDS = ['', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות', 'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות'];

/** A whole number 0–999 in Hebrew, in the given gender. */
export function hebrewWhole(n: number, gender: NumberGender): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  const units = gender === 'm' ? HE_M : HE_F;
  const teens = gender === 'm' ? HE_TEENS_M : HE_TEENS_F;
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(HE_HUNDREDS[h]);
  if (rest === 0) {
    if (h === 0) parts.push(units[0]);
  } else if (rest <= 10) {
    parts.push(units[rest]);
  } else if (rest < 20) {
    parts.push(teens[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    parts.push(u === 0 ? HE_TENS[t] : `${HE_TENS[t]} ו${units[u]}`);
  }
  // "מאה ועשרים", "מאתיים ושלוש" — the hundred is joined to what follows with ו.
  if (h > 0 && rest > 0) return `${parts[0]} ו${parts.slice(1).join(' ')}`;
  return parts.join(' ');
}

/** The quarter words: a fraction is said the way it is said in a gym, never as a decimal. */
function hebrewFraction(frac: number): string | null {
  if (Math.abs(frac - 0.5) < 1e-9) return 'וחצי';
  if (Math.abs(frac - 0.25) < 1e-9) return 'ורבע';
  if (Math.abs(frac - 0.75) < 1e-9) return 'ושלושת רבעי';
  return null;
}

/**
 * Any figure the voice says, in Hebrew. A whole number keeps the noun's gender; a fraction is
 * said in the feminine ("ארבעים ושתיים וחצי"), which is the spoken norm. `0.5` alone is "חצי".
 */
export function hebrewNumber(n: number, gender: NumberGender): string {
  if (!Number.isFinite(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 1e-9) return hebrewWhole(whole, gender);
  const f = hebrewFraction(frac);
  if (f == null) return String(n); // a figure no gym says — digits, and the voice does its best
  if (whole === 0) return f.slice(1); // "חצי" / "רבע" / "שלושת רבעי"
  return `${hebrewWhole(whole, 'f')} ${f}`;
}

/** "ארבעים קילו" / "קילו אחד" / "שני קילו" / "שתיים וחצי קילו". */
export function hebrewKilos(kg: number): string {
  if (kg === 1) return 'קילו אחד';
  if (kg === 2) return 'שני קילו';
  return `${hebrewNumber(kg, 'm')} קילו`;
}

/** "שמונה חזרות" / "חזרה אחת" / "שתי חזרות". */
export function hebrewReps(reps: number): string {
  if (reps === 1) return 'חזרה אחת';
  if (reps === 2) return 'שתי חזרות';
  return `${hebrewWhole(reps, 'f')} חזרות`;
}

/** A rest, the way a coach says it: "דקה וחצי", "שתי דקות", "ארבעים וחמש שניות", "דקה ועשר שניות". */
export function hebrewDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 1 ? 'שנייה אחת' : s === 2 ? 'שתי שניות' : `${hebrewWhole(s, 'f')} שניות`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  const minutes = m === 1 ? 'דקה' : m === 2 ? 'שתי דקות' : `${hebrewWhole(m, 'f')} דקות`;
  if (r === 0) return minutes;
  if (r === 30) return m === 1 ? 'דקה וחצי' : `${minutes} וחצי`;
  if (r === 15) return m === 1 ? 'דקה ורבע' : `${minutes} ורבע`;
  if (r === 45) return m === 1 ? 'דקה ושלושת רבעי' : `${minutes} ושלושת רבעי`;
  return `${minutes} ו${hebrewDuration(r)}`;
}

/** English keeps digits for figures; only a duration is worded, because "90 s" reads as "ninety s". */
export function englishDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  const minutes = m === 1 ? 'a minute' : `${m} minutes`;
  if (r === 0) return minutes;
  if (r === 30) return m === 1 ? 'a minute and a half' : `${m} and a half minutes`;
  return `${minutes} and ${r} seconds`;
}

/** A figure for the voice in either language: words in Hebrew, digits in English. */
export function spokenNumber(n: number, gender: NumberGender, locale: string): string {
  if (locale.startsWith('he')) return hebrewNumber(n, gender);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
