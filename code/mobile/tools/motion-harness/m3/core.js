/**
 * HUSH MOTION — 3D CORE (2026-08-06, founder gave a free hand to start over).
 *
 * ════ WHY THE 2D SYSTEM COULD NOT BE FIXED ════
 *
 * The old rigs stored joints already flattened to the screen, so every foreshortening was a
 * number somebody typed. That is survivable for a movement living in one plane and impossible
 * for one living in two. Measured on a machine chest press whose elbow is EXACTLY 90° in space:
 *
 *     side view  (azimuth  0°) → the elbow projects to  29°   ← "maximum flexion"
 *     front view (azimuth 90°) → the elbow projects to 171°, and the travel to ~0
 *     azimuth 35°              → the elbow projects to  83°, travel stays visible
 *
 * The window where both read correctly is about six degrees wide. Nobody hits a six-degree
 * window by eye — so the camera stops being a taste call and becomes something we SOLVE.
 *
 * ════ WHAT THIS CORE DOES ════
 *
 *   • joints live in 3D:  +x forward (the way the athlete faces) · +y DOWN · +z to their right
 *   • limb length is a constraint, never a drawing — arms are placed by 3D two-bone IK with a
 *     pole vector, so a pose cannot be anatomically impossible
 *   • the camera is (azimuth, elevation); projection is orthographic with an honest depth value
 *   • everything drawn carries depth, so the painter sorts it — the far arm goes BEHIND the
 *     torso and the near arm in front, with no hand-authored draw order
 *   • depth also drives tone: what is further away sits back into the ground. That single cue
 *     is most of what separates a figure with volume from a stick.
 */
// @ts-nocheck


const R = Math.PI / 180;

/* ── vectors ─────────────────────────────────────────────────────────────── */
const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const m = len(a) || 1; return V(a.x / m, a.y / m, a.z / m); };
const lerpV = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

/** The true angle at `b`, in space. This is the number a form cue actually means. */
function angle3(a, b, c) {
  const u = norm(sub(a, b)), v = norm(sub(c, b));
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / R;
}

/**
 * 3D two-bone IK. The elbow (or knee) is placed on the circle of valid solutions, at the point
 * the pole vector points to — which is how a real joint chooses among them.
 */
function ik(root, end, l1, l2, pole) {
  let d = len(sub(end, root));
  const maxD = (l1 + l2) * 0.999;
  let tip = end;
  if (d > maxD) { tip = add(root, mul(norm(sub(end, root)), maxD)); d = maxD; }
  if (d < 1e-4) return add(root, mul(norm(pole), l1));
  const axis = norm(sub(tip, root));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mid = add(root, mul(axis, a));
  let p = sub(pole, mul(axis, dot(pole, axis)));
  if (len(p) < 1e-4) p = cross(axis, V(0, 0, 1));
  return add(mid, mul(norm(p), h));
}

/* ── camera ──────────────────────────────────────────────────────────────── */
/**
 * azimuth 0 puts the camera on the athlete's right, looking along -z: a pure SIDE view.
 * azimuth 90 puts it in front of them, looking along -x: a pure FRONT view.
 * elevation lifts it slightly, which is what stops a figure reading as a flat pictogram.
 */
function camera(azimuthDeg, elevationDeg) {
  const A = azimuthDeg * R, E = elevationDeg * R;
  const sA = Math.sin(A), cA = Math.cos(A), sE = Math.sin(E), cE = Math.cos(E);

  /* ⛔ THE DEPTH AXIS WAS FIXED WITHOUT FIXING THE SCREEN AXIS, AND THE TWO DISAGREED.
     The previous version projected screen-x with `x*cos(A) + z*sin(A)` — a rotation the OTHER WAY
     round from the depth term below. So the horizontal screen axis and the view axis were not
     perpendicular: their dot product is sin(2·azimuth)·cos(elevation), which is ~0 at azimuth 0
     and 90 (why every side and front view looked right, and why this survived) and **0.999 at
     azimuth 45**.

     What that means physically: a bone pointing straight at the lens, which must vanish, was
     drawn at 100% of its length. The system had no foreshortening in the middle of its range —
     it had anti-foreshortening. Every oblique camera was inventing geometry, and the solver,
     scoring those inventions, walked straight to azimuth 47 — the worst azimuth there is.

     Fixed by building the three axes explicitly and proving them orthonormal, rather than
     composing two rotations and trusting they agree.

         u — screen right :  (cosA, 0, −sinA)
         v — screen down  :  (sinA·sinE, cosE, cosA·sinE)
         d — toward lens  :  (sinA·cosE, −sinE, cosA·cosE)

     Each is a unit vector and each pair dots to exactly 0, at every azimuth and elevation. */
  return {
    azimuth: azimuthDeg,
    elevation: elevationDeg,
    /* The three axes, in world coordinates. `dir` points AT the lens, which is what a specular
       term needs and what nothing could ask for while the basis lived only inside project(). */
    right: V(cA, 0, -sA),
    down: V(sA * sE, cE, cA * sE),
    dir: V(sA * cE, -sE, cA * cE),
    project(p) {
      return {
        u: p.x * cA - p.z * sA,
        v: p.x * sA * sE + p.y * cE + p.z * cA * sE,
        d: p.x * sA * cE - p.y * sE + p.z * cA * cE,   // bigger = nearer the camera
      };
    },
  };
}

/** Projected angle at `b` — what the viewer actually reads off the screen. */
function angle2(cam, a, b, c) {
  const A = cam.project(a), B = cam.project(b), C = cam.project(c);
  const u = { x: A.u - B.u, y: A.v - B.v }, v = { x: C.u - B.u, y: C.v - B.v };
  const m = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / m))) / R;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CAMERA SOLVER

   Three things make a movement readable, and they pull against each other:

     1. TRAVEL      — how much of the real 3D displacement of the working joint survives the
                      projection. Front view kills a press; side view kills a fly.
     2. FIDELITY    — how close the projected joint angles stay to their true 3D values across
                      the whole rep. This is the one the founder caught by eye: a 90° elbow
                      reading as 29° is a lie about the form.
     3. SEPARATION  — how far apart the left and right limbs land on screen. A view that stacks
                      one arm exactly on the other hides half the movement.

   The solver sweeps every azimuth and returns the best compromise, per exercise, with the
   numbers. No exercise inherits a camera from its body region ever again.
   ═════════════════════════════════════════════════════════════════════════ */
function solveCamera(rig, opts = {}) {
  const elevation = opts.elevation ?? 8;
  const samples = opts.samples ?? 13;
  const rows = [];
  const poses = Array.from({ length: samples }, (_, i) => rig.poseAt(i / (samples - 1)));
  const track = rig.track;                       // the joint whose travel matters
  const cues = rig.cues || [];                   // [[a,b,c], ...] the angles the form is about

  const trueTravel = len(sub(poses[samples - 1].j[track], poses[0].j[track])) || 1;
  const trueAngles = poses.map((p) => cues.map(([a, b, c]) => angle3(p.j[a], p.j[b], p.j[c])));

  /**
   * ⛔ THE SWEEP NEVER LEFT THE FRONT OF THE ATHLETE. It ran 0→90 for most of this system's life
   * and 0→180 briefly, and BOTH keep the camera on his forward side: azimuth 0 is his right
   * shoulder, 90 is dead ahead, 180 is his left shoulder. Every one of them has sin(az) ≥ 0, which
   * is the +x half-space, which is the side a pulldown's tower stands in. The one range that could
   * have seen past it was the half that was never searched.
   * A camera can stand anywhere. The other terms are perfectly capable of rejecting a back view
   * when a back view is wrong — and of choosing one when, as here, it is the only clean angle.
   */
  for (let az = 0; az < 360; az += 2) {
    const cam = camera(az, elevation);
    const p0 = cam.project(poses[0].j[track]), p1 = cam.project(poses[samples - 1].j[track]);
    const travel = Math.hypot(p1.u - p0.u, p1.v - p0.v) / trueTravel;   // 0..1

    /* ⛔ THE FIRST VERSION OF THIS AVERAGED THE ERROR OVER THE REP, AND IT CHOSE A SIDE VIEW
       THAT PROJECTS A 90° ELBOW TO 14°. Averaging hid the lie: at lockout the arm is straight
       and projects perfectly, and that good half cancelled the bad half down to a middling
       score. A camera is only as honest as its WORST moment — a view that misreports the form
       at the one position the cue is about is a bad view, however well it behaves elsewhere. */
    /* ...and the second version scored BOTH arms, which is also wrong. A symmetric two-arm
       movement cannot read correctly on both sides at any oblique camera — the far arm is a
       mirror, so whatever helps one hurts the other. The viewer does not read the far arm; it
       is context, and it is half-hidden behind the torso anyway. Score the NEAR one. */
    /* ...and the third version scored every frame of the rep, which is stricter than the truth.
       Mid-rep the upper arm sweeps THROUGH the view axis at some oblique camera; for an instant
       its projection is nearly a point and the angle read off it is noise. That is not the
       camera lying about the form — nobody reads an angle off a moving limb. A rep asserts its
       form AT ITS ENDPOINTS (which is exactly what FormSpec.start/.end already say), so that is
       where fidelity is scored. What mid-rep must not do is COLLAPSE, and that gets its own
       term: a segment that projects to almost nothing looks broken however true it is. */
    const cuePoses = [poses[0], poses[samples - 1]];
    const cueTrue = [trueAngles[0], trueAngles[samples - 1]];
    let worst = 0;
    cuePoses.forEach((p, i) => {
      let bestDepth = -Infinity, pick = -1;
      cues.forEach(([, b], k) => { const d = cam.project(p.j[b]).d; if (d > bestDepth) { bestDepth = d; pick = k; } });
      if (pick < 0) return;
      const [a, b, c] = cues[pick];
      worst = Math.max(worst, Math.abs(angle2(cam, p.j[a], p.j[b], p.j[c]) - cueTrue[i][pick]));
    });
    const fidelity = 1 - Math.min(1, worst / 45);                       // 45° off = worthless

    /* separation: the worst on-screen gap between the two hands and the two elbows over the rep.
       levelness: how much of that gap is VERTICAL — which is a different question and a hard one.

       ⛔ SEPARATION ALONE SENT THE SOLVER CLIMBING TO ELEVATION 30, and the founder's eye caught
       what the score could not: raising the camera separates a mirrored pair by stacking one
       above the other. At el 30 the two hands — level with each other in space, doing the same
       thing at the same instant — landed 29 units apart vertically on screen, a quarter of the
       body's height, and the figure read as if its arms were doing different exercises. The last
       14° of that climb bought 2% of score and cost the picture.
       A pair wants to sit SIDE BY SIDE: separated across, level up-and-down. */
    let sep = Infinity, tilt = 0;
    for (const p of poses) {
      for (const [r, l] of (rig.pairs || [])) {
        const A = cam.project(p.j[r]), B = cam.project(p.j[l]);
        sep = Math.min(sep, Math.hypot(A.u - B.u, A.v - B.v));
        tilt = Math.max(tilt, Math.abs(A.v - B.v));
      }
    }
    if (!isFinite(sep)) sep = 20;
    const separation = Math.min(1, sep / 18);                            // 18 units is plenty
    const levelness = 1 - Math.min(1, tilt / 26);

    // no segment of a scored limb may shrink to a stub at any point in the rep
    let minSeg = Infinity;
    for (const p of poses) {
      for (const [a, b, c] of cues) {
        for (const [x, y] of [[a, b], [b, c]]) {
          const A = cam.project(p.j[x]), B = cam.project(p.j[y]);
          const trueLen = len(sub(p.j[x], p.j[y])) || 1;
          minSeg = Math.min(minSeg, Math.hypot(A.u - B.u, A.v - B.v) / trueLen);
        }
      }
    }
    const solidity = Math.min(1, (isFinite(minSeg) ? minSeg : 1) / 0.45); // <45% of true = a stub

    /* CLEARANCE — how much of the athlete the hardware leaves visible.
       ⛔ EVERY OTHER TERM HERE SCORES THE SKELETON ALONE, so for four rounds the solver handed
       back cameras with a frame upright standing across the chest, a rail through the thigh, a
       lever over the head — and each was found by eye and fixed by hand. That does not survive
       being repeated over a catalogue. The rig supplies the machine; the solver now looks at it.
       Supplied by the caller (see solids.makeClearance) so this file stays pure geometry. */
    const clearance = opts.clearance ? opts.clearance(cam, [poses[0], poses[(samples - 1) >> 1], poses[samples - 1]]) : 1;

    /* STATURE — how much of the ATHLETE survives the projection.
       ⛔ SOLIDITY GUARDS THE CUE LIMBS AND NOTHING GUARDED THE MAN. On a bench press the solver
       chose a camera looking straight up the body from the feet: the travel is vertical so it
       projected in full, the elbows read true, the arms never collapsed — every term scored well
       and the TRUNK was crushed to almost nothing, with the knees landing exactly where the chest
       should be. A demonstration of a body has to show the body.
       Measured pelvis→head, the one span that is long in every posture and in every exercise. */
    let stature = 1;
    for (const p of [poses[0], poses[samples - 1]]) {
      if (!p.j.pelvis || !p.j.head) break;
      const A = cam.project(p.j.pelvis), B = cam.project(p.j.head);
      const trueLen = len(sub(p.j.head, p.j.pelvis)) || 1;
      stature = Math.min(stature, Math.min(1, (Math.hypot(B.u - A.u, B.v - A.v) / trueLen) / 0.58));
    }

    /* ⛔ CLEARANCE WAS A LINEAR TERM WORTH ELEVEN PERCENT, and that is the wrong shape for it. A
       camera that hides the athlete has not scored slightly worse — it has failed, and no amount
       of travel fidelity buys that back. It is a GATE: free above 0.82, and proportional below,
       so the solver treats being able to see the man as a precondition rather than a preference.
       The threshold sits ABOVE the check's own floor of 0.86 on purpose: a gate that opens exactly
       where the assertion starts leaves the solver free to pick the one camera that scrapes it. */
    const base = 0.25 * travel + 0.30 * fidelity + 0.10 * separation
               + 0.15 * solidity + 0.10 * levelness + 0.10 * stature;
    const score = base * Math.min(1, clearance / 0.92);
    rows.push({ az, travel, fidelity, separation, solidity, levelness, clearance, stature, score });
  }
  const best = rows.reduce((a, b) => (b.score > a.score ? b : a));
  return { best, rows, elevation };
}

module.exports = { R, V, add, sub, mul, dot, len, norm, lerpV, cross, angle3, angle2, ik, camera, solveCamera };
