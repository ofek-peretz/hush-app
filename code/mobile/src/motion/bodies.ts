/**
 * Canonical body cores — the shared standing and seated joint sets, built once from ATHLETE
 * lengths, so every isolation and machine rig places the same person and only authors what its
 * template actually moves. All functions are pure and return fresh joint maps.
 */

// 

import type { Vec2 } from './types';
import { ATHLETE } from './anthro';

export const far = (p: Vec2, dx: number, dy = 0): Vec2 => ({ x: p.x + dx, y: p.y + dy });

export const FLOOR_Y = 193;

export interface CoreJoints {
  head: Vec2;
  shoulder: Vec2;
  hip: Vec2;
  knee: Vec2;
  ankle: Vec2;
  heel: Vec2;
  toe: Vec2;
}

/**
 * Standing tall at foot-center `x`: shank 37 near-vertical, thigh 40, trunk 48 vertical, neck 16.
 * Verified: |ankle→knee| 36.6 · |knee→hip| 40.1 · |hip→shoulder| 48 · |shoulder→head| 16.1.
 */
export function standingCore(x: number): CoreJoints {
  return {
    heel: { x: x - 10, y: FLOOR_Y },
    toe: { x: x + 15, y: FLOOR_Y },
    ankle: { x, y: 186 },
    knee: { x: x + 3, y: 149.5 },
    hip: { x, y: 109.5 },
    shoulder: { x: x + 1.5, y: 61.5 },
    head: { x: x + 2, y: 45.5 },
  };
}

/**
 * Seated FRONT-VIEW core (view: 'front'), symmetric about `cx` — the overhead-press camera.
 * Trunk 48 vertical (hipC → neckBase), neck 16; shoulder joints at ±15.5 (inside the frontal
 * trunk profile). Thighs point at the camera — heavily foreshortened by honest projection —
 * then shanks drop near-vertical (34.2 vs canonical 37, the seated-perspective compression)
 * to planted, slightly toed-out feet.
 */
export function seatedFrontCore(cx: number) {
  return {
    hipC: { x: cx, y: 156 },
    neckBase: { x: cx, y: 108 },
    head: { x: cx, y: 92 },
    shoulderR: { x: cx + 15.5, y: 110 },
    shoulderL: { x: cx - 15.5, y: 110 },
    hipR: { x: cx + 9, y: 156 },
    hipL: { x: cx - 9, y: 156 },
    /* 164, not 152 (2026-09-07): knees 4u ABOVE the hips drew every seated front figure with
       8.9u thighs — stubs. A seated thigh slopes down to the knee; 8u below is what a camera at
       chest height sees, and the shank foreshortens to the floor honestly. */
    kneeR: { x: cx + 17, y: 164 },
    kneeL: { x: cx - 17, y: 164 },
    ankleR: { x: cx + 19, y: 186 },
    ankleL: { x: cx - 19, y: 186 },
    heelR: { x: cx + 14, y: FLOOR_Y },
    toeR: { x: cx + 25, y: FLOOR_Y },
    heelL: { x: cx - 14, y: FLOOR_Y },
    toeL: { x: cx - 25, y: FLOOR_Y },
  };
}

/**
 * HINGED-SEATED front core — sat on the bench with the chest folded down over the thighs, which is
 * the position a bent-over reverse fly is DEFINED by and the only thing separating it from a
 * seated lateral raise.
 *
 * The pitch is a real rotation in depth, not a shortened line: the trunk turns `pitchDeg` forward
 * about the hip, so face-on it projects to a short torso with the head low and NEARER the camera,
 * which is exactly how a folded-over athlete looks from in front. Returns the depths alongside the
 * drawn points, because a body that leans has to say by how much — `z` is what makes the near/far
 * ink read the fold, and what stops the auditor from measuring a 20u trunk against a 48u bone.
 *
 * The arms are left where the caller puts them, and for this family that matters: an arm hanging
 * from a folded athlete still hangs STRAIGHT DOWN, and still opens to the sides, so its whole sweep
 * stays in the image plane and projects at full length. The fold costs the torso and nothing else.
 */
export function hingedSeatedCore(cx: number, pitchDeg: number) {
  const r = (pitchDeg * Math.PI) / 180;
  const up = { y: -Math.cos(r), z: Math.sin(r) }; // hip → neck: up, and forward toward the camera
  const HIP_Y = 150;
  const neckY = HIP_Y + up.y * ATHLETE.torso;
  const neckZ = up.z * ATHLETE.torso;
  const shY = neckY - up.y * 2;
  const shZ = neckZ - up.z * 2;
  return {
    j: {
      hipC: { x: cx, y: HIP_Y },
      neckBase: { x: cx, y: neckY },
      head: { x: cx, y: neckY + up.y * ATHLETE.neck },
      shoulderR: { x: cx + 15.5, y: shY },
      shoulderL: { x: cx - 15.5, y: shY },
      hipR: { x: cx + 9, y: HIP_Y },
      hipL: { x: cx - 9, y: HIP_Y },
      kneeR: { x: cx + 17, y: 150 },
      kneeL: { x: cx - 17, y: 150 },
      ankleR: { x: cx + 19, y: 186 },
      ankleL: { x: cx - 19, y: 186 },
      heelR: { x: cx + 14, y: FLOOR_Y },
      toeR: { x: cx + 25, y: FLOOR_Y },
      heelL: { x: cx - 14, y: FLOOR_Y },
      toeL: { x: cx - 25, y: FLOOR_Y },
    },
    z: {
      neckBase: neckZ,
      head: neckZ + up.z * ATHLETE.neck,
      shoulderR: shZ,
      shoulderL: shZ,
      /* The LEGS keep the plane the seated core has always drawn them in. Their thighs are already
         a documented foreshortening — they point at the lens — and pinning a depth to them without
         solving the knee from both bones just trades a silent approximation for a loud wrong
         number: at z 18 the shank measures 40.3 against a canonical 37. The fold is a fact about
         the TRUNK, and only the trunk states it. */
    },
  };
}

/**
 * Standing FRONT-VIEW core (view: 'front'), symmetric about `cx`. Unlike the seated front core,
 * the legs are fully in-plane: thigh 40 and shank ~36.5 at canonical length, feet planted
 * slightly toed-out. Same standing height as the side-view `standingCore`.
 */
export function standingFrontCore(cx: number) {
  return {
    hipC: { x: cx, y: 109.5 },
    neckBase: { x: cx, y: 61.5 },
    head: { x: cx, y: 45.5 },
    shoulderR: { x: cx + 15.5, y: 63.5 },
    shoulderL: { x: cx - 15.5, y: 63.5 },
    hipR: { x: cx + 9, y: 109.5 },
    hipL: { x: cx - 9, y: 109.5 },
    kneeR: { x: cx + 10.5, y: 149.5 },
    kneeL: { x: cx - 10.5, y: 149.5 },
    ankleR: { x: cx + 11.5, y: 186 },
    ankleL: { x: cx - 11.5, y: 186 },
    heelR: { x: cx + 8, y: FLOOR_Y },
    toeR: { x: cx + 21, y: FLOOR_Y },
    heelL: { x: cx - 8, y: FLOOR_Y },
    toeL: { x: cx - 21, y: FLOOR_Y },
  };
}

/**
 * SUPINE FRONT-VIEW core (view: 'front') — the head-end camera of §3.4 Amendment 7: the athlete
 * lies on an end-on bench, crown toward the viewer, symmetric about `cx`. The trunk chain is the
 * CHEST CROSS-SECTION (a short hipC→neckBase spine renders the frontal trunk profile as the lying
 * chest dome); the head rests on the pad in front of it; thighs straddle the bench, heavily
 * foreshortened by honest projection (the seated-front precedent), shins dropping to planted,
 * toed-out feet either side. `raise` lifts the shoulder line for incline benches; the head and
 * neck ride up with it (the reclined body approaches the camera, so its projection opens up).
 */
export function supineFrontCore(cx: number, raise = 0) {
  return {
    hipC: { x: cx, y: 158.5 },
    neckBase: { x: cx, y: 144.5 - raise },
    head: { x: cx, y: raise > 0 ? 120 - raise * 0.25 : 152 },
    shoulderR: { x: cx + 15.5, y: 147 - raise },
    shoulderL: { x: cx - 15.5, y: 147 - raise },
    hipR: { x: cx + 10, y: 158 },
    hipL: { x: cx - 10, y: 158 },
    /* 156, not 148 (2026-09-07): knees 10u ABOVE the hips read as a bench 39 cm high; a real bench
       (48 cm) puts the knee level with the hip and the projected thigh stops bulging over it. */
    kneeR: { x: cx + 21, y: 156 },
    kneeL: { x: cx - 21, y: 156 },
    ankleR: { x: cx + 27, y: 186 },
    ankleL: { x: cx - 27, y: 186 },
    heelR: { x: cx + 21, y: FLOOR_Y },
    toeR: { x: cx + 34, y: FLOOR_Y },
    heelL: { x: cx - 21, y: FLOOR_Y },
    toeL: { x: cx - 34, y: FLOOR_Y },
  };
}

/**
 * Seated on a machine seat (pad top ≈ 162), trunk upright with `leanDeg` back-lean (0 = vertical),
 * thighs forward to a knee just below hip height, shins down to planted feet — the lat-pulldown
 * body, parameterized. Positive `dx` slides the whole body right.
 */
export function seatedCore(dx = 0, leanDeg = 0): CoreJoints {
  const rad = (leanDeg * Math.PI) / 180;
  const hip: Vec2 = { x: 150 + dx, y: 157.5 };
  const shoulder: Vec2 = { x: hip.x - ATHLETE.torso * Math.sin(rad), y: hip.y - ATHLETE.torso * Math.cos(rad) };
  const head: Vec2 = { x: shoulder.x - ATHLETE.neck * Math.sin(rad) * 0.8, y: shoulder.y - ATHLETE.neck * Math.cos(rad * 0.8) };
  return {
    hip,
    shoulder,
    head,
    knee: { x: 189 + dx, y: 150 },
    ankle: { x: 198 + dx, y: 186 },
    heel: { x: 192 + dx, y: FLOOR_Y },
    toe: { x: 217 + dx, y: FLOOR_Y },
  };
}
