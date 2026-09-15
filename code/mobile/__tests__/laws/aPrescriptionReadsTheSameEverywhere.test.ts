/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A PRESCRIPTION READS THE SAME WHEREVER IT IS DRAWN — AND ALWAYS IN HER UNITS.
 *
 * ⛔ FOUND 2026-08-26, in the founder's screen-by-screen elevation pass, by putting Today and the
 * Program tab beside each other and reading the same lift on both:
 *
 *     Today          41 kg · 4×8–10
 *     Program        60    · 4×8–10
 *
 * Two surfaces, one row, and the second was silent about what the number was in. Then the worse
 * half: `Row.load` is KILOGRAMS off the plan — `coachPlanRows` spends its `units` argument on
 * distances and passes the load straight through — and the tab printed it raw. **An athlete on
 * pounds read her entire week in kilograms, unlabelled**, on the one screen whose whole job is to
 * list every load she will lift.
 *
 * ── ⚠️ WHY IT HAPPENED, WHICH IS THE PART WORTH A LAW ───────────────────────────────────────────
 * `PlanLifts`'s own header already stated the rule: *"the one place the app decides how a
 * prescription READS — '54 kg · 4×8–10'. The queued card's three headline rows borrow the assembly
 * rather than growing a second one beside it."* Today obeyed it. The Program tab grew a second one
 * beside it — six lines, in its own file, doing 90% of the same job — and nothing noticed, because
 * a second assembly is not a broken one. It is just a different one.
 *
 * ⚠️ AND ITS TEST WAS ASSERTING THE DEFECT: `expect(said).toContain('60 · 4×8–10')`.
 *
 * So the rule is mechanical: there is ONE assembly, every surface that draws a prescription imports
 * it, and no surface may build a load-and-scheme string of its own.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { figureLoad, figureUnit, figureScheme } from '@/components/PlanLifts';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
/** Comments blanked — a law must survive being explained at its own call site. */
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Every surface that draws a lift's load-and-scheme line. A fourth joins this list when built. */
const SURFACES = ['screens/home/HomeView.tsx', 'screens/program/ProgramTab.tsx'];

const lift = (over = {}) => ({ load: 60, sets: 4, band: [8, 10] as [number, number], ...over });

describe('the one assembly says it', () => {
  it('⛔ every surface imports it rather than growing its own', () => {
    for (const f of SURFACES) {
      expect({ f, borrows: /from '@\/components\/PlanLifts'/.test(read(f)) }).toEqual({ f, borrows: true });
    }
  });

  it('⛔ …and none of them builds a load-and-scheme string by hand', () => {
    /*
     * The shape the Program tab had: a template literal joining a load, the middot and the scheme.
     * `PlanLifts` itself is exempt — it IS the assembly.
     */
    const byHand = /\$\{[^}]*load[^}]*\}\s*(·|\\u00b7)/;
    for (const f of SURFACES) {
      expect({ f, rolled: byHand.test(code(read(f))) }).toEqual({ f, rolled: false });
    }
  });
});

describe('and it reads in HER units', () => {
  it('⛔ kilograms are converted, not printed raw', () => {
    /* 60 kg is 132 lb. The defect printed `60` either way. */
    expect(figureLoad(lift(), 'kg')).toBe('60');
    expect(figureLoad(lift(), 'lb')).toBe('132');
  });

  it('⛔ …and the unit is always stated beside the figure', () => {
    expect(figureUnit(lift(), 'kg')).toBe(' kg');
    expect(figureUnit(lift(), 'lb')).toBe(' lb');
  });

  it('⚠️ a bodyweight lift states no unit, because there is no load to state one for', () => {
    expect(figureUnit(lift({ load: null }), 'kg')).toBe('');
    /* …and the scheme then carries no leading separator: "3×8–10", never " · 3×8–10". */
    expect(figureScheme(lift({ load: null }))).toBe('4×8–10');
  });

  it('⚠️ a shape that is not reps-at-a-load says its own thing and no unit', () => {
    /* A hold or a distance arrives pre-formatted in `detail`; a unit beside it would be a second,
       wrong one — `coachPlanRows` has already spent her units on formatting it. */
    expect(figureUnit(lift({ detail: '3×0:45' }), 'lb')).toBe('');
    expect(figureScheme(lift({ detail: '3×0:45' }))).toBe('3×0:45');
  });

  it('⛔ the Program tab cannot be rendered without being told her units', () => {
    /* The prop is REQUIRED. `Row.load` is kilograms, so a view that can be mounted without units is
       a view that can print the wrong number — which is exactly what it did. */
    const src = read('screens/program/ProgramTab.tsx');
    expect(src).toContain("units: 'kg' | 'lb';");
    /* 2026-09-01: the row renders through `FigureCells` (the shared column table); `units` is a
       required prop of it, so the tab still cannot print a load without being told her units. */
    expect(code(src)).toContain('units={units}');
    expect(code(src)).not.toMatch(/units\?:/);
  });
});
