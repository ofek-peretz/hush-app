import { coachFacts, coachCatalogue, coachEquipment, COACH_FACTS_VERSION } from '@/domain/coachFacts';
import { EXERCISES } from '@/data/exercises';
import { STARTING_INCREMENT } from '@/engine/v5/constants';
import type { Profile, Session, SetLog, Program } from '@/data/local/models';

/**
 * The sheet is the message the founder described: *"as if I did a workout, sent you all the data,
 * and said — now decide."* These tests ask the only two questions that matter about it.
 *
 *   1. Can the decisions he named actually be made FROM it? A sheet that is missing one field is a
 *      coach that has to guess, and guessing is the thing the product forbids.
 *   2. Does it carry anything it was not given on purpose?
 */

const profile: Profile = {
  sex: 'female',
  weightKg: 62,
  units: 'kg',
  goal: 'build_muscle',
  daysPerWeek: 4,
  repBand: '8-10',
  workoutMinutes: 55,
  healthConnected: false,
  name: 'Dana Levi',
};

function set(exerciseId: string, i: number, w: number, r: number, atMin: number, rest = 120): SetLog {
  return {
    exerciseId,
    setIndex: i,
    recommendedWeight: w,
    recommendedReps: 8,
    actualWeight: w,
    actualReps: r,
    edited: false,
    restBeforeS: rest,
    persistedAt: new Date(Date.UTC(2026, 6, 26, 17, atMin)).toISOString(),
  };
}

/** A real session shape: bench 30 kg for four sets, then a row. */
function session(startedAt: string, benchKg: number): Session {
  return {
    id: 's-' + startedAt,
    programDayId: 'd1',
    programDayName: 'Upper A',
    startedAt,
    state: 'SAVED',
    earlyFinish: false,
    trained: true,
    sets: [
      set('bb_bench_press', 0, benchKg, 12, 0),
      set('bb_bench_press', 1, benchKg, 11, 4),
      set('bb_bench_press', 2, benchKg, 10, 8),
      set('bb_bench_press', 3, benchKg, 8, 12),
      set('bb_row', 0, 40, 10, 18),
      set('bb_row', 1, 40, 10, 22),
    ],
  };
}

const program: Program = {
  id: 'p1',
  frequency: 4,
  days: [
    { id: 'd1', name: 'Upper A', muscleGroups: ['Chest', 'Back'], isRest: false,
      slots: [
        { capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 4 },
        { capability: 'horizontal_pull', exerciseId: 'bb_row', setCount: 3 },
      ] },
    { id: 'd2', name: 'Rest', muscleGroups: [], isRest: true, slots: [] },
  ],
};

const history = [session('2026-07-26T17:00:00.000Z', 30), session('2026-07-19T17:00:00.000Z', 27.5)];

function build() {
  return coachFacts({ profile, program, history, justFinished: history[0] });
}

describe('coach facts — the message the coach is sent', () => {
  it('states what she actually did, set by set, with the rest that makes a rep count mean something', () => {
    const f = build();
    expect(f.v).toBe(COACH_FACTS_VERSION);
    const bench = f.session!.lifts.find((l) => l.ex === 'bb_bench_press')!;
    expect(bench.sets.map((s) => [s.w, s.r])).toEqual([[30, 12], [30, 11], [30, 10], [30, 8]]);
    expect(bench.sets.every((s) => s.rest === 120)).toBe(true);
    // The ASK is stated beside the result — the gap between them is the whole signal.
    expect({ askedLoad: bench.askedLoad, askedReps: bench.askedReps }).toEqual({ askedLoad: 30, askedReps: 8 });
  });

  it('costs the session in the minutes she actually lived, not a modelled per-set constant', () => {
    // First set stamped at :00, last at :22 — 22 minutes, read from the record.
    expect(build().session!.minutes).toBe(22);
  });

  it('answers "I press 30 on the bar, what do I take on the machine?" without guessing', () => {
    // The founder's own example. It is answerable only if the sheet carries, for the lift she HAS
    // done: the load, the muscle, the capability, the pattern and the equipment — and, for the lift
    // she has NOT done, the same descriptors plus that equipment's grain.
    const f = build();
    const done = f.performed.find((p) => p.ex === 'bb_bench_press')!;
    expect(done.lastLoad).toBe(30);
    expect(done.rungs).toEqual([27.5, 30]); // her real ladder, both occurrences
    expect(done.occurrences).toBe(2);
    for (const field of ['muscle', 'capability', 'pattern', 'equipment', 'tier'] as const) {
      expect({ field, present: typeof done[field] === 'string' && done[field].length > 0 })
        .toEqual({ field, present: true });
    }

    // The machine she is asking to move to must be findable in the catalogue by the SAME
    // descriptors, or there is nothing to map between.
    const machine = f.catalogue.find(
      (c) => c.capability === done.capability && c.equipment === 'machine',
    );
    expect(machine).toBeDefined();

    // And its grain must be stated, so the answer lands on a weight the machine can hold.
    expect(f.equipment.machine.step).toBe(STARTING_INCREMENT.machine);
    expect(f.equipment.barbell.floor).toBe(20); // no barbell decision may fall under the bar
  });

  it('carries every equipment class the catalogue can prescribe — no silent gap', () => {
    const grains = coachEquipment();
    for (const ex of EXERCISES) {
      expect({ equipment: ex.equipment, stated: grains[ex.equipment] != null })
        .toEqual({ equipment: ex.equipment, stated: true });
    }
  });

  it('states the programme as it stands, so a change is a change to something', () => {
    const f = build();
    expect(f.programme).toEqual([
      { name: 'Upper A', lifts: [{ ex: 'bb_bench_press', sets: 4 }, { ex: 'bb_row', sets: 3 }] },
    ]);
    expect(f.programme.some((d) => d.name === 'Rest')).toBe(false); // a rest day is not a workout
  });

  it('sends her instructions — her band, her map, her injuries — as instructions, not readings', () => {
    const f = coachFacts({
      profile: {
        ...profile,
        bodyMap: { Chest: 'more' },
        repBandByMuscle: { Chest: '6-8' },
        painEases: [{ muscle: 'Shoulders', severity: 'twinge', fromMs: 1, untilMs: 999 }],
      },
      program, history, justFinished: history[0],
    });
    expect(f.athlete.emphasis).toEqual({ Chest: 'more' });
    expect(f.athlete.bandByMuscle).toEqual({ Chest: '6-8' });
    expect(f.athlete.resting).toEqual([{ muscle: 'Shoulders', severity: 'twinge', untilMs: 999 }]);
    expect(f.athlete.minutes).toBe(55);
  });

  it('never sends her name, and sends no field it was not explicitly given', () => {
    const json = JSON.stringify(build());
    expect(json).not.toContain('Dana');
    expect(json).not.toContain('Levi');
    // The athlete block is an allow-list, not a copy of the profile.
    expect(Object.keys(build().athlete).sort()).toEqual(
      ['band', 'daysPerWeek', 'minutes', 'sex', 'units', 'weightKg'].sort(),
    );
  });

  it('holds its shape when there is no history, no programme and no session', () => {
    const f = coachFacts({ profile, program: null, history: [], justFinished: undefined });
    expect(f.session).toBeUndefined();
    expect(f.performed).toEqual([]);
    expect(f.programme).toEqual([]);
    expect(f.catalogue.length).toBe(EXERCISES.length); // the coach can still choose
  });

  it('drops a lift whose id is no longer in the catalogue rather than inventing a name for it', () => {
    const ghost = { ...history[0], sets: [...history[0].sets, set('deleted_lift_id', 0, 50, 5, 30)] };
    const f = coachFacts({ profile, program, history: [ghost], justFinished: ghost });
    expect(f.session!.lifts.map((l) => l.ex)).toEqual(['bb_bench_press', 'bb_row']);
    expect(f.performed.map((p) => p.ex).includes('deleted_lift_id')).toBe(false);
  });

  it('is small enough that the expensive model is affordable — the measurement, not an estimate', () => {
    const f = build();
    const tok = (o: unknown) => Math.round(JSON.stringify(o).length / 3.5);
    const cat = tok(coachCatalogue());
    const perAthlete = tok({ ...f, catalogue: [] });
    // THE CACHEABLE HALF. The catalogue is byte-identical for every athlete and every call, so it
    // goes FIRST in the prompt and is read from cache at a tenth of the input price. Measured: 3,087
    // tokens against 5,699 for the full exercise records — the fields dropped (cues, video, display
    // metadata, cold-start constants) are not inputs to a choice. `name` and `pattern` are KEPT on
    // purpose: `pattern` is what makes "I bench 30, what do I take on the machine?" answerable at
    // all, and `name` stops the coach from rendering a lift by a name the screen does not use.
    // The bound guards GROWTH, which is the real risk — a field added here is paid on every call
    // for every athlete for ever.
    expect(cat).toBeLessThan(3500);
    expect(tok(EXERCISES)).toBeGreaterThan(cat * 1.8); // the saving is real, not rounding
    // THE FRESH HALF — paid in full on every call. This is the number the cost table rests on.
    expect(perAthlete).toBeLessThan(2000);
  });
});
