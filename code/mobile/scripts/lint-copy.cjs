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
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, child] of Object.entries(node)) {
      walk(child, path ? `${path}.${k}` : k);
    }
  }
}

walk(en, '');

if (out.length > 0) {
  console.error(`\nCopy-law violations (${out.length}):\n`);
  for (const v of out) {
    console.error(`  x ${v.key}\n    "${v.value}"\n    -> ${v.rule}\n`);
  }
  process.exit(1);
}

console.log('Copy-law lint passed — all Hush voice laws hold on the en locale.');
