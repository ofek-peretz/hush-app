/**
 * bb_overhead_press — STANDING, AND FROM THE SIDE (2026-08-29).
 *
 * ── WHY IT WAS NEITHER ──────────────────────────────────────────────────────────────────────────
 *
 * It shipped SEATED, on a shared builder with the four other vertical presses, and its own card
 * calls it `support: 'free'` and cues **"Bar over the mid-foot."** There is no mid-foot when you are
 * sitting down. Worse, the catalogue then held three seated overhead presses — this one,
 * `machine_shoulder_press` and `smith_overhead_press` — and no standing one at all, so the barbell
 * military press, the movement the whole family is named after, was not depicted anywhere.
 *
 * The reason it was seated is recorded and was real: at true scale a standing lockout does not fit.
 * Floor at 193, shoulder at 61.5, a 47.6u arm and a plate on top needs 193u of a 187.5u frame.
 *
 * ── WHAT MAKES IT FIT ───────────────────────────────────────────────────────────────────────────
 *
 * Two things, and neither is a cheat:
 *
 *   1. THE GRIP IS DEPTH, from this camera. A press grip is 35.5u each side of the bar, so the hand
 *      is 20u out from its own shoulder joint — and an arm spending 20 of its 47.6 units sideways
 *      only reaches 43.2 up. The old front view could not know that: it drew the grip width in the
 *      page and the reach came out too tall. Honest 3D lowers the lockout by 4.4u for free.
 *   2. THE FLOOR DROPS to 205. Every rig in this library leaves 20u of unused frame below its floor
 *      line; this one spends 12 of it. The athlete is drawn lower in the picture, which is what a
 *      tall movement needs, and the plate — a 5 kg iron plate, which is what 30 kg on a 20 kg bar
 *      actually is — clips the top edge by a few units at lockout and nowhere else.
 *
 * ── AND WHY THE SIDE ────────────────────────────────────────────────────────────────────────────
 *
 * Every fault this lift is coached out of is a sagittal one. "Bar over the mid-foot" is a statement
 * about where the bar sits front-to-back. Pressing AROUND the head instead of moving the head out
 * of the way is front-to-back. Leaning back under the bar is front-to-back. Face-on, a viewer can
 * see none of it — and the head moving back and then through the window, which is the technique, is
 * drawn here because from this camera it can be.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, twoBoneIK3 } from '../geometry';
import { leads } from '../curves';
import { CONCENTRIC_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, plateGhost, sampledPathTicks } from '../kit';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/**
 * The floor, 16u below the library's usual line — the only way a standing overhead lockout fits a
 * frame 187.5u tall. It costs the strip of empty ground every other clip leaves unused, and it buys
 * the whole plate at the top: at 205 the lockout plate lost a third of itself to the frame edge, at
 * 209 it clips by under 3u.
 */
const FLOOR_Y = 212; // 209 left the plate’s crown 3u past the top edge at lockout; 213 put the sole 0.5u past the bottom (frame law, 2026-09-07)
const DROP = FLOOR_Y - 193;

const X = 176; // centred: the figure is narrow from the side and the bar path is the subject
const ANKLE: Vec2 = { x: X, y: 186 + DROP };
const KNEE: Vec2 = { x: X + 3, y: 149.5 + DROP };
const HIP: Vec2 = { x: X, y: 109.5 + DROP };
const SHOULDER: Vec2 = { x: X + 1.5, y: 61.5 + DROP };
const HEEL: Vec2 = { x: X - 10, y: FLOOR_Y };
const TOE: Vec2 = { x: X + 15, y: FLOOR_Y };
/** Where the bar belongs at lockout, and the cue this clip exists to make checkable. */
const MID_FOOT = (HEEL.x + TOE.x) / 2;

/** Half the grip, in depth: 35.5u ≈ 80 cm between the hands, a shade outside shoulder width. */
const GRIP_Z = 35.5;
const SH_Z = 15.5;
const REACH = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((168 * Math.PI) / 180)); // 168°: locked out, not snapped — and 0.6u lower than 172° (2026-09-07)
/** What is left of the reach after 20u of it has gone sideways to the grip. */
const LIFT = Math.sqrt(REACH * REACH - (GRIP_Z - SH_Z) * (GRIP_Z - SH_Z));

/*
 * The rack, measured for legibility (audit, 2026-09-03). At (+11, −3) the folded arm projected to
 * a 30° elbow — the forearm lay on top of the upper arm and the rack, the one pose a beginner has
 * to read, was a lump under the plate. 20u of the 47.6u arm goes sideways into the grip from this
 * camera, so the fold can never project wide; the scan of rack offsets × IK hints put the widest
 * honest rack at (+13, −6): the bar on the clavicles at the base of the neck, the elbow straight
 * under it. Projected elbow 30° → 39° at rom 0, 43° → 53° at rom 0.25; true angle 57° → 61°.
 * The reviewer's (+9, −6) was measured too and came out WORSE (29°): raising the bar without
 * bringing it forward only shortens the shoulder→hand line.
 */
const RACK: Vec2 = { x: SHOULDER.x + 13, y: SHOULDER.y - 6 };
const LOCK: Vec2 = { x: MID_FOOT, y: SHOULDER.y - LIFT };

const barAt = (rom: number): Vec2 => ({ x: lerp(RACK.x, LOCK.x, rom), y: lerp(RACK.y, LOCK.y, rom) });
const BAR_PATH: Vec2[] = Array.from({ length: 13 }, (_, i) => barAt(i / 12));

/**
 * THE HEAD MOVES, and in this lift it has to.
 *
 * A press does not go around the head, the head goes around the press: it pulls back as the bar
 * passes the face and then comes forward UNDER the bar at lockout — "through the window". It is the
 * difference between a military press and a lifter arching away from a bar they cannot clear, and
 * it is a purely front-to-back motion, which is why no front-view version of this clip could ever
 * have shown it. Every other rig in the library pins the head still; this one is the exception, and
 * its FormSpec says so out loud rather than leaving the movement to look like drift.
 */
/**
 * The retreat runs on its own clock (audit, 2026-09-03 — iron rule 12). The bar passes the face
 * between rom 0.05 and 0.48, so the head must be furthest back while the bar is AT the face, not
 * at mid-rep, and it comes through the window as soon as the bar has cleared — `leads(0.35)` puts
 * the retreat's peak at rom 0.33 and has the head back on its line by 0.65, while the arm is still
 * pressing. On one clock the head was still 5.5u back at rom 0.5 with the bar already at the brow.
 */
const HEAD_LEADS = leads(0.35);

function headAt(rom: number): Vec2 {
  // back while the bar passes the face, forward through the rest — a quadratic through three points
  const r = HEAD_LEADS(rom);
  const back = 4 * r * (1 - r); // 0 → 1 at the retreat's peak → 0
  const x = SHOULDER.x + 0.5 - 5.5 * back + 2.5 * rom;
  const dx = x - SHOULDER.x;
  // the neck is a bone, so its length sets the height rather than a second authored number
  return { x, y: SHOULDER.y - Math.sqrt(Math.max(1, ATHLETE.neck * ATHLETE.neck - dx * dx)) };
}

function armAt(rom: number, side: 1 | -1): { elbow: Vec3; hand: Vec3 } {
  const bar = barAt(rom);
  const hand: Vec3 = { x: bar.x, y: bar.y, z: side * GRIP_Z };
  const shoulder: Vec3 = { x: SHOULDER.x, y: SHOULDER.y, z: side * SH_Z };
  /* Down, and only a little forward: the front-rack elbow rides UNDER the bar (x 0.5 → 0.2 put it
     at 190 against a bar at 190.5, audit 2026-09-03), and it swings out and up as the bar clears
     the head. */
  const elbow = twoBoneIK3(shoulder, hand, U, F, { x: 0.2, y: 1, z: side * 0.1 });
  return { elbow, hand };
}

function poseAt(rom: number): Pose {
  const near = armAt(rom, 1);
  const far = armAt(rom, -1);
  const flat = (q: Vec3): Vec2 => ({ x: q.x, y: q.y });
  const behind = (q: Vec2, dx: number, dy = 0): Vec2 => ({ x: q.x + dx, y: q.y + dy });
  return {
    headR: ATHLETE.headR,
    j: {
      head: headAt(rom),
      shoulder: SHOULDER,
      hip: HIP,
      knee: KNEE,
      ankle: ANKLE,
      heel: HEEL,
      toe: TOE,
      elbow: flat(near.elbow),
      hand: flat(near.hand),
      bar: barAt(rom),
      farShoulder: SHOULDER,
      farElbow: flat(far.elbow),
      farHand: flat(far.hand),
      farHip: behind(HIP, -4, 1),
      farKnee: behind(KNEE, -4, 1),
      farAnkle: behind(ANKLE, -4, 1),
      farHeel: behind(HEEL, -4),
      farToe: behind(TOE, -4),
    },
    // arm depths are relative to their own root — see `bbBenchPress` for why the shoulder stays on
    // the midline
    z: {
      elbow: near.elbow.z - SH_Z,
      hand: GRIP_Z - SH_Z,
      farElbow: far.elbow.z + SH_Z,
      farHand: -GRIP_Z + SH_Z,
    },
  };
}

function decorAt(rom: number): Decor {
  const bar = barAt(rom);
  return {
    back: [
      /* The mid-foot line — the cue, drawn. It is the one reference an overhead press is judged
         against, and a vertical dropped from the bar either lands on it or does not. */
      { kind: 'dash', a: { x: MID_FOOT, y: LOCK.y - 6 }, b: { x: MID_FOOT, y: FLOOR_Y }, w: 1.6, color: 'ink3', dash: [1.5, 7], opacity: 0.7 },
      ...sampledPathTicks(BAR_PATH),
    ],
    /* A 5 kg iron plate — 25 cm across, which is what 30 kg on a 20 kg bar is. The big 45 cm ghost
       would not clear the top of the frame at lockout, and would be the wrong plate besides. */
    front: plateGhost(bar, 6.6), // 7.5 crossed the frame's top by 0.7u once the floor came down to clear the sole (frame law, 2026-09-07)
  };
}

const formspec: FormSpec = {
  tempo: CONCENTRIC_TEMPO,
  start: [
    { kind: 'contactY', a: 'bar', y: RACK.y, tol: 2, label: 'the front rack — bar on the delts' },
    { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 20, max: 70, label: 'elbows folded under the bar' },
  ],
  end: [
    { kind: 'contactX', a: 'bar', x: MID_FOOT, tol: 1.5, label: 'locked out with the bar over the mid-foot' },
    { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 155, max: 179, label: 'lock out overhead' },
  ],
  path: { track: 'bar', kind: 'line', tol: 1.5, dir: { x: LOCK.x - RACK.x, y: LOCK.y - RACK.y } },
  invariants: [
    { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
    { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toes planted' },
    { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips square — no layback under the bar' },
    { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees long — a press, not a push press' },
    { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the shoulder is the pivot' },
    { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    /* NOT `pointFixed` on the head — see `headAt`. The head is supposed to move here, and pinning
       it would be pinning the fault this lift is coached out of. */
  ],
};

export const bbOverheadPress: Rig = {
  id: 'bb_overhead_press',
  chains: {
    torso: ['hip', 'shoulder'],
    neck: ['shoulder', 'head'],
    head: 'head',
    nearArm: ['shoulder', 'elbow', 'hand'],
    farArm: ['farShoulder', 'farElbow', 'farHand'],
    nearLeg: ['hip', 'knee', 'ankle'],
    farLeg: ['farHip', 'farKnee', 'farAnkle'],
    nearFoot: ['heel', 'toe'],
    farFoot: ['farHeel', 'farToe'],
  },
  formspec,
  poseAt,
  decorAt,
  scene: floorScene(FLOOR_Y, X + 2, 30),
};
