/**
 * kickback — hip EXTENSION standing: the leg driven straight back about a fixed hip while the
 * torso hinges slightly forward and holds. Side view (the split stance's camera, and the same
 * reason). The pattern's whole discipline is that the LOW BACK does not finish the movement —
 * the torso is frozen at its hinge and only the hip opens.
 *
 * ── MECHANISM ───────────────────────────────────────────────────────────────────────────────────
 * The working leg is a soft-kneed rigid unit (the lateral raise's arm, leg-sized): thigh and shank
 * hold one gentle bend and rotate together about the pinned hip, from under the body to extended
 * behind. The stance leg, the torso and the arms (braced on the frame/pad) are furniture.
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `cable_kickback`   — ankle cuffed to the low pulley IN FRONT; the stack rises as she drives.
 *   · `machine_kickback` — hips against the pad, foot on the platform lever from a floor pivot.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, floorScene, leverBar, padStroke, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far } from '../bodies';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;

/** The hinged, braced body: stance foot planted, torso ~30° forward, hands on the frame. */
const STANCE_ANKLE: Vec2 = { x: 148, y: 186 };
const HIP: Vec2 = { x: 152, y: 112 };
const SHOULDER: Vec2 = { x: 152 + ATHLETE.torso * 0.5, y: 112 - ATHLETE.torso * 0.855 };
const HEAD: Vec2 = { x: SHOULDER.x + 8, y: SHOULDER.y - 13.5 };
const STANCE_KNEE: Vec2 = { x: 150, y: 149 };
/** Where the braced hands are — and, once there is a frame to brace ON, where its handle is. */
const GRIP: Vec2 = { x: SHOULDER.x + 30, y: SHOULDER.y + 20 };

/**
 * THE FRAME SHE IS HOLDING.
 *
 * Both members hinge the torso 30 degrees forward and put the hands out in front, because that is
 * how the exercise is braced — and there was nothing there. The clip showed an athlete leaning into
 * empty air with both arms reaching at nothing, which is not a posture anybody holds and not a
 * station §3.5 would recognise. An upright with a grab handle at the hands is the whole fix: the
 * lean explains itself, the fists close on something, and the machine gets a frame to hang off.
 */
const SUPPORT_FRAME: Primitive[] = [
  { kind: 'line', a: { x: GRIP.x + 7, y: 54 }, b: { x: GRIP.x + 7, y: FLOOR_Y - 2 }, w: 3.5, color: 'ink3' },
  { kind: 'line', a: { x: GRIP.x - 8, y: FLOOR_Y - 2 }, b: { x: GRIP.x + 22, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
  // the grab handle itself, in the implement's own ink so the fists read as closed on it
  { kind: 'line', a: { x: GRIP.x - 8, y: GRIP.y }, b: { x: GRIP.x + 7, y: GRIP.y }, w: 3.5, color: 'ink0', cap: 'round' },
];

/** The working leg's reach from the hip (soft knee: a shade under thigh+shank). */
const LEG_REACH = (T + S) * 0.94;
/** θ from straight-down, opening BACKWARD (−x): 6° tucked under → 52° driven back and up. */
const THETA_FROM = 6;
const THETA_TO = 52;

/** The working ankle at sweep θ, with the soft knee riding just behind the hip→ankle line. */
function legAt(theta: number): { knee: Vec2; ankle: Vec2 } {
  const r = (theta * Math.PI) / 180;
  const ux = -Math.sin(r);
  const uy = Math.cos(r);
  const t = (T * 0.97) / LEG_REACH;
  const ankle: Vec2 = { x: HIP.x + LEG_REACH * ux, y: HIP.y + LEG_REACH * uy };
  return {
    knee: { x: lerp(HIP.x, ankle.x, t) + 3.5, y: lerp(HIP.y, ankle.y, t) },
    ankle,
  };
}

interface KickbackParams {
  id: string;
  implement: 'cable' | 'machine';
}

function kickback(p: KickbackParams): Rig {
  const ARC = Array.from({ length: 17 }, (_, i) => legAt(lerp(THETA_FROM, THETA_TO, i / 16)).ankle);
  const PULLEY: Vec2 = { x: 236, y: FLOOR_Y - 10 }; // low, in FRONT of her hinge

  const poseAt = (rom: number): Pose => {
    const { knee, ankle } = legAt(lerp(THETA_FROM, THETA_TO, rom));
    /* Arms braced forward on the frame — still, like the trunk they steady. */
    const elbow: Vec2 = { x: SHOULDER.x + 14, y: SHOULDER.y + 12 };
    const hand: Vec2 = GRIP;
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        /* The WORKING leg is the near leg — it is the lift. The stance leg is the far side. */
        knee,
        ankle,
        heel: { x: ankle.x - 4, y: ankle.y + 6 },
        toe: { x: ankle.x - 12, y: ankle.y + 9 },
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(STANCE_KNEE, -6, 1),
        farAnkle: far(STANCE_ANKLE, -6, 1),
        farHeel: far({ x: STANCE_ANKLE.x - 8, y: FLOOR_Y }, -6, 0),
        farToe: far({ x: STANCE_ANKLE.x + 15, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const back: Primitive[] = [...SUPPORT_FRAME, ...sampledPathTicks(ARC)];
    let front: Primitive[] = [];
    if (p.implement === 'cable') {
      const risen = rom * 18;
      const tower = stackTower({ x0: PULLEY.x + 8, x1: PULLEY.x + 34, capY: FLOOR_Y - 96, stackTopY: FLOOR_Y - 34 }, risen);
      back.push(...tower.prims, ...pulley(PULLEY));
      front = [cable(PULLEY, pose.j.ankle)];
    } else {
      /*
       * The hip pad she leans into, the platform lever under her foot from its floor pivot, and the
       * STACK — a selectorized machine whose resistance never appeared was naming nothing. The pad
       * runs down the front of the hip where she actually meets it, wide enough to read past her.
       */
      const pivot: Vec2 = { x: 122, y: FLOOR_Y - 6 };
      const tower = stackTower({ x0: GRIP.x + 14, x1: GRIP.x + 38, capY: 62, stackTopY: FLOOR_Y - 34 }, rom * 20);
      back.push(
        ...tower.prims,
        { kind: 'line', a: { x: GRIP.x + 7, y: 74 }, b: { x: GRIP.x + 14, y: 74 }, w: 2.5, color: 'ink3' },
        ...padStroke({ x: HIP.x + 10, y: HIP.y - 8 }, { x: HIP.x + 10, y: HIP.y + 18 }, 11),
        ...leverBar(pivot, { x: pose.j.ankle.x + 2, y: pose.j.ankle.y + 6 }),
      );
      front = padStroke({ x: pose.j.ankle.x - 6, y: pose.j.ankle.y + 6 }, { x: pose.j.ankle.x + 8, y: pose.j.ankle.y + 6 }, 7);
    }
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactY', a: 'ankle', y: legAt(THETA_FROM).ankle.y, tol: 2, label: 'the working foot under you' },
    ],
    end: [
      { kind: 'contactY', a: 'ankle', y: legAt(THETA_TO).ankle.y, tol: 2.5, label: 'driven back — squeeze the glute' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 150, max: 176, label: 'the knee stays soft — the hip does the work' },
    ],
    path: { track: 'ankle', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the hip is the hinge, and it stays put' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the low back does not finish it — the torso holds its hinge' },
      { kind: 'pointFixed', point: 'farAnkle', tol: 0.5, label: 'the stance foot is planted' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 177, label: 'the knee never snaps straight' },
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
    scene: floorScene(FLOOR_Y, 168, 40),
  };
}

export const cableKickback = kickback({ id: 'cable_kickback', implement: 'cable' });
export const machineKickback = kickback({ id: 'machine_kickback', implement: 'machine' });

/*
 * donkey_kick (batch 2, 2026-08-26) — the kickback taken to the floor: QUADRUPED, on hands and
 * knees, the working leg driving its heel toward the ceiling with the knee HELD at 90°.
 *
 * ── MECHANISM ───────────────────────────────────────────────────────────────────────────────────
 * The standing kickback's rigid working unit, with the bend fixed at a right angle instead of
 * soft: thigh and shank are authored PERPENDICULAR by construction (the interior knee angle is
 * exactly 90° at every θ — the dot product is zero on paper), and the whole L-shape rotates about
 * the pinned hip from tucked-under to driven-up. Everything else — the flat back, the planted
 * hands, the kneeling support leg — is furniture, exactly as the standing member's stance is.
 *
 * ── WHAT THE INVARIANTS FORBID ──────────────────────────────────────────────────────────────────
 *   1. **Arching to finish.** The one fault every coach corrects here: the low back taking over
 *      at the top. The hip is pinned and the torso's angle is frozen — the back cannot arch.
 *   2. **Opening the knee.** A straightening knee turns this into the standing kickback and robs
 *      the top of its squeeze. `jointAngle` holds ~90° at BOTH endpoints; `angleNever` polices it.
 *   3. **Rocking onto the hands.** The support hand and knee are `pointFixed`.
 */
export const donkeyKick: Rig = (() => {
  const HIP: Vec2 = { x: 168, y: 153 };
  const SHOULDER: Vec2 = { x: 215.8, y: 150.8 }; // torso ~flat: |hip→shoulder| ≈ 48, back level
  const HEAD: Vec2 = { x: 231.7, y: 150.1 }; // continues the flat-back line
  /* The planted near arm, straight down from the shoulder to the mat. */
  const HAND: Vec2 = { x: 219, y: 191 };
  const ELBOW: Vec2 = { x: 217.5, y: 171 };
  /* The kneeling support (far) leg: knee down, shin flat on the mat behind. */
  const FAR_KNEE: Vec2 = { x: 171, y: 189 };
  const FAR_ANKLE: Vec2 = { x: 135, y: 189 };

  /** Thigh sweep from straight-down, opening BACKWARD (−x) and up: tucked → driven to the top. */
  const THETA_FROM = 18;
  const THETA_TO = 105;

  /** The L-shaped working leg at sweep θ: thigh from the hip, shank held perpendicular. */
  function legAt(theta: number): { knee: Vec2; ankle: Vec2; u: Vec2; s: Vec2 } {
    const r = (theta * Math.PI) / 180;
    const u: Vec2 = { x: -Math.sin(r), y: Math.cos(r) }; // thigh direction, hip → knee
    const s: Vec2 = { x: -Math.cos(r), y: -Math.sin(r) }; // shank ⟂ thigh: back at the tuck, up at the top
    const knee: Vec2 = { x: HIP.x + T * u.x, y: HIP.y + T * u.y };
    return { knee, ankle: { x: knee.x + S * s.x, y: knee.y + S * s.y }, u, s };
  }
  const ARC = Array.from({ length: 17 }, (_, i) => legAt(lerp(THETA_FROM, THETA_TO, i / 16)).ankle);

  const poseAt = (rom: number): Pose => {
    const { knee, ankle, u, s } = legAt(lerp(THETA_FROM, THETA_TO, rom));
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee,
        ankle,
        /* The foot rides the shank: heel just past the ankle, toes dorsiflexed along the thigh line. */
        heel: { x: ankle.x - 3 * s.x, y: ankle.y - 3 * s.y },
        toe: { x: ankle.x + 9 * u.x, y: ankle.y + 9 * u.y },
        elbow: ELBOW,
        hand: HAND,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(ELBOW, -6, 1),
        farHand: far(HAND, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: FAR_KNEE,
        farAnkle: FAR_ANKLE,
        farHeel: { x: FAR_ANKLE.x - 4, y: FAR_ANKLE.y - 2 },
        farToe: { x: FAR_ANKLE.x - 11, y: FAR_ANKLE.y + 2 },
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...sampledPathTicks(ARC)], front: [] });

  const kneeAt90 = (label: string): FormSpec['start'][number] => ({
    kind: 'jointAngle',
    joint: 'knee',
    neighbors: ['hip', 'ankle'],
    min: 80,
    max: 100,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactY', a: 'ankle', y: legAt(THETA_FROM).ankle.y, tol: 2.5, label: 'knee tucked under the hip, shin level' },
      kneeAt90('the knee starts at its right angle'),
    ],
    end: [
      { kind: 'contactY', a: 'ankle', y: legAt(THETA_TO).ankle.y, tol: 2.5, label: 'heel driven to the ceiling — squeeze' },
      kneeAt90('and holds it at the top — the hip did the work'),
    ],
    path: { track: 'ankle', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the hip is the hinge, and it stays put' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the back stays flat — no arching to finish' },
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'hands planted under the shoulders' },
      { kind: 'pointFixed', point: 'farKnee', tol: 0.5, label: 'the support knee stays down' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 110, label: 'the knee never opens — that would be a kickback' },
    ],
  };

  return {
    id: 'donkey_kick',
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
    scene: floorScene(FLOOR_Y, 176, 46),
  };
})();
