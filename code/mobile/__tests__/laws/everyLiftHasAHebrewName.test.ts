/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A LIFT IS CALLED WHAT SHE CALLS IT.
 *
 * ⛔ FOUNDER, 2026-08-21, photographing the workout stage: the muscle above the lift read
 * **"יד אחורית"** and the lift itself read **"Triceps Pushdown"**.
 *
 * Every exercise name in the product was an English string literal in `data/exercises.ts`, and
 * `he.json` had no `exercise` namespace at all — so the app conjugated its verbs by gender, linted
 * its copy for voice, refused to let mono carry a Hebrew word, and then printed the 114 words the
 * athlete actually reads under a bar in a language she did not choose.
 *
 * ── THE SPLIT THIS PINS ─────────────────────────────────────────────────────────────────────────
 * The catalogue keeps its English `name` because that field is DATA: `domain/importedPlan` matches a
 * photographed plan's raw text against it, and `domain/importPrompt` sends it to the coach.
 * Translating the field would have broken an import and misnamed a lift to the model that prescribes
 * it. The locale holds the spoken name; `exerciseDisplayName` is the only door between them.
 *
 * ⚠️ SO THE SECOND TEST MATTERS AS MUCH AS THE FIRST. `x?.name ?? exerciseDisplayName(id)` reads like
 * a safe fallback and is in fact a bypass — the catalogue always answers, so the locale never gets
 * asked. Five of those on the workout stage are what the founder photographed.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/**
 * Block-comment bodies blanked, newlines kept so line-by-line scans stay aligned. Line comments are
 * left alone — this repo declares verified exceptions in them. See the note at the walk below.
 */
const noComments = (src: string) => {
  let inBlock = false;
  return src
    .split('\n')
    .map((line) => {
      const opens = line.includes('/*');
      const closes = line.includes('*/');
      const was = inBlock;
      if (opens && !closes) inBlock = true;
      else if (closes) inBlock = false;
      return was || opens ? '' : line;
    })
    .join('\n');
};
const CATALOGUE = [...read('src/data/exercises.ts').matchAll(/\{ id: '([^']+)', name: '([^']+)'/g)];
/**
 * ⛔ AND THE OTHER HALF OF THE CATALOGUE WAS NEVER ASKED (2026-08-27).
 *
 * This law read `exercises.ts` and nothing else, so the 26 MOVEMENTS — every cardio machine, every
 * hold, every carry — sat outside it and went on answering in English for six days after the fix
 * that was supposed to end that. `2.2f` and `2.2q` drew a Hebrew set stage titled **Plank** the
 * whole time, in the gallery, in front of anyone who opened it.
 *
 * A law that guards one list and not the list beside it is the shape this repo keeps finding: not
 * wrong, just not asked. Both lists, one rule.
 */
const MOVEMENTS = [...read('src/data/movements.ts').matchAll(/\{ id: '([^']+)', name: '([^']+)'/g)];

describe('a lift is called what she calls it', () => {
  it('every exercise in the catalogue has a name in both languages', () => {
    expect(CATALOGUE.length).toBeGreaterThan(100); // the guard on the guard — the regex still parses
    const missing = { en: [] as string[], he: [] as string[] };
    for (const [, id] of CATALOGUE) {
      if (!en.exercise?.[id]) missing.en.push(id);
      if (!he.exercise?.[id]) missing.he.push(id);
    }
    expect(missing).toEqual({ en: [], he: [] });
  });

  /**
   * ⛔ AND THE HEBREW IS HEBREW. A missing translation copied from the English column passes the test
   * above and fails the athlete — this is the same trap `aMuscleIsCalledWhatSheCallsIt` guards for
   * muscles. Latin letters in a Hebrew exercise name are allowed only where the gym itself says them
   * (a brand of machine), so the rule is: it must contain Hebrew, not that it contains nothing else.
   */
  it('the Hebrew column is actually in Hebrew', () => {
    const notHebrew = CATALOGUE.map(([, id]) => id).filter((id) => !/[֐-׿]/.test(he.exercise[id]));
    expect(notHebrew).toEqual([]);
  });

  it('⛔ …and every MOVEMENT has one too — the half this law used not to read', () => {
    expect(MOVEMENTS.length).toBeGreaterThan(20); // the guard on the guard
    const missing = { en: [] as string[], he: [] as string[] };
    for (const [, id] of MOVEMENTS) {
      if (!en.movement?.[id]) missing.en.push(id);
      if (!he.movement?.[id]) missing.he.push(id);
    }
    expect(missing).toEqual({ en: [], he: [] });
  });

  it('⛔ …and that Hebrew is Hebrew', () => {
    const notHebrew = MOVEMENTS.map(([, id]) => id).filter((id) => !/[֐-׿]/.test(he.movement[id]));
    expect(notHebrew).toEqual([]);
  });

  it('⚠️ and the display door is the ONLY way a movement name reaches a screen', () => {
    /* `return move.name` was the bypass — it read like the catalogue answering and was in fact the
       locale never being asked. If it comes back, this fails. */
    const src = read('src/data/exercises.ts');
    expect(src).toContain('`movement.${move.id}`');
    expect(src).not.toMatch(/if \(move\) return move\.name;/);
  });

  /**
   * The catalogue's English name stays put, because two other systems read it as data.
   */
  it('keeps the catalogue name in English for the import matcher and the coach prompt', () => {
    const hebrewInCatalogue = CATALOGUE.filter(([, , name]) => /[֐-׿]/.test(name));
    expect(hebrewInCatalogue).toEqual([]);
    expect(read('src/domain/importedPlan.ts')).toMatch(/ex\.name\.toLowerCase\(\)/);
  });

  /**
   * ⛔ NO BYPASS. Reaching the catalogue's field first means the locale is never consulted.
   */
  it('no screen reaches past the display path to the raw catalogue name', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          /*
           * ⛔ THE LAW WAS READING ITS OWN DOCUMENTATION (2026-08-27).
           *
           * The `movementById(...).name` widening below flagged, on its first run, the COMMENT in
           * `Cardio.tsx` that explains the bypass being removed — prose quoting the shape it was
           * written to forbid. `lint-rtl` grew the same fault the same day and it is worth stating
           * once for both: in a codebase where every fix ships with a note that quotes the broken
           * code, a text-matching checker gets louder the more carefully the work is explained, and
           * a checker that punishes explanation is one people learn to switch off.
           */
          for (const line of noComments(read(rel)).split('\n')) {
            /*
             * ⚠️ WIDENED 2026-08-23: the fallback pattern was only half the bypass class. The
             * library rendered `bidi(e.name)` DIRECTLY — no fallback, no `exerciseDisplayName`
             * anywhere on the line — and the sweep walked past it while a Hebrew athlete read
             * "Incline Machine Press" under a Hebrew heading. A first widening to every `bidi(<x>.name)`
             * over-matched immediately — `w.name` is a workout, `d.name` arrives pre-resolved — a
             * line regex cannot see provenance. What it CAN see is the convention: every loop over
             * a catalogue pool in this codebase binds `e` (`libraryPool(m)`, `EXERCISES`,
             * `exercisesForMuscle`), so a rendered `e.name` is a catalogue name by convention, and
             * the convention is now the law. A future counter-example renames its variable and
             * says why, or better, resolves the name.
             */
            /*
             * ⚠️ WIDENED AGAIN 2026-08-27: `movementById(id)!.name`, on the LIVE RUN STAGE. Not a
             * fallback and not an `e.name` loop — a direct read of the catalogue field, handed
             * straight to the screen as the run's title. So a Hebrew athlete's prescribed run
             * announced itself `Run`, `Treadmill Run`, `Rowing Machine`, for as long as the
             * movements had no locale column to be asked for.
             *
             * The shape is what the header calls it: a bypass. `movementById` is a DATA lookup —
             * `planShare` uses it to ask whether an id exists at all — and the moment its `.name`
             * reaches a component, the display path has been walked around.
             */
            if (/\?\.name \?\? exerciseDisplayName|\.name \?\? exerciseDisplayName|bidi\(e\.name\)|movementById\([^)]*\)!?\??\.name/.test(line)) {
              offenders.push(`${rel}: ${line.trim()}`);
            }
          }
        }
      }
    };
    walk('src/screens');
    walk('src/components');
    /* ⛔ ADDED 2026-08-27. `coachWeek` held `movementName.get(ex) ?? exerciseDisplayName(ex)` — the
       bypass this law's own header quotes — one directory behind both walked trees, feeding them
       both. A law that guards the leaves and not the branch guards nothing. */
    walk('src/domain');
    expect(offenders).toEqual([]);
  });
});
