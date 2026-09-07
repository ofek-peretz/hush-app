/**
 * Lat Pulldown — Mechanic A benchmark (template: pull_vertical). The cable/machine case: it retires
 * the "can the equipment kit read?" risk alongside the two barbell lifts.
 *
 * Seated and anchored: glutes on the seat (the trunk silhouette meets the pad), thighs under the
 * pad, a fixed slight back-lean. Only the bar travels — vertically, in front of the face — and the
 * elbows follow by two-bone IK from the fixed shoulder, driving down-and-back. Full canonical arms
 * make the overhead stretch real: the bar starts 46u above the shoulder and stops at the collarbone
 * line, never lower (a chest-bounce endpoint would contradict the cue "Pull to the collarbone").
 *
 * Canon (MOTION_FORM_STANDARD_V1 §2/§4.1): full overhead stretch (elbow ~170°) → bar at the
 * collarbone, never lower · bar vertical in front of the face · torso lean frozen ~18° (no swing) ·
 * hips on the seat, thighs under the pad. rom 0 = overhead stretch (rep start); rom 1 = collarbone.
 *
 * Two rigs share this body and differ in the ATTACHMENT and the FINISH (audit, 2026-09-03): the wide
 * bar stops at the collarbone; the close-grip V-handle comes closer and lower, to the upper chest —
 * before that the two clips were the same skeleton to 0.00u and only a 12u triangle told them apart.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, floorScene } from '../kit';
import { latPulldownStation } from '../machines';

const FLOOR_Y = 193;

// ── seated, anchored body (torso leans back 18°) — none of this moves during the rep ──
const HIP: Vec2 = { x: 150, y: 157.5 }; // glutes meet the seat pad
/*
 * 18° of back-lean, not 15° (audit, 2026-09-03). The lean is the one lever that opens the finish:
 * the shoulder moves back and up, the same bar line is reached with a longer arm, and the elbow at
 * the collarbone opens from 56° (the merge threshold) to 58° with the elbow 16° clear of the trunk
 * line instead of 12°. The head keeps its 6° bias toward upright — tall chest, eyes on the bar.
 */
const LEAN = 18 * (Math.PI / 180);
const SHOULDER: Vec2 = { x: HIP.x - ATHLETE.torso * Math.sin(LEAN), y: HIP.y - ATHLETE.torso * Math.cos(LEAN) };
const HEAD: Vec2 = { x: SHOULDER.x - 16.2 * Math.sin(LEAN - 6 * (Math.PI / 180)), y: SHOULDER.y - 16.2 * Math.cos(LEAN - 6 * (Math.PI / 180)) };
const HEAD_R = 8;
const KNEE: Vec2 = { x: 189, y: 150 }; // canonical thigh, knee under the pad
const ANKLE: Vec2 = { x: 198, y: 186 };
const HEEL: Vec2 = { x: 192, y: FLOOR_Y };
const TOE: Vec2 = { x: 217, y: FLOOR_Y };

const UPPER = ATHLETE.upperArm;
const FORE = ATHLETE.foreArm;

/*
 * THE OVERHEAD STRETCH IS SOLVED AT ELBOW 164°, NOT 171°. Near a straight arm two-bone IK is
 * singular: the bar moved uniformly and the elbow leapt — 2.56u in one frame, the upper arm turning
 * 25° in the first 12 % of the rep and 4° in the last. Seven degrees of standing bend at the top
 * take the elbow off the singularity and it now leaves the line at the pace of everything else
 * (audit, 2026-09-03). Still arms-long overhead; the start predicate says so at 158°.
 */
const STRETCH_REACH = Math.sqrt(UPPER * UPPER + FORE * FORE - 2 * UPPER * FORE * Math.cos((164 * Math.PI) / 180));

/*
 * ONE CLOCK, DELIBERATELY. Per-joint timing (curves.ts) was tried on the bar here — `grindsIn(0.8)`
 * to move the elbow's forward wander earlier — and measured worse: a power curve is steep at rom 0,
 * and it multiplied the very elbow jump the 164° stretch had just removed (3.5u per 1/64 against
 * 1.1). With the shoulder girdle shared there is no second driver to sequence; the elbow is the
 * bar's own IK and the bar is the cable's straight line (audit, 2026-09-03).
 */

interface PulldownParams {
  id: string;
  /**
   * Where the cable drops, and therefore how far in front of the shoulder the hand finishes.
   *
   * It was 151 — 13.5u in front of the shoulder joint, and 8u in front of the face. Two things went
   * wrong there. The bar shaved the nose; and at the collarbone the hand sat 13.6u from its own
   * shoulder, so 48u of arm folded to a 33° elbow and the upper arm came to rest exactly ON the
   * spine line, inside the trunk silhouette. The clip's whole subject — the elbow driving down and
   * back — was drawn inside the torso where nobody can see it.
   *
   * The wide bar drops at 158: a hand's length clear of the face and 9.9u off the chest surface,
   * which is as close as a 48u arm can bring it while the elbow stays above the 55° merge (the
   * bar-to-chest contact a real pulldown makes is bounded by the arm's deliberate 14 % shortfall,
   * not by staging — every unit nearer costs 3° of elbow). The V-handle drops on the same line:
   * 156 was tried and the elbow dipped to 51° as the handle passed shoulder height — on a vertical
   * d in front of the shoulder the fold bottoms out at acos((U²+F²−d²)/2UF), and 55° needs d ≥ 22.3.
   */
  barX: number;
  /** The working endpoint: the collarbone (wide bar) or the upper chest (V-handle) — never lower. */
  endY: number;
  endLabel: string;
  /** The attachment in the fists — the attachment is a word (§3.5 Am. 5). */
  handle: (bar: Vec2) => Primitive[];
}

function pulldown(p: PulldownParams): Rig {
  const STRETCH_Y = SHOULDER.y - Math.sqrt(Math.max(0, STRETCH_REACH * STRETCH_REACH - (p.barX - SHOULDER.x) ** 2));
  const barAt = (rom: number): Vec2 => ({ x: p.barX, y: lerp(STRETCH_Y, p.endY, rom) });

  const poseAt = (rom: number): Pose => {
    const hand = barAt(rom);
    // bend +1 drives the elbow down-and-back as it flexes — the lat-pulldown path
    const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, 1);

    const far = (q: Vec2, dx: number, dy = 0): Vec2 => ({ x: q.x + dx, y: q.y + dy });
    return {
      headR: HEAD_R,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        elbow,
        hand,
        hip: HIP,
        knee: KNEE,
        ankle: ANKLE,
        heel: HEEL,
        toe: TOE,
        bar: hand,
        farShoulder: far(SHOULDER, 7, 2),
        farElbow: far(elbow, 7, 2),
        farHand: far(hand, 7, 2),
        farHip: far(HIP, 7, 1),
        farKnee: far(KNEE, 7),
        farAnkle: far(ANKLE, 8),
        farHeel: far(HEEL, 8),
        farToe: far(TOE, 8),
      },
    };
  };

  // ── the complete pulldown station (§3.5 Amendment 4 — recognition first) ─────────
  const decorAt = (rom: number): Decor => {
    const bar = barAt(rom);
    // the cable is 1:1 — the selected plate rises exactly as far as the bar descends
    const lift = bar.y - STRETCH_Y;
    return {
      back: [...latPulldownStation(bar, lift), ...barPathTicks(p.barX, STRETCH_Y, p.endY, 5)],
      front: p.handle(bar),
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 158, max: 179, label: 'full overhead stretch (elbow ~164°)' },
    ],
    end: [{ kind: 'contactY', a: 'bar', y: p.endY, tol: 2, label: p.endLabel }],
    path: { track: 'bar', kind: 'vertical', tol: 2 },
    invariants: [
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'torso lean frozen ~18° (no swing)' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips on the seat' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'thighs under the pad' },
      { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'neutral neck (head on the spine line)' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: p.id,
    chains: {
      torso: ['hip', 'shoulder'],
      neck: ['shoulder', 'head'],
      head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'],
      farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'],
      nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'],
      farFoot: ['farHeel', 'farToe'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 178, 42),
  };
}

export const latPulldown: Rig = pulldown({
  id: 'lat_pulldown',
  barX: 161, // 161, not 158 (2026-09-07): the arm grew to 27/25 and folded to 52° at the old finish; 3u more cable-to-shoulder opens the elbow to 60° at the collarbone
  endY: 113, // the collarbone line — the working endpoint (never lower)
  endLabel: 'bar to the collarbone (never lower)',
  // the wide pulldown bar with its downswept tips — the attachment is a word (§3.5 Am. 5):
  // this exact silhouette is what names the station's handle, so it is drawn, not a tick
  handle: (bar) => [
    {
      kind: 'polyline',
      pts: [
        { x: bar.x - 15.5, y: bar.y + 4 },
        { x: bar.x - 8.5, y: bar.y },
        { x: bar.x + 8.5, y: bar.y },
        { x: bar.x + 15.5, y: bar.y + 4 },
      ],
      w: 3.5,
      color: 'ink0',
    },
    { kind: 'circle', c: bar, r: 2.5, fill: 'ink0' },
  ],
});

/*
 * close_grip_pulldown (batch 2, 2026-08-26; restaged 2026-09-03) — the same seat, the same anchored
 * body, the same vertical cable: what changes at a close grip is the ATTACHMENT and where it stops.
 * The V-handle is drawn at its true width — ±9u (22 cm), 10u tall, a fist on each cheek with the far
 * one in the far-limb ink — because the old ±6u triangle was 15 px wide on a phone and the only
 * difference from the wide bar. And it finishes 10u lower, at the upper chest, with the elbow
 * passing behind the trunk line on the way: a neutral close grip brings the handle to the sternum,
 * not the collarbone.
 */
export const closeGripPulldown: Rig = pulldown({
  id: 'close_grip_pulldown',
  barX: 161, // with the wide bar's cable (2026-09-07)
  endY: 123, // the upper chest — 10u below the collarbone line, where a V-handle stops
  endLabel: 'handle to the upper chest (never lower)',
  handle: (bar) => [
    // the neutral V-handle: two cheeks meeting at the cable's eyelet
    {
      kind: 'polyline',
      pts: [
        { x: bar.x - 9, y: bar.y + 10 },
        { x: bar.x, y: bar.y },
        { x: bar.x + 9, y: bar.y + 10 },
      ],
      w: 3.5,
      color: 'ink0',
    },
    // both fists high on the cheeks, at the forearm's end — the far one in the far-limb ink
    { kind: 'circle', c: { x: bar.x - 3.2, y: bar.y + 3.6 }, r: 2.6, fill: 'ink4' },
    { kind: 'circle', c: { x: bar.x + 3.2, y: bar.y + 3.6 }, r: 2.6, fill: 'ink0' },
    { kind: 'circle', c: bar, r: 2.2, fill: 'ink0' }, // the eyelet
  ],
});
