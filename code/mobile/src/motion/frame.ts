/**
 * Composes a full drawing for a rig at a given range-of-motion fraction: scene (floor) → equipment
 * behind → the Duotone figure → equipment in front. This single function is what the RN renderer,
 * the filmstrip, and the GIF page all call, so every surface shows byte-identical geometry.
 */
import type { Primitive, Rig } from './types';
import { skinFigure } from './skin';

/** The media frame's viewBox: a gentle uniform crop of the 352×220 authoring space (16:10). */
export const VIEWBOX = { x: 30, y: 26, w: 300, h: 187.5 } as const;

export function buildFrame(rig: Rig, rom: number): Primitive[] {
  const pose = rig.poseAt(rom);
  const decor = rig.decorAt(rom);
  return [...rig.scene, ...decor.back, ...skinFigure(pose, rig.chains), ...decor.front];
}
