/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ROOM SHE DECLARED IS HONOURED — OR SAID OUT LOUD (2026-09-14).
 *
 * Found by walking it on real glass, not by reading: on Expo web I turned a full gym down to a bag
 * of resistance bands, pressed Done — and Today still opened on a barbell back squat, a cable
 * pulldown and a cable crunch, with no sentence anywhere on the screen.
 *
 * Two halves had drifted apart, and only one of them was a bug:
 *
 *   1. ⛔ NOT A BUG: the week was not rebuilt. `engineMayRebuild` refuses a week stamped
 *      `authored: 'athlete_or_coach'`, and since 2026-09-09 the MODEL's week carries that stamp
 *      (build 72: the engine used to rebuild over the week she was shown, in silence). A week she
 *      brought — or that was written for her and shown to her — is not ours to rewrite.
 *   2. ⛔ THE BUG: nobody told her. The room's save threw the answer away (`void
 *      updateProfileInfo(...)`), so the one screen that knows whether the week moved said nothing.
 *      `BodyMapEdit` and `ExerciseLibrary` had both already learned this lesson.
 *
 * And the room has a second road when the week stays as written: the SWAP menu, which is how she
 * gets a barbell squat out of a week nobody may rewrite. Every swap door passes her room — except
 * the builder's, which was the one screen dedicated to editing the week.
 *
 * This law pins both halves: every swap door names the room, and the room's save names what
 * happened either way.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const rel = (f: string): string => f.replace(/\\/g, '/').split('/src/')[1] ?? f;
/** The dev gallery mounts fixtures on purpose — it proves nothing about what ships. */
const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true }).filter((f) => !rel(f).startsWith('screens/dev/'));
const strip = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** Every call to `fn(` in the shipping source, with the call's own argument text. */
function callSites(fn: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const f of files) {
    if (rel(f).startsWith('domain/swapPool')) continue; // the pool's own internals are not a door
    const code = strip(fs.readFileSync(f, 'utf8'));
    let i = code.indexOf(fn + '(');
    while (i >= 0) {
      // the call's arguments: from the open paren to its match, so a nested object still counts
      let depth = 0;
      let j = i + fn.length;
      for (; j < code.length; j++) {
        if (code[j] === '(') depth++;
        else if (code[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      out.push({ file: rel(f), text: code.slice(i, j + 1) });
      i = code.indexOf(fn + '(', j);
    }
  }
  return out;
}

describe('⛔ every swap door offers what her room holds', () => {
  it('every `swapChoices` call in the app names `equipment` — a menu is furniture otherwise', () => {
    const sites = callSites('swapChoices');
    expect(sites.length).toBeGreaterThanOrEqual(4); // the stage, the pre-workout card, the wrist pool, the builder
    const silent = sites.filter((s) => !/\bequipment\b/.test(s.text)).map((s) => s.file);
    expect(silent).toEqual([]);
  });

  it('…and so does every `swapCandidates` call outside the pool itself', () => {
    const silent = callSites('swapCandidates')
      .filter((s) => !/\bequipment\b/.test(s.text))
      .map((s) => s.file);
    expect(silent).toEqual([]);
  });
});

/* ⛔ THE ROOM ROW LEFT THE YOU TAB (founder 2026-09-16). What she has she tells the model in her own
   words on the ask; `Profile.equipment` still binds every swap door above for a room already stored. */
describe.skip('⛔ the room save says what happened to the week (the row is deleted)', () => {
  const room = strip(fs.readFileSync(path.join(SRC, 'screens/profile/ProfileSheet.tsx'), 'utf8'));

  it('the answer is read, never thrown away — the week may legitimately stay as it was', () => {
    // `void app.updateProfileInfo({ equipment … })` is exactly the shape that lost the answer.
    const call = room.slice(room.indexOf('updateProfileInfo({ equipment'));
    expect(call).toContain('.then(');
    expect(/void app\.updateProfileInfo\(\{ equipment[^)]*\)\s*;/.test(room)).toBe(false);
  });

  it('both outcomes have a sentence, and both are translated', () => {
    expect(room).toContain('profile.roomSaved');
    expect(room).toContain('profile.roomKept');
    for (const locale of ['en', 'he']) {
      const copy = JSON.parse(fs.readFileSync(path.join(SRC, `i18n/locales/${locale}.json`), 'utf8')) as {
        profile: Record<string, string>;
      };
      expect({ locale, saved: !!copy.profile.roomSaved, kept: !!copy.profile.roomKept }).toEqual({ locale, saved: true, kept: true });
    }
  });
});
