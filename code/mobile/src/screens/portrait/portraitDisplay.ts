/**
 * Portrait display helpers (UI-only; the model's CAPABILITY_ORDER is unchanged).
 * HUSH_BUILD_SPEC §4.26/§4.27 render the five patterns in a FIXED order and with
 * capitalized labels ("Hip hinge", "Horizontal push", …).
 */
import type { Capability } from '@/data/local/models';

/** Fixed render order per §4.26/§4.27 (not value-sorted). */
export const PORTRAIT_DISPLAY_ORDER: Capability[] = [
  'hip_dominant',
  'knee_dominant',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
];

/** Sentence-case a capability label ("hip hinge" → "Hip hinge"). */
export function capLabel(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
