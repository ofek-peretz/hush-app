/**
 * pull_up — the bar does not move. He does.
 *
 * ⛔ EIGHT EXERCISES ASSUMED THE BODY WAS THE ANCHOR. The pelvis was a constant, the trunk grew
 * from it, and an exercise's whole job was saying where the hands went. Nothing said so out loud
 * because nothing contradicted it — and a pull-up contradicts all of it. The hands are bolted to a
 * bar and the MAN travels, so the rig has to solve the inverse: given a hand that cannot move and
 * an elbow that must reach a stated angle, where does the body have to be?
 *
 * That is `originAt`, and it is the only genuinely new idea in the posture. Everything else — the
 * bones, the checks, the solver, the shadows — did not need to know.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, hanging, placeArms } = require('../athlete');

const ELBOW_TOP = 172, ELBOW_BOTTOM = 40;               // "top" is the dead hang a pull-up starts in
const OUT = 10;                                         // 1.53× shoulder width
const BAR_Y = -139, GRIP_Z = ATH.shoulderHalf + OUT;
const LEAN = 4, LEAN_TOP = 9, PROTRACT = 5, DROP = 4.5;

/** The vector from his shoulder to the bar — the one thing the elbow cue actually fixes. */
function armVec(rom) {
  const reach = reachFor(ELBOW_TOP + (ELBOW_BOTTOM - ELBOW_TOP) * rom);
  const fwd = 2;
  return V(fwd, -Math.sqrt(reach * reach - OUT * OUT - fwd * fwd), OUT);
}

/* Solve the body's position from the hand's, instead of the other way round. */
const spineOf = (rom) => {
  const a = (LEAN_TOP + (LEAN - LEAN_TOP) * rom) * Math.PI / 180;
  return norm(V(-Math.sin(a), -Math.cos(a), 0));
};
const PRO = norm(V(0.10, -0.96, 0.26));
function originAt(rom) {
  const hand = V(0, BAR_Y, GRIP_Z);
  const shoulder = sub(hand, armVec(rom));
  const o = sub(sub(sub(shoulder, mul(spineOf(rom), ATH.torso)), V(0, DROP, ATH.shoulderHalf)),
    mul(PRO, PROTRACT * (1 - rom)));
  /* ⛔ SOLVED FROM THE RIGHT SHOULDER, THE ORIGIN INHERITED THAT SHOULDER'S SIDEWAYS PROTRACTION
     AND THE WHOLE MAN SAT 1.3 UNITS OFF THE MIDLINE — every joint in his body asymmetric because
     one term in one vector had a z. A body's origin is on the centre line by definition. */
  return V(o.x, o.y, 0);
}

const body = hanging({ lean: LEAN, leanTop: LEAN_TOP, protract: PROTRACT, headTilt: 10, originAt });
const handleAt = (rom, s) => V(0, BAR_Y, s * GRIP_Z);   // the bar. It is not going anywhere.
const poleAt = (rom, s) => slerp(norm(V(0.28, 0.10, s * 0.95)), norm(V(0.50, 0.40, s * 0.77)), rom);

function poseAt(rom) {
  // rom 0 = dead hang; rom 1 = chin over the bar
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: V(0, 0, 1) };
}

function stationAt() {
  const P = [];
  const box = (c, h, tone) => P.push({ k: 'box', c, h, tone });
  P.push({ k: 'rod', a: V(0, BAR_Y, -52), b: V(0, BAR_Y, 52), r: 2.2, tone: 'rail' });
  for (const s of [1, -1]) {
    box(V(0, (FLOOR + BAR_Y) / 2, s * 56), [5, (FLOOR - BAR_Y) / 2, 5], 'frame');
    box(V(0, FLOOR - 3.4, s * 56), [26, 3.4, 6], 'frame');
    P.push({ k: 'rod', a: V(0, BAR_Y, s * 50), b: V(0, BAR_Y + 3, s * 56), r: 2.6, tone: 'frame' });
  }
  box(V(0, BAR_Y - 6, 0), [4, 4, 56], 'frame');
  return P;
}

const RECEIVERS = [
  { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 90, hv: 80, strength: 0.14, fade: 190 },
];

module.exports = {
  id: 'pull_up',
  title: 'מתח',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, -1, 0),
  airborne: true,                                       // his feet are off the floor
  bodyMoves: true,                                      // and it is the BODY that travels, not the hands
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [32, 52],
    topGrip: [1.3, 1.8], bottomGrip: [1.3, 1.8],
    axisShare: [0.6, 1.0],
    bodyTravel: [26, 48],
  },
  RECEIVERS,
  ATH, FLOOR,
  RAIL: { top: { R: handleAt(0, 1) }, bottom: { R: handleAt(1, 1) } },
  TRAVEL: 0,
};
