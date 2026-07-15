/**
 * Engine v5 · Revision 7 tripwire — muscle independence (register Part 9).
 *
 * The body map, the per-muscle rep band, volume, and swap-scoping ALL key on a single field:
 * `exercise.muscle`. There is deliberately NO secondary-muscle concept anywhere in the engine — so a
 * muscle is an independent track: turning `Chest` off removes only Chest-primary exercises and never
 * touches `Shoulders`, and a per-muscle rep band adds no new coupling.
 *
 * This guards that invariant. If someone later adds a multi-muscle field and wires it, the partition
 * check fails and forces the coupling to be designed on purpose, not smuggled in through the back door
 * (the same discipline as the S-54 warm-up and S-67 assisted-machine tripwires).
 */
import { EXERCISES, exercisesForMuscle, muscleOf, type MuscleGroup } from '@/data/exercises';

const ALL: MuscleGroup[] = [
  'Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Core',
  'Quads', 'Hamstrings', 'Glutes', 'Calves',
];

describe('Rev 7 · muscle independence — one exercise trains exactly one muscle', () => {
  it('every catalogue exercise resolves to exactly one known muscle', () => {
    for (const ex of EXERCISES) {
      expect(muscleOf(ex.id)).toBe(ex.muscle);
      expect(ALL).toContain(ex.muscle);
    }
  });

  it('the per-muscle pools PARTITION the catalogue — no exercise appears under two muscles', () => {
    const seen = new Map<string, MuscleGroup>();
    let total = 0;
    for (const m of ALL) {
      for (const ex of exercisesForMuscle(m)) {
        total += 1;
        // A second sighting would mean this exercise trains two muscles — i.e. turning one muscle
        // off could silently drop a lift the athlete never turned off. That is the coupling we forbid.
        expect(seen.get(ex.id)).toBeUndefined();
        seen.set(ex.id, m);
      }
    }
    expect(total).toBe(EXERCISES.length);
    expect(seen.size).toBe(EXERCISES.length);
  });

  it('turning Chest off cannot touch Shoulders — the two pools are disjoint', () => {
    const chest = new Set(exercisesForMuscle('Chest').map((e) => e.id));
    for (const id of exercisesForMuscle('Shoulders').map((e) => e.id)) {
      expect(chest.has(id)).toBe(false);
    }
  });
});
