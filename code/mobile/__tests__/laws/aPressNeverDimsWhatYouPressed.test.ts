/**
 * A PRESS CHANGES THE SURFACE; IT NEVER DIMS THE CONTENT — founder A.13.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * "Delete-account and Sign-out screens look faded when pressed."
 *
 * They did. Both carried a hand-rolled `opacity: pressed ? 0.5 : 1`, so touching either dimmed the
 * WORDS — and a word at half strength does not read as "pressed", it reads as broken or disabled.
 * Five more sites had the same thing at 0.55, 0.6 and 0.9.
 *
 * The product had already settled this and those sites had simply never been brought in line:
 *
 *   · `press` declares `opacity: 1` — the token says a press is NOT a fade.
 *   · every `Button` variant answers a press by changing its FILL (`signal.fillPressed`,
 *     `fillSubtle`, `alert.wash` …). The wash appears UNDER the control; the control never dims.
 *
 * So the law is the class, not the six files: nothing in the app may answer a press by lowering
 * its own opacity. A wash is cheap to write and impossible to mistake for "disabled", which is
 * exactly what a 50% word looks like.
 *
 * ── Scope, honestly ───────────────────────────────────────────────────────────────────────────
 * A source reader. It cannot see a fade that arrives through a variable or an Animated value —
 * it closes the shape that actually shipped six times, which is a literal opacity keyed off a
 * `pressed` flag.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';
import { press } from '@/design/tokens';

const SRC = join(__dirname, '../../src');

/** Comments blanked, line count preserved — a law must survive being described at a call site. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

interface Hit {
  where: string;
  line: string;
}

function fades(): Hit[] {
  const out: Hit[] = [];
  for (const f of globSync('**/*.tsx', { cwd: SRC, absolute: true })) {
    const rel = f.replace(/\\/g, '/').split('/src/')[1];
    // `screens/dev` is the debug harness and ships nowhere (the copy laws exempt it too).
    if (rel.startsWith('screens/dev/')) continue;
    const lines = withoutComments(readFileSync(f, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      // `opacity: pressed ? 0.5 : 1`  /  `pressedStyle: { opacity: 0.6 }`
      const inline = /pressed\s*\?\s*(0?\.\d+)/.test(line);
      const named = /[Pp]ressed\s*:\s*\{[^}]*opacity\s*:\s*(0?\.\d+)/.test(line);
      if (inline || named) out.push({ where: `${rel}:${i + 1}`, line: line.trim() });
    });
  }
  return out;
}

describe('a press never dims what you pressed', () => {
  it('the sweep finds files at all (it is not silently empty)', () => {
    expect(globSync('**/*.tsx', { cwd: SRC }).length).toBeGreaterThan(40);
  });

  it('nothing answers a press by lowering its own opacity', () => {
    expect({ pressFades: fades().map((h) => `${h.where} — ${h.line}`) }).toEqual({ pressFades: [] });
  });

  /**
   * The token is the reason the rule above is a rule and not a preference. If someone ever sets
   * `press.opacity` below 1, the product has decided a press IS a fade — and this whole law, plus
   * the six sites it cleaned up, needs to be reopened rather than quietly contradicted.
   */
  it('and the token still says so', () => {
    expect(press.opacity).toBe(1);
  });
});
