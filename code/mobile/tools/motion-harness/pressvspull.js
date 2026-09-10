/**
 * PRESS vs PULL — the founder's test (2026-08-06).
 *
 * His fault: "machine chest press looks like a lat pulldown — you cannot see it is a press."
 *
 * The cause, found in the data: `machine_chest_press` is a FRONT-view rig whose FormSpec tracks a
 * joint literally named `stroke` travelling x 0 → 30. There is no such joint on a body. A press
 * from the front travels TOWARD THE CAMERA, which is zero on-screen displacement, so the rig fakes
 * the travel as a scalar and the only thing left for a viewer to see is elbows opening and closing
 * — which is exactly what a pulldown looks like. Front view deletes the one axis that separates a
 * press from a pull.
 *
 * The fix has four parts, and only the first needs new rig data:
 *   1. CAMERA — the press gets a side view, where the hand travels AWAY from the torso and the
 *      pull's hand travels TOWARD it. Opposite directions on screen, unmistakable.
 *   2. DIRECTION — an arrow drawn ONLY on the concentric (the effort), pointing along travel.
 *   3. MUSCLE — the working muscle lights during the concentric. Chest for a press, back for a
 *      pull. Readable even at thumbnail size.
 *   4. TEMPO — slow eccentric, fast concentric. Time itself says which half is the work. Already
 *      in every FormSpec (2000ms vs 1100ms); nothing consumed it.
 *
 * Renders the REAL compiled rigs for the "today" column, so the comparison is honest.
 *
 *   npx tsc -p tsconfig.harness.json
 *   node tools/motion-harness/pressvspull.js <out.html>
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');

const BUILD = (process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build'));
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { romAt, loopDurationMs, DEFAULT_TEMPO } = require(path.join(BUILD, 'timeline.js'));
const { twoBoneIK, lerp } = require(path.join(BUILD, 'geometry.js'));
const { ATHLETE } = require(path.join(BUILD, 'anthro.js'));
const { seatedCore, far, FLOOR_Y } = require(path.join(BUILD, 'bodies.js'));
const { machineSeat, padStroke, groundShadow } = require(path.join(BUILD, 'kit.js'));

const OUT = process.argv[2] || path.resolve(__dirname, '../../../../_v8_direction/PRESS_VS_PULL.html');
const UPPER = ATHLETE.upperArm;
const FORE = ATHLETE.foreArm;

/* ════════════════════════════════════════════════════════════════════════════
   THE NEW RIG — machine chest press, SIDE VIEW.
   Same factory shape as `seatedRow` (pullRow.ts): seated, torso braced on a pad,
   hand travels horizontally. The only difference — and the whole point — is the
   SIGN of the travel. The row's hand comes back to the torso; this one leaves it.
   ══════════════════════════════════════════════════════════════════════════ */
function seatedPressRig() {
  const LEAN = 10;                       // reclined into the back pad
  const core = seatedCore(-6, LEAN);
  const HIP = core.hip;
  const SHOULDER = core.shoulder;
  const HANDLE_Y = SHOULDER.y + 7;       // handles at chest height
  const REACH = (UPPER + FORE) * 0.965;  // lockout, just short of locking the elbow
  const START_X = SHOULDER.x + REACH;    // rom 0 — arms extended (a press starts at the top)
  /* ⛔ THE FOUNDER'S CORRECTION, AND IT IS ARITHMETIC, NOT TASTE: at the bottom of a machine
     chest press the elbow is at ~90° and roughly in line with the shoulder. With upper 25 and
     fore 23 that puts the hand √(25²+23²) = 34 from the shoulder, not 19. At 19 the elbow
     closes far past 90° and the forearm folds in toward the middle of the body — exactly what
     he saw. The endpoint is now derived from the bones instead of chosen by eye. */
  const ELBOW90 = Math.hypot(UPPER, FORE);            // 34.0
  const DROP = HANDLE_Y - SHOULDER.y;                  // 7
  const END_X = SHOULDER.x + Math.sqrt(ELBOW90 ** 2 - DROP ** 2);

  const handAt = (rom) => ({ x: lerp(START_X, END_X, rom), y: HANDLE_Y });

  // elbow flares DOWN and BACK on a press — pick the IK branch that puts it below the hand line
  const elbowSide = (() => {
    const h = handAt(1);
    const a = twoBoneIK(SHOULDER, h, UPPER, FORE, 1);
    const b = twoBoneIK(SHOULDER, h, UPPER, FORE, -1);
    return a.y > b.y ? 1 : -1;
  })();

  const poseAt = (rom) => {
    const hand = handAt(rom);
    const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, elbowSide);
    return {
      headR: 8,
      j: {
        head: core.head, shoulder: SHOULDER, elbow, hand, hip: HIP,
        knee: core.knee, ankle: core.ankle, heel: core.heel, toe: core.toe,
        farShoulder: far(SHOULDER, 7, 2), farElbow: far(elbow, 7, 2), farHand: far(hand, 7, 2),
        farHip: far(HIP, 7, 1), farKnee: far(core.knee, 7), farAnkle: far(core.ankle, 8),
        farHeel: far(core.heel, 8), farToe: far(core.toe, 8),
      },
    };
  };

  // the station: frame behind the athlete, press arms pivoting off it, and a stack that RISES
  // as the arms extend — the resistance is visible, and it moves the right way.
  const FRAME_X = HIP.x - 30;
  const TOWER = { x0: 46, x1: 70, capY: 74, baseY: FLOOR_Y - 4 };
  const PIVOT = { x: FRAME_X + 4, y: SHOULDER.y - 10 };

  const decorAt = (rom) => {
    const hand = handAt(rom);
    const travel = (START_X - hand.x) / (START_X - END_X); // 0 at lockout, 1 at the chest
    const lift = (1 - travel) * 26;                        // extended → the stack is UP

    const stackTopY = TOWER.baseY - 34 - lift;
    const back = [
      // the tower
      { kind: 'rect', x: TOWER.x0 - 4, y: TOWER.capY, width: (TOWER.x1 - TOWER.x0) + 8, height: 5, rx: 2, fill: 'ink3' },
      { kind: 'line', a: { x: TOWER.x0, y: TOWER.capY }, b: { x: TOWER.x0, y: TOWER.baseY }, w: 2, color: 'line1' },
      { kind: 'line', a: { x: TOWER.x1, y: TOWER.capY }, b: { x: TOWER.x1, y: TOWER.baseY }, w: 2, color: 'line1' },
      // the selected plates, riding up with the press
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: 'rect', x: TOWER.x0 + 1, y: stackTopY + i * 6.6, width: TOWER.x1 - TOWER.x0 - 2,
        height: 5.4, rx: 1.4, fill: 'ink1',
      })),
      // the plates left behind on the floor of the stack
      ...Array.from({ length: 4 }, (_, i) => ({
        kind: 'rect', x: TOWER.x0 + 1, y: TOWER.baseY - 4 - i * 6.6, width: TOWER.x1 - TOWER.x0 - 2,
        height: 5.4, rx: 1.4, fill: 'ink4',
      })),
      // the cable: stack → cap → the frame's pivot
      {
        kind: 'polyline', w: 1.6, color: 'ink2',
        pts: [
          { x: (TOWER.x0 + TOWER.x1) / 2, y: stackTopY },
          { x: (TOWER.x0 + TOWER.x1) / 2, y: TOWER.capY + 2 },
          { x: FRAME_X, y: TOWER.capY + 2 },
          { x: FRAME_X, y: PIVOT.y },
        ],
      },
      // the frame upright + the back pad the torso is braced on
      { kind: 'line', a: { x: FRAME_X, y: TOWER.capY }, b: { x: FRAME_X, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
      ...padStroke({ x: SHOULDER.x - 11, y: SHOULDER.y - 12 }, { x: HIP.x - 8, y: HIP.y - 3 }, 7),
      ...machineSeat(HIP.x + 4, HIP.y + 6, FLOOR_Y),
    ];

    // the press arm — pivots off the frame, reaches the handle
    const front = [
      { kind: 'line', a: PIVOT, b: { x: hand.x, y: hand.y - 7 }, w: 3, color: 'ink3', cap: 'round' },
      { kind: 'circle', c: PIVOT, r: 3, fill: 'paper1', stroke: 'ink3', w: 2 },
      { kind: 'line', a: { x: hand.x, y: hand.y - 8 }, b: { x: hand.x, y: hand.y + 8 }, w: 3.5, color: 'ink0', cap: 'round' },
      { kind: 'circle', c: hand, r: 2.5, fill: 'ink0' },
    ];
    return { back, front };
  };

  return {
    id: 'machine_chest_press_side',
    chains: {
      torso: ['hip', 'shoulder'], neck: ['shoulder', 'head'], head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'], farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'], nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'], farFoot: ['farHeel', 'farToe'],
    },
    formspec: {
      tempo: DEFAULT_TEMPO,
      start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 160, max: 179, label: 'lockout — arms long' }],
      end: [{ kind: 'contactX', a: 'hand', x: END_X, tol: 2, label: 'handles to the chest' }],
      path: { track: 'hand', kind: 'horizontal', tol: 1.5 },
      invariants: [
        { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'torso braced on the pad' },
        { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed on the seat' },
        { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
      ],
    },
    poseAt,
    decorAt,
    scene: [
      { kind: 'line', a: { x: 20, y: FLOOR_Y }, b: { x: 332, y: FLOOR_Y }, w: 1.5, color: 'line1' },
      groundShadow(HIP.x + 10, 56, FLOOR_Y),
    ],
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   SAMPLING
   ══════════════════════════════════════════════════════════════════════════ */
const FPR = 48; // frames per rep

/**
 * A rig's floor, rails, seat and pad are identical in every frame — only the body and the
 * moving parts of the station change. Storing frame 0 whole and every later frame as a sparse
 * {index: primitive} map cuts the payload by roughly two thirds. `buildFrame` emits a stable
 * primitive order for a given rig, so an index means the same thing in every frame.
 */
function compress(frames) {
  const base = frames[0].p;
  const keys = base.map((p) => JSON.stringify(p));
  for (let i = 1; i < frames.length; i++) {
    const d = {};
    const cur = frames[i].p;
    if (cur.length !== base.length) { frames[i].d_ = null; continue; } // shape changed → keep whole
    for (let k = 0; k < cur.length; k++) {
      const s = JSON.stringify(cur[k]);
      if (s !== keys[k]) d[k] = cur[k];
    }
    frames[i].d_ = d;
  }
  return frames.map((f, i) => (i === 0
    ? { p: f.p, c: f.c, at: f.at, dir: f.d, m: f.m }
    : { d: f.d_, c: f.c, at: f.at, dir: f.d, m: f.m }));
}

/**
 * ⛔ FOUND WHILE BUILDING THIS: the tempo phases are named for a PRESS and applied to everything.
 *
 * `Tempo` runs topHold → eccentric (rom 0→1) → bottomHold → concentric (rom 1→0), and every rig
 * uses `DEFAULT_TEMPO`. For a bench press that is right: rom 1 is the bar on the chest, and the
 * effort is the way back up. For a lat pulldown rom 1 is the bar AT THE CHEST — the effort is
 * 0→1, the half the system calls "eccentric". So on every pulling exercise the app currently
 * plays the WORK slowly (2000ms) and the RETURN quickly (1100ms), which is backwards, and it is
 * one more reason a pull does not read as a pull.
 *
 * The fix is one field per rig — which direction of rom is the effort — and it is what signals 2
 * and 4 both key off.
 */
function effortIsToEnd(id) {
  return /pulldown|row|pull|curl/.test(id); // a pull's effort is rom 0 → 1
}

function sample(rig, muscle, fixTempo) {
  const toEnd = effortIsToEnd(rig.id);
  const t0 = rig.formspec.tempo;
  // signal 4, applied: the EFFORT is the fast half. On a pull that means swapping the two
  // durations the rig inherited from DEFAULT_TEMPO.
  const tempo = fixTempo && toEnd
    ? { ...t0, eccentricMs: t0.concentricMs, concentricMs: t0.eccentricMs }
    : t0;
  const rigT = tempo === t0 ? rig : { ...rig, formspec: { ...rig.formspec, tempo } };
  rig = rigT;
  const repMs = tempo.topHoldMs + tempo.eccentricMs + tempo.bottomHoldMs + tempo.concentricMs;
  const frames = [];
  for (let i = 0; i < FPR; i++) {
    const t = (i / FPR) * repMs;
    const rom = romAt(t, tempo);
    const romNext = romAt(((i + 1) / FPR) * repMs, tempo);
    // the effort — the only half that gets an arrow, and the half the muscle lights on
    const concentric = toEnd ? romNext > rom + 1e-6 : romNext < rom - 1e-6;
    const track = rig.formspec.path.track;
    const p = rig.poseAt(rom);
    const pN = rig.poseAt(romNext);
    const a = p.j[track] || p.j.hand || p.j.bar;
    const b = pN.j[track] || pN.j.hand || pN.j.bar;
    frames.push({
      p: buildFrame(rig, rom).map(round),
      c: concentric,
      at: a ? { x: r1(a.x), y: r1(a.y) } : null,
      d: a && b ? { x: r1(b.x - a.x), y: r1(b.y - a.y) } : null,
      m: muscleAt(p, muscle),
    });
  }
  return { id: rig.id, repMs, frames: compress(frames) };
}

/** Where the working muscle sits on THIS pose — derived from joints, never hand-placed. */
function muscleAt(pose, muscle) {
  const s = pose.j.shoulder || pose.j.shoulderR;
  const h = pose.j.hip || pose.j.hipC;
  if (!s || !h) return null;
  const dx = h.x - s.x, dy = h.y - s.y;                     // shoulder → hip (down the spine)
  const nx = -dy, ny = dx, n = Math.hypot(nx, ny) || 1;     // perpendicular = front/back
  const sign = muscle === 'chest' ? 1 : -1;                 // chest in front, back behind
  return {
    x: r1(s.x + dx * 0.26 + (nx / n) * 7 * sign),
    y: r1(s.y + dy * 0.26 + (ny / n) * 7 * sign),
    k: muscle,
  };
}

const r1 = (n) => Math.round(n * 10) / 10;
function round(p) {
  const o = { ...p };
  for (const k of ['a', 'b', 'c', 'start']) if (o[k]) o[k] = { x: r1(o[k].x), y: r1(o[k].y) };
  if (o.pts) o.pts = o.pts.map((q) => ({ x: r1(q.x), y: r1(q.y) }));
  if (o.segs) o.segs = o.segs.map((s) => ({ c1: { x: r1(s.c1.x), y: r1(s.c1.y) }, c2: { x: r1(s.c2.x), y: r1(s.c2.y) }, to: { x: r1(s.to.x), y: r1(s.to.y) } }));
  for (const k of ['x', 'y', 'r', 'rx', 'ry', 'w', 'width', 'height']) if (typeof o[k] === 'number') o[k] = r1(o[k]);
  return o;
}

const data = {
  todayPress: sample(EXERCISE_MOTION['machine_chest_press'], 'chest', false),
  todayPull: sample(EXERCISE_MOTION['lat_pulldown'], 'back', false),
  newPress: sample(seatedPressRig(), 'chest', true),
  newPull: sample(EXERCISE_MOTION['lat_pulldown'], 'back', true), // effort now fast
  viewbox: VIEWBOX,
};

const html = require('./pressvspull.page.js')(data);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('wrote', OUT, kb + 'KB');
