/**
 * calf_straight — plantarflexion with the knee straight, the largest single pattern left in the
 * catalogue (five members) and the one whose whole range is smaller than a plate.
 *
 * ── THE AUTHORING PROBLEM: A REP YOU CAN BARELY SEE ─────────────────────────────────────────────
 * A calf raise moves the body about 12 units. Drawn honestly at the athlete's scale it is a figure
 * that twitches, and a demonstration nobody can read teaches nothing — which is exactly the failure
 * §0 forbids. Every other rig in this library solves that by being big; this one solves it by being
 * FRAMED: the whole body rises off a raised block, so the eye has a fixed edge — the block's top —
 * to measure the heel against. The range statement ticks the heel's travel beside it. The motion is
 * small and the READING of it is not, and no proportion is exaggerated to get there.
 *
 * ── THE PIVOT IS THE TOE, WHICH IS WHY THE WHOLE BODY TRAVELS ───────────────────────────────────
 * Nothing here bends. The ankle plantarflexes and every joint above it — knee, hip, shoulder, head —
 * rides up the same distance, because that is what standing on your toes does. Authoring it as
 * "raise the body, keep the skeleton rigid" is both simpler and truer than posing an ankle: the
 * skeleton is built once at the bottom and translated, so the segment lengths cannot drift.
 *
 * ── THE TWO CUES, BOTH MEASURABLE ───────────────────────────────────────────────────────────────
 *   1. **The knee stays straight** — bending it turns the lift into a half squat and takes the
 *      gastrocnemius out of it. `jointAngle` at BOTH endpoints holds one window, so the knee cannot
 *      quietly help.
 *   2. **All the way down** — the stretch under the block is the half of the range people skip.
 *      `contactY` on the heel at the bottom states it, below the block's own top edge.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene, groundShadow, plateGhost } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, standingCore } from '../bodies';

const X = 178;

/**
 * ⚠️ THE WHOLE SCENE SITS LOWER IN THE FRAME, AND IT HAS TO (geometry QC, 2026-08-25).
 *
 * This is the only rig whose athlete RISES as a rigid body, and the rise is real: 26 units. Authored
 * at the canonical standing height her head reached y≈19.5 at the peak against a viewbox that starts
 * at 26 — the crown clipped off the top of the media field on every rep, on all five members. The
 * FormSpec passed the whole time, and correctly: it asks whether the TECHNIQUE is right, and the
 * technique was. Nothing in it can see a frame.
 *
 * The fix is not a smaller rep. The floor has ~20 units of unused frame beneath it, so the entire
 * scene — athlete, block, floor line, shadow — is drawn `DROP` units lower and the rise spends that
 * headroom instead of the crown. The range is untouched; only the camera moved.
 */
const DROP = 16;
const SCENE_FLOOR = FLOOR_Y + DROP;
const raw = standingCore(X);
const base = {
  ...raw,
  head: { x: raw.head.x, y: raw.head.y + DROP },
  shoulder: { x: raw.shoulder.x, y: raw.shoulder.y + DROP },
  hip: { x: raw.hip.x, y: raw.hip.y + DROP },
  knee: { x: raw.knee.x, y: raw.knee.y + DROP },
  ankle: { x: raw.ankle.x, y: raw.ankle.y + DROP },
  heel: { x: raw.heel.x, y: raw.heel.y + DROP },
  toe: { x: raw.toe.x, y: raw.toe.y + DROP },
};

/** The block she stands on: the ball of the foot is supported, the heel hangs off the back. */
const BLOCK_TOP = SCENE_FLOOR - 13;
const BLOCK_X0 = X + 2;
const BLOCK_X1 = X + 34;

/** Heel travel: below the block at the stretch, above its top at the peak. A true ~26u range. */
const HEEL_LOW = BLOCK_TOP + 11;
const HEEL_HIGH = BLOCK_TOP - 15;

const calfChains = {
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

interface CalfParams {
  id: string;
  /** What she is holding, if anything. `bodyweight` leaves the arms hanging. */
  implement: 'bodyweight' | 'db' | 'bar' | 'machine';
  /** One leg works; the other is tucked back out of the way. */
  singleLeg?: boolean;
}

function calfRaise(p: CalfParams): Rig {
  /** The toe is the pivot and it never moves — the one point everything else is measured from. */
  const TOE: Vec2 = { x: BLOCK_X1 - 4, y: BLOCK_TOP };

  const poseAt = (rom: number): Pose => {
    const heelY = lerp(HEEL_LOW, HEEL_HIGH, rom);
    /* The body rises exactly as far as the heel does — rigid above the ankle, which is the lift. */
    const rise = HEEL_LOW - heelY;
    /*
     * THE FOOT IS RIGID, so the heel travels an ARC about the pinned toe rather than a vertical
     * line. The heel used to be authored as `{ x: base.heel.x + 6, y: heelY }` — a fixed x with a
     * sweeping y — which makes heel→toe a hypotenuse that GROWS as the heel leaves the bottom.
     * The auditor measured this foot at 34.1…37.2 units against a canonical 25: not merely a foot
     * drawn too long, but one that changes length by 3 units inside a single rep. Nothing in the
     * old code ever asked how far the heel was from the toe.
     *
     * Solving x from the circle instead keeps the length exactly `ATHLETE.foot` at every rom and
     * preserves the authored heel HEIGHT, which is what the block, the range ticks and both
     * `contactY` predicates are measured against.
     */
    const heelDY = heelY - TOE.y;
    const heelDX = Math.sqrt(Math.max(1, ATHLETE.foot * ATHLETE.foot - heelDY * heelDY));
    const heel: Vec2 = { x: TOE.x - heelDX, y: heelY };
    /* The ankle sits its canonical height above the heel and rides WITH it, arc and all. */
    const ankle: Vec2 = { x: heel.x + (base.ankle.x - base.heel.x), y: heelY - ATHLETE.ankleH };
    /*
     * The body rides the ANKLE, in both axes. It used to ride a pure vertical `rise`, which was
     * consistent only while the ankle's x was pinned; now that the foot pivots, the ankle drifts
     * forward over the toe and a body that rose straight up would leave its own shin behind — the
     * validator caught it immediately as a knee bending to 161° against a declared 168° minimum.
     * Translating by the ankle's full displacement keeps the leg rigid, and the small forward
     * drift is what rising onto the toes actually does to a lifter's balance.
     */
    const drift = ankle.x - base.ankle.x;
    const up = (v: Vec2, dy = rise): Vec2 => ({ x: v.x + drift, y: v.y - dy });
    const shoulder = up(base.shoulder);
    /* Arms: hanging for the free members, hands on the load. The BAR member grips the bar on the
       traps exactly as the back squat does — elbow trailing back, fist up at the bar. */
    const elbow: Vec2 =
      p.implement === 'bar'
        ? { x: shoulder.x - 9, y: shoulder.y + 18 }
        : { x: shoulder.x + 1.5, y: shoulder.y + ATHLETE.upperArm };
    const hand: Vec2 =
      p.implement === 'bar' ? { x: shoulder.x, y: shoulder.y - 3.5 } : { x: elbow.x, y: elbow.y + ATHLETE.foreArm };
    return {
      headR: ATHLETE.headR,
      j: {
        head: up(base.head),
        shoulder,
        hip: up(base.hip),
        knee: up(base.knee),
        ankle,
        heel,
        toe: TOE,
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(up(base.hip), -6, 1),
        farKnee: far(up(base.knee), -6, 1),
        // The resting leg is tucked BACK and its foot never reaches the block.
        farAnkle: p.singleLeg ? { x: ankle.x - 20, y: ankle.y - 6 } : far(ankle, -6, 1),
        farHeel: p.singleLeg ? { x: heel.x - 16, y: heelY - 8 } : far(heel, -6, 0),
        farToe: p.singleLeg ? { x: TOE.x - 20, y: TOE.y - 10 } : far(TOE, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const hand = pose.j.hand;
    const farHand = pose.j.farHand;
    const block: Primitive[] = [
      { kind: 'rect', x: BLOCK_X0, y: BLOCK_TOP, width: BLOCK_X1 - BLOCK_X0, height: SCENE_FLOOR - BLOCK_TOP, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
      // The block's TOP EDGE, extended back as a hairline — the fixed line the heel is read against.
      { kind: 'dash', a: { x: BLOCK_X0 - 34, y: BLOCK_TOP }, b: { x: BLOCK_X0, y: BLOCK_TOP }, w: 1.5, color: 'ink3', dash: [3, 4], opacity: 0.7 },
    ];
    const back: Primitive[] = [...block, ...barPathTicks(BLOCK_X0 - 30, HEEL_LOW, HEEL_HIGH)];
    let front: Primitive[] = [];
    const DOWN: Vec2 = { x: 1, y: 0 };

    if (p.implement === 'db') front = [...dumbbellSide(farHand, DOWN), ...dumbbellSide(hand, DOWN)];
    else if (p.implement === 'bar') {
      /*
       * The SMITH member draws its machine (equipment QC 2026-08-25: it drew a floating plate and
       * no rails — a Smith calf raise without the Smith). The gate silhouette is the Smith's
       * reserved signature (§3.5 Amendment 5): both uprights full height, a faint crossbar riding
       * at the bar's height, and the bar ON the traps at the back squat's own carry — rising with
       * the body, which is the honest picture: on a Smith, the BAR is what travels the rail.
       */
      const bar: Vec2 = { x: pose.j.shoulder.x, y: pose.j.shoulder.y - 3.5 };
      back.push(
        /* The gate, END-ON — both rails on the bar's own x, separated by depth. At the front-view
           spacing one upright ran through the athlete; see `pullRow.smithRow`. */
        { kind: 'line', a: { x: bar.x - 9, y: 40 }, b: { x: bar.x - 9, y: SCENE_FLOOR - 2 }, w: 3, color: 'ink3', opacity: 0.55 },
        { kind: 'line', a: { x: bar.x + 9, y: 40 }, b: { x: bar.x + 9, y: SCENE_FLOOR - 2 }, w: 3, color: 'ink3' },
        ...[0, 1, 2, 3].map((i) => ({
          kind: 'line' as const,
          a: { x: bar.x + 9, y: 66 + i * 16 },
          b: { x: bar.x + 16, y: 66 + i * 16 },
          w: 2,
          color: 'ink3' as const,
        })),
      );
      front = [...plateGhost(bar), { kind: 'circle', c: pose.j.head, r: pose.headR, fill: 'ink1' }];
    } else if (p.implement === 'machine') {
      /*
       * The shoulder pad rides the TRAPS — behind the neck, below the head (visual QC 2026-08-25:
       * drawn at head height it read as headgear, not as a machine). One pad bar across the
       * shoulder line, its frame post rising BEHIND the figure to the machine's arm overhead.
       */
      const sj = pose.j.shoulder;
      /*
       * …and the frame that pad hangs from, which was missing. The post used to stop dead at y=34
       * with a short arm and nothing under it: a shoulder pad floating in the air over a man on a
       * block. `equipment: 'machine'` has to be a machine — so the mast is grounded behind him, the
       * cantilever reaches forward over the traps, and the STACK it lifts stands behind the mast and
       * rises with him. The pad itself still rides the traps, below the head (drawn at head height
       * it reads as headgear, visual QC 2026-08-25).
       */
      const MAST_X = sj.x - 42;
      const tower = stackTower({ x0: MAST_X - 30, x1: MAST_X - 6, capY: 46, stackTopY: SCENE_FLOOR - 34 }, (HEEL_LOW - pose.j.heel.y) * 0.8);
      back.push(
        ...tower.prims,
        { kind: 'line', a: { x: MAST_X, y: 34 }, b: { x: MAST_X, y: SCENE_FLOOR - 2 }, w: 3.5, color: 'ink3' },
        { kind: 'line', a: { x: MAST_X - 10, y: SCENE_FLOOR - 2 }, b: { x: MAST_X + 12, y: SCENE_FLOOR - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        { kind: 'line', a: { x: MAST_X - 8, y: 46 }, b: { x: MAST_X, y: 46 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: MAST_X, y: 34 }, b: { x: sj.x + 4, y: 34 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: sj.x - 15, y: sj.y }, b: { x: sj.x - 15, y: 34 }, w: 2.5, color: 'ink3' },
        { kind: 'rect', x: sj.x - 13, y: sj.y - 4, width: 26, height: 8, rx: 4, fill: 'paper3', stroke: 'ink3', w: 2 },
      );
    }
    return { back, front };
  };

  const straightKnee = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'knee',
    neighbors: ['hip', 'ankle'] as [string, string],
    min: 168,
    max: 180,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    /* startAt 'bottom': the rep OPENS in the stretch below the block, which is where she stands. */
    start: [
      straightKnee('knee straight at the stretch'),
      { kind: 'contactY', a: 'heel', y: HEEL_LOW, tol: 2, label: 'all the way down — the heel below the block' },
    ],
    end: [
      straightKnee('and still straight at the top — the knee never helps'),
      { kind: 'contactY', a: 'heel', y: HEEL_HIGH, tol: 2, label: 'all the way up onto the toes' },
    ],
    /*
     * An ARC, not a vertical. The heel is the far end of a rigid foot pivoting on its toe, so its
     * path is a circle of radius `ATHLETE.foot` about that toe — and the constraint that makes it
     * true is the pivot holding still, which is the `pointFixed` on the toe below. Declaring it
     * `vertical` was only ever true of the old stretching foot, whose heel slid straight down
     * because its length was free to change.
     */
    path: { track: 'heel', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'the ball of the foot is the pivot, and it stays' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the body stays tall — no dip' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 180.5, label: 'no knee hyperextension' },
    ],
  };

  return { id: p.id, chains: calfChains, formspec, poseAt, decorAt, scene: [...floorScene(SCENE_FLOOR, X, 26), groundShadow(X, 26, SCENE_FLOOR)] };
}

export const standingCalfRaise = calfRaise({ id: 'standing_calf_raise', implement: 'machine' });
export const smithCalfRaise = calfRaise({ id: 'smith_calf_raise', implement: 'bar' });
export const dbCalfRaise = calfRaise({ id: 'db_calf_raise', implement: 'db' });
export const singleLegCalfRaise = calfRaise({ id: 'single_leg_calf_raise', implement: 'bodyweight', singleLeg: true });
// leg_press_calf_raise moved to `legPress.ts` (equipment QC 2026-08-25): its noun is the SLED —
// drawn standing with a trap pad it wore the standing machine's signature, which §3.5 forbids.
