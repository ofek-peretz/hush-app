/**
 * Composes a full drawing for a rig at a given range-of-motion fraction: scene (floor) → equipment
 * behind → the Duotone figure → equipment in front. This single function is what the RN renderer,
 * the filmstrip, and the GIF page all call, so every surface shows byte-identical geometry.
 *
 * ── WHERE THE THIRD DIMENSION ENTERS ────────────────────────────────────────────────────────────
 * Depth is resolved HERE, before the skin ever runs, and that is the whole reason it could be added
 * to a shipping system safely. `skin.ts` still receives a flat pose and flat chains and is unchanged
 * by any of this; all it ever sees is the athlete already flattened onto the page.
 *
 * Two things happen when a rig supplies `pose.z`:
 *
 *   1. **Projection.** Every joint goes through the camera, so a bone turned toward the lens comes
 *      out SHORT because it genuinely is short on the page. That single property is what the flat
 *      system could never fake — its foreshortening had to be hand-authored per rig, and where the
 *      projected span passed through zero the hand-authoring degenerated (see `fly.ts`).
 *   2. **Sides are decided, not declared.** `chains.nearArm` / `farArm` are an AUTHORING default,
 *      not a fact: which arm is nearer depends on the pose and on where the camera is standing. So
 *      the chains are swapped per frame whenever the declared far side has come round in front.
 *
 * A rig that supplies no `z` and no azimuth projects through the identity and takes neither branch,
 * so it renders exactly as it did before this file learned about depth.
 *
 * ── DECOR ───────────────────────────────────────────────────────────────────────────────────────
 * `decorAt` returns primitives already in page space. At `azimuth: 0` that is correct and nothing
 * is required of a rig. A rig that orbits its camera owns the projection of its own equipment —
 * `camera.project` is exported for exactly that — because equipment depth is scene knowledge (how
 * wide the rack is, which upright is nearer) that only the rig has.
 */

//

import type { FigureChains, FigureSex, Pose, Primitive, Rig } from './types';
import { skinFigure } from './skin';
import { FLAT, meanDepth, projectJoints, type Camera, type Projected } from './camera';

/** The media frame's viewBox: a gentle uniform crop of the 352×220 authoring space (16:10). */
export const VIEWBOX = { x: 30, y: 26, w: 300, h: 187.5 } as const;

/** The scene's centre line — the vertical axis the camera orbits. */
const SCENE_CX = 176;

const depthOf = (j: Record<string, Projected>, names: string[] | undefined): number | null => {
  if (!names) return null;
  const pts = names.map((n) => j[n]).filter(Boolean);
  return pts.length ? meanDepth(pts) : null;
};

/**
 * Swap a declared near/far pair when the far one has come round in front. Returns the chains
 * untouched unless the depths actually disagree with the declaration by a real margin — a tie must
 * keep the authored order, or a rig sitting at z = 0 would flicker on floating-point noise.
 */
function resolveSides(chains: FigureChains, j: Record<string, Projected>): FigureChains {
  const nearArm = depthOf(j, chains.nearArm);
  const farArm = depthOf(j, chains.farArm);
  const nearLeg = depthOf(j, chains.nearLeg);
  const farLeg = depthOf(j, chains.farLeg);
  const armSwap = nearArm != null && farArm != null && farArm > nearArm + 0.5;
  const legSwap = nearLeg != null && farLeg != null && farLeg > nearLeg + 0.5;
  if (!armSwap && !legSwap) return chains;
  return {
    ...chains,
    ...(armSwap ? { nearArm: chains.farArm, farArm: chains.nearArm } : {}),
    ...(legSwap
      ? { nearLeg: chains.farLeg, farLeg: chains.nearLeg, nearFoot: chains.farFoot, farFoot: chains.nearFoot }
      : {}),
  };
}

/** Flatten a pose through a camera. Identity when the rig declares no depth and no orbit. */
export function projectPose(pose: Pose, cam: Camera): { pose: Pose; j: Record<string, Projected> } {
  const j = projectJoints(pose.j, pose.z, cam);
  const flat: Record<string, { x: number; y: number }> = {};
  for (const [n, p] of Object.entries(j)) flat[n] = { x: p.x, y: p.y };
  return { pose: { ...pose, j: flat, z: undefined }, j };
}

export function buildFrame(rig: Rig, rom: number, sex: FigureSex = 'male'): Primitive[] {
  const pose = rig.poseAt(rom);
  const cam: Camera = rig.camera ?? FLAT;
  // the overwhelmingly common case: a flat rig, drawn exactly as it always was
  if (cam.azimuth === 0 && !pose.z) {
    const decor = rig.decorAt(rom);
    return [...rig.scene, ...decor.back, ...skinFigure(pose, rig.chains, sex), ...decor.front];
  }
  /*
   * The orbit axis is READ OFF THE ATHLETE, not declared: it is the direction of his own spine in
   * the frame he was authored in. Standing, that is straight up and this changes nothing. Supine —
   * a dumbbell fly on a flat bench — his spine lies across the page, and orbiting the screen's
   * vertical would roll him rather than walk the camera around him. Deriving it means no rig has to
   * know, and none can get it wrong.
   */
  const hipA = pose.j[rig.chains.torso[0]];
  const shA = pose.j[rig.chains.torso[1]];
  const spine =
    hipA && shA && Math.hypot(shA.x - hipA.x, shA.y - hipA.y) > 1
      ? { x: shA.x - hipA.x, y: shA.y - hipA.y }
      : { x: 0, y: -1 };
  const resolved: Camera = {
    ...cam,
    pivotX: cam.pivotX || SCENE_CX,
    pivotY: cam.pivotY ?? (hipA && shA ? (hipA.y + shA.y) / 2 : undefined),
    axis: cam.axis ?? spine,
  };
  const { pose: flatPose, j } = projectPose(pose, resolved);
  const decor = rig.decorAt(rom, flatPose.j);
  const chains = resolveSides(rig.chains, j);
  // measured from the athlete's SIDE: a face-on rig starts at 90, a side rig at 0, and the orbit
  // adds to whichever it was authored in
  const viewDeg = (rig.chains.view === 'front' ? 90 : 0) + cam.azimuth;
  return [...rig.scene, ...decor.back, ...skinFigure(flatPose, chains, sex, viewDeg), ...decor.front];
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FRAME, FITTED TO WHAT IS ACTUALLY DRAWN (2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `VIEWBOX` is a fixed 16:10 crop of the authoring space and it is exactly right for the surfaces
 * it was built for: a film in a card, a thumbnail in a row, a gallery sheet — places where every
 * clip must occupy the same box so a list of them reads as a set.
 *
 * ⛔ IT IS THE WRONG BOX FOR A HERO ON A PORTRAIT PHONE, and the arithmetic is blunt. The stage is
 * 338 points wide, so a 16:10 frame is 211 tall whatever it is given — and a bench press only fills
 * 115 of the frame's 187.5 units of height, because the top of the frame is reserved for the rigs
 * that stand up. Measured on the live set stage: 230 points of the screen were air, inside a block
 * whose siblings are then distributed around it.
 *
 * So the box is fitted to the drawing: walk the rig once, take the bounding box of everything it
 * ever draws across a whole loop, pad it, and hand that back as the viewBox. A lying press gets a
 * wide short frame and fills it; a standing press gets a tall one. **The athlete is the same size
 * in both, because the frame moved instead of the figure.**
 *
 * ⚠️ THE SCENE IS EXCLUDED FROM THE MEASUREMENT AND STILL DRAWN. `floorScene` runs a rule the full
 * width of the authoring space; including it would make every frame 300 units wide again and defeat
 * the whole thing. It is a ground line, not content — it extends past the crop exactly as a floor
 * extends past a photograph.
 *
 * ⚠️ AND IT IS CACHED BY RIG IDENTITY. The walk is 24 `buildFrame` calls; doing it per render on a
 * screen that redraws at 24fps would cost more than the letter-boxing it saves. Rigs are module
 * constants, so a `Map` keyed on the object is stable for the life of the app.
 */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FRAME_CACHE = new Map<Rig, Frame>();

/** Padding around the drawing, in authoring units — enough that a stroke never touches the edge. */
const FRAME_PAD = 7;

function boundsOf(p: Primitive, push: (x: number, y: number) => void): void {
  switch (p.kind) {
    case 'line':
    case 'dash':
      push(p.a.x, p.a.y);
      push(p.b.x, p.b.y);
      return;
    case 'polyline':
    case 'poly':
      for (const q of p.pts) push(q.x, q.y);
      return;
    case 'quad':
      push(p.a.x, p.a.y);
      push(p.b.x, p.b.y);
      push(p.c.x, p.c.y);
      return;
    case 'circle':
      push(p.c.x - p.r, p.c.y - p.r);
      push(p.c.x + p.r, p.c.y + p.r);
      return;
    case 'ellipse':
      push(p.c.x - p.rx, p.c.y - p.ry);
      push(p.c.x + p.rx, p.c.y + p.ry);
      return;
    case 'rect':
      push(p.x, p.y);
      push(p.x + p.width, p.y + p.height);
      return;
    case 'path':
      push(p.start.x, p.start.y);
      for (const seg of p.segs) push(seg.to.x, seg.to.y);
      return;
    default:
      return;
  }
}

/** How many instants of the loop the box is measured over. The extremes of a rep are at its ends,
 *  but a rig with a curved path reaches furthest in the middle — so it is sampled, not endpointed. */
const FRAME_SAMPLES = 24;

export function tightFrame(rig: Rig): Frame {
  const hit = FRAME_CACHE.get(rig);
  if (hit) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const push = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  const skip = rig.scene.length; // the floor is ground, not content — see the note above
  for (let i = 0; i < FRAME_SAMPLES; i++) {
    const prims = buildFrame(rig, i / (FRAME_SAMPLES - 1), 'male');
    for (let k = skip; k < prims.length; k++) boundsOf(prims[k], push);
  }
  /* A rig that draws nothing but its scene cannot be measured; fall back to the shared frame rather
     than returning an infinite box that would collapse the SVG. */
  const frame: Frame = Number.isFinite(x0)
    ? { x: x0 - FRAME_PAD, y: y0 - FRAME_PAD, w: x1 - x0 + FRAME_PAD * 2, h: y1 - y0 + FRAME_PAD * 2 }
    : { ...VIEWBOX };
  FRAME_CACHE.set(rig, frame);
  return frame;
}

/**
 * ════ THE STAGE'S OWN FRAME — content-centred, and ONE SCALE FOR THE WHOLE CATALOGUE ════
 *
 * ⛔ `tightFrame` ALONE IS THE WRONG BOX FOR A HERO, and it took measuring to see why. Fitted
 * exactly, a barbell curl comes out 62 × 173 units and a bench press 156 × 125 — aspects of 0.36
 * and 1.24. Sized to a fixed-width stage those two draw the athlete at wildly different scales, so
 * she would visibly grow and shrink from lift to lift through a session. `anthro.ts` exists so that
 * *"all sixty demonstrations are visibly the same person"*, and a person whose size changes between
 * exercises is not that.
 *
 * So the box is a FIXED SIZE IN UNITS, moved to sit over each rig's content:
 *
 *   · 264 × 202 covers the whole catalogue — measured, the widest rig draws 260 units across
 *     (`cable_fly`) and the tallest 200 (`hanging_leg_raise`). Nothing is ever cropped.
 *   · Centring it on the CONTENT is what buys the space back. `VIEWBOX` reserves the top of the
 *     frame for the rigs that stand up, so every lying press paid for headroom it does not use;
 *     this box slides down over a bench press and up over a squat.
 *
 * Net on the live stage: the frame's aspect goes 1.60 → 1.31, so at 338 points of width it stands
 * 259 tall instead of 211, and the drawn athlete gains about 14 % — while every rig keeps the same
 * points-per-unit as every other.
 */
const STAGE_W = 264;
const STAGE_H = 202;

export function stageFrame(rig: Rig): Frame {
  const t = tightFrame(rig);
  return { x: t.x + t.w / 2 - STAGE_W / 2, y: t.y + t.h / 2 - STAGE_H / 2, w: STAGE_W, h: STAGE_H };
}

/** The aspect a caller must give its container so the fitted frame does not letter-box again. */
export const STAGE_FRAME_ASPECT = STAGE_W / STAGE_H;
