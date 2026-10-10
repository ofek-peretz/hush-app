/**
 * The ORTHOGRAPHIC frontal chest-press exhibit — the strip that proved (2026-07-07) that under
 * orthographic projection a toward-camera press stroke leaves no pixels: fists never move,
 * elbows tuck slightly, only the stack plate rises — and played backward it renders identically
 * as a pull. This evidence is why the shipped frontal machine_chest_press (§3.4 Amendment 7,
 * founder directive 2026-07-08) draws under the PERSPECTIVE LICENSE instead: depth as scale.
 * NOT registered in the catalog; kept as the review page's "before".
 */
const path = require('path');
const BUILD = (process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build'));
const { buildFrame } = require(path.join(BUILD, 'frame.js'));
const { seatedFrontCore, FLOOR_Y } = require(path.join(BUILD, 'bodies.js'));
const { stackTower } = require(path.join(BUILD, 'machines.js'));
const { floorScene } = require(path.join(BUILD, 'kit.js'));
const { packPrim } = require('./prims');

const CX = 176;
const core = seatedFrontCore(CX);
const lerp = (a, b, t) => a + (b - a) * t;

// The orthographic endpoints: rom 0 — handles home at the chest, upper arms flared wide
// in-plane; rom 1 — lockout toward the camera: both segments foreshorten onto the shoulder
// line. Orthographically the press stroke leaves no pixels.
const E0 = { x: 27, y: 10 };
const H0 = { x: 14, y: 5 };
const E1 = { x: 4.5, y: 1.5 };
const H1 = { x: 7, y: 2.5 };

const STROKE = 32.5;

function poseAt(rom) {
  const arm = (side) => {
    const sh = side === 1 ? core.shoulderR : core.shoulderL;
    return {
      elbow: { x: sh.x + side * lerp(E0.x, E1.x, rom), y: sh.y + lerp(E0.y, E1.y, rom) },
      hand: { x: sh.x + side * lerp(H0.x, H1.x, rom), y: sh.y + lerp(H0.y, H1.y, rom) },
    };
  };
  const R = arm(1);
  const L = arm(-1);
  return {
    headR: 8,
    j: { ...core, elbowR: R.elbow, handR: R.hand, elbowL: L.elbow, handL: L.hand },
  };
}

const seat = [
  { kind: 'rect', x: CX - 19, y: 96, width: 38, height: 60, rx: 8, fill: 'paper3', stroke: 'ink3', w: 2 },
  { kind: 'rect', x: CX - 26, y: 161, width: 52, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
  { kind: 'line', a: { x: CX - 18, y: 168 }, b: { x: CX - 18, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
  { kind: 'line', a: { x: CX + 18, y: 168 }, b: { x: CX + 18, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
];

function decorAt(rom) {
  const { prims: tower } = stackTower({ x0: 254, x1: 276, capY: 88, stackTopY: 142 }, rom * STROKE);
  const pose = poseAt(rom);
  return {
    back: [...seat, ...tower, { kind: 'line', a: { x: CX + 26, y: 122 }, b: { x: 254, y: 122 }, w: 2.5, color: 'ink3' }],
    front: [1, -1].map((s) => {
      const h = s === 1 ? pose.j.handR : pose.j.handL;
      return { kind: 'line', a: { x: h.x, y: h.y - 6 }, b: { x: h.x, y: h.y + 6 }, w: 3.5, color: 'ink0', cap: 'round' };
    }),
  };
}

const rig = {
  id: 'orthographic_chest_press_exhibit',
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
  poseAt,
  decorAt,
  scene: floorScene(FLOOR_Y, CX, 42),
};

/** The 5-frame strip (packed prims), same rom stops as every card strip. */
function frontalStrip() {
  return [0, 0.25, 0.5, 0.75, 1].map((rom) => buildFrame(rig, rom).map(packPrim));
}

module.exports = { frontalStrip, rig };
