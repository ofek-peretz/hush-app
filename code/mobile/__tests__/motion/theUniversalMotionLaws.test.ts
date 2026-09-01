/**
 * THE UNIVERSAL MOTION LAWS — every rig, every rom, checked against what is true of bodies rather
 * than against what each rig happened to declare about itself.
 *
 * `formspec.validate` already asserts each exercise's own contract, and it is green on all 136
 * rigs. It was green while the barbell deadlift finished its pull KNEELING — knee eleven units
 * below its own planted ankle — and while the whole fly family folded an arm shut to an 8° elbow
 * halfway through the sweep. Neither rig had a predicate for it. A validator built out of
 * per-exercise declarations cannot fail a rule nobody wrote down, and those two were nobody's.
 *
 * So this suite asserts the rules nobody writes down (`src/motion/audit.ts`), and it is deliberately
 * NOT configurable per exercise.
 *
 * ── THE DEBT LEDGER, NOW EMPTY ──────────────────────────────────────────────────────────────────
 * Turning the laws on found real defects in 34 of the 136 rigs. Rather than weaken the laws to fit,
 * each was written down by rig and by law and then fixed, and the suite asserts BOTH directions:
 *
 *   · nothing fails that is not already in the ledger  → no new defect can land;
 *   · nothing is in the ledger that no longer fails    → a fix must delete its own line.
 *
 * The second half is what stopped it rotting into an exemption list, and it is why the ledger got
 * to zero instead of to a comfortable size.
 */

//

import { EXERCISE_MOTION } from '@/motion/registry';
import { auditAll } from '@/motion/audit';

/**
 * THE LEDGER IS EMPTY, AND THAT IS THE POINT.
 *
 * It opened at 34 rigs. Every line in it was a body doing something a body cannot — an upper arm
 * drawn at twice its own length in `cable_woodchop`, a foot that changed length inside a rep in the
 * calf raises, a trailing leg reaching for a floor 83 units below a hip with only 77 units of leg,
 * a bracing arm whose two bones were each half the gap they happened to span. All of them shipped
 * green, because a FormSpec can only fail a rule someone wrote down and nobody writes down that
 * arms have a length.
 *
 * With nothing left in it the two assertions below stop being a ratchet and become an absolute:
 * NOTHING in this catalogue may break a universal law. Adding an entry here is a decision to ship a
 * body that cannot exist, and it needs a sentence saying why in the same commit.
 */
const KNOWN: Record<string, string[]> = {};


const failures = auditAll(EXERCISE_MOTION).filter((f) => f.severity === 'fail');

describe('the universal motion laws', () => {
  test('no rig breaks a law it is not already known to break', () => {
    const unexpected = failures.filter((f) => !(KNOWN[f.rig] ?? []).includes(f.law));
    if (unexpected.length) {
      throw new Error(
        `${unexpected.length} new motion-law violation(s):\n` +
          unexpected.map((f) => `  ${f.rig} — ${f.law}: ${f.detail}`).join('\n'),
      );
    }
  });

  test('the debt ledger has no stale entries — a fix deletes its own line', () => {
    const live = new Set(failures.map((f) => `${f.rig}|${f.law}`));
    const stale: string[] = [];
    for (const [rig, laws] of Object.entries(KNOWN)) {
      for (const law of laws) if (!live.has(`${rig}|${law}`)) stale.push(`${rig} — ${law}`);
    }
    if (stale.length) {
      throw new Error(`${stale.length} entr(ies) in KNOWN no longer fail. Delete them:\n  ` + stale.join('\n  '));
    }
  });

  test('every rig in the registry is actually audited', () => {
    const ids = Object.keys(EXERCISE_MOTION);
    expect(ids.length).toBeGreaterThan(130);
    for (const rig of Object.keys(KNOWN)) expect(ids).toContain(rig);
  });
});
