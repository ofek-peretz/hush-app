/**
 * ONLY V5 IS IN THE ENGINE.
 *
 * Founder, 2026-07-21: *"The V5 engine document is the only source of truth. Everything that isn't
 * in it, throw out. I was sure we deleted V4 — I don't know how this crept back into the code."*
 *
 * It crept back the ordinary way: `src/engine/v4/` was deleted, but v4 INPUTS kept living in the
 * layer that calls the engine, because nothing failed when they did. Every one of these multiplied a
 * real prescription and none of them appears anywhere in
 * `docs/canonical/ENGINE_V5_SITUATION_REGISTER.md`:
 *
 *   · **`experience`** — a self-report scaling every cold-start load by 0.78 / 1.00 / 1.22. Part 9 §A
 *     deletes it *"from onboarding, Settings, and the profile's decision path."* It had been taken
 *     off the onboarding SCREEN and left in the decision path, so every new athlete silently fell to
 *     the `beginner` default and had her day-one loads cut by 22%.
 *   · **`age`** — a per-decade cold-start multiplier down to 0.80, plus a −1 set penalty at 65+.
 *     B-1 says the cold start reads *"her sex + bodyweight"*; S-42 already refuses the neighbouring
 *     guess in as many words ("She changes height. **Nothing.**").
 *   · **`goal`** — a fork on a self-reported goal. Part 5: *"the goal fork… there is one goal:
 *     hypertrophy."*
 *   · **the weekly VOLUME lever** (`low`/`moderate`/`high`) — ±1 set on every exercise, by
 *     declaration. Loop 3 earns and cuts volume from FACTS (S-32/S-34) starting from B-2; a dial
 *     that sets it by hand is the opposite of that.
 *   · **`MAX_SETS = 4`** — a second ceiling fighting F-1's [3, 5], while `distributeMuscleSets` was
 *     already handing a grown muscle 5.
 *   · **`engineSlotId` / `canonicalEngineId`** — slot keys in an engine whose Loop 2 says *"State is
 *     keyed to the exercise, never to a slot"*, feeding a unification hack S-29 explicitly deletes.
 *   · **the calendar "week 1 is silent" gate** — L7 has no weekly boundary and Part 1 bans
 *     "calendar-driven anything".
 *
 * This file is the tripwire. It does not test behaviour; it asserts that these inputs cannot reach a
 * decision again, which is the only thing that kept them alive the first time.
 */
import { EXERCISES, exerciseById } from '@/data/exercises';
import { startingWeight } from '@/domain/startingLoad';
import { SETS_MIN, SETS_MAX } from '@/engine/v5/constants';
import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import type { Profile } from '@/data/local/models';
import * as fs from 'fs';
import * as path from 'path';

const base: Profile = { units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, repBand: '8-10' };

beforeEach(async () => { await db.clearAll(); });

describe('B-1 · the cold start reads her sex and her bodyweight, and nothing else', () => {
  const loaded = EXERCISES.filter((e) => !e.bodyweight && e.baseKg != null);

  it('a self-reported EXPERIENCE cannot change a single starting load', () => {
    for (const ex of loaded) {
      const beginner = startingWeight(ex, { sex: 'female', weightKg: 60, experience: 'beginner' } as never);
      const advanced = startingWeight(ex, { sex: 'female', weightKg: 60, experience: 'advanced' } as never);
      expect({ id: ex.id, kg: advanced }).toEqual({ id: ex.id, kg: beginner });
    }
  });

  it('AGE cannot change a single starting load', () => {
    for (const ex of loaded) {
      const young = startingWeight(ex, { sex: 'male', weightKg: 80, age: 22 } as never);
      const old = startingWeight(ex, { sex: 'male', weightKg: 80, age: 78 } as never);
      expect({ id: ex.id, kg: old }).toEqual({ id: ex.id, kg: young });
    }
  });

  it('her sex and her bodyweight DO — the two facts B-1 names', () => {
    const ex = exerciseById('bb_bench_press')!;
    expect(startingWeight(ex, { sex: 'female', weightKg: 75 })).not.toBe(startingWeight(ex, { sex: 'male', weightKg: 75 }));
    const light = startingWeight(ex, { sex: 'male', weightKg: 55 })!;
    const heavy = startingWeight(ex, { sex: 'male', weightKg: 110 })!;
    expect(heavy).toBeGreaterThanOrEqual(light);
  });
});

describe('the programme is not shaped by any v4 declaration', () => {
  it('a declared GOAL changes nothing — there is one goal (Part 5)', async () => {
    const a = await fixtureModel.generateProgram({ ...base, goal: 'build_muscle' });
    await db.clearAll();
    const b = await fixtureModel.generateProgram({ ...base, goal: 'lose_fat' as never });
    expect(shape(b)).toEqual(shape(a));
  });

  it('AGE changes no set count (S-42 refuses the same class of guess)', async () => {
    const young = await fixtureModel.generateProgram({ ...base, age: 25 });
    await db.clearAll();
    const old = await fixtureModel.generateProgram({ ...base, age: 72 });
    expect(shape(old)).toEqual(shape(young));
  });

  it('there is no weekly VOLUME lever left to pull', async () => {
    const p = await fixtureModel.generateProgram({ ...base, volume: 'high' } as never);
    await db.clearAll();
    const q = await fixtureModel.generateProgram({ ...base, volume: 'low' } as never);
    expect(shape(q)).toEqual(shape(p));
  });

  it('every set count sits inside F-1 [3, 5] — the register names ONE ceiling', async () => {
    for (const days of [2, 3, 4, 5, 6]) {
      await db.clearAll();
      const p = await fixtureModel.generateProgram({ ...base, daysPerWeek: days });
      for (const d of p.days) for (const s of d.slots) {
        expect(s.setCount).toBeGreaterThanOrEqual(SETS_MIN);
        expect(s.setCount).toBeLessThanOrEqual(SETS_MAX);
      }
    }
  });

  it('no slot carries a slot key — v5 is exercise-keyed (Loop 2 / S-29)', async () => {
    const p = await fixtureModel.generateProgram(base);
    expect(p.days.every((d) => d.slots.every((s) => s.engineSlotId == null))).toBe(true);
  });
});

const shape = (p: { days: { name: string; slots: { exerciseId: string; setCount: number }[] }[] }) =>
  p.days.map((d) => ({ name: d.name, slots: d.slots.map((s) => `${s.exerciseId}x${s.setCount}`) }));

describe('the source itself carries no v4 decision input', () => {
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
  /** The file with its comments stripped — a comment may NAME a removed thing to record why it went,
   *  and that record is the point. Only executable lines are searched for a v4 input. */
  const code = (rel: string) =>
    src(rel)
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');

  it('the cold-start load never reads experience or age', () => {
    const c = code('domain/startingLoad.ts');
    expect(c).not.toMatch(/profile\.(experience|age)/);
    expect(c).not.toMatch(/EXP_FACTOR|ageLoadFactor/);
  });

  it('the model never forks on a goal or a declared volume', () => {
    const c = code('data/api/fixtureModel.ts');
    expect(c).not.toMatch(/WeeklyVolume|profile\.volume/);
    expect(c).not.toMatch(/goal ===|goal:\s*Goal/);
    expect(c).not.toMatch(/canonicalEngineId|engineSlotId/);
    expect(c).not.toMatch(/displayWeekNumber/); // no calendar gate on what the engine says
  });

  it('every declared constant has exactly ONE home — F-2, B-6 and the bar are not written twice', () => {
    // Two copies of a declared number are two chances to disagree about the same athlete. `loadMath`
    // used to carry its own `LOAD_INCREMENT` (a second B-6) and its own grid snap with a tolerance
    // rule `engine/v5/grid` did not share (a second F-2), and it held `BAR_KG` while the grid
    // imported it back — a cycle. All three now have one declaration in `engine/v5/constants`.
    const loadMath = src('engine/loadMath.ts');
    const loadMathCode = code('engine/loadMath.ts'); // comments explain the history; code must be clean
    expect(loadMath).toMatch(/export const LOAD_INCREMENT = STARTING_INCREMENT/);
    expect(loadMathCode).not.toMatch(/GRID_SNAP_TOLERANCE_KG/);
    expect(loadMathCode).not.toMatch(/export const BAR_KG = /);
    expect(src('engine/v5/constants.ts')).toMatch(/export const BAR_KG = 20;/);
    // …and `engine/v5/grid` no longer reaches back into loadMath for it (no import cycle).
    expect(src('engine/v5/grid.ts')).not.toMatch(/from '@\/engine\/loadMath'/);
  });

  it('B-4 is replaced by BOTH facts it names — her rest AND her set durations', () => {
    // B-4: "Replaced by her measured rest (built, Stage 0) AND HER SET DURATIONS (timestamps)."
    // Only the rest half was wired; a fixed SET_EXEC_SECONDS stood in for the other.
    const model = src('data/api/fixtureModel.ts');
    expect(model).toMatch(/learnedExecS/);
    expect(model).toMatch(/execSecFor/);
    expect(src('engine/v5/timeBudget.ts')).toMatch(/export function learnedExecS/);
  });

  it('THERE IS NO PIN — the word survives only as history, the state is a learned leave-it', () => {
    // Founder, 2026-07-21: "there is no PIN any more, the engine learns from the SWAP at K=2."
    for (const f of ['data/local/db.ts', 'engine/v5/programAssembly.ts', 'domain/swapLearning.ts']) {
      const code = src(f).split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');
      expect({ file: f, hasPinState: /pinsByMuscle|pinnedByMuscle/.test(code) }).toEqual({ file: f, hasPinState: false });
    }
  });
});
