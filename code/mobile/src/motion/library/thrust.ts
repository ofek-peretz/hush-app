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
 *   3. **A neck that whips.** The head continues the torso line off the fixed shoulder; it rides
 *      the same pivot and nothing else, so the chin stays quietly tucked by construction.
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

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK, withinReach } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, leverBar, padStroke, plateGhost, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;

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
   * The foot plant's x (default 208 — the shin near-vertical at the table). The frog pump pulls it
   * in under the hips: soles together close to the glutes is a shorter base and a sharply folded
   * knee, which IS the member's visible difference; the knees-wide fact is frontal-plane and rides
   * the cues, the sumo rule.
   */
  ankleX?: number;
  /** The Smith member: the bar the hips drive rides RAILS, drawn as the machine's two uprights. */
  smithRails?: boolean;
}

function thrust(p: ThrustParams): Rig {
  /** The two anchors. The foot is planted so the shin is near-vertical at the top. */
  const SHOULDER: Vec2 = { x: 128, y: p.shoulderY };
  const ANKLE: Vec2 = { x: p.ankleX ?? 208, y: FLOOR_Y - ATHLETE.ankleH };
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
    const y = lerp(HIP_LOW_Y, HIP_TOP_Y, rom);
    const dy = y - SHOULDER.y;
    return { x: SHOULDER.x + Math.sqrt(Math.max(1, ATHLETE.torso * ATHLETE.torso - dy * dy)), y };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => hipAt(i / 16));

  const poseAt = (rom: number): Pose => {
    const hip = hipAt(rom);
    const knee = twoBoneIK(ANKLE, hip, S, T, 1);
    /* The head continues the shoulder→hip line beyond the shoulder — the neck stays neutral. */
    const dx = SHOULDER.x - hip.x;
    const dy = SHOULDER.y - hip.y;
    const len = Math.hypot(dx, dy) || 1;
    const head: Vec2 = { x: SHOULDER.x + (dx / len) * ATHLETE.neck, y: SHOULDER.y + (dy / len) * ATHLETE.neck };
    /*
     * Arms brace along the bench/floor line, hands down on the load at the hips. The hand is the
     * authored end and the ELBOW is solved between — the other way round (elbow pinned beside the
     * shoulder, hand chasing the hip) made the forearm as long as the gap happened to be, 39.7
     * against a canonical 23 on the bridge, where the hips travel furthest.
     */
    const hand = withinReach(SHOULDER, { x: hip.x - 8, y: hip.y - 4 }, (ATHLETE.upperArm + ATHLETE.foreArm) * 0.97);
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
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder: SHOULDER,
        hip,
        knee,
        ankle: ANKLE,
        heel: { x: ANKLE.x - 6, y: FLOOR_Y },
        toe: { x: ANKLE.x + 14, y: FLOOR_Y },
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: p.singleLeg ? freeKnee : far(knee, -6, 1),
        farAnkle: p.singleLeg ? freeAnkle : far(ANKLE, -6, 1),
        farHeel: p.singleLeg ? { x: freeAnkle.x - 2, y: freeAnkle.y + 5 } : far({ x: ANKLE.x - 6, y: FLOOR_Y }, -6, 0),
        farToe: p.singleLeg ? { x: freeAnkle.x + 9, y: freeAnkle.y - 2 } : far({ x: ANKLE.x + 14, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const hip = pose.j.hip;
    const back: Primitive[] = [...sampledPathTicks(ARC)];
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
      if (p.smithRails) {
        /* The machine's uprights either side of her, full height, and the faint crossbar at the
           bar's own height — the rail states the vertical (the smith squat's own statement). */
        back.push(
          { kind: 'line', a: { x: HIP_X - 50, y: 30 }, b: { x: HIP_X - 50, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
          { kind: 'line', a: { x: HIP_X + 50, y: 30 }, b: { x: HIP_X + 50, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
          { kind: 'line', a: { x: HIP_X - 50, y: hip.y - 2 }, b: { x: HIP_X + 50, y: hip.y - 2 }, w: 2.5, color: 'ink3', opacity: 0.5 },
        );
      }
      /* Side-on, the bar across her hips IS its plate, riding the hip's own travel. */
      front = plateGhost(hip);
    } else if (p.implement === 'machine') {
      /* The lap pad pressed across the hips, and the lever arm from its floor pivot. */
      const pivot: Vec2 = { x: 258, y: FLOOR_Y - 6 };
      back.push(...leverBar(pivot, { x: hip.x + 6, y: hip.y - 9 }));
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
export const gluteBridgeRig = thrust({ id: 'glute_bridge', shoulderY: FLOOR_SHOULDER_Y, hipTopY: FLOOR_SHOULDER_Y - 16, implement: 'bar' });

/* ── batch 2 (2026-08-26), the choice-only glute members ─────────────────────────────────────────
 * smith_hip_thrust — the bench thrust with the bar on rails: the hip's travel at HIP_X is already
 * vertical, which is the one path a Smith bar can take, so the base geometry IS the Smith geometry
 * and only the rails needed drawing. frog_pump — the floor bridge with the feet pulled in under
 * the hips (soles together): a shorter base, a sharply folded knee, and the same finish line. */
export const smithHipThrustRig = thrust({ id: 'smith_hip_thrust', shoulderY: BENCH_SHOULDER_Y, hipTopY: BENCH_SHOULDER_Y, startsBelowShoulder: true, implement: 'bar', bench: true, smithRails: true });
export const frogPumpRig = thrust({ id: 'frog_pump', shoulderY: FLOOR_SHOULDER_Y, hipTopY: FLOOR_SHOULDER_Y - 16, implement: 'bodyweight', ankleX: 190 });
