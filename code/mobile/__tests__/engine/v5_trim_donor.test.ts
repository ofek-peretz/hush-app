/**
 * Engine v5 · D4 — the emphasis-aware trim (register S-37 + the protected-lifts rule). When a day
 * exceeds her minutes, the set to give up comes from the muscle that can best spare it (most sets,
 * never emphasis, never its floor) — a compound is never sacrificed before an isolation, and a
 * muscle's only exercise is never dropped.
 */
// @ts-nocheck

// 

import { trimV5ToBudget, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { exercisesForMuscle } from '@/data/exercises';
import type { ProgramDay, Slot } from '@/data/local/models';

const compoundOf = (m: 'Chest' | 'Shoulders') => exercisesForMuscle(m).find((e) => e.tier === 'compound')!;
const isolationsOf = (m: 'Chest' | 'Shoulders') => exercisesForMuscle(m).filter((e) => e.tier === 'isolation');

const slot = (exerciseId: string, capability: Slot['capability'], setCount: number): Slot => ({ exerciseId, capability, setCount });

describe('D4 · trimV5ToBudget — donate from who can best spare it, protect emphasis', () => {
  it('a high-volume NORMAL muscle donates; the EMPHASIS muscle is never touched', () => {
    const chestC = compoundOf('Chest');
    const chestI = isolationsOf('Chest');
    const shoulderI = isolationsOf('Shoulders');
    expect(chestI.length).toBeGreaterThanOrEqual(2); // catalog sanity
    expect(shoulderI.length).toBeGreaterThanOrEqual(1);

    const day: ProgramDay = {
      id: 'd0', name: 'Upper A', muscleGroups: ['Chest', 'Shoulders'], isRest: false, completed: false,
      slots: [
        slot(chestC.id, chestC.capability, 4), // compound — protected from being cut before isolation
        slot(chestI[0].id, chestI[0].capability, 5),
        slot(chestI[1].id, chestI[1].capability, 5),
        slot(shoulderI[0].id, shoulderI[0].capability, 5), // Shoulders = emphasis → must be spared
      ],
    };
    const shoulderBefore = day.slots.find((s) => s.exerciseId === shoulderI[0].id)!.setCount;

    trimV5ToBudget(day, { Shoulders: 'emphasis' } as never, 30);

    // Within budget now.
    expect(estimateSessionMinutes(day)).toBeLessThanOrEqual(30);
    // The emphasis muscle kept every set — never donated, never dropped.
    const shoulderSlots = day.slots.filter((s) => s.exerciseId === shoulderI[0].id);
    expect(shoulderSlots.length).toBe(1);
    expect(shoulderSlots[0].setCount).toBe(shoulderBefore);
    // The chest compound kept its full scheme (a compound is never sacrificed before an isolation).
    expect(day.slots.find((s) => s.exerciseId === chestC.id)!.setCount).toBe(4);
    // The chest (normal, high-volume) donated — its isolation set total dropped.
    const chestIsoSets = day.slots.filter((s) => s.exerciseId !== chestC.id && s.exerciseId !== shoulderI[0].id).reduce((n, s) => n + s.setCount, 0);
    expect(chestIsoSets).toBeLessThan(10);
  });

  it('an already-within-budget day is left completely untouched', () => {
    const chestC = compoundOf('Chest');
    const day: ProgramDay = {
      id: 'd1', name: 'Upper', muscleGroups: ['Chest'], isRest: false, completed: false,
      slots: [slot(chestC.id, chestC.capability, 3)],
    };
    const before = JSON.stringify(day);
    trimV5ToBudget(day, {} as never, 60);
    expect(JSON.stringify(day)).toBe(before);
  });
});
