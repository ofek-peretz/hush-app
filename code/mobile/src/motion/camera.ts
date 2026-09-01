/**
 * THE CAMERA — an orbit around the athlete, and the projection that flattens him onto the page.
 *
 * The motion system was authored flat: `Pose.j` held the joint exactly where the drawing wanted
 * it, and depth was mimed. That works until the movement leaves the image plane, and then it does
 * not work at all: a transverse-plane fly turns its arms toward the lens, the projected
 * shoulder→hand span passes through zero, and no 2D formula can say what to draw there. The same
 * missing dimension is why the far side of the body is a `+6, +1` translate in most of the
 * library, and why the view is stuck wherever each rig was authored.
 *
 * This file adds the dimension. It is deliberately the smallest thing that can be called a camera:
 *
 *   · ORTHOGRAPHIC, because the clips are technical demonstrations. A perspective frustum would
 *     put the near hand at a different scale from the far one and make two identical plates two
 *     different sizes — the plate is a measuring stick in these drawings (§ true scale), and it
 *     must stay one.
 *   · A SINGLE AZIMUTH, an orbit about the vertical axis through the scene's centre. That is the
 *     axis a lifter is judged around — side for bar path and hinge, front for tracking and
 *     symmetry, and the three-quarter between them that shows both at once. Elevation is not
 *     offered: looking down at a squat tells you nothing that costs a horizon line.
 *   · IDENTITY AT ZERO. `azimuth: 0` with `z: 0` returns the point untouched, so every rig that
 *     never heard of this file renders byte-identically. That is not a courtesy, it is what lets
 *     136 rigs migrate one family at a time instead of in one commit.
 *
 * Depth grows TOWARD the camera: a joint with a larger `depth` is nearer the viewer and is drawn
 * later, and the duotone reads its ink from the same number.
 */

//

import type { Vec2 } from './types';

export interface Camera {
  /**
   * Degrees of orbit about the vertical axis through `pivotX`. 0 is the authored side view; +90
   * swings the camera round to the athlete's front. Positive turns the athlete's front toward the
   * viewer's left, so a right-facing figure at +30 shows his chest.
   */
  azimuth: number;
  /** The point the orbit runs around, on the athlete's own axis. */
  pivotX: number;
  /** Omitted means the orbit passes through each point's own height — a pure vertical spin. */
  pivotY?: number;
  /** The depth the orbit runs around, when a scene is not centred on z = 0. */
  pivotZ?: number;
  /**
   * The athlete's LONG AXIS in image space — the line the orbit turns around. Omitted means
   * straight up, which is right for anyone standing or sitting.
   *
   * It has to be the athlete's axis and not the screen's, and a supine fly is the proof. Lying on
   * a bench his spine runs ACROSS the page, so orbiting the screen's vertical rolls him like a
   * spit-roast instead of walking the camera around him: the first render of it came out with the
   * bench, the dumbbells and the body all pulling in different directions. `frame.ts` derives this
   * from the torso chain rather than asking rigs to declare it, so it is right by construction for
   * standing, seated, supine, hinged and hanging alike.
   */
  axis?: Vec2;
}

/** The authored view: no orbit at all. Every pre-existing rig is drawn through this. */
export const FLAT: Camera = { azimuth: 0, pivotX: 0 };

export interface Projected extends Vec2 {
  /** Larger is nearer the viewer. Drives draw order and the duotone's near/far ink. */
  depth: number;
}

/**
 * Project one joint. `z` is the athlete-space depth (0 for every flat rig), and the result carries
 * the rotated depth back out so the caller can sort and ink by it.
 */
export function project(p: Vec2, z: number, cam: Camera): Projected {
  if (cam.azimuth === 0) return { x: p.x, y: p.y, depth: z };
  const rad = (cam.azimuth * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const z0 = cam.pivotZ ?? 0;
  // the orbit axis, and the in-image direction perpendicular to it: rotation mixes THAT with depth
  const ax = cam.axis ?? { x: 0, y: -1 };
  const len = Math.hypot(ax.x, ax.y) || 1;
  const a = { x: ax.x / len, y: ax.y / len };
  const b = { x: -a.y, y: a.x };
  const dx = p.x - cam.pivotX;
  const dy = p.y - (cam.pivotY ?? p.y);
  const along = dx * a.x + dy * a.y;
  const across = dx * b.x + dy * b.y;
  const dz = z - z0;
  const across2 = across * cos + dz * sin;
  return {
    x: cam.pivotX + a.x * along + b.x * across2,
    y: (cam.pivotY ?? p.y) + a.y * along + b.y * across2,
    depth: z0 - across * sin + dz * cos,
  };
}

/**
 * Project a whole joint map. Joints absent from `z` sit at depth 0, which is what makes a partly
 * migrated rig legal: the limbs that have been given depth get it, and the rest stay in the plane
 * they were authored in.
 */
export function projectJoints(
  j: Record<string, Vec2>,
  z: Record<string, number> | undefined,
  cam: Camera,
): Record<string, Projected> {
  const out: Record<string, Projected> = {};
  for (const [name, p] of Object.entries(j)) out[name] = project(p, z?.[name] ?? 0, cam);
  return out;
}

/** Mean depth of a set of joints — how a limb decides whether it is the near one this frame. */
export function meanDepth(pts: Array<{ depth: number }>): number {
  if (!pts.length) return 0;
  let s = 0;
  for (const p of pts) s += p.depth;
  return s / pts.length;
}
