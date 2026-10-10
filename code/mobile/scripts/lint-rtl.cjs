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
const { join, relative, resolve } = require('node:path');

/*
 * ⛔ THE ROOT IS AN ARGUMENT (2026-08-27), AND THAT IS A CONCURRENCY FIX, NOT A CONVENIENCE.
 *
 * `everyLintTheRepoShipsIsRun` proves this checker can still FAIL by planting a violating file and
 * watching it complain. Planted into `src`, that file existed for about a second and a half — and
 * jest runs suites in PARALLEL WORKERS against one filesystem, so every other law that walks `src`
 * could see it. `nothingIsBuiltForNobody`'s ratchet did, intermittently, which is the worst kind of
 * red: one that depends on which two suites happened to overlap.
 *
 * The probe points this at its own temp directory now. Nothing is ever written into `src`.
 */
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, '../src');

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
    if (!/\btextAlign\s*:/.test(body) && !lineText.includes('rtl-ok') && !isFaceOverride(body)) {
      hits.push(line);
    }
    idx = close !== -1 ? close : idx + 11;
  }
  return hits;
}

/**
 * A FACE OVERRIDE is not a text style — it is half of one.
 *
 * `{ fontFamily: font.sans }` composed onto a base that already declares its alignment carries no
 * layout of its own; demanding `textAlign` there would write the same value in two places and let
 * the two drift. And the shape is not incidental: it is the **`monoCanDraw` face swap**, the
 * mechanism that keeps Hebrew off the mono voice (`monoCarriesNoWords`) — JetBrains Mono has no
 * Hebrew glyphs, so every figure that can arrive as a WORD swaps to sans on exactly this line. Ten
 * of this linter's fifteen findings were that swap, in ten files, every one of them correct.
 *
 * A lint that cries wolf ten times gets ignored the eleventh, so the rule is NARROWED, not silenced:
 * only a lone `fontFamily` is exempt. Add any other property — a size, a colour, a position — and it
 * is a text style again and must declare where its text sits.
 */
function isFaceOverride(body) {
  const props = body
    .split(/,(?![^[]*\])/) // top-level commas; `fontVariant: ['tabular-nums']` stays intact
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith('//'));
  return props.length === 1 && /^fontFamily\s*:/.test(props[0]);
}

/** Allow a symmetric pair on one line (left & right together = direction-neutral). */
function isSymmetric(line) {
  return /\bmarginLeft\b/.test(line) && /\bmarginRight\b/.test(line)
    || /\bpaddingLeft\b/.test(line) && /\bpaddingRight\b/.test(line)
    || /\bborderLeftWidth\b/.test(line) && /\bborderRightWidth\b/.test(line)
    || /\bborderLeftColor\b/.test(line) && /\bborderRightColor\b/.test(line);
}


/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ NO SANS STYLE OPENS A WORD — because the word may be Hebrew.
 *
 * Tracked type is a LATIN device. Hebrew has no majuscule and its letters carry the word as a
 * connected block, so positive letter-spacing does not read as "instrument label", it reads as a
 * rendering fault: the founder saw `מ ש ק ל` and `ח ז ר ו ת` across the live stage on 2026-08-21.
 *
 * ⚠️ `Legend` was fixed that day AND THE RULE STAYED INSIDE `Legend`. Five days later the FIRST
 * SCREEN OF THE APP was still doing it — `Authentication`'s affirmation swapped the face for a
 * non-Latin string and kept `.22em` on top, so the product's one claim was spelled out letter by
 * letter to every Hebrew reader. A rule written as prose does not travel; this is the same rule as
 * a machine.
 *
 * ── WHAT IS FLAGGED, AND WHAT IS NOT ────────────────────────────────────────────────────────────
 *   FLAGGED   a POSITIVE `letterSpacing` on a line that also names a SANS face. Sans is the face
 *             translated copy is drawn in, so that pairing is the one that can meet Hebrew.
 *   ALLOWED   mono (`font.mono*`) — it cannot draw Hebrew at all, so a mono slot is Latin by
 *             construction and `monoCarriesNoWords` already holds it to that.
 *   ALLOWED   NEGATIVE tracking. Tightening a headline breaks neither alphabet.
 *   ALLOWED   `serif` — the coach's voice is never tracked open; a negative display track is
 *             covered above, and a positive one would be flagged.
 *
 * The fix is `legendVoice(text, size, em)` from `@/design/monoVoice`: it answers the face and the
 * tracking together, from the string, so the two can never disagree. Where the copy is genuinely
 * Latin-only and always will be, `rtl-ok` on the line is the verified exception.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/*
 * ⛔ IT IS GIVEN A STYLE BLOCK, NOT A LINE (2026-08-27) — THAT WAS THE HOLE.
 *
 * This rule shipped reading one line at a time, which means it could only ever see a style written
 * on ONE line. A style written the way most of this app writes them —
 *
 *     heroLabel: {
 *       fontFamily: font.sansMedium,
 *       fontSize: 17,
 *       letterSpacing: trackingPx(13, tracking.legend),
 *     },
 *
 * — has the face on one line and the tracking on another, and the rule never saw either half beside
 * the other. SIX styles were living in that gap, and one of them (WeekColumn.shape) was drawing
 * every queued card's description on Today in a face with no Hebrew in it at all. The lint printed
 * "passed" the whole time it was true.
 *
 * The caller hands it the accumulated block now, so a multi-line style is one string by the time it
 * arrives and both halves are visible at once.
 */
/**
 * The style object a given line sits inside, flattened to one string — or null when the line is not
 * inside one. A "style object" here is the shape this app writes them in: `name: {` at the head of
 * a line, closed by `},` at the same indent. Nested objects are swallowed by the depth count so a
 * `shadowOffset: { … }` does not end its parent early.
 *
 * It exists so the type rules can ask about a STYLE rather than about a line — see the note over
 * `tracksASansWord` for the six faults that hid in the difference.
 */
function styleBlockAt(lines, i) {
  /* Walk back to the nearest unclosed `name: {`. */
  let depth = 0;
  let start = -1;
  for (let k = i; k >= 0; k--) {
    const l = lines[k];
    depth += (l.match(/\}/g) || []).length - (l.match(/\{/g) || []).length;
    if (depth < 0) {
      if (/^\s*[\w'"[\]]+\s*:\s*\{/.test(l)) { start = k; break; }
      return null;
    }
  }
  if (start < 0) return null;
  /* …and forward to its close. */
  let d = 0;
  for (let k = start; k < lines.length; k++) {
    const l = lines[k];
    d += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (d === 0) return { start, end: k, text: lines.slice(start, k + 1).join(' ') };
  }
  return null;
}

function tracksASansWord(line) {
  /*
   * ⛔ THE TEST IS "NOT MONO", NOT "IS SANS" (2026-08-27).
   *
   * It read `if (!/\bfont\.sans/.test(line)) return false` — a style had to NAME the sans face to be
   * judged. `GhostClimb.label` named no face at all: it tracked `.16em` in the StyleSheet and
   * decided `mono` vs `sans` out in the JSX, from the string. So the one legend on the empty
   * Progress screen opened `כאן אתה נמצא` into `כ א ן  א ת ה  נ מ צ א`, and the lint said passed.
   *
   * A style that declares no family inherits the app's global default, which is the SANS
   * (`installGlobalFontDefault`). So "no family" is a sans style that simply did not say so, and it
   * must be judged as one. Only a block that explicitly asks for MONO earns the tracking — that is
   * the whole rule, stated the right way round.
   */
  /*
   * ⛔ MONO WAS AN UNCONDITIONAL EXEMPTION, AND IT IS NOT ONE (2026-08-27).
   *
   * This line read `if (font.mono) return false` — the rule's whole premise being that mono is a
   * FIGURE face, so tracking on it is figure tracking and no Hebrew word is at risk. `SessionFlow`'s
   * rest-card loading line broke that premise by hand: `font.mono`, `letterSpacing: 1.2`,
   * `.toUpperCase()` — drawing `1.25 בכל צד`. IBM Plex Mono has no Hebrew, so the suffix fell to a
   * substitute face and then had 1.2 points driven between its letters. **The exemption carried the
   * exact fault the rule exists to catch, straight past it.**
   *
   * ⚠️ SO THE EXEMPTION IS NARROWED TO WHAT EARNED IT: mono may TIGHTEN and may not OPEN. A negative
   * rung on mono is a figure being set (`tracking.figure`, the display heroes, the ring's clock) and
   * stays untouched. A POSITIVE one is the Latin all-caps convention applied to a WORD — and a word
   * whose face is decided in a stylesheet rather than from the string is exactly what `legendVoice`
   * exists to prevent.
   *
   * Measured when written: every mono style in the app tracks negative or zero. This flags nothing
   * that stands today, which is what a ratchet should cost.
   */
  const monoFace = /\bfont\.mono/.test(line);
  /* ⚠️ `[^)]*` STOPPED AT THE FIRST BRACKET, so a NESTED call — `trackingPx(px(24), tracking.figure)`,
     which is how the share card scales for export — parsed as `px(24` and the rung was never seen.
     Every export-scaled figure then read as an untracked word. Balanced to one level. */
  const m = /letterSpacing:\s*(-?[\d.]+|trackingPx\(((?:[^()]|\([^()]*\))*)\))/.exec(line);
  if (!m) return false;
  /* Mono earns the exemption only where it TIGHTENS — see the note above. A rung this rule cannot
     read stays unaccused on mono for the same reason it does on sans. */
  if (monoFace) {
    if (m[2] === undefined) return Number(m[1]) > 0;
    const monoEm = m[2].split(',').pop().trim();
    if (!/tracking\.\w+/.test(monoEm) || monoEm.startsWith('-')) return false;
    return !/tracking\.(tight|display|figure|figureLarge)/.test(monoEm);
  }
  if (m[2] !== undefined) {
    // `trackingPx(size, em)` — the sign of the EM is what opens or tightens the word.
    const em = m[2].split(',').pop().trim();
    if (em.startsWith('-')) return false;
    /* ⚠️ A rung this rule cannot read is not a rung it may accuse (2026-08-27).

       `Type.tsx` builds its components from a factory — `trackingPx(size, em)`, where `em` is a
       PARAMETER. Every one of its seven call sites passes `display`, `tight` or `normal`, all
       non-positive, but none of that is visible at the line the rule is looking at. Flagging it
       would make the lint report a fault that does not exist and teach the next reader to ignore it,
       which is how a checker dies.

       So: a numeric literal is judged, a named `tracking.*` rung is judged, and anything else is
       left alone — the rule reports what it can SEE. */
    if (!/tracking\.\w+/.test(em)) return false;
    /* The NEGATIVE rungs. ⚠️ `figure` and `figureLarge` were added on 2026-08-27 and this list
       was not told, so every display figure in the app read as a tracked word the moment the rule
       stopped requiring an explicit sans face. A rung added to `tracking` must be classified here. */
    return !/tracking\.(tight|display|figure|figureLarge)/.test(em);
  }
  return Number(m[1]) > 0;
}


/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ NOTHING IS SET IN ITALIC, BECAUSE THIS APP LOADS NO ITALIC FACE.
 *
 * The coach's voice was drawn `fontFamily: font.serif, fontStyle: 'italic'` on EIGHTEEN surfaces —
 * the promise on the front door, every Why sheet, the Saturday letter, the finish screen. `App.tsx`
 * registers exactly three serif faces (Regular / Medium / Bold) and Frank Ruhl Libre HAS no italic
 * to register: it is a Hebrew-first family, and Hebrew has no italic tradition to draw one from.
 *
 * So every one of those eighteen was a SYNTHETIC OBLIQUE — the renderer shearing upright glyphs.
 * In Latin that is the mark of an amateur build. In Hebrew it is worse than that: Hebrew letters
 * hang from a strong horizontal top stroke, and slanting them fights the letterform rather than
 * styling it. The app's PRIMARY locale was reading its coach in a distorted face.
 *
 * ⚠️ THE VOICE DID NOT NEED IT AND STILL DOES NOT. This product's whole voice system is FACE, not
 * slant: sans is the interface, mono is what was measured, serif is Hush speaking. The serif alone
 * already says "this is the coach" — that is why `monoCarriesNoWords` and the two-voice law exist —
 * and a fake slant on top was adding nothing a reader could not already see.
 *
 * If a real italic is ever wanted, it arrives the way every other face does: a file in `App.tsx`
 * and a name in `font`. Never as a transform.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const SYNTHETIC_ITALIC = /fontStyle:\s*'italic'/;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

/**
 * Replaces the CONTENT of block comments with spaces, keeping every newline so that reported line
 * numbers still point at the real line. A line carrying a declared exception is left untouched.
 * See the note at the scan for why line comments are not touched at all.
 */
function blankBlockComments(src) {
  let inBlock = false;
  return src
    .split('\n')
    .map((line) => {
      const opens = line.includes('/*');
      const closes = line.includes('*/');
      const was = inBlock;
      if (opens && !closes) inBlock = true;
      else if (closes) inBlock = false;
      if (line.includes('latin-ok') || line.includes('rtl-ok')) return line;
      if (was || opens) return '';
      return line;
    })
    .join('\n');
}

const out = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(join(__dirname, '..'), file);
  /*
   * ⛔ THE CHECKER WAS READING ITS OWN DOCUMENTATION (2026-08-27).
   *
   * The mono ratchet added the same day flagged `SessionFlow.tsx:3199` — which is a PROSE LINE
   * inside a JSX comment, quoting the very fault it was written to explain: *"`font.mono`,
   * `letterSpacing: 1.2`, `.toUpperCase()`"*. The rule was right about the characters and wrong
   * about what they were.
   *
   * ⚠️ THAT IS A REAL HAZARD IN THIS REPO SPECIFICALLY. Every fault here is fixed WITH a note that
   * quotes the broken style, so a text-matching checker gets louder the more carefully the codebase
   * is documented — and a checker that punishes explanation is one people learn to ignore.
   *
   * Block comments are blanked before the scan, line numbers preserved. LINE comments are left
   * alone on purpose: `latin-ok` and `rtl-ok` live in them, and blanking those would silently
   * revoke every declared exception in the app.
   */
  const lines = blankBlockComments(src).split('\n');
  for (const line of unalignedTextStyles(src)) {
    out.push({
      file: rel,
      line,
      text: (lines[line - 1] ?? '').trim(),
      msg: "text style without textAlign — declare 'left' (start), 'right' (end) or 'center'; omitting it freezes the text LTR",
    });
  }
  lines.forEach((line, i) => {
    /*
     * ⛔ THE TYPE RULES ARE CHECKED BEFORE THE `rtl-ok` BAIL, AND THEY HAVE THEIR OWN ESCAPE.
     *
     * `rtl-ok` is a blanket exemption, and it is granted for ONE reason — a verified physical-edge
     * or alignment idiom. When the tracking and italic rules were added under it, every line already
     * carrying that word was silently exempted from them too, which is how `HomeView.nextLabel`
     * (`letterSpacing: 0.8` on a translated `toUpperCase()`) was still opening a Hebrew word after
     * the sweep: its `rtl-ok` was about a nested span inheriting `textAlign`.
     *
     * An exemption may only excuse the thing it was granted for. `latin-ok` is the escape for a slot
     * whose copy is Latin for ever, and it says so in its own word.
     */
    if (SYNTHETIC_ITALIC.test(line) && !line.includes('latin-ok')) {
      out.push({
        file: rel,
        line: i + 1,
        text: line.trim(),
        msg: "no italic face is loaded, so this is a SYNTHETIC oblique — a shear, not a typeface. The coach's voice is the serif itself; if a real italic is wanted, register the file",
      });
      return;
    }
    /*
      A style may be written on one line or over eight. `styleBlockAt` returns whichever style
      object this line sits inside, so the face and the letter-spacing are read together however the
      style happens to be laid out. See the note over `tracksASansWord`.
     */
    const block = styleBlockAt(lines, i);
    const subject = block ? block.text : line;
    if (tracksASansWord(subject) && !subject.includes('latin-ok')) {
      /* Reported once, at the line that opens the style — not once per line of it. */
      if (!block || block.start === i) {
        out.push({
          file: rel,
          line: i + 1,
          text: line.trim(),
          msg: 'this style opens a word with positive letter-spacing — Hebrew reads that as a rendering fault. Use `<Legend>` (it asks the STRING which face and which tracking, and answers both from one test) or `legendVoice(text, size, em)`, or `latin-ok` if the copy is Latin for ever',
        });
      }
      return;
    }
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

console.log(`Type lint passed — no physical edge properties, no tracked words, no synthetic italics in ${files.length} source files.`);
