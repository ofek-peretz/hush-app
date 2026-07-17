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
