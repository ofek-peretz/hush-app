/**
 * pulldown, completed — the pull-up family: the lat pulldown INVERTED. Same side camera as the
 * pulldown benchmark, same vertical-pull canon (§4.1), and deliberately the same visual hall: on
 * the machine the bar travels and the body is anchored; on the bar the GRIP is anchored and the
 * BODY travels. Drawing the two as mirror statements of one movement is what lets an athlete who
 * has only ever used the machine recognise the bar day her programme graduates her to.
 *
 * ── THE AUTHORING INVERSION ─────────────────────────────────────────────────────────────────────
 * The hands are FIXED on the bar. The body rises as one unit — hip, knee, ankle, head all translate
 * by the same `rise`, exactly the calf raise's rigid-body move — and the ELBOWS are solved by
 * two-bone IK between the fixed hands and the travelling shoulders. Nothing is posed: chin-over-bar
 * falls out of how far the shoulders climb, and the dead-hang stretch out of how far they sink.
 *
 * ── WHAT THE INVARIANTS FORBID ──────────────────────────────────────────────────────────────────
 *   1. **Kipping.** The swing that turns a pull-up into momentum. The body may only TRANSLATE: the
 *      hip→shoulder segment's angle is frozen, and the hip's X is pinned — it travels in Y alone.
 *   2. **Half reps at the top.** `contactY` on the head at rom 1: the chin line clears the bar.
 *   3. **Half reps at the bottom.** `jointAngle` at rom 0 holds a real dead hang (elbows ~168°),
 *      because "all the way down" is the half of the range people skip on this lift too.
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `pull_up`   — overhand, hands a shade outside the shoulders.
 *   · `chin_up`   — underhand, hands at shoulder width; drawn with the narrower grip, and the same
 *                   skeleton (supination is a wrist fact the silhouette cannot carry at this size).
 *   · `assisted_pull_up` — the counterweight machine: a knee platform carries part of her, drawn as
 *                   the pad under the shins and the stack that rises AS SHE DOES (the assistance is
 *                   the resistance's mirror). Same body, same path, same endpoints — which is the
 *                   entire pedagogy: the assisted version IS the movement, not a different one.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { sticksAt } from '../curves';

/** The sticking point (iron rule 12, 2026-09-07): the driver slows to a dwell where leverage is
 *  worst and runs on. Endpoints untouched. */
const STICK = sticksAt(0.6, 0.07); // the elbows at ~90°, where a pull-up stalls
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, floorScene, padStroke } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/**
 * The fixed bar. 47, and the number is squeezed between two laws that pull opposite ways.
 *
 * `chin_up` finishes CHEST to the bar — higher than a pull-up's chin-over — so raising that finish
 * pushed its crown out of the frame's top edge, and lowering the bar to make room pushed its toe
 * through the FLOOR at the hang, because a narrower grip hangs lower. Both were caught by their
 * own laws within a minute of each other. 47, a 3-unit chest-to-bar bonus, and a slightly tighter
 * leg fold leave 1.5u of headroom and 2u of air under the toe.
 */
const BAR: Vec2 = { x: 168, y: 50 }; // 47 put the chin-up's crown 1.6u past the top edge; the legs fold tighter to keep the toe's air (audit, 2026-09-03)

/**
 * The shoulder's travel, DERIVED so the endpoint angles hold by construction — the same discipline
 * as the overhead press's lockout. The shoulder hangs 6u behind the grip line and `gripDX` to the
 * side, so the straight-line distance grip→shoulder is the hypotenuse over that offset: solving the
 * triangle for a target elbow angle gives the drop, instead of a tuned fraction that the validator
 * (correctly) failed at 179.8° on the first run.
 */
const HANG_ELBOW = 168; // the dead hang: honestly long, safely shy of the 179° ceiling
/** Grip→shoulder reach when the elbow holds `deg`, by the law of cosines. */
const reachAt = (deg: number) => Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((deg * Math.PI) / 180));
/** The hang drop that produces exactly `HANG_ELBOW`, given the grip's horizontal offset. */
const hangDropFor = (gripDX: number) => Math.sqrt(Math.max(1, reachAt(HANG_ELBOW) ** 2 - gripDX * gripDX));
/**
 * ⚠️ THE TOP IS A HEIGHT, NOT AN ANGLE — the first authoring tried to drive both ends by elbow
 * angle and the geometry said no: at a wide grip, "elbow 55°" puts the chin nowhere near the bar
 * (the arm is simply too short for that fold at that width). What defines the top of a pull-up is
 * CHIN OVER BAR, so the top is authored as a shoulder height — 7.5u below the grip, which puts the
 * chin a unit above the bar and the crown a unit inside the frame — and the elbow angle at the top
 * is whatever the two bones give for that height at that grip (≈63° wide, ≈40° narrow; the end
 * window below covers the family). The dead hang stays angle-derived, where an angle IS the fact.
 */
const TOP_DROP = 7.5;

/**
 * HOW HIGH THE TOP IS — and it is not the same height for both members.
 *
 * A pull-up's finish is CHIN OVER BAR. A chin-up's, by its own card, is "pull the CHEST to the
 * bar", which is 5u higher and is the whole difference in what the two lifts ask for. Drawn at one
 * height with one elbow path they were the same clip: measured across the rep, the largest
 * difference between any joint of `pull_up` and any joint of `chin_up` was 9u, almost all of it the
 * hand's grip width — which from this camera is DEPTH and draws as nothing.
 *
 * So the two are separated on the two facts this camera can actually carry: how high the body
 * finishes, and where the elbow goes. A wide overhand pull-up drives the elbows DOWN and slightly
 * back; a supinated chin-up drives them down and FORWARD, in front of the ribs, which is what the
 * underhand grip does to the shoulder. Neither is decoration — they are the two cues.
 */
interface TopStyle {
  /** Shoulder height below the grip line at the finish: smaller is higher. */
  drop: number;
  /*
   * There is deliberately no elbow-side parameter here, and the reason is worth recording: the two
   * 2D branches available to this arm are down-and-FORWARD and up-and-BACK, because the hand is
   * drawn ahead of the shoulder. "Up and back" puts the elbow above the bar, which is not a
   * position any pull-up has, so both members take the same branch. The whole difference between
   * them lives in `drop`, and it is the difference their two cards ask for.
   */
}

interface PullUpParams {
  id: string;
  /** Horizontal distance from the body's centreline to each hand. */
  gripDX: number;
  /** Overhand (elbows down and back) or supinated (down and forward). See `TopStyle`. */
  top: TopStyle;
  assisted?: boolean;
}

function pullUp(p: PullUpParams): Rig {
  /* The body hangs ON the grip line: from the side a pull-up finishes chest-to-bar, and an offset
     that reads nicely at the hang makes the top IMPOSSIBLE (the reach triangle has no solution). */
  const bodyX = BAR.x;
  const HANG_DROP = hangDropFor(p.gripDX);

  const poseAt = (rom: number): Pose => {
    const drop = lerp(HANG_DROP, p.top.drop, STICK(rom));
    const shoulder: Vec2 = { x: bodyX, y: BAR.y + drop };
    /* The whole column translates with the shoulder — the rigid-body move the invariants pin. */
    const hip: Vec2 = { x: bodyX + 2, y: shoulder.y + ATHLETE.torso };
    /* Knees bent back, ankles crossed — the canonical hang; the fold is constant, so it reads as
       carriage rather than as kicking. */
    const knee: Vec2 = p.assisted
      ? { x: hip.x + 2, y: hip.y + ATHLETE.thigh * 0.96 } // KNEELING on the pad — see `decorAt`
      : { x: hip.x - 8, y: hip.y + ATHLETE.thigh * 0.53 }; // tucked a shade tighter — see `BAR`
    const ankle: Vec2 = p.assisted
      ? { x: knee.x - ATHLETE.shank * 0.9, y: knee.y + 4 } // the shin lies back along the pad
      : { x: knee.x - 14, y: knee.y + ATHLETE.shank * 0.45 };
    /* Kneeling, the foot continues back along the pad, toes pointing away; hanging, it dangles. */
    const heel: Vec2 = p.assisted ? { x: ankle.x - 2, y: ankle.y + 4 } : { x: ankle.x - 6, y: ankle.y + 5 };
    const toe: Vec2 = p.assisted ? { x: ankle.x - 13, y: ankle.y + 5 } : { x: ankle.x + 6, y: ankle.y + 9 };
    const head: Vec2 = { x: shoulder.x + 2, y: shoulder.y - ATHLETE.neck };
    const hand: Vec2 = { x: BAR.x + p.gripDX, y: BAR.y };
    const farHand: Vec2 = { x: BAR.x - p.gripDX, y: BAR.y };
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle,
        heel,
        toe,
        hand,
        elbow: twoBoneIK(shoulder, hand, U, F, 1),
        farShoulder: far(shoulder, -6, 1),
        /* bend −1, mirrored from the near arm's +1: the far hand is on the OTHER side of its own
           shoulder, so the same sign puts the elbow on the opposite side of the chord. It did —
           the far elbow was solved ABOVE the bar and above the athlete's own head, one arm hanging
           correctly and the other bent inside out over the top of the frame. */
        farElbow: twoBoneIK(far(shoulder, -6, 1), farHand, U, F, -1),
        farHand,
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    /* The bar and its mounts — fixed, which is the whole point. */
    const back: Primitive[] = [
      { kind: 'line', a: { x: BAR.x - 52, y: BAR.y }, b: { x: BAR.x + 52, y: BAR.y }, w: 3.5, color: 'ink0', cap: 'round' },
      { kind: 'line', a: { x: BAR.x - 46, y: BAR.y }, b: { x: BAR.x - 46, y: 27 }, w: 2.5, color: 'ink3' },
      { kind: 'line', a: { x: BAR.x + 46, y: BAR.y }, b: { x: BAR.x + 46, y: 27 }, w: 2.5, color: 'ink3' },
      // The range statement: the SHOULDER's travel — the body's own path is the tracked path.
      ...barPathTicks(BAR.x - 58, BAR.y + HANG_DROP, BAR.y + TOP_DROP),
    ];
    if (p.assisted) {
      /*
       * SHE KNEELS ON THE PAD (audit, 2026-09-03). The pad used to hang under the ankle of a
       * near-straight leg (knee 162°) — a standing platform, while the card says "set the assist"
       * of the knee machine every gym has, where the shins lie on a pad that rises with her. So
       * the thigh hangs vertical, the shin lies back along the pad, and the pad runs from the knee
       * to the toes; the counterweight stack rises too — assistance is the resistance's mirror, and
       * both must move to read as a machine. The assist arm joins the pad to the tower.
       */
      const kn = pose.j.knee;
      const padY = kn.y + 8;
      back.push(
        ...padStroke({ x: pose.j.toe.x - 6, y: padY }, { x: kn.x + 10, y: padY }, 8),
        { kind: 'line', a: { x: kn.x + 12, y: padY }, b: { x: BAR.x + 46, y: padY }, w: 2.5, color: 'ink3' },
      );
      const risen = (HANG_DROP - lerp(HANG_DROP, TOP_DROP, rom)) * 0.4;
      const tower = stackTower({ x0: BAR.x + 48, x1: BAR.x + 74, capY: 30, stackTopY: FLOOR_Y - 34 }, risen);
      back.push(...tower.prims);
    }
    return { back, front: [] };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    /* startAt 'bottom' territory: the rep OPENS at the dead hang and PULLS first — like the
       deadlift, the equipment honestly rests at the bottom of this lift. */
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 158, max: 176, label: 'a real dead hang — all the way down' },
    ],
    end: [
      /* Measured against the member's OWN finish line: a pull-up's is the chin over the bar, a
         chin-up's is the chest to it, 5u higher. One shared constant asserted the wrong one. */
      { kind: 'contactY', a: 'head', y: BAR.y + p.top.drop - ATHLETE.neck, tol: 2.5, label: p.top.drop < TOP_DROP ? 'chest to the bar' : 'chin over the bar' },
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 34, max: 70, label: 'elbows driven down and back' },
    ],
    path: { track: 'shoulder', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'the grip does not move — the body does' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'no kipping — the body travels, it does not swing' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension at the hang' },
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
    /* No floor under the bar members: at the hang the toe was 6u above a floor line, which at phone
       size reads as standing on tiptoe. The machine member keeps its floor — a stack stands on one
       (audit, 2026-09-03). */
    scene: p.assisted ? floorScene(FLOOR_Y, BAR.x, 0) : [],
  };
}

/** Overhand, wide: the finish is CHIN over the bar. */
const OVERHAND: TopStyle = { drop: TOP_DROP };
/** Supinated, shoulder-width: the finish is CHEST to the bar — higher, and its card says so. At −3
    both elbows closed under 55° at the top (near 37.8°, far 24.9°) and the far arm was a lump;
    −1.5 keeps the chest at the bar inside the finish's tolerance and opens the near elbow (audit,
    2026-09-03). */
const SUPINATED: TopStyle = { drop: TOP_DROP - 1.5 };

export const pullUpRig = pullUp({ id: 'pull_up', gripDX: 24, top: OVERHAND });
/* gripDX 15 → 18: shoulder width IS ±18u (a 40 cm grip at 1.13 cm/u); 15 was narrower than the
   shoulders and folded the top elbow to 38° (audit, 2026-09-03). */
export const chinUpRig = pullUp({ id: 'chin_up', gripDX: 18, top: SUPINATED });
export const assistedPullUpRig = pullUp({ id: 'assisted_pull_up', gripDX: 24, top: OVERHAND, assisted: true });
