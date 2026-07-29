/**
 * SWIFT MEMBERWISE INITIALISERS ARE POSITIONAL — AND NOTHING ON THIS MACHINE COMPILES SWIFT.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * A Swift struct's synthesised `init` demands its arguments in DECLARATION order. Reorder a field
 * in `WatchWire.swift`, or add a call-site argument in the place that reads best, and the code is
 * still perfectly sensible prose — it simply does not compile:
 *
 *     error: argument 'restIsLearned' must precede argument 'nextExerciseName'
 *
 * Build 36 died on exactly that, twice over, and the whole gate on this repo (tsc + jest + lints +
 * expo export) is blind to it: the watch and widget targets are Swift, the dev box is Windows, and
 * the FIRST place the mistake can surface is a paid EAS build twenty minutes in. That is the most
 * expensive possible feedback loop for a mistake a regex can see.
 *
 * Worse, Swift reports only the FIRST misplaced argument per call, so a build tells you about one
 * and hides the rest — LocalWorkoutEngine's single reported error was three fields out of order.
 * This checks every argument in every call, so one run clears the whole class.
 *
 * ── Scope, honestly ───────────────────────────────────────────────────────────────────────────
 * This is a targeted linter, not a Swift compiler. It checks call sites of structs declared in
 * this repo's own Swift, in files this repo owns. It cannot see type errors, missing properties,
 * or dangling view modifiers — the other two failures in build 36. It closes the one class it can
 * close completely.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

const MOBILE = join(__dirname, '../..');

/** Every Swift file this repo owns — the watch app, the widget, and the two native modules. */
function swiftFiles(): string[] {
  return globSync('{targets,modules}/**/*.swift', { cwd: MOBILE, absolute: true });
}

/** `struct Name { var a; let b }` → the field order its memberwise init requires. */
function declaredStructs(sources: { file: string; text: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { text } of sources) {
    for (const m of text.matchAll(/(?:^|\n)\s*(?:private |public |internal )?struct (\w+)[^{]*\{/g)) {
      const open = m.index! + m[0].length;
      // Walk to the matching brace so a nested type cannot leak its fields into the parent's list.
      let depth = 1;
      let i = open;
      for (; i < text.length && depth > 0; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
      }
      const body = text.slice(open, i);
      // Only TOP-LEVEL stored properties take part in the memberwise init. A computed property
      // (`var body: some View { … }`) does not, and neither does anything inside a nested brace.
      const fields: string[] = [];
      let d = 0;
      for (const line of body.split('\n')) {
        if (d === 0) {
          const f = line.match(/^\s*(?:var|let) (\w+)\s*:/);
          // `var x: T { … }` is computed — it is not an init parameter.
          if (f && !/\{\s*$/.test(line)) fields.push(f[1]);
        }
        d += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      }
      if (fields.length) out.set(m[1], fields);
    }
  }
  return out;
}

interface Misordered {
  where: string;
  struct: string;
  argument: string;
  mustPrecede: string;
}

/** Every `StructName(` call in the source, with its labelled arguments in written order. */
function checkCallSites(sources: { file: string; text: string }[], structs: Map<string, string[]>): Misordered[] {
  const bad: Misordered[] = [];
  for (const { file, text } of sources) {
    const lines = text.split('\n');
    for (const [name, fields] of structs) {
      const index = new Map(fields.map((f, i) => [f, i]));
      for (const m of text.matchAll(new RegExp(`\\b${name}\\(`, 'g'))) {
        // Walk to the matching close paren, tracking nesting so an inner call's arguments are not
        // read as this one's. Closures are skipped wholesale for the same reason.
        let depth = 1;
        let i = m.index! + m[0].length;
        const start = i;
        for (; i < text.length && depth > 0; i++) {
          const c = text[i];
          if (c === '(' || c === '{' || c === '[') depth++;
          else if (c === ')' || c === '}' || c === ']') depth--;
        }
        const body = text.slice(start, i - 1);
        // Top-level labels only: an argument label sits at nesting depth 0 within the call.
        const labels: string[] = [];
        let d = 0;
        let atStart = true;
        for (let k = 0; k < body.length; k++) {
          const c = body[k];
          if (c === '(' || c === '{' || c === '[') d++;
          else if (c === ')' || c === '}' || c === ']') d--;
          else if (c === ',' && d === 0) atStart = true;
          else if (d === 0 && atStart && /\S/.test(c)) {
            const rest = body.slice(k);
            const lab = rest.match(/^(\w+)\s*:/);
            if (lab) labels.push(lab[1]);
            atStart = false;
          }
        }
        const known = labels.filter((l) => index.has(l));
        if (known.length < 2) continue;
        const line = text.slice(0, m.index).split('\n').length;
        let highest = -1;
        let highestName = '';
        for (const l of known) {
          const at = index.get(l)!;
          if (at < highest) {
            bad.push({
              where: `${file}:${line}`,
              struct: name,
              argument: l,
              mustPrecede: highestName,
            });
          } else {
            highest = at;
            highestName = l;
          }
        }
        void lines;
      }
    }
  }
  return bad;
}

describe('Swift call sites match their struct declaration order', () => {
  const sources = swiftFiles().map((f) => ({
    file: f.replace(/\\/g, '/').split('/code/mobile/')[1] ?? f,
    text: readFileSync(f, 'utf8'),
  }));
  const structs = declaredStructs(sources);

  it('finds the wire structs at all (the checker is not silently empty)', () => {
    // A parser that matches nothing passes every other test in this file for free. This is the
    // guard on the guard: WireMirror is the biggest memberwise init in the repo and the one that
    // broke build 36, so if it is not here the checker is not doing its job.
    expect(structs.has('WireMirror')).toBe(true);
    expect((structs.get('WireMirror') ?? []).length).toBeGreaterThan(20);
  });

  it('no argument is written before one it must follow', () => {
    const bad = checkCallSites(sources, structs).map(
      (b) => `${b.where} — ${b.struct}(…): '${b.argument}' must precede '${b.mustPrecede}'`,
    );
    expect({ misorderedSwiftArguments: bad }).toEqual({ misorderedSwiftArguments: [] });
  });
});
