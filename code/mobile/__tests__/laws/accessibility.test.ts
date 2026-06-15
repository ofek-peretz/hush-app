/**
 * Accessibility decisions (spec §8.2). Under Reduce Motion, directional slides
 * and sheet slide-ups both collapse to opacity fades; nothing depends on motion.
 */
import { fullLayerAnimation, sheetAnimation } from '@/app/navAnimations';

describe('Reduced Motion collapses motion to fades', () => {
  it('full-layer slides become fades', () => {
    expect(fullLayerAnimation(false)).toBe('slide_from_right');
    expect(fullLayerAnimation(true)).toBe('fade');
  });

  it('sheet slide-ups become fades', () => {
    expect(sheetAnimation(false)).toBe('slide_from_bottom');
    expect(sheetAnimation(true)).toBe('fade');
  });
});
