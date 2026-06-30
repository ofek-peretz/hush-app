/**
 * Bidirectional-text helpers for the RTL (Hebrew) build.
 *
 * The product rule (2026-06-30): exercise names — and any other canonical English
 * run — stay in English even when the app is Hebrew. An English (LTR) run sitting
 * inside a Hebrew (RTL) sentence is a *bidirectional* string; without isolation the
 * Unicode BiDi algorithm reorders adjacent punctuation/numbers (e.g. a trailing "."
 * jumps to the wrong side). `bidi()` wraps the run in a First-Strong Isolate so it
 * renders as its own self-contained run and never reorders the Hebrew around it.
 *
 * Use `bidi(name)` ONLY when interpolating a name into a translated sentence
 * (`t('…', { exercise: bidi(name) })`) or concatenating it inline with other copy.
 * A name rendered ALONE in its own <Text> needs no wrapping. Never feed a bidi()
 * string to telemetry, comparisons, or anything non-visual — it carries invisible
 * control characters.
 */
import { I18nManager, type TextStyle } from 'react-native';

const FSI = '⁨'; // First Strong Isolate — open
const PDI = '⁩'; // Pop Directional Isolate — close

/** Isolate a run so the surrounding BiDi context cannot reorder it (or it the context). */
export function bidi(s: string): string {
  return `${FSI}${s}${PDI}`;
}

/**
 * Logical text alignment as concrete `textAlign` values. RN's `textAlign` has no
 * `start`/`end` tokens, so these resolve against the locked layout direction
 * (`I18nManager.isRTL` is fixed for the app session — RTL needs a relaunch). For
 * START alignment, prefer simply omitting `textAlign` (RN already aligns unset text
 * to the start, mirroring under RTL); use `textEnd` for the rarer end-alignment.
 */
export const textEnd: TextStyle['textAlign'] = I18nManager.isRTL ? 'left' : 'right';
export const textStart: TextStyle['textAlign'] = I18nManager.isRTL ? 'right' : 'left';
