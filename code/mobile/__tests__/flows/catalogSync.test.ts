/**
 * Catalog ↔ engine synchronization (founder-directed 2026-06-23). Machine-enforces the
 * five per-exercise consistency questions so the catalog can never silently drift from the
 * generator again:
 *   1. connected to a capability      2. selectable in generation (or explicitly swapOnly)
 *   3. selectable as a swap           4. has progression logic
 *   5. has a backup alternative
 * Plus the supplemental-core product rules (1/week · 3 sets · last · upper-preferred).
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import {
  EXERCISES,
  exerciseById,
  exercisesForMuscle,
  isSwapOnly,
  SWAP_ONLY_IDS,
  progressionRule,
  defaultBackup,
  catalogIdFromEngine,
  engineIdFromCatalog,
  LOAD_STEP_KG,
} from '@/data/exercises';
import type { Capability, Profile } from '@/data/local/models';

const CAPS: Capability[] = [
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'knee_dominant', 'hip_dominant',
];
const profile = (over: Partial<Profile>): Profile => ({
  units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, ...over,
});

/** Every exercise id that appears in ANY generated program (all sexes × all frequencies). */
async function allGeneratedIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const sex of ['male', 'female'] as const) {
    for (let days = 1; days <= 6; days++) {
      const prog = await fixtureModel.generateProgram(profile({ sex, daysPerWeek: days }));
      for (const d of prog.days) for (const s of d.slots) ids.add(s.exerciseId);
    }
  }
  return ids;
}

describe('Q1 — every exercise is connected to a capability', () => {
  it('all catalog entries carry a valid capability', () => {
    for (const e of EXERCISES) expect(CAPS).toContain(e.capability);
  });
});

describe('Q2/Q3 — reachability: generated OR swap-only, and always swap-reachable', () => {
  it('every non-swapOnly exercise is reachable through program generation', async () => {
    const generated = await allGeneratedIds();
    const orphans = EXERCISES.filter((e) => !isSwapOnly(e.id) && !generated.has(e.id)).map((e) => e.id);
    expect(orphans).toEqual([]);
  });

  it('every swapOnly id exists and is NOT emitted by generation', async () => {
    const generated = await allGeneratedIds();
    for (const id of SWAP_ONLY_IDS) {
      expect(exerciseById(id)).toBeTruthy();
      expect(generated.has(id)).toBe(false);
    }
  });

  it('every exercise is reachable as a muscle-scoped swap (pool ≥ 2, same capability)', () => {
    for (const e of EXERCISES) {
      const pool = exercisesForMuscle(e.muscle);
      expect(pool.length).toBeGreaterThanOrEqual(2);
      for (const alt of pool) expect(alt.capability).toBe(e.capability); // capability contract holds
    }
  });
});

describe('Q4 — every exercise has equipment-aware progression logic', () => {
  it('weighted lifts step by a real, loadable, equipment-specific increment', () => {
    for (const e of EXERCISES) {
      const rule = progressionRule(e.id);
      if (e.bodyweight || e.equipment === 'bodyweight') {
        expect(rule.mode).toBe('reps');
        expect(rule.repCeiling).toBeGreaterThan(0);
        if (rule.harder) expect(exerciseById(rule.harder)).toBeTruthy(); // graduation target is real
      } else {
        expect(rule.mode).toBe('load');
        expect(rule.loadStepKg).toBe(LOAD_STEP_KG[e.equipment]);
        expect(rule.loadStepKg).toBeGreaterThan(0);
      }
    }
  });

  it('increments are equipment-aware, not a single global step', () => {
    expect(LOAD_STEP_KG.barbell).not.toBe(LOAD_STEP_KG.dumbbell);
    expect(LOAD_STEP_KG.machine).not.toBe(LOAD_STEP_KG.barbell);
  });
});

describe('Q5 — every exercise has a backup alternative', () => {
  it('defaultBackup returns a distinct same-muscle (same-capability) exercise', () => {
    for (const e of EXERCISES) {
      const backup = defaultBackup(e.id);
      expect(backup).toBeTruthy();
      expect(backup!.id).not.toBe(e.id);
      expect(backup!.muscle).toBe(e.muscle);
      expect(backup!.capability).toBe(e.capability);
    }
  });
});

describe('engine ↔ catalog id reconciliation', () => {
  // The frozen Python engine catalog (implementation/sprint3b1/catalog.py).
  const ENGINE_IDS = [
    'bench_press', 'db_bench_press', 'barbell_row', 'db_row', 'overhead_press',
    'db_shoulder_press', 'back_squat', 'leg_press', 'deadlift', 'romanian_deadlift',
  ];
  it('every engine id resolves to a real catalog exercise', () => {
    for (const id of ENGINE_IDS) expect(exerciseById(catalogIdFromEngine(id))).toBeTruthy();
  });
  it('engine→catalog→engine round-trips', () => {
    for (const id of ENGINE_IDS) expect(engineIdFromCatalog(catalogIdFromEngine(id))).toBe(id);
  });
});

describe('supplemental core rules (founder 2026-06-23)', () => {
  const coreSlots = (prog: { days: { name: string; slots: { exerciseId: string; setCount: number; supplemental?: boolean }[] }[] }) =>
    prog.days.flatMap((d) => d.slots.filter((s) => exerciseById(s.exerciseId)?.muscle === 'Core'));

  for (const sex of ['male', 'female'] as const) {
    for (let days = 1; days <= 6; days++) {
      it(`${sex} · ${days}d: exactly one core block, 3 sets, last, supplemental`, async () => {
        const prog = await fixtureModel.generateProgram(profile({ sex, daysPerWeek: days }));
        const cores = coreSlots(prog);
        expect(cores).toHaveLength(1); // 1 core per week
        expect(cores[0].setCount).toBe(3); // 3 sets only
        expect(cores[0].supplemental).toBe(true); // not a primary progression target

        const host = prog.days.find((d) => d.slots.some((s) => exerciseById(s.exerciseId)?.muscle === 'Core'))!;
        const last = host.slots[host.slots.length - 1];
        expect(exerciseById(last.exerciseId)?.muscle).toBe('Core'); // placed last

        // Prefer an upper session when the week has one.
        const hasUpper = prog.days.some((d) => /^(Upper|Push|Pull)/.test(d.name));
        if (hasUpper) expect(/^(Upper|Push|Pull)/.test(host.name)).toBe(true);
      });
    }
  }

  it('core rotation reaches every ASSIGNABLE core movement; advanced core stays swap-only', async () => {
    const used = new Set<string>();
    for (let days = 1; days <= 6; days++) {
      const prog = await fixtureModel.generateProgram(profile({ sex: 'male', daysPerWeek: days }));
      for (const s of coreSlots(prog)) used.add(s.exerciseId);
    }
    // Generation covers the accessible pool; the advanced movements (hanging leg raise,
    // ab wheel) must never be assigned by default — they are swap-only regressions' inverse.
    const assignable = EXERCISES.filter((e) => e.muscle === 'Core' && !isSwapOnly(e.id)).map((e) => e.id);
    expect(assignable.length).toBeGreaterThanOrEqual(2);
    for (const id of assignable) expect(used.has(id)).toBe(true);
    for (const id of ['hanging_leg_raise', 'ab_wheel']) expect(used.has(id)).toBe(false);
  });
});
