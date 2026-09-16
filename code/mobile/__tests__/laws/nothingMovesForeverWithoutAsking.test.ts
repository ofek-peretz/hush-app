/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NOTHING MOVES FOREVER WITHOUT ASKING — the motion audit, 2026-08-24.
 *
 * Spec §8.2 has always said what Reduced Motion means here: *"slides become fades, sheet springs
 * become fades, the timer pulse is suppressed (haptic still fires), Portrait bars draw fully. No
 * Hush moment depends on motion to be understood."* `platform/reducedMotion` has existed the whole
 * time. The audit asked the only question that matters about a setting like that — **does every
 * animated surface actually consult it** — and cross-referenced every file that calls
 * `Animated.timing/spring/loop`, `withTiming/withSpring/withRepeat` or `LayoutAnimation` against
 * every file that reads the hook. Fourteen animate; ten asked.
 *
 * ── THE TWO THAT WERE WRONG ─────────────────────────────────────────────────────────────────────
 *   · `MilestoneEmblem` — an `Animated.loop`, 4 s, running for as long as the athlete stands on the
 *     milestone screen. It was the ONLY perpetual animation in the product; everything else is a
 *     transition that starts, arrives and is over. An endless loop is the exact class of motion the
 *     setting exists for. It now does not run, and the ring is not drawn — the emblem, the number
 *     and the caption already carry the whole statement.
 *   · `BottomSheet` — the component §8.2 names by name. Its snap-back was a SPRING (overshoot is
 *     the vestibular trigger, not travel) and its dismissal slid the sheet 800pt down the screen.
 *     Under the setting the spring becomes a plain curve and the dismissal becomes a fade.
 *
 * ── THE TWO THAT ARE RIGHT TO ANIMATE ANYWAY, AND WHY ───────────────────────────────────────────
 * A law that just said "everything must ask" would be wrong, so both exemptions are named here and
 * asserted, to stop a future sweep "fixing" them:
 *
 *   · `ds/RestRing` — the ring's sweep is not decoration, it IS the timer. Its 1 s linear tween
 *     smooths between per-second updates; suppressing it would leave the athlete watching a clock
 *     that jumps, or none at all. §8.2 suppresses a PULSE, and the ring has none.
 *   · `ds/Switch` — a 180 ms thumb slide (`motion.dur[2]`) is direct-manipulation feedback: it
 *     answers her finger, it cannot surprise her, and the platform's own switch animates under the
 *     setting too.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const ANIMATES = /Animated\.(timing|spring|loop|sequence|decay|parallel)|withTiming|withSpring|withRepeat|LayoutAnimation/;
const ASKS = /useReducedMotion/;

/** Named, reasoned exemptions — see the header. Anything else must ask. */
const EXEMPT = new Set(['components/ds/RestRing.tsx', 'components/ds/Switch.tsx']);

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const files = walk(SRC);

describe('1 · every animated surface consults Reduced Motion', () => {
  it('no animated file skips the setting except the two named exemptions', () => {
    const offenders = files
      .filter((f) => ANIMATES.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !ASKS.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .filter((r) => !EXEMPT.has(r));
    expect(offenders).toEqual([]);
  });

  it('and the exemptions still exist — a stale allow-list is its own defect', () => {
    for (const e of EXEMPT) expect(fs.existsSync(path.join(SRC, e))).toBe(true);
  });
});

describe('2 · nothing loops forever unasked', () => {
  /*
   * The strongest version of the rule. A transition ends; a loop does not, and a loop is what a
   * vestibular disorder actually reacts to. Every `Animated.loop` / `withRepeat` in the product must
   * sit in a file that reads the setting.
   */
  it('every perpetual animation is in a file that reads the setting', () => {
    const loops = files
      .filter((f) => /Animated\.loop|withRepeat/.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !ASKS.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(loops).toEqual([]);
  });

  it("the milestone halo is gated on the setting, not merely on its own `pulse` prop", () => {
    const src = fs.readFileSync(path.join(SRC, 'components/MilestoneEmblem.tsx'), 'utf8');
    expect(src).toContain('const breathing = pulse && !reduced;');
    // The loop AND the ring both hang off the gate — suppressing one and drawing the other would
    // leave a static halo sitting on the screen for no reason.
    expect(src).toContain('if (!breathing) return;');
    expect(src).toContain('{breathing ? (');
  });
});

describe('3 · the sheet obeys the clause that names it', () => {
  const sheet = fs.readFileSync(path.join(SRC, 'components/BottomSheet.tsx'), 'utf8');

  it('the snap-back drops its overshoot under the setting', () => {
    expect(sheet).toMatch(/reduced \? withTiming\(0, \{ duration: motion\.dur\[2\] \}\) : withSpring\(0/);
  });

  it('the dismissal fades instead of travelling 800pt', () => {
    expect(sheet).toContain('fade.value = withTiming(0, { duration: motion.dur[1] }');
    expect(sheet).toContain('opacity: fade.value');
  });
});

describe('4 · every duration comes off the token scale', () => {
  /*
   * `motion.dur` is the scale — 80 / 120 / 180 / 240 / 360 / 600 / 900 / bloom 1400 / breath 4500.
   * A literal that is not on it is a number someone typed, and a product whose timings are each
   * slightly different reads as unconsidered even when no single screen is wrong.
   *
   * The sweep found six. Four snapped onto existing rungs (a 4000 ms "breath" that was not
   * `breath`, a 620 that meant 600, a 420 that meant 360, and the correction beat's `460` written
   * twice — one moment, two literals, which was the real defect). One had no rung: the sign-in halo
   * genuinely sits between `land` and `breath`, so `bloom` was NAMED rather than the pixels moved.
   *
   * ⛔ ONE EXEMPTION, AND IT IS A PHYSICAL ONE. `ds/RestRing` times at 1000 ms because that is a
   * SECOND — the ring smoothing between per-second countdown updates. It is set by the clock, not
   * by taste, and tokenising it would let a design change desync the instrument from the time it is
   * displaying. It is named here so the exemption is a decision and not an oversight.
   */
  const CLOCK_EXEMPT = new Set(['components/ds/RestRing.tsx']);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it('no animated surface carries a hand-typed duration', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f).split(path.sep).join('/');
      if (rel === 'design/tokens.ts' || CLOCK_EXEMPT.has(rel)) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/duration:\s*(\d{2,5})/g)) offenders.push(`${rel}: ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the clock exemption still exists and is still a clock', () => {
    const ring = fs.readFileSync(path.join(SRC, 'components/ds/RestRing.tsx'), 'utf8');
    expect(ring).toMatch(/duration:\s*1000/);
    expect(ring).toContain('Easing.linear');
  });

  it('`bloom` is on the scale, so the sign-in halo is a token and not a number', () => {
    const tokens = fs.readFileSync(path.join(SRC, 'design/tokens.ts'), 'utf8');
    expect(tokens).toMatch(/bloom:\s*1400/);
    const auth = fs.readFileSync(path.join(SRC, 'screens/onboarding/Authentication.tsx'), 'utf8');
    expect(auth).toContain('motion.dur.bloom');
  });
});
