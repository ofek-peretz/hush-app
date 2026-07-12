/**
 * RTL style linter — keeps the Hebrew build native. Run in CI: `npm run lint:rtl`.
 *
 * TWO rules, and the second one is the fix for the founder's 2026-07-12 device review
 * ("in Hebrew everything is stuck on the left"):
 *
 * 1. LAYOUT — React Native auto-mirrors a BOX only when its edges are logical. Physical
 *    edges freeze to LTR:
 *      marginLeft/Right     -> marginStart / marginEnd
 *      paddingLeft/Right    -> paddingStart / paddingEnd
 *      borderLeft/RightWidth-> borderStartWidth / borderEndWidth   (…Color likewise)
 *      absolute left:/right:-> start: / end:
 *
 * 2. TEXT — the OPPOSITE is true, and this linter used to enforce the wrong half of it.
 *    RN flips an EXPLICIT `textAlign: 'left'` to the right edge under RTL, so 'left' IS
 *    the logical start. An OMITTED alignment is iOS's `natural`, which RN does not flip:
 *    it lands on the physical left and freezes Hebrew there. So "no alignment" is not a
 *    neutral default — it is a silent LTR lock, and every text style must declare one.
 *    The rule: a style object that sets `fontFamily` must also set `textAlign`
 *    ('left' = start, 'right' = end, 'center' = centred).
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
];

/**
 * Rule 2 — every text style declares its alignment. Resolves the object literal that
 * encloses each `fontFamily:` and requires a `textAlign` inside it. Returns the 1-based
 * line of each offending `fontFamily`.
 */
function unalignedTextStyles(src) {
  const hits = [];
  let idx = 0;
  while ((idx = src.indexOf('fontFamily:', idx)) !== -1) {
    let depth = 0;
    let open = -1;
    for (let i = idx - 1; i >= 0; i--) {
      const c = src[i];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) { open = i; break; }
        depth--;
      }
    }
    let close = -1;
    if (open !== -1) {
      let d = 0;
      for (let i = open + 1; i < src.length; i++) {
        const c = src[i];
        if (c === '{') d++;
        else if (c === '}') {
          if (d === 0) { close = i; break; }
          d--;
        }
      }
    }
    const body = open !== -1 && close !== -1 ? src.slice(open + 1, close) : '';
    const line = src.slice(0, idx).split('\n').length;
    const lineText = src.split('\n')[line - 1] ?? '';
    if (!/\btextAlign\s*:/.test(body) && !lineText.includes('rtl-ok')) hits.push(line);
    idx = close !== -1 ? close : idx + 11;
  }
  return hits;
}

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
  const src = readFileSync(file, 'utf8');
  const rel = relative(join(__dirname, '..'), file);
  const lines = src.split('\n');
  for (const line of unalignedTextStyles(src)) {
    out.push({
      file: rel,
      line,
      text: (lines[line - 1] ?? '').trim(),
      msg: "text style without textAlign — declare 'left' (start), 'right' (end) or 'center'; omitting it freezes the text LTR",
    });
  }
  lines.forEach((line, i) => {
    if (line.includes('rtl-ok')) return;
    if (isSymmetric(line)) return;
    for (const [re, msg] of RULES) {
      if (re.test(line)) {
        out.push({ file: rel, line: i + 1, text: line.trim(), msg });
        break;
      }
    }
  });
}

out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (out.length > 0) {
  console.error(`\nRTL style violations (${out.length}):\n`);
  for (const v of out) {
    console.error(`  x ${v.file}:${v.line}\n    ${v.text}\n    -> ${v.msg}\n`);
  }
  console.error('Fix with the logical equivalent, or append `rtl-ok` in a line comment for a verified exception.\n');
  process.exit(1);
}

console.log(`RTL style lint passed — no physical edge properties in ${files.length} source files.`);
