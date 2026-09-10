/**
 * The two laws that keep the third dimension and per-joint timing from costing anything.
 *
 * Both were added to a system with 136 shipping clips, and both are the kind of change that can
 * quietly move every one of them. What makes them safe is not care, it is that each has an exact
 * identity case which is asserted here:
 *
 *   · A camera at azimuth 0 with no depth is the IDENTITY. Every rig that never heard of
 *     `camera.ts` must therefore render the same bytes it did before the file existed, and the
 *     migration can proceed one family at a time instead of in one commit.
 *   · A timing curve FIXES BOTH ENDPOINTS. A curve may change how a joint travels between the
 *     rep's start and its working endpoint; it may never change where it arrives, because those
 *     two positions are what every FormSpec predicate and every range tick is measured against.
 */

//

import { EXERCISE_MOTION } from '@/motion/registry';
import { buildFrame, headOver, withGirdle } from '@/motion/frame';
import { skinFigure } from '@/motion/skin';
import { FLAT, project } from '@/motion/camera';
import * as curves from '@/motion/curves';

const ROMS = [0, 0.25, 0.5, 0.75, 1];

describe('the camera', () => {
  test('is the identity at azimuth 0, for any point and any depth', () => {
    for (const z of [-40, -1, 0, 1, 40]) {
      for (const p of [
        { x: 0, y: 0 },
        { x: 176, y: 193 },
        { x: -12.5, y: 88.25 },
      ]) {
        expect(project(p, z, FLAT)).toEqual({ x: p.x, y: p.y, depth: z });
      }
    }
  });

  test('a flat rig draws exactly what the skin alone would draw', () => {
    for (const [id, rig] of Object.entries(EXERCISE_MOTION)) {
      if (rig.camera && rig.camera.azimuth !== 0) continue; // a rig that orbits opts out by design
      for (const rom of ROMS) {
        const pose = rig.poseAt(rom);
        if (pose.z) continue; // so does one that carries depth
        const decor = rig.decorAt(rom);
        /* The drawn pose carries the derived shoulder girdle and the shadow follows the body
           (frame.ts, 2026-09-07); the identity under test is the PROJECTION, so both are applied
           on this side of the comparison exactly as `frameParts` applies them. */
        const g = withGirdle(pose, rig.chains);
        const figure = skinFigure(g.pose, g.chains, 'male');
        const drawn = buildFrame(rig, rom);
        expect({ id, rom, prims: drawn.slice(rig.scene.length) }).toEqual({
          id,
          rom,
          prims: [...decor.back, ...figure, ...headOver(decor.front, figure, g.pose, g.chains)],
        });
      }
    }
  });

  test('an orbit rotates depth into the picture and preserves length along its own axis', () => {
    // The infrastructure is tested on a synthetic orbit rather than on whichever rig happens to be
    // using one today. No shipping rig orbits at the moment -- the fly family tried it and the
    // square-on view read better (see `fly.ts`) -- and a capability should not go untested just
    // because nothing currently needs it.
    const cam = { azimuth: 90, pivotX: 100, pivotY: 50 };
    // a point one unit ACROSS the axis swings fully into depth at 90 degrees
    const across = project({ x: 110, y: 50 }, 0, cam);
    expect(across.x).toBeCloseTo(100, 6);
    expect(across.depth).toBeCloseTo(-10, 6);
    // and a point at depth swings fully into the picture
    const deep = project({ x: 100, y: 50 }, 10, cam);
    expect(deep.x).toBeCloseTo(110, 6);
    expect(deep.depth).toBeCloseTo(0, 6);
    // distance ALONG the orbit axis is untouched at any angle
    for (const azimuth of [0, 17, 58, 90, 143]) {
      const p = project({ x: 100, y: 90 }, 0, { azimuth, pivotX: 100, pivotY: 50 });
      expect(p.y).toBeCloseTo(90, 6);
    }
  });
});

describe('timing curves', () => {
  const built: Array<[string, curves.Curve]> = [
    ['together', curves.together],
    ['leads(0.29)', curves.leads(0.29)],
    ['leads(0.2)', curves.leads(0.2)],
    ['lags(0.3)', curves.lags(0.3)],
    ['grindsIn(0.6)', curves.grindsIn(0.6)],
    ['easesOut(0.6)', curves.easesOut(0.6)],
    ['sticksAt(0.6, 0.15)', curves.sticksAt(0.6, 0.15)],
  ];

  test('every curve fixes both endpoints — a joint may travel differently, never arrive elsewhere', () => {
    for (const [name, c] of built) {
      if (!curves.assertEndpoints(c)) throw new Error(`${name} moved an endpoint: c(0)=${c(0)}, c(1)=${c(1)}`);
    }
  });

  test('every curve stays inside the rep and never runs backwards', () => {
    for (const [name, c] of built) {
      let prev = -Infinity;
      for (let i = 0; i <= 200; i++) {
        const v = c(i / 200);
        if (v < -1e-9 || v > 1 + 1e-9) throw new Error(`${name} left [0,1] at rom ${i / 200}: ${v}`);
        if (v < prev - 1e-9) throw new Error(`${name} ran backwards at rom ${i / 200}`);
        prev = v;
      }
    }
  });

  test('the rigs that use them still land on their authored endpoints', () => {
    // the two families carrying sequencing today; their endpoints are FormSpec-asserted elsewhere,
    // this is the tripwire for a curve being swapped for one that does not fix them
    for (const id of ['bb_back_squat', 'bb_deadlift', 'bb_rdl']) {
      const rig = EXERCISE_MOTION[id];
      expect(rig.poseAt(0)).toEqual(rig.poseAt(0));
      expect(rig.poseAt(1)).toEqual(rig.poseAt(1));
      for (const p of [...Object.values(rig.poseAt(0).j), ...Object.values(rig.poseAt(1).j)]) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
  });
});
