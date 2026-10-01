/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SECOND CAMERA — the big lifts, face-on (design audit 2026-09-29; the founder's free hand,
 * 2026-09-30: *"take each item to the edge of its potential"*)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * *"Slow motion and a second angle are what turn a figure into a real teaching video."* The side is
 * the right camera for a lift's PATH — the bar over the mid-foot, the hinge, the depth — and it is
 * blind to everything a coach checks from the front: how wide the feet are, whether the knees track
 * over the toes or cave in, where the hands sit on the bar, whether the body is square.
 *
 * ⛔ WHY THESE ARE AUTHORED, NOT ORBITED. The obvious build is to swing `rig.camera` 90° round the
 * catalogue rig. It cannot work: 116 of the 146 rigs are flat (no `z`), so a 90° orbit folds every
 * joint onto one vertical line; and equipment is drawn in the authored plane (`frame.ts` — a rig owns
 * the projection of its own kit), so even a rig with depth would turn while its bar stayed side-on.
 *
 * ⚠️ BUT THE SIDE RIG IS STILL THE SOURCE OF TRUTH. With a level camera, a joint's HEIGHT is the same
 * from the side and from the front — only the horizontal axis changes, from forward/back to left/right.
 * So every front view here reads its heights, its timing and its tempo from the catalogue rig at the
 * SAME rom, and authors only what the side cannot know: the widths. Two consequences:
 *
 *   · the two cameras can never disagree about depth, lockout or tempo — the squat is exactly as deep
 *     from the front as from the side, at the same instant;
 *   · switching cameras mid-rep continues the rep (`MotionFigure` keeps one clock across a rig swap),
 *     because both rigs are the same function of the same clock.
 *
 * Depth shows as honest foreshortening — a thigh pointing at the lens at the bottom of a squat draws
 * short, a torso bowing toward it draws short — never as a bone growing (`audit` law 1, run over every
 * view here in `frontViews.test`).
 */

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { ATHLETE } from '../anthro';
import { barPathTicks, barbellFront, floorScene } from '../kit';
import { EXERCISE_MOTION } from '../registry';

const CX = 180;
const SHOULDER_X = 15.5; // the canonical frontal shoulder joints (`bodies.standingFrontCore`)
const HIP_X = 9;
/** The elbow's true fraction of a straight arm — a pull's arms are ropes (the sumo's own rule). */
const ELBOW_T = ATHLETE.upperArm / (ATHLETE.upperArm + ATHLETE.foreArm);

type SideJoints = Record<string, Vec2>;

interface FrontSpec {
  /** The catalogue rig this is the other camera on. */
  of: string;
  /** Half the distance between the ankles. */
  stance: number;
  /** The knee's lateral at a straight leg — a little outside the hip-to-ankle line, so the leg reads as a leg. */
  knee: number;
  /** How much of the knee's FORWARD travel (side view) turns into width — "knees out over the toes". */
  kneeOut: number;
  /** The toe's reach outside the ankle — toes forward (≈9) or turned out for a squat (≈12). */
  toe: number;
  /** Hand and elbow, as lateral offsets at this instant, read off the side rig's joints. */
  arms: (s: SideJoints, rom: number) => { hand: { x: number; y: number }; elbow: { x: number; y: number } | 'straight' };
  /** What the side rig's tracked point is called here, for the contract. */
  track: 'handR' | 'hipC';
  /** Equipment, face-on, from the finished front pose. */
  decor: (p: Pose, s: SideJoints) => Decor;
}

function frontView(spec: FrontSpec): Rig {
  const side = (): Rig => EXERCISE_MOTION[spec.of];
  const sideAt = (rom: number): SideJoints => side().poseAt(rom).j;

  const poseAt = (rom: number): Pose => {
    const s = sideAt(rom);
    const floorY = s.heel.y;
    /* The side rigs' `shoulder` IS the neck base (their torso chain is hip → shoulder, 48); face-on the
       two shoulder joints sit 2 below it, as `standingFrontCore` draws them. */
    const neckBase: Vec2 = { x: CX, y: s.shoulder.y };
    const shY = s.shoulder.y + 2;
    // Forward travel of the knee past the ankle (side rigs face +x): the part that goes OUT over the toes.
    const forward = Math.max(0, s.knee.x - s.ankle.x);
    const kneeX = spec.knee + spec.kneeOut * forward;
    const { hand, elbow } = spec.arms(s, rom);
    const arm = (side: 1 | -1) => {
      const sh: Vec2 = { x: CX + SHOULDER_X * side, y: shY };
      const h: Vec2 = { x: CX + hand.x * side, y: hand.y };
      const e: Vec2 = elbow === 'straight' ? { x: lerp(sh.x, h.x, ELBOW_T), y: lerp(sh.y, h.y, ELBOW_T) } : { x: CX + elbow.x * side, y: elbow.y };
      return { sh, e, h };
    };
    const R = arm(1);
    const L = arm(-1);
    return {
      headR: ATHLETE.headR,
      j: {
        head: { x: CX, y: s.head.y },
        neckBase,
        hipC: { x: CX, y: s.hip.y },
        shoulderR: R.sh, elbowR: R.e, handR: R.h,
        shoulderL: L.sh, elbowL: L.e, handL: L.h,
        hipR: { x: CX + HIP_X, y: s.hip.y }, hipL: { x: CX - HIP_X, y: s.hip.y },
        kneeR: { x: CX + kneeX, y: s.knee.y }, kneeL: { x: CX - kneeX, y: s.knee.y },
        ankleR: { x: CX + spec.stance, y: s.ankle.y }, ankleL: { x: CX - spec.stance, y: s.ankle.y },
        heelR: { x: CX + spec.stance - 3.5, y: floorY }, toeR: { x: CX + spec.stance + spec.toe, y: floorY },
        heelL: { x: CX - spec.stance + 3.5, y: floorY }, toeL: { x: CX - spec.stance - spec.toe, y: floorY },
      },
    };
  };

  const trackY = (rom: number): number => (spec.track === 'hipC' ? sideAt(rom).hip.y : spec.arms(sideAt(rom), rom).hand.y);
  const formspec = (): FormSpec => ({
    tempo: side().formspec.tempo,
    start: [{ kind: 'contactY', a: spec.track, y: trackY(0), tol: 0.5, label: 'where the side view starts' }],
    end: [{ kind: 'contactY', a: spec.track, y: trackY(1), tol: 0.5, label: 'where the side view ends' }],
    path: { track: spec.track, kind: 'vertical', tol: 0.5 },
    invariants: [
      { kind: 'pointFixed', point: 'heelR', tol: 0.5, label: 'feet planted' },
      { kind: 'pointFixed', point: 'toeR', tol: 0.5, label: 'feet planted' },
      { kind: 'pointFixed', point: 'heelL', tol: 0.5, label: 'both feet' },
      { kind: 'pointFixed', point: 'toeL', tol: 0.5, label: 'both feet' },
    ],
  });

  const rig: Rig = {
    id: `${spec.of}@front`,
    chains: {
      torso: ['hipC', 'neckBase'],
      neck: ['neckBase', 'head'],
      head: 'head',
      view: 'front',
      nearArm: ['shoulderR', 'elbowR', 'handR'],
      farArm: ['shoulderL', 'elbowL', 'handL'],
      nearLeg: ['hipR', 'kneeR', 'ankleR'],
      farLeg: ['hipL', 'kneeL', 'ankleL'],
      nearFoot: ['heelR', 'toeR'],
      farFoot: ['heelL', 'toeL'],
    },
    get formspec() {
      return formspec();
    },
    poseAt,
    decorAt: (rom: number) => spec.decor(poseAt(rom), sideAt(rom)),
    get scene() {
      return floorScene(sideAt(0).heel.y, CX, spec.stance + 26);
    },
  } as Rig;
  return rig;
}

/** The range statement at the side of the frame, from the tracked point's own two ends. */
const ticksFor = (spec: { track: 'handR' | 'hipC' }, y0: number, y1: number): Primitive[] => barPathTicks(CX + 100, y0, y1);

/* ─────────────────────────────────────────────────────────────── the pulls from the floor */

/** Conventional deadlift: hip-width feet pointing forward, the grip just outside the knees, arms as ropes. */
const deadlift = frontView({
  of: 'bb_deadlift',
  stance: 11.5,
  knee: 12.5,
  kneeOut: 0.12,
  toe: 9,
  arms: (s) => ({ hand: { x: 22, y: s.hand.y }, elbow: 'straight' }),
  track: 'handR',
  decor: (p, s) => ({
    back: ticksFor({ track: 'handR' }, EXERCISE_MOTION.bb_deadlift.poseAt(0).j.hand.y, EXERCISE_MOTION.bb_deadlift.poseAt(1).j.hand.y),
    front: barbellFront(CX, s.hand.y),
  }),
});

/** Romanian deadlift: the same stance and grip, knees soft and still, the bar sliding down the thighs. */
const rdl = frontView({
  of: 'bb_rdl',
  stance: 11.5,
  knee: 12.5,
  kneeOut: 0.12,
  toe: 9,
  arms: (s) => ({ hand: { x: 21, y: s.hand.y }, elbow: 'straight' }),
  track: 'handR',
  decor: (p, s) => ({
    back: ticksFor({ track: 'handR' }, EXERCISE_MOTION.bb_rdl.poseAt(0).j.hand.y, EXERCISE_MOTION.bb_rdl.poseAt(1).j.hand.y),
    front: barbellFront(CX, s.hand.y),
  }),
});

/* ──────────────────────────────────────────────────────────────────────────── the squats */

/**
 * Back squat: shoulder-width feet turned out, the knees driven out over the toes as the hips sink
 * (`kneeOut` — the side view's forward knee travel, turned into width), the bar across the traps
 * BEHIND the neck, the hands wide on it and the elbows down.
 */
const backSquat = frontView({
  of: 'bb_back_squat',
  stance: 17,
  knee: 13.5,
  kneeOut: 0.55,
  toe: 12,
  arms: (s) => ({ hand: { x: 30, y: s.hand.y }, elbow: { x: 26, y: s.elbow.y } }),
  track: 'hipC',
  decor: (p, s) => ({
    // Behind the neck: the body covers the middle of the bar and the hands close over it.
    back: [
      ...ticksFor({ track: 'hipC' }, EXERCISE_MOTION.bb_back_squat.poseAt(0).j.hip.y, EXERCISE_MOTION.bb_back_squat.poseAt(1).j.hip.y),
      ...barbellFront(CX, s.hand.y),
    ],
    front: [],
  }),
});

/** Front squat: the same legs; the bar on the front of the shoulders, the elbows up and out in the rack. */
const frontSquat = frontView({
  of: 'front_squat',
  stance: 17,
  knee: 13.5,
  kneeOut: 0.55,
  toe: 12,
  arms: (s) => ({ hand: { x: 18, y: s.hand.y }, elbow: { x: 24, y: s.elbow.y } }),
  track: 'hipC',
  decor: (p, s) => ({
    back: ticksFor({ track: 'hipC' }, EXERCISE_MOTION.front_squat.poseAt(0).j.hip.y, EXERCISE_MOTION.front_squat.poseAt(1).j.hip.y),
    // In front of the throat, resting on the delts — just above where the fingers hook it.
    front: barbellFront(CX, s.hand.y - 3),
  }),
});

/** Goblet squat: the dumbbell held upright against the chest by its top head, elbows inside the knees. */
const gobletSquat = frontView({
  of: 'goblet_squat',
  stance: 17,
  knee: 13.5,
  kneeOut: 0.55,
  toe: 12,
  arms: (s) => ({ hand: { x: 4.5, y: s.hand.y }, elbow: { x: 13, y: s.elbow.y } }),
  track: 'hipC',
  decor: (p, s) => {
    const top = s.hand.y - 2;
    const bottom = top + 20;
    const head = (y: number): Primitive => ({ kind: 'ellipse', c: { x: CX, y }, rx: 9, ry: 3.6, fill: 'ink3', opacity: 0.9 });
    return {
      back: ticksFor({ track: 'hipC' }, EXERCISE_MOTION.goblet_squat.poseAt(0).j.hip.y, EXERCISE_MOTION.goblet_squat.poseAt(1).j.hip.y),
      front: [
        { kind: 'line', a: { x: CX, y: top }, b: { x: CX, y: bottom }, w: 2.5, color: 'ink0', cap: 'round' },
        head(bottom),
        head(top),
      ],
    };
  },
});

/* ────────────────────────────────────────────────────────────────────────────── the press */

/**
 * Standing overhead press: the grip just outside the shoulders, the elbows under the bar at the
 * bottom (pointing a little forward, so the upper arm draws short) and stacked under the wrists at
 * lockout. The bar passes the chin on the way up — which is what the face-on camera shows best.
 */
const overheadPress = frontView({
  of: 'bb_overhead_press',
  stance: 12.5,
  knee: 13,
  kneeOut: 0,
  toe: 9,
  arms: (s, rom) => ({ hand: { x: 20, y: s.hand.y }, elbow: { x: lerp(22.5, 18.5, rom), y: s.elbow.y } }),
  track: 'handR',
  decor: (p, s) => ({
    back: ticksFor({ track: 'handR' }, EXERCISE_MOTION.bb_overhead_press.poseAt(0).j.hand.y, EXERCISE_MOTION.bb_overhead_press.poseAt(1).j.hand.y),
    // The side view's own small discs (6.6 — `overheadPressStanding`), so the lockout clears the frame.
    front: barbellFront(CX, s.hand.y, 78, 62, 6.6),
  }),
});

/** Every lift with a second camera, by catalogue id. */
export const FRONT_VIEWS: Record<string, Rig> = {
  bb_deadlift: deadlift,
  bb_rdl: rdl,
  bb_back_squat: backSquat,
  front_squat: frontSquat,
  goblet_squat: gobletSquat,
  bb_overhead_press: overheadPress,
};
