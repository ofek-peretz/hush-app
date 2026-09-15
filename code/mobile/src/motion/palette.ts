/**
 * Token → hex for the motion renderers. Kept as a small standalone map so the headless harness —
 * which cannot import RN `Dimensions` via tokens.ts — resolves the same colors as the app (it
 * compiles this file and reads `MOTION_PALETTE` directly, so there is exactly one copy).
 *
 * **NO OCHRE (founder, 2026-07-17).** `signal`/`signalInk` are gone, from the ColorToken type as
 * well as this map, so a clip cannot reach for an accent hue without a compile error. The range
 * statement is ink + a dash now — `kit.barPathTicks` carries the reasoning.
 *
 * ── THE PAPER MAP IS THE APP'S PAPER (execution pass, 2026-09-07) ──────────────────────────────
 * This map once mirrored `src/design/tokens.ts`; the READOUT redesign re-cut the tokens and the
 * clips drifted (a pre-READOUT ground under a post-READOUT screen). The drift is closed: the
 * `paper*` family IS the app's paper ladder and the ground is `paper[2]`, the well FormMedia draws
 * the clip on. The figure's greys are the drawing's own, re-cut for contrast on that ground (see
 * the numbers on the map). Any future token change to `paper` must be mirrored here, and checked
 * on a contact sheet — the sheets in `tools/motion-harness` render on the same well.
 */

// 

import type { ColorToken } from './types';

export const MOTION_PALETTE: Record<ColorToken, string> = {
  /*
   * ALIGNED TO THE APP'S OWN PAPER (execution pass, 2026-09-07 — the "open question" above is
   * closed). The clip sits on `paper[2]` (#e3ded0, the well) in FormMedia, so its ground IS that
   * token, and the objects drawn in paper — pads, machine shells — are the app's paper ladder.
   * The figure's own greys are re-cut against that ground, not copied from the text tokens:
   *   ink0 13.1:1 · ink1 (trunk) 7.6:1 · ink4 (far limb) 3.0:1 on the well and 2.5:1 against the
   *   trunk — the far side reads in daylight and still reads as BEHIND.
   */
  paper0: '#fbf9f3', // app paper[1] — the raised card
  paper1: '#f3f0e8', // app paper[0] — the card
  paper2: '#e3ded0', // app paper[2] — the well, the ground every clip stands on
  paper3: '#d8d4c8', // app paper[3] — the deepest well: machine shells
  ink0: '#1b1913', // app ink[0] — the near limb
  ink1: '#45413a', // the trunk
  ink2: '#6e685c', // cables, rules
  ink3: '#9a937f', // app ink[4] — equipment
  ink4: '#857d6b', // app ink[3] — the far limb
  line0: '#cbc6b8',
  line1: '#bdb7a8',
  line2: '#afa899',
  up: '#3e573f', // app up[0] — moss on paper
};

export const hex = (c: ColorToken): string => MOTION_PALETTE[c];

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SAME DRAWING, ON THE STAGE — the ladder inverted (founder, 2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני כן חושב שאנו צריכים לשים את הדמות כגיבור."*
 *
 * ⛔ EVERY SURFACE THAT HAS EVER DRAWN THE ATHLETE SITS ON PAPER. `FormMedia` puts her on
 * `paper[2]`, `DayInMotion` the same, and the map's `MotionThumb` is 30 points of #191714 ink on a
 * #1b1914 sheet — a thumbnail that has been technically present and visually absent since the day
 * it landed. The training stage is ABSOLUTE BLACK. Moving the figure onto it without a second
 * ladder would draw a black athlete on a black ground, which is the same defect at hero size.
 *
 * ── ⚠️ IT IS NOT A MECHANICAL SWAP, AND IT MUST NOT BECOME ONE ──────────────────────────────────
 *
 * The tempting version is `ink[n] ↔ paper[3-n]`. It gives the right answer for the inks and the
 * WRONG one everywhere else, because these tokens do not mean "light" and "dark" — they mean
 * NEAR LIMB, TRUNK, FAR LIMB, EQUIPMENT, MACHINE PART. What has to survive the inversion is the
 * duotone's ORDER (near reads over trunk reads over far), not the luminance of any one value.
 *
 * So the ink ladder is re-cut against the stage's own inks rather than reflected:
 *
 *   · `ink0` IS `stage.ink0` — the near limb is the brightest thing in the frame, exactly as it is
 *     the darkest on paper. Below it the ladder falls in even steps to `ink4`, the far limb, which
 *     stays *present* rather than fading out: on paper the far side reads by being lighter than the
 *     page's ink, and on black it has to read by being lighter than the ground.
 *   · The `paper*` family becomes the stage's own dark surfaces, because on a clip they are never
 *     the background — they are OBJECTS drawn in a light fill (a pad, a machine's shell). Inverted
 *     they must still be objects, so they land on `stage[1]`/`stage[2]` and keep their ink stroke.
 *   · `up` is lifted, not reused: #597f60 is a 4.0:1 moss chosen against white paper and it drops
 *     to a mumble on black.
 *
 * ⚠️ AND THE PRE-READOUT DRIFT DOCUMENTED ABOVE DOES NOT PROPAGATE HERE. This map is authored
 * against the CURRENT stage tokens, because it is new and has nothing ratified to preserve. It is
 * the paper map that is frozen, and deliberately.
 */
export const MOTION_PALETTE_STAGE: Record<ColorToken, string> = {
  // The objects that were light fills on paper are dark raised surfaces here — still objects.
  paper0: '#0b0a09',
  paper1: '#141210',
  paper2: '#1b1914', // stage[1]
  paper3: '#2a2822', // stage[2] — the machine shell, visible against absolute black
  // The duotone, re-cut: near limb brightest, far limb still lit.
  ink0: '#f1eee5', // stage.ink0 — the near limb
  ink1: '#d3ccbc', // the trunk silhouette
  ink2: '#a8a290', // stage.ink1
  ink3: '#7d786b', // equipment
  ink4: '#6e6a60', // the far limb — dimmer than the trunk, never absent: 3.26:1 on the stage (was 2.48:1 at #5c5850)
  // Rules and hairlines: on paper they are barely-there greys; here, barely-there darks.
  line0: '#26231d',
  line1: '#332f27',
  line2: '#413c32',
  up: '#7ea886', // lifted off the paper moss, which reads as mud on black
};

/** Which ground the drawing is standing on. `'paper'` is every pre-existing caller. */
export type MotionTone = 'paper' | 'stage';

export const hexOn = (c: ColorToken, tone: MotionTone = 'paper'): string =>
  (tone === 'stage' ? MOTION_PALETTE_STAGE : MOTION_PALETTE)[c];
