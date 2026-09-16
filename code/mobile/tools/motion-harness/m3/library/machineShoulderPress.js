/**
 * machine_shoulder_press — the second exercise, and the one that proves the split was real.
 *
 * It shares the athlete, the seated posture, the frame, the seat, the pad, the rails, the
 * carriages, the grips, the cable routing, the pulleys and the whole weight stack with the chest
 * press. What it does NOT share is four numbers and a direction: he sits more upright, his
 * shoulders shrug UP rather than forward, and he drives overhead instead of ahead.
 *
 * If adding this had meant another 340-line file, the architecture would have been wrong.
 */
// @ts-nocheck

const { V, add, sub, mul, norm } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, seated, placeArms } = require('../athlete');
const { selectorised } = require('../station');

/**
 * ⛔ THE FINISH ANGLE WAS COPIED FROM THE CHEST PRESS AND IT WAS THE WRONG CUE. 90° is right for a
 * horizontal press; on an overhead press it puts the hands 34 units ABOVE the shoulder at the
 * BOTTOM of the rep — nowhere near the ears, where a shoulder press actually finishes. The real
 * bottom is 60–70°, which is also most of why the rep looked short: the correct cue buys ten more
 * units of travel. Copying a form window between exercises is the same mistake as copying a rig.
 */
const ELBOW_TOP = 168, ELBOW_BOTTOM = 64;
const GRIP = {
  top: { out: 8, fwd: 3 },        // 1.42× shoulder width overhead — the rails converge on the way up
  bottom: { out: 14, fwd: 4 },    // 1.74× at the ears
};

/**
 * Upright, because you cannot press overhead from a recline. The scapulae travel UP rather than
 * forward — an overhead lockout finishes with a shrug, and that shrug is several units of the
 * rep's range, exactly as protraction is on a horizontal press.
 */
const body = seated({
  lean: 8, leanTop: 4, protract: 6,
  proDir: (s) => norm(V(0.12, -0.94, s * 0.31)),
  ankle: (rom, s) => add(V(40, FLOOR - 6.5, s * 13), mul(V(-0.7, -1.4, 0), 1 - rom)),
  toe: (rom, s) => V(55, FLOOR - 3, s * 12.5),
});

/** Height above the shoulder is what the elbow cue buys here; width and depth are the hardware. */
function handleEnd(rom, s) {
  const g = rom === 0 ? GRIP.top : GRIP.bottom;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  const up = Math.sqrt(reach * reach - g.out * g.out - g.fwd * g.fwd);
  return add(body.shoulderAt(rom, s), V(g.fwd, -up, s * g.out));
}
const RAIL = { top: { R: handleEnd(0, 1), L: handleEnd(0, -1) },
               bottom: { R: handleEnd(1, 1), L: handleEnd(1, -1) } };
const handleAt = (rom, s) => {
  const k = s > 0 ? 'R' : 'L';
  return add(RAIL.top[k], mul(sub(RAIL.bottom[k], RAIL.top[k]), rom));
};

/* Overhead the elbow is carried forward and out; at the ears it drops down and out. */
const poleAt = (rom, s) => slerp(norm(V(0.55, 0.12, s * 0.83)), norm(V(0.30, 0.86, s * 0.42)), rom);

const GRIP_AXIS = V(1, 0, 0);                          // neutral handles, running fore-and-aft
function poseAt(rom) {
  // rom 0 = overhead lockout, rom 1 = the handles down at his ears
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

const station = selectorised({
  body, rail: RAIL, handleAt, gripAxis: GRIP_AXIS,
  railOff: (s) => V(0, 0, s * 9),                      // a vertical rail rides beside, not below
  padUp: 19, padHalfLen: 23, padHalfW: 15, padOut: 12.6,
  seatC: V(2, 12.6, 0),
});

module.exports = {
  id: 'machine_shoulder_press',
  title: 'לחיצת כתפיים במכונה',
  poseAt,
  stationAt: station.partsAt,
  handleAt,
  pressAxis: V(0, -1, 0),                              // he drives UP
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [56, 76],
    topGrip: [1.2, 1.6], bottomGrip: [1.5, 2.0],
    axisShare: [0.6, 1.0],
    handTravel: [26, 44],
  },
  RECEIVERS: station.receivers,
  ATH, FLOOR, RAIL, TRAVEL: station.TRAVEL,
};
