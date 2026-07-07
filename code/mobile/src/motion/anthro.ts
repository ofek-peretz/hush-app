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
export const ATHLETE = {
  headR: 8,
  neck: 16, // shoulder joint → head center (long enough that the head clears a plate on the bar)
  torso: 48, // hip joint → shoulder joint
  upperArm: 25,
  foreArm: 23, // elbow → hand-on-bar (knuckle line)
  thigh: 40,
  shank: 37,
  foot: 25, // heel → toe on the floor
  ankleH: 7, // ankle joint height above the floor
} as const;

/** Limb thickness profiles (stroke DIAMETERS at each joint) — mass tapers toward the extremity. */
export const LIMB_W = {
  leg: [13, 9, 6.5] as const, // hip → knee → ankle
  arm: [9, 6.8, 5] as const, // shoulder → elbow → wrist
  handR: 3.6, // the fist, closing the forearm onto the bar
} as const;

/** A 45cm plate at canonical scale. Bar/sleeve dots share these radii across every barbell rig. */
export const PLATE_R = 16;
export const BAR_R = 3;
