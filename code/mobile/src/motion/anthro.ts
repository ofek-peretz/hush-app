/**
 * The canonical Hush athlete — ONE set of segment lengths shared by every rig, so all sixty
 * demonstrations are visibly the same person. Values are side-view frame units (352×220 media
 * frame; standing height ≈ 152u ≈ 1.75m, so 1u ≈ 1.15cm) at true human ratios: the arm
 * (shoulder→wrist, 48u) equals the trunk (hip→shoulder, 48u), the thigh outranks the shank, and
 * a 45cm competition plate is r≈16u — the proportions the eye checks a lifter against.
 *
 * A rig may FORESHORTEN a projected segment (a bench-press humerus abducts into depth, a squat
 * grip rotates out of the side plane) but must document it against these canonical lengths.
 */

// 

export const ATHLETE = {
  headR: 8,
  neck: 16, // shoulder joint → head center (long enough that the head clears a plate on the bar)
  torso: 48, // hip joint → shoulder joint
  upperArm: 25,
  /*
   * 23 is elbow → WRIST, not elbow → knuckle: at this figure's scale (1u ≈ 1.13 cm) it is 25.9 cm,
   * which is a real forearm, while the grip axis of a real hand sits ~4 cm further out. The whole
   * arm is likewise about 14 % shorter than a 175 cm man's — 48u shoulder-to-grip against a true
   * 56u. That is deliberate, and it was TESTED before being kept (2026-08-29).
   *
   * Lengthening it does not help the drawing, it hurts it, and the reason is worth stating: hands
   * in this library are AUTHORED — on a bar, on a handle, on a machine's grip — so a longer arm
   * does not move the hand anywhere. It only gives the limb more bone to fold into the same span,
   * and the elbow closes. Measured across all 136 rigs: at 25/23, thirty-nine clips close an elbow
   * below 55° somewhere in the rep; at 25/27 that becomes forty-eight, with 9 FormSpec and 12
   * auditor failures on top; at a fully anatomical 29/27, fifty-four.
   *
   * The lever that opens an elbow is how far the hand finishes from its own SHOULDER. Grip width
   * and endpoint are that lever. Bone length is not.
   */
  foreArm: 23,
  thigh: 40,
  shank: 37,
  foot: 25, // heel → toe on the floor
  ankleH: 7, // ankle joint height above the floor
} as const;

/**
 * A limb's flesh. `w` is the stroke DIAMETER at each joint (proximal → distal); `belly` gives, per
 * SEGMENT, where its muscle belly peaks along that segment (0 = proximal joint, 1 = distal) and by
 * how much the width swells there.
 *
 * The belly is what separates an athlete from a mannequin. A leg drawn as a straight taper from
 * knee to ankle has no calf, and the eye reads a peg; a shank that swells to 1.18× a quarter of the
 * way down and pinches to the ankle reads as a gastrocnemius even at thumbnail size. Same for the
 * biceps on the humerus and the flexor mass on the forearm.
 *
 * THE BULGE LEANS TO ITS OWN SIDE (v3.1). A real calf swells backward and a real biceps forward,
 * and an earlier pass drew the swelling symmetrically because a signed "flexor side" looked
 * DEGENERATE whenever the limb straightens — a bulge that snaps across mid-rep is far worse than a
 * shin that is too round. The way out is not to pick a side but to make the lean VANISH exactly
 * where its direction stops being defined:
 *
 *   at the articulating joint, u = (proximal − joint) and v = (distal − joint), both unit;
 *   bend = (u + v) / 2 — it POINTS into the interior of the angle, and its LENGTH is 0 when the
 *   limb is straight and 1 when it is folded shut.
 *
 * One vector carries both the direction and the confidence. Multiply the lean by it and a straight
 * limb is symmetric by construction, a bent one throws its mass to the correct side, and there is
 * no threshold anywhere to flip across. `lean` below is how far that goes and which way: **+ = the
 * interior of the joint** (calf, biceps, forearm flexors), **− = the exterior** (the quadriceps,
 * which sits on the outside of the knee angle). The bulge is redistributed, never added: the near
 * side gains exactly what the far side gives up.
 */
export interface LimbProfile {
  /** stroke diameter at each joint, proximal → distal */
  readonly w: readonly number[];
  /** per segment: [peak position 0..1, width multiplier at the peak, lean −1..+1] */
  readonly belly: ReadonlyArray<readonly [number, number, number]>;
}

/** His flesh: a trained male. Deep quad, a calf that outgrows its own knee, a thick forearm. */
export const LIMB_W: { leg: LimbProfile; arm: LimbProfile; handR: number } = {
  leg: {
    w: [13.4, 9.6, 6.2], // hip → knee → ankle
    belly: [
      [0.42, 1.09, -0.8], // quadriceps — OUTSIDE the knee angle, so it fills the front of the thigh
      [0.26, 1.2, 1.0], // gastrocnemius — inside the angle, high on the shank, pinching to the ankle
    ],
  },
  arm: {
    w: [10.4, 7.2, 5.0], // shoulder → elbow → wrist
    belly: [
      [0.4, 1.15, 0.9], // biceps — inside the elbow angle; the triceps side stays the flatter one
      [0.3, 1.1, 0.7], // flexor mass just below the elbow
    ],
  },
  handR: 3.8, // the fist, closing the forearm onto the bar
};

/**
 * The second athlete (she). SAME skeleton — every segment length above is shared, so every rig,
 * FormSpec, and machine alignment is hers verbatim — but her mass distributes differently: limbs
 * carry less diameter at every joint and a gentler belly, and the trunk silhouette (see `skin.ts`)
 * narrows at the shoulder and waist while keeping the hip. Thickness is the ONLY thing that may
 * differ here; anything that moves a joint belongs to ATHLETE and is common by law.
 */
export const LIMB_W_F: { leg: LimbProfile; arm: LimbProfile; handR: number } = {
  leg: {
    w: [11.8, 8.4, 5.6],
    belly: [
      [0.44, 1.06, -0.7],
      [0.28, 1.15, 0.9],
    ],
  },
  arm: {
    w: [8.2, 6.0, 4.3],
    belly: [
      [0.42, 1.08, 0.8],
      [0.3, 1.07, 0.6],
    ],
  },
  handR: 3.2, // her fist still closes visibly onto the bar
};

/**
 * A 45 cm competition plate, at canonical scale — 20u, because this figure is 155.5u tall for a
 * 175 cm athlete, so 1u ≈ 1.13 cm and a 22.5 cm radius is 20 of them.
 *
 * It was 16, under a comment that already claimed 45 cm: a 36 cm plate, a quarter small. True scale
 * is not decoration here — the plate is the measuring stick every barbell drawing is read against,
 * and on the floor lifts it IS the setup. At 16 the bar sat 18 cm up instead of 22.5, which put the
 * deadlifter's shoulders 4u low and flattened his back angle from 25° to 20°, so the start position
 * read as an RDL rather than a deadlift.
 */
export const PLATE_R = 20;
export const BAR_R = 3;
