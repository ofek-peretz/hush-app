/**
 * The room (2026-09-01, audit finding 06) — the equipment filter, and where it may and may not act.
 *
 * The contract: absent = full gym (parity — nothing changes for anyone who never answered);
 * bodyweight always passes; the assembly's pool respects the room but never empties over it; the
 * swap pool's scored candidates respect it while her pinned lifts pass anyway.
 */
// @ts-nocheck

//

import { inRoom, isHomeRoom, roomForStorage, ROOM_FAMILIES } from '@/domain/room';
import { pickExercises } from '@/engine/v5/programAssembly';
import { swapCandidates } from '@/domain/swapPool';
import { exerciseById, loadStyleOf, progressionRule } from '@/data/exercises';
import { loadSetup, noLoadIsBand } from '@/domain/loadPresentation';
import { fixtureModel } from '@/data/api/fixtureModel';
import { emptyBarKg } from '@/engine/loadMath';
import { snapDown } from '@/engine/v5/grid';
import { KETTLEBELL_KG } from '@/engine/v5/constants';

describe('inRoom', () => {
  it('absent list = full gym — everything passes', () => {
    expect(inRoom(exerciseById('cable_fly'))).toBe(true);
    expect(inRoom(exerciseById('bb_bench_press'), undefined)).toBe(true);
  });

  it('a listed room admits its families and refuses the rest', () => {
    const room = ['dumbbell'];
    expect(inRoom(exerciseById('db_bench_press'), room)).toBe(true);
    expect(inRoom(exerciseById('cable_fly'), room)).toBe(false);
    expect(inRoom(exerciseById('machine_chest_press'), room)).toBe(false);
  });

  it('bodyweight is never absent from a room', () => {
    expect(inRoom(exerciseById('push_up'), [])).toBe(true);
    expect(inRoom(exerciseById('push_up'), ['machine'])).toBe(true);
  });

  it('⛔ "no load" is not "needs nothing" — an assist machine is a machine and a band is a band (2026-09-10)', () => {
    // `bodyweight: true` means the reps carry the lift; it used to let these into every room.
    expect(inRoom(exerciseById('assisted_pull_up'), [])).toBe(false);
    expect(inRoom(exerciseById('back_extension'), ['dumbbell'])).toBe(false);
    expect(inRoom(exerciseById('band_curl'), ['dumbbell'])).toBe(false);
    expect(inRoom(exerciseById('assisted_pull_up'), ['machine'])).toBe(true);
    expect(inRoom(exerciseById('band_curl'), ['band'])).toBe(true);
  });
});

describe('roomForStorage', () => {
  it('the full room stores as absent — the parity default; the EMPTY room is a room (bodyweight only, 2026-09-10)', () => {
    expect(roomForStorage(ROOM_FAMILIES)).toBeUndefined();
    expect(roomForStorage([])).toEqual([]);
    expect(roomForStorage(['dumbbell', 'machine'])).toEqual(['dumbbell', 'machine']);
  });

  it('a bodyweight-only room gets bodyweight quads, chest and back — nothing to buy', () => {
    for (const muscle of ['Quads', 'Chest', 'Back'] as const) {
      const picked = pickExercises(muscle, 2, undefined, {}, { equipment: [] });
      expect(picked.length).toBeGreaterThan(0);
      for (const id of picked) {
        const ex = exerciseById(id);
        expect({ id, equipment: ex.equipment }).toEqual({ id, equipment: 'bodyweight' });
      }
    }
    expect(pickExercises('Quads', 2, undefined, {}, { equipment: [] })).toContain('bw_squat');
  });

  it('a bodyweight-only room never writes iron into a living room — a muscle the shelf cannot serve rests', () => {
    // No bodyweight biceps lift exists; the swap menu would be empty too, so the muscle rests.
    expect(pickExercises('Biceps', 2, undefined, {}, { equipment: [] })).toEqual([]);
    // …while a listed room still falls back to the catalogue lead (the swap menu can help there).
    expect(pickExercises('Calves', 2, undefined, {}, { equipment: ['cable'] }).length).toBeGreaterThan(0);
  });

  it('a whole bodyweight-only WEEK is built from the shelf alone', async () => {
    const program = await fixtureModel.generateProgram({
      sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 3, repBand: '8-12', healthConnected: false, equipment: [],
    } as never);
    const lifts = program.days.flatMap((d) => d.slots.map((s) => s.exerciseId));
    expect(lifts.length).toBeGreaterThan(6);
    for (const id of lifts) {
      const ex = exerciseById(id)!;
      expect({ id, equipment: ex.equipment }).toEqual({ id, equipment: 'bodyweight' });
    }
    expect(lifts).toContain('bw_squat');
  });
});

describe('the assembly respects the room', () => {
  it('a dumbbell-only room gets a dumbbell/bodyweight chest day', () => {
    const picked = pickExercises('Chest', 3, undefined, {}, { equipment: ['dumbbell'] });
    expect(picked.length).toBeGreaterThan(0);
    for (const id of picked) {
      const ex = exerciseById(id);
      expect(ex.bodyweight || ex.equipment === 'bodyweight' || ex.equipment === 'dumbbell').toBe(true);
    }
  });

  it('no profile → the exact pool it always picked (parity)', () => {
    expect(pickExercises('Chest', 3)).toEqual(pickExercises('Chest', 3, undefined, {}, undefined));
  });

  it('a room the catalogue cannot serve falls back to the full pool — a muscle she asked to train is never rested over furniture', () => {
    // Calves in a cable-only room: no cable calf work exists, so the catalogue answers anyway.
    const picked = pickExercises('Calves', 2, undefined, {}, { equipment: ['cable'] });
    expect(picked.length).toBeGreaterThan(0);
  });
});

describe('the swap pool respects the room', () => {
  it('scored candidates stay inside the room', () => {
    const out = swapCandidates('bb_bench_press', { sessionExerciseIds: [], equipment: ['dumbbell'] });
    expect(out.length).toBeGreaterThan(0);
    for (const ex of out) {
      expect(ex.bodyweight || ex.equipment === 'bodyweight' || ex.equipment === 'dumbbell').toBe(true);
    }
  });

  it('her pinned standing substitute passes even from outside the room — her word outranks the furniture list', () => {
    const out = swapCandidates('bb_bench_press', {
      sessionExerciseIds: [],
      equipment: ['dumbbell'],
      prefs: { substitutes: { bb_bench_press: 'machine_chest_press' } },
    });
    expect(out[0]?.id).toBe('machine_chest_press');
  });
});

describe('the home-room shelf is programmed only where it is needed (2026-09-10)', () => {
  const kbRoom = { equipment: ['kettlebell'] } as never;

  it('a kettlebell room gets kettlebell lifts', () => {
    const quads = pickExercises('Quads', 2, undefined, {}, kbRoom);
    expect(quads).toContain('kb_goblet_squat');
    for (const id of quads) {
      const ex = exerciseById(id);
      expect(ex.bodyweight || ex.equipment === 'bodyweight' || ex.equipment === 'kettlebell').toBe(true);
    }
    expect(pickExercises('Glutes', 2, undefined, {}, kbRoom)).toContain('kb_swing');
  });

  it('⛔ a FULL GYM never sees them — the audited rotation is untouched', () => {
    // The whole reason they are choice-only: admitting them everywhere moved two measured boards
    // (share inversions 149 → 178, unavoidable under-dose 111 → 114).
    for (const muscle of ['Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps', 'Back'] as const) {
      const picked = pickExercises(muscle, 4, undefined, {}, undefined);
      for (const id of ['kb_goblet_squat', 'kb_rdl', 'kb_swing', 'bw_squat', 'split_squat', 'band_curl', 'band_pushdown', 'band_row', 'band_pull_apart', 'band_pull_through']) {
        expect({ muscle, id, picked: picked.includes(id) }).toEqual({ muscle, id, picked: false });
      }
    }
  });

  it('⛔ …and neither does a declared room that does not hold them', () => {
    const cableRoom = { equipment: ['cable'] } as never;
    expect(pickExercises('Quads', 3, undefined, {}, cableRoom)).not.toContain('kb_goblet_squat');
    // bodyweight is in EVERY room, so the bodyweight shelf does open in a narrow declared one.
    expect(pickExercises('Quads', 3, undefined, {}, cableRoom)).toContain('bw_squat');
  });

  it('⛔ a HOME never falls back to iron — a muscle her bells cannot serve rests (2026-09-10)', () => {
    expect(isHomeRoom([])).toBe(true);
    expect(isHomeRoom(['kettlebell', 'band'])).toBe(true);
    expect(isHomeRoom(['dumbbell'])).toBe(false);
    expect(isHomeRoom(undefined)).toBe(false);
    // No kettlebell curl exists; the old fallback wrote a barbell curl into the living room.
    for (const id of pickExercises('Biceps', 2, undefined, {}, kbRoom)) {
      const eq = exerciseById(id).equipment;
      expect({ id, ok: eq === 'kettlebell' || eq === 'bodyweight' }).toEqual({ id, ok: true });
    }
  });

  it('a bell has a floor and a coarse ladder — no 2 kg kettlebell exists', () => {
    expect(emptyBarKg('kettlebell')).toBe(KETTLEBELL_KG);
    expect(snapDown(10, 'kettlebell')).toBe(8);
    expect(snapDown(2, 'kettlebell')).toBe(KETTLEBELL_KG);
  });
});

describe('the band family (2026-09-10) — a room with bands in it, and no kilograms anywhere', () => {
  const bandRoom = { equipment: ['band'] } as never;
  const BANDS = ['band_curl', 'band_pushdown', 'band_row', 'band_pull_apart', 'band_pull_through'];

  it('a band room gets band lifts where the body alone had nothing — the biceps train', () => {
    expect(pickExercises('Biceps', 2, undefined, {}, bandRoom)).toContain('band_curl');
    expect(pickExercises('Triceps', 3, undefined, {}, bandRoom)).toContain('band_pushdown');
    expect(pickExercises('Glutes', 3, undefined, {}, bandRoom)).toContain('band_pull_through');
    for (const muscle of ['Biceps', 'Triceps', 'Back', 'Glutes'] as const) {
      for (const id of pickExercises(muscle, 3, undefined, {}, bandRoom)) {
        const eq = exerciseById(id).equipment;
        expect({ muscle, id, ok: eq === 'band' || eq === 'bodyweight' }).toEqual({ muscle, id, ok: true });
      }
    }
  });

  it('a band has no load axis — the reps carry it, nothing is set up, and its word is not "bodyweight"', () => {
    for (const id of BANDS) {
      expect(loadStyleOf(id)).toBe('band');
      expect(progressionRule(id).mode).toBe('reps');
      expect(noLoadIsBand(id)).toBe(true);
    }
    expect(noLoadIsBand('push_up')).toBe(false);
    expect(noLoadIsBand('assisted_pull_up')).toBe(false);
    expect(loadSetup('band_curl', 10, 'kg')).toBeNull();
  });

  it('a whole band-room week holds nothing she does not own', async () => {
    const program = await fixtureModel.generateProgram({
      sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 3, repBand: '8-12', healthConnected: false, equipment: ['band'],
    } as never);
    const lifts = program.days.flatMap((d) => d.slots.map((s) => s.exerciseId));
    for (const id of lifts) {
      const eq = exerciseById(id)!.equipment;
      expect({ id, eq, ok: eq === 'band' || eq === 'bodyweight' }).toEqual({ id, eq, ok: true });
    }
    expect(lifts.some((id) => BANDS.includes(id))).toBe(true);
    for (const d of program.days) for (const s of d.slots) if (BANDS.includes(s.exerciseId)) expect(s.weightKg ?? null).toBeNull();
  });
});
