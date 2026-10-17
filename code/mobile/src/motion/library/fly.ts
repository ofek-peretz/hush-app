/**
 * fly + rear_delt — the horizontal hug and its exact reverse, in one file for the same reason the
 * knee machines share one: `pec_deck` and `reverse_pec_deck` are literally the same machine sat in
 * two directions, and an athlete who meets both in one week should see one station, not two.
 *
 * FRONT VIEW, all five members. A fly is a rotation in the TRANSVERSE plane; drawn from the side it
 * is an arm that shortens to nothing (the lateral raise's lesson, third time). Face-on it is the
 * plainest movement in the gym: two arms sweeping toward each other — or away.
 *
 * ── ONE PARAMETERISED SWEEP ─────────────────────────────────────────────────────────────────────
 * Each arm is a rigid soft-elbowed unit rotating about its own fixed shoulder — the lateral
 * raise's exact construction, turned 90°: there the sweep runs floor→horizontal in the frontal
 * plane; here it runs wide→centre (fly) or centre→wide (rear delt) across the chest line. θ is
 * measured from straight-out-to-the-side: 0° = arms wide (the stretch), 90° = hands met at the
 * centreline. The FLY members run rom 0→1 as wide→together (`contactX` on the hands meeting —
 * the predicate the standard shipped for exactly this); the REAR members run together→wide, and
 * their working endpoint is the wide position: `contactX` on the hand reaching its own full width.
 *
 * ── THE FAULTS THE INVARIANTS FORBID ────────────────────────────────────────────────────────────
 *   1. **Pressing instead of flying.** The elbow bend is FIXED (the same soft-elbow-by-construction
 *      as the lateral raise): if the elbow angle cannot change, the movement cannot become a press.
 *      `angleNever` caps it; `jointAngle` holds the same window at both endpoints.
 *   2. **Shrugging into it.** The shoulders are the pivots and they are `pointFixed`.
 *   3. **Swinging.** Torso angle frozen, hips pinned — machine or cable, the body is furniture.
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `pec_deck`         — seated, chest to the camera, pads at the forearms, stack behind.
 *   · `cable_fly`        — standing between two crossover towers, cables from behind-and-wide.
 *   · `incline_db_fly`   — the head-end camera (supine front core, incline raise): dumbbells
 *                          meeting above the chest. Same sweep, seen from the bench's head.
 *   · `rear_delt_fly`    — seated dumbbells, the sweep reversed: centre → wide.
 *   · `reverse_pec_deck` — the same machine as pec_deck, sat facing the pad, sweep reversed.
 */

//

import type { Decor, FormSpec, Pose, PosePredicate, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { sticksAt } from '../curves';

/** The sticking point (iron rule 12, 2026-09-07): the driver slows to a dwell where leverage is
 *  worst and runs on. Endpoints untouched. */
const STICK = sticksAt(0.85, 0.06); // the squeeze — met for the chest, opened for the rear delt
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { project, type Camera } from '../camera';
import { bandStrip, benchEndOn, cable, dumbbellFront, floorScene, inclineBackPadFront, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, hingedSeatedCore, seatedFrontCore, standingFrontCore, supineFrontCore } from '../bodies';

const CX = 176;
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/** The rigid soft-elbowed arm: reach a shade under full, bend riding off the sweep ray. */
const REACH_E = U * 0.97;
const REACH_H = (U + F) * 0.94; // flies keep a touch more bend than a lateral raise
const BEND = 4.2;
/** How close to its own shoulder the hand finishes, measured across the body. */
const HAND_GAP = 12;

/**
 * How far round the sweep actually goes. NOT 90 degrees, which would be the arm pointing straight
 * down the athlete's midline — a fly finishes with the hands a hand's width apart in front of the
 * chest, and the last 20 degrees of a clap is not part of the exercise. Ending at 68 is the honest
 * range AND the readable one: at 90 the arm points exactly at a square-on camera and there is no
 * arm left to project, which is the corner every flat version of this file died in.
 */
const MET_PHI = 92;

/**
 * -- WHERE THE CAMERA STANDS FOR A FLY: SQUARE-ON, AFTER TRYING THE ALTERNATIVE ------------------
 *
 * This was 58 degrees for a while, on the argument that a transverse-plane movement cannot be drawn
 * square-on because the arms turn to point at the lens. The argument was wrong, and it is worth
 * writing down why so nobody re-runs it.
 *
 * What made the finish undrawable was never the camera. It was `MET_PHI`: the sweep was authored
 * as a full 90 degrees, an arm swung all the way to the athlete's midline, which is a clap and not
 * a fly. A real fly finishes a hand's width apart, and once the range was corrected the arm
 * projects a readable 58 % of its length WITH NO CAMERA MOVE AT ALL. The three-quarter view was
 * machinery built to rescue a problem that turned out to be an authoring error.
 *
 * Rendered side by side, square-on also simply wins. A fly is judged on SYMMETRY -- both arms
 * opening the same amount, both elbows holding the same angle -- and a three-quarter view hides
 * exactly that: one arm falls behind the torso, the far one drops to a lighter ink, and the two
 * sides stop being comparable. It looked more dimensional and read less clearly, and clarity is
 * the product.
 *
 * The depth authoring below STAYS. It is the honest description of the movement, it is what
 * surfaced `MET_PHI` in the first place, and at azimuth 0 it projects through the identity, so it
 * costs the drawing nothing.
 *
 * 2026-08-29. All of the above was written, and the constant was then left at 25 — so four clips
 * shipped with the staging their own file argues against. What found it was measuring the drawn
 * hinge THROUGH the rep instead of at its two ends: at 25 the far elbow passes 4° at rom 0.63,
 * because the far arm sweeps through the view axis somewhere in every rep and the shoulder and the
 * hand project onto the same point. It is worth being exact about why no other angle rescues it.
 * The arm turns ~90° in the transverse plane, so its projected span passes through zero at SOME
 * rom for any azimuth in [0, 90) — one arm or the other, always. What azimuth 0 buys is not
 * escape, it is SYMMETRY: both arms foreshorten at the same instant, which reads as two hands
 * coming toward the viewer, where a three-quarter reads as one arm gone missing.
 */
export const FLY_AZIMUTH = 0;

const flyChains = {
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

interface FlyParams {
  id: string;
  /** The body the arms hang from. */
  core: ReturnType<typeof seatedFrontCore>;
  /**
   * Depths for that body, when it is not flat. Only `rear_delt_fly` uses it: its whole identity is
   * a torso folded forward, which is a rotation in depth, and a core that leans has to say so or
   * the auditor measures a 20-unit trunk against a 48-unit bone and the ink cannot read the fold.
   */
  coreZ?: Record<string, number>;
  /** Sweep at rom 0 and rom 1, degrees from straight-out-wide toward the centreline. */
  thetaFrom: number;
  thetaTo: number;
  implement: 'machine' | 'cable' | 'db' | 'band';
  /** Rear members open outward; their range statement and stack run the other way. */
  reversed?: boolean;
  /** Extra scene furniture keyed by member. */
  seatBack?: boolean;
  /**
   * Draw the bench he is sitting on. It used to be inferred (`core === seated && !seatBack`), which
   * silently stopped being true the day `rear_delt_fly` moved to a folded core — and the furniture
   * vanished, which is the oldest fault in this library: a bench exercise with no bench.
   */
  bench?: boolean;
  /**
   * How far the hand rides from its own shoulder — which is to say, HOW BENT THE ELBOW IS, since
   * the two bones are canonical and the reach fixes the triangle. Defaults to `REACH_H`, a nearly
   * straight arm.
   *
   * A bent arm would draw better. At the instant the arm swings through pointing at the lens, the
   * elbow's offset from the shoulder→hand chord is the ENTIRE budget the forearm has to project
   * with: 7.7u at a soft 140°, 13.4u at a pec-deck-pad 112°. It was tried at 112 and reverted —
   * `pec_deck`'s own first cue is "Soft elbows", and a clip may not contradict the card it
   * illustrates (MOTION_FORM_STANDARD §1). The momentary foreshortening is the honest cost of that,
   * and the implement drawn at the hand is what carries the position through it.
   */
  reach?: number;
  /**
   * The low-to-high member (batch 2, 2026-08-26): the hands RISE through the sweep — wide at the
   * hip line, met above the chest line. `fromDY`/`toDY` are hand-y offsets from the shoulder line;
   * `wideDX` pulls the wide hand in so the IN-PLANE end still fits the canonical arm (projection
   * may shorten a limb, never stretch it). Pulleys sit at the FLOOR, which is the member's point.
   */
  rise?: { fromDY: number; toDY: number; wideDX: number };
  /** How far below the shoulder the hands meet. Default 9 — the sternum, not the shoulder line. */
  metDrop?: number;
  /**
   * Where this member's camera stands, off its authored view. Defaults to `FLY_AZIMUTH`.
   *
   * The SUPINE members override it to 0, and the reason is worth keeping. Orbiting a lifter who is
   * lying down walks the camera around his long axis, so the picture goes from "looking down at a
   * man on a bench" to "looking along the bench at a man lying on his side" — a legible drawing of
   * a movement nobody performs. The upright members gain a dimension from the orbit; the supine
   * ones only lose the bench. What actually fixed the supine flies was `MET_PHI` and `HAND_GAP`:
   * once the sweep stops short of the midline the arm projects 58 % of its length even square-on,
   * and there was never anything left for a camera move to rescue.
   */
  azimuth?: number;
  /** The raised camera (`Camera.elevation`) — the fly family's answer to the arm that points at the lens. */
  elevation?: number;
  /**
   * THE SUPINE MEMBERS SWEEP IN THE DRAWING PLANE, and they were being swept into depth.
   *
   * A fly is a rotation in the athlete's TRANSVERSE plane. Standing, that plane runs into the
   * screen and the arm foreshortens — which is what `handZ` describes and why this family needed
   * three dimensions at all. Lying down it does not: the head-end camera looks straight down the
   * body's long axis, so the athlete's transverse plane IS the page. A supine fly has no
   * foreshortening to model, and modelling it anyway sent the hands TOWARD THE LENS as they closed
   * when they should have travelled UP THE PAGE — the arms collapsed into a black lump over the
   * chest at the finish, and the dumbbells landed on his face.
   *
   * So the supine members rotate in the plane, z = 0 throughout: the hands open wide and a little
   * below the shoulder line and close high over the chest, which is the movement.
   */
  supine?: boolean;
}

function fly(p: FlyParams): Rig {
  /*
   * -- THE FLY, AUTHORED IN THREE DIMENSIONS ------------------------------------------------------
   *
   * A fly is a rotation of a near-straight arm about the shoulder IN THE TRANSVERSE PLANE: the arm
   * swings from out-to-the-side round to straight-ahead. That is a fact about the athlete, and
   * writing it down is now all this function does. The hand rides a circle of radius `REACH_H`
   * about its own shoulder, `phi` degrees round from the side, and its DEPTH is the sine of that.
   *
   * Every previous version of this code was authoring the PICTURE of the rotation instead, and it
   * could not be made to work. Face-on, the picture of an arm at phi = 90 is an arm pointing at the
   * lens: the projected span goes to nothing, and no rule for placing an elbow on a zero-length ray
   * has an answer. The flat code hid that behind a fixed offset, which turned the arm into an 8
   * degree hairpin halfway through the sweep; scaling the offset removed the hairpin but left the
   * arms as stubs, because a stub is genuinely what a square-on camera sees there.
   *
   * Stated in three dimensions the picture is DERIVED rather than drawn, and the camera becomes a
   * free choice instead of a constraint. That is the whole reason the family now sits at
   * `FLY_AZIMUTH` -- see the note on it.
   */
  /*
   * THE HAND STAYS ON THE SPHERE (execution pass, 2026-09-07). `metDrop` and `rise` used to be
   * ADDED to the hand's y while x and z kept the full circle, so the shoulder→hand chord grew with
   * the drop and the arm bones — placed along the chord — stretched with it (rear_delt_fly at
   * metDrop 32: upper arm 28.1 against 25). Now the drop is a rotation: the in-plane radius shrinks
   * by √(1 − (dy/R)²) so the chord is R at every phi, the elbow angle is CONSTANT, and a member may
   * drop or rise its hands as far as the movement needs.
   */
  const wideReach = p.reach ?? REACH_H;
  const metDrop = p.metDrop ?? 9;
  const dropAt = (phi: number) => -1.5 + lerp(0, metDrop, phi / MET_PHI) + (p.rise ? lerp(p.rise.fromDY, p.rise.toDY, phi / MET_PHI) : 0);
  const planeK = (phi: number) => (p.supine ? 1 : Math.sqrt(Math.max(0.05, 1 - (dropAt(phi) / wideReach) ** 2)));
  /** Depth of the hand at `phi`: 0 out to the side, +reach when the arm points at the camera. */
  const handZ = (phi: number) => (p.supine ? 0 : wideReach * planeK(phi) * Math.sin((phi * Math.PI) / 180));
  const handAt = (phi: number, side: 1 | -1): Vec2 => {
    const shoulder = side === 1 ? p.core.shoulderR : p.core.shoulderL;
    const rad = (phi * Math.PI) / 180;
    const cos = Math.cos(rad);
    if (p.supine) {
      // the sweep runs IN the page: out and a little low at phi 0, up over the chest at phi 90+
      return { x: shoulder.x + side * wideReach * cos, y: shoulder.y - wideReach * Math.sin(rad) };
    }
    return {
      x: shoulder.x + side * wideReach * planeK(phi) * cos,
      y: shoulder.y + dropAt(phi),
    };
  };
  /* The two ends of THIS member's own sweep — not of the family constant. The supine members run
     −14 → 100 rather than 0 → MET_PHI, and reading the endpoint off MET_PHI asserted a contact line
     the hand never visits. */
  const wideX = (side: 1 | -1) => handAt(p.reversed ? p.thetaTo : p.thetaFrom, side).x;
  const metX = (side: 1 | -1) => handAt(p.reversed ? p.thetaFrom : p.thetaTo, side).x;
  /**
   * The elbow sits `REACH_E / REACH_H` of the way along the shoulder-to-hand chord, carried off it
   * by the soft bend. In three dimensions that offset never has to be scaled or defended: the
   * projection shortens it by exactly as much as it shortens the bones either side of it, at every
   * camera angle, for free.
   */
  /*
   * ── THE ELBOW, SOLVED IN THREE DIMENSIONS ──────────────────────────────────────────────────────
   *
   * It used to be solved by a 2D `twoBoneIK` on the PROJECTED hand, with the canonical 25 and 23,
   * and then handed a depth of its own — `handZ · (REACH_E / REACH_H)` — as if the two facts were
   * independent. They are not, and composing them stretched the arm: measured in 3D the upper arm
   * ran 25.0 → 33.6 and the forearm 23.0 → 30.1 across the sweep, a third longer at the finish.
   * The auditor could not see it, because its no-bone-stretches law measures the PROJECTION and
   * the projection was busy getting shorter.
   *
   * Solved in 3D there is nothing to compose: the elbow is placed on the circle where both bones
   * are exactly canonical, and its depth falls out of the same solution. `hint` is where the elbow
   * belongs relative to the shoulder→hand chord — out to the side and a little down, which is where
   * a fly's elbow rides — and the component along the chord is removed so it only ever chooses
   * WHICH WAY round the chord, never how far from the shoulder.
   */
  const armAt = (phi: number, side: 1 | -1): { elbow: Vec2; elbowZ: number } => {
    const shoulder = side === 1 ? p.core.shoulderR : p.core.shoulderL;
    const hand = handAt(phi, side);
    const dx = hand.x - shoulder.x;
    const dy = hand.y - shoulder.y;
    const dz = handZ(phi);
    const d = Math.hypot(dx, dy, dz) || 1;
    const U3 = ATHLETE.upperArm;
    const F3 = ATHLETE.foreArm;
    const a = (d * d + U3 * U3 - F3 * F3) / (2 * d);
    const h = Math.sqrt(Math.max(0, U3 * U3 - a * a));
    const ux = dx / d;
    const uy = dy / d;
    const uz = dz / d;
    /*
     * MOSTLY DOWN, and only a little out. A fly's elbow rides BELOW its own chord — that is what
     * "soft elbows" looks like — and the direction matters for more than anatomy.
     *
     * At the moment the arm swings through pointing at the lens, the forearm is the chord's leftover
     * `(d−a)·û` minus the elbow's offset `h·n̂`. Both of those had an OUTWARD component, so they
     * cancelled in the drawing: the elbow and the hand landed on the same pixel and the forearm
     * projected 1.1u — a limb that vanishes for a fifth of the rep. Pointing the offset down
     * instead makes them subtract along different axes, and the shortest drawn forearm in the
     * family goes from 1.1 to between 3.7 and 11.2 depending on the member.
     */
    let hx = p.supine ? side * 0.2 : side * 0.35;
    let hy = p.supine ? 0.98 : 0.94;
    let hz = 0;
    const dot = hx * ux + hy * uy + hz * uz;
    hx -= dot * ux;
    hy -= dot * uy;
    hz -= dot * uz;
    const hn = Math.hypot(hx, hy, hz) || 1;
    return {
      elbow: { x: shoulder.x + a * ux + h * (hx / hn), y: shoulder.y + a * uy + h * (hy / hn) },
      elbowZ: a * uz + h * (hz / hn),
    };
  };
  const elbowAt = (phi: number, side: 1 | -1): Vec2 => armAt(phi, side).elbow;
  const elbowZ = (phi: number, side: 1 | -1 = 1) => armAt(phi, side).elbowZ;

  /* The tick path is the hand's arc AS DRAWN, so it is sampled through the same camera. */
  /*
   * The rig builds the SAME resolved camera `frame.ts` will build for the figure — same pivot, same
   * axis read off the same spine — because the equipment and the athlete have to be standing in one
   * room. Supine members (a dumbbell fly on a flat bench) get a horizontal axis out of this without
   * saying anything, which is the point of deriving it.
   */
  const CAM: Camera = {
    azimuth: p.azimuth ?? FLY_AZIMUTH,
    elevation: p.elevation,
    pivotX: CX,
    pivotY: (p.core.hipC.y + p.core.neckBase.y) / 2,
    axis: { x: p.core.neckBase.x - p.core.hipC.x, y: p.core.neckBase.y - p.core.hipC.y },
  };
  const ARC = Array.from({ length: 17 }, (_, i) => {
    const phi = lerp(p.thetaFrom, p.thetaTo, i / 16);
    const q = project(handAt(phi, 1), handZ(phi), CAM);
    return { x: q.x, y: q.y };
  });

  /** Where the shoulders themselves sit in depth — the origin every arm depth below is measured from. */
  const shZ = p.coreZ?.shoulderR ?? 0;

  const poseAt = (rom: number): Pose => {
    const phi = lerp(p.thetaFrom, p.thetaTo, STICK(rom));
    return {
      headR: ATHLETE.headR,
      j: {
        ...p.core,
        elbowR: elbowAt(phi, 1),
        handR: handAt(phi, 1),
        elbowL: elbowAt(phi, -1),
        handL: handAt(phi, -1),
      },
      /* The sweeping parts always carry depth, and it is measured FROM THE SHOULDER — which is
         only zero while the torso is upright. A folded core puts the shoulder 42u toward the
         camera, and an arm whose depth forgot to start there stretches to 47.7 against a canonical
         25. The 3D bone law caught it the moment the fold was added. */
      z: {
        ...p.coreZ,
        elbowR: shZ + elbowZ(phi, 1),
        handR: shZ + handZ(phi),
        elbowL: shZ + elbowZ(phi, -1),
        handL: shZ + handZ(phi),
      },
    };
  };

  const decorAt = (rom: number, drawn?: Record<string, Vec2>): Decor => {
    /* The hands AS DRAWN -- anything hung off a hand must land where the viewer sees the hand. */
    const j = drawn ?? poseAt(rom).j;
    const handR = j.handR;
    const handL = j.handL;
    /* Equipment depth is scene knowledge, so the rig projects its own: the towers stand behind the
       athlete, the seat back behind him, the deck pivot on the centre line. */
    const P3 = (x: number, y: number, z: number): Vec2 => {
      const q = project({ x, y }, z, CAM);
      return { x: q.x, y: q.y };
    };
    const back: Primitive[] = [...sampledPathTicks(ARC)];
    let front: Primitive[] = [];

    if (p.bench) {
      /* The bench he is sitting on. The seated dumbbell member had no furniture at all — a man in
         the air with his knees bent, which is the same fault the incline and preacher benches had. */
      const c = P3(CX, 162, -8);
      back.push(
        { kind: 'rect', x: c.x - 26, y: c.y, width: 52, height: 8, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: c.x - 16, y: c.y + 8 }, b: { x: c.x - 16, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: c.x + 16, y: c.y + 8 }, b: { x: c.x + 16, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
      );
    }
    /*
     * THE SUPINE MEMBERS HAD NO BENCH AT ALL, and shipped that way — two people lying in mid-air
     * with their knees bent. It is the oldest fault in this library and the reason it survived is
     * instructive: the bench branch above keys on a flag no supine member sets, and `benchEndOn`,
     * the head-end bench they need, was written for the lying PRESSES — who took it with them when
     * they moved to a side view on 2026-08-29 and left these two behind.
     *
     * `db_fly` and `incline_db_fly` stay head-end on purpose: a fly's arms sweep the transverse
     * plane, which face-on IS the page and side-on is pure depth. So they get the head-end bench,
     * and the incline member gets the reclined back pad — which is the ONE mark separating it from
     * the flat one in this camera, exactly as it was for `incline_bb_press`.
     */
    if (p.supine) {
      back.unshift(...benchEndOn(CX, 160, FLOOR_Y));
      if (p.core === supine) back.unshift(...inclineBackPadFront(CX, 121, 162, 27));
    }
    if (p.seatBack) {
      const c = P3(CX, 66, -14);
      back.push({ kind: 'rect', x: c.x - 21, y: c.y, width: 42, height: 58, rx: 8, fill: 'paper3', stroke: 'ink3', w: 2 });
    }
    if (p.reversed && p.implement === 'machine') {
      /* THE CHEST PAD (execution pass, 2026-09-07): a reverse pec deck is done FACING the machine,
         chest against the pad, and without it the clip was the pec deck run backwards — the same
         backrest, the same seat. The pad sits in front of the sternum, between her and the lens,
         so the one fact that names the member is the first thing drawn over her. */
      const c = P3(CX, 74, 12);
      front.push({ kind: 'rect', x: c.x - 15, y: c.y, width: 30, height: 40, rx: 6, fill: 'paper3', stroke: 'ink3', w: 2 });
    }
    if (p.implement === 'db') {
      front = [...dumbbellFront(handL, 1), ...dumbbellFront(handR, 1)];
    } else if (p.implement === 'cable') {
      /* The two crossover towers, wide and behind; each cable runs from its pulley to the hand.
         The low-to-high member takes the SAME towers at their floor pulleys — the pull works
         down-and-out, which is the whole reason the low setting exists. */
      const pulleyY = p.rise ? FLOOR_Y - 12 : 84;
      const PR: Vec2 = P3(CX + 92, pulleyY, -30);
      const PL: Vec2 = P3(CX - 92, pulleyY, -30);
      const travelled = Math.abs(lerp(p.thetaFrom, p.thetaTo, STICK(rom)) - p.thetaFrom) / 90;
      const towerR = stackTower({ x0: PR.x + 4, x1: PR.x + 26, capY: 60, stackTopY: FLOOR_Y - 34 }, travelled * 22);
      const towerL = stackTower({ x0: PL.x - 26, x1: PL.x - 4, capY: 60, stackTopY: FLOOR_Y - 34 }, travelled * 22);
      back.push(...towerR.prims, ...towerL.prims, ...pulley(PR), ...pulley(PL));
      front = [cable(PR, handR), cable(PL, handL)];
    } else if (p.implement === 'band') {
      /* ONE strip held between the fists (2026-09-10) — no anchor and no station. Slack with the
         hands together in front, thinning as they open: the band is the only resistance there is,
         so it is the only thing drawn. The fists close over its two ends. */
      const slack = Math.max(40, Math.abs(metX(1) - metX(-1)));
      front = [bandStrip(handL, handR, slack), { kind: 'circle', c: handL, r: 2.6, fill: 'ink0' }, { kind: 'circle', c: handR, r: 2.6, fill: 'ink0' }];
    } else {
      /* The deck's two pads, riding the forearms, with their arms up to the overhead pivot. */
      const PIVOT: Vec2 = P3(CX, 52, 0);
      for (const hand of [handL, handR]) {
        back.push({ kind: 'line', a: PIVOT, b: { x: hand.x, y: hand.y - 6 }, w: 2.5, color: 'ink3' });
        front.push({ kind: 'rect', x: hand.x - 5, y: hand.y - 16, width: 10, height: 24, rx: 4, fill: 'paper3', stroke: 'ink3', w: 2 });
      }
      back.push({ kind: 'circle', c: PIVOT, r: 3.4, fill: 'paper2', stroke: 'ink3', w: 2 });
    }
    return { back, front };
  };

  const softElbow = (label: string): PosePredicate => ({
    kind: 'jointAngle',
    joint: 'elbowR',
    neighbors: ['shoulderR', 'handR'],
    min: 140,
    max: 170,
    label,
  });

  /* The working endpoint differs by direction: flies MEET at the centre; rears reach full WIDE. */
  const endPredicate: PosePredicate = p.reversed
    ? { kind: 'contactX', a: 'handR', x: wideX(1), tol: 2.5, label: 'open all the way to the sides' }
    : { kind: 'contactX', a: 'handR', x: metX(1), tol: 2.5, label: 'hug the arms together — hands meet at the centre' };
  const startPredicate: PosePredicate = p.reversed
    ? { kind: 'contactX', a: 'handR', x: metX(1), tol: 3, label: 'hands together in front of you' }
    : { kind: 'contactX', a: 'handR', x: wideX(1), tol: 3, label: 'open wide — the honest stretch' };

  /*
   * ⚠️ THE SOFT-ELBOW ANGLE IS A WIDE-END FACT. Face-on, the MET position turns the arm into
   * depth: the projected shoulder→hand distance shrinks and the projected interior angle stops
   * describing the athlete at all. So the angle is asserted at whichever endpoint holds the arm IN
   * PLANE — the stretch for the flies, the wide finish for the rears — and the met end is held by
   * its contactX alone.
   *
   * ACROSS the rep it is a SPAN, not an angle. The old invariant was `angleNever ≤ 172°` on the
   * elbow, justified by "projection only ever DECREASES the apparent angle". That is false at the
   * crossing: when the hand passes in front of its own shoulder the three joints go collinear and
   * the projected angle runs to 180° — the assertion had become a statement about the camera. It
   * survived only because the old elbow formula was collapsing the arm to 8° there instead, one
   * bug holding the other one shut. What the rule MEANS is "the arm never reaches full extension,
   * because that would be a press", and a span says exactly that in a quantity foreshortening can
   * only ever shrink.
   */
  const wideEndIsStart = !p.reversed;
  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [startPredicate, ...(wideEndIsStart ? [softElbow('soft elbows at the stretch')] : [])],
    end: [endPredicate, ...(wideEndIsStart ? [] : [softElbow('soft elbows all the way out')])],
    /*
     * x and y both lerp with θ for every fly now — the met-end drop made the plain flies diagonal
     * too — so the declared rail is the same straight line in both cases, and `horizontal` (which
     * only ever described the old flat chord) is gone.
     */
    /*
     * AN ARC, because that is what the movement is: the hand rotates about a shoulder that the
     * invariant below pins in place. The old declaration was a straight rail — first `horizontal`,
     * then a diagonal `line` — and both were descriptions of the PICTURE rather than of the
     * movement. Once the sweep is authored as a rotation in three dimensions the picture is an
     * ellipse, which no straight rail fits and no straight rail should have to.
     */
    path: { track: 'handR', kind: 'arc', tol: 2.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulderR', tol: 0.5, label: 'the shoulder is the hinge — no shrugging into it' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'the body is still; only the arms sweep' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'seated or planted — the hips do not help' },
      { kind: 'spanNever', a: 'shoulderR', b: 'handR', aboveUnits: REACH_H + 1, label: 'the arm never reaches full extension — that would be a press' },
    ],
  };

  return { id: p.id, chains: flyChains, camera: CAM, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
}

const seated = seatedFrontCore(CX);
const standing = standingFrontCore(CX);
const supine = supineFrontCore(CX, 10); // the ~30° incline: shoulders raised toward the camera
const flatSupine = supineFrontCore(CX, 0); // the flat bench — the db_bench_press's own camera

/* elevation 20 (2026-09-07): the raised camera is what gives the closing arm its length — square-on it
   pointed down the lens and projected to a 3.5° stub; from above, depth becomes screen height. */
export const pecDeckRig = fly({ id: 'pec_deck', core: seated, thetaFrom: 0, thetaTo: MET_PHI, implement: 'machine', seatBack: true, elevation: 20 });
export const cableFlyRig = fly({ id: 'cable_fly', core: standing, thetaFrom: 0, thetaTo: MET_PHI, implement: 'cable', metDrop: 22, elevation: 20 }); // met at the lower chest: the closed arm projects DOWN as well as in (2026-09-07)
export const inclineDbFlyRig = fly({ id: 'incline_db_fly', core: supine, supine: true, thetaFrom: -14, thetaTo: 100, implement: 'db', azimuth: 0 });
/* batch 2 (2026-08-26): the FLAT fly — the incline member's sweep on the flat supine camera — and
 * the LOW-TO-HIGH cable fly: the crossover's floor pulleys, hands rising hip line → chest line.
 * wideDX 36 with fromDY 30 keeps the in-plane wide arm at √(36²+30²) ≈ 46.9 ≈ the canonical
 * soft-elbowed reach — projection may fold the met end into depth, but the stretch end is drawn
 * at true length. */
export const dbFlyRig = fly({ id: 'db_fly', core: flatSupine, supine: true, thetaFrom: -14, thetaTo: 100, implement: 'db', azimuth: 0 });
/* fromDY 44 / wideDX 27, not 30 / 36 (execution pass, 2026-09-07): 'low' starts at the HIP line (shoulder + 46 = hip 109.5), not mid-trunk; the wide arm stays on the sphere at √(27²+44²) ≈ 51.6 = the canonical reach. */
export const lowCableFlyRig = fly({ id: 'low_cable_fly', core: standing, thetaFrom: 0, thetaTo: MET_PHI, implement: 'cable', rise: { fromDY: 44, toDY: -4, wideDX: 27 }, elevation: 20 });
/*
 * rear_delt_fly — FOLDED FORWARD (2026-08-29), which is the exercise.
 *
 * It was built on the upright `seated` core, and upright with dumbbells opening to the sides is a
 * LATERAL RAISE: rendered beside `lateral_raise` the two clips differed by a bench and nothing
 * else. The whole distinction between them is the torso, so the torso is what had to change.
 *
 * 50° of forward hinge, as a real rotation with real depth. Face-on that draws a 23-unit trunk with
 * the head low and inked NEAR — a body seen from in front and above, folded over its own thighs —
 * while the arms are untouched, because an arm hanging off a folded athlete still hangs straight
 * down and still opens to the sides. The sweep stays in the image plane and keeps its full length;
 * only the torso pays, and the torso is the point.
 */
const rearDeltCore = hingedSeatedCore(CX, 50);
/* metDrop 32: the met hands hang at the knee line, so the sweep RISES 30u as it opens — the hinge reads and the arc is 45u, not 9 (2026-09-07). */
export const rearDeltFlyRig = fly({ id: 'rear_delt_fly', core: rearDeltCore.j, coreZ: rearDeltCore.z, thetaFrom: MET_PHI, thetaTo: 0, implement: 'db', reversed: true, bench: true, metDrop: 24 });
export const reversePecDeckRig = fly({ id: 'reverse_pec_deck', core: seated, thetaFrom: MET_PHI, thetaTo: 0, implement: 'machine', reversed: true, seatBack: true, metDrop: 20, elevation: 20 });
/*
 * band_pull_apart (2026-09-10, the band family) — the reverse pec deck's opening with nothing to sit
 * in: STANDING, arms long at shoulder height, one band between the fists. metDrop 3 keeps the hands
 * on the shoulder line the whole way (the cue says "at shoulder height"), and the raised camera the
 * standing members use gives the arm its length where it points at the lens.
 */
export const bandPullApartRig = fly({ id: 'band_pull_apart', core: standing, thetaFrom: MET_PHI, thetaTo: 0, implement: 'band', reversed: true, metDrop: 3, elevation: 20 });
