/**
 * THE CHECK THAT WOULD HAVE CAUGHT IT.
 *
 *   node tools/motion-harness/m3/check.js [id]
 *
 * Every earlier check in this system measured joint ANGLES, and every angle passed while the
 * figure did the wrong exercise twice — once with a forearm hanging straight down, once with the
 * hands opening sideways into a fly. An angle names a circle of poses; it cannot tell them apart.
 *
 * So this asserts POSITION: where the hands are, how far apart, and which way they travel. And it
 * runs over the WHOLE LIBRARY, because a shared athlete and a shared station mean a change made
 * for one exercise can now break another — which is the price of not copying them, and a price
 * worth paying only if something watches for it.
 */
// @ts-nocheck

const { add, sub, mul, len, dot, norm, angle3 } = require('./core');
const { makeClearance } = require('./solids');
const { bestCamera } = require('./solve');
const { RIGS, byId } = require('./library');

const only = process.argv[2];
const rigs = only ? [byId[only]].filter(Boolean) : RIGS;
if (!rigs.length) { console.error('no such rig: ' + only); process.exit(2); }

let failedTotal = 0;

/**
 * ⛔ THE FIRST THING THIS DOES IS PROVE ITS OWN INSTRUMENT CAN FAIL. `clearance` returned a
 * confident 1.000 for every rig at every camera for its entire life — its point-in-hull test was
 * written for a clockwise polygon while the hull builder produced counter-clockwise ones, so no
 * sample was ever occluded by anything. Every machine that stood in front of the athlete was
 * found by eye and credited to a term that was returning a constant.
 * A metric that cannot fail is not a metric. This plants a slab the size of a door between the
 * lens and the man, and refuses to run the library until the number moves.
 */
(function selfTest() {
  const { camera, V } = require('./core');
  const probe = { ...RIGS[0], stationAt: () => [{ k: 'box', c: V(60, -30, 0), h: [3, 60, 60], tone: 'frame' }] };
  const poses = [probe.poseAt(0), probe.poseAt(0.5), probe.poseAt(1)];
  const blocked = makeClearance(probe)(camera(90, 8), poses);
  const open = makeClearance({ ...RIGS[0], stationAt: () => [] })(camera(90, 8), poses);
  if (!(blocked < 0.35 && open > 0.99)) {
    console.error('\n  CLEARANCE IS BLIND: blocked=' + blocked.toFixed(3) + ' open=' + open.toFixed(3) + '\n');
    process.exit(2);
  }
  console.log('\n  clearance self-test: blocked ' + blocked.toFixed(3) + ' · open ' + open.toFixed(3) + '  OK');
})();

for (const rig of rigs) {
  const f = rig.form, rows = [];
  let failed = 0;
  const check = (label, value, [lo, hi], unit = '') => {
    const ok = value >= lo && value <= hi;
    if (!ok) { failed++; failedTotal++; }
    rows.push((ok ? '  PASS  ' : '  FAIL  ') + label.padEnd(30) +
      value.toFixed(2).padStart(7) + unit.padEnd(7) + ' want ' + lo + '…' + hi);
  };

  const N = 25;
  const p0 = rig.poseAt(0), p1 = rig.poseAt(1);

  /* ⛔ A GRIP OFFSET LARGER THAN THE ARM'S OWN REACH MAKES A SQUARE ROOT IMAGINARY, and NaN then
     spreads silently: every window comparison against it is false, so the rig fails with twelve
     confusing messages instead of one true one. Catch it first and say what it is. */
  let nan = 0;
  for (let i = 0; i < N; i++) {
    const p = rig.poseAt(i / (N - 1));
    for (const k of Object.keys(p.j)) if (![p.j[k].x, p.j[k].y, p.j[k].z].every(Number.isFinite)) nan++;
  }
  check('joints that are a number', nan, [0, 0]);
  const shoulderW = Math.abs(p0.j.shoulderR.z - p0.j.shoulderL.z);
  const gripAt = (p) => Math.abs(p.j.wristR.z - p.j.wristL.z) / shoulderW;
  const elbowAt = (p) => angle3(p.j.shoulderR, p.j.elbowR, p.j.wristR);

  check('elbow at lockout', elbowAt(p0), f.topElbow, ' deg');
  check('elbow at the finish', elbowAt(p1), f.bottomElbow, ' deg');
  /* ⛔ HALF THE CHECKS BELOW ASK ABOUT A MATCHED PAIR, and a one-arm row does not have one. Grip
     width, the mirror, separation and levelness were all written when every exercise in the
     library was symmetric — which was true right up until it was not. A unilateral rig answers
     the questions that still mean something and is asked different ones instead. */
  if (!rig.unilateral) {
    check('grip width at lockout', gripAt(p0), f.topGrip, ' x');
    check('grip width at the finish', gripAt(p1), f.bottomGrip, ' x');
  }

  /* ⛔ THIS USED TO BE HARD-CODED AS "how much of the travel is FORWARD", which is only the right
     question for a horizontal press. A shoulder press drives UP and would have failed a correct
     rep. Each rig declares its own press axis and the share is measured along that. */
  /* ⛔ "HAND TRAVEL" WAS THE WRONG QUESTION FOR A PULL-UP and would have measured zero on a
     perfect rep. When the bar is the anchor it is the BODY that travels, so the rig says which it
     is and the same window is applied to whichever one actually moves. */
  const d = rig.bodyMoves ? sub(p1.j.pelvis, p0.j.pelvis) : sub(p1.j.wristR, p0.j.wristR);
  check('travel along the press axis', Math.abs(dot(d, norm(rig.pressAxis))) / len(d), f.axisShare);
  check(rig.bodyMoves ? 'body travel' : 'hand travel', len(d), f.bodyTravel || f.handTravel, ' units');

  if (rig.bodyMoves) {
    let handDrift = 0;
    for (let i = 0; i < N; i++) handDrift = Math.max(handDrift, len(sub(rig.poseAt(i / (N - 1)).j.wristR, p0.j.wristR)));
    check('hands off the bar', handDrift, [0, 0.15], ' units');
  }

  /* the hand must stay ON the rail — a carriage cannot leave its track */
  let offRail = 0;
  const rA = rig.RAIL.top.R, axis = sub(rig.RAIL.bottom.R, rA), aLen = len(axis);
  for (let i = 0; i < N; i++) {
    const w = sub(rig.poseAt(i / (N - 1)).j.wristR, rA);
    const t = dot(w, axis) / (aLen * aLen);
    offRail = Math.max(offRail, len(sub(w, { x: axis.x * t, y: axis.y * t, z: axis.z * t })));
  }
  /* A CARRIAGE cannot leave its track. A BARBELL has no track — its path is a real arc through
     the air — so the straight-line test is simply the wrong question to ask of one. */
  if (!rig.barbell && !rig.bodyMoves) check('hand off the rail', offRail, [0, 0.15], ' units');

  /* the cue has to be monotonic — a rep that closes past its own finish and reopens is the chord
     bug, and it is invisible in an endpoint-only check */
  let worstBack = 0;
  for (let i = 1; i < N; i++) {
    worstBack = Math.max(worstBack, elbowAt(rig.poseAt(i / (N - 1))) - elbowAt(rig.poseAt((i - 1) / (N - 1))));
  }
  check('elbow never re-opens mid-rep', worstBack, [0, 0.5], ' deg');

  /* Bone lengths are a constraint, not a suggestion — and this watched the ARM ONLY for the whole
     life of the previous system, which is how its legs came to break both of their own bones. */
  let worstBone = 0, footGap = 0, worstMirror = 0;
  for (let i = 0; i < N; i++) {
    const p = rig.poseAt(i / (N - 1));
    for (const [a, b, want] of [
      ['shoulderR', 'elbowR', rig.ATH.upperArm], ['elbowR', 'wristR', rig.ATH.foreArm],
      ['shoulderL', 'elbowL', rig.ATH.upperArm], ['elbowL', 'wristL', rig.ATH.foreArm],
      ['hipR', 'kneeR', rig.ATH.thigh], ['kneeR', 'ankleR', rig.ATH.shank],
      ['hipL', 'kneeL', rig.ATH.thigh], ['kneeL', 'ankleL', rig.ATH.shank],
    ]) worstBone = Math.max(worstBone, Math.abs(len(sub(p.j[b], p.j[a])) - want));
    footGap = Math.max(footGap, Math.abs(p.j.toeR.y - (rig.FLOOR - 3)));
    /* ⛔ THIS WATCHED elbow, wrist AND knee ONLY, and the shoulder press shipped with BOTH FEET
       ON THE MIDLINE — a toe written without its side factor. A mirror check that skips a joint
       is not a mirror check; it lists every one the body has. */
    for (const k of rig.unilateral ? ['hip', 'ankle', 'toe'] : ['elbow', 'wrist', 'knee', 'shoulder', 'hip', 'ankle', 'toe']) {
      worstMirror = Math.max(worstMirror,
        Math.abs(p.j[k + 'R'].x - p.j[k + 'L'].x), Math.abs(p.j[k + 'R'].y - p.j[k + 'L'].y),
        Math.abs(p.j[k + 'R'].z + p.j[k + 'L'].z));
    }
  }
  check('bone length error', worstBone, [0, 0.15], ' units');
  /* A hanging athlete's feet are not on the floor, and asserting that they are is how a correct
     pull-up would have failed. What matters instead is that they are not THROUGH it. */
  if (rig.airborne) check('feet through the floor', Math.max(0, p0.j.toeR.y - rig.FLOOR), [0, 0.5], ' units');
  else check('toe off the floor', footGap, [0, 0.5], ' units');
  check(rig.unilateral ? 'stance mirror error' : 'left/right mirror error', worstMirror, [0, 0.15], ' units');

  /* Unilateral: the working arm must work, and the braced one must actually brace. Without this
     a rig could quietly row with both and still pass everything above. */
  if (rig.unilateral) {
    let braceDrift = 0;
    const b0 = rig.poseAt(0).j.wristL;
    for (let i = 0; i < N; i++) braceDrift = Math.max(braceDrift, len(sub(rig.poseAt(i / (N - 1)).j.wristL, b0)));
    check('braced hand drift', braceDrift, [0, 0.15], ' units');
    check('working hand travel', len(sub(p1.j.wristR, p0.j.wristR)), f.handTravel, ' units');
  }

  /* A CONVERGING pair must actually converge — that is the only thing a dumbbell can do that a
     barbell cannot, so if it does not happen the exercise has no reason to exist as its own entry. */
  if (rig.converging) {
    const g0 = gripAt(p0), g1 = gripAt(p1);
    check('hands converge on the way up', g1 - g0, [0.2, 1.2], ' x');
  }

  /* ⛔ A BARBELL IS ONE RIGID OBJECT AND NOTHING IN THIS SYSTEM KNEW THAT. Every check so far was
     written against machines, where each arm has its own carriage and may go where it likes. Put
     both hands on one bar and the same freedom becomes a bent barbell — so when a rig declares
     itself a barbell, the hands must stay level and the same distance apart all the way through. */
  if (rig.barbell) {
    let tilt = 0, stretch = 0;
    const span0 = len(sub(rig.poseAt(0).j.wristR, rig.poseAt(0).j.wristL));
    for (let i = 0; i < N; i++) {
      const p = rig.poseAt(i / (N - 1));
      tilt = Math.max(tilt, Math.abs(p.j.wristR.y - p.j.wristL.y), Math.abs(p.j.wristR.x - p.j.wristL.x));
      stretch = Math.max(stretch, Math.abs(len(sub(p.j.wristR, p.j.wristL)) - span0));
    }
    check('bar out of level', tilt, [0, 0.15], ' units');
    check('bar length change', stretch, [0, 0.15], ' units');
  }

  /* A CABLE STATION'S ONE LAW: the stack rises by exactly the length of cable pulled off the
     sheave. It is the only thing tying the load to the effort, and it is the sort of relationship
     that is trivially right when written and quietly wrong two edits later. */
  if (rig.drawnAt) {
    let worstCable = 0;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      /* measured at the point the cable is actually CLIPPED TO. Asking it about a hand instead
         was off by 3.3 units, because the hand sits a grip-width out of the plane the cable
         hangs in — the check was wrong before the rig was. */
      const run = len(sub(rig.cableAt(t), rig.cableFrom)) - len(sub(rig.cableAt(0), rig.cableFrom));
      worstCable = Math.max(worstCable, Math.abs(run - rig.drawnAt(t)));
    }
    check('stack vs cable drawn', worstCable, [0, 0.4], ' units');
  }

  /**
   * ⛔ NOTHING EVER ASKED WHETHER THE EQUIPMENT PASSES THROUGH HIM. `clearance` measures what the
   * hardware HIDES on screen, which is a different question entirely — a dumbbell can sit clean of
   * the camera and still be buried in his thigh, and on the one-arm row it was. Hands are exempt,
   * because gripping is contact by definition; legs never are.
   */
  const segDist = (a, b, c, d) => {
    const u = sub(b, a), v = sub(d, c), w = sub(a, c);
    const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w);
    const den = A * C - B * B;
    let sN = den < 1e-9 ? 0 : (B * E - C * D) / den;
    sN = Math.max(0, Math.min(1, sN));
    let tN = C < 1e-9 ? 0 : (B * sN + E) / C;
    tN = Math.max(0, Math.min(1, tN));
    sN = A < 1e-9 ? 0 : Math.max(0, Math.min(1, (B * tN - D) / A));
    return len(sub(add(a, mul(u, sN)), add(c, mul(v, tN))));
  };
  const LEGS = [['hipR', 'kneeR', 7.6], ['kneeR', 'ankleR', 5.8], ['hipL', 'kneeL', 7.6], ['kneeL', 'ankleL', 5.8]];
  let worstBite = 0;
  for (let i = 0; i < N; i += 3) {
    const p = rig.poseAt(i / (N - 1));
    for (const part of rig.stationAt(i / (N - 1))) {
      let a, b, r;
      if (part.k === 'rod' || part.k === 'tube') { a = part.a; b = part.b; r = part.r != null ? part.r : part.r0; }
      else if (part.k === 'disc') { a = sub(part.c, mul(norm(part.axis), part.thick / 2)); b = add(part.c, mul(norm(part.axis), part.thick / 2)); r = part.r; }
      else continue;
      if (part.tone === 'grip') continue;
      for (const [j0, j1, br] of LEGS) {
        worstBite = Math.max(worstBite, (r + br) * 0.75 - segDist(a, b, p.j[j0], p.j[j1]));
      }
    }
  }
  check('equipment into a leg', Math.max(0, worstBite), [0, 0.6], ' units');

  /* and the machine has to leave the athlete visible at the camera the solver picks */
  const solved = bestCamera(rig);
  check('athlete left visible', makeClearance(rig)(solved.cam,
    [rig.poseAt(0), rig.poseAt(0.5), rig.poseAt(1)]), [0.86, 1]);

  console.log('\n' + rig.id + '   (solved az ' + solved.az + '  el ' + solved.el + ')\n');
  console.log(rows.join('\n'));
  console.log('  ' + (failed ? '  ' + failed + ' FAILED' : '  all passed'));
}

console.log('\n' + (failedTotal ? failedTotal + ' CHECK(S) FAILED across ' + rigs.length + ' rig(s)\n'
  : 'all checks passed across ' + rigs.length + ' rig(s)\n'));
process.exit(failedTotal ? 1 : 0);
