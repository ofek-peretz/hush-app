/**
 * ════ ⛔ A POUND IS LOADABLE (2026-09-30) ════
 *
 * An athlete in pounds was trained on KILOGRAM rungs, converted: 42.5 kg → "94 lb", the empty bar
 * "44 lb", and a set stage asking for **24.5 lb a side** — a load no plates can build. Of the 33
 * barbell rungs from 20 to 100 kg, eight converted to something loadable. And three roads carried a
 * pound figure into a kilogram record as it stood:
 *
 *   · the stage's number pad — 25 lb a side (a 95 lb bar) was written as 95 KILOGRAMS;
 *   · the voice's "harder" — one pound detent (5) added to a kilogram load: two rungs;
 *   · the lock screen — a kilogram figure printed under "lb", stepped by pound detents.
 *
 * `engine/v5/loadGrid` makes the engine walk the kilogram values of POUND rungs for her (45 lb bar,
 * 5 lb steps), so every prescription converts back to a whole, loadable number of pounds. This law
 * holds the rungs, the round trip, and the three roads.
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import i18next from 'i18next';
import { setLoadRoom, incrementOf, barOf, LB_PER_KG } from '@/engine/v5/loadGrid';
import { nextRung, prevRung, snapDown, loadFloor } from '@/engine/v5/grid';
import { emptyBarKg } from '@/engine/loadMath';
import { snapToStock, startingWeight } from '@/domain/startingLoad';
import { displayWeight, kgFromDisplay } from '@/domain/schedule';
import { loadSetup } from '@/domain/loadPresentation';
import { exerciseById } from '@/data/exercises';
import { liveActivityStateFromMirror } from '@/platform/liveActivity';
import { resources } from '@/i18n';
import { MIRROR_SCHEMA_VERSION } from '@/platform/sessionMirror';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

afterEach(() => setLoadRoom('kg'));

/** A barbell total is loadable in pounds when it is the 45 lb bar plus 2.5 lb steps a side. */
function loadableLb(kg: number): boolean {
  const lb = kg * LB_PER_KG;
  const whole = Math.round(lb);
  return Math.abs(lb - whole) < 1e-6 && whole >= 45 && (whole - 45) % 5 === 0;
}

describe('⛔ the rungs are her room’s', () => {
  it('in pounds: the bar is 45, a step is 5, and every rung the engine walks converts to a loadable total', () => {
    setLoadRoom('lb');
    expect(Math.round(barOf('barbell')! * LB_PER_KG)).toBe(45);
    expect(Math.round(emptyBarKg('barbell') * LB_PER_KG)).toBe(45);
    expect(Math.round(loadFloor('barbell') * LB_PER_KG)).toBe(45);
    expect(incrementOf('barbell') * LB_PER_KG).toBeCloseTo(5, 9);
    let load = emptyBarKg('barbell');
    for (let i = 0; i < 40; i++) {
      expect({ i, lb: load * LB_PER_KG, ok: loadableLb(load) }).toEqual({ i, lb: load * LB_PER_KG, ok: true });
      const up = nextRung(load, 'barbell');
      expect(up).toBeGreaterThan(load); // no rung runs backwards
      expect(prevRung(up, 'barbell')).toBeCloseTo(load, 9);
      load = up;
    }
    // …and an ideal that falls between rungs lands ON one
    for (const ideal of [41.3, 57.9, 88.8, 120.4]) expect(loadableLb(snapDown(ideal, 'barbell'))).toBe(true);
  });

  it('the per-side figure the stage prints is always one a pair of real plates builds', () => {
    setLoadRoom('lb');
    const bench = exerciseById('bb_bench_press');
    let load = emptyBarKg('barbell');
    for (let i = 0; i < 30; i++) {
      const setup = loadSetup(bench.id, displayWeight(load, 'lb'), 'lb');
      expect({ i, perSide: setup.perSide, stepped: (setup.perSide * 10) % 25 === 0 }).toEqual({ i, perSide: setup.perSide, stepped: true });
      load = nextRung(load, 'barbell');
    }
  });

  it('the cold-start seed lands on a pound rung too', () => {
    setLoadRoom('lb');
    for (const id of ['bb_bench_press', 'bb_back_squat', 'bb_deadlift', 'bb_row']) {
      const ex = exerciseById(id);
      for (const sex of ['male', 'female'] as const) {
        const kg = startingWeight(ex, { sex, weightKg: 80 });
        if (kg != null) expect({ id, sex, ok: loadableLb(kg) }).toEqual({ id, sex, ok: true });
      }
      expect(loadableLb(snapToStock(61.7, ex))).toBe(true);
    }
  });

  it('in kilograms nothing moved: the 20 kg bar and the 2.5 kg step, bit for bit', () => {
    setLoadRoom('kg');
    expect(emptyBarKg('barbell')).toBe(20);
    expect(incrementOf('barbell')).toBe(2.5);
    expect(nextRung(40, 'barbell')).toBe(42.5);
    expect(snapDown(41.3, 'barbell')).toBe(40);
  });
});

describe('⛔ a pound figure goes back onto the rung it was drawn from', () => {
  it('kgFromDisplay is exact: 95 lb typed is the 95 lb rung, not a hair beside it', () => {
    setLoadRoom('lb');
    const rung = snapDown(43.2, 'barbell'); // the 95 lb rung
    expect(Math.round(rung * LB_PER_KG)).toBe(95);
    expect(kgFromDisplay(95, 'lb')).toBeCloseTo(rung, 9);
    expect(displayWeight(kgFromDisplay(95, 'lb'), 'lb')).toBe(95);
  });
});

describe('⛔ the three roads that carried pounds into a kilogram record', () => {
  it('the stage’s number pad converts what she typed before it writes the set', () => {
    const src = read('screens/session/SessionFlow.tsx');
    const pad = src.slice(src.indexOf('const onPadKey'), src.indexOf('const openField'));
    expect(pad).toMatch(/editCurrentSet\(\{ weight: kgFromDisplay\(total, units\)/);
  });

  it('the voice steps a load by a detent converted to kilograms', () => {
    const src = read('platform/voice/voiceConductor.ts');
    expect(src).toMatch(/const step = kgFromDisplay\(weightStepFor\(l\.units, exo\.equipment\), l\.units\)/);
    expect(src).not.toMatch(/loadKg \+ weightStepFor\(/);
  });

  it('the lock screen prints her units, and the figure it hands back is converted to kilograms', async () => {
    if (!i18next.isInitialized) await i18next.init({ resources, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false } });
    setLoadRoom('lb');
    const rung = snapDown(43.2, 'barbell');
    const mirror = {
      schema: MIRROR_SCHEMA_VERSION, phase: 'active_set', workoutName: 'Upper A', exerciseName: 'Bench', setLabel: '',
      setNumber: 1, setsInExercise: 3, liftIndex: 1, liftCount: 5, globalIndex: 0, totalSets: 15,
      targetWeight: rung, targetReps: 8, restEndsAt: null, restRemainingS: null, restTotalS: 90,
      nextExerciseName: null, nextTargetWeight: null, nextTargetReps: null, completedExerciseName: null, canMarkBusy: false,
    };
    const lock = {
      restAfterS: 90, lastSetOfSession: false, nextSetLabel: '', nextSetIndex: 2, nextSetCount: 3, alertTitle: '', alertBody: '',
      words: { rest: 'Rest', next: 'Next up', paused: 'Paused', logged: 'Logged', done: 'Done', addRest: '+15 s', start: 'Next set', reps: 'reps', ready: 'Ready', bodyweight: 'BW' },
      awaitingReady: false, unitLabel: 'lb', weightStep: 5,
    };
    expect(liveActivityStateFromMirror(mirror, lock).targetWeight).toBe(95);
    expect(liveActivityStateFromMirror(mirror, { ...lock, unitLabel: 'kg', weightStep: 2.5 }).targetWeight).toBe(rung);
    const store = read('state/stores/sessionStore.tsx');
    expect(store).toMatch(/weight: i\.weight == null \? null : kgFromDisplay\(i\.weight, lockUnits\)/);
  });
});

describe('⛔ the room is set in one place, from her profile', () => {
  it('the app store and the week’s producer set it; nothing else does', () => {
    const setters = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /setLoadRoom\(/.test(fs.readFileSync(p, 'utf8')) && !p.endsWith('loadGrid.ts')) {
          setters.push(path.relative(SRC, p).split(path.sep).join('/'));
        }
      }
    };
    walk(SRC);
    expect(setters.sort()).toEqual(['data/api/fixtureModel.ts', 'state/stores/appStore.tsx']);
  });
});
