/**
 * Token → hex for the motion renderers. Kept as a small standalone map so the headless harness —
 * which cannot import RN `Dimensions` via tokens.ts — resolves the same colors as the app (it
 * compiles this file and reads `MOTION_PALETTE` directly, so there is exactly one copy).
 *
 * **NO OCHRE (founder, 2026-07-17).** `signal`/`signalInk` are gone, from the ColorToken type as
 * well as this map, so a clip cannot reach for an accent hue without a compile error. The range
 * statement is ink + a dash now — `kit.barPathTicks` carries the reasoning.
 *
 * ── ⚠️ THIS IS NO LONGER A MIRROR OF tokens.ts, AND THAT IS AN OPEN QUESTION ──────────────────
 * The header used to claim these values MIRROR `src/design/tokens.ts` "so the figure is drawn in
 * the exact product palette", maintained "by eye in review". The READOUT redesign (525341e) re-cut
 * every one of those tokens and nobody mirrored it, so the claim is simply false: the values below
 * are the PRE-READOUT palette, and the clips ship — `FormMedia` renders them inside the new world.
 *
 * It was NOT mechanically re-mirrored, deliberately. The inks are near-identical (ink0 #191714 vs
 * #1b1917), but `paper3` — 14 uses, the machine parts — would go from #e4e3de (89 %) to #d5cfc7
 * (62.9 %), and `paper2` and `up` move too. That is not a token sync; it is a restyle of every clip
 * the founder has already ratified by eye, and it needs his eye and a GIF review, not a sed.
 *
 * So: the drift is bounded (a drawing is internally consistent, and these are its own greys) and
 * documented. Decide it deliberately; do not "fix" it in passing.
 */

// 

import type { ColorToken } from './types';

export const MOTION_PALETTE: Record<ColorToken, string> = {
  paper0: '#fbfaf8',
  paper1: '#f7f6f3',
  paper2: '#eeede9',
  paper3: '#e4e3de',
  ink0: '#191714',
  ink1: '#43403e',
  ink2: '#726f6c',
  ink3: '#a09e9b',
  ink4: '#c5c4c1',
  line0: '#dcdad8',
  line1: '#c5c4c0',
  line2: '#b3b1ad',
  up: '#597f60',
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
  ink4: '#5c5850', // the far limb — dimmer than the trunk, never absent
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
