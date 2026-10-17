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
   * `perSide` (present only when true) when she named a side — "חמש עשרה בכל צד": the coach says a
   * bar by what goes on each side (2026-10-05), so that is how she answers it.
   */
  | { kind: 'figures'; numbers: number[]; saysKg: boolean; saysReps: boolean; correction: boolean; lb: boolean; perSide?: true };

export const MAX_VOICE_REPS = 100;
export const MAX_VOICE_KG = 400;

const HE_UNITS: Record<string, number> = {
  אפס: 0, אחת: 1, אחד: 1, שתיים: 2, שתים: 2, שניים: 2, שתי: 2, שני: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
  'אחת עשרה': 11, 'אחד עשר': 11, 'שתים עשרה': 12, 'שנים עשר': 12, 'שתיים עשרה': 12, 'שניים עשר': 12, 'שלוש עשרה': 13, 'שלושה עשר': 13,
  'ארבע עשרה': 14, 'ארבעה עשר': 14, 'חמש עשרה': 15, 'חמישה עשר': 15, 'שש עשרה': 16, 'שישה עשר': 16,
  'שבע עשרה': 17, 'שבעה עשר': 17, 'שמונה עשרה': 18, 'שמונה עשר': 18, 'תשע עשרה': 19, 'תשעה עשר': 19,
  עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
  מאה: 100, מאתיים: 200, 'שלוש מאות': 300,
};
/*
 * ⛔ THE TEENS AS PEOPLE SAY THEM, NOT AS GRAMMAR BOOKS DO (2026-09-27, the voice walk). "אחד עשרה",
 * "חמש עשר", "שלוש עשר" — the unit and the ten in different genders — are how a tired lifter says
 * eleven, fifteen, thirteen; read word by word they were ONE and TEN, "one kilo, ten reps".
 */
const TEEN_UNITS: [string, string, number][] = [
  ['אחד', 'אחת', 1], ['שניים', 'שתיים', 2], ['שלושה', 'שלוש', 3], ['ארבעה', 'ארבע', 4], ['חמישה', 'חמש', 5],
  ['שישה', 'שש', 6], ['שבעה', 'שבע', 7], ['שמונה', 'שמונה', 8], ['תשעה', 'תשע', 9],
];
for (const [m, f, u] of TEEN_UNITS) {
  for (const unit of [m, f, u === 2 ? 'שנים' : m, u === 2 ? 'שתים' : f]) {
    for (const ten of ['עשר', 'עשרה']) {
      const k = `${unit} ${ten}`;
      if (HE_UNITS[k] == null) HE_UNITS[k] = 10 + u;
    }
  }
}
const EN_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

export function normaliseUtterance(text: string): string {
  return text
    .toLowerCase()
    // Niqqud and cantillation (the recognizer rarely adds them; a pasted line may).
    .replace(/[֑-ׇ]/g, (c) => (c === '־' ? ' ' : '')) // the maqaf (U+05BE) is a hyphen
    // "ק״ג" / "ק"ג" / "קג" — one unit word, before the quote marks are turned into spaces (2026-09-27:
    // "60 ק״ג" was read as sixty REPS, because the gershayim split it into "ק ג").
    .replace(/ק\s*["״׳']\s*ג/g, 'קג')
    // "12,5" is a decimal, not two numbers.
    .replace(/(\d),(\d)/g, '$1.$2')
    // "60kg", "8חזרות", "ב8" — a digit glued to a word is two tokens.
    .replace(/(\d)(?=[^\d\s.,])/g, '$1 ')
    .replace(/([^\d\s.,\-])(?=\d)/g, (m, c: string) => (/[בלוה]/.test(c) ? `${c} ` : `${c} `))
    .replace(/%/g, ' אחוז ')
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
  return taggedNumbersIn(text).map((t) => t.n);
}

/** A number and the unit word said right after it, if any ("שמונה חזרות", "60 קילו"). */
export interface TaggedNumber {
  n: number;
  unit: 'kg' | 'reps' | null;
}

const UNIT_KG = /^(קילו|קג|kg|kilos?|kilograms?|pounds?|lbs?|פאונד)$/;
const UNIT_REPS = /^(חזרות|חזרה|reps?|repetitions?)$/;

/** The same numbers, each with the unit that followed it — so "8 חזרות 60 קילו" is reps, then load. */
export function taggedNumbersIn(text: string): TaggedNumber[] {
  const s = normaliseUtterance(text);
  const out: TaggedNumber[] = [];
  const tokens = s.split(' ');
  /** A standalone number word, also behind a joining ו ("ושמונה" in "עשר ושמונה" is a SECOND number). */
  const word = (t: string): number | undefined => HE_UNITS[t] ?? (t.length > 1 && t.startsWith('ו') ? HE_UNITS[t.slice(1)] : undefined);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const two = `${tok} ${tokens[i + 1] ?? ''}`.trim();
    const twoBare = two.startsWith('ו') ? two.slice(1) : two;
    let n: number | null = null;
    if (/^\d+(\.\d+)?$/.test(tok)) n = Number(tok);
    else if (HE_UNITS[two] != null) { n = HE_UNITS[two]; i += 1; }
    else if (tok.startsWith('ו') && HE_UNITS[twoBare] != null && twoBare.includes(' ')) { n = HE_UNITS[twoBare]; i += 1; }
    else if (word(tok) != null) n = word(tok)!;
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
    const after = tokens[i + 1] ?? '';
    out.push({ n, unit: UNIT_KG.test(after) ? 'kg' : UNIT_REPS.test(after) ? 'reps' : null });
  }
  return out;
}

/**
 * Every word the grammar knows, for the one check that a sentence with numbers in it is an ANSWER
 * and not a sentence that happens to contain one ("נפגשים בשמונה וחצי", a lyric, a friend).
 */
const KNOWN = new Set<string>([
  ...Object.keys(HE_UNITS).flatMap((k) => k.split(' ')),
  ...Object.keys(EN_UNITS),
  'וחצי', 'ורבע', 'ושלושת', 'רבעי', 'חצי', 'רבע', 'נקודה', 'point', 'and', 'a', 'half', 'quarter', 'quarters',
  'קילו', 'קג', 'kg', 'kilo', 'kilos', 'kilograms', 'pound', 'pounds', 'lb', 'lbs', 'פאונד', 'חזרות', 'חזרה', 'rep', 'reps',
  'עשיתי', 'עשינו', 'הרמתי', 'עם', 'על', 'אני', 'זה', 'רק', 'בערך', 'כן', 'לא', 'תקן', 'תקני', 'תיקון', 'סיימתי', 'גמרתי',
  'i', 'did', 'made', 'with', 'at', 'of', 'just', 'about', 'yes', 'no', 'correction', 'actually', 'done', 'ו', 'ב', 'ה', 'ל',
  // "…בכל צד" / "…a side" — how the coach names a bar's load, and so how she names it back.
  'כל', 'מכל', 'צד', 'per', 'each', 'side', 'on',
]);
/** Words outside the grammar, a label like "בלחיצה" (ב + a lift) excepted — the spec's superset answer. */
function strangers(s: string): number {
  let n = 0;
  for (const t of s.split(' ')) {
    if (!t || /^\d/.test(t) || KNOWN.has(t)) continue;
    const bare = /^[ובהל]/.test(t) ? t.slice(1) : t;
    if (KNOWN.has(bare)) continue;
    if (t.startsWith('ב') && t.length >= 4) continue; // "בלחיצה", "במשיכה"
    n += 1;
  }
  return n;
}

/** Words she corrects herself with mid-sentence: "תשע, לא, עשר", "שמונה… בעצם תשע". */
const SELF_FIX = new Set(['לא', 'בעצם', 'סליחה', 'כלומר', 'רגע', 'no', 'actually', 'sorry']);

/** Is this token a number (digits, or a number word, also behind a joining ו)? */
function isNumberToken(t: string): boolean {
  if (/^\d/.test(t)) return true;
  if (HE_UNITS[t] != null || EN_UNITS[t] != null) return true;
  return t.length > 1 && t.startsWith('ו') && HE_UNITS[t.slice(1)] != null;
}

/**
 * ⛔ SHE CORRECTED HERSELF, AND HER LAST WORD IS THE ANSWER (2026-09-27, the voice walk). "תשע, לא,
 * עשר" was read as TWO numbers — nine kilos, ten reps. When a correction word follows a number, only
 * what comes after the last such word is kept.
 */
function afterSelfCorrection(s: string): string {
  const tokens = s.split(' ');
  let sawNumber = false;
  let cut = -1;
  tokens.forEach((t, i) => {
    if (isNumberToken(t)) sawNumber = true;
    else if (sawNumber && SELF_FIX.has(t) && tokens.slice(i + 1).some(isNumberToken)) cut = i;
  });
  return cut < 0 ? s : tokens.slice(cut + 1).join(' ');
}

const RE = {
  finish: /(סיים אימון|סיימי אימון|סיים את האימון|סיימי את האימון|סיום אימון|לסיים את האימון|מספיק להיום|end (the )?workout|finish (the )?workout|done for today)/,
  pause: /(^|\s)(עצור|עצרי|עצירה|השהה|השהי|הפסקה|pause|stop)(\s|$)/,
  resume: /(^|\s)(המשך|להמשיך|המשיכי|תמשיך|תמשיכי|continue|resume|go on)(\s|$)/,
  ready: /(^|\s)(מוכן|מוכנה|מוכנים|מאשר|מאשרת|יאללה|יאלה|יללה|ready|go|start)(\s|$)/,
  /** Every word of the sentence a yes ("כן כן", "סבבה", "אוקיי") — a yes inside a longer sentence is not one. */
  yes: /^((כן|yes|yep|yeah|בסדר|סבבה|בטח|אוקיי|אוקי|ok|okay|נכון|right|correct)\s?)+$/,
  /** "מאה אחוז" is an emphatic yes, never a hundred reps (2026-09-27). */
  hundredPercent: /(^|\s)(מאה|100) אחוז/,
  no: /(^|\s)(לא|עוד לא|עוד רגע|עוד קצת|רגע|שנייה|עוד שנייה|חכה|חכי|עדיין|not yet|no|nope|wait|hold on)(\s|$)/,
  /*
   * ⛔ A NEGATED READY IS A NO (2026-09-27, the input audit). "לא מוכן", "עוד לא סיימתי", "not ready"
   * were read as the very word they deny — the set started, or the reps were asked mid-set.
   */
  negated: /(^|\s)(לא|עוד לא|עדיין לא|not|not yet)\s+(מוכן|מוכנה|מוכנים|ready|סיימתי|גמרתי|done|finished)(\s|$)/,
  /** "עוד שתיים", "עוד 2", "two more" — still lifting, never a two-rep set. */
  more: /((^|\s)עוד\s+(\d+|אחת|אחד|שתיים|שתים|שתי|שלוש|ארבע|חמש|כמה|קצת|רגע)(\s|$))|((^|\s)(one|two|three|four|five|a few|\d+) more(\s|$))/,
  done: /(^|\s)(סיימתי|סיימנו|גמרתי|גמרנו|זהו|done|finished)(\s|$)/,
  asWritten: /(כמו שכתוב|כמו שרשום|כמו שכתבת|as written|as planned|as prescribed)/,
  // "כבד מדי" asks for LESS weight and "קל מדי" for more — the words the first-time line invites.
  easier: /(קל יותר|יותר קל|קליל יותר|פחות משקל|כבד מדי|easier|lighter|less weight|too heavy)/,
  harder: /(כבד יותר|יותר כבד|יותר משקל|קל מדי|heavier|harder|more weight|too light|too easy)/,
  dontKnow: /(לא יודע|לא יודעת|אין לי מושג|don'?t know|no idea|not sure)/,
  skip: /(^|\s)(דלג|דלגי|תדלג|תדלגי|תפוס|תפוסה|skip|busy|taken|occupied)(\s|$)/,
  correction: /^(לא|תקן|תקני|תיקון|no|correct|correction|actually)(\s|,)/,
  repsWord: /(חזרות|חזרה|reps?|repetitions?)/,
  weightWord: /(קילו|ק"ג|קג|kg|kilo|kilos|kilograms?|pounds?|lbs?|משקל|weight)/,
  lb: /(pounds?|lbs?)/,
  /** "בכל צד", "לכל צד", "מכל צד", "בצד" / "a side", "per side", "each side". */
  perSide: /(^|\s)((ב|ל|מ)?כל צד|בצד|לצד|(a|per|each) side)(\s|$)/,
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
  // The denials come before anything they could be mistaken for (2026-09-27).
  if (RE.negated.test(s) || RE.more.test(s)) return { kind: 'no' };
  if (RE.hundredPercent.test(s)) return { kind: 'yes' };
  // "שמונה או תשע" is not an answer — which one? The question is asked again (2026-09-27).
  if (/(^|\s)(או|or)(\s|$)/.test(s) && numbersIn(s).length >= 2) return null;
  const said = s;
  const kept = afterSelfCorrection(s);
  const corrected = kept !== said;
  const tagged = taggedNumbersIn(kept);
  const saysKg = RE.weightWord.test(s);
  const saysReps = RE.repsWord.test(s);
  if (tagged.length > 0) {
    // A sentence that merely CONTAINS a number is not an answer: more than one word outside the
    // grammar and it is dropped, like every other sentence the grammar does not know (spec §0.4).
    if (strangers(s) > 1) return null;
    let pair = tagged.slice(0, 2);
    // "8 חזרות 60 קילו", "12 חזרות עם 60": each unit binds the number before it — load first, always.
    if (pair.length === 2 && (pair[0].unit === 'reps' || pair[1].unit === 'kg') && pair[0].unit !== 'kg') pair = [pair[1], pair[0]];
    const numbers = pair.map((t) => t.n);
    const sane = numbers.every((n) => Number.isFinite(n) && n >= 0 && n <= MAX_VOICE_KG);
    if (!sane) return null;
    return {
      kind: 'figures',
      numbers,
      saysKg: corrected ? RE.weightWord.test(kept) : saysKg,
      saysReps: corrected ? RE.repsWord.test(kept) : saysReps,
      correction: corrected || RE.correction.test(s),
      lb: RE.lb.test(kept),
      ...(RE.perSide.test(kept) ? { perSide: true as const } : {}),
    };
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
  'מוכן', 'מוכנה', 'מאשר', 'יאללה', 'כן', 'לא', 'זהו', 'סיימתי', 'כמו שכתוב', 'עוד רגע', 'עוד לא', 'קל יותר', 'כבד יותר', 'לא יודע',
  'דלג', 'תפוס', 'עצור', 'המשך', 'תקן', 'קילו', 'חזרות', 'וחצי', 'ורבע',
  // The numbers an answer is made of — the recognizer hears "שמונה" over a dropped plate more often when told to.
  'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר', 'אחת עשרה', 'שתים עשרה', 'חמש עשרה', 'עשרים',
  'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים', 'מאה',
  'ready', 'yes', 'no', 'done', 'as written', 'not yet', 'easier', 'heavier', 'skip', 'busy', 'pause', 'continue', 'correct', 'kilos', 'reps',
];
