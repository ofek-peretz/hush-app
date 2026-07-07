/**
 * The shared equipment kit — plates, bar, bar-path ticks, ground shadow — so every rig states
 * "this is a loaded barbell" in the same voice. The plate is drawn at TRUE scale (a 45cm plate is
 * r=16 against the canonical athlete) as a GHOST: a transparent disc with a rim and a sleeve hub.
 * True scale is what makes the lift instantly recognizable; the ghost treatment is what keeps the
 * figure — the actual demonstration — readable through it. Pure data, no dependencies.
 */
import type { Primitive, Vec2 } from './types';
import { BAR_R, PLATE_R } from './anthro';

/** The near-side plate + bar end, drawn IN FRONT of the figure (nearest the camera). */
export function plateGhost(bar: Vec2): Primitive[] {
  return [
    { kind: 'circle', c: bar, r: PLATE_R, fill: 'ink4', fillOpacity: 0.2, stroke: 'ink3', w: 2.2 },
    { kind: 'circle', c: bar, r: 4.6, fill: 'paper1', fillOpacity: 0.75, stroke: 'ink3', w: 1.5 }, // sleeve hub
    { kind: 'circle', c: bar, r: BAR_R, fill: 'ink0' }, // the bar, end-on
  ];
}

/** The canonical range statement: a dashed vertical path with a tick at each endpoint. */
export function barPathTicks(x: number, y0: number, y1: number, tick = 4.5): Primitive[] {
  return [
    { kind: 'dash', a: { x, y: y0 }, b: { x, y: y1 }, w: 2, color: 'signal', dash: [1.5, 6.5], opacity: 0.9 },
    { kind: 'line', a: { x: x - tick, y: y0 }, b: { x: x + tick, y: y0 }, w: 2, color: 'signal', cap: 'round' },
    { kind: 'line', a: { x: x - tick, y: y1 }, b: { x: x + tick, y: y1 }, w: 2, color: 'signal', cap: 'round' },
  ];
}

/** A soft grounding shadow under the support — mass meets the floor. */
export function groundShadow(cx: number, rx: number, floorY: number): Primitive {
  return { kind: 'ellipse', c: { x: cx, y: floorY + 1.5 }, rx, ry: 2.4, fill: 'ink4', opacity: 0.55 };
}

/** The scene floor line + shadow every side-view rig shares. */
export function floorScene(floorY: number, shadowCx: number, shadowRx: number): Primitive[] {
  return [
    { kind: 'line', a: { x: 20, y: floorY }, b: { x: 332, y: floorY }, w: 1.5, color: 'line1' },
    groundShadow(shadowCx, shadowRx, floorY),
  ];
}
