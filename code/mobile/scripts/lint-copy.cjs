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
 * HEBREW (added 2026-07-12). Most voice laws are authored in English prose and cannot be
 * regex-checked in Hebrew — but two can, and they are the two that actually broke on device:
 *
 *  1. The third-person "Hush" (the founder's ruling) — same rule, same list of sanctioned names.
 *  2. KEY PARITY. A key that exists in en and not in he renders as the raw dotted key on a
 *     Hebrew phone ("ob.readyBody"), which is what shipping an unfinished translation looks
 *     like. Gendered variants (`_female`) are Hebrew-only by design and are exempt.
 */
const he = JSON.parse(readFileSync(join(__dirname, '../src/i18n/locales/he.json'), 'utf8'));

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
for (const key of enFlat.keys()) {
  if (key.includes('._comment')) continue; // authoring notes are not copy
  if (!heFlat.has(key)) {
    out.push({ key: `he:${key}`, value: '(missing)', rule: 'no Hebrew translation — the athlete would see the raw key' });
  }
}
/**
 * Legitimately Hebrew-only, so exempt from the orphan check:
 *  - `cues.*` — the Hebrew technique-cue library (ratified 2026-07-06); English cues live in
 *    the exercise catalog, not the locale.
 *  - `_female` — the gendered forms Hebrew needs and English does not.
 *  - Hebrew's DUAL plural category (`_two`) — i18next resolves it; English has no such form.
 *  - `_comment*` — authoring notes.
 */
const HE_ONLY = /(^cues\.)|(_female$)|(_two$)|(\._comment)/;

for (const key of heFlat.keys()) {
  if (!enFlat.has(key) && !HE_ONLY.test(key)) {
    out.push({ key: `he:${key}`, value: heFlat.get(key), rule: 'orphan Hebrew key — nothing in en.json to translate' });
  }
}

if (out.length > 0) {
  console.error(`\nCopy-law violations (${out.length}):\n`);
  for (const v of out) {
    console.error(`  x ${v.key}\n    "${v.value}"\n    -> ${v.rule}\n`);
  }
  process.exit(1);
}

console.log(`Copy-law lint passed — voice laws hold on en (${enFlat.size} lines) and he is complete (${heFlat.size}).`);
