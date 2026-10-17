/**
 * THE THREE HARD CASES (founder, 2026-08-06): pec deck, upper-chest cable fly, face pull.
 *
 * ════ THE RULE THE OLD DIRECTIVE BROKE ════
 *
 * Amendment 7 assigned the camera BY BODY REGION — "every chest and shoulder exercise presents
 * front-view". But a body region is not a direction. The chest contains movements in two
 * different planes:
 *
 *   • bench press / machine press — the load travels along the body's FRONT-BACK axis
 *     (sagittal). Front view points the camera down that axis, so the travel projects to zero
 *     and only the elbows are left moving. That is why a press reads as a pull.
 *   • pec deck / cable fly — the load travels ACROSS the body (frontal plane). Here front view
 *     is exactly right: the hands sweep from wide to together, which is the whole movement, and
 *     a side view would collapse the two arms on top of each other instead.
 *
 * So: THE CAMERA FOLLOWS THE PLANE OF MOTION, NOT THE BODY PART.
 *   sagittal → side view · frontal → front view.
 *
 * Face pull is frontal, so front view was right all along; what was wrong was the staging —
 * the old rig put the camera BEHIND the athlete to keep the cable column from crossing the
 * body. Hanging the rope from above solves the occlusion without turning the athlete around.
 *
 * Depth is drawn honestly: a limb rotating toward the camera SHORTENS on screen and its fist
 * grows. That is the same perspective license the existing rigs already use.
 *
 *   npx tsc -p tsconfig.harness.json
 *   node tools/motion-harness/hardcases.js <out.html>
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');

const BUILD = (process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build'));
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { romAt, DEFAULT_TEMPO } = require(path.join(BUILD, 'timeline.js'));
const { lerp } = require(path.join(BUILD, 'geometry.js'));
const { ATHLETE } = require(path.join(BUILD, 'anthro.js'));
const { seatedFrontCore, standingFrontCore, FLOOR_Y } = require(path.join(BUILD, 'bodies.js'));
const { floorScene, machineSeat, padStroke, groundShadow } = require(path.join(BUILD, 'kit.js'));

const OUT = process.argv[2];
const CX = 176;

const FRONT_CHAINS = {
  torso: ['hipC', 'neckBase'], neck: ['neckBase', 'head'], head: 'head', view: 'front',
  nearArm: ['shoulderR', 'elbowR', 'handR'], farArm: ['shoulderL', 'elbowL', 'handL'],
  nearLeg: ['hipR', 'kneeR', 'ankleR'], farLeg: ['hipL', 'kneeL', 'ankleL'],
  nearFoot: ['heelR', 'toeR'], farFoot: ['heelL', 'toeL'],
};

/** Mirror a right-side point to the left about the centre line. */
const mir = (p) => ({ x: CX - (p.x - CX), y: p.y });
const L = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** A weight stack whose selected plates ride up by `lift`. */
function stack(x0, x1, capY, baseY, lift) {
  const top = baseY - 30 - lift;
  return [
    { kind: 'rect', x: x0 - 4, y: capY, width: (x1 - x0) + 8, height: 4.5, rx: 2, fill: 'ink3' },
    { kind: 'line', a: { x: x0, y: capY }, b: { x: x0, y: baseY }, w: 1.8, color: 'line1' },
    { kind: 'line', a: { x: x1, y: capY }, b: { x: x1, y: baseY }, w: 1.8, color: 'line1' },
    ...Array.from({ length: 4 }, (_, i) => ({
      kind: 'rect', x: x0 + 1, y: top + i * 6.2, width: x1 - x0 - 2, height: 5, rx: 1.3, fill: 'ink1',
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      kind: 'rect', x: x0 + 1, y: baseY - 4 - i * 6.2, width: x1 - x0 - 2, height: 5, rx: 1.3, fill: 'ink4',
    })),
    { kind: 'line', a: { x: (x0 + x1) / 2, y: top }, b: { x: (x0 + x1) / 2, y: capY + 2 }, w: 1.5, color: 'ink2' },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
   1. PEC DECK — frontal plane, so the camera belongs in front.
      The hands sweep from wide to together; the arms foreshorten as they come
      round toward the camera, and the fists grow. Elbow held at a fixed bend
      throughout, which is what the pad enforces on a real machine.
   ═════════════════════════════════════════════════════════════════════════ */
const pecDeck = (() => {
  const core = seatedFrontCore(CX);
  const S = core.shoulderR;
  /* ⚠️ THE FIRST ATTEMPT FAILED THE VALIDATOR, AND IT DESERVED TO — elbow 164° → 47°.
     I had the hands closing to meet in front of the sternum, which is what the movement does
     in the world; but at that end the arms point straight at the camera, and ANY 2D front
     projection folds them onto themselves. The fix is not a trick, it is the machine: on a pec
     deck the FOREARM stands vertical against a pad and the ELBOW rides the arc. Hand directly
     above elbow, both staying in the frontal plane, so nothing ever points at the lens and the
     projected elbow angle stays in the 90–110° a pec deck actually holds.
     The elbows also stay at SHOULDER HEIGHT and the movement stops where a real pec deck stops —
     pads about a hand apart, not touching. Closing further would swing the upper arms round to
     point at the lens, and the angle collapses again. */
  const E0 = { x: CX + 52, y: S.y + 1 },  H0 = { x: CX + 50, y: S.y - 22 }; // open — the stretch
  const E1 = { x: CX + 26, y: S.y + 1 },  H1 = { x: CX + 24, y: S.y - 22 }; // closed — pads meet
  const depth = () => 1;                   // nothing rotates toward the camera: no foreshortening

  const poseAt = (rom) => ({
    headR: ATHLETE.headR, fistR: 4.6 * depth(rom),
    j: {
      ...core,
      elbowR: L(E0, E1, rom), handR: L(H0, H1, rom),
      elbowL: mir(L(E0, E1, rom)), handL: mir(L(H0, H1, rom)),
      sweep: { x: (H0.x - L(H0, H1, rom).x), y: 0 }, // the measurable closing distance
    },
  });

  const decorAt = (rom) => {
    const h = L(H0, H1, rom), e = L(E0, E1, rom);
    const PIVOT_Y = S.y - 34;
    const pad = (p, sgn) => [
      // the vertical pad the forearm presses into, and the arm that carries it
      { kind: 'line', a: { x: p.x, y: p.y - 15 }, b: { x: p.x, y: p.y + 9 }, w: 6.5, color: 'ink3', cap: 'round' },
      { kind: 'line', a: { x: CX + sgn * 6, y: PIVOT_Y }, b: { x: p.x, y: p.y - 13 }, w: 3, color: 'ink3', cap: 'round' },
      { kind: 'circle', c: { x: CX + sgn * 6, y: PIVOT_Y }, r: 2.6, fill: 'paper1', stroke: 'ink3', w: 1.8 },
    ];
    return {
      back: [
        ...stack(60, 82, 52, FLOOR_Y - 6, (1 - rom) * 0 + rom * 26),
        { kind: 'line', a: { x: 71, y: 52 }, b: { x: CX - 6, y: 52 }, w: 1.5, color: 'ink2' },
        { kind: 'line', a: { x: CX - 6, y: 52 }, b: { x: CX - 6, y: PIVOT_Y }, w: 1.5, color: 'ink2' },
        { kind: 'line', a: { x: CX, y: 46 }, b: { x: CX, y: FLOOR_Y - 4 }, w: 3, color: 'ink4' }, // the mast
        ...padStroke({ x: CX, y: S.y - 6 }, { x: CX, y: core.hipC.y - 6 }, 8),                    // back pad
        ...machineSeat(CX, core.hipC.y + 4, FLOOR_Y),
        ...pad(mir(e), -1),
      ],
      front: [...pad(e, 1)],
    };
  };

  return {
    id: 'pec_deck', chains: FRONT_CHAINS, poseAt, decorAt,
    scene: floorScene(FLOOR_Y, CX, 58),
    formspec: {
      tempo: DEFAULT_TEMPO,
      start: [{ kind: 'contactX', a: 'elbowR', x: E0.x, tol: 2, label: 'open — the stretch' }],
      end: [{ kind: 'contactX', a: 'elbowR', x: E1.x, tol: 2, label: 'pads meet in front of the chest' }],
      // the ELBOW is what the machine drives, so the elbow is what the path tracks
      path: { track: 'elbowR', kind: 'horizontal', tol: 2 },
      invariants: [
        { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips fixed on the seat' },
        { kind: 'pointFixed', point: 'neckBase', tol: 0.5, label: 'back on the pad' },
      ],
    },
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   2. UPPER-CHEST CABLE FLY — low pulleys, hands travel wide-low → together-high.
      Frontal plane again, and the DIAGONAL is what separates it from the pec
      deck at a glance: one closes level, this one closes upward.
   ═════════════════════════════════════════════════════════════════════════ */
const cableFlyUpper = (() => {
  const core = standingFrontCore(CX);
  const S = core.shoulderR;
  const E0 = { x: CX + 32, y: S.y + 42 }, H0 = { x: CX + 54, y: S.y + 58 }; // low and wide
  const E1 = { x: CX + 22, y: S.y - 8 },  H1 = { x: CX + 10, y: S.y - 27 }; // high and together
  const depth = (rom) => 1 + 0.22 * rom;
  const PULLEY_Y = FLOOR_Y - 18;

  const poseAt = (rom) => ({
    headR: ATHLETE.headR, fistR: 4.6 * depth(rom),
    j: {
      ...core,
      elbowR: L(E0, E1, rom), handR: L(H0, H1, rom),
      elbowL: mir(L(E0, E1, rom)), handL: mir(L(H0, H1, rom)),
    },
  });

  const decorAt = (rom) => {
    const h = L(H0, H1, rom);
    const col = (x, sgn) => [
      { kind: 'line', a: { x, y: 40 }, b: { x, y: FLOOR_Y - 2 }, w: 3, color: 'ink4' },
      { kind: 'circle', c: { x, y: PULLEY_Y }, r: 3.4, fill: 'paper1', stroke: 'ink3', w: 2 },
      ...stack(x - 11, x + 11, 44, FLOOR_Y - 6, rom * 30),
      { kind: 'line', a: { x, y: PULLEY_Y }, b: sgn > 0 ? h : mir(h), w: 1.6, color: 'ink2' },
    ];
    return { back: [...col(74, -1), ...col(278, 1)], front: [] };
  };

  return {
    id: 'cable_fly_upper', chains: FRONT_CHAINS, poseAt, decorAt,
    scene: floorScene(FLOOR_Y, CX, 54),
    formspec: {
      tempo: DEFAULT_TEMPO,
      start: [{ kind: 'contactX', a: 'handR', x: H0.x, tol: 2, label: 'wide and low — the stretch' }],
      end: [{ kind: 'contactY', a: 'handR', y: H1.y, tol: 2, label: 'together, above the collarbone' }],
      path: { track: 'handR', kind: 'line', tol: 2, dir: { x: H1.x - H0.x, y: H1.y - H0.y } },
      invariants: [
        { kind: 'pointFixed', point: 'hipC', tol: 0.6, label: 'torso still — no heave' },
        { kind: 'pointFixed', point: 'kneeR', tol: 0.6, label: 'legs braced' },
      ],
    },
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   3. FACE PULL — restaged. The athlete FACES the camera; the rope drops from a
      pulley above and behind the head, so the cable column never has to cross
      the body and there is no reason to turn the athlete around. The finish is
      the goalpost: elbows at shoulder height, hands beside the ears.
   ═════════════════════════════════════════════════════════════════════════ */
const facePullV2 = (() => {
  const core = standingFrontCore(CX);
  const S = core.shoulderR;
  const DEG = Math.PI / 180;
  // finish, fully in-plane and derived from real bone lengths
  const E1 = { x: S.x + ATHLETE.upperArm * Math.sin(84 * DEG), y: S.y - ATHLETE.upperArm * Math.cos(84 * DEG) };
  const H1 = { x: E1.x - ATHLETE.foreArm * Math.sin(14 * DEG), y: E1.y - ATHLETE.foreArm * Math.cos(14 * DEG) };
  // start: arms reaching away toward the pulley — both segments foreshorten honestly
  const E0 = { x: CX + 18, y: S.y - 8 }, H0 = { x: CX + 7, y: S.y - 16 };
  const depth = (rom) => 1.26 - 0.26 * rom; // the fist is NEAR at the start, in-plane at the end
  const ANCHOR = { x: CX, y: 24 };

  const poseAt = (rom) => ({
    headR: ATHLETE.headR, fistR: 4.6 * depth(rom),
    j: {
      ...core,
      elbowR: L(E0, E1, rom), handR: L(H0, H1, rom),
      elbowL: mir(L(E0, E1, rom)), handL: mir(L(H0, H1, rom)),
    },
  });

  const decorAt = (rom) => {
    const h = L(H0, H1, rom);
    return {
      back: [
        { kind: 'line', a: { x: 300, y: 26 }, b: { x: 300, y: FLOOR_Y - 2 }, w: 3, color: 'ink4' },
        { kind: 'line', a: { x: 300, y: 26 }, b: ANCHOR, w: 2, color: 'ink4' },
        { kind: 'circle', c: ANCHOR, r: 3.6, fill: 'paper1', stroke: 'ink3', w: 2 },
        ...stack(289, 311, 30, FLOOR_Y - 6, rom * 28),
      ],
      // the rope: one V from the anchor to both fists, drawn in front of the torso where it
      // genuinely passes in front of it
      front: [
        { kind: 'line', a: ANCHOR, b: h, w: 2, color: 'ink0' },
        { kind: 'line', a: ANCHOR, b: mir(h), w: 2, color: 'ink0' },
        { kind: 'circle', c: ANCHOR, r: 2, fill: 'ink0' },
      ],
    };
  };

  return {
    id: 'face_pull_v2', chains: FRONT_CHAINS, poseAt, decorAt,
    scene: floorScene(FLOOR_Y, CX, 52),
    formspec: {
      tempo: DEFAULT_TEMPO,
      start: [{ kind: 'contactX', a: 'handR', x: H0.x, tol: 2, label: 'arms long toward the rope' }],
      end: [{ kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 70, max: 105, label: 'goalpost — elbows at shoulder height' }],
      path: { track: 'handR', kind: 'arc', tol: 2 },
      invariants: [
        { kind: 'pointFixed', point: 'hipC', tol: 0.6, label: 'torso still' },
        { kind: 'pointFixed', point: 'neckBase', tol: 0.6, label: 'no lean-back' },
      ],
    },
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   SAMPLING — the effort direction is DECLARED, never guessed from the id.
   ═════════════════════════════════════════════════════════════════════════ */
const r1 = (n) => Math.round(n * 10) / 10;
function round(p) {
  const o = { ...p };
  for (const k of ['a', 'b', 'c', 'start']) if (o[k]) o[k] = { x: r1(o[k].x), y: r1(o[k].y) };
  if (o.pts) o.pts = o.pts.map((q) => ({ x: r1(q.x), y: r1(q.y) }));
  if (o.segs) o.segs = o.segs.map((s) => ({ c1: { x: r1(s.c1.x), y: r1(s.c1.y) }, c2: { x: r1(s.c2.x), y: r1(s.c2.y) }, to: { x: r1(s.to.x), y: r1(s.to.y) } }));
  for (const k of ['x', 'y', 'r', 'rx', 'ry', 'w', 'width', 'height']) if (typeof o[k] === 'number') o[k] = r1(o[k]);
  return o;
}

const FPR = 44;
function sample(rig, muscle, effortToEnd) {
  const t0 = rig.formspec.tempo;
  // the EFFORT is the fast half. On a rig whose effort runs 0→1 the two durations swap.
  const tempo = effortToEnd ? { ...t0, eccentricMs: t0.concentricMs, concentricMs: t0.eccentricMs } : t0;
  const r = { ...rig, formspec: { ...rig.formspec, tempo } };
  const repMs = tempo.topHoldMs + tempo.eccentricMs + tempo.bottomHoldMs + tempo.concentricMs;
  const raw = [];
  for (let i = 0; i < FPR; i++) {
    const rom = romAt((i / FPR) * repMs, tempo);
    const romN = romAt(((i + 1) / FPR) * repMs, tempo);
    const c = effortToEnd ? romN > rom + 1e-6 : romN < rom - 1e-6;
    const track = r.formspec.path.track;
    const a = r.poseAt(rom).j[track], b = r.poseAt(romN).j[track];
    raw.push({
      p: buildFrame(r, rom).map(round), c,
      at: { x: r1(a.x), y: r1(a.y) },
      dir: { x: r1(b.x - a.x), y: r1(b.y - a.y) },
      m: muscleAt(r.poseAt(rom), muscle),
    });
  }
  // frame 0 whole, the rest as sparse patches
  const base = raw[0].p, keys = base.map((x) => JSON.stringify(x));
  const frames = raw.map((f, i) => {
    if (i === 0) return { p: f.p, c: f.c, at: f.at, dir: f.dir, m: f.m };
    const d = {};
    if (f.p.length === base.length) {
      for (let k = 0; k < f.p.length; k++) { const s = JSON.stringify(f.p[k]); if (s !== keys[k]) d[k] = f.p[k]; }
    }
    return { d, c: f.c, at: f.at, dir: f.dir, m: f.m };
  });
  return { id: r.id, repMs, frames };
}

/** The working muscle, derived from the pose — front view uses the shoulder span. */
function muscleAt(pose, muscle) {
  const sr = pose.j.shoulderR || pose.j.shoulder, sl = pose.j.shoulderL, h = pose.j.hipC || pose.j.hip;
  if (!sr || !h) return null;
  const cx = sl ? (sr.x + sl.x) / 2 : sr.x;
  const y = muscle === 'upperChest' ? sr.y + 4 : muscle === 'rearDelt' ? sr.y - 1 : sr.y + 11;
  const x = muscle === 'rearDelt' ? sr.x + 3 : cx + 9;
  return { x: r1(x), y: r1(y), k: muscle };
}

const data = {
  viewbox: VIEWBOX,
  cells: [
    { key: 'pec', title: 'פרפר במכונה', muscle: 'חזה', plane: 'מישור חזיתי → מבט חזית',
      clip: sample(pecDeck, 'chest', true) },
    { key: 'fly', title: 'חזה עליון בכבלים', muscle: 'חזה עליון', plane: 'מישור חזיתי → מבט חזית',
      clip: sample(cableFlyUpper, 'upperChest', true) },
    { key: 'face', title: 'Face pull', muscle: 'דלתא אחורית', plane: 'מישור חזיתי → מבט חזית',
      clip: sample(facePullV2, 'rearDelt', true) },
    { key: 'bench', title: 'לחיצת חזה במוט', muscle: 'חזה', plane: 'מישור סגיטלי → מבט צד',
      clip: sample(EXERCISE_MOTION['bb_bench_press'], 'chest', false) },
    { key: 'row', title: 'חתירה במכונה', muscle: 'גב', plane: 'מישור סגיטלי → מבט צד',
      clip: sample(EXERCISE_MOTION['machine_row'], 'back', true) },
    { key: 'oldFace', title: 'Face pull — כפי שהוא היום', muscle: 'דלתא אחורית', plane: 'מהגב',
      clip: sample(EXERCISE_MOTION['face_pull'], 'rearDelt', true), old: true },
  ],
};

// the rigs are exported so the FormSpec validator and any test can reach them without
// generating a page — same "one source, several consumers" contract the motion core has
module.exports = { pecDeck, cableFlyUpper, facePullV2, data };

if (require.main === module) {
  const html = require('./hardcases.page.js')(data);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
}
