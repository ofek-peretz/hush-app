#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NO HOOK IS REACHED CONDITIONALLY — the crash linter.
 *
 * ⛔ FOUNDER, 2026-08-31: *"יש גם באג נוסף שבעת יציאה ממסך האימון בתחילת האימון או בזמן שקרוב אליו
 * האפליקציה קורסת."*
 *
 * It was one line in `ActiveSet`:
 *
 *     const target = session.currentTarget;
 *     if (!target) return <View style={styles.center} />;   // ← the guard
 *     …
 *     const [newsW, setNewsW] = useState(0);                // ← the hook it skipped
 *
 * A guard written for exactly the right reason — `currentTarget` really is null for one frame when
 * a session ends — placed one line too high. On that frame the component rendered three hooks where
 * it had rendered four, and React throws: *"Rendered more hooks than during the previous render."*
 * **The guard against the crash was the crash.** It only ever fired when a workout was left before
 * anything was logged, which is why months of eye-passes never met it.
 *
 * ── WHY A SCANNER AND NOT ESLINT ────────────────────────────────────────────────────────────────
 * `eslint-plugin-react-hooks` is the standard answer and this repository has no eslint at all — no
 * config, no dependency, nothing to hang a rule on. Adding a whole toolchain to catch one shape is
 * a larger change than the shape deserves, and this repo already answers that question its own way:
 * `lint-copy` and `lint-rtl` are hand-written scanners over the same source. This is the third.
 *
 * ── WHAT IT LOOKS FOR ───────────────────────────────────────────────────────────────────────────
 * Inside any component or custom hook (`function Name(` with a capital, or `function useX(`), a
 * `return` at the function's OWN top level followed later — still at that top level — by a call to
 * a `useSomething(`. That is the violation exactly: the return can be taken, the hook below it
 * cannot then run, and the count changes between renders.
 *
 * Depth is tracked from the function's opening brace, so a `return` inside a callback, a `.map()`,
 * an event handler or a nested block is not the top level and is not this rule.
 *
 * ⚠️ THE FIX IS NEVER "DELETE THE GUARD". It is to hoist every hook above it: hooks run
 * unconditionally, and what the function RETURNS may then depend on anything it likes.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

/* The root is an ARGUMENT, so the law that proves this checker can still fail may plant its probe
   in a temp directory. `lint-rtl` takes one for the same reason, and the note there is the reason:
   jest runs suites in parallel workers over one filesystem, so a file planted in `src` is visible
   to every other law that walks `src` while it is there. */
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src');

/** Every .ts/.tsx under src. */
function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Strip line and block comments and string bodies, so their braces and words never count. */
function blank(line) {
  return line
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/\/\/.*$/, '');
}

const FN = /^\s*(?:export\s+)?(?:default\s+)?function\s+(use[A-Z]\w*|[A-Z]\w*)\s*\(/;
const HOOK = /(?:^|[^.\w])(use[A-Z]\w*)\s*\(/;

const findings = [];

for (const file of sources(SRC)) {
  const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  // Block comments span lines; carry the state so their contents never look like code.
  let inBlock = false;
  const lines = raw.map((l) => {
    let s = l;
    if (inBlock) {
      const end = s.indexOf('*/');
      if (end === -1) return '';
      s = s.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const open = s.indexOf('/*');
      if (open === -1) break;
      const close = s.indexOf('*/', open + 2);
      if (close === -1) {
        s = s.slice(0, open);
        inBlock = true;
        break;
      }
      s = s.slice(0, open) + ' ' + s.slice(close + 2);
    }
    return blank(s);
  });

  for (let i = 0; i < lines.length; i++) {
    const m = FN.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    // Walk to the body's opening brace, then to its close, tracking depth.
    let depth = 0;
    let started = false;
    let earlyReturnAt = -1;
    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      const before = depth;
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (!started && depth > 0) {
        started = true;
        continue; // the signature line itself holds no statements
      }
      if (!started) continue;
      if (depth <= 0) break; // the function closed

      // `before === 1` means this line begins at the function's own top level.
      if (before !== 1) continue;
      if (earlyReturnAt === -1 && /^\s*(?:if\s*\(.*\)\s*)?return\b/.test(line)) {
        earlyReturnAt = j;
        continue;
      }
      if (earlyReturnAt !== -1) {
        const h = HOOK.exec(line);
        if (h) {
          findings.push({
            file: path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/'),
            fn: name,
            hook: h[1],
            returnLine: earlyReturnAt + 1,
            hookLine: j + 1,
          });
          break; // one finding per function is enough to send someone to it
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error('\n⛔ A HOOK IS REACHED CONDITIONALLY — this crashes the app, it does not warn:\n');
  for (const f of findings) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.fn}() returns at line ${f.returnLine}, then calls ${f.hook}() at line ${f.hookLine}`);
    console.error('    → hoist the hook ABOVE the return. Never delete the guard.\n');
  }
  console.error(`${findings.length} violation(s).\n`);
  process.exit(1);
}

console.log('Hook-order lint passed — no hook sits below a conditional return.');
