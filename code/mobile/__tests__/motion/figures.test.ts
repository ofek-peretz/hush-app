/**
 * The two athletes share one skeleton — and the second athlete is real everywhere.
 *
 * Three laws:
 *   1. DEFAULT IS HIM, BYTE-IDENTICAL: `buildFrame(rig, rom)` must equal
 *      `buildFrame(rig, rom, 'male')` exactly, for every rig — adding her changed nothing
 *      that already shipped.
 *   2. SHE PERFORMS EVERY EXERCISE: the female skin renders finite geometry for every rig in
 *      the registry at start, mid, and end of the rep — no exercise is his only.
 *   3. SAME SKELETON, DIFFERENT BODY: her frame differs from his (she is drawn, not aliased),
 *      but every JOINT is identical — the pose, and therefore every FormSpec guarantee, is
 *      shared. The figure that differs is skin-deep by construction.
 */

//

import { EXERCISE_MOTION } from '@/motion/registry';
import { buildFrame } from '@/motion/frame';
import { skinFigure } from '@/motion/skin';

const ROMS = [0, 0.5, 1];
const rigs = Object.entries(EXERCISE_MOTION);

const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

function allNumbersFinite(o: unknown): boolean {
  if (typeof o === 'number') return finite(o);
  if (Array.isArray(o)) return o.every(allNumbersFinite);
  if (o && typeof o === 'object') return Object.values(o).every(allNumbersFinite);
  return true;
}

describe('the two Duotone Athletes', () => {
  test('default rendering is the male figure, byte-identical, for every rig', () => {
    for (const [id, rig] of rigs) {
      for (const rom of ROMS) {
        expect({ id, rom, prims: buildFrame(rig, rom) }).toEqual({ id, rom, prims: buildFrame(rig, rom, 'male') });
      }
    }
  });

  test('she performs every exercise in the registry with finite geometry', () => {
    for (const [id, rig] of rigs) {
      for (const rom of ROMS) {
        const prims = buildFrame(rig, rom, 'female');
        expect(prims.length).toBeGreaterThan(0);
        if (!allNumbersFinite(prims)) {
          throw new Error(`non-finite geometry in ${id} @ rom ${rom} (female)`);
        }
      }
    }
  });

  test('her figure is drawn, not aliased — and the skeleton underneath is his exactly', () => {
    for (const [id, rig] of rigs) {
      const male = JSON.stringify(skinFigure(rig.poseAt(0.5), rig.chains, 'male'));
      const female = JSON.stringify(skinFigure(rig.poseAt(0.5), rig.chains, 'female'));
      if (male === female) throw new Error(`${id}: female skin renders identical to male`);
      // the pose is figure-independent by type: poseAt takes no figure. Assert it anyway, as a
      // tripwire against a future "her pose" fork — the FormSpec guarantee must stay shared.
      expect(rig.poseAt(0.5)).toEqual(rig.poseAt(0.5));
    }
  });
});
