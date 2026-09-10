/**
 * machine_chest_press.
 *
 * Everything structural now lives in `athlete.js` and `station.js`. What is left here is what
 * actually distinguishes THIS exercise from the forty others built on the same hardware: how he
 * sits, where his hands start and finish, and which way his elbows are carried.
 *
 * That is the whole point of the split. This file is 60 lines; the monolith it replaced was 340,
 * and 280 of those were things every other machine exercise needs too.
 */
// @ts-nocheck

const { V, add, sub, mul, norm } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, seated, placeArms } = require('../athlete');
const { selectorised } = require('../station');

/* Lockout runs to 165°, not the 155° it started at: both sit inside `form.topElbow`, but the
   extra ten degrees are what make the top of the rep unmistakably a LOCKOUT rather than a
   slightly straighter bend, and contrast between the endpoints is a demonstration's whole job. */
const ELBOW_TOP = 165, ELBOW_BOTTOM = 90;
const GRIP = {
  top: { out: 4, down: 2 },       // 1.19× shoulder width at lockout
  bottom: { out: 9, down: 5 },    // 1.35× at the chest — the rails converge slightly
};

const body = seated({ lean: 16, leanTop: 10, protract: 7 });

/**
 * ⛔ THE PRESS ARM CANNOT BE A RIGID LEVER ON A PIVOT — four pivots were tried and each put the
 * handle either in front of his feet, above his head, or on the far side of his own body. That is
 * why real converging presses use a four-bar linkage; the honest simple equivalent, and what many
 * machines genuinely use, is a straight GUIDE RAIL with the handle on a carriage.
 *
 * Width and height are held at their authored hardware values; the FORWARD distance is whatever
 * satisfies the elbow cue at that instant, which makes 165° → 90° exact and monotonic by
 * construction rather than by hope.
 */
function handleEnd(rom, s) {
  const g = rom === 0 ? GRIP.top : GRIP.bottom;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  const fwd = Math.sqrt(reach * reach - g.out * g.out - g.down * g.down);
  return add(body.shoulderAt(rom, s), V(fwd, g.down, s * g.out));
}
const RAIL = { top: { R: handleEnd(0, 1), L: handleEnd(0, -1) },
               bottom: { R: handleEnd(1, 1), L: handleEnd(1, -1) } };
const handleAt = (rom, s) => {
  const k = s > 0 ? 'R' : 'L';
  return add(RAIL.top[k], mul(sub(RAIL.bottom[k], RAIL.top[k]), rom));
};

/* The elbow hangs down and slightly out at lockout, and is swept back and out at the chest. */
const poleAt = (rom, s) => slerp(norm(V(0, 1, s * 0.30)), norm(V(-0.56, 0.12, s * 0.82)), rom);

const GRIP_AXIS = V(0, 1, 0);                          // the handles are vertical
function poseAt(rom) {
  // rom 0 = lockout (a press starts at the top), rom 1 = the handles at the chest
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

const station = selectorised({ body, rail: RAIL, handleAt, gripAxis: GRIP_AXIS });

module.exports = {
  id: 'machine_chest_press',
  title: 'לחיצת חזה במכונה',
  poseAt,
  stationAt: station.partsAt,
  handleAt,
  pressAxis: V(1, 0, 0),                               // he drives FORWARD
  ...STANDARD,
  /**
   * ⚠ ANGLES ALONE ARE NOT A FORM SPEC, AND TWO BUGS SHIPPED THROUGH THE GAP THEY LEAVE. An elbow
   * angle names a CIRCLE of poses: a forearm hanging straight down and one reaching straight ahead
   * are both a flawless 90°, and they are 90° apart. The hands get asserted too.
   */
  form: {
    topElbow: [150, 178], bottomElbow: [82, 98],
    topGrip: [1.0, 1.35], bottomGrip: [1.25, 1.75],
    axisShare: [0.6, 1.0],                             // of travel, the part along the press axis
    handTravel: [26, 42],
  },
  RECEIVERS: station.receivers,
  ATH, FLOOR, RAIL, TRAVEL: station.TRAVEL,
};
