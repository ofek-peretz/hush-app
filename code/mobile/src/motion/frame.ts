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
import { ATHLETE } from './anthro';
import { twoBoneIK, twoBoneIK3 } from './geometry';

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

/** The four layers of a frame, kept apart — the auditor's frame law judges the athlete and the
 *  equipment by different rules (a crown needs air; a tower may run to the edge). */
export interface FrameParts {
  scene: Primitive[];
  back: Primitive[];
  figure: Primitive[];
  front: Primitive[];
}

export function buildFrame(rig: Rig, rom: number, sex: FigureSex = 'male'): Primitive[] {
  const p = frameParts(rig, rom, sex);
  return [...p.scene, ...p.back, ...p.figure, ...p.front];
}

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SHOULDER GIRDLE, DERIVED (execution pass, 2026-09-07)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 102 of 136 rigs use ONE joint for the top of the spine and the root of the arm, so the girdle
 * could not move: a row finished with no retraction, a press locked out with no protraction, an
 * overhead reach had no elevation — and the audit named that the second of four structural gaps.
 * Authoring a girdle into 136 files is a month; the rhythm itself is a law of the body, so it is
 * DERIVED here for every rig, on the drawn pose only:
 *
 *   · scapulohumeral rhythm — as the arm reaches up the trunk's axis, the girdle rises (≤ 3u ≈ 3 cm
 *     at full overhead reach), and settles as the arm comes down;
 *   · protraction / retraction — as the hand reaches out along the trunk's FRONT normal the girdle
 *     follows it forward (≤ 3u), and as it pulls behind the trunk line the girdle draws back.
 *
 * The arm's root is moved to a VIRTUAL joint (`shoulder~g`), so the neck and the trunk keep their
 * own top; the elbow is RE-SOLVED between the moved root and the unmoved hand on the side it was
 * authored on, so both arm bones stay canonical — nothing stretches. `poseAt` is untouched: every
 * FormSpec predicate, the auditor and the harness measure the authored skeleton, and the drawing
 * carries the rhythm. Front views take the elevation only — protraction is depth from there.
 */
const GIRDLE_ELEVATION = 3;
const GIRDLE_PROTRACTION = 3;

export function withGirdle(pose: Pose, chains: FigureChains): { pose: Pose; chains: FigureChains } {
  const hip = pose.j[chains.torso[0]];
  const top = pose.j[chains.torso[1]];
  if (!hip || !top) return { pose, chains };
  const sl = Math.hypot(top.x - hip.x, top.y - hip.y);
  if (sl < 1) return { pose, chains };
  const spine = { x: (top.x - hip.x) / sl, y: (top.y - hip.y) / sl };
  const facing = chains.facing ?? 1;
  const front = { x: -spine.y * facing, y: spine.x * facing }; // skin.ts's rot90, the athlete's front
  const isFront = chains.view === 'front';
  const REACH = ATHLETE.upperArm + ATHLETE.foreArm;
  const j: Record<string, { x: number; y: number }> = { ...pose.j };
  const z: Record<string, number> | undefined = pose.z ? { ...pose.z } : undefined;
  const next: FigureChains = { ...chains };

  const arm = (key: 'nearArm' | 'farArm') => {
    const names = chains[key];
    if (!names || names.length !== 3) return;
    const [rn, en, hn] = names;
    const R = pose.j[rn];
    const E = pose.j[en];
    const H = pose.j[hn];
    if (!R || !E || !H) return;
    /* Only an arm that LIVES IN THE DRAWING PLANE takes the rhythm. Nineteen flat rigs mime depth
       by authoring a short arm (a goblet's forearm pointing at the lens is 9u long on the page);
       re-solving that with canonical bones would un-mime it. A bone more than 1.5u off canonical
       is a mimed bone, and the arm is left exactly as its author drew it. */
    const zr0 = pose.z?.[rn] ?? 0;
    const ze0 = pose.z?.[en] ?? 0;
    const zh0 = pose.z?.[hn] ?? 0;
    const u0 = Math.hypot(E.x - R.x, E.y - R.y, ze0 - zr0);
    const f0 = Math.hypot(H.x - E.x, H.y - E.y, zh0 - ze0);
    if (Math.abs(u0 - ATHLETE.upperArm) > 1.5 || Math.abs(f0 - ATHLETE.foreArm) > 1.5) return;
    const rx = H.x - R.x;
    const ry = H.y - R.y;
    const along = Math.max(0, Math.min(1, (rx * spine.x + ry * spine.y) / REACH));
    const fwd = isFront ? 0 : Math.max(-1, Math.min(1, (rx * front.x + ry * front.y) / REACH));
    const dx = spine.x * along * GIRDLE_ELEVATION + front.x * fwd * GIRDLE_PROTRACTION;
    const dy = spine.y * along * GIRDLE_ELEVATION + front.y * fwd * GIRDLE_PROTRACTION;
    if (Math.abs(dx) + Math.abs(dy) < 0.05) return;
    const root = { x: R.x + dx, y: R.y + dy };
    const gr = `${rn}~g`;
    const ge = `${en}~g`;
    j[gr] = root;
    if (z && (z[rn] !== undefined || z[en] !== undefined || z[hn] !== undefined)) {
      const zr = z[rn] ?? 0;
      const ze = z[en] ?? 0;
      const zh = z[hn] ?? 0;
      const root3 = { x: root.x, y: root.y, z: zr };
      const hand3 = { x: H.x, y: H.y, z: zh };
      const mid = { x: (R.x + H.x) / 2, y: (R.y + H.y) / 2, z: (zr + zh) / 2 };
      const el = twoBoneIK3(root3, hand3, ATHLETE.upperArm, ATHLETE.foreArm, { x: E.x - mid.x, y: E.y - mid.y, z: ze - mid.z });
      j[ge] = { x: el.x, y: el.y };
      z[gr] = zr;
      z[ge] = el.z;
    } else {
      const a = twoBoneIK(root, H, ATHLETE.upperArm, ATHLETE.foreArm, 1);
      const b = twoBoneIK(root, H, ATHLETE.upperArm, ATHLETE.foreArm, -1);
      const da = Math.hypot(a.x - E.x, a.y - E.y);
      const db = Math.hypot(b.x - E.x, b.y - E.y);
      j[ge] = da <= db ? a : b;
    }
    next[key] = [gr, ge, hn];
  };
  arm('nearArm');
  arm('farArm');
  if (next.nearArm === chains.nearArm && next.farArm === chains.farArm) return { pose, chains };
  return { pose: { ...pose, j, z }, chains: next };
}

/*
 * THE GROUND SHADOW FOLLOWS THE BODY (execution pass, 2026-09-07). `kit.groundShadow` is a fixed
 * ellipse in the scene; a figure that leaves the floor — a pull-up rising, a dip, a hanging raise —
 * kept casting the same shadow, and the eye reads that as a figure glued to the ground. The
 * shadow now shrinks and fades with the lowest joint's clearance, which is the cheapest honest
 * statement of weight this drawing can make.
 */
function shadowFor(scene: Primitive[], pose: Pose): Primitive[] {
  let floorY = -Infinity;
  for (const p of scene) if (p.kind === 'line' && Math.abs(p.a.y - p.b.y) < 0.01 && Math.abs(p.a.x - p.b.x) > 200) floorY = Math.max(floorY, p.a.y);
  if (floorY === -Infinity) return scene;
  let lowest = -Infinity;
  for (const q of Object.values(pose.j)) if (q.y > lowest) lowest = q.y;
  const clearance = floorY - lowest;
  if (clearance < 3) return scene;
  const k = Math.max(0.35, 1 - clearance / 60);
  return scene.map((p) => (p.kind === 'ellipse' && p.ry <= 3 ? { ...p, rx: p.rx * k, opacity: (p.opacity ?? 1) * k } : p));
}

export function frameParts(rig: Rig, rom: number, sex: FigureSex = 'male'): FrameParts {
  const g = withGirdle(rig.poseAt(rom), rig.chains);
  const pose = g.pose;
  const chainsG = g.chains;
  const cam: Camera = rig.camera ?? FLAT;
  const scene = shadowFor(rig.scene, pose);
  // the overwhelmingly common case: a flat rig, drawn exactly as it always was
  if (cam.azimuth === 0 && !cam.elevation && !pose.z) {
    const decor = rig.decorAt(rom);
    const figure = skinFigure(pose, chainsG, sex);
    return { scene, back: decor.back, figure, front: headOver(decor.front, figure, pose, chainsG) };
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
  const figure = skinFigure(flatPose, chains, sex, viewDeg);
  return { scene, back: decor.back, figure, front: headOver(decor.front, figure, flatPose, chains) };
}

/*
 * THE HEAD IS NEVER UNDER THE EQUIPMENT (execution pass, 2026-09-07). A plate ghost on a bar held
 * across the back or on the chest rings the face on every squat, good morning, calf raise and
 * lying press; two rigs re-drew their head over it by hand and the rest did not. It is one rule,
 * so it lives here: when a translucent ring or disc in the front layer overlaps the head, the
 * head's own primitives are laid again on top of it. Nothing else in the drawing moves.
 */
export function headOver(front: Primitive[], figure: Primitive[], pose: Pose, chains: FigureChains): Primitive[] {
  const head = pose.j[chains.head];
  if (!head || !front.length) return front;
  const r = pose.headR;
  const covered = front.some((p) => p.kind === 'circle' && (p.fillOpacity ?? 1) < 0.5 && p.r >= 8 && Math.hypot(p.c.x - head.x, p.c.y - head.y) < p.r + r * 0.6);
  if (!covered) return front;
  const near = (q: { x: number; y: number }) => Math.hypot(q.x - head.x, q.y - head.y) <= r * 1.6;
  const headPrims = figure.filter((p) => {
    if (p.kind === 'circle') return p.fill === 'ink1' && near(p.c);
    if (p.kind === 'ellipse') return p.fill === 'ink1' && near(p.c);
    if (p.kind === 'path') return p.fill === 'ink1' && near(p.start);
    return false;
  });
  return headPrims.length ? [...front, ...headPrims] : front;
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
