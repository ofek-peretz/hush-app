/**
 * press_vertical — all four members, presented FRONT-VIEW (`view: 'front'`), the canonical
 * camera for an overhead press. The rack position — elbows at ~90°, upper arms parallel to the
 * floor, forearms vertical — is a fold into DEPTH from the side (the humerus points at the
 * camera), so a side view cannot draw it; face-on it is the unmistakable "goalpost" start. The
 * Arnold rotation (palms-in → palms-forward) also only reads face-on.
 *
 * Template canon (§4.1): rack position → overhead lockout · vertical path · torso vertical ±3°
 * (no layback) · hips/knees fixed · head still · no hyperextension. rom 0 = rack, rom 1 =
 * lockout. The overhead reach is DERIVED from the canonical 172° lockout angle (as the bench
 * derives its lockout height) so the predicate holds by construction, never by a tuned factor.
 * The goalpost start is likewise 90° by construction: the grip line sits one upper-arm out from
 * the shoulder and one forearm up. The barbell member starts lower — bar at the chin, the
 * front-rack — because a bar cannot rest at ear height; its elbows are visibly bent under it.
 */

// 

import type { Decor, FormSpec, Pose, PosePredicate, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK, twoBoneIK3 } from '../geometry';
import { leads } from '../curves';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barbellFront, barPathTicks, dumbbellFront, floorScene, sampledPathTicks } from '../kit';
import { shoulderPressStation } from '../machines';
import { FLOOR_Y, seatedFrontCore } from '../bodies';

const CX = 176;
const core = seatedFrontCore(CX);
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
const LOCKOUT_ANGLE = 172;
const REACH = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((LOCKOUT_ANGLE * Math.PI) / 180));

/**
 * THE GIRDLE RISES WITH THE ARM, ON ITS OWN CLOCK (audit, 2026-09-03).
 *
 * Scapulohumeral rhythm: as the humerus goes overhead the scapula rotates up under it and the
 * shoulder joint itself climbs — the "reach up" every press is cued with. These members have a
 * `neckBase` separate from the shoulder joints, so the girdle CAN move here, and it did not: both
 * shoulders sat at travel 0 through the whole rep. 2.5u ≈ 3 cm; neckBase stays, so the torso bone
 * is untouched. The rise runs on `leads(0.2)` — done by rom 0.8 and held while the elbow finishes
 * the lockout, which is the sequence a press has (the shoulder rises before the elbow finishes)
 * and the one thing that separates a body from a mechanism bolted to one clock (iron rule 12).
 * The hand rides the girdle, so the 172° lockout still holds by construction.
 */
const GIRDLE_RISE = 2.5;
const GIRDLE_LEADS = leads(0.2);

/** The seat + back pad, front-on: pad edges show as slivers past the trunk. */
const frontSeat: Primitive[] = [
  { kind: 'rect', x: CX - 19, y: 104, width: 38, height: 52, rx: 8, fill: 'paper3', stroke: 'ink3', w: 2 },
  { kind: 'rect', x: CX - 26, y: 161, width: 52, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
  { kind: 'line', a: { x: CX - 18, y: 168 }, b: { x: CX - 18, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
  { kind: 'line', a: { x: CX + 18, y: 168 }, b: { x: CX + 18, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
];

interface VerticalPressParams {
  id: string;
  /** Hand x offset from the shoulder joint (grip half-width − 15.5). */
  gripDX: number;
  /**
   * Hand x offset at LOCKOUT, when the implement converges on the way up. Omitted means the path
   * is strictly vertical, which is right for anything on a bar or a rail.
   *
   * Two dumbbells are not on a bar. They start at the ears, a full upper-arm out from the shoulder,
   * and they converge over the crown — 65u apart at lockout for `topDX: 17`, a hand's width each
   * side of the head, not touching (a clang at the top is the thing coaches cue OUT). That
   * convergence is the arc, it is how a dumbbell press differs from a barbell one, and the members
   * were drawing both bells riding straight up parallel rails 40.5u apart for the whole rep.
   */
  topDX?: number;
  /**
   * The Arnold's mid-rep flare. The hand x runs as a quadratic through startDX -> midDX -> topDX
   * instead of a straight line, because an Arnold press does not travel in a straight line: it
   * starts with the bells IN FRONT of the chest, palms toward the face, sweeps OUT through the
   * goalpost as it rises, and converges again overhead.
   *
   * Without it the member opened in the identical goalpost the straight dumbbell press opens in,
   * and the only thing separating the two clips was the wrist rotation. The tucked start is half
   * of what the exercise IS.
   */
  midDX?: number;
  /**
   * The Arnold's rack, in DEPTH (audit, 2026-09-03). The bells start IN FRONT of the shoulders at
   * the chin, palms in, with the elbows hanging below and in front of them — the humerus points at
   * the camera. A flat IK cannot draw that: with the hand a chin's height above the shoulder, a 48u
   * arm has nowhere to fold but sideways, and the member opened as a front-double-biceps (elbow 25u
   * out at shoulder height, bells at eye level, elbow 50.6° under the 55° merge law). `tuckZ` is
   * how far in front of the shoulder line the hands start; the arm is solved in 3D and the tuck
   * unwinds to the page by rom 0.5, the same window the sweep (`midDX`) carries the bells out
   * through the goalpost — so the far end of the rep is the plain dumbbell press it should be.
   */
  tuckZ?: number;
  startY: number;
  start: PosePredicate[];
  implement: 'bar' | 'db' | 'machine';
  /** Wrist rotation across the rep (Arnold): spin at rom 0 → spin at rom 1. */
  spin?: { from: number; to: number };
}

function verticalPress(p: VerticalPressParams): Rig {
  const topDX = p.topDX ?? p.gripDX;
  const gripX = 15.5 + p.gripDX; // from the center line at the rack
  const topX = 15.5 + topDX; // …and at lockout
  // the lockout is measured from where the shoulder IS at lockout — one girdle-rise up
  const lockY = core.shoulderR.y - GIRDLE_RISE - Math.sqrt(REACH * REACH - topDX * topDX);
  const midX = p.midDX == null ? null : 15.5 + p.midDX;
  const handXAt = (rom: number) =>
    midX == null
      ? lerp(gripX, topX, rom)
      : (1 - rom) * (1 - rom) * gripX + 2 * (1 - rom) * rom * midX + rom * rom * topX;

  const poseAt = (rom: number): Pose => {
    const rise = GIRDLE_RISE * GIRDLE_LEADS(rom);
    const shoulderR: Vec2 = { x: core.shoulderR.x, y: core.shoulderR.y - rise };
    const shoulderL: Vec2 = { x: core.shoulderL.x, y: core.shoulderL.y - rise };
    const handY = lerp(p.startY, lockY, rom);
    const hx = handXAt(rom);
    const handR: Vec2 = { x: CX + hx, y: handY };
    const handL: Vec2 = { x: CX - hx, y: handY };
    if (p.tuckZ == null) {
      return {
        headR: ATHLETE.headR,
        j: {
          ...core,
          shoulderR,
          shoulderL,
          handR,
          handL,
          elbowR: twoBoneIK(shoulderR, handR, U, F, 1),
          elbowL: twoBoneIK(shoulderL, handL, U, F, -1),
          bar: { x: CX, y: handY },
        },
      };
    }
    // the tuck unwinds over the first half: smoothstep so the elbow neither snaps off the rack nor
    // arrives at the goalpost with a kink
    const t = Math.min(1, rom / 0.5);
    const s = t * t * (3 - 2 * t);
    const handZ = p.tuckZ * (1 - s);
    // the hint walks from "down and forward" (the elbow hanging under the bell, in front of the
    // ribs) to "out" (the goalpost's flat, outboard elbow — the 2D solver's own answer)
    const elbow3 = (side: 1 | -1, shoulder: Vec2, hand: Vec2) =>
      twoBoneIK3(
        { x: shoulder.x, y: shoulder.y, z: 0 },
        { x: hand.x, y: hand.y, z: handZ },
        U,
        F,
        { x: side * lerp(0.3, 1, s), y: lerp(1, 0.15, s), z: lerp(0.6, 0, s) },
      );
    const eR = elbow3(1, shoulderR, handR);
    const eL = elbow3(-1, shoulderL, handL);
    return {
      headR: ATHLETE.headR,
      j: {
        ...core,
        shoulderR,
        shoulderL,
        handR,
        handL,
        elbowR: { x: eR.x, y: eR.y },
        elbowL: { x: eL.x, y: eL.y },
        bar: { x: CX, y: handY },
      },
      z: { handR: handZ, handL: handZ, elbowR: eR.z, elbowL: eL.z },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const handR = pose.j.handR;
    const handL = pose.j.handL;
    // the complete station (§3.5 Amendments 4+5): short side pillars with the twin press-arm
    // linkages folding to the handles, and the fused side tower whose stack rises with the press
    const station: Primitive[] =
      p.implement === 'machine' ? shoulderPressStation(CX, gripX, handR.y, p.startY - handR.y) : [];
    // the rotation completes in the BOTTOM 60% of the press (where an Arnold actually rotates);
    // concentrating it in a shorter window is also what makes it READ as rotation in motion
    const spin = p.spin ? lerp(p.spin.from, p.spin.to, Math.min(1, rom / 0.6)) : 1;
    const front: Primitive[] =
      p.implement === 'bar'
        ? barbellFront(CX, handR.y)
        : p.implement === 'db'
          ? [...dumbbellFront(handL, spin), ...dumbbellFront(handR, spin)]
          : [
              { kind: 'line', a: { x: handL.x - 6, y: handL.y }, b: { x: handL.x + 6, y: handL.y }, w: 3.5, color: 'ink0', cap: 'round' },
              { kind: 'line', a: { x: handR.x - 6, y: handR.y }, b: { x: handR.x + 6, y: handR.y }, w: 3.5, color: 'ink0', cap: 'round' },
            ];
    const ticks =
      topDX === p.gripDX && p.midDX == null
        ? barPathTicks(CX + gripX + 13, p.startY, lockY)
        : sampledPathTicks(
            Array.from({ length: 13 }, (_, i) => {
              const t = i / 12;
              return { x: CX + handXAt(t) + 13, y: lerp(p.startY, lockY, t) };
            }),
          );
    return { back: [...frontSeat, ...station, ...ticks], front };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: p.start,
    end: [{ kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 165, max: 179, label: 'lockout overhead' }],
    path:
      topDX === p.gripDX && p.midDX == null
        ? { track: 'handR', kind: 'vertical', tol: 1.5 }
        : p.midDX == null
          ? { track: 'handR', kind: 'line', tol: 1.5, dir: { x: topX - gripX, y: lockY - p.startY } }
          : { track: 'handR', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'torso vertical (no layback)' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips on the seat' },
      { kind: 'pointFixed', point: 'kneeR', tol: 0.5, label: 'knees fixed' },
      { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'head still (the bar passes the face)' },
      { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: p.id,
    chains: {
      torso: ['hipC', 'neckBase'],
      neck: ['neckBase', 'head'],
      head: 'head',
      view: 'front',
      nearArm: ['shoulderR', 'elbowR', 'handR'],
      farArm: ['shoulderL', 'elbowL', 'handL'],
      nearLeg: ['hipR', 'kneeR', 'ankleR'],
      farLeg: ['hipL', 'kneeL', 'ankleL'],
      nearFoot: ['heelR', 'toeR'],
      farFoot: ['heelL', 'toeL'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, CX, 42),
  };
}

/** The goalpost rack: hand one upper-arm out, one forearm up ⇒ elbow 90°, upper arm horizontal. */
const GOALPOST_Y = core.shoulderR.y - F;
const goalpostStart = (label: string): PosePredicate[] => [
  { kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 80, max: 100, label: 'elbows at 90° — the rack position' },
  { kind: 'contactY', a: 'handR', y: GOALPOST_Y, tol: 2, label },
];

/*
 * bb_overhead_press USED TO LIVE HERE, seated on this builder's shared core, and it moved out to
 * `overheadPressStanding.ts` on 2026-08-29. Its card is `support: 'free'` and cues "Bar over the
 * mid-foot" — there is no mid-foot when you are sitting down — and with it seated the catalogue
 * held three seated overhead presses and no standing one at all. It also needed a camera these
 * others do not: every fault a military press is coached out of is front-to-back.
 *
 * The four members left here are seated on purpose and their cards say so.
 */

export const dbShoulderPress = verticalPress({
  id: 'db_shoulder_press',
  gripDX: U,
  topDX: 17, // the bells converge over the crown — the arc that makes it a dumbbell press
  startY: GOALPOST_Y,
  start: goalpostStart('dumbbells at the ears'),
  implement: 'db',
});

/**
 * THE Arnold: palms-in in FRONT of the chest, sweeping out and rotating to palms-forward overhead.
 * Both halves are drawn — the wrist spin (`spin`) and the sweep (`midDX`) — because either one
 * alone leaves the clip indistinguishable from `db_shoulder_press`.
 */
/** The chin: head centre 92 + radius 8. A bell at 92 was at the EYES (audit, 2026-09-03). */
const ARNOLD_RACK_Y = 100;
export const arnoldPress = verticalPress({
  id: 'arnold_press',
  gripDX: 5, // 10 → 5: bells straight in front of the shoulders, not out past them (audit, 2026-09-03)
  midDX: 26, // out through the goalpost as they rise
  topDX: 17, // and converging over the crown
  startY: ARNOLD_RACK_Y,
  tuckZ: 16, // hands a forearm's thickness in front of the chest wall; elbow lands 13u under the shoulder (audit, 2026-09-03)
  start: [
    { kind: 'contactY', a: 'handR', y: ARNOLD_RACK_Y, tol: 2, label: 'bells at the chin, in front of the shoulders' },
    /* The rack's projected elbow angle is ~27° — the humerus points at the lens, so the flat angle
       says nothing; what a viewer must see is the elbow HANGING, under the shoulder and under the
       bell, not out beside the shoulder as in a goalpost. (audit, 2026-09-03) */
    { kind: 'jointBelow', a: 'elbowR', b: 'shoulderR', by: 8, label: 'elbows hanging below the shoulders — the palms-in rack, not a goalpost' },
    { kind: 'jointBelow', a: 'elbowR', b: 'handR', by: 15, label: 'elbows under the bells' },
  ],
  implement: 'db',
  spin: { from: 0, to: 1 }, // palms-in at the start → palms-forward at lockout
});

export const machineShoulderPress = verticalPress({
  id: 'machine_shoulder_press',
  gripDX: U,
  startY: GOALPOST_Y,
  start: goalpostStart('handles at the shoulders'),
  implement: 'machine',
});

/**
 * smith_overhead_press (2026-08-25) — the barbell member ON RAILS. Same front-rack start, same
 * derived lockout; the machine's two uprights are drawn full-height either side, because the
 * rail is the smith's whole statement: the machine balances the bar, she presses it. Drawn by
 * wrapping the barbell rig's decor rather than re-authoring the press.
 */
export const smithOverheadPress: Rig = (() => {
  /*
   * THE PLATES LIVE OUTSIDE THE UPRIGHTS (audit, 2026-09-03). The rails stood at ±80 with the
   * plates at ±62 INSIDE them and the bar ending on the plates — drawn like that the bar read as a
   * cross-beam of the frame. A smith bar rides the uprights on a carriage and its sleeves, with
   * the plates, stick out past them. So: uprights at ±58 (≈131 cm apart, a real frame), plates at
   * ±72 outboard of them, the bar to ±78, and a carriage tab on each upright at bar height that
   * travels with it.
   */
  const RAIL_X = 58;
  const PLATE_X = 72;
  const RACK_Y = 106; // the lug the bar rotates onto, just under the front-rack line
  const RAILS: Primitive[] = ([1, -1] as const).flatMap((side) => [
    { kind: 'line', a: { x: CX + side * RAIL_X, y: 30 }, b: { x: CX + side * RAIL_X, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: CX + side * RAIL_X, y: RACK_Y }, b: { x: CX + side * (RAIL_X - 7), y: RACK_Y }, w: 2.5, color: 'ink3' },
  ]);
  const carriageAt = (y: number): Primitive[] =>
    ([1, -1] as const).map((side) => ({ kind: 'rect', x: CX + side * RAIL_X - 3, y: y - 4, width: 6, height: 8, rx: 1.5, fill: 'ink3', stroke: 'ink3', w: 1 }));
  const SMITH_RACK_Y = 98; // 100 → 98: the elbow opens 55.3° → ~58°, off the 55° merge threshold (audit, 2026-09-03)
  const base = verticalPress({
    id: 'smith_overhead_press',
    gripDX: 20,
    startY: SMITH_RACK_Y,
    start: [
      { kind: 'contactY', a: 'bar', y: SMITH_RACK_Y, tol: 2, label: 'bar at the chin — the front-rack' },
      { kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 45, max: 75, label: 'elbows bent under the bar' },
    ],
    implement: 'bar',
  });
  const decorAt = (rom: number): Decor => {
    const d = base.decorAt(rom);
    const barY = base.poseAt(rom).j.bar.y;
    return {
      back: [...RAILS, ...carriageAt(barY), ...d.back],
      // the base draws the free barbell (plates at ±62); the smith's plates sit outboard of the rails
      front: barbellFront(CX, barY, 78, PLATE_X),
    };
  };
  return { ...base, decorAt };
})();
