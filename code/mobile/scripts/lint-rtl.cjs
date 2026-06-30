/**
 * RTL style linter — bans physical, non-mirroring edge properties in the app source
 * so the Hebrew (RTL) build stays native. Run in CI: `npm run lint:rtl`.
 *
 * React Native auto-mirrors layout only when styles are LOGICAL. Physical edges
 * (marginLeft, paddingRight, borderLeftWidth, textAlign:'left'/'right') freeze to
 * LTR and silently break RTL. Use the logical equivalents instead:
 *   marginLeft/Right     -> marginStart/marginEnd
 *   paddingLeft/Right    -> paddingStart/paddingEnd
 *   borderLeft/RightWidth-> borderStartWidth/borderEndWidth   (…Color likewise)
 *   textAlign:'left'      -> omit (RN aligns to the start, mirroring); 'right' -> textEnd
 *   absolute left:/right: -> start:/end:
 *
 * Escape hatch: append `rtl-ok` in a comment on the line for an intentional, verified
 * exception (e.g. a brand lockup pinned LTR, or a symmetric inset). Symmetric pairs
 * on one line (both left & right, e.g. a drawn triangle or full-bleed overlay) are
 * allowed automatically.
 */
'use strict';
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const SRC = join(__dirname, '../src');

/** [regex, message] — each flags a physical edge property. */
const RULES = [
  [/\bmargin(Left|Right)\b/, 'physical margin — use marginStart / marginEnd'],
  [/\bpadding(Left|Right)\b/, 'physical padding — use paddingStart / paddingEnd'],
  [/\bborder(Left|Right)Width\b/, 'physical border width — use borderStartWidth / borderEndWidth'],
  [/\bborder(Left|Right)Color\b/, 'physical border color — use borderStartColor / borderEndColor'],
  [/textAlign:\s*['"](left|right)['"]/, "physical textAlign — omit for start, or use textEnd from '@/i18n/bidi'"],
];

/** Allow a symmetric pair on one line (left & right together = direction-neutral). */
function isSymmetric(line) {
  return /\bmarginLeft\b/.test(line) && /\bmarginRight\b/.test(line)
    || /\bpaddingLeft\b/.test(line) && /\bpaddingRight\b/.test(line)
    || /\bborderLeftWidth\b/.test(line) && /\bborderRightWidth\b/.test(line)
    || /\bborderLeftColor\b/.test(line) && /\bborderRightColor\b/.test(line);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

const out = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('rtl-ok')) return;
    if (isSymmetric(line)) return;
    for (const [re, msg] of RULES) {
      if (re.test(line)) {
        out.push({ file: relative(join(__dirname, '..'), file), line: i + 1, text: line.trim(), msg });
        break;
      }
    }
  });
}

if (out.length > 0) {
  console.error(`\nRTL style violations (${out.length}) — physical edge properties don't mirror:\n`);
  for (const v of out) {
    console.error(`  x ${v.file}:${v.line}\n    ${v.text}\n    -> ${v.msg}\n`);
  }
  console.error('Fix with the logical equivalent, or append `rtl-ok` in a line comment for a verified exception.\n');
  process.exit(1);
}

console.log(`RTL style lint passed — no physical edge properties in ${files.length} source files.`);
