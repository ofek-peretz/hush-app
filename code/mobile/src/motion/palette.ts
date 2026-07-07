/**
 * Token → hex for the motion renderers. These MIRROR `src/design/tokens.ts` (paper / ink / line /
 * signal / up) so the figure is drawn in the exact product palette. Kept as a small standalone map
 * so the headless harness — which cannot import RN `Dimensions` via tokens.ts — resolves identical
 * colors. If a token value changes in tokens.ts, mirror it here (one line; guarded by eye in review).
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
  signal: '#cc9147',
  signalInk: '#854a0b',
  up: '#597f60',
};

export const hex = (c: ColorToken): string => MOTION_PALETTE[c];
