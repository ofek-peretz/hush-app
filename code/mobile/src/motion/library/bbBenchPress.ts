/**
 * bb_bench_press — the benchmark clip of the horizontal-push template, SHOT FROM THE SIDE.
 *
 * ── WHY THE CAMERA MOVED (2026-08-29) ───────────────────────────────────────────────────────────
 *
 * It was shot from the HEAD END for a year, on the ruling that the chest family is a frontal
 * identity family. That ruling was made about recognition, and it is right about recognition: you
 * can tell a bench press from the head end. But a clip in this app is not a label, it is the whole
 * instruction — nobody reads the cue text, they watch the loop and then go and do it — so the
 * question is not "can you name it" but "can you perform it from this".
 *
 * The head-end camera looks straight down the axis every fact of a bench press lives on:
 *
 *   · THE BAR PATH is a shallow J, from over the shoulders down to the sternum. Down that axis it
 *     is a point. The clip could not show it, and could not show that the bar arrives at the CHEST
 *     rather than the throat or the belly — the one thing beginners get wrong.
 *   · THE ELBOW TUCK — 55° between the humerus and the ribs — is an angle in the transverse plane,
 *     and the head-end camera flattens it into a foreshortening. It had to be smuggled in as a pair
 *     of shortened bones (see the `tuckDeg` note in `pressHorizontal.ts`).
 *   · THE SETUP — feet planted, hips on the pad, the arch, the bench itself — was a stub of a
 *     bench under a body seen end-on, and the legs read as two knees pointing at the lens.
 *   · AND THE BOTTOM OF THE REP, the position that matters most, drew as two hooks either side of a
 *     dark trunk, because at 55° of tuck both arm bones point substantially at the camera.
 *
 * From the side, all four are simply there: the bar travels 36u down the page onto a chest you can
 * see it touch, the elbow drops below the bench line, the feet are on the floor, and both arm bones
 * project at 87–95 % of their length instead of 82 % and 78 %.
 *
 * WHAT IS LOST, honestly: whether the two sides are symmetric, and the far arm. A bench press is
 * not judged on symmetry the way a fly is — and the far arm was never visible from the head end
 * either, it was superimposed on the near one.
 *
 * ── THE GEOMETRY ────────────────────────────────────────────────────────────────────────────────
 * Head to the LEFT, feet to the right. Depth (`z`) runs across the bar: the near shoulder rides at
 * +15.5 and the near hand out at the grip, +35, so the arm is genuinely diagonal in the room and
 * its drawn length is a projection rather than a decision. rom 0 = lockout, rom 1 = bar on the chest.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, twoBoneIK3 } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { flatBench, floorScene, plateGhost, sampledPathTicks } from '../kit';
import { FLOOR_Y } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/** The bench, and the body lying on it. None of this moves. */
const PAD_TOP = 152;
const BENCH_X0 = 118;
const BENCH_X1 = 226;

const SHOULDER: Vec2 = { x: 150, y: 145 };
const HIP: Vec2 = { x: 198, y: 147 };
const HEAD: Vec2 = { x: 134, y: 143.5 };
/*
 * The feet are pulled BACK under the knees, which is the setup — a bench press plants the foot
 * behind the kneecap so the leg can drive. Stretched forward (ankle beyond the knee, as it was
 * first drawn) the same skeleton reads as somebody sitting with their legs out.
 */
const KNEE: Vec2 = { x: 237.9, y: 150.3 }; // solved once from hip + planted ankle, knee ≈ 79°
const ANKLE: Vec2 = { x: 228, y: 186 };
const HEEL: Vec2 = { x: 222, y: FLOOR_Y };
const TOE: Vec2 = { x: 244, y: FLOOR_Y };

/**
 * THE GRIP, IN DEPTH — 35u each side of the bar's centre, the competition width (≈78 cm), and from
 * this camera that width is entirely depth. It is why the arm is not a flat triangle: the near hand
 * sits 19.5u nearer the viewer than its own shoulder, so the humerus runs diagonally out of the
 * page and the drawn arm is a projection of a real one.
 */
const GRIP_Z = 35;
const SH_Z = 15.5;

/**
 * Both ends of the bar's travel, solved rather than placed.
 *
 * At lockout the bar is over the shoulder and the arm is 99 % extended; at the chest it touches the
 * sternum — up 10u from the shoulder JOINT, because a lying chest stands proud of it, and 12u
 * toward the feet, which is what makes the path the shallow J a bench press actually has and what
 * the head-end camera could not draw at all.
 */
const LOCK_REACH = (U + F) * 0.99;
const LOCK_Y = SHOULDER.y - Math.sqrt(LOCK_REACH * LOCK_REACH - (GRIP_Z - SH_Z) * (GRIP_Z - SH_Z));
const LOCK_X = SHOULDER.x;
const CHEST_Y = 135;
const CHEST_X = 162;

const barAt = (rom: number): Vec2 => ({ x: lerp(LOCK_X, CHEST_X, rom), y: lerp(LOCK_Y, CHEST_Y, rom) });
const BAR_PATH: Vec2[] = Array.from({ length: 13 }, (_, i) => barAt(i / 12));

/** The near arm, in three dimensions: hand on the bar at the grip, elbow solved on canonical bones. */
function armAt(rom: number, side: 1 | -1): { elbow: Vec3; hand: Vec3 } {
  const bar = barAt(rom);
  const hand: Vec3 = { x: bar.x, y: bar.y, z: side * GRIP_Z };
  const shoulder: Vec3 = { x: SHOULDER.x, y: SHOULDER.y, z: side * SH_Z };
  /* Down and toward the feet. The hint is a DIRECTION, so it was swept against the angle it
     actually produces: 0.2 puts the humerus at 56° to the torso, which is the competition tuck.
     Watching that elbow drop below the bench line is the single most useful thing this camera can
     show and the other could not — end-on it was a foreshortening and nothing else. */
  const elbow = twoBoneIK3(shoulder, hand, U, F, { x: 0.2, y: 1, z: side * 0.12 });
  return { elbow, hand };
}

function poseAt(rom: number): Pose {
  const near = armAt(rom, 1);
  const far = armAt(rom, -1);
  const bar = barAt(rom);
  const flat = (q: Vec3): Vec2 => ({ x: q.x, y: q.y });
  const behind = (p: Vec2, dx: number, dy = 0): Vec2 => ({ x: p.x + dx, y: p.y + dy });
  return {
    headR: ATHLETE.headR,
    j: {
      head: HEAD,
      shoulder: SHOULDER,
      hip: HIP,
      knee: KNEE,
      ankle: ANKLE,
      heel: HEEL,
      toe: TOE,
      elbow: flat(near.elbow),
      hand: flat(near.hand),
      bar,
      farShoulder: SHOULDER,
      farElbow: flat(far.elbow),
      farHand: flat(far.hand),
      // the far leg is a uniform translate, so every far bone is exactly its near twin's length
      farHip: behind(HIP, -4, 2),
      farKnee: behind(KNEE, -4, 2),
      farAnkle: behind(ANKLE, -4, 2),
      farHeel: behind(HEEL, -4),
      farToe: behind(TOE, -4),
    },
    /*
     * DEPTH IS DECLARED RELATIVE TO THE DRAWN SHOULDER, not to the room's centre line.
     *
     * A side-view skeleton is the athlete's MIDLINE — the head, the spine and the drawn shoulder
     * all sit on it — while the arm actually hangs off a joint 15.5u out toward the viewer. Both
     * facts are true and they cannot share one number: declare the shoulder at its real +15.5 and
     * the NECK becomes 22.3 against a canonical 16, because the head is on the midline and the
     * shoulder is not. Declaring the arm's depths relative to their own root keeps every bone
     * measuring its true length — the drawn x,y of the joint and the midline shoulder coincide in
     * this camera, so the subtraction costs nothing — and leaves the spine and neck on the line
     * they are drawn on.
     */
    z: {
      elbow: near.elbow.z - SH_Z,
      hand: GRIP_Z - SH_Z,
      farElbow: far.elbow.z + SH_Z,
      farHand: -GRIP_Z + SH_Z,
    },
  };
}

/** The rack: one upright behind the bench with the J-hook the bar was lifted off. */
function rackSide(x: number, hookY: number): Primitive[] {
  return [
    { kind: 'line', a: { x, y: hookY - 12 }, b: { x, y: FLOOR_Y }, w: 3.5, color: 'ink3' },
    { kind: 'line', a: { x: x - 11, y: FLOOR_Y }, b: { x: x + 11, y: FLOOR_Y }, w: 2.5, color: 'ink3', cap: 'round' },
    // the hook, open toward the lifter
    { kind: 'line', a: { x, y: hookY }, b: { x: x + 9, y: hookY }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: x + 9, y: hookY }, b: { x: x + 9, y: hookY - 6 }, w: 2.5, color: 'ink3' },
  ];
}

function decorAt(rom: number): Decor {
  const bar = barAt(rom);
  return {
    back: [
      ...rackSide(BENCH_X0 - 4, LOCK_Y + 4),
      ...flatBench(BENCH_X0, BENCH_X1, PAD_TOP, FLOOR_Y),
      /* The bar path drawn ON the path — a short dashed J above the chest, which is the whole
         reason this camera exists. Offsetting it to a clear patch of background, the way a vertical
         path mark can be, would state a line the bar never travels. */
      ...sampledPathTicks(BAR_PATH),
    ],
    /* The plate is a GHOST and has to be: seen end-on it is a 32u disc sitting exactly where the
       athlete's chest is, and drawn solid it would erase the half of the rep this camera exists to
       show. At 20 % it says "barbell, true scale" and the body reads straight through it. */
    front: plateGhost(bar),
  };
}

const formspec: FormSpec = {
  tempo: DEFAULT_TEMPO,
  start: [
    { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 160, max: 179, label: 'elbow lockout (full press) — the unrack' },
  ],
  end: [
    { kind: 'contactY', a: 'bar', y: CHEST_Y, tol: 2, label: 'bar touches the chest' },
    { kind: 'jointBelow', a: 'elbow', b: 'shoulder', by: 6, label: 'the elbow drops below the shoulder line at the chest' },
  ],
  path: { track: 'bar', kind: 'line', tol: 1.5, dir: { x: CHEST_X - LOCK_X, y: CHEST_Y - LOCK_Y } },
  invariants: [
    { kind: 'pointFixed', point: 'ankle', tol: 1.0, label: 'feet planted' },
    { kind: 'pointFixed', point: 'toe', tol: 1.0, label: 'toes planted' },
    { kind: 'pointFixed', point: 'hip', tol: 1.0, label: 'hips on the bench' },
    { kind: 'pointFixed', point: 'shoulder', tol: 1.0, label: 'shoulders on the bench' },
    { kind: 'pointFixed', point: 'head', tol: 1.0, label: 'head still' },
    { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
  ],
};

export const bbBenchPress: Rig = {
  id: 'bb_bench_press',
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
  scene: floorScene(FLOOR_Y, 180, 70),
};
