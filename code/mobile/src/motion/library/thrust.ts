/**
 * thrust + bridge — hip extension off a fixed upper back: the hip thrust family and the floor
 * bridge that is its bodyweight ancestor. One file because they are one skeleton at two heights —
 * shoulders on a bench (thrust) or on the floor (bridge) — and the catalogue prescribes the bridge
 * to the same athlete earlier in the same progression.
 *
 * ── THE GEOMETRY, SOLVED AND NOT POSED ──────────────────────────────────────────────────────────
 * Three anchors never move: the SHOULDER (on the bench edge or the floor), the FOOT (planted), and
 * therefore the two bone lengths between them. The one degree of freedom is the hip's height, and
 * the whole rep is that single number: the hip is the tracked point, driven straight up, with the
 * KNEE solved by two-bone IK between the fixed ankle and the travelling hip, and the torso pivoting
 * about the fixed shoulder. "Squeeze at the top until the body is a table" is not a cue we draw
 * NEAR — it falls out of the endpoint: at rom 1 the shoulder→hip line is horizontal by predicate.
 *
 * ── WHAT THE INVARIANTS FORBID ──────────────────────────────────────────────────────────────────
 *   1. **Overextension.** Arching past the table line is the fault every coach corrects on this
 *      lift — the low back finishing what the glutes should. The torso segment may never rotate
 *      past horizontal: `jointBelow` keeps the hip from rising above the shoulder line.
 *   2. **Feet that creep.** `pointFixed` on ankle AND toe — the drive is through planted heels.
 *   3. **A neck that whips.** On the bench the head continues the torso line off the fixed
 *      shoulder; it rides the same pivot and nothing else, so the chin stays quietly tucked by
 *      construction. On the floor the head rests where it lay (see `REST_HEAD`).
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `hip_thrust`            — shoulders on the bench, the bar across the hips (plate ghost).
 *   · `machine_hip_thrust`    — same skeleton; the resistance is a lap pad + lever from a floor
 *                               pivot, the machine's own grammar.
 *   · `single_leg_hip_thrust` — one foot planted, the other leg extended in line with the thigh;
 *                               the free leg rides the hip, which is what makes it harder.
 *   · `glute_bridge`          — the floor member (pattern: bridge): same movement, shoulders down.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, lerpV, twoBoneIK, twoBoneIK3, withinReach } from '../geometry';
import { sticksAt } from '../curves';

/** The sticking point (iron rule 12, 2026-09-07): the driver slows to a dwell where leverage is
 *  worst and runs on. Endpoints untouched. */
const STICK = sticksAt(0.85, 0.06); // the last inch of the squeeze, the moment arm longest
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE, PLATE_R } from '../anthro';
import { floorScene, leverBar, padStroke, plateGhost, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';
import { project, type Camera } from '../camera';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;

/*
 * The bar rides the TOP of the pelvis, not the hip joint: end-on, its centre sits this far above
 * the joint. Centred on the joint, the plate's rim (r 20) was 9u under the floor at the bottom of
 * every rep (hip 182 + 20 = 202 against FLOOR_Y 193); on the pelvis it RESTS on the floor there —
 * which is what sets the bottom of a hip thrust in the first place. (audit, 2026-09-03)
 */
const BAR_ABOVE_HIP = 9;
/*
 * The bench members' chin tuck: the head flexed this far off the trunk line, toward the knees.
 * Continuing the trunk line put the face flat to the ceiling at lockout and the crown pointing at
 * the wall behind at the bottom; the protocol on every thrust is "chin tucked, eyes on the knees",
 * which keeps the neck out of the extension the low back is already tempted into. Measured at the
 * top: head.y 150 → 143.2, 6.8u above the shoulder line. (audit, 2026-09-03)
 */
const CHIN_TUCK_DEG = 25;

/* ── The frog pump's legs, built in depth ─────────────────────────────────────────────────────── */
/** Each hip joint sits this far off the midline (a 14u pelvis, hip joint to hip joint). */
const HALF_PELVIS = 7;
/** Soles together: each foot a sole's thickness off the midline. */
const SOLE_Z = 2;
/**
 * The frog's knee falls OUT far more than up: 19° above the floor plane, toward its own side.
 * Measured at the bottom: knee 20u off the floor and 37u off the midline (an 84 cm knee-to-knee),
 * against the bridge's knee 43u up in the sagittal plane. (audit, 2026-09-03)
 */
const FROG_KNEE_OUT: Vec3 = { x: 0, y: -0.35, z: 1 };
/**
 * The camera turns a little toward her head so the two splayed knees PART on the page — the near
 * one carried ahead, the far one left as a low grey stub beside the hip. A pure side view stacks
 * the mirrored legs into one foreshortened wedge; a front view from the feet loses the 15u lift
 * entirely. (audit, 2026-09-03)
 */
const FROG_AZIMUTH = 25;

interface ThrustParams {
  id: string;
  /** Where the shoulders rest: the bench edge (thrust) or the floor (bridge). */
  shoulderY: number;
  /**
   * Where the hips finish. On the BENCH members this is the shoulder's own height — the flat
   * table. On the FLOOR member it is ABOVE the shoulder: with the shoulders on the ground the
   * finished bridge is the knee→shoulder diagonal, and the hips are its high point. One movement,
   * two finishing lines, and the difference is exactly the height of the bench.
   */
  hipTopY: number;
  /** The bench members start sunk BELOW the shoulder line; the floor member starts level with it. */
  startsBelowShoulder?: boolean;
  implement: 'bar' | 'machine' | 'bodyweight';
  singleLeg?: boolean;
  /** Draw the bench end-on behind her (the thrust members). */
  bench?: boolean;
  /**
   * The foot plant's x. Default 216: the shin VERTICAL at the bench members' table — the one
   * alignment cue a hip thrust has. At 208 the knee locked out 8u ahead of the ankle (knee→ankle
   * 102°, knee 77°): a clip teaching knees drifting over the toes. The floor bridge, whose table is
   * higher than its shoulders, is vertical at 208 and keeps it. (audit, 2026-09-03)
   */
  ankleX?: number;
  /** The Smith member: the bar the hips drive rides RAILS, drawn as the machine's two uprights. */
  smithRails?: boolean;
  /**
   * The frog pump: soles together at the midline and the knees dropped out to their own sides.
   * The legs are solved in 3D and the camera turns `FROG_AZIMUTH` so the splay reads. It used to
   * be mimed as a short base in the sagittal plane — a knee folded to 21°, past any human knee,
   * and both legs fused into one wedge under the 55° merge threshold. (audit, 2026-09-03)
   */
  splayed?: boolean;
}

function thrust(p: ThrustParams): Rig {
  /** The two anchors. The foot is planted so the shin is near-vertical at the top. */
  const SHOULDER: Vec2 = { x: 128, y: p.shoulderY };
  const ANKLE: Vec2 = { x: p.ankleX ?? 216, y: FLOOR_Y - ATHLETE.ankleH };
  /** Hip travel: sunk toward the floor at rom 0, up to the shoulder's own height at rom 1 —
   *  the "table": shoulder→hip horizontal, thigh meeting it at the knee. */
  const HIP_X = 176;
  /*
   * The bottom of the range. It was FLOOR_Y − 18, and with the bench members' table at 159 that
   * left the hip travelling 16 units total — about 18cm, against the 30-40cm a hip thrust actually
   * covers. A hip thrust starts with the glutes ON THE FLOOR: the hip JOINT sits about a hand above
   * it (the flesh is below the joint), which is 11 units, not 18. Deepening it is most of the
   * missing range; the rest came from lowering the table so the lockout is a real straight line.
   */
  const HIP_LOW_Y = FLOOR_Y - 11;
  const HIP_TOP_Y = p.hipTopY;
  /*
   * THE TORSO IS RIGID, so the hip swings on an ARC about the shoulders it is hinged on — the
   * invariant three lines down already calls the shoulder "the hinge, and it stays". The hip used
   * to be authored at a FIXED x with only its height sweeping, which makes shoulder→hip a
   * hypotenuse: exactly 48 at the top, where the table position puts them level, and 50.6 at the
   * bottom. A trunk that grows two and a half units on the way down and shrinks on the way back up.
   *
   * Solving x from the circle keeps the trunk at `ATHLETE.torso` at every rom and preserves the
   * authored hip HEIGHT, which is what both `contactY` predicates and the range ticks read.
   */
  const hipAt = (rom: number): Vec2 => {
    const y = lerp(HIP_LOW_Y, HIP_TOP_Y, STICK(rom));
    const dy = y - SHOULDER.y;
    return { x: SHOULDER.x + Math.sqrt(Math.max(1, ATHLETE.torso * ATHLETE.torso - dy * dy)), y };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => hipAt(i / 16));

  /*
   * ON THE FLOOR (the bridge members) the head RESTS. Continuing the torso line off the shoulder
   * is right on a bench, where the neck hangs free; on the floor it swung the head under the
   * ground — its underside 3.3u below FLOOR_Y at the top of the bridge. A resting head lies where
   * it lay, and the chin tucks as the trunk rises past it: the card's own cue, drawn as a neck
   * that bends instead of a head that swings. (audit, 2026-09-03)
   */
  const onFloor = !p.bench;
  const REST_HEAD: Vec2 = { x: SHOULDER.x - ATHLETE.neck, y: FLOOR_Y - ATHLETE.headR - 1 };
  /** Where the bar sits: across the top of the pelvis — and on the Smith, on its rail's own x. */
  const barAt = (hip: Vec2): Vec2 => ({ x: p.smithRails ? HIP_X : hip.x, y: hip.y - BAR_ABOVE_HIP });
  /** The splayed member's camera — a pure spin about the vertical, declared so a supine trunk cannot become the axis. */
  const CAM: Camera | undefined = p.splayed ? { azimuth: FROG_AZIMUTH, pivotX: HIP_X, axis: { x: 0, y: -1 } } : undefined;

  const poseAt = (rom: number): Pose => {
    const hip = hipAt(rom);
    let knee: Vec2;
    let z: Record<string, number> | undefined;
    if (p.splayed) {
      /*
       * THE FROG'S KNEES, in depth. Soles together at the midline, each knee dropped out to its
       * own side: the leg is solved in 3D on canonical bones between a hip half a pelvis off the
       * midline and a foot at it, so the page shows a thigh honestly foreshortened by its splay —
       * the knee low and close to the hip — and the far leg is the near one's true mirror in z,
       * not a `+6` mime. The knee is 45° at the bottom (it was 21°). (audit, 2026-09-03)
       */
      const knee3 = twoBoneIK3({ x: ANKLE.x, y: ANKLE.y, z: SOLE_Z }, { x: hip.x, y: hip.y, z: HALF_PELVIS }, S, T, FROG_KNEE_OUT);
      knee = { x: knee3.x, y: knee3.y };
      z = {
        hip: HALF_PELVIS, knee: knee3.z, ankle: SOLE_Z, heel: SOLE_Z, toe: SOLE_Z,
        farHip: -HALF_PELVIS, farKnee: -knee3.z, farAnkle: -SOLE_Z, farHeel: -SOLE_Z, farToe: -SOLE_Z,
      };
    } else {
      knee = twoBoneIK(ANKLE, hip, S, T, 1);
    }
    /* On the bench the head continues the shoulder→hip line beyond the shoulder, flexed `CHIN_TUCK_DEG` toward the knees. */
    const dx = SHOULDER.x - hip.x;
    const dy = SHOULDER.y - hip.y;
    const len = Math.hypot(dx, dy) || 1;
    const tuck = (CHIN_TUCK_DEG * Math.PI) / 180;
    const ux = (dx / len) * Math.cos(tuck) - (dy / len) * Math.sin(tuck);
    const uy = (dx / len) * Math.sin(tuck) + (dy / len) * Math.cos(tuck);
    const head: Vec2 = onFloor ? REST_HEAD : { x: SHOULDER.x + ux * ATHLETE.neck, y: SHOULDER.y + uy * ATHLETE.neck };
    /*
     * Arms brace along the bench/floor line. The hand is the authored end and the ELBOW is solved
     * between — the other way round (elbow pinned beside the shoulder, hand chasing the hip) made
     * the forearm as long as the gap happened to be, 39.7 against a canonical 23 on the bridge.
     *
     * The bar members' hands hold the BAR — the fist concentric with the plate, as in every other
     * side-view barbell rig. On the floor bridge that also straightens the arm (the bar is past
     * reach from a shoulder on the ground) and lifts the elbow out of the floor it sank 10u into.
     * The bodyweight bridge's arms lie flat beside her on the floor, straight, palms down — its
     * elbow, too, was a half-arm under the ground. (audit, 2026-09-03)
     */
    const flatArm = onFloor && p.implement === 'bodyweight';
    const reach = flatArm ? ATHLETE.upperArm + ATHLETE.foreArm - 0.05 : (ATHLETE.upperArm + ATHLETE.foreArm) * 0.97;
    const handWant: Vec2 = p.implement === 'bar' ? barAt(hip) : flatArm ? { x: SHOULDER.x + reach + 10, y: FLOOR_Y - 4 } : { x: hip.x - 8, y: hip.y - 4 };
    const hand = withinReach(SHOULDER, handWant, reach);
    const elbow = twoBoneIK(SHOULDER, hand, ATHLETE.upperArm, ATHLETE.foreArm, 1);
    /* The free leg (single-leg member): extended in line with the working thigh, riding the hip. */
    /* A TRUE thigh from the hip. `T * 0.9` plus a 6-unit lift made the hypotenuse 42.6 against 40 —
       and the far side reads it off the OFFSET hip, which stretched it further. */
    /* Built off the FAR hip, which is the joint it is actually attached to. Measured from `hip`
       and then drawn from `farHip`, the free thigh carried the whole depth offset as extra length. */
    const freeHip = far(hip, -6, 1);
    const freeKnee: Vec2 = (() => {
      const want = { x: freeHip.x + T * 0.9, y: freeHip.y - 6 };
      const d = Math.hypot(want.x - freeHip.x, want.y - freeHip.y) || 1;
      return { x: freeHip.x + ((want.x - freeHip.x) / d) * T, y: freeHip.y + ((want.y - freeHip.y) / d) * T };
    })();
    const freeAnkle: Vec2 = (() => {
      const want = { x: freeKnee.x + S * 0.92, y: freeKnee.y - 10 };
      const d = Math.hypot(want.x - freeKnee.x, want.y - freeKnee.y) || 1;
      return { x: freeKnee.x + ((want.x - freeKnee.x) / d) * S, y: freeKnee.y + ((want.y - freeKnee.y) / d) * S };
    })();
    const heel: Vec2 = { x: ANKLE.x - 6, y: FLOOR_Y };
    const toe: Vec2 = { x: ANKLE.x + 14, y: FLOOR_Y };
    /* The far leg: mimed a half-pelvis back on the flat members; the splayed member's is a true mirror in z. */
    const across = (q: Vec2, dy: number): Vec2 => (p.splayed ? q : far(q, -6, dy));
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder: SHOULDER,
        hip,
        knee,
        ankle: ANKLE,
        heel,
        toe,
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: across(hip, 1),
        farKnee: p.singleLeg ? freeKnee : across(knee, 1),
        farAnkle: p.singleLeg ? freeAnkle : across(ANKLE, 1),
        farHeel: p.singleLeg ? { x: freeAnkle.x - 2, y: freeAnkle.y + 5 } : across(heel, 0),
        farToe: p.singleLeg ? { x: freeAnkle.x + 9, y: freeAnkle.y - 2 } : across(toe, 0),
      },
      ...(z ? { z } : {}),
    };
  };

  /** A flat point through the member's camera (identity without one) — the equipment is scene knowledge. */
  const P = (q: Vec2): Vec2 => {
    if (!CAM) return q;
    const r = project(q, 0, CAM);
    return { x: r.x, y: r.y };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const hip = pose.j.hip;
    /*
     * The range statement rides the hip's arc — except on the floor bar member, where the plate
     * (r 20) covers the whole 15u of travel and the ticks were legible only through the ring at
     * the top. There it rides the plate's TOP RIM instead, 3u clear of it in the empty air above:
     * the load rises between two marks. On the bench the travel is 32u and the ticks read below
     * the ring. (audit, 2026-09-03)
     */
    const ticksPath = p.implement === 'bar' && onFloor ? ARC.map((q) => ({ x: q.x, y: q.y - BAR_ABOVE_HIP - PLATE_R - 3 })) : ARC;
    const back: Primitive[] = [...sampledPathTicks(ticksPath.map(P))];
    if (p.bench) {
      /* The bench END-ON behind her shoulders: the pad's cross-section and its two legs. */
      back.push(
        { kind: 'rect', x: SHOULDER.x - 20, y: p.shoulderY - 2, width: 26, height: 8, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: SHOULDER.x - 15, y: p.shoulderY + 6 }, b: { x: SHOULDER.x - 15, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: SHOULDER.x - 1, y: p.shoulderY + 6 }, b: { x: SHOULDER.x - 1, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      );
    }
    let front: Primitive[] = [];
    if (p.implement === 'bar') {
      const bar = barAt(hip);
      if (p.smithRails) {
        /*
         * The machine's uprights either side of her, full height, and the faint crossbar at the
         * bar's own height — the rail states the vertical (the smith squat's own statement). The
         * bar is pinned to the rail's x (`barAt`): a Smith bar can only travel the vertical, and the
         * hip — on its arc about the shoulders, 12.2u of x across the rep — slides under it, which
         * is exactly what a hip does under a Smith bar. It used to ride the hip's arc between two
         * rails that promised a straight line. (audit, 2026-09-03)
         */
        /*
         * ONE RAIL, END-ON (execution pass, 2026-09-07). A Smith's uprights stand at the ENDS of
         * the bar, and side-on the bar is end-on: both rails project onto the bar's own x, and
         * all that separates them is depth — the smith_row's own staging. Two uprights 50u either
         * side of her were a gate, not a Smith, and the near one crossed the figure. The rail runs
         * behind her at HIP_X with the hook ladder that names a Smith from any angle; the disc
         * rides it.
         */
        back.push(
          { kind: 'line', a: { x: HIP_X, y: 30 }, b: { x: HIP_X, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
          ...[0, 1, 2, 3].map((i) => ({ kind: 'line' as const, a: { x: HIP_X + 3, y: 60 + i * 14 }, b: { x: HIP_X + 10, y: 60 + i * 14 }, w: 2, color: 'ink3' as const })),
        );
      }
      /* Side-on, the bar across her hips IS its plate — on top of the pelvis, riding the hip's travel. */
      front = plateGhost(bar);
    } else if (p.implement === 'machine') {
      /* The lap pad pressed across the hips, and the lever arm from its floor pivot. */
      /* The pivot on a short post, 20u up (2026-09-07): with the pivot at the floor the lever ran
         horizontal at the bottom and no plate at the catalogue's scale (r16 = 45 cm) could sit on
         it without sinking through the floor; a real thrust machine's horn is up on the frame. */
      const pivot: Vec2 = { x: 258, y: FLOOR_Y - 20 };
      const handle: Vec2 = { x: hip.x + 6, y: hip.y - 9 };
      /* The load on the lever: a FULL plate on the horn three-tenths of the way out from the pivot
         — the machine was a bare line, and a lever with nothing on it lifts nothing (audit,
         2026-09-03); r10 was a toy against the 45 cm disc every other clip carries (2026-09-07). */
      back.push(
        { kind: 'line', a: pivot, b: { x: pivot.x, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: pivot.x - 8, y: FLOOR_Y - 2 }, b: { x: pivot.x + 8, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        ...leverBar(pivot, handle),
        ...plateGhost(lerpV(pivot, handle, 0.3), PLATE_R),
      );
      front = padStroke({ x: hip.x - 6, y: hip.y - 9 }, { x: hip.x + 16, y: hip.y - 9 }, 8);
    }
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    /* startAt 'bottom': the lift honestly rests with the hips down; the working action is the drive up. */
    start: [
      { kind: 'contactY', a: 'hip', y: HIP_LOW_Y, tol: 2, label: 'hips sunk toward the floor' },
      ...(p.startsBelowShoulder
        ? [{ kind: 'jointBelow' as const, a: 'hip', b: 'shoulder', by: 8, label: 'below the shoulder line at the start' }]
        : []),
    ],
    end: [
      /* The finish line: the bench members' flat table, or the floor bridge's high diagonal. */
      { kind: 'contactY', a: 'hip', y: HIP_TOP_Y, tol: 2, label: 'drive all the way up — one line from knees to shoulders' },
    ],
    /* An arc about the shoulders, which the invariant below pins. `vertical` described the old
       fixed-x hip, and that hip was only able to hold a straight line by stretching the trunk. */
    path: { track: 'hip', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the shoulders are the hinge, and they stay' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'the drive is through the heels — toes never lift' },
    ],
  };

  return {
    id: p.id,
    chains: {
      torso: ['hip', 'shoulder'],
      neck: ['shoulder', 'head'],
      head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'],
      farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'],
      nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'],
      farFoot: ['farHeel', 'farToe'],
    },
    ...(CAM ? { camera: CAM } : {}),
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 170, 40),
  };
}

/** Bench height for the thrust members: the shoulder rests at standard bench-pad height. */
/*
 * The bench's shoulder line. 34 above the floor is a 39cm bench, and with the table at that height
 * the lockout came out with the KNEE 10 units ABOVE the hip — a thrust that never finishes level.
 * 43 (a 49cm bench, which is what a hip-thrust bench is) puts shoulder, hip and knee on one line at
 * the top and, with the deeper bottom, takes the hip's travel from 16 units to 32 — the 37cm a hip
 * thrust actually covers.
 */
const BENCH_SHOULDER_Y = FLOOR_Y - 43;
/** Floor height for the bridge: the shoulder rests on the ground (its own radius above it). */
const FLOOR_SHOULDER_Y = FLOOR_Y - 10;

export const hipThrustRig = thrust({ id: 'hip_thrust', shoulderY: BENCH_SHOULDER_Y, hipTopY: BENCH_SHOULDER_Y, startsBelowShoulder: true, implement: 'bar', bench: true });
export const machineHipThrustRig = thrust({ id: 'machine_hip_thrust', shoulderY: BENCH_SHOULDER_Y, hipTopY: BENCH_SHOULDER_Y, startsBelowShoulder: true, implement: 'machine', bench: true });
export const singleLegHipThrustRig = thrust({ id: 'single_leg_hip_thrust', shoulderY: BENCH_SHOULDER_Y, hipTopY: BENCH_SHOULDER_Y, startsBelowShoulder: true, implement: 'bodyweight', bench: true, singleLeg: true });
/*
 * glute_bridge carries a BAR, and it was drawn without one. Its card is `equipment: 'barbell'` with
 * a 30 kg working weight, so the app will prescribe a load for it — and the clip showed a bodyweight
 * bridge, which is a different exercise and tells a viewer to lift nothing. `frog_pump` beside it is
 * genuinely bodyweight and its card says so; this one is not.
 */
export const gluteBridgeRig = thrust({ id: 'glute_bridge', shoulderY: FLOOR_SHOULDER_Y, hipTopY: FLOOR_SHOULDER_Y - 16, implement: 'bar', ankleX: 208 });

/* ── batch 2 (2026-08-26), the choice-only glute members ─────────────────────────────────────────
 * smith_hip_thrust — the bench thrust with the bar on rails. The hip itself is NOT on a vertical
 * (it arcs about the shoulders, 12.2u of x across the rep — measured, audit 2026-09-03); the bar
 * is, pinned to HIP_X in `barAt`, and the hip slides under it. frog_pump — the floor bridge with
 * soles together and the knees dropped out to the sides, built in depth (`splayed`); the feet sit
 * at 212 — 4u nearer the hips than the bridge's — so the knee bottoms at 56°, just over the 55°
 * at which two fleshed limbs merge; the same finish line. */
export const smithHipThrustRig = thrust({ id: 'smith_hip_thrust', shoulderY: BENCH_SHOULDER_Y, hipTopY: BENCH_SHOULDER_Y, startsBelowShoulder: true, implement: 'bar', bench: true, smithRails: true });
export const frogPumpRig = thrust({ id: 'frog_pump', shoulderY: FLOOR_SHOULDER_Y, hipTopY: FLOOR_SHOULDER_Y - 16, implement: 'bodyweight', ankleX: 212, splayed: true });
