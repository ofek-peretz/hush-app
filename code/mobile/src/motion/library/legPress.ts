/**
 * squat_supported — the leg press and its two relatives, the machines a beginner meets before she
 * will go near a barbell. Three members, one geometry: the back is held, the feet are on a plate,
 * and the whole leg folds and opens along a RAIL.
 *
 * ── WHY THE FOOT DRIVES AND THE BODY IS SOLVED ─────────────────────────────────────────────────
 * The same inversion the squat and the deadlift use. The foot plate travels its rail — a straight
 * line, which is what `path: 'line'` means and what makes the drawn path true rather than tuned —
 * and the KNEE is solved by two-bone IK between the fixed hip and the travelling ankle. Depth falls
 * out of the geometry: the knee rises toward the chest because the thigh and shank have nowhere
 * else to go, not because a keyframe was posed that way.
 *
 * ── THE RANGE THE MACHINE ACTUALLY ALLOWS ──────────────────────────────────────────────────────
 * rom 0 = knees deep, near the chest · rom 1 = legs long. And the endpoint is deliberately NOT
 * straight: `angleNever` caps the knee below lockout, because "don't lock out hard" is the cue this
 * family carries in `exercises.ts` and locking a loaded leg press is how people hurt themselves on
 * the one machine that felt safe. The demonstration cannot show what the words forbid (§0).
 *
 * ── THE THREE MEMBERS ──────────────────────────────────────────────────────────────────────────
 * They differ in the rail's ANGLE and in the body's attitude to it, and in nothing else:
 *   · `leg_press` — reclined, rail rising at 40°, the classic 45° sled.
 *   · `hack_squat` — nearly upright, the shoulders under pads, rail steep.
 *   · `single_leg_press` — the sled, one leg working, the other tucked clear.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK, twoBoneIKToward, withinReach } from '../geometry';
import { sticksAt } from '../curves';

/** The sticking point (iron rule 12, 2026-09-07): the driver slows to a dwell where leverage is
 *  worst and runs on. Endpoints untouched. */
const STICK = sticksAt(0.35, 0.07); // just out of the hole — the knee at ~100°
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, linePathTicks, padStroke, plateGhost } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;

interface PressParams {
  id: string;
  /** The rail's angle above horizontal, degrees — the machine's defining number. */
  railDeg: number;
  /** Where the hip sits, and how far the trunk reclines from vertical. */
  hip: Vec2;
  leanDeg: number;
  /**
   * Distance along the rail from the hip at the DEEP position and at the LONG one.
   *
   * `far_` is the LOCKOUT, and it decides how much of a rep the clip shows. At 74 the knee only
   * reached 148° — a third of the range never drawn, so a viewer copying the loop presses two
   * thirds of a rep. 76.2 puts it at 164°: long, and still visibly short of a locked knee, which is
   * the thing a leg press is actually cued about.
   */
  near: number;
  far_: number;
  singleLeg?: boolean;
  /** Shoulder pads instead of a seat back — the hack squat stands under the load. */
  shoulderPads?: boolean;
}

function legPress(p: PressParams): Rig {
  const rad = (p.railDeg * Math.PI) / 180;
  /** Along the rail, away from the athlete: up and forward. */
  const along: Vec2 = { x: Math.cos(rad), y: -Math.sin(rad) };
  const HIP = p.hip;
  const plateAt = (d: number): Vec2 => ({ x: HIP.x + along.x * d, y: HIP.y + along.y * d });

  const leanRad = (p.leanDeg * Math.PI) / 180;
  const SHOULDER: Vec2 = { x: HIP.x - ATHLETE.torso * Math.sin(leanRad), y: HIP.y - ATHLETE.torso * Math.cos(leanRad) };
  const HEAD: Vec2 = { x: SHOULDER.x - ATHLETE.neck * Math.sin(leanRad), y: SHOULDER.y - ATHLETE.neck * Math.cos(leanRad) };

  const poseAt = (rom: number): Pose => {
    const d = lerp(p.near, p.far_, STICK(rom));
    const ankle = plateAt(d);
    /* The knee is SOLVED, never posed: two bones between a fixed hip and a travelling foot. */
    const knee = twoBoneIK(HIP, ankle, T, S, -1);
    /* The foot stands on the plate — flat against it, so its line is the rail's perpendicular. */
    const perp: Vec2 = { x: -along.y, y: along.x };
    const heel: Vec2 = { x: ankle.x - perp.x * 9, y: ankle.y - perp.y * 9 };
    const toe: Vec2 = { x: ankle.x + perp.x * 14, y: ankle.y + perp.y * 14 };
    /* The hand is the authored end — it grips the sled's side handle — and the elbow is SOLVED
       between. Authoring both independently made the forearm whatever the gap happened to be:
       34.8 units against a canonical 23. */
    const hand = withinReach(SHOULDER, { x: HIP.x + 2, y: HIP.y - 12 }, (ATHLETE.upperArm + ATHLETE.foreArm) * 0.97);
    const elbow = twoBoneIKToward(SHOULDER, hand, ATHLETE.upperArm, ATHLETE.foreArm, { x: SHOULDER.x + 10, y: SHOULDER.y + 16 });
    /*
     * THE RESTING LEG STANDS ON THE FLOOR beside the sled (audit, 2026-09-03). It was folded in the
     * air at plateAt(near·0.72) — on nothing: not on the plate, not on the floor — and a beginner
     * copying the loop was being told "hold the other leg up", which no coach says. The foot is
     * planted flat beside the seat, the knee solved forward of the hip over it, and it never moves.
     */
    const restAnkle: Vec2 = p.singleLeg ? { x: HIP.x + 32, y: FLOOR_Y - ATHLETE.ankleH } : ankle;
    const restKnee = p.singleLeg ? twoBoneIKToward(HIP, restAnkle, T, S, { x: HIP.x + 44, y: HIP.y }) : knee;
    const restHeel: Vec2 = p.singleLeg ? { x: restAnkle.x - 8, y: FLOOR_Y } : { x: restAnkle.x - perp.x * 9, y: restAnkle.y - perp.y * 9 };
    const restToe: Vec2 = p.singleLeg ? { x: restAnkle.x + 15, y: FLOOR_Y } : { x: restAnkle.x + perp.x * 14, y: restAnkle.y + perp.y * 14 };
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee,
        ankle,
        heel,
        toe,
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(restKnee, -6, 1),
        farAnkle: far(restAnkle, -6, 1),
        farHeel: far(restHeel, -6, 0),
        farToe: far(restToe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const d = lerp(p.near, p.far_, STICK(rom));
    const ankle = plateAt(d);
    const perp: Vec2 = { x: -along.y, y: along.x };
    /** The foot PLATE — a slab square across the rail, riding with the feet. */
    const plate: Primitive[] = padStroke(
      { x: ankle.x + perp.x * 22 + along.x * 5, y: ankle.y + perp.y * 22 + along.y * 5 },
      { x: ankle.x - perp.x * 20 + along.x * 5, y: ankle.y - perp.y * 20 + along.y * 5 },
      9,
    );
    /** The rail itself, drawn its whole length so the travel reads as travel along a machine. */
    const railA = plateAt(p.near - 16);
    /* far_+20 stood the mast at x 192, through the range statement's far tick; the rail now runs
       18u further up (top y 54, inside the frame) so the mast clears the ticks by 2u (audit, 2026-09-03). */
    const railB = plateAt(p.far_ + 38);
    /**
     * THE RANGE STATEMENT RIDES UNDER THE SLED, not on the rail (audit, 2026-09-03). On the rail
     * line the ticks ran 7u from the plate ghost's centre — inside a ring of r 20 — and at phone
     * size plate, ring and ticks were one blob. 33u below the rail (the ring reaches 27, the end
     * ticks 4.5) the dashed line is parallel to the path, the same length, and clear of everything.
     */
    const TICKS_OFF = 33;
    const under = (q: Vec2): Vec2 => ({ x: q.x + perp.x * TICKS_OFF, y: q.y + perp.y * TICKS_OFF });
    /*
     * THE LOAD, which the sled was carrying none of.
     *
     * A leg press is `loadStyle: 'plate_loaded'` and its plates are the single most recognisable
     * thing about it — 45cm discs on horns behind the footplate, riding up the rail with it. Drawn
     * without them the machine was a diagonal line, a slab and a post, and the clip relied on the
     * athlete's posture alone to say which station he was in. The horn sits just beyond the plate
     * along the rail and below it, which is where a sled actually carries its discs.
     */
    const horn = plateAt(d + 13);
    const back: Primitive[] = [
      { kind: 'line', a: railA, b: railB, w: 3, color: 'ink3' },
      { kind: 'line', a: { x: railB.x, y: railB.y }, b: { x: railB.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      ...plateGhost({ x: horn.x + perp.x * 7, y: horn.y + perp.y * 7 }),
      ...linePathTicks(under(plateAt(p.near)), under(plateAt(p.far_))),
      /* The frame's base and the seat's post — the machine stood on one mast with the seat and
         back pad floating beside it (audit, 2026-09-03). */
      { kind: 'line', a: { x: HIP.x - 30, y: FLOOR_Y - 2 }, b: { x: railB.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
    ];
    if (p.shoulderPads) {
      back.push(...padStroke({ x: SHOULDER.x - 13, y: SHOULDER.y - 12 }, { x: SHOULDER.x + 13, y: SHOULDER.y - 12 }, 8));
    } else {
      // The reclined back pad, along the trunk line, the seat under the hip, and the seat's post.
      back.push(
        { kind: 'line', a: { x: HIP.x + 5, y: HIP.y + 9 }, b: { x: HIP.x + 5, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        ...padStroke({ x: SHOULDER.x - 7, y: SHOULDER.y + 2 }, { x: HIP.x - 7, y: HIP.y + 2 }, 8),
        ...padStroke({ x: HIP.x - 6, y: HIP.y + 9 }, { x: HIP.x + 16, y: HIP.y + 9 }, 7),
      );
    }
    return { back, front: plate };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 55, max: 100, label: 'knees deep, toward your chest' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 140, max: 168, label: 'press the legs long — and stop short of locking' },
    ],
    path: { track: 'ankle', kind: 'line', tol: 1.5, dir: along },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'your back stays on the pad' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the trunk does not move — only the legs' },
      /*
       * ⛔ THE ONE THAT MATTERS. `exercises.ts` cues this family with "don't lock out hard", and a
       * demonstration that snapped to 180° would be teaching the opposite of the words the same card
       * shows. The ceiling is below lockout, so the drawing cannot get there.
       */
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 170, label: 'never locked out' },
    ],
  };

  return { id: p.id, chains: pressChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 160, 30) };
}

const pressChains = {
  torso: ['hip', 'shoulder'] as [string, string],
  neck: ['shoulder', 'head'] as [string, string],
  head: 'head',
  nearArm: ['shoulder', 'elbow', 'hand'],
  farArm: ['farShoulder', 'farElbow', 'farHand'],
  nearLeg: ['hip', 'knee', 'ankle'],
  nearFoot: ['heel', 'toe'] as [string, string],
  farLeg: ['farHip', 'farKnee', 'farAnkle'],
  farFoot: ['farHeel', 'farToe'] as [string, string],
};

export const legPressRig = legPress({
  id: 'leg_press',
  railDeg: 40,
  hip: { x: 118, y: 150 }, // 96 put the head's halo 1.2u past the left edge with half the frame empty on the right (audit, 2026-09-03)
  leanDeg: 62,
  near: 46,
  far_: 76.2,
});

export const singleLegPressRig = legPress({
  id: 'single_leg_press',
  railDeg: 40,
  hip: { x: 118, y: 150 }, // 96 put the head's halo 1.2u past the left edge with half the frame empty on the right (audit, 2026-09-03)
  leanDeg: 62,
  near: 46,
  far_: 76.2,
  singleLeg: true,
});

/**
 * hack_squat — THE MACHINE IS THE OTHER WAY UP, and it was drawn the leg press's way.
 *
 * `legPress` pins the HIP and runs the footplate away from it up the rail. That is exactly right for
 * a sled: you sit still and the plate travels. A hack squat is the inverse — the footplate is BOLTED
 * TO THE FLOOR and the BODY travels the rail, shoulders under the pads. Built on the sled's
 * geometry the athlete came out reclined at 50 degrees with his feet in the air ABOVE his own hips,
 * which is a leg press with a steeper rail and not a hack squat at any depth.
 *
 * So this member gets its own construction: ankle fixed on the plate, the hip riding a rail 20
 * degrees off vertical, the trunk lying along that same rail (his back IS on the carriage), and the
 * load riding the carriage at the shoulder end where a hack squat carries it.
 */
export const hackSquatRig: Rig = (() => {
  /* x 172 → 216: the drawing spanned x 100–200 of a 30–330 frame; centred now (audit, 2026-09-03). */
  const ANKLE: Vec2 = { x: 216, y: 173 }; // on the machine's raised footplate
  /** Up the rail: 20 degrees off vertical, leaning BACK over the heels — the carriage's line. */
  const UP: Vec2 = { x: -Math.sin(20 * (Math.PI / 180)), y: -Math.cos(20 * (Math.PI / 180)) };
  /** The rail's perpendicular, pointing FORWARD (toes-side). */
  const PERP: Vec2 = { x: -UP.y, y: UP.x };
  /*
   * THE FEET ARE FORWARD ON THE PLATFORM (audit, 2026-09-03). The rail used to pass through the
   * ankle, so the knee's fold swung the shin 30° forward at the bottom and the sole-to-shin angle
   * closed to 50°: heels off the plate. With the carriage's line 16u behind the ankle — feet high
   * on the plate, the cue every hack squat carries — the shin leans 12° forward at the bottom and
   * 24° back at the top, and the ankle runs 64°→100° on the tilted plate: performable, heels down.
   */
  const RAIL_BACK = 16;
  /** The platform's tilt, toes UP, 14° — a hack squat's plate is angled toward the carriage. */
  const TILT = (14 * Math.PI) / 180;
  const PLATE: Vec2 = { x: Math.cos(TILT), y: -Math.sin(TILT) };
  /** Hip distances along the rail, DERIVED from the knee angles the FormSpec asks for (85° deep,
      164° tall — long and still short of locked) by the law of cosines, minus the rail's offset. */
  const chord = (deg: number) => Math.sqrt(T * T + S * S - 2 * T * S * Math.cos((deg * Math.PI) / 180));
  const DEEP = Math.sqrt(chord(85) ** 2 - RAIL_BACK * RAIL_BACK);
  const TALL = Math.sqrt(chord(164) ** 2 - RAIL_BACK * RAIL_BACK);
  const hipAt = (d: number): Vec2 => ({ x: ANKLE.x + UP.x * d - PERP.x * RAIL_BACK, y: ANKLE.y + UP.y * d - PERP.y * RAIL_BACK });
  /** The sole, 7u under the ankle along the plate's normal; heel and toe lie ON the tilted plate. */
  const SOLE: Vec2 = { x: ANKLE.x - Math.sin(TILT) * 7, y: ANKLE.y + Math.cos(TILT) * 7 };
  const HEEL: Vec2 = { x: SOLE.x - PLATE.x * 10, y: SOLE.y - PLATE.y * 10 };
  const TOE: Vec2 = { x: SOLE.x + PLATE.x * 15, y: SOLE.y + PLATE.y * 15 };

  const poseAt = (rom: number): Pose => {
    const hip = hipAt(lerp(DEEP, TALL, rom));
    const knee = twoBoneIKToward(ANKLE, hip, S, T, { x: hip.x + 34, y: (hip.y + ANKLE.y) / 2 });
    const shoulder: Vec2 = { x: hip.x + UP.x * ATHLETE.torso, y: hip.y + UP.y * ATHLETE.torso };
    const head: Vec2 = { x: shoulder.x + UP.x * ATHLETE.neck * 0.9, y: shoulder.y + UP.y * ATHLETE.neck * 0.9 };
    /* The hands hold the carriage's grips — a hand's length below the shoulder pads, in front of
       the chest, elbows tucked down and back. They hung to hip height before, which no hack squat
       has: its handles are at the pads (audit, 2026-09-03). */
    const hand: Vec2 = { x: shoulder.x - UP.x * 18 + PERP.x * 12, y: shoulder.y - UP.y * 18 + PERP.y * 12 };
    const elbow = twoBoneIKToward(shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, {
      x: shoulder.x - UP.x * 14 - PERP.x * 6,
      y: shoulder.y - UP.y * 14 - PERP.y * 6,
    });
    return {
      headR: ATHLETE.headR,
      j: {
        head, shoulder, hip, knee, ankle: ANKLE, heel: HEEL, toe: TOE, elbow, hand,
        farShoulder: far(shoulder, -6, 1), farElbow: far(elbow, -6, 1), farHand: far(hand, -6, 1),
        farHip: far(hip, -6, 1), farKnee: far(knee, -7, 1), farAnkle: far(ANKLE, -7, 1),
        farHeel: far(HEEL, -8), farToe: far(TOE, -8),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const hip = pose.j.hip;
    const shoulder = pose.j.shoulder;
    const railA = hipAt(DEEP - 26);
    const railB = hipAt(TALL + 58); // +40 ended the rail under the load's ring; it now runs past it (audit, 2026-09-03)
    const off = (q: Vec2, k: number): Vec2 => ({ x: q.x - PERP.x * k, y: q.y - PERP.y * k });
    /* The load rides the carriage 14u BELOW the shoulder line (it sat 6u above): at r 20 behind the
       shoulder the ring overlapped the back half of the head every frame (audit, 2026-09-03). */
    const load: Vec2 = { x: hip.x + UP.x * (ATHLETE.torso - 14), y: hip.y + UP.y * (ATHLETE.torso - 14) };
    return {
      back: [
        // the rail and its mast, grounded
        { kind: 'line', a: off(railA, 26), b: off(railB, 26), w: 3.5, color: 'ink3' },
        { kind: 'line', a: off(railA, 26), b: { x: off(railA, 26).x, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: off(railA, 26).x - 12, y: FLOOR_Y - 2 }, b: { x: ANKLE.x + 26, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        // the bolted footplate he stands on — tilted toes-up, and the foot lies flat on it
        ...padStroke({ x: SOLE.x - PLATE.x * 20, y: SOLE.y - PLATE.y * 20 }, { x: SOLE.x + PLATE.x * 24, y: SOLE.y + PLATE.y * 24 }, 9),
        // the back pad, along the rail behind him
        ...padStroke(off(hipAt(lerp(DEEP, TALL, rom) - 4), 11), off(shoulder, 11), 13),
        // the load, riding the carriage behind the chest — a hack squat carries it on the sled
        ...plateGhost(off(load, 26), 15),
        // the grip bar, from the pad's front end down to the hand
        { kind: 'line', a: { x: shoulder.x + 13, y: shoulder.y - 9 }, b: pose.j.hand, w: 2.5, color: 'ink3' },
        ...linePathTicks(off(hipAt(DEEP), 30), off(hipAt(TALL), 30)),
      ],
      front: [
        // the shoulder pads the carriage presses down through
        ...padStroke(
          { x: shoulder.x - 13, y: shoulder.y - 9 },
          { x: shoulder.x + 13, y: shoulder.y - 9 },
          9,
        ),
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 70, max: 100, label: 'deep — the hips travel down the rail' }],
    end: [{ kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 140, max: 168, label: 'stand the carriage up — and stop short of locking' }],
    path: { track: 'hip', kind: 'line', tol: 1.5, dir: UP },
    invariants: [
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'the feet do not move — the plate is bolted down' },
      { kind: 'pointFixed', point: 'heel', tol: 0.5, label: 'heels stay on the plate' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 2, label: 'the back is on the pad and stays there' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 172, label: 'never locked at the top' },
    ],
  };

  return {
    id: 'hack_squat',
    chains: {
      torso: ['hip', 'shoulder'], neck: ['shoulder', 'head'], head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'], farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'], nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'], farFoot: ['farHeel', 'farToe'],
    },
    formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 168, 40),
  };
})();

/**
 * leg_press_calf_raise — ON THE SLED, where it happens (equipment QC 2026-08-25: it was drawn
 * standing under a trap pad — the standing machine's signature on the wrong exercise, the exact
 * confusion §3.5 Amendment 5 exists to forbid; the machine is the exercise's noun, and this
 * exercise's noun is the leg press). Same station as `leg_press` — same rail, same recline, same
 * pads — but the LEGS ARE LONG AND STAY LONG: the knee is parked in one soft window and pinned by
 * invariant, and the whole rep is the FOOT pivoting about the ankle, the ball of the foot driving
 * the plate up the rail and reaching back for the stretch. The plate rides the toe 1:1; the range
 * statement ticks the toe's true travel along the rail.
 */
export const legPressCalfRaiseRig: Rig = (() => {
  const railDeg = 40;
  const HIP: Vec2 = { x: 118, y: 150 }; // see the leg press: centred, off the left edge (audit, 2026-09-03)
  const leanDeg = 62;
  const rad = (railDeg * Math.PI) / 180;
  const along: Vec2 = { x: Math.cos(rad), y: -Math.sin(rad) };
  const perp: Vec2 = { x: -along.y, y: along.x };

  const leanRad = (leanDeg * Math.PI) / 180;
  const SHOULDER: Vec2 = { x: HIP.x - ATHLETE.torso * Math.sin(leanRad), y: HIP.y - ATHLETE.torso * Math.cos(leanRad) };
  const HEAD: Vec2 = { x: SHOULDER.x - ATHLETE.neck * Math.sin(leanRad), y: SHOULDER.y - ATHLETE.neck * Math.cos(leanRad) };

  /** Legs long and soft: the ankle parks where a ~160° knee puts it, and NEVER travels the rail. */
  const D_ANKLE = Math.sqrt(T * T + S * S - 2 * T * S * Math.cos((160 * Math.PI) / 180));
  const ANKLE: Vec2 = { x: HIP.x + along.x * D_ANKLE, y: HIP.y + along.y * D_ANKLE };
  const KNEE = twoBoneIK(HIP, ANKLE, T, S, -1);

  /** The foot about its ankle: φ is measured from the plate line (perp); + tips the toe up-rail. */
  /* 45° of foot pivot (was −20…25): with 15 joints still, the toe's 10.7u travel was the only motion
     in the frame and read mainly through the plate; 60° is a real ankle's range and moves the toe
     ~14u (audit, 2026-09-03). */
  const PHI_STRETCH = (-25 * Math.PI) / 180; // the plate reached back toward the body
  const PHI_PRESS = (35 * Math.PI) / 180; // pressed through the ball of the foot
  const footAt = (phi: number) => {
    const u: Vec2 = { x: perp.x * Math.cos(phi) + along.x * Math.sin(phi), y: perp.y * Math.cos(phi) + along.y * Math.sin(phi) };
    return {
      toe: { x: ANKLE.x + u.x * 14, y: ANKLE.y + u.y * 14 },
      heel: { x: ANKLE.x - u.x * 9, y: ANKLE.y - u.y * 9 },
    };
  };
  const TOE_STRETCH = footAt(PHI_STRETCH).toe;
  const TOE_PRESS = footAt(PHI_PRESS).toe;

  const poseAt = (rom: number): Pose => {
    const { toe, heel } = footAt(lerp(PHI_STRETCH, PHI_PRESS, STICK(rom)));
    /* The hand is the authored end — it grips the sled's side handle — and the elbow is SOLVED
       between. Authoring both independently made the forearm whatever the gap happened to be:
       34.8 units against a canonical 23. */
    const hand = withinReach(SHOULDER, { x: HIP.x + 2, y: HIP.y - 12 }, (ATHLETE.upperArm + ATHLETE.foreArm) * 0.97);
    const elbow = twoBoneIKToward(SHOULDER, hand, ATHLETE.upperArm, ATHLETE.foreArm, { x: SHOULDER.x + 10, y: SHOULDER.y + 16 });
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee: KNEE,
        ankle: ANKLE,
        heel,
        toe,
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ANKLE, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const toe = poseAt(rom).j.toe;
    /* The plate rides the BALL of the foot — square across the rail, exactly as the press draws it.
       Narrower than the press's slab (14/−12, was 22/−20) so its edge visibly travels against the
       fixed mast rather than reading as one wide block that barely shifts (audit, 2026-09-03). */
    const plate: Primitive[] = padStroke(
      { x: toe.x + perp.x * 14 + along.x * 5, y: toe.y + perp.y * 14 + along.y * 5 },
      { x: toe.x - perp.x * 12 + along.x * 5, y: toe.y - perp.y * 12 + along.y * 5 },
      9,
    );
    const railA: Vec2 = { x: HIP.x + along.x * (D_ANKLE - 30), y: HIP.y + along.y * (D_ANKLE - 30) };
    const railB: Vec2 = { x: HIP.x + along.x * (D_ANKLE + 34), y: HIP.y + along.y * (D_ANKLE + 34) };
    /* The sled carries its plates here exactly as it does on the press — the same station drawn
       without a load was a shelf on a post (audit, 2026-09-03). */
    const horn: Vec2 = { x: toe.x + along.x * 15 + perp.x * 7, y: toe.y + along.y * 15 + perp.y * 7 };
    const back: Primitive[] = [
      { kind: 'line', a: railA, b: railB, w: 3, color: 'ink3' },
      { kind: 'line', a: railB, b: { x: railB.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      ...plateGhost(horn),
      ...linePathTicks(TOE_STRETCH, TOE_PRESS),
      { kind: 'line', a: { x: HIP.x - 30, y: FLOOR_Y - 2 }, b: { x: railB.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
      { kind: 'line', a: { x: HIP.x + 5, y: HIP.y + 9 }, b: { x: HIP.x + 5, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      ...padStroke({ x: SHOULDER.x - 7, y: SHOULDER.y + 2 }, { x: HIP.x - 7, y: HIP.y + 2 }, 8),
      ...padStroke({ x: HIP.x - 6, y: HIP.y + 9 }, { x: HIP.x + 16, y: HIP.y + 9 }, 7),
    ];
    return { back, front: plate };
  };

  const softKnee = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'knee',
    neighbors: ['hip', 'ankle'] as [string, string],
    min: 150,
    max: 168,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      softKnee('legs long, knees soft — this is a calf exercise'),
      { kind: 'contactX', a: 'toe', x: TOE_STRETCH.x, tol: 1.5, label: 'the deep stretch — plate reached back' },
    ],
    end: [
      softKnee('and the knees never press'),
      { kind: 'contactX', a: 'toe', x: TOE_PRESS.x, tol: 1.5, label: 'press through the ball of the foot' },
    ],
    path: { track: 'toe', kind: 'line', tol: 1.5, dir: along },
    invariants: [
      { kind: 'pointFixed', point: 'ankle', tol: 1, label: 'the ankle is the pivot — the leg never presses' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'your back stays on the pad' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the trunk does not move' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 170, label: 'never locked out' },
    ],
  };

  return { id: 'leg_press_calf_raise', chains: pressChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 160, 30) };
})();
