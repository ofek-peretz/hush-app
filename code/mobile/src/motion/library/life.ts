/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THINGS AN ATHLETE DOES THAT ARE NOT AN EXERCISE (founder, 2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני מציע שנעשה את הדמות שיצרנו כגיבור של המסך… כלומר מה שאני אומר זה שהדמות מדמה את כל
 *   > מהלך האימון."*
 *
 * The library has 136 rigs and every one of them is a LIFT. That was never a limitation until the
 * figure was asked to carry the session rather than to teach a movement — and a session is mostly
 * not lifting. It is: perform the set · stand there and log it · sit down, breathe and drink.
 *
 * ── ⛔ FRONT-ON, ALL THREE (founder, 2026-08-31, on the first side-view build) ────────────────────
 *
 *   > *"במצב המנוחה אני חושב שאתה צריך לבדוק איך זה יראה אם הדמות תשב על הספסל בחזית ולא מהצד. כי
 *   > כרגע זה ניראה קצת מוזר."*
 *   > *"לגבי הדמות שכותבת בפלאפון זה לא ברור כרגע."*
 *
 * He is right on both, and they turn out to be ONE fault with one cause. A side view is the correct
 * camera for a LIFT, because a lift is a movement in a plane and the side is the plane it happens
 * in. Resting and logging are not movements — they are POSTURES, and a posture is read off the
 * front: the shoulders, the two arms, the width of the body, the object in the hands. Side-on, the
 * phone was a 4-point sliver edge-on to the lens and the near arm hid the far one; front-on it is a
 * lit rectangle held in two hands under a bowed head, which is the picture everybody on earth
 * already knows.
 *
 * ── ⛔ WHY THESE ARE NOT IN `registry.ts` ────────────────────────────────────────────────────────
 *
 * `RIGS` maps an EXERCISE ID to its demonstration, and everything downstream treats membership as
 * that claim: `exerciseMotion` is keyed by exercise, `everyLiftLearnsToMove` walks the catalogue
 * against it, and `formspec.validate` reads a rig as a prescription with a start position, a
 * working endpoint and a tracked path. `resting` has no endpoint and `logging` teaches nothing.
 *
 * ── ⚠️ THE BODY LAWS STILL APPLY, AND ARE STILL CHECKED ─────────────────────────────────────────
 *
 * Being outside the registry buys an exemption from the EXERCISE laws, not from the ones that are
 * true of bodies. `motion/audit.ts` is written against `Rig` and does not care where a rig lives,
 * so `__tests__/motion/life.test.ts` runs it over all three exactly as the catalogue is run.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Tempo, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { ATHLETE } from '../anthro';
import { benchEndOn, floorScene } from '../kit';
import { FLOOR_Y, seatedFrontCore, standingFrontCore } from '../bodies';

/* ─────────────────────────────────────────────────────────── seated on the bench, front-on */

const CX = 180;
const SEAT = seatedFrontCore(CX);
/**
 * The pad top, just under the hip joint — `benchEndOn` draws the bench seen end-on, which is the
 * front-view counterpart of `flatBench` and already exists for exactly this camera.
 *
 * ⚠️ 34 HALF-WIDTH, NOT THE DEFAULT 24. Face-on, the shins stand in front of the pad and cover it
 * from x 161 to 199; at the default the bench showed as two seven-unit slivers and the figure read
 * as sitting on nothing. A bench wider than the body it carries is also just true.
 */
const PAD_TOP = 158;
const PAD_HALF_W = 34;

/**
 * ⛔ THE HANDS GO DOWN BESIDE THE HIPS, ON THE BENCH — NOT ON THE THIGHS.
 *
 * The first front-on build put them on the thighs at y = 146, which is 36 units from a shoulder
 * that owns 48 units of arm. Two-bone IK has no choice about what to do with the other twelve: the
 * elbow swings 15.8 units out to the side, and the figure came out ARMS AKIMBO — a stance, and a
 * confident one, on the screen whose entire job is to say *she is resting*.
 *
 * A hand 46 units from its shoulder leaves the elbow 6.8 units out, which is a relaxed arm. That
 * lands the hands beside the hips on the pad, which is also where a person actually puts them when
 * they sit down between sets. **The pose was fixed by the reach, not by choosing a nicer bend.**
 */
const HAND_R: Vec2 = { x: 201, y: 154 };
const HAND_L: Vec2 = { x: 159, y: 154 };

/** Exhaled → inhaled. A unit and a half of lift and a little width across the chest: a breath. */
const BREATH_RISE = 1.5;
const BREATH_WIDEN = 0.8;

/**
 * ⛔ THE BOTTLE IS IN HER HAND IN BOTH POSES, AND THAT IS WHAT MAKES THE DRINK POSSIBLE.
 *
 * Breathing and drinking cannot come out of ONE rig: `poseAt` is a pure function of `rom`, and `rom`
 * is a triangle wave — it runs 0 → 1 → 0 every loop — so anything authored to happen "once per
 * loop" happens twice, once on each side of the peak. Two rigs, alternated by the screen, is the
 * honest shape (`SessionFlow.RestingAthlete`), and it is the same thing `DayInMotion` does to walk
 * one figure through a day of lifts.
 *
 * ⚠️ WHAT MAKES THE SWAP INVISIBLE is that `restingRig`'s pose at rom 0 and `drinkingRig`'s pose at
 * rom 0 are THE SAME POSE — bottle down, hand on the thigh, chest exhaled — and the loops are 9 s
 * and 3 s, so a swap on a multiple of 9 s catches both at rom 0. `MotionFigure` anchors its clock
 * at MOUNT and does not reset it when the rig changes, which is what lets the two share a timeline.
 */
function bottle(centre: Vec2, tiltDeg: number): Primitive[] {
  const rad = (tiltDeg * Math.PI) / 180;
  const u: Vec2 = { x: Math.sin(rad), y: -Math.cos(rad) }; // up the bottle
  const w: Vec2 = { x: Math.cos(rad), y: Math.sin(rad) }; // across it
  const at = (a: number, b: number): Vec2 => ({ x: centre.x + u.x * a + w.x * b, y: centre.y + u.y * a + w.y * b });
  const half = 7.5;
  const halfW = 2.9;
  const body = [at(half - 2.4, -halfW), at(half - 2.4, halfW), at(-half, halfW), at(-half, -halfW)];
  return [
    { kind: 'poly', pts: body, fill: 'paper3' },
    { kind: 'polyline', pts: [...body, body[0]], w: 1.3, color: 'ink0' },
    // The cap — a short neck above the shoulder of the bottle, so it reads as a bottle and not a box.
    { kind: 'polyline', pts: [at(half - 2.4, -1.5), at(half, -1.5), at(half, 1.5), at(half - 2.4, 1.5)], w: 1.3, color: 'ink0' },
  ];
}

/**
 * The seated body, shared by both rest poses.
 *
 * `breath` ∈ [0,1] opens the chest; `handR`/`handL` are wherever the arms have been sent. The whole
 * upper body — hips, neck base, head and both shoulders — rises TOGETHER on the inhale, which is
 * the only way to lift the chest without stretching the trunk: `torso` is `hipC → neckBase`, and
 * raising the neck alone would draw a 49-unit spine on a 48-unit skeleton (auditor law 1).
 */
function seatedPose(breath: number, handR: Vec2, handL: Vec2): Pose {
  const rise = BREATH_RISE * breath;
  const widen = BREATH_WIDEN * breath;
  const up = (p: Vec2, dx = 0): Vec2 => ({ x: p.x + dx, y: p.y - rise });
  const shoulderR = up(SEAT.shoulderR, widen);
  const shoulderL = up(SEAT.shoulderL, -widen);
  return {
    headR: ATHLETE.headR,
    j: {
      hipC: up(SEAT.hipC),
      neckBase: up(SEAT.neckBase),
      head: up(SEAT.head),
      shoulderR,
      shoulderL,
      elbowR: twoBoneIK(shoulderR, handR, ATHLETE.upperArm, ATHLETE.foreArm, -1),
      elbowL: twoBoneIK(shoulderL, handL, ATHLETE.upperArm, ATHLETE.foreArm, 1),
      handR,
      handL,
      // The legs are planted and stay exactly where they are — she is sitting down.
      hipR: SEAT.hipR,
      hipL: SEAT.hipL,
      kneeR: SEAT.kneeR,
      kneeL: SEAT.kneeL,
      ankleR: SEAT.ankleR,
      ankleL: SEAT.ankleL,
      heelR: SEAT.heelR,
      toeR: SEAT.toeR,
      heelL: SEAT.heelL,
      toeL: SEAT.toeL,
    },
  };
}

const SEATED_CHAINS = {
  torso: ['hipC', 'neckBase'] as [string, string],
  neck: ['neckBase', 'head'] as [string, string],
  head: 'head',
  view: 'front' as const,
  nearArm: ['shoulderR', 'elbowR', 'handR'],
  farArm: ['shoulderL', 'elbowL', 'handL'],
  nearLeg: ['hipR', 'kneeR', 'ankleR'],
  farLeg: ['hipL', 'kneeL', 'ankleL'],
  nearFoot: ['heelR', 'toeR'] as [string, string],
  farFoot: ['heelL', 'toeL'] as [string, string],
};

const SEATED_SCENE = [...floorScene(FLOOR_Y, CX, 40), ...benchEndOn(CX, PAD_TOP, FLOOR_Y, PAD_HALF_W)];

/**
 * 4.5 s in, 4.5 s out. It WAS the same cadence as the rest ring's `Breathe`; the ring has since
 * been taken off that screen (founder, 2026-08-31: *"אני בעד להוריד את המעגל שסביב השעון כי זה
 * יפתח לנו את כל המסך"*), so the figure is now the only thing on the rest that moves at all — which
 * is the argument for keeping the cadence exactly here rather than speeding it up to be noticed.
 */
const BREATH_TEMPO: Tempo = { topHoldMs: 0, eccentricMs: 4500, bottomHoldMs: 0, concentricMs: 4500, reps: 1, startAt: 'top' };

const restingPose = (rom: number): Pose => seatedPose(rom, HAND_R, HAND_L);

const restingFormspec: FormSpec = {
  tempo: BREATH_TEMPO,
  start: [{ kind: 'contactY', a: 'shoulderR', y: SEAT.shoulderR.y, tol: 0.4, label: 'exhaled' }],
  end: [{ kind: 'contactY', a: 'shoulderR', y: SEAT.shoulderR.y - BREATH_RISE, tol: 0.4, label: 'a full breath in' }],
  path: { track: 'shoulderR', kind: 'vertical', tol: 1.2 },
  invariants: [
    { kind: 'pointFixed', point: 'kneeR', tol: 0.01, label: 'she is sitting down' },
    { kind: 'pointFixed', point: 'ankleR', tol: 0.01, label: 'the feet are planted' },
    { kind: 'pointFixed', point: 'handR', tol: 0.01, label: 'the hands rest on the thighs' },
    { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no locked elbow' },
  ],
};

/** She is between sets, sitting on the bench, breathing, water in her hand. */
export const restingRig: Rig = {
  id: 'life_resting',
  chains: SEATED_CHAINS,
  formspec: restingFormspec,
  poseAt: restingPose,
  /* ⛔ NO RANGE TICKS. Every exercise rig states its range because a range is the lesson; a breath
     has no working endpoint and annotating one would be the drawing claiming to teach something. */
  decorAt: (): Decor => ({ back: [], front: bottle({ x: HAND_R.x, y: HAND_R.y - 5 }, 0) }),
  scene: SEATED_SCENE,
};

/* ─────────────────────────────────────────────────────────────────────────────── the drink */

/**
 *   > *"במנוחה אפשר לעשות אנימציה שהמשתמש גם שותה מים."* — founder, 2026-08-31
 *
 * ⚠️ THE MOUTH IS ABOVE THE SHOULDER, so this arm folds hard — the hand ends about eight units from
 * its own shoulder against forty-eight units of bone. That is not a defect of the solve; it is what
 * raising a bottle to your face does, and it is why the elbow swings wide. The bottle TILTS as it
 * arrives (`bottle` takes an angle) because a vertical bottle held at the mouth reads as somebody
 * holding a bottle near their face, not as somebody drinking from it.
 */
const DRINK_HAND: Vec2 = { x: 190, y: 106 };
const DRINK_BOTTLE: Vec2 = { x: 186, y: 100 };
const DRINK_TILT = 42;

/** Up in 0.9 s, two swallows, down in 0.9 s — a 3.0 s loop, exactly a third of the breath's 9. */
const DRINK_TEMPO: Tempo = { topHoldMs: 0, eccentricMs: 900, bottomHoldMs: 1200, concentricMs: 900, reps: 1, startAt: 'top' };

const drinkingPose = (rom: number): Pose =>
  /* The chest stays where the breath's rom-0 left it, so the swap in and out of this rig moves
     nothing but the arm. */
  seatedPose(0, { x: lerp(HAND_R.x, DRINK_HAND.x, rom), y: lerp(HAND_R.y, DRINK_HAND.y, rom) }, HAND_L);

const drinkingFormspec: FormSpec = {
  tempo: DRINK_TEMPO,
  start: [{ kind: 'contactY', a: 'handR', y: HAND_R.y, tol: 0.4, label: 'water down on the thigh' }],
  end: [{ kind: 'contactY', a: 'handR', y: DRINK_HAND.y, tol: 0.4, label: 'and up to the mouth' }],
  /* ⚠️ A `line`, NOT A `vertical` WITH A WIDE TOLERANCE. The hand travels eleven units across as
     well as forty-eight up — that is a diagonal, and declaring it vertical-with-slack would be
     asserting a shape the movement does not have and then hiding the gap in `tol`. */
  path: { track: 'handR', kind: 'line', tol: 1, dir: { x: -0.2234, y: -0.9747 } },
  invariants: [
    { kind: 'pointFixed', point: 'kneeR', tol: 0.01, label: 'still sitting' },
    { kind: 'pointFixed', point: 'handL', tol: 0.01, label: 'the other hand does not move' },
    { kind: 'pointFixed', point: 'head', tol: 0.01, label: 'the bottle comes to her, not the reverse' },
  ],
};

/** The same seat, the same body, one arm: she takes a drink. */
export const drinkingRig: Rig = {
  id: 'life_drinking',
  chains: SEATED_CHAINS,
  formspec: drinkingFormspec,
  poseAt: drinkingPose,
  decorAt: (rom: number): Decor => ({
    back: [],
    front: bottle(
      { x: lerp(HAND_R.x, DRINK_BOTTLE.x, rom), y: lerp(HAND_R.y - 5, DRINK_BOTTLE.y, rom) },
      lerp(0, DRINK_TILT, rom),
    ),
  }),
  scene: SEATED_SCENE,
};

/* ──────────────────────────────────────────────────────── standing over the phone, front-on */

const STAND = standingFrontCore(CX);

/**
 * ⛔ THE HEAD IS BOWED BY SHORTENING THE NECK, AND THAT IS LEGAL BY THE AUDITOR'S OWN WORDING.
 *
 * Law 1 forbids a projected bone LONGER than the canonical skeleton: *"a projection can only ever
 * be SHORTER than the bone"*. Front-on, a head tipped forward foreshortens the neck to nothing else
 * — 16 units of neck projecting to 9 is precisely what a bowed head looks like from the front, and
 * drawing it any other way would mean tilting the whole camera.
 */
const BOW_HEAD: Vec2 = { x: CX, y: 51 };

/**
 * ⛔ THE PHONE WAS BEHIND THE TORSO, WHICH IS WHY THE POSE READ AS NOTHING (founder: *"זה לא ברור
 * כרגע"*).
 *
 * Side-on it was a sliver edge-on to the lens. Turning the camera to the front fixed the sliver and
 * created a second, worse problem in the same stroke: front-on, the middle of the frame is the
 * TRUNK, and the phone was `back` decor at x = 181 — dead centre, painted before the body and
 * therefore entirely underneath it. The figure was holding an invisible object.
 *
 * There is no depth to hold it out in, so it goes in `front`: the slab over the body, the fingers
 * disappearing behind its edges. That is also what a phone held towards you actually looks like.
 * The tapping hand starts ABOVE the top edge and comes down onto it, so the one moving thing in the
 * drawing is the one thing the slab does not cover.
 *
 * ⚠️ AND IT IS TILTED 10°. Nothing is ever held axis-aligned, and a perfectly upright rectangle in
 * two hands reads as a sign rather than as a phone.
 */
/*
 * ⛔ AND IT IS HELD AT THE BELLY, NOT AT THE CHEST — which is a REACH problem, not a taste one.
 *
 * Chest-high put each hand about twenty units from its own shoulder, against forty-eight units of
 * arm, and two-bone IK then has twenty-eight units of bone to dispose of: one solution threw the
 * elbows up and out (the figure appeared to be WAVING) and the mirror folded them up over the face.
 * Neither is a person on their phone; both are what happens when a hand is parked too close to the
 * joint that carries it. Dropped to the belly the hands sit 37 and 45 units out, the elbows settle
 * about fifteen units off the ribs, and the pose solves itself. **Every arm fault in this file has
 * turned out to be a reach, and none of them was fixed by choosing a different bend.**
 */
const PHONE_C: Vec2 = { x: 181, y: 104 };
const PHONE_HALF_W = 6;
const PHONE_HALF_H = 12;
const PHONE_TILT = 10;
const HOLD_HAND: Vec2 = { x: 169, y: 108 };
const TAP_UP: Vec2 = { x: 192, y: 92 };
const TAP_DOWN: Vec2 = { x: 189, y: 100 };

/**
 * ⚠️ THREE TAPS PER LOOP, NOT TWO. The canon is `reps: 2` because two identical reps read as "this
 * repeats" without the clip becoming a metronome. A tap is a quarter of a rep, and at two the loop
 * runs under two seconds — short enough that the eye catches the SEAM instead of the action.
 */
const TAP_TEMPO: Tempo = { topHoldMs: 260, eccentricMs: 360, bottomHoldMs: 140, concentricMs: 320, reps: 3, startAt: 'top' };

function loggingPose(rom: number): Pose {
  const handR: Vec2 = { x: lerp(TAP_UP.x, TAP_DOWN.x, rom), y: lerp(TAP_UP.y, TAP_DOWN.y, rom) };
  return {
    headR: ATHLETE.headR,
    j: {
      hipC: STAND.hipC,
      neckBase: STAND.neckBase,
      head: BOW_HEAD,
      shoulderR: STAND.shoulderR,
      shoulderL: STAND.shoulderL,
      /* Elbows out to their own side of the body — the sign that puts them beside the ribs rather
         than across the chest. See the note at `PHONE_C` for why the REACH is what makes either
         sign survivable. */
      elbowR: twoBoneIK(STAND.shoulderR, handR, ATHLETE.upperArm, ATHLETE.foreArm, -1),
      elbowL: twoBoneIK(STAND.shoulderL, HOLD_HAND, ATHLETE.upperArm, ATHLETE.foreArm, 1),
      handR,
      handL: HOLD_HAND,
      hipR: STAND.hipR,
      hipL: STAND.hipL,
      kneeR: STAND.kneeR,
      kneeL: STAND.kneeL,
      ankleR: STAND.ankleR,
      ankleL: STAND.ankleL,
      heelR: STAND.heelR,
      toeR: STAND.toeR,
      heelL: STAND.heelL,
      toeL: STAND.toeL,
    },
  };
}

/**
 * The phone: a tilted slab with a lit screen, drawn OVER the body.
 *
 * ⚠️ THE SCREEN IS `ink2`, WHICH IS LIT ON THE STAGE AND DARK ON PAPER — and that is the point of
 * having two ladders. A phone drawn in one flat ink vanishes into whichever ground it was not
 * authored for.
 */
function phoneSlab(): Primitive[] {
  const rad = (PHONE_TILT * Math.PI) / 180;
  const u: Vec2 = { x: Math.sin(rad), y: -Math.cos(rad) };
  const w: Vec2 = { x: Math.cos(rad), y: Math.sin(rad) };
  const at = (c: Vec2, a: number, b: number): Vec2 => ({ x: c.x + u.x * a + w.x * b, y: c.y + u.y * a + w.y * b });
  const corner = (hh: number, hw: number) => [
    at(PHONE_C, hh, -hw),
    at(PHONE_C, hh, hw),
    at(PHONE_C, -hh, hw),
    at(PHONE_C, -hh, -hw),
  ];
  const body = corner(PHONE_HALF_H, PHONE_HALF_W);
  const screen = corner(PHONE_HALF_H - 2.2, PHONE_HALF_W - 1.4);
  return [
    { kind: 'poly', pts: body, fill: 'paper3' },
    { kind: 'poly', pts: screen, fill: 'ink2' },
    { kind: 'polyline', pts: [...body, body[0]], w: 1.5, color: 'ink0' },
  ];
}

const loggingFormspec: FormSpec = {
  tempo: TAP_TEMPO,
  start: [{ kind: 'contactY', a: 'handR', y: TAP_UP.y, tol: 0.4, label: 'thumb lifted' }],
  end: [{ kind: 'contactY', a: 'handR', y: TAP_DOWN.y, tol: 0.4, label: 'and down on the glass' }],
  /* A line, for the same reason the drink is one: the hand comes down AND in. */
  path: { track: 'handR', kind: 'line', tol: 1, dir: { x: -0.2873, y: 0.9578 } },
  invariants: [
    { kind: 'pointFixed', point: 'hipC', tol: 0.01, label: 'standing still' },
    { kind: 'pointFixed', point: 'head', tol: 0.01, label: 'the head stays on the phone' },
    { kind: 'pointFixed', point: 'handL', tol: 0.01, label: 'one hand holds it' },
    { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no locked elbow' },
  ],
};

/**
 * She is standing over her phone, entering the set.
 *
 * ⛔ THE LEGS DO NOT MOVE, AND THAT IS DELIBERATE. The first version nodded the head with the taps
 * and shifted the weight, and it read as a man falling asleep on his feet. A person looking at a
 * phone is still everywhere except the hand. The stillness is also what makes the CHANGE loud: the
 * figure was repping a second ago, and now only a hand moves.
 */
export const loggingRig: Rig = {
  id: 'life_logging',
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
  formspec: loggingFormspec,
  poseAt: loggingPose,
  decorAt: (): Decor => ({ back: [], front: phoneSlab() }),
  scene: floorScene(FLOOR_Y, CX, 34),
};
