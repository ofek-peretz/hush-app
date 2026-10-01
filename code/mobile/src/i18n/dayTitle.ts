/**
 * ════ THE ENGINE NAMES ITS DAYS IN ENGLISH, AND SHE READS THEM IN HER LANGUAGE (2026-09-28) ════
 *
 * The local week (`engine/v5/programAssembly.nameDays`) calls its days "Upper A", "Lower B",
 * "Full Body C". Those strings are not copy, they are KEYS: `fixtureModel.coreHostIndex` parses
 * them to seat the weekly core, `weekCadence.healWeekCompletion` matches a finished session to its
 * day by them, and ninety-odd suites pin them. So they stay English on disk, and this is where they
 * become words — at the moment something draws them, never before.
 *
 * Only the engine's own exact shape is translated. A name the model wrote, or she typed, is hers
 * and passes through untouched — "Upper body strength" is not the engine's and is not rewritten.
 */
import { tg } from './index';

const ENGINE_DAY = /^(Upper|Lower|Full Body) ([A-Z])$/;
const KEY = { Upper: 'upper', Lower: 'lower', 'Full Body': 'full' } as const;

/*
 * ⛔ A HEBREW NAME COUNTS ITS DAYS IN HEBREW LETTERS (design audit 2026-09-29; the founder's free
 * hand, 2026-09-30). "גוף מלא A" set a Latin capital at the end of a Hebrew serif title — the one
 * foreign glyph on the first screen of the app, and the voice already said it as "אלף". It is
 * "גוף מלא א׳" now, the way Hebrew numbers a series everywhere else (כיתה א׳, שלב ב׳).
 *
 * ⚠️ ONLY A LONE TRAILING LETTER, ONLY IN A HEBREW NAME. "Push A" and "Workout A" are English names
 * and pass untouched; "אימון רגליים" has no letter to convert. And because EVERY comparison of two
 * day names goes through here (`sameDayName`), a session an older build saved under "גוף מלא A" and
 * the same day drawn now as "גוף מלא א׳" are still one day — the rule is applied to both sides.
 */
const LATIN_TO_HEBREW: Record<string, string> = { A: 'א', B: 'ב', C: 'ג', D: 'ד', E: 'ה', F: 'ו', G: 'ז', H: 'ח' };
const HEBREW = /[\u0590-\u05FF]/;
function hebrewLetter(s: string): string {
  if (!HEBREW.test(s)) return s;
  return s.replace(/ ([A-H])$/, (_, l: string) => ` ${LATIN_TO_HEBREW[l]}\u05F3`);
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** A day's name as she reads it: the engine's English key in her language, anything else as is. */
export function dayTitle(name: string | null | undefined, t: Translate = tg as Translate): string {
  const raw = name ?? '';
  const m = ENGINE_DAY.exec(raw.trim());
  if (!m) return hebrewLetter(raw);
  const key = `builder.engineDay.${KEY[m[1] as keyof typeof KEY]}`;
  const said = t(key, { letter: m[2] });
  // A translator that is not up yet answers with nothing or the key itself; the name is better than either.
  return said && said !== key ? hebrewLetter(said) : raw;
}

/** True when two day names are the same day, whichever of them has already been drawn. */
export function sameDayName(a: string, b: string): boolean {
  return a === b || dayTitle(a) === dayTitle(b);
}
