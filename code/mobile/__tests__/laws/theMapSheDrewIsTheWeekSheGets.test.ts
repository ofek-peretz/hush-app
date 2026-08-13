/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE MAP SHE DREW IS THE WEEK SHE GETS — including when she says no to half her body.
 *
 * ⛔ FOUNDER, 2026-08-12: *"אם יש לנו משתמש שלא רוצה לאמן רגליים בכלל, יש לנו אפשרות כזאת כאן?
 * נשמע שעשית את זה מאוד מוגבל וטיפש."*
 *
 * The answer is yes and it works — and checking it found two things that were not fine, both at the
 * extremes nobody had swept:
 *
 *   · EVERYTHING off → the engine handed back a full-body week training every muscle she had just
 *     switched off. A "safety net" in `generateProgram` re-ran the assembler with NO body map, and
 *     the comment above it said the case was unreachable. It was reachable from the profile editor.
 *   · ONE muscle on → 25-minute sessions against the hour she asked for, in silence.
 *
 * Both are the same failure: the engine deciding something about her week and not saying so.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { muscleOf } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER, SESSION_MIN, SESSION_MAX } from '@/engine/v5/constants';

const athlete = (over = {}) => ({
  id: 'p1',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
  ...over,
});

const build = (over = {}) => fixtureModel.generateProgram(athlete(over));
const work = (p) => p.days.filter((d) => !d.isRest);
const offAll = (...muscles) => Object.fromEntries(muscles.map((m) => [m, 'off']));

const LEGS = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];

describe('⛔ a whole region switched off', () => {
  it('⛔ NO LEG WORK APPEARS ANYWHERE — at every frequency she can choose', async () => {
    /*
     * S-2, at its strongest. An `off` muscle never appears — not as a primary, not smuggled in as
     * "it is a compound so it counts". She said no.
     */
    const leaked: string[] = [];
    for (const days of [2, 3, 4, 5, 6])
      for (const sex of ['male', 'female']) {
        const p = await build({ daysPerWeek: days, sex, bodyMap: offAll(...LEGS) });
        for (const d of work(p))
          for (const s of d.slots) if (LEGS.includes(muscleOf(s.exerciseId))) leaked.push(`${sex} ${days}d ${d.name}: ${s.exerciseId}`);
      }
    expect(leaked).toEqual([]);
  });

  it('⛔ …and she still gets a REAL week, not the leftovers', async () => {
    /*
     * The half that matters as much: refusing legs must not quietly cost her the hour. The week
     * RESHAPES — Upper A…E instead of Upper/Lower — because structure is an output of volume, and
     * nothing about that shape is templated.
     */
    const bad: string[] = [];
    for (const days of [3, 4, 5]) {
      const p = await build({ daysPerWeek: days, bodyMap: offAll(...LEGS) });
      expect(work(p)).toHaveLength(days);
      for (const d of work(p)) {
        const mins = estimateSessionMinutes(d);
        if (mins < SESSION_MIN || mins > SESSION_MAX) bad.push(`${days}d ${d.name}: ~${mins.toFixed(0)} min`);
        if (d.slots.length < 4) bad.push(`${days}d ${d.name}: only ${d.slots.length} lifts`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the upper body is trained twice a week or more — the frequency the split exists to protect', async () => {
    const p = await build({ daysPerWeek: 4, bodyMap: offAll(...LEGS) });
    const days = {};
    for (const d of work(p)) for (const m of new Set(d.slots.map((s) => muscleOf(s.exerciseId)))) days[m] = (days[m] ?? 0) + 1;
    for (const [m, n] of Object.entries(days)) if (m !== 'Core') expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe('⛔ the extremes the sweeps never reached', () => {
  it('⛔ EVERYTHING OFF YIELDS NO WORKOUT (S-3) — it does not invent one', async () => {
    /*
     * ⛔ THE DEFECT, STATED. `generateProgram` re-ran the assembler with NO body map when the first
     * pass came back empty, so switching off all ten muscles produced three full-body days of seven
     * lifts — every muscle she had just refused, trained. The body map's whole purpose is that an
     * off muscle never appears; a net that discards the map to avoid an empty result is the engine
     * overruling her in silence, which is the one thing this product is built not to do.
     */
    const p = await build({ daysPerWeek: 3, bodyMap: offAll(...CANONICAL_MUSCLE_ORDER) });
    expect(work(p)).toEqual([]);
  });

  it('…and the net still catches a map that SHOULD build and did not', async () => {
    // The net was not deleted, only scoped. A map with something on that yields nothing is a defect
    // in the assembler, not a decision of hers, and a blank week would be the wrong answer to it.
    const p = await build({ daysPerWeek: 3, bodyMap: {} });
    expect(work(p).length).toBeGreaterThan(0);
  });

  it('⛔ a map that cannot FILL her hour says so — the mirror of `overBudget`', async () => {
    /*
     * One muscle left on. The chest owns nine lifts, F-1 caps a block at five sets, and a day may
     * not repeat a movement — so 25 minutes is the honest maximum and no arrangement beats it. The
     * week is correct AND it is not the week she thinks she asked for, so the day carries the
     * verdict and the card prints a sentence from it.
     */
    const only = offAll(...CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Chest'));
    const p = await build({ daysPerWeek: 3, bodyMap: only });
    const days = work(p);
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      expect(estimateSessionMinutes(d)).toBeLessThan(SESSION_MIN);
      expect(d.shortOfBudget).toBe(true); // ⛔ the fact she is owed
      expect(d.overBudget).toBeUndefined();
    }
  });

  it('⛔ an ORDINARY week never wears that flag — a note on every card is a note she stops reading', async () => {
    const quiet: string[] = [];
    for (const days of [3, 4, 5, 6])
      for (const sex of ['male', 'female'])
        for (const bodyMap of [{}, { Back: 'emphasis' }, { Calves: 'off', Core: 'off' }]) {
          const p = await build({ daysPerWeek: days, sex, bodyMap });
          for (const d of work(p)) if (d.shortOfBudget) quiet.push(`${sex} ${days}d ${d.name}: ~${estimateSessionMinutes(d).toFixed(0)} min`);
        }
    expect(quiet).toEqual([]);
  });

  it('⛔ …and it FIRED on a case nobody had looked at, which is what it is for', async () => {
    /*
     * ⛔ FOUND BY THE FLAG, ON ITS FIRST RUN, 2026-08-12. The first draft of the test above swept
     * legs-off among the ordinary maps and went red:
     *
     *     male 6d Upper E: ~35 min      female 6d Upper E: ~35 min
     *     male 6d Upper F: ~35 min      female 6d Upper F: ~35 min
     *
     * Half her upper body's week, twice. Refusing legs at THREE, FOUR and FIVE days fills every
     * session (asserted above); at SIX it cannot — the upper body does not own enough distinct work
     * to fill six hours without repeating a movement inside a day, which F-1 and the clash rule both
     * forbid. The engine is right and the week is the best one available.
     *
     * ⚠️ THE POINT IS THAT SHE IS TOLD. Before this flag she would have trained a 35-minute session
     * on a day she had set aside an hour for, six times a week, with nothing anywhere saying why —
     * and the remedy is entirely hers: train five days instead of six, or put a muscle back on.
     */
    const p = await build({ daysPerWeek: 6, bodyMap: offAll(...LEGS) });
    const short = work(p).filter((d) => d.shortOfBudget);
    expect(short.length).toBeGreaterThan(0);
    for (const d of short) expect(estimateSessionMinutes(d)).toBeLessThan(SESSION_MIN);
    // …and the sessions that DO fill their hour are not flagged alongside them.
    expect(work(p).filter((d) => !d.shortOfBudget).length).toBeGreaterThan(0);
  });

  it('⛔ THE CHAIN — the flag is worthless if no screen prints it', () => {
    /*
     * `overBudget` has existed since 2026-07-21 and was read by NOTHING but telemetry — the TODO on
     * it says so in `fixtureModel`. A second flag with the same fate would be worse than none, so
     * the wiring is asserted rather than assumed.
     */
    const fs = require('fs');
    const path = require('path');
    const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', p), 'utf8');

    const screen = src('screens/plan/PreWorkoutScreen.tsx');
    expect(screen).toContain('shortOfBudget');
    expect(screen).toContain('overBudget');
    expect(screen).toContain('budgetNote');
    expect(src('screens/plan/PreWorkout.tsx')).toContain('props.budgetNote');

    // …and the profile editor closes the door the engine no longer papers over.
    const editor = src('screens/profile/BodyMapEdit.tsx');
    expect(editor).toContain('nothingOn');
    expect(editor).toMatch(/disabled=\{!touched \|\| busy \|\| nothingOn\}/);
  });
});
