/**
 * A LADDER POSITION IS NOT A VALUE.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * The READOUT redesign (2026-07-17, commit `525341e`) INVERTED the paper ladder. `paper[0]` used
 * to be the LIGHTEST value — `#fbfaf8`, white with a hint — and became the GROUND, `#e8e5e0`, a
 * warm grey at 78.6%. That was the right move: it is what made white a resource the app did not
 * have before, and what let cards separate by tone instead of a hairline.
 *
 * But a dozen call-sites had written `paper[0]` when they MEANT "white". They were not asking for
 * the ladder's first rung; they were asking for the lightest thing there is, and `paper[0]` merely
 * happened to be it. When the ladder turned over, every one of them silently dimmed — no
 * typecheck, no test, no error. Just a slightly wrong colour, on a screen nobody rebuilt.
 *
 * Two of them were real defects, and they were found by hand, weeks later:
 *   - **The Cardio run/walk icon** sat at **1.26:1** on the (now white) active segment. Invisible.
 *     The label beside it survived untouched — because the label asks for `color.textPrimary`, a
 *     NAME, while the icon asked for a POSITION.
 *   - **The Switch knob** sat at **1.23:1** against its own off-track, carried entirely by its
 *     shadow, where a UI component needs 3:1.
 * And one was on the app's front door: **Sign in with Apple**'s mark and label went grey-on-black,
 * beside a pure-white Google button.
 *
 * ── The law ──────────────────────────────────────────────────────────────────────────────────
 * A foreground — text, an icon, a mark — may never be bound to a ladder POSITION. It must ask by
 * NAME: `paper.lift` / `color.textPrimary` / `color.lift`, or a brand literal when the surface is
 * not ours (Apple's white on Apple's button). Names survive a re-tuned ladder; positions do not.
 *
 * Backgrounds are exempt on purpose: a surface asking for "the second rung" is asking for exactly
 * the thing the ladder exists to express, and it moves WITH the ladder, which is correct.
 */
// @ts-nocheck

// 

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

const SRC = join(__dirname, '../../src');

/** Every `.ts`/`.tsx` under src/, except the token file that legitimately defines the ladder. */
function sourceFiles(): string[] {
  return globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true }).filter(
    (f) => !f.replace(/\\/g, '/').endsWith('design/tokens.ts'),
  );
}

/**
 * Every read of a PAPER-ladder position, and the ~40 characters leading up to it.
 *
 * Scoped to `paper` alone. The first draft of this law also swept `ink`, `up`, `down` and `stageC`
 * and was wrong about all four: `up[0]`/`down[0]` are not rungs but the PAPER variants of sage/clay
 * (their siblings being `up.stage`/`down.stage`), `ink[0]` is the strongest ink and is precisely
 * what body text should ask for, and the stage ladder never inverted. A law that cries wolf on 16
 * correct call-sites gets deleted — and then the real thing it guarded walks back in.
 */
const LADDER_READ = /(.{0,40})\bpaper\s*\[\s*\d+\s*\]/gs;

/**
 * The uses that are ALLOWED to name a rung: backgrounds and fills.
 *
 * The rule is inverted on purpose — allow-list the surfaces, suspect everything else — because a
 * foreground has too many spellings to enumerate. This law's own first draft matched only
 * `color:` / `color=`, and so sailed straight past `Badge`, whose foreground map spells it
 * `solid: paper[0]`. It was verified against the real bug, did not catch it, and had to be
 * rewritten. A surface asking for "the second rung" is asking for exactly what the ladder exists to
 * express, and it moves WITH the ladder — which is correct, and is why these are exempt.
 */
const IS_A_SURFACE = /\b(backgroundColor|background|fill|borderColor|borderTopColor|borderBottomColor|shadowColor|tintColor)\s*[:=]\s*\{?\s*$/;

describe('a ladder position is not a value', () => {
  it('no foreground is bound to a ladder position — it must ask by name', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      // Comments are BLANKED, not stripped — every character becomes a space and every newline
      // survives, so offsets (and therefore the line numbers reported below) still point at the
      // real file. Deleting them instead shifted every number after the first comment: this law's
      // own first run blamed Badge.tsx:27 for a bug on line 35.
      //
      // They have to go one way or another: several files EXPLAIN this bug by quoting the old code,
      // and a law that cannot tell an explanation from an instruction fails on its own docs.
      const blank = (s: string) => s.replace(/[^\n]/g, ' ');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
      for (const m of code.matchAll(LADDER_READ)) {
        if (IS_A_SURFACE.test(m[1])) continue; // a background may name a rung — see IS_A_SURFACE
        // `m.index` is the start of the 40-char PREFIX capture, not of `paper[` — skip past it, or
        // every offender is reported ~3 lines above where it actually lives.
        const at = (m.index ?? 0) + m[1].length;
        const line = code.slice(0, at).split('\n').length;
        const rel = file.replace(/\\/g, '/').split('/src/')[1];
        offenders.push(`${rel}:${line} → ${code.slice(at).split('\n')[0].trim()}`);
      }
    }
    expect({ foregroundsBoundToALadderPosition: offenders }).toEqual({
      foregroundsBoundToALadderPosition: [],
    });
  });

  it('the ladder still climbs, so `lift` is genuinely the lightest thing there is', () => {
    // The law above is only worth anything while `paper.lift` MEANS "the lightest". If a future
    // re-tune inverts the ladder again, this is the assertion that should stop it — loudly, here —
    // rather than a dozen foregrounds dimming in silence the way they did last time.
    const { paper } = require('@/design/tokens') as typeof import('@/design/tokens');
    const lum = (hex: string) => {
      const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    expect(lum(paper.lift)).toBeGreaterThan(lum(paper[1]));
    expect(lum(paper[1])).toBeGreaterThan(lum(paper[0])); // raised is lighter than the ground
    expect(lum(paper[0])).toBeGreaterThan(lum(paper[2])); // the ground is lighter than the well
    expect(lum(paper[2])).toBeGreaterThan(lum(paper[3])); // …and the well than the deepest well
  });
});
