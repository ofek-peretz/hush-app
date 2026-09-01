/**
 * The room (2026-09-01, audit finding 06) — the equipment filter, and where it may and may not act.
 *
 * The contract: absent = full gym (parity — nothing changes for anyone who never answered);
 * bodyweight always passes; the assembly's pool respects the room but never empties over it; the
 * swap pool's scored candidates respect it while her pinned lifts pass anyway.
 */
// @ts-nocheck

//

import { inRoom, roomForStorage, ROOM_FAMILIES } from '@/domain/room';
import { pickExercises } from '@/engine/v5/programAssembly';
import { swapCandidates } from '@/domain/swapPool';
import { exerciseById } from '@/data/exercises';

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
});

describe('roomForStorage', () => {
  it('the full room and the empty answer both store as absent — the parity default', () => {
    expect(roomForStorage(ROOM_FAMILIES)).toBeUndefined();
    expect(roomForStorage([])).toBeUndefined();
    expect(roomForStorage(['dumbbell', 'machine'])).toEqual(['dumbbell', 'machine']);
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
