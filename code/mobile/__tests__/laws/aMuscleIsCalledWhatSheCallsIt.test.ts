/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A MUSCLE IS CALLED WHAT SHE CALLS IT — not what the engine files it under.
 *
 * ⛔ The English `muscle` block was written INVERTED: the keys were the names and the values were
 * the internal ids.
 *
 *     "muscle": { "Chest": "chest", "Shoulders": "shoulder", "Quads": "quad", "Glutes": "glute" }
 *
 * `CANONICAL_MUSCLE_ORDER` holds `'Chest'`, `'Quads'`, so the lookup HIT and returned the token.
 * Every muscle name in the English build was an engine id — on the body map, in "why is this here",
 * in Home's line for today, in the pain ask, in the import review, in a lift's "also works", and in
 * the copy pack sent to the wrist. The Hebrew block was translated properly, so nothing looked
 * broken to anyone reading Hebrew, and no test could see it: they all compared `tg('muscle.Chest')`
 * to itself.
 *
 * These are the two things that were never asserted: that every muscle she can meet HAS a name in
 * both languages, and that the English one is a name rather than a token.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';

const load = (locale: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n', 'locales', `${locale}.json`), 'utf8'));

const en = load('en');
const he = load('he');

describe('a muscle is called what she calls it', () => {
  it('every muscle the engine can name has a name in both languages', () => {
    for (const m of CANONICAL_MUSCLE_ORDER) {
      expect(typeof en.muscle?.[m]).toBe('string');
      expect(typeof he.muscle?.[m]).toBe('string');
    }
  });

  it('and carries no name for a muscle that does not exist', () => {
    for (const k of Object.keys(en.muscle)) expect(CANONICAL_MUSCLE_ORDER).toContain(k);
    for (const k of Object.keys(he.muscle)) expect(CANONICAL_MUSCLE_ORDER).toContain(k);
  });

  /**
   * ⛔ THE ONE THAT WOULD HAVE CAUGHT IT. A display name is capitalised; `"quad"`, `"glute"`,
   * `"hamstring"` and `"shoulder"` are not names, they are the ids they were copied from.
   */
  it('says a NAME in English, never the engine token underneath it', () => {
    for (const m of CANONICAL_MUSCLE_ORDER) {
      // The canonical name IS the English name — "Quads", not "quad". Anything else here is the
      // id leaking through: `"quad"`, `"glute"`, `"hamstring"`, `"shoulder"`.
      expect(en.muscle[m]).toBe(m);
    }
  });

  it('and says something Hebrew in Hebrew', () => {
    for (const m of CANONICAL_MUSCLE_ORDER) expect(he.muscle[m]).toMatch(/[֐-׿]/);
  });
});

describe('and the harness cannot invent one', () => {
  /*
   * ⛔ IT DID (2026-08-28). `11.4`'s share card drew `כתפיים · Arms · גב` — one English word among
   * Hebrew ones, on the card she sends to another person. `Arms` is not in `CANONICAL_MUSCLE_ORDER`
   * and never has been; the gallery invented it, and `muscleGroupsLabel` did the right thing with an
   * unknown group (`defaultValue: m`, so it is VISIBLE rather than blank) and printed the token.
   *
   * ⚠️ THE LAW ABOVE GUARDS THE PRODUCT AND STOPPED AT THE HARNESS. Every locale key is a canonical
   * muscle and every canonical muscle has a key — both directions, airtight — and a fixture that
   * hands the screen a string from neither list walks straight past it. The gallery is where these
   * screens are JUDGED, so a muscle it can name and the product cannot is a review of a different
   * app.
   */
  it('⛔ the harness may not invent a muscle the engine cannot file', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'screens', 'dev', 'gallery.tsx'), 'utf8');
    const named = [...src.matchAll(/(?:muscle|muscleGroups):\s*(?:'([A-Z][a-zA-Z]*)'|\[([^\]]*)\])/g)]
      .flatMap((m) => (m[1] ? [m[1]] : (m[2] ?? '').split(',').map((x) => x.trim().replace(/'/g, ''))))
      .filter((x) => /^[A-Z][a-zA-Z]*$/.test(x));
    expect(named.length).toBeGreaterThan(0); // the guard on the guard — the regex still parses
    expect(named.filter((m) => !CANONICAL_MUSCLE_ORDER.includes(m))).toEqual([]);
  });
});
