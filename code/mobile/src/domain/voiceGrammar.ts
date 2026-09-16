/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CLOSED GRAMMAR — what the athlete may say, and nothing else.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §0.4 and §4: *"הדקדוק סגור. אין מודל שפה; מה שאינו
 * באוצר המילים נזרק."* The voice coach asks questions whose answers it already knows the shape of —
 * a word of readiness, a number, a refusal, a verb the stage has — so every sentence is matched
 * against a fixed vocabulary in Hebrew and English and anything outside it returns `null`. That
 * null is a feature: in a gym a microphone hears plates, friends and the radio, and a grammar that
 * guessed would turn all three into sets.
 *
 * What a number MEANS is not decided here. "עשר" is reps after "how many reps?" and a load in the
 * loading dialogue; the conductor knows which question is open, so this file only reports the
 * numbers it heard, in the order it heard them, and whether a unit word came with them (§3.4: two
 * numbers are always load then reps).
 *
 * Pure. The number reading is the one that survived from the first ear (2026-09-08 morning).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type VoiceAnswer =
  /** "מוכן" / "מאשר" / "יאללה" / "ready" — the loading dialogue's start signal. */
  | { kind: 'ready' }
  /** A bare "כן" / "yes" — means "ready" in the loading dialogue and "confirmed" on a check. */
  | { kind: 'yes' }
  /** "לא" / "עוד רגע" / "not yet" — on the done question: still lifting; on a check: wrong. */
  | { kind: 'no' }
  /** "סיימתי" / "done" — the set is over (the reps still have to be asked). */
  | { kind: 'done' }
  /** "כמו שכתוב" / "as written" — the floor of the band, as prescribed. */
  | { kind: 'as_written' }
  | { kind: 'easier' }
  | { kind: 'harder' }
  | { kind: 'dont_know' }
  /** "דלג" / "תפוס" — the lift is deferred (the board's busy move). */
  | { kind: 'skip' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'finish' }
  /**
   * The numbers heard, in order. `correction` when the sentence opened with "לא," / "תקן" — the
   * echo's three-second tail. `saysKg` / `saysReps` when a unit word disambiguates a lone number.
   */
  | { kind: 'figures'; numbers: number[]; saysKg: boolean; saysReps: boolean; correction: boolean; lb: boolean };

export const MAX_VOICE_REPS = 100;
export const MAX_VOICE_KG = 400;

const HE_UNITS: Record<string, number> = {
  אפס: 0, אחת: 1, אחד: 1, שתיים: 2, שניים: 2, שתי: 2, שני: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
  'אחת עשרה': 11, 'אחד עשר': 11, 'שתים עשרה': 12, 'שנים עשר': 12, 'שתיים עשרה': 12, 'שניים עשר': 12, 'שלוש עשרה': 13, 'שלושה עשר': 13,
  'ארבע עשרה': 14, 'ארבעה עשר': 14, 'חמש עשרה': 15, 'חמישה עשר': 15, 'שש עשרה': 16, 'שישה עשר': 16,
  'שבע עשרה': 17, 'שבעה עשר': 17, 'שמונה עשרה': 18, 'שמונה עשר': 18, 'תשע עשרה': 19, 'תשעה עשר': 19,
  עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
  מאה: 100, מאתיים: 200, 'שלוש מאות': 300,
};
const EN_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

export function normaliseUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[،,;:!?"'׳״()\-–—]/g, ' ')
    .replace(/(\d)\.(\d)/g, '$1<dot>$2')
    .replace(/\./g, ' ')
    .replace(/<dot>/g, '.')
    .replace(/(^|\s)(ב|ל|ו|ה)-(?=\d)/g, '$1$2 ') // no `\b` — Hebrew letters are not `\w`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every number in the sentence, in order — Hebrew words ("ארבעים וחמש", "שתים עשרה וחצי"), English
 * words, or digits ("42.5"). A hundred followed by a smaller number is joined ("מאה ועשרים").
 */
export function numbersIn(text: string): number[] {
  const s = normaliseUtterance(text);
  const out: number[] = [];
  const tokens = s.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const two = `${tok} ${tokens[i + 1] ?? ''}`.trim();
    let n: number | null = null;
    if (/^\d+(\.\d+)?$/.test(tok)) n = Number(tok);
    else if (HE_UNITS[two] != null) { n = HE_UNITS[two]; i += 1; }
    else if (HE_UNITS[tok] != null) n = HE_UNITS[tok];
    else if (EN_UNITS[tok] != null) n = EN_UNITS[tok];
    if (n == null) continue;
    // "מאה ועשרים", "one hundred twenty". A Hebrew compound ALWAYS carries the ו: "מאה שמונה" is
    // two numbers (a hundred, then eight), never a hundred and eight.
    if (n >= 100 && n % 100 === 0) {
      const nxt = tokens[i + 1] ?? '';
      const heJoined = nxt.startsWith('ו') ? HE_UNITS[nxt.slice(1)] : undefined;
      const enJoined = EN_UNITS[nxt.replace(/^and$/, '')];
      const tens = heJoined ?? enJoined;
      if (tens != null && tens < 100) { n += tens; i += 1; }
    }
    // "ארבעים וחמש", "forty five" — and "שישים, שמונה" stays sixty THEN eight (60 kg, 8 reps).
    const nxt = tokens[i + 1] ?? '';
    const unit = nxt.startsWith('ו') ? HE_UNITS[nxt.slice(1)] : EN_UNITS[nxt];
    if (n >= 20 && n % 10 === 0 && unit != null && unit < 10) { n += unit; i += 1; }
    // "וחצי" / "ורבע" / "ושלושת רבעי" / "and a half" / "point five"
    const rest = tokens.slice(i + 1, i + 4).join(' ');
    if (/^(וחצי|and a half|point five|נקודה חמש)/.test(rest)) {
      n += 0.5;
      i += rest.startsWith('and a half') ? 3 : rest.startsWith('point five') || rest.startsWith('נקודה חמש') ? 2 : 1;
    } else if (/^(ורבע|and a quarter)/.test(rest)) {
      n += 0.25;
      i += rest.startsWith('and a quarter') ? 3 : 1;
    } else if (/^(ושלושת רבעי|and three quarters)/.test(rest)) {
      n += 0.75;
      i += rest.startsWith('and three quarters') ? 3 : 2;
    }
    out.push(n);
  }
  return out;
}

const RE = {
  finish: /(סיים אימון|סיימי אימון|לסיים את האימון|מספיק להיום|end (the )?workout|finish (the )?workout|done for today)/,
  pause: /(^|\s)(עצור|עצרי|עצירה|השהה|השהי|הפסקה|pause|stop)(\s|$)/,
  resume: /(^|\s)(המשך|המשיכי|תמשיך|תמשיכי|continue|resume|go on)(\s|$)/,
  ready: /(^|\s)(מוכן|מוכנה|מאשר|מאשרת|יאללה|ready|go|start)(\s|$)/,
  yes: /^(כן|yes|yep|yeah|בסדר|אוקיי|ok|okay|נכון|right|correct)$/,
  no: /(^|\s)(לא|עוד לא|עוד רגע|עוד קצת|רגע|not yet|no|nope|wait|hold on)(\s|$)/,
  done: /(^|\s)(סיימתי|סיימנו|גמרתי|done|finished)(\s|$)/,
  asWritten: /(כמו שכתוב|כמו שרשום|כמו שכתבת|as written|as planned|as prescribed)/,
  easier: /(קל יותר|יותר קל|קליל יותר|פחות משקל|easier|lighter|less weight)/,
  harder: /(כבד יותר|יותר כבד|יותר משקל|heavier|harder|more weight)/,
  dontKnow: /(לא יודע|לא יודעת|אין לי מושג|don'?t know|no idea|not sure)/,
  skip: /(^|\s)(דלג|דלגי|תדלג|תדלגי|תפוס|תפוסה|skip|busy|taken|occupied)(\s|$)/,
  correction: /^(לא|תקן|תקני|תיקון|no|correct|correction|actually)(\s|,)/,
  repsWord: /(חזרות|חזרה|reps?|repetitions?)/,
  weightWord: /(קילו|ק"ג|קג|kg|kilo|kilos|kilograms?|pounds?|lbs?|משקל|weight)/,
  lb: /(pounds?|lbs?)/,
};

/**
 * One sentence → one answer, or null. The order of the checks is the order of the spec's tables:
 * a session verb first (finish/pause/resume), then the words that mean something whole, then the
 * numbers. A sentence that opens with "לא," and carries numbers is a CORRECTION, not a refusal.
 */
export function parseVoiceAnswer(text: string): VoiceAnswer | null {
  const s = normaliseUtterance(text);
  if (!s) return null;
  if (RE.finish.test(s)) return { kind: 'finish' };
  if (RE.pause.test(s)) return { kind: 'pause' };
  if (RE.resume.test(s)) return { kind: 'resume' };
  const nums = numbersIn(s);
  const saysKg = RE.weightWord.test(s);
  const saysReps = RE.repsWord.test(s);
  if (nums.length > 0) {
    const numbers = nums.slice(0, 2);
    const sane = numbers.every((n) => Number.isFinite(n) && n >= 0 && n <= MAX_VOICE_KG);
    if (!sane) return null;
    return { kind: 'figures', numbers, saysKg, saysReps, correction: RE.correction.test(s), lb: RE.lb.test(s) };
  }
  if (RE.asWritten.test(s)) return { kind: 'as_written' };
  if (RE.dontKnow.test(s)) return { kind: 'dont_know' };
  if (RE.easier.test(s)) return { kind: 'easier' };
  if (RE.harder.test(s)) return { kind: 'harder' };
  if (RE.skip.test(s)) return { kind: 'skip' };
  if (RE.done.test(s)) return { kind: 'done' };
  if (RE.ready.test(s)) return { kind: 'ready' };
  if (RE.yes.test(s)) return { kind: 'yes' };
  if (RE.no.test(s)) return { kind: 'no' };
  return null;
}

/** Pounds → kilos, to the quarter kilo, when the athlete said "pounds". */
export function toKg(n: number, lb: boolean): number {
  return lb ? Math.round((n / 2.20462) * 4) / 4 : n;
}

/**
 * The words the recognizer should expect — handed to it as contextual strings so "מוכן" wins over
 * a dropped plate. One list for both languages; the recognizer ignores what its locale cannot say.
 */
export const VOICE_HINTS: readonly string[] = [
  'מוכן', 'מאשר', 'יאללה', 'סיימתי', 'כמו שכתוב', 'עוד רגע', 'עוד לא', 'קל יותר', 'כבד יותר', 'לא יודע', 'דלג', 'תפוס',
  'עצור', 'המשך', 'תקן', 'קילו', 'חזרות', 'וחצי', 'ורבע',
  'ready', 'done', 'as written', 'not yet', 'easier', 'heavier', 'skip', 'busy', 'pause', 'continue', 'correct', 'kilos', 'reps',
];
