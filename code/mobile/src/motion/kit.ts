/**
 * The shared equipment kit — plates, bar, bar-path ticks, ground shadow — so every rig states
 * "this is a loaded barbell" in the same voice. The plate is drawn at TRUE scale (a 45cm plate is
 * r=16 against the canonical athlete) as a GHOST: a transparent disc with a rim and a sleeve hub.
 * True scale is what makes the lift instantly recognizable; the ghost treatment is what keeps the
 * figure — the actual demonstration — readable through it. Pure data, no dependencies.
 */
import type { Primitive, Vec2 } from './types';
import { BAR_R, PLATE_R } from './anthro';

/** The near-side plate + bar end, drawn IN FRONT of the figure (nearest the camera).
 *  `r` defaults to the 45cm competition plate; lighter implements (curl bars) pass a smaller disc. */
export function plateGhost(bar: Vec2, r = PLATE_R): Primitive[] {
  return [
    { kind: 'circle', c: bar, r, fill: 'ink4', fillOpacity: 0.2, stroke: 'ink3', w: 2.2 },
    { kind: 'circle', c: bar, r: Math.min(4.6, r * 0.32), fill: 'paper1', fillOpacity: 0.75, stroke: 'ink3', w: 1.5 }, // sleeve hub
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

/** The same range statement along an arbitrary rail (incline grooves): dashed a→b with a
 *  perpendicular tick at each endpoint. Reduces to barPathTicks when the rail is vertical. */
export function linePathTicks(a: Vec2, b: Vec2, tick = 4.5): Primitive[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const t = (p: Vec2): Primitive => ({
    kind: 'line',
    a: { x: p.x - n.x * tick, y: p.y - n.y * tick },
    b: { x: p.x + n.x * tick, y: p.y + n.y * tick },
    w: 2,
    color: 'signal',
    cap: 'round',
  });
  return [{ kind: 'dash', a, b, w: 2, color: 'signal', dash: [1.5, 6.5], opacity: 0.9 }, t(a), t(b)];
}

/** A soft grounding shadow under the support — mass meets the floor. */
export function groundShadow(cx: number, rx: number, floorY: number): Primitive {
  return { kind: 'ellipse', c: { x: cx, y: floorY + 1.5 }, rx, ry: 2.4, fill: 'ink4', opacity: 0.55 };
}

/** A dumbbell seen END-ON (plate face toward the camera) — the "held load" statement, in the
 *  same ghost grammar as the barbell plate at HONEST scale: a working dumbbell head is ≈18cm
 *  across → r≈8 against the canonical athlete (the 45cm barbell plate is r16), so the size
 *  hierarchy alone says barbell vs dumbbell. The solid center is the handle, end-on. */
export function dumbbellEnd(hand: Vec2, r = 8): Primitive[] {
  return [
    { kind: 'circle', c: hand, r, fill: 'ink4', fillOpacity: 0.2, stroke: 'ink3', w: 2 },
    { kind: 'circle', c: hand, r: 2.2, fill: 'ink0' },
  ];
}

/** A dumbbell seen SIDE-ON along direction `dir` (hammer grips, goblet holds): handle + two plates. */
export function dumbbellSide(hand: Vec2, dir: Vec2, half = 6.5, plateR = 4): Primitive[] {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  const a = { x: hand.x - u.x * half, y: hand.y - u.y * half };
  const b = { x: hand.x + u.x * half, y: hand.y + u.y * half };
  return [
    { kind: 'line', a, b, w: 2.5, color: 'ink0', cap: 'round' },
    { kind: 'circle', c: a, r: plateR, fill: 'ink1' },
    { kind: 'circle', c: b, r: plateR, fill: 'ink1' },
  ];
}

/** A dumbbell in FRONT view, honest rotation projection. `spin` 0 = palms-in (axis toward the
 *  camera: the near plate face-on, one ghost disc) → 1 = palms-forward (axis across the frame:
 *  handle visible, plates foreshortened to edge-on slivers). The Arnold press drives `spin` with
 *  the rep; plain presses hold spin = 1. */
export function dumbbellFront(hand: Vec2, spin = 1, half = 9, plateR = 8): Primitive[] {
  const s = Math.sin((spin * Math.PI) / 2);
  const c = Math.cos((spin * Math.PI) / 2);
  const out: Primitive[] = [];
  const hx = half * s;
  if (hx > 1) out.push({ kind: 'line', a: { x: hand.x - hx, y: hand.y }, b: { x: hand.x + hx, y: hand.y }, w: 2.5, color: 'ink0', cap: 'round' });
  const rx = Math.max(2.4, plateR * c);
  out.push({ kind: 'ellipse', c: { x: hand.x - hx, y: hand.y }, rx, ry: plateR, fill: 'ink3', opacity: 0.55 });
  out.push({ kind: 'ellipse', c: { x: hand.x + hx, y: hand.y }, rx, ry: plateR, fill: 'ink3', opacity: 0.55 });
  out.push({ kind: 'circle', c: hand, r: 2.2, fill: 'ink0' });
  return out;
}

/** A barbell in FRONT view: the bar crossing the frame with edge-on plate slabs at the sleeves. */
export function barbellFront(cx: number, y: number, halfBar = 78, plateX = 62, plateR = PLATE_R): Primitive[] {
  return [
    { kind: 'ellipse', c: { x: cx - plateX, y }, rx: 3.4, ry: plateR, fill: 'ink3', opacity: 0.55 },
    { kind: 'ellipse', c: { x: cx + plateX, y }, rx: 3.4, ry: plateR, fill: 'ink3', opacity: 0.55 },
    { kind: 'line', a: { x: cx - halfBar, y }, b: { x: cx + halfBar, y }, w: 3, color: 'ink0', cap: 'round' },
  ];
}

/** A cable from an anchor/pulley to the hand — same stroke grammar as the pulldown machine. */
export function cable(from: Vec2, to: Vec2): Primitive {
  return { kind: 'line', a: from, b: to, w: 1.5, color: 'ink2' };
}

export function pulley(c: Vec2): Primitive[] {
  return [{ kind: 'circle', c, r: 4, stroke: 'ink3', w: 2, fill: 'paper1' }];
}

// ── the Recognition Layer (§3.5 Amendment 4): the force chain, stated ────────────
// The full station assemblies (stack towers, pulldown/row/press machines) live in machines.ts;
// this kit keeps the shared vocabulary they compose.

/** A floor-pivoted lever shaft (t-bar row, landmine) — drawn in the BAR voice, never the cable
 *  stroke (§3.5): a solid shaft from the pivot to the handle, over a small anchor mount. */
export function leverBar(pivot: Vec2, handle: Vec2): Primitive[] {
  return [
    {
      kind: 'poly',
      pts: [
        { x: pivot.x - 6, y: pivot.y + 3 },
        { x: pivot.x, y: pivot.y - 5 },
        { x: pivot.x + 6, y: pivot.y + 3 },
      ],
      fill: 'ink3',
    }, // the anchor mount
    { kind: 'line', a: pivot, b: handle, w: 3, color: 'ink1', cap: 'round' }, // the shaft
    { kind: 'circle', c: pivot, r: 2.5, fill: 'ink0' }, // the hinge pin
  ];
}

/** An upholstered pad drawn as an outlined thick stroke between two points (benches, rollers). */
export function padStroke(a: Vec2, b: Vec2, w: number): Primitive[] {
  return [
    { kind: 'line', a, b, w: w + 3.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a, b, w, color: 'paper3', cap: 'round' },
  ];
}

/** A bench seen END-ON (the head-end camera of the frontal lying presses): the pad's
 *  cross-section under the athlete, with its two splayed legs to the floor. */
export function benchEndOn(cx: number, top: number, floorY: number, halfW = 24): Primitive[] {
  return [
    { kind: 'line', a: { x: cx - 15, y: top + 8 }, b: { x: cx - 19, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: cx + 15, y: top + 8 }, b: { x: cx + 19, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'rect', x: cx - halfW, y: top, width: halfW * 2, height: 9, rx: 3.5, fill: 'paper3', stroke: 'ink3', w: 2 },
  ];
}

/** The incline back pad, face-on: the reclined rest rising behind the chest dome — its top edge
 *  and side slivers read past the trunk (the reclined-body statement of the incline members). */
export function inclineBackPadFront(cx: number, topY: number, bottomY: number, halfW = 20): Primitive[] {
  return [{ kind: 'rect', x: cx - halfW, y: topY, width: halfW * 2, height: bottomY - topY, rx: 6, fill: 'paper3', stroke: 'ink3', w: 2 }];
}

/** The bench-press rack, face-on: two uprights either side of the athlete with J-hooks toward
 *  the bar — the goalpost that names a barbell bench station from the equipment alone. */
export function rackUprights(cx: number, halfSpan: number, hookY: number, floorY: number): Primitive[] {
  const post = (s: 1 | -1): Primitive[] => {
    const x = cx + s * halfSpan;
    return [
      { kind: 'line', a: { x, y: hookY - 4 }, b: { x, y: floorY }, w: 3.5, color: 'ink3' },
      { kind: 'line', a: { x: x - 7, y: floorY }, b: { x: x + 7, y: floorY }, w: 2.5, color: 'ink3', cap: 'round' },
      // the J-hook: a short seat toward the bar, lipped up at its mouth
      { kind: 'polyline', pts: [{ x, y: hookY - 4 }, { x: x - s * 6.5, y: hookY - 4 }, { x: x - s * 6.5, y: hookY - 8 }], w: 2.5, color: 'ink3' },
    ];
  };
  return [...post(1), ...post(-1)];
}

/** A flat bench: pad from x0..x1 at `top`, with two legs to the floor. */
export function flatBench(x0: number, x1: number, top: number, floorY: number): Primitive[] {
  const legIn = 16;
  return [
    { kind: 'line', a: { x: x0 + legIn, y: top + 10 }, b: { x: x0 + legIn, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: x1 - legIn, y: top + 10 }, b: { x: x1 - legIn, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'rect', x: x0, y: top, width: x1 - x0, height: 10, rx: 4, fill: 'paper3', stroke: 'ink3', w: 2 },
  ];
}

/** A seat + back-pad unit for upright machines (chest press, shoulder press, pec deck…). */
export function machineSeat(seatCx: number, seatTop: number, floorY: number, back?: { x: number; y0: number; y1: number }): Primitive[] {
  const out: Primitive[] = [
    { kind: 'rect', x: seatCx - 19, y: seatTop, width: 38, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: seatCx, y: seatTop + 7 }, b: { x: seatCx, y: floorY - 3 }, w: 2.5, color: 'ink3' },
  ];
  if (back) out.push(...padStroke({ x: back.x, y: back.y0 }, { x: back.x, y: back.y1 }, 7));
  return out;
}

/** The scene floor line + shadow every side-view rig shares. */
export function floorScene(floorY: number, shadowCx: number, shadowRx: number): Primitive[] {
  return [
    { kind: 'line', a: { x: 20, y: floorY }, b: { x: 332, y: floorY }, w: 1.5, color: 'line1' },
    groundShadow(shadowCx, shadowRx, floorY),
  ];
}
