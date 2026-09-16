/**
 * Accessibility decisions (spec §8.2). Under Reduce Motion, directional slides
 * and sheet slide-ups both collapse to opacity fades; nothing depends on motion.
 */
// @ts-nocheck

// 

import { fullLayerAnimation, sheetAnimation } from '@/app/navAnimations';

describe('Reduced Motion collapses motion to fades', () => {
  it('full-layer slides become fades', () => {
    /* 'default' since 2026-09-16 — the platform's own push, which mirrors itself under RTL. An
       I18nManager-conditional direction double-flipped and fought the back gesture (`navAnimations`). */
    expect(fullLayerAnimation(false)).toBe('default');
    expect(fullLayerAnimation(true)).toBe('fade');
  });

  it('sheet slide-ups become fades', () => {
    expect(sheetAnimation(false)).toBe('slide_from_bottom');
    expect(sheetAnimation(true)).toBe('fade');
  });
});
