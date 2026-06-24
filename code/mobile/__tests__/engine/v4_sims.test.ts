/**
 * Phase 7 — large-scale simulations + soak across ALL supported split structures and behaviors.
 *
 * For every (sex × daysPerWeek 1–6 × goal) the real split is generated, mapped to v4 slots, and run
 * for 24 weeks through a scripted athlete that exercises calibration, progression, long plateaus
 * (lever ladder → patient hold), misses (reprice → swap), an adherence drop, an absence, and an
 * injury. The 43-invariant runner must return ZERO violations on EVERY emitted week, and the engine
 * must always terminate with a valid plan (no dead-ends). Goal-change (C4-1) is covered separately.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { setV4Enabled } from '@/engine/v4/flag';
import { deriveSlots } from '@/engine/v4/v4Engine';
import { planNextWeek } from '@/engine/v4/planWeek';
import { checkInvariants } from '@/engine/v4/invariants';
import { exerciseMeta, candidatesForPattern } from '@/engine/v4/catalogAdapter';
import { demonstrated, epley, volumeLoad } from '@/engine/v4/reads';
import { repScheme, toEngineGoal, toTrainingAge, type EngineProfile, type SlotState, type SlotResult, type GlobalState, type WeekRecord } from '@/engine/v4/types';
import type { Goal, Experience, Profile } from '@/data/local/models';

beforeAll(() => setV4Enabled(false)); // we drive the pure engine directly; no persistence side effects

const sessionOf = (slotId: string) => slotId.split(':')[0];

function buildSlots(program: Awaited<ReturnType<typeof fixtureModel.generateProgram>>, goalEng: EngineProfile['goal']): SlotState[] {
  const scheme = repScheme(goalEng);
  return deriveSlots(program).map((d, i) => {
    const meta = exerciseMeta(d.exerciseId);
    return {
      slotId: d.slotId,
      pattern: d.pattern,
      order_index: i,
      locked: false,
      current_exercise_id: d.exerciseId,
      current_load_kg: meta.bodyweight ? null : 40,
      current_sets: d.setCount,
      rep_target: scheme.target,
      rep_range: scheme.range,
      tenure_weeks: 0,
      flat_weeks: 0,
      miss_streak: 0,
      levers_tried: [],
      hold_mode: false,
      weeks_since_swap: 0,
      calibrating: true,
      calib_weeks: 0,
      history: [],
    };
  });
}

type Behavior = 'beat' | 'plateau' | 'miss' | 'adherence' | 'absence' | 'injury';
function behaviorFor(wk: number): Behavior {
  if (wk <= 5) return 'beat';
  if (wk <= 9) return 'plateau';
  if (wk === 10) return 'adherence';
  if (wk === 11) return 'absence';
  if (wk === 12) return 'injury';
  if (wk <= 17) return 'miss';
  return 'beat';
}

function simResult(slot: SlotState, b: Behavior, freq: number): SlotResult {
  const load = slot.current_load_kg;
  let reps: number;
  let failed = false;
  if (b === 'beat') reps = slot.rep_target + 2;
  else if (b === 'plateau') reps = slot.rep_target;
  else if (b === 'miss') {
    reps = Math.max(1, slot.rep_target - 2);
    failed = true;
  } else reps = slot.rep_target; // adherence/absence/injury weeks still log some work
  const sets = Array.from({ length: slot.current_sets }, () => ({ load, reps, failed }));
  const completed = b === 'adherence' ? Math.max(0, Math.floor(freq * 0.3)) : freq;
  return { slotId: slot.slotId, pattern: slot.pattern, exercise_id: slot.current_exercise_id, sets, sessions_completed: completed, sessions_planned: freq };
}

function runCell(sex: 'male' | 'female', days: number, goalApp: Goal, program: Awaited<ReturnType<typeof fixtureModel.generateProgram>>) {
  const exp: Experience = 'intermediate';
  const eprofile: EngineProfile = {
    sex,
    age: 30,
    bodyweight_kg: sex === 'female' ? 65 : 80,
    training_age: toTrainingAge(exp),
    goal: toEngineGoal(goalApp),
    variety_preference: 'medium',
    workout_count: days,
    available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
    gym_busyness: 'medium',
  };
  let slots = buildSlots(program, eprofile.goal);
  let global: GlobalState = { days_since_last_session: 3 };
  const freq = Math.max(1, program.frequency);

  for (let wk = 0; wk < 24; wk++) {
    const b = behaviorFor(wk);
    global = { days_since_last_session: b === 'absence' ? 12 : 3, injury_flag: b === 'injury' };
    const results = slots.map((s) => simResult(s, b, freq));

    // bestE1rm per slot from this week's completed work (for the rail invariant I-1).
    const bestById = new Map<string, number | null>();
    const wasCalibrating = new Set<string>();
    for (const s of slots) {
      const r = results.find((x) => x.slotId === s.slotId)!;
      bestById.set(s.slotId, demonstrated(r.sets, s.rep_target).best_e1rm);
      if (s.calibrating) wasCalibrating.add(s.slotId);
    }

    const out = planNextWeek({
      profile: eprofile,
      slots,
      global,
      results,
      meta: exerciseMeta,
      candidates: (p) => candidatesForPattern(p),
      seedLoad: () => 40,
      sessionOf,
    });

    const reduced = b === 'adherence' || b === 'injury' || b === 'absence';
    const violations = checkInvariants(out, {
      ta: eprofile.training_age,
      bestE1rm: (id) => bestById.get(id) ?? null,
      sessionOf,
      minLoadable: () => 2.5,
      reducedWeek: reduced,
      wasCalibrating: (id) => wasCalibrating.has(id),
    });
    expect({ cell: `${sex}/${days}/${goalApp}`, wk, violations }).toEqual({ cell: `${sex}/${days}/${goalApp}`, wk, violations: [] });
    expect(out.next_slots.length).toBe(slots.length); // always emits a full plan (no dead-end)

    // Thread state + per-slot history for the next week's trend.
    slots = out.updated_slots.map((ns) => {
      const r = results.find((x) => x.slotId === ns.slotId)!;
      const rec: WeekRecord = { week: wk, sets: r.sets, e1rm_week: demonstrated(r.sets, ns.rep_target).best_e1rm ?? 0, volume_load: volumeLoad(r.sets), completed_sets: r.sets.length, prescribed_sets: ns.current_sets };
      return { ...ns, history: [rec, ...ns.history].slice(0, 6) };
    });
  }
}

describe('all split structures × goals × behaviors stay invariant-clean for 24 weeks', () => {
  const sexes: Array<'male' | 'female'> = ['male', 'female'];
  const goals: Goal[] = ['get_stronger', 'build_muscle', 'general_fitness', 'toning'];
  for (const sex of sexes) {
    for (let days = 1; days <= 6; days++) {
      it(`${sex} · ${days}d · all goals`, async () => {
        for (const goal of goals) {
          const program = await fixtureModel.generateProgram({
            sex,
            weightKg: sex === 'female' ? 65 : 80,
            age: 30,
            units: 'kg',
            goal,
            experience: 'intermediate',
            daysPerWeek: days,
            healthConnected: false,
          } as Profile);
          runCell(sex, days, goal, program);
        }
      });
    }
  }
});
