/**
 * Copy-law linter — enforces the Hush voice laws against the locale source
 * (spec §5.1, §8.9; UX Laws 5/7). Run in CI: `npm run lint:copy`.
 *
 * This is HOW the product guarantees "no hedge, no exclamation, first-person
 * indicative, no 'Accept'" globally: the laws are checked at the copy source,
 * not screen by screen. Any new string that breaks a law fails the build.
 */
'use strict';
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const en = JSON.parse(
  readFileSync(join(__dirname, '../src/i18n/locales/en.json'), 'utf8'),
);
const he = JSON.parse(readFileSync(join(__dirname, '../src/i18n/locales/he.json'), 'utf8'));

// The single sanctioned error line may contain "Try" (spec §5.1 error copy).
const SANCTIONED_HEDGE_KEYS = new Set(['errors.general']);
// "Recommended" is a spec-defined Replacement section header (UX §1.1), NOT Hush
// labeling a decision in observer voice — the §5.1 R2 ban is on the latter.
const SANCTIONED_LABEL_KEYS = new Set(['replacement.sectionRecommended']);

/**
 * THE BRAND NAME IS NOT A SUBJECT (founder 2026-07-12). "Hush moved your load up" is the
 * product talking ABOUT itself while standing in front of the athlete — two voices in one
 * app, and the third-person one is the marketing one. Hush speaks as "I", always.
 *
 * The name survives exactly where it IS a name: the wordmark, the version string, and the
 * product "Hush Pro". Everywhere else, a mention of "Hush" fails the build.
 */
const THIRD_PERSON = /\bHush\b/;
const SANCTIONED_NAME_KEYS = new Set([
  'profile.version',
  'profile.proName',
  'profile.membershipPro',
  'paywall.title',
  'paywall.body', // "Hush Pro keeps me deciding your loads" — the product, then the voice
]);

const HEDGE = /\b(try|tries|trying|maybe|perhaps|should|might|could|would)\b/i;
const CONDITIONAL = /\b(i'd|you'd|we'd|i would|you could|recommended|suggested|suggest)\b/i;
const FORBIDDEN_ACCEPT = /\baccept\b/i;
const EXCLAMATION = /!/;
// Emoji / pictographs (× · — ✓ are typographic, not emoji, and are allowed).
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F0FF}\u{1F900}-\u{1F9FF}]/u;

const out = [];

function walk(node, path) {
  if (typeof node === 'string') {
    const leaf = path.split('.').pop() || '';
    if (leaf.startsWith('_comment')) return; // authoring notes
    const v = node;
    const push = (rule) => out.push({ key: path, value: v, rule });

    if (EXCLAMATION.test(v)) push('no exclamation marks (§5.1 R4)');
    if (EMOJI.test(v)) push('no emoji (§5.1 R4)');
    if (FORBIDDEN_ACCEPT.test(v)) push('the word "Accept" never appears (§5.1 R3)');
    if (!SANCTIONED_LABEL_KEYS.has(path) && CONDITIONAL.test(v)) {
      push('indicative mood only — no conditional / "Recommended" (§5.1 R2)');
    }
    if (!SANCTIONED_HEDGE_KEYS.has(path) && HEDGE.test(v)) {
      push('no hedge words: try/maybe/should/might/could/would (§5.3 R12, UX Law 5)');
    }
    if (!SANCTIONED_NAME_KEYS.has(path) && THIRD_PERSON.test(v)) {
      push('first person only — Hush says "I", never "Hush" (founder 2026-07-12)');
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, child] of Object.entries(node)) {
      walk(child, path ? `${path}.${k}` : k);
    }
  }
}

walk(en, '');

/**
 * ════ AND THE OTHER HALF OF THE PRODUCT ════
 *
 * HEBREW (added 2026-07-12; the file learned to OPEN he.json on 2026-08-18). For a year this
 * script read `en.json` and nothing else, which is the single reason every fault below survived
 * CI: an inverted `muscle` block, ten base keys authored in the FEMININE so a man read a woman's
 * copy, twelve `{{count}}` keys with no plural forms rendering "1 שינויים", and a `detrain` block
 * sitting at the top level while the engine asked for `explain.detrain`. Hebrew is the founder's
 * language and the primary market; it is not a translation of the product, it IS the product.
 *
 * Most voice laws are authored in English prose and cannot be regex-checked in Hebrew. These five
 * can, and each one is a bug that shipped:
 *
 *  1. The third-person "Hush" (the founder's ruling) — same rule, same list of sanctioned names.
 *  2. KEY PARITY, both directions. A key in en and not in he renders as the raw dotted key on a
 *     Hebrew phone ("ob.readyBody"); a key in he and not in en is copy nothing can reach.
 *  3. PLURAL COMPLETENESS. A sentence that counts must carry every form its language selects.
 *  4. `_female` SYMMETRY — a warning, on a ratchet (see FEMALE_RATCHET).
 *  5. INTERPOLATION EQUALITY. Two locales of one key are rendered by ONE call site with ONE set
 *     of params, so a variable in one and not the other is a hole on somebody's screen.
 */

const flatten = (node, path, into) => {
  if (typeof node === 'string') {
    into.set(path, node);
    return into;
  }
  if (node && typeof node === 'object') {
    for (const [k, child] of Object.entries(node)) flatten(child, path ? `${path}.${k}` : k, into);
  }
  return into;
};

const enFlat = flatten(en, '', new Map());
const heFlat = flatten(he, '', new Map());

for (const [key, value] of heFlat) {
  if (!SANCTIONED_NAME_KEYS.has(key) && THIRD_PERSON.test(value)) {
    out.push({ key: `he:${key}`, value, rule: 'first person only — Hush says "I", never "Hush" (founder 2026-07-12)' });
  }
}

/* ─────────────────────────── 2 · KEY PARITY ─────────────────────────── */
/**
 * Every leaf in one locale exists in the other, EXCEPT the four documented exemptions:
 *
 *  - `_female` — the gendered forms Hebrew needs and English does not. It may carry a PLURAL
 *    category behind it (`weekly.intro_female_one`): Hebrew conjugates a sentence that counts
 *    things, so gender and number arrive together, and i18next resolves `key_context_plural` in
 *    that order. The rule used to anchor `_female` at the END, which let `_female_two` through by
 *    accident (it ends `_two`) while `_female_one` and `_female_other` read as orphans — the same
 *    sentence, in the same locale, split across two verdicts.
 *  - `_two` — Hebrew's DUAL plural category. i18next resolves it; English has no such form.
 *  - `cues.*` — the Hebrew technique-cue library (ratified 2026-07-06). English cues are canonical
 *    in `src/data/exercises.ts`, not in the locale, so there is nothing here to be missing.
 *  - `_comment*` — authoring notes, not copy, in either locale.
 */
const PLURAL_CATEGORY = '(_zero|_one|_two|_few|_many|_other)?';
const HE_ONLY = new RegExp(`(^cues\\.)|(_female${PLURAL_CATEGORY}$)|(_two$)|(_many$)|(\\._comment)`);
const EN_ONLY = /(\._comment)/;

for (const key of enFlat.keys()) {
  if (EN_ONLY.test(key) || key.startsWith('_comment')) continue;
  if (!heFlat.has(key)) {
    out.push({ key: `he:${key}`, value: '(missing)', rule: 'no Hebrew translation — the athlete would see the raw key' });
  }
}
for (const key of heFlat.keys()) {
  if (key.startsWith('_comment')) continue;
  if (!enFlat.has(key) && !HE_ONLY.test(key)) {
    out.push({ key: `he:${key}`, value: heFlat.get(key), rule: 'orphan Hebrew key — nothing in en.json to translate' });
  }
}

/* ────────────────────── 3 · PLURAL COMPLETENESS ────────────────────── */
/**
 * A key that interpolates `{{count}}` is a key i18next PLURALISES. Written flat, i18next looks for
 * `key_one` / `key_other`, finds neither, and falls back to the bare key — which is how a Hebrew
 * phone printed "1 שינויים" ("1 changes") in the most-read screen in the product.
 *
 * The categories are not a hand-kept list; they are what the language actually selects. English
 * needs `one`/`other`. Hebrew has a DUAL and needs `one`/`two`/`other` — the form that spells
 * "יומיים", "שבועיים", "פעמיים" instead of saying "2 days".
 *
 * And a set present in one language must be present in the other: a key pluralised in en and flat
 * in he resolves inconsistently, one screen at a time.
 */
const CATEGORY = /_(zero|one|two|few|many|other)$/;
const REQUIRED = { en: ['one', 'other'], he: ['one', 'two', 'other'] };
/** `weekly.introTop_one` → `weekly.introTop`; `weekly.intro_female_one` → `weekly.intro_female`. */
const stemOf = (key) => key.replace(CATEGORY, '');
/** The same stem with the Hebrew-only gender context removed, for comparing across locales. */
const sharedStemOf = (key) => stemOf(key).replace(/_female$/, '');

const setsIn = (flat) => {
  const sets = new Map();
  for (const key of flat.keys()) {
    const m = key.match(CATEGORY);
    if (!m) continue;
    const stem = stemOf(key);
    if (!sets.has(stem)) sets.set(stem, new Set());
    sets.get(stem).add(m[1]);
  }
  return sets;
};

for (const [tag, flat] of [['en', enFlat], ['he', heFlat]]) {
  const sets = setsIn(flat);
  for (const [stem, have] of sets) {
    for (const category of REQUIRED[tag]) {
      if (!have.has(category)) {
        out.push({
          key: `${tag}:${stem}_${category}`,
          value: '(missing)',
          rule: `incomplete plural set — ${tag} selects "${category}" and there is no form for it, so i18next falls back and prints the wrong language or the raw key`,
        });
      }
    }
  }
  // A counting sentence that was never pluralised at all.
  for (const [key, value] of flat) {
    if (CATEGORY.test(key)) continue;
    if (!/\{\{\s*count\b/.test(value)) continue;
    out.push({
      key: `${tag}:${key}`,
      value,
      rule: 'interpolates {{count}} with no plural forms — i18next pluralises this key, finds nothing, and renders the bare string ("1 שינויים")',
    });
  }
}

const enStems = new Set([...setsIn(enFlat).keys()].map(sharedStemOf));
const heStems = new Set([...setsIn(heFlat).keys()].map(sharedStemOf));
for (const [tag, mine, theirs, other] of [['en', enStems, heStems, 'he'], ['he', heStems, enStems, 'en']]) {
  for (const stem of mine) {
    if (!theirs.has(stem)) {
      out.push({
        key: `${tag}:${stem}`,
        value: '(pluralised here, flat there)',
        rule: `plural set missing in ${other} — the two locales must agree on which keys count, or one of them resolves and the other does not`,
      });
    }
  }
}

/* ──────────────────── 5 · INTERPOLATION EQUALITY ──────────────────── */
/**
 * The two locales of one key are rendered by ONE call site passing ONE set of params. A variable
 * that appears in he and not in en is a hole where a number should be — which is exactly how the
 * weekly push shipped as "התוכנית שלך לשבוע מוכנה — ␣␣ אימונים", every week, on the lock screen.
 *
 * `count` is exempt in the SINGULAR and DUAL forms only, and that exemption is grammar rather
 * than laxity: for those categories the number is known, so a language spells it as a word
 * ("סט אחד", "שבועיים") where another prints the digit ("{{count}} set"). Every other variable,
 * in every other form, must match exactly.
 */
const varsOf = (s) => new Set([...s.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]));
const SPELLED_OUT = /_(one|two)$/;

for (const [key, value] of enFlat) {
  const twin = heFlat.get(key);
  if (twin === undefined) continue; // parity above owns the missing ones
  const a = varsOf(value);
  const b = varsOf(twin);
  if (SPELLED_OUT.test(key)) {
    a.delete('count');
    b.delete('count');
  }
  const only = (x, y) => [...x].filter((v) => !y.has(v));
  const enOnly = only(a, b);
  const heOnly = only(b, a);
  if (enOnly.length || heOnly.length) {
    out.push({
      key,
      value: `en {${[...a].join(', ')}} · he {${[...b].join(', ')}}`,
      rule: 'the two locales interpolate different variables — one call site feeds both, so one of them renders a hole',
    });
  }
}

/* ───────────────── 4 · `_female` SYMMETRY (WARNING) ───────────────── */
/**
 * i18next resolves `key` for a man and `key_female` for a woman, so a namespace that has ANY
 * `_female` is a namespace where the mechanism is live — and a base key in it that speaks to HIM
 * with no feminine form addresses every woman as a man. Six wrist strings had the variant while
 * their identical phone twins did not: the same instruction, gendered on one screen and not the
 * other, in one workout.
 *
 * ⚠️ THIS PRINTS AND DOES NOT FAIL, on purpose. "Addresses the athlete" cannot be decided by a
 * regex in general, so this reports only what it can PROVE — a base carrying an unambiguously
 * masculine second-person word. Lower FEMALE_RATCHET as the list shrinks; never raise it. When it
 * reaches 0, turn this into a failure and delete this paragraph.
 *
 * Every word below has to be masculine second person and ONLY that. Hebrew spells a passive
 * participle exactly like an imperative — שמור is "keep" AND "kept", רשום is "write" AND
 * "written", כוון is "aim" AND "was aimed" — and each of those turned a correct genderless line
 * into a finding. The list holds words that have one reading. (Same lesson as `צעד`/`עמוד` in
 * the cue law, and as `שלחי` inside `נשלחים`.)
 */
/* 3 → 0 on 2026-08-23: the last three masculine-only sentences were conjugated (signinFailedNetwork,
 * paywall.unavailable, explain.progressLoad.textVariation). Every namespace that conjugates now
 * conjugates completely, and the ratchet holds it there. */
/*
 * ⚠️ AND THERE IS A CLASS THIS RULE CANNOT REACH, FOUND BY EYE ON `0.0e` (2026-08-27).
 *
 * `MASCULINE_2P` holds words that address HER. The coach's own voice is first person, and in Hebrew
 * a first-person present verb is gendered too — the coach says `אני מובילה` to a woman, which is
 * why `ob.mapEmphasis_female` exists. The entire programme-building sequence was masculine and
 * ungendered: `קורא את מה שסיפרת לי`, `בוחר את התרגילים שלך`, `קובע`, `מעצב`, `מוצא` — seven lines,
 * the first thing a female athlete reads after onboarding, the coach introducing itself.
 *
 * ⛔ AND THE LIST MUST NOT GROW TO CATCH THEM. Every one of those verbs is also a NOUN — a reader, a
 * voter, a helmet, a designer, an origin. The docblock above already states the standard they would
 * fail: *"the list holds words that have one reading."* Adding them would manufacture findings on
 * correct lines, which is how a checker dies.
 *
 * So it is written down instead: **first-person coach verbs are checked by a person, not by this
 * script.** `בונה` needs nothing — masculine and feminine are spelled alike unpointed — and that is
 * exactly the kind of judgement a regex has no way to make.
 */
/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ AND A THIRD CLASS THIS SCRIPT CANNOT SEE: HEBREW AGREEMENT ACROSS AN INTERPOLATION.
 *
 * Found by eye on `13.3b` (2026-08-28), the pain response: **`הכתפיים ממשיך להתאמן`**. `כתפיים` is
 * feminine PLURAL and the verb was masculine singular, because the template fixes a verb that has to
 * agree with a noun the template does not contain:
 *
 *     pain.responseTitleTwinge   ה{{muscle}} ממשיך להתאמן …
 *     pain.askBack               ה{{muscle}} נח את הזמן שביקשתי …
 *     whyHere.titleEssential     ה{{muscle}} שלך צריך את התנועה הזאת.
 *
 * The ten muscles are חזה, גב, כתפיים, יד קדמית, יד אחורית, רגליים, ירך אחורית, ישבן, בטן, תאומים —
 * masculine singular, feminine singular, feminine plural and masculine plural among them. **Seven of
 * the ten took the wrong verb.** The fault is invisible in English, where "your {{muscle}} keeps
 * training" is correct for every one of them.
 *
 * ── THE SHAPE THAT WORKS, AND IT WAS ALREADY IN THE FILE ────────────────────────────────────────
 * `pain.responseTitle` — *"נשמור על ה{{hurt}} ונמשיך לאמן את ה{{trained}}"* — has the same two
 * interpolations and no bug, because the verbs belong to the COACH and the muscles are objects.
 * Nothing agrees with the variable, so nothing can disagree with it. The three above were rewritten
 * onto that shape.
 *
 * ⛔ AND THIS RULE IS NOT WRITTEN AS CODE, deliberately. Deciding it needs the gender and number of
 * every value a placeholder can take — muscles, lift names, capabilities, movement patterns — none
 * of which is in the locale file. A regex would either miss most of it or accuse correct lines, and
 * the note above `MASCULINE_2P` already states what happens to a checker that does the second.
 *
 * ⚠️ THE THREE SURVIVORS WERE CLOSED ON 2026-08-28, once the data behind each was counted:
 *
 *     paywall.case              76 of the 136 exercise names are feminine — 56%, and the screen
 *                               that asks her to pay was wrong for every one of them.
 *     portrait.compareProof     4 of the 5 capability names are feminine.
 *     portrait.insightStrongest DELETED. It had no producer in `src` or `__tests__` — dead copy in
 *                               two locales, and the only reason it looked like work to do.
 *
 * Both live ones lost the verb entirely rather than gaining a second one: `ה{{lift}} שלך — {{delta}}
 * {{unit}} יותר`. Nothing left to agree is stronger than something that agrees today.
 *
 * ⚠️ WHAT REMAINS OF THIS CLASS IS A HABIT, NOT A LIST. Any NEW Hebrew string that puts a verb or an
 * adjective next to `{{…}}` reopens it, and no script here can tell. The counting above is the
 * method: find every value the placeholder can take, look at their genders, and if they differ,
 * write the sentence so nothing has to agree.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const FEMALE_RATCHET = 0;
const MASCULINE_2P = new Set([
  'אתה', 'שאתה', 'כשאתה', 'ואתה',
  // 2nd-person masculine future
  'תסיים', 'תרים', 'תבחר', 'תמשיך', 'תהיה', 'תענה', 'תדלג', 'תשלים', 'תלחץ', 'תקבל',
  'תחזור', 'תגיע', 'תרגיש', 'תדע', 'תוכל', 'תחזיק', 'תראה', 'תקיש',
  // imperatives with no second reading
  'התחל', 'המשך', 'השתמש', 'השהה', 'בוא', 'הקש', 'לחץ', 'נסה', 'הרם', 'החלף', 'הוסף',
  'הדלק', 'הפעל', 'בדוק', 'ערוך', 'כבה', 'צלם', 'דלג', 'קח', 'סיים', 'בחר',
]);

const hebrewWords = (s) => s.split(/[^֐-׿]+/).filter(Boolean);
/** The feminine twin: on a pluralised key the context goes BEFORE the count (`title_female_one`). */
const femaleOf = (key) => {
  const m = key.match(CATEGORY);
  return m ? `${key.slice(0, -m[0].length)}_female${m[0]}` : `${key}_female`;
};

const gendered = new Set([...heFlat.keys()].filter((k) => k.includes('_female')).map((k) => k.split('.')[0]));
const stillAMan = [];
for (const [key, value] of heFlat) {
  if (key.includes('_female')) continue;
  const namespace = key.split('.')[0];
  if (namespace === 'cues' || !gendered.has(namespace)) continue;
  if (heFlat.has(femaleOf(key))) continue;
  const hits = [...new Set(hebrewWords(value).filter((w) => MASCULINE_2P.has(w)))];
  if (hits.length) stillAMan.push({ key, hits, value });
}

if (stillAMan.length > 0) {
  console.warn(
    `\nWARNING · ${stillAMan.length} base key(s) speak to a man in a namespace that already conjugates (ratchet: ${FEMALE_RATCHET}):\n`,
  );
  for (const w of stillAMan) {
    console.warn(`  ! ${w.key}  [${w.hits.join(' ')}]\n    "${w.value}"\n    -> no ${femaleOf(w.key)} — a woman reads the masculine\n`);
  }
  if (stillAMan.length > FEMALE_RATCHET) {
    console.warn(
      `  The ratchet is ${FEMALE_RATCHET} and this run found ${stillAMan.length}. The number only ever goes DOWN:\n` +
        '  write the missing `_female`, do not raise FEMALE_RATCHET.\n',
    );
  }
}

if (out.length > 0) {
  console.error(`\nCopy-law violations (${out.length}):\n`);
  for (const v of out) {
    console.error(`  x ${v.key}\n    "${v.value}"\n    -> ${v.rule}\n`);
  }
  process.exit(1);
}

console.log(
  `Copy-law lint passed — voice laws hold on en (${enFlat.size} lines), he is complete (${heFlat.size}), ` +
    `plurals and interpolations agree across both. ${stillAMan.length} _female warning(s), ratchet ${FEMALE_RATCHET}.`,
);
